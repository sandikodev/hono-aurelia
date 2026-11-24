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
app.get('/llms.txt', async (c) => {
  const content = `# Aurelia 2 Fullstack Ecosystem & Meta-Framework Specification

> The Canonical Reference Specification, Open-Source Architecture, and Community RFC Suite for Aurelia 2, Hono, and Edge Cloud Computing. Maintained by Sandiko Dev (@sandikodev).

## 🕊️ Philosophy: Convention-over-Configuration (CoC) in the AI / LLM Era

### The Antidote to LLM Hallucination & Codebase Entropy
In the modern software landscape, Large Language Models (LLMs) and autonomous AI coding agents generate substantial amounts of code. When web frameworks lack strict architectural conventions and instead rely on fragmented ad-hoc glue code (competing state libraries, arbitrary hooks, custom build wrappers), the search space for LLMs expands uncontrollably. The model hallucinates, introducing divergent paradigms, bloated third-party dependencies (clsx, cva, zustand), and fragile glue code.

Convention-over-Configuration (CoC) is fundamentally aligned with Large Language Models. Deterministic conventions—such as Aurelia 2's clean ViewModel + View separation, standard TC39 decorators, native @resolve() Dependency Injection, and Hono's minimalist route adapters—constrain the AI generation space. The model produces predictable, clean, and unbloated code because the conventions guide it with mathematical certainty.

### The Engineer as an Architectural Steward
Software engineering is not merely typing syntax; it is exercising architectural wisdom:
1. Clean Code & Native Purity: Respect the browser and machine by eliminating unnecessary Virtual DOM overhead and wrapper layers.
2. Reproducible Environments: Structure toolchains so that human contributors and AI agents can build, test, and verify with zero friction.
3. Living Documentation: Maintain accurate, machine-readable specifications (llms.txt, ard.json, RFCs) that reflect true system reality.
4. Community Ethics & Sustainability: Build digital technology as a shared fabric of interconnectedness and harmony, transcending individual ego or dogmatic gatekeeping.

### The Mutual Alignment: Hono & Aurelia 2
Hono and Aurelia 2 share a common design soul: radical simplicity and native Web Standards purity.
- Hono provides the lightest, standard-compliant edge envelope (Cloudflare workerd, Bun, Node, Deno) based on standard Web Fetch, Request, Response, and Web Streams.
- Aurelia 2 provides direct-DOM rendering with zero Virtual-DOM overhead, enterprise-grade Dependency Injection, and sub-millisecond LinkeDOM SSR streaming.
- Together, they form an unbroken Web Standards continuum with zero glue code.

---

## 🏛️ Monorepo Package Directory & Roles

### Upstream Open-Source Packages (packages/)
- packages/hono-aurelia: The official Hono meta-framework adapter for Aurelia 2 (@hono/aurelia, @hono/aurelia/client, @hono/aurelia/server, @hono/aurelia/build).
- packages/aurelia-ssr: Core LinkeDOM SSR Engine & Web Streams Assembler (@aureliajs/ssr, @aureliajs/ssr/server, @aureliajs/ssr/client).
- packages/aurelia-islands: Islands Architecture runtime for partial, progressive, zero-JS hydration (@aureliajs/islands).
- packages/aurelia-bridge: Polyglot component interop for embedding foreign components (React, Vue) within Aurelia 2 (@aureliajs/bridge).
- packages/vite-plugin-aux: Compiler & bundler plugins for .aux Single-File Components supporting Vite, Bun, and esbuild (@aureliajs/vite-plugin-aux).
- packages/ssr-playground: Interactive developer workbench featuring 16 live architectural pattern test suites.

### End-User SaaS Applications (apps/)
- apps/web: Multi-tenant enterprise SaaS admin application built with Aurelia 2, Tailwind CSS v4, and .aux SFCs.
- apps/api: Enterprise REST backend built with Hono, Drizzle ORM, Argon2id auth, and Neon PostgreSQL.
- apps/shared: Domain contracts, Zod validation schemas, and shared TypeScript types.

---

## 📜 Community RFCs & Architectural Manifestos
- RFC Master: Native Purity Initiative (https://github.com/sandikodev/aureliajs/blob/main/.github/issues/00-master-native-purity-initiative.md)
- RFC 001: LinkeDOM Edge SSR Migration (https://github.com/sandikodev/aureliajs/blob/main/.github/issues/03-rfc-migrate-ssr-dom-from-jsdom-to-linkedom.md)
- RFC 002: Eliminate React CSS Utilities (https://github.com/sandikodev/aureliajs/blob/main/.github/issues/02-rfc-eliminate-react-css-utilities-in-web.md)
- Manifesto: Aurelia 2 + Hono Master Architectural Manifesto (https://github.com/sandikodev/aureliajs/blob/main/docs/AURELIA_HONO_MASTER_MANIFESTO.md)
- Essay: The Angular-Aurelia Heritage (https://github.com/sandikodev/aureliajs/blob/main/docs/essays/the-angular-aurelia-heritage.md)

---

## 🌐 Public Deployments & Machine-Readable Manifests
- Production SaaS Platform (Vercel): https://aureliajs.vercel.app
- Edge SSR Reference Application: https://aurelia-hono-ssr.sandiko.workers.dev
- Monorepo Source Code: https://github.com/sandikodev/aureliajs
`;
  return c.text(content, 200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*',
  });
});

