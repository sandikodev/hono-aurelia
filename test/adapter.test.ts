import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { CustomElement } from 'aurelia';
import { aurelia, aureliaAction, aureliaDefaults } from '../src/adapter.js';

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
  describe('SSR rendering & shorthand', () => {
    it('renders HTML by default via shorthand signature aurelia(Component, title)', async () => {
      const app = new Hono();
      app.get('/', aurelia(SimplePage, 'Home Title'));

      const res = await app.request('/');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');

      const html = await res.text();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<title>Home Title</title>');
      expect(html).toContain('Hello Aurelia');
      expect(html).toContain('window.__HYDRATION__');
      expect(html).toContain('"component":"simple-page"');
    });

    it('renders HTML via full config object with custom document options', async () => {
      const app = new Hono();
      app.get(
        '/custom',
        aurelia({
          component: SimplePage,
          title: 'Custom Shell',
          document: {
            lang: 'id',
            rootTag: 'my-root',
            cssBundle: '/assets/app.css',
            jsBundle: '/assets/app.js',
          },
        })
      );

      const res = await app.request('/custom');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('<html lang="id">');
      expect(html).toContain('<my-root>');
      expect(html).toContain('href="/assets/app.css"');
      expect(html).toContain('src="/assets/app.js"');
    });

    it('streams chunked HTML when streaming: true', async () => {
      const app = new Hono();
      app.get(
        '/stream',
        aurelia({
          component: SimplePage,
          title: 'Streamed',
          streaming: true,
        })
      );

      const res = await app.request('/stream');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(res.headers.get('transfer-encoding')).toBe('chunked');
      const html = await res.text();
      expect(html).toContain('<title>Streamed</title>');
      expect(html).toContain('Pure SSR');
    });
  });

  describe('loaders, dynamic title, and dynamic status', () => {
    it('executes co-located static loader(c) and injects loaded props into SSR', async () => {
      const ArticlePage = CustomElement.define(
        {
          name: 'article-page',
          template: '<article><h1>${article.title}</h1></article>',
        },
        class {
          article = { title: '' };
          static title = (data: { article?: { title: string } }) =>
            data.article ? `${data.article.title} — Blog` : 'Not Found';
          static status = (data: { article?: unknown }) => (data.article ? 200 : 404);
          static async loader(c: { req: { param: (k: string) => string } }) {
            const slug = c.req.param('slug');
            if (slug === 'missing') return { article: null };
            return { article: { title: `Guide to ${slug}` } };
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
      const missingHtml = await missingRes.text();
      expect(missingHtml).toContain('<title>Not Found</title>');
    });

    it('executes multiple route loaders in parallel', async () => {
      const DashboardComp = CustomElement.define(
        {
          name: 'dash-comp',
          template: '<div>${metrics.count} / ${region.name}</div>',
        },
        class {
          metrics = { count: 0 };
          region = { name: '' };
        }
      );

      const app = new Hono();
      app.get(
        '/dash',
        aurelia({
          component: DashboardComp,
          loaders: {
            metrics: async () => ({ count: 42 }),
            region: async () => ({ name: 'ap-southeast-1' }),
          },
        })
      );

      const res = await app.request('/dash');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('42');
      expect(html).toContain('ap-southeast-1');
    });

    it('short-circuits SSR when loader returns a Response (e.g., redirect)', async () => {
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

  describe('composable Hono middleware & context isolation', () => {
    it('composes cleanly with standard Hono auth middleware without parallel auth flags', async () => {
      type Env = { Variables: { tenant: string; actor: { name: string } } };
      const app = new Hono<Env>();

      const requireActor = async (
        c: Parameters<Parameters<typeof app.use>[1]>[0],
        next: () => Promise<void>
      ) => {
        const token = c.req.header('Authorization');
        if (token !== 'Bearer valid') {
          return c.json({ error: 'Unauthorized' }, 401);
        }
        c.set('tenant', 'acme');
        c.set('actor', { name: 'Sandiko' });
        await next();
        return undefined;
      };

      const TenantPage = CustomElement.define(
        {
          name: 'tenant-page',
          template: '<section>${tenant}: ${actor.name}</section>',
        },
        class {
          tenant = '';
          actor = { name: '' };
        }
      );

      app.get('/workspace', requireActor, aurelia(TenantPage));

      const denied = await app.request('/workspace');
      expect(denied.status).toBe(401);

      const allowed = await app.request('/workspace', {
        headers: { Authorization: 'Bearer valid' },
      });
      expect(allowed.status).toBe(200);
      const html = await allowed.text();
      expect(html).toContain('acme');
      expect(html).toContain('Sandiko');
    });

    it('isolates aureliaDefaults per Hono app and strips internal keys from hydration context', async () => {
      const appA = new Hono();
      appA.use(
        '*',
        aureliaDefaults({
          document: { cssBundle: '/a.css', jsBundle: '/a.js' },
          dataEndpoint: true,
        })
      );
      appA.get('/', aurelia(SimplePage));

      const appB = new Hono();
      appB.get('/', aurelia(SimplePage));

      const resAJson = await appA.request('/', {
        headers: { Accept: 'application/json' },
      });
      expect(resAJson.status).toBe(200);
      const bodyA = (await resAJson.json()) as { context: Record<string, unknown> };
      expect(bodyA.context.__aurelia_defaults).toBeUndefined();

      // App B must NOT inherit app A's defaults (zero global mutable state!)
      const resB = await appB.request('/', {
        headers: { Accept: 'application/json' },
      });
      expect(resB.headers.get('content-type')).toContain('text/html');
      const htmlB = await resB.text();
      expect(htmlB).not.toContain('/a.css');
    });

    it('supports custom context extractor hook', async () => {
      const app = new Hono();
      app.get(
        '/locale',
        aurelia({
          component: SimplePage,
          dataEndpoint: true,
          context: (c) => ({ locale: c.req.header('Accept-Language') ?? 'en' }),
        })
      );

      const res = await app.request('/locale', {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'id-ID',
        },
      });
      const data = (await res.json()) as { context: { locale: string } };
      expect(data.context.locale).toBe('id-ID');
    });
  });

  describe('opt-in dataEndpoint content negotiation', () => {
    it('serves HTML by default even when Accept: application/json is sent (opt-in safety)', async () => {
      const app = new Hono();
      app.get('/', aurelia(SimplePage));

      const res = await app.request('/', {
        headers: { Accept: 'application/json' },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
    });

    it('negotiates JSON vs HTML via q-values when dataEndpoint: true', async () => {
      const app = new Hono();
      app.get(
        '/items',
        aurelia({
          component: SimplePage,
          dataEndpoint: true,
          loader: async () => ({ items: [1, 2, 3] }),
        })
      );

      const jsonRes = await app.request('/items', {
        headers: { Accept: 'text/html;q=0.5, application/json;q=0.9' },
      });
      expect(jsonRes.status).toBe(200);
      expect(jsonRes.headers.get('content-type')).toContain('application/json');
      const payload = (await jsonRes.json()) as {
        component: string;
        initialData: { items: number[] };
      };
      expect(payload.component).toBe('simple-page');
      expect(payload.initialData.items).toEqual([1, 2, 3]);

      const htmlRes = await app.request('/items', {
        headers: { Accept: 'text/html;q=0.9, application/json;q=0.5' },
      });
      expect(htmlRes.status).toBe(200);
      expect(htmlRes.headers.get('content-type')).toContain('text/html');
    });
  });

  describe('error propagation & fallback strategy', () => {
    it('propagates render and loader errors to Hono app.onError() by default', async () => {
      const app = new Hono();
      let caughtError: Error | null = null;

      app.onError((err, c) => {
        caughtError = err;
        return c.text(`Handled by Hono: ${err.message}`, 500);
      });

      app.get(
        '/broken',
        aurelia({
          component: SimplePage,
          loader: async () => {
            throw new Error('DB offline');
          },
        })
      );

      const res = await app.request('/broken');
      expect(res.status).toBe(500);
      expect(await res.text()).toBe('Handled by Hono: DB offline');
      expect(caughtError).not.toBeNull();
    });

    it('delegates errors to custom onError hook when configured', async () => {
      const app = new Hono();
      app.get(
        '/custom-err',
        aurelia({
          component: null,
          onError: (err, c) =>
            c.json(
              { custom: true, reason: err instanceof Error ? err.message : String(err) },
              503
            ),
        })
      );

      const res = await app.request('/custom-err');
      expect(res.status).toBe(503);
      const body = (await res.json()) as { custom: boolean; reason: string };
      expect(body.custom).toBe(true);
      expect(body.reason).toContain('component is required');
    });

    it('returns empty SPA document shell when fallback: "spa" and render fails', async () => {
      const app = new Hono();
      app.get(
        '/spa-fallback',
        aurelia({
          component: {
            get template() {
              throw new Error('SSR crash');
            },
          },
          title: 'SPA Shell',
          fallback: 'spa',
          document: { jsBundle: '/client.js' },
        })
      );

      const res = await app.request('/spa-fallback');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('<title>SPA Shell</title>');
      expect(html).toContain('<app-root></app-root>');
      expect(html).toContain('src="/client.js"');
    });
  });

  describe('aureliaAction() explicit mutation handler', () => {
    it('dispatches co-located static actions via _action query and X-Action header', async () => {
      let likes = 10;

      class PostPage {
        static actions = {
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

      const likeRes = await app.request('/posts/1?_action=like', { method: 'POST' });
      expect(likeRes.status).toBe(200);
      expect(await likeRes.json()).toEqual({ liked: true, likes: 11 });

      const archiveRes = await app.request('/posts/1', {
        method: 'POST',
        headers: { 'X-Action': 'archive' },
      });
      expect(archiveRes.status).toBe(202);
      expect(await archiveRes.text()).toBe('Archived');

      const missingRes = await app.request('/posts/1?_action=unknown', { method: 'POST' });
      expect(missingRes.status).toBe(404);
    });

    it('supports standalone action functions, maps, custom resolveAction, and 405 on empty target', async () => {
      const app = new Hono();

      app.post(
        '/single',
        aureliaAction(async () => ({ created: true }))
      );

      app.post(
        '/custom-resolve',
        aureliaAction(
          {
            ping: async () => ({ pong: true }),
          },
          {
            resolveAction: (c) => c.req.header('X-Op'),
          }
        )
      );

      app.post('/readonly', aureliaAction(SimplePage));

      const singleRes = await app.request('/single', { method: 'POST' });
      expect(singleRes.status).toBe(200);
      expect(await singleRes.json()).toEqual({ created: true });

      const customRes = await app.request('/custom-resolve', {
        method: 'POST',
        headers: { 'X-Op': 'ping' },
      });
      expect(customRes.status).toBe(200);
      expect(await customRes.json()).toEqual({ pong: true });

      const readonlyRes = await app.request('/readonly', { method: 'POST' });
      expect(readonlyRes.status).toBe(405);
    });
  });
});
