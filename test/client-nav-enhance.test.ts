import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { JSDOM } from 'jsdom';
import { Hono } from 'hono';
import { CustomElement, PLATFORM, resolve } from 'aurelia';
import { aurelia, aureliaAction, aureliaDefaults } from '../src/adapter';
import { createClientNavigator, IRequestContext, type EnhanceSubmitContext } from '../src/client';

describe('@hono/aurelia/client soft navigation, preload, and au-enhance', () => {
  let dom: JSDOM;
  const domProps = [
    'window',
    'document',
    'Node',
    'Element',
    'HTMLElement',
    'HTMLFormElement',
    'HTMLAnchorElement',
    'CustomEvent',
    'Event',
    'MouseEvent',
    'SubmitEvent',
    'FormData',
    'HTMLTemplateElement',
  ] as const;
  const savedGlobals: Record<string, unknown> = {};
  const savedPlatform: Record<string, unknown> = {};
  let savedFetch: typeof globalThis.fetch;

  beforeEach(() => {
    savedFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = savedFetch;
    const p = PLATFORM as unknown as Record<string, unknown>;
    const g = globalThis as Record<string, unknown>;
    for (const prop of domProps) {
      if (savedGlobals[prop] !== undefined) {
        g[prop] = savedGlobals[prop];
      } else {
        delete g[prop];
      }
      if (savedPlatform[prop] !== undefined) {
        p[prop] = savedPlatform[prop];
      }
    }
    dom?.window.close();
  });

  function installDom(html: string, url: string): void {
    dom = new JSDOM(html, { url });
    const p = PLATFORM as unknown as Record<string, unknown>;
    const g = globalThis as Record<string, unknown>;
    const w = dom.window as unknown as Record<string, unknown>;

    for (const prop of domProps) {
      savedGlobals[prop] = g[prop];
      savedPlatform[prop] = p[prop];
      if (w[prop] !== undefined) {
        g[prop] = w[prop];
        p[prop] = w[prop];
      }
    }
  }

  it('hydrates SSR HTML, preloads on hover, soft-navigates links, and revalidates loader via au-enhance', async () => {
    let claps = 5;
    let offlineCancelled = false;
    const fetchedUrls: string[] = [];

    const HomePage = CustomElement.define(
      {
        name: 'nav-home-page',
        template:
          '<main data-au-preload="hover"><h1>Home</h1><a id="post-link" href="/posts/hello">Read Hello</a></main>',
      },
      class {
        static title = 'Home — AureliaKit';
      }
    );

    const PostPage = CustomElement.define(
      {
        name: 'nav-post-page',
        template: [
          '<article>',
          '<h1>${slug}:${claps}</h1>',
          '<form id="clap-form" method="POST" action="/posts/hello?_action=clap" au-enhance>',
          '<button type="submit">Clap</button>',
          '</form>',
          '<form id="offline-form" method="POST" action="/posts/hello?_action=clap" au-enhance.bind="interceptOffline">',
          '<button type="submit">Offline</button>',
          '</form>',
          '</article>',
        ].join(''),
      },
      class {
        slug = '';
        claps = 0;

        interceptOffline = (ctx: EnhanceSubmitContext) => {
          offlineCancelled = true;
          ctx.cancel();
        };

        static title = (data: { slug: string }) => `Post ${data.slug}`;
        static async loader(c: { req: { param: (k: string) => string } }) {
          return { slug: c.req.param('slug'), claps };
        }
        static actions = {
          clap: async () => {
            claps += 1;
            return { claps };
          },
        };
      }
    );

    const app = new Hono();
    app.use('*', aureliaDefaults({ dataEndpoint: true, preserveMarkers: false }));
    app.get('/', aurelia(HomePage));
    app.get('/posts/:slug', aurelia(PostPage));
    app.post('/posts/:slug', aureliaAction(PostPage));

    const initialRes = await app.request('http://localhost/');
    const initialHtml = await initialRes.text();
    installDom(initialHtml, 'http://localhost/');

    const localFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const reqUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      fetchedUrls.push(`${init?.method ?? 'GET'} ${reqUrl}`);
      return await app.request(reqUrl, init);
    }) as unknown as typeof fetch;
    globalThis.fetch = localFetch;

    const nav = await createClientNavigator({
      components: [HomePage, PostPage],
      fetch: localFetch,
    });
    expect(nav).not.toBeNull();

    const host = dom.window.document.querySelector('app-root')!;
    expect(host.innerHTML).toContain('Read Hello');

    // 1. Hover over link triggers preload once and caches result
    const link = dom.window.document.getElementById('post-link')!;
    link.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
    link.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 15));
    expect(fetchedUrls).toEqual(['GET http://localhost/posts/hello']);

    // 2. Left-click soft-navigates using the preloaded cache (0 duplicate GET!)
    link.dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchedUrls).toEqual(['GET http://localhost/posts/hello']);
    expect(dom.window.document.title).toBe('Post hello');
    expect(dom.window.location.pathname).toBe('/posts/hello');
    expect(dom.window.document.querySelector('app-root')!.innerHTML).toContain('hello:5');

    // 3. Submitting au-enhance form posts via fetch and automatically invalidates & updates page state
    const clapForm = dom.window.document.getElementById('clap-form') as HTMLFormElement;
    clapForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 25));

    expect(claps).toBe(6);
    expect(dom.window.document.querySelector('app-root')!.innerHTML).toContain('hello:6');

    // 4. Submitting form with cancel() hook intercepts cleanly without network call
    const countBeforeOffline = fetchedUrls.length;
    const offlineForm = dom.window.document.getElementById('offline-form') as HTMLFormElement;
    offlineForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 15));

    expect(offlineCancelled).toBe(true);
    expect(fetchedUrls.length).toBe(countBeforeOffline);

    nav?.dispose();
  });

  it('carries server route params into IRequestContext during soft navigation', async () => {
    const ParamHome = CustomElement.define(
      {
        name: 'param-home-page',
        template: '<a id="go-detail" href="/items/42">Detail</a>',
      },
      class {}
    );

    const ParamDetail = CustomElement.define(
      {
        name: 'param-detail-page',
        template: '<p>${slug}|${routeParams.slug ?? "-"}</p>',
      },
      class {
        readonly routeParams: Readonly<Record<string, string>> = {
          ...resolve(IRequestContext).params,
        };
        slug = '';

        static async loader(c: { req: { param: (k: string) => string } }) {
          return { slug: c.req.param('slug') };
        }
      }
    );

    const app = new Hono();
    app.use('*', aureliaDefaults({ dataEndpoint: true, preserveMarkers: false }));
    app.get('/', aurelia(ParamHome));
    app.get('/items/:slug', aurelia(ParamDetail));

    const initialRes = await app.request('http://localhost/');
    installDom(await initialRes.text(), 'http://localhost/');

    const localFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const reqUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      return await app.request(reqUrl, init);
    }) as unknown as typeof fetch;
    globalThis.fetch = localFetch;

    const nav = await createClientNavigator({
      components: [ParamHome, ParamDetail],
      fetch: localFetch,
    });
    expect(nav).not.toBeNull();

    dom.window.document
      .getElementById('go-detail')!
      .dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
      );
    await new Promise((r) => setTimeout(r, 25));

    expect(nav!.currentInstance).toMatchObject({
      slug: '42',
      routeParams: { slug: '42' },
    });
    expect(dom.window.document.querySelector('app-root')!.innerHTML).toContain('42|42');

    nav!.dispose();
  });
});