app.get('/.well-known/ard.json', (c) => {
  return c.json(
    {
      $schema: 'https://agentic.dev/schemas/ard-v1.json',
      ard_version: '1.0',
      name: 'Aurelia 2 Fullstack Ecosystem & Meta-Framework',
      description: 'Production-ready enterprise SaaS admin dashboard, LinkeDOM real-DOM Edge SSR, and upstream Hono meta-framework adapters',
      url: 'https://aurelia-hono-ssr.sandiko.workers.dev',
      repository: {
        type: 'git',
        url: 'https://github.com/sandikodev/aureliajs',
        steward: 'Sandiko Dev (@sandikodev)',
        license: 'MIT',
      },
      llms_txt: 'https://aurelia-hono-ssr.sandiko.workers.dev/llms.txt',
      capabilities: [
        'convention-over-configuration',
        'real-dom-ssr',
        'web-streams-streaming',
        'dependency-injection',
        'edge-database',
        'single-file-components-aux',
        'rest-api',
        'enterprise-saas',
        'webmcp-agentic-discovery',
      ],
      philosophy: {
        core: 'Convention-over-Configuration as the essential antidote to LLM hallucination and architectural entropy',
        stewardship: 'The software engineer acts as an architectural steward deciding clean patterns, ethical environments, and sustainable systems',
        mutual_alignment: 'Hono (edge cloud minimalism) and Aurelia 2 (direct-DOM standards) form an unbroken Web Standards continuum with zero glue code',
        status: 'Open community proposal and living RFC invitation for healthy debate and upstream collaboration',
      },
      packages: [
        {
          name: '@hono/aurelia',
          path: 'packages/hono-aurelia',
          description: 'Thin, zero-boilerplate Hono meta-framework adapter for Aurelia 2 SSR and server actions',
          exports: ['aurelia', 'aureliaAction', 'aureliaRenderer', 'createClientHydrator'],
        },
        {
          name: '@aureliajs/ssr',
          path: 'packages/aurelia-ssr',
          description: 'Request-isolated real-DOM SSR engine using LinkeDOM with Web Streams streaming support',
          exports: ['renderAurelia', 'createDocumentShell', 'serializeState', 'createHydrationScript'],
        },
        {
          name: '@aureliajs/islands',
          path: 'packages/aurelia-islands',
          description: 'Islands Architecture runtime for zero-JS progressive hydration',
          exports: ['defineIsland', 'hydrateIslands'],
        },
        {
          name: '@aureliajs/bridge',
          path: 'packages/aurelia-bridge',
          description: 'Polyglot component interoperability bridging React and Vue into Aurelia 2',
          exports: ['BridgeElement', 'bridgePlugin'],
        },
        {
          name: '@aureliajs/vite-plugin-aux',
          path: 'packages/vite-plugin-aux',
          description: 'Single-File Component (.aux) compiler for Vite, Bun, and esbuild',
          exports: ['auxPlugin', 'auxEsbuildPlugin', 'auxBunPlugin'],
        },
        {
          name: 'ssr-playground',
          path: 'packages/ssr-playground',
          description: 'Interactive developer workbench with 16 reference pattern suites',
        },
      ],
      rfc_proposals: [
        {
          id: 'RFC-000',
          title: 'Master Native Purity Initiative',
          url: 'https://github.com/sandikodev/aureliajs/blob/main/.github/issues/00-master-native-purity-initiative.md',
          status: 'Accepted / In Progress',
        },
        {
          id: 'RFC-001',
          title: 'Migrate SSR DOM from JSDOM to LinkeDOM',
          url: 'https://github.com/sandikodev/aureliajs/blob/main/.github/issues/03-rfc-migrate-ssr-dom-from-jsdom-to-linkedom.md',
          status: 'Implemented',
        },
        {
          id: 'RFC-002',
          title: 'Eliminate React CSS Utilities (CVA, CLSX) in Web App',
          url: 'https://github.com/sandikodev/aureliajs/blob/main/.github/issues/02-rfc-eliminate-react-css-utilities-in-web.md',
          status: 'Implemented',
        },
        {
          id: 'RFC-003',
          title: 'Master Architectural Manifesto: Aurelia 2 + Hono',
          url: 'https://github.com/sandikodev/aureliajs/blob/main/docs/AURELIA_HONO_MASTER_MANIFESTO.md',
          status: 'Active Standard',
        },
      ],
      endpoints: [
        {
          name: 'Edge SSR Reference Application',
          url: 'https://aurelia-hono-ssr.sandiko.workers.dev',
          method: 'GET',
          description: 'Live Hono + Aurelia 2 SSR application running on Cloudflare Workers and D1 database',
        },
        {
          name: 'Edge Telemetry Dashboard',
          url: 'https://aurelia-hono-ssr.sandiko.workers.dev/dashboard',
          method: 'GET',
          description: 'Session-authenticated real-time production telemetry dashboard',
        },
        {
          name: 'Featured Posts API',
          url: 'https://aurelia-hono-ssr.sandiko.workers.dev/api/posts',
          method: 'GET',
          description: 'JSON REST endpoint for engineering publications',
        },
        {
          name: 'Production SaaS Admin Dashboard',
          url: 'https://aureliajs.vercel.app',
          method: 'GET',
          description: 'Live production multi-tenant SaaS application on Vercel Edge',
        },
        {
          name: 'Production Health Probe',
          url: 'https://aureliajs.vercel.app/api/health',
          method: 'GET',
          description: 'Edge API availability health probe',
        },
        {
          name: 'Neon PostgreSQL Projects API',
          url: 'https://aureliajs.vercel.app/api/projects',
          method: 'GET',
          description: 'Enterprise projects querying endpoint backed by Neon PostgreSQL',
        },
      ],
      contact: {
        name: 'Sandiko Dev',
        url: 'https://github.com/sandikodev',
      },
    },
    200,
    {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    }
  );
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
      head: [
        '<meta name="description" content="Production-ready Canonical Hono + Aurelia 2 SSR Reference Architecture running on Cloudflare Workers edge runtime with D1 persistence." />',
        '<meta name="theme-color" content="#08090d" />',
        '<link rel="icon" type="image/svg+xml" href="/favicon.ico" />',
        '<link rel="canonical" href="https://aurelia-hono-ssr.sandiko.workers.dev/" />',
        '<link rel="ard" type="application/json" href="/.well-known/ard.json" />',
        '<meta property="og:type" content="website" />',
        '<meta property="og:site_name" content="Aurelia 2 SSR" />',
        '<meta property="og:title" content="Hono + Aurelia 2 SSR Reference Architecture" />',
        '<meta property="og:description" content="Production-ready Canonical Hono + Aurelia 2 SSR Reference Architecture running on Cloudflare Workers edge runtime with D1 persistence." />',
        '<meta property="og:url" content="https://aurelia-hono-ssr.sandiko.workers.dev/" />',
      ].join('\n    '),
    },
    streaming: true,
    dataEndpoint: true,
  })
);

// Idiomatic Hono session resolution middleware. The token comes from the
// Worker's TELEMETRY_TOKEN secret — never from source or a public link.
app.use('*', async (c, next) => {
  const configured = (c.env as { TELEMETRY_TOKEN?: string } | undefined)?.TELEMETRY_TOKEN;
  const token =
    c.req.query('token') || c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
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
