import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { CustomElement } from 'aurelia';
import { DEFAULT_SCRIPT_ID, resolveRequestContext } from '@aureliajs/ssr';
import { aurelia, aureliaAction, aureliaDefaults, aureliaLayout, aureliaRenderer } from '../src/adapter';

const SimplePage = CustomElement.define(
  {
    name: 'simple-page',
    template: '<main><h1>${heading}</h1><p>${message}</p></main>',
  },
  class SimplePage {
    heading = 'Hello Aurelia';
    message = 'Pure SSR';
  }
);

describe('@hono/aurelia adapter', () => {
  describe('HTML5 SSR rendering & real Web Streams streaming', () => {
    it('renders HTML5 document with inert <script type="application/json"> via shorthand', async () => {
      const app = new Hono();
      app.get('/', aurelia(SimplePage, 'Home Title'));

      const res = await app.request('/');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');

      const html = await res.text();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<title>Home Title</title>');
      expect(html).toContain('Hello Aurelia');
      expect(html).toContain(`<script id="${DEFAULT_SCRIPT_ID}" type="application/json">`);
      expect(html).not.toContain('window.__HYDRATION__');
    });

    it('streams true incremental chunks via Web Streams ReadableStream (preamble flushed before body)', async () => {
      const SlowPage = CustomElement.define(
        { name: 'slow-stream-page', template: '<section>${status}</section>' },
        class {
          status = 'Streamed Body';
          async attached() {
            await new Promise((r) => setTimeout(r, 30));
          }
        }
      );

      const app = new Hono();
      app.get(
        '/stream',
        aurelia({
          component: SlowPage,
          title: 'True Stream',
          streaming: true,
          document: { cssBundle: '/app.css', jsBundle: '/client.js' },
        })
      );

      const res = await app.request('/stream');
      expect(res.status).toBe(200);
      expect(res.headers.get('transfer-encoding')).toBe('chunked');
      expect(res.body).not.toBeNull();

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      // Chunk 1 must arrive immediately with <head> & CSS BEFORE SSR body finishes
      const first = await reader.read();
      expect(first.done).toBe(false);
      const firstChunk = decoder.decode(first.value);
      expect(firstChunk).toContain('<title>True Stream</title>');
      expect(firstChunk).toContain('<link rel="stylesheet" href="/app.css" />');
      expect(firstChunk).not.toContain('Streamed Body');

      // Drain remaining chunks
      let rest = '';
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        rest += decoder.decode(next.value);
      }

      expect(rest).toContain('Streamed Body');
      expect(rest).toContain(`<script id="${DEFAULT_SCRIPT_ID}" type="application/json">`);
      expect(rest).toContain('<script type="module" src="/client.js"></script>');
    });
  });

  describe('strongly typed loader, dynamic title, and dynamic status', () => {
    it('executes co-located static loader(c) and supports dynamic title & status', async () => {
      const ArticlePage = CustomElement.define(
        {
          name: 'article-page',
          template: '<article><h1>${article.title}</h1></article>',
        },
        class {
          article: { title: string } | null = null;
          static title = (data: { article?: { title: string } | null }) =>
            data.article ? `${data.article.title} — Blog` : 'Not Found';
          static status = (data: { article?: unknown }) => (data.article ? 200 : 404);
          static async loader(c: { req: { param: (k: string) => string } }) {
            const slug = c.req.param('slug');
            return { article: slug === 'missing' ? null : { title: `Guide to ${slug}` } };
          }
        }
      );

      const app = new Hono();
      app.get('/articles/:slug', aurelia(ArticlePage));

      const okRes = await app.request('/articles/aurelia-2');
      expect(okRes.status).toBe(200);
      const okHtml = await okRes.text();
      expect(okHtml).toContain('<title>Guide to aurelia-2 — Blog</title>');
      expect(okHtml).toContain('Guide to aurelia-2');

      const missingRes = await app.request('/articles/missing');
      expect(missingRes.status).toBe(404);
      expect(await missingRes.text()).toContain('<title>Not Found</title>');
    });

    it('composes parallel fetches cleanly inside a single typed loader via Promise.all', async () => {
      const MetricsPage = CustomElement.define(
        { name: 'metrics-page', template: '<div>${count} / ${region}</div>' },
        class {
          count = 0;
          region = '';
        }
      );

      const app = new Hono();
      app.get(
        '/metrics',
        aurelia({
          component: MetricsPage,
          preserveMarkers: false,
          loader: async () => {
            const [count, region] = await Promise.all([
              Promise.resolve(42),
              Promise.resolve('ap-southeast-1'),
            ]);
            return { count, region };
          },
        })
      );

      const res = await app.request('/metrics');
      expect(res.status).toBe(200);
      expect(await res.text()).toContain('42 / ap-southeast-1');
    });

    it('short-circuits SSR immediately when loader returns a Response', async () => {
      const app = new Hono();
      app.get(
        '/private',
        aurelia({
          component: SimplePage,
          loader: (c) => c.redirect('/login', 302),
        })
      );

      const res = await app.request('/private');
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe('/login');
    });
  });

  describe('WeakMap<Request> scoped defaults & typed DI context', () => {
    it('composes with standard Hono auth middleware and injects context strictly via DI', async () => {
      type AppEnv = { Variables: { tenant: string; actor: string } };
      const app = new Hono<AppEnv>();

      const TenantPage = CustomElement.define(
        { name: 'tenant-page', template: '<section>${req.data.tenant}:${req.data.actor}</section>' },
        class {
          readonly req = resolveRequestContext<{ tenant: string; actor: string }>();
        }
      );

      app.get(
        '/workspace',
        async (c, next) => {
          if (c.req.header('Authorization') !== 'Bearer ok') {
            return c.json({ error: 'Unauthorized' }, 401);
          }
          c.set('tenant', 'acme');
          c.set('actor', 'Sandiko');
          await next();
          return;
        },
        aurelia({ component: TenantPage, preserveMarkers: false })
      );

      const denied = await app.request('/workspace');
      expect(denied.status).toBe(401);

      const allowed = await app.request('/workspace', {
        headers: { Authorization: 'Bearer ok' },
      });
      expect(allowed.status).toBe(200);
      expect(await allowed.text()).toContain('acme:Sandiko');
    });

    it('isolates aureliaDefaults via WeakMap<Request> with zero c.var pollution', async () => {
      const appA = new Hono();
      appA.use('*', aureliaDefaults({ document: { cssBundle: '/a.css' }, dataEndpoint: true }));
      appA.get('/', aurelia(SimplePage));

      const appB = new Hono();
      appB.get('/', aurelia(SimplePage));

      const resA = await appA.request('/', { headers: { Accept: 'application/json' } });
      expect(resA.status).toBe(200);
      const jsonA = (await resA.json()) as { context: Record<string, unknown> };
      expect(Object.keys(jsonA.context)).toEqual([]);

      const resB = await appB.request('/', { headers: { Accept: 'application/json' } });
      expect(resB.headers.get('content-type')).toContain('text/html');
      expect(await resB.text()).not.toContain('/a.css');
    });

    it('supports zero-config aureliaDefaults() and enables c.render()', async () => {
      const app = new Hono();
      app.use('*', aureliaRenderer()); // Zero-config convention!
      app.get('/page', aurelia(SimplePage));
      app.get('/render', (c) => c.render(SimplePage, { title: 'Rendered Title' }));

      const resPage = await app.request('/page');
      expect(resPage.status).toBe(200);
      const htmlPage = await resPage.text();
      expect(htmlPage).toContain('<link rel="stylesheet" href="/style.css" />');
      expect(htmlPage).toContain('<script type="module" src="/client.js"></script>');

      const resRender = await app.request('/render');
      expect(resRender.status).toBe(200);
      const htmlRender = await resRender.text();
      expect(htmlRender).toContain('<title>Rendered Title</title>');
      expect(htmlRender).toContain('Hello Aurelia');
    });
  });

  describe('opt-in dataEndpoint & error propagation', () => {
    it('negotiates JSON vs HTML only when dataEndpoint: true', async () => {
      const app = new Hono();
      app.get('/html-only', aurelia(SimplePage));
      app.get(
        '/dual',
        aurelia({
          component: SimplePage,
          dataEndpoint: true,
          loader: async () => ({ heading: 'API Heading' }),
        })
      );

      const htmlOnly = await app.request('/html-only', {
        headers: { Accept: 'application/json' },
      });
      expect(htmlOnly.headers.get('content-type')).toContain('text/html');

      const jsonRes = await app.request('/dual', {
        headers: { Accept: 'text/html;q=0.4, application/json;q=0.9' },
      });
      expect(jsonRes.headers.get('content-type')).toContain('application/json');
      const body = (await jsonRes.json()) as { initialData: { heading: string } };
      expect(body.initialData.heading).toBe('API Heading');
    });

    it('propagates errors to Hono app.onError() by default and supports fallback: "spa"', async () => {
      const app = new Hono();
      app.onError((err, c) => c.text(`HonoError:${err.message}`, 500));

      app.get(
        '/err',
        aurelia({
          component: SimplePage,
          loader: async () => {
            throw new Error('DB down');
          },
        })
      );

      app.get(
        '/spa',
        aurelia({
          component: CustomElement.define(
            { name: 'broken-ssr', template: '<div>x</div>' },
            class {
              binding() {
                throw new Error('Client-only API');
              }
            }
          ),
          title: 'SPA Fallback',
          fallback: 'spa',
          document: { jsBundle: '/client.js' },
        })
      );

      const errRes = await app.request('/err');
      expect(errRes.status).toBe(500);
      expect(await errRes.text()).toBe('HonoError:DB down');

      const spaRes = await app.request('/spa');
      expect(spaRes.status).toBe(200);
      const spaHtml = await spaRes.text();
      expect(spaHtml).toContain('<app-root></app-root>');
      expect(spaHtml).toContain('src="/client.js"');
    });
  });

  describe('strictly typed aureliaAction()', () => {
    it('dispatches co-located static actions and standalone action maps cleanly', async () => {
      let likes = 10;

      class PostPage {
        static readonly actions = {
          like: async () => {
            likes += 1;
            return { liked: true, likes };
          },
          archive: async (c: { text: (body: string, status: 202) => Response }) =>
            c.text('Archived', 202),
        };
      }

      const app = new Hono();
      app.post('/posts/:id', aureliaAction(PostPage));
      app.post(
        '/ops',
        aureliaAction(
          { ping: async () => ({ pong: true }) },
          { resolveAction: (c) => c.req.header('X-Op') }
        )
      );
      app.post('/single', aureliaAction({ action: async () => ({ created: true }) }));

      const likeRes = await app.request('/posts/1?_action=like', { method: 'POST' });
      expect(likeRes.status).toBe(200);
      expect(await likeRes.json()).toEqual({ liked: true, likes: 11 });

      const archiveRes = await app.request('/posts/1', {
        method: 'POST',
        headers: { 'X-Action': 'archive' },
      });
      expect(archiveRes.status).toBe(202);
      expect(await archiveRes.text()).toBe('Archived');

      const missingRes = await app.request('/posts/1?_action=nope', { method: 'POST' });
      expect(missingRes.status).toBe(404);

      const opRes = await app.request('/ops', { method: 'POST', headers: { 'X-Op': 'ping' } });
      expect(await opRes.json()).toEqual({ pong: true });

      const singleRes = await app.request('/single', { method: 'POST' });
      expect(await singleRes.json()).toEqual({ created: true });
    });

    it('enforces Fetch-spec CSRF protection and supports PRG 303 redirect for non-JS HTML forms', async () => {
      const app = new Hono();
      app.post(
        '/comments',
        aureliaAction(
          {
            create: async () => ({ saved: true }),
          },
          { csrf: { trustedOrigins: ['https://partner.example'] } }
        )
      );

      // 1. Cross-origin Origin header rejected with 403
      const evilOrigin = await app.request('http://localhost/comments?_action=create', {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
      });
      expect(evilOrigin.status).toBe(403);

      // 2. Cross-site Sec-Fetch-Site rejected with 403
      const evilFetchSite = await app.request('http://localhost/comments?_action=create', {
        method: 'POST',
        headers: { 'Sec-Fetch-Site': 'cross-site' },
      });
      expect(evilFetchSite.status).toBe(403);

      // 3. Same-origin non-JS HTML <form> receives 303 See Other PRG redirect without _action param
      const htmlForm = await app.request('http://localhost/comments?page=2&_action=create', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      expect(htmlForm.status).toBe(303);
      expect(htmlForm.headers.get('location')).toBe('/comments?page=2');

      // 4. Trusted external origin with X-Aurelia-Enhance receives JSON
      const trusted = await app.request('http://localhost/comments?_action=create', {
        method: 'POST',
        headers: {
          Origin: 'https://partner.example',
          Accept: 'application/json',
          'X-Aurelia-Enhance': '1',
        },
      });
      expect(trusted.status).toBe(200);
      expect(await trusted.json()).toEqual({ saved: true });
    });

    it('treats cross-site as forbidden even with a matching or trusted Origin, and supports strict mode', async () => {
      const app = new Hono();
      app.post(
        '/strict',
        aureliaAction(
          { go: async () => ({ ok: true }) },
          { csrf: { requireOriginOnForms: true } }
        )
      );
      app.post(
        '/partner',
        aureliaAction(
          { go: async () => ({ ok: true }) },
          { csrf: { trustedOrigins: ['https://partner.example'] } }
        )
      );
      app.post('/open', aureliaAction({ go: async () => ({ ok: true }) }, { csrf: false }));

      const forged = await app.request('http://localhost/strict?_action=go', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost',
          'Sec-Fetch-Site': 'cross-site',
          Accept: 'application/json',
        },
      });
      expect(forged.status).toBe(403);

      const nullOrigin = await app.request('http://localhost/strict?_action=go', {
        method: 'POST',
        headers: { Origin: 'null', Accept: 'application/json' },
      });
      expect(nullOrigin.status).toBe(403);

      const noHeaders = await app.request('http://localhost/strict?_action=go', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });
      expect(noHeaders.status).toBe(403);

      const trustedCrossSite = await app.request('http://localhost/partner?_action=go', {
        method: 'POST',
        headers: {
          Origin: 'https://partner.example',
          'Sec-Fetch-Site': 'cross-site',
          Accept: 'application/json',
        },
      });
      expect(trustedCrossSite.status).toBe(403);

      const open = await app.request('http://localhost/open?_action=go', { method: 'POST' });
      expect(open.status).toBe(200);
    });

    it('cascades parent aureliaLayout() data into child routes and applies serialize.replacer on dataEndpoint', async () => {
      type LayoutEnv = { Variables: { secretToken: string; publicRole: string } };
      const app = new Hono<LayoutEnv>();

      const ChildPage = CustomElement.define(
        { name: 'child-page', template: '<div>${org} - ${project}</div>' },
        class {
          org = '';
          project = '';
        }
      );

      app.use('*', async (c, next) => {
        c.set('secretToken', 'super-secret');
        c.set('publicRole', 'owner');
        await next();
      });

      app.use(
        '*',
        aureliaDefaults<LayoutEnv>({
          dataEndpoint: true,
          serialize: {
            replacer: (key, val) => (key === 'secretToken' ? undefined : val),
          },
        })
      );

      app.use('/app/*', aureliaLayout(async () => ({ org: 'AureliaCorp' })));
      app.use('/guarded/*', aureliaLayout((c) => c.redirect('/login', 302)));

      app.get(
        '/app/projects',
        aurelia({
          component: ChildPage,
          preserveMarkers: false,
          loader: async () => ({ project: 'AureliaKit' }),
        })
      );
      app.get('/guarded/ billing', aurelia(ChildPage));
      app.get('/guarded/billing', aurelia(ChildPage));

      const htmlRes = await app.request('/app/projects');
      expect(await htmlRes.text()).toContain('AureliaCorp - AureliaKit');
      expect(htmlRes.headers.get('vary')).toContain('Accept');

      const jsonRes = await app.request('/app/projects', {
        headers: { Accept: 'application/json' },
      });
      expect(jsonRes.headers.get('vary')).toContain('Accept');
      const jsonBody = (await jsonRes.json()) as {
        context: Record<string, unknown>;
        initialData: { org: string; project: string };
      };
      expect(jsonBody.initialData).toEqual({ org: 'AureliaCorp', project: 'AureliaKit' });
      expect(jsonBody.context.publicRole).toBe('owner');
      expect(jsonBody.context.secretToken).toBeUndefined();

      const guardedRes = await app.request('/guarded/billing');
      expect(guardedRes.status).toBe(302);
      expect(guardedRes.headers.get('location')).toBe('/login');
    });
  });
});
