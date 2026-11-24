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
 * - Production-hardened HTTP security headers and Agentic Resource Discovery
 */

import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { aurelia, aureliaAction, aureliaRenderer } from '@hono/aurelia';
import { staticAssets } from './static';
import styleText from '../public/style.css' with { type: 'text' };
import llmsTxt from '../public/llms.txt' with { type: 'text' };
import ardJson from '../public/.well-known/ard.json';

// Clean Canonical Aurelia 2 Page Components
import { HomePage } from './pages/home';
import { PostDetailPage } from './pages/post-detail';
import { DashboardPage } from './pages/dashboard';

export type AppEnv = {
  Bindings: {
    DB?: any;
    TELEMETRY_TOKEN?: string;
  };
  Variables: {
    user: { id: string; email: string; name: string } | null;
    role: string | null;
  };
};

const app = new Hono<AppEnv>();

// Universal Hardened Security Headers Middleware
app.use('*', async (c, next) => {
  await next();
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  c.res.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
});

// Favicon route
app.get('/favicon.ico', (c) => {
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#c81b66"/><text x="50" y="65" font-size="50" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="bold">Au</text></svg>`;
  return c.body(faviconSvg, 200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=86400',
  });
});

// Agentic Resource Discovery & LLMs endpoints
app.get('/llms.txt', (c) => {
  return c.text(llmsTxt, 200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*',
  });
});

app.get('/.well-known/ard.json', (c) => {
  return c.json(ardJson, 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*',
  });
});

// Universal zero-copy static asset streaming (Cloudflare Workers ASSETS binding or Bun zero-copy I/O)
app.use('*', staticAssets());

// Aurelia SSR Renderer Middleware (matching @hono/react-renderer mental model)
app.use(
  '*',
  aureliaRenderer<AppEnv>({
    document: {
      cssBundle: false, // Inlined below for 0ms render-blocking LCP!
      jsBundle: '/client.js',
      head: [
        `<style>/* Critical inlined styles for 0ms render-blocking LCP */\n${styleText}</style>`,
        '<meta name="description" content="Production-ready Canonical Hono + Aurelia 2 SSR Reference Architecture running on Cloudflare Workers edge runtime with D1 persistence." />',
        '<meta name="theme-color" content="#08090d" />',
        '<link rel="icon" type="image/svg+xml" href="/favicon.ico" />',
        '<link rel="ard" type="application/json" href="/.well-known/ard.json" />',
        '<meta property="og:type" content="website" />',
        '<meta property="og:site_name" content="Aurelia 2 SSR" />',
        '<meta property="og:title" content="Hono + Aurelia 2 SSR Reference Architecture" />',
        '<meta property="og:description" content="Production-ready Canonical Hono + Aurelia 2 SSR Reference Architecture running on Cloudflare Workers edge runtime with D1 persistence." />',
      ].join('\n    '),
    },
    streaming: true,
    dataEndpoint: true,
  })
);

// Idiomatic Hono session resolution middleware
app.use('*', async (c, next) => {
  const configured = (c.env as { TELEMETRY_TOKEN?: string } | undefined)?.TELEMETRY_TOKEN;
  const token =
    c.req.query('token') || c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  // Fail closed: no configured token means no privileged session, and no
  // hardcoded credential can ever unlock the telemetry surface.
  if (configured && token && token === configured) {
    c.set('user', { id: 'usr_1', email: 'operator@aureliajs.dev', name: 'Operator' });
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
