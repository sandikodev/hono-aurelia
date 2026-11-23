/**
 * Hono + Aurelia 2 SSR Reference Implementation
 *
 * Demonstrates idiomatic, zero-boilerplate meta-framework composition:
 * - Real Aurelia 2 component server-side rendering
 * - Thin @hono/aurelia route & action adapters (aurelia + aureliaAction)
 * - Clean static asset streaming via universal staticAssets middleware
 * - Composable Hono auth middleware (requireAuth)
 * - Scoped aureliaDefaults middleware with streaming & opt-in dataEndpoint
 * - Automated client-side hydration via createClientHydrator
 */

import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { aurelia, aureliaAction, aureliaRenderer } from '@hono/aurelia';
import { staticAssets } from './static';

// Clean Canonical Aurelia 2 Page Components
import { HomePage } from './pages/home';
import { PostDetailPage } from './pages/post-detail';
import { DashboardPage } from './pages/dashboard';

export type AppEnv = {
  Bindings: {
    DB?: any;
  };
  Variables: {
    user: { id: string; email: string; name: string } | null;
    role: string | null;
  };
};

const app = new Hono<AppEnv>();

// Favicon route
app.get('/favicon.ico', (c) => {
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#ed2578"/><text x="50" y="65" font-size="50" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="bold">Au</text></svg>`;
  return c.body(faviconSvg, 200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=86400',
  });
});

// Universal zero-copy static asset streaming (Cloudflare Workers ASSETS binding or Bun zero-copy I/O)
app.use('*', staticAssets());

// Aurelia SSR Renderer Middleware (matching @hono/react-renderer mental model)
app.use(
  '*',
  aureliaRenderer<AppEnv>({
    document: {
      cssBundle: '/style.css',
      jsBundle: '/client.js',
    },
    streaming: true,
    dataEndpoint: true,
  })
);

// Idiomatic Hono session resolution middleware
app.use('*', async (c, next) => {
  const token =
    c.req.query('token') || c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (token === 'demo-token') {
    c.set('user', { id: 'usr_1', email: 'operator@aureliajs.dev', name: 'Demo Operator' });
    c.set('role', 'owner');
  }
  await next();
});

// Composable Hono auth guard middleware
const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user')) {
    return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
  }
  await next();
  return;
});

// --- Clean Declarative Aurelia 2 SSR & Action Routes ---
app.get('/', aurelia(HomePage));
app.get('/posts/:slug', aurelia(PostDetailPage));
app.post('/posts/:slug', aureliaAction(PostDetailPage));
app.get('/dashboard', requireAuth, aurelia(DashboardPage));

// Standard JSON API Endpoints
app.get('/api/posts', async (c) => {
  const postService = new (await import('./services/post-service')).PostService(c.env?.DB);
  return c.json(await postService.getPosts());
});
app.get('/api/dashboard/stats', requireAuth, async (c) => {
  const dashboardService = new (await import('./services/dashboard-service')).DashboardService(c.env?.DB);
  return c.json(await dashboardService.getMetrics());
});
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

const port = parseInt(process.env.PORT || '3000', 10);

if (process.env.NODE_ENV !== 'test' && import.meta.main) {
  console.log(`\n🚀 Native Bun Aurelia 2 SSR + Hono Server running on http://localhost:${port}`);
}

export { app };
export default {
  port,
  fetch: app.fetch,
};
