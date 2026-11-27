# `@hono/aurelia`

**Thin, Web-Standards / Edge-Safe Aurelia 2 SSR & Server Actions Adapter for Hono.**

[![Hono](https://img.shields.io/badge/Hono-4.x-E36002)](https://hono.dev)
[![Aurelia 2](https://img.shields.io/badge/Aurelia-v2.0.0--rc.2-ED2B88)](https://aurelia.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Community Note:** `@hono/aurelia` is an independent community adapter maintained by **Sandikodev ([@sandikodev](https://github.com/sandikodev))**. It follows the idiomatic Hono renderer philosophy (similar to `@hono/react-renderer`): stay thin, rely strictly on Web Standards, and let Hono handle HTTP concerns.

---

## 1. Scope & Strict Boundaries

### What `@hono/aurelia` OWNS
- Translating Hono HTTP routes into Aurelia 2 SSR responses via `aurelia()`.
- Dispatching form / JSON mutations (`POST`, `PUT`, `PATCH`, `DELETE`) to co-located or standalone action maps via `aureliaAction()`.
- Request-scoped default options via `aureliaDefaults()` backed by `WeakMap<Request, ...>`.
- True incremental HTTP streaming using standard Web Streams (`ReadableStream` + `TextEncoder`).
- Opt-in content negotiation (`Accept: application/json`) when `dataEndpoint: true`.
- Client hydration runtime entrypoint via `@hono/aurelia/client` with zero server-adapter or Hono leakage into browser bundles.
- End-to-end TypeScript generics across Hono `Env`, component `ComponentProps<TComponent>`, and loader `TData`.

### What `@hono/aurelia` Explicitly DOES NOT OWN
- **Authentication & Authorization**: Use composable Hono middleware (`createMiddleware`) before `aurelia(...)` — never `requiresAuth` flags hidden inside a view renderer.
- **Static Asset Serving**: Use official `@hono/node-server/serve-static`, `hono/bun`, or `hono/cloudflare-workers` — `@hono/aurelia` has **zero `node:fs` / `node:path` imports**.
- **Global Mutable Singletons**: No `setAureliaDefaults()` global state; everything is scoped to the HTTP `Request` lifecycle.

---

## 2. How It Works Internally

1. **Zero `c.var` Pollution (`WeakMap<Request>`)**:
   `aureliaDefaults()` attaches shared configuration (`document`, `streaming`, `dataEndpoint`, `context`, `timeout`, `onError`) to `c.req.raw` in a module-private `WeakMap<Request, unknown>`. Garbage collection automatically reclaims it when the request ends, without touching Hono's typed `c.var` namespace.
2. **Real Web Streams Streaming (`streaming: true`)**:
   Instead of rendering the entire page and slicing a string afterward, `aurelia()` creates a `ReadableStream<Uint8Array>`:
   - Enqueues `shell.preamble` (`<!DOCTYPE html>...<head>...<app-root>`) **immediately** so the browser begins downloading CSS and JS modules while SSR runs.
   - Awaits `renderAurelia()` and streams the rendered HTML body.
   - Streams the XSS-safe `<script id="__AURELIA_SSR_DATA__" type="application/json">` payload and `shell.postamble` (`</app-root>...</html>`).
3. **Short-Circuit `Response` Support in Loaders**:
   If a `loader(c)` returns a standard `Response` (for example `c.redirect('/login')` or `c.notFound()`), `aurelia()` immediately returns that `Response` without starting an Aurelia render container.
4. **Explicit Error Propagation**:
   By default (`fallback: 'throw'`), render/loader errors call your optional `onError(error, c)` hook or bubble straight to Hono's `app.onError()`. Passing `fallback: 'spa'` explicitly opts into an empty `<app-root>` shell with client hydration payload.

---

## 3. Installation

```bash
bun add @hono/aurelia aurelia hono
```

---

## 4. Usage

### Basic Setup with Scoped Defaults, Auth Middleware & Streaming SSR

```ts
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { aurelia, aureliaAction, aureliaRenderer } from '@hono/aurelia';
import { HomePage } from './pages/home.aux';
import { PostDetailPage } from './pages/post-detail.aux';
import { DashboardPage } from './pages/dashboard.aux';

type AppEnv = {
  Variables: {
    user: { id: string; email: string } | null;
  };
};

const app = new Hono<AppEnv>();

// 1. Zero-boilerplate renderer middleware:
// Automatically configures standard conventions (/style.css, /client.js, WeakMap<Request>)
// and enables idiomatic `c.render(Component)` support.
app.use('*', aureliaRenderer());

// Optional: pass overrides if you have custom asset paths or options
// app.use('*', aureliaRenderer({
//   document: { cssBundle: '/custom.css' },
//   streaming: true,
//   context: (c) => ({ user: c.get('user') }),
// }));

// 2. Composable Hono auth guard (decoupled from view rendering)
const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user')) return c.json({ error: 'Unauthorized' }, 401);
  await next();
});

// 3. Shorthand routes (automatically consume static `loader`, `title`, `status`, `actions` on the component)
app.get('/', aurelia(HomePage));
app.get('/posts/:slug', aurelia(PostDetailPage));
app.post('/posts/:slug', aureliaAction(PostDetailPage));
app.get('/dashboard', requireAuth, aurelia(DashboardPage));

// 4. Idiomatic c.render() also works directly:
app.get('/render-demo', (c) => c.render(HomePage, { title: 'Direct Render' }));

// 4. Explicit strongly-typed route configuration
app.get(
  '/users/:id',
  aurelia({
    component: ProfilePage,
    loader: async (c) => {
      const [user, stats] = await Promise.all([
        fetchUser(c.req.param('id')),
        fetchStats(c.req.param('id')),
      ]);
      if (!user) return c.redirect('/404'); // Short-circuits SSR
      return { user, stats };
    },
    title: ({ data }) => `${data.user.name} — Profile`,
    status: ({ data }) => (data.user ? 200 : 404),
  })
);

export default app;
```

### Client Hydration Entrypoint

Pair your Hono server with `@hono/aurelia/client` in your browser entry file:

```ts
import { createClientHydrator } from '@hono/aurelia/client';
import { HomePage } from './pages/home.aux';
import { PostDetailPage } from './pages/post-detail.aux';
import { DashboardPage } from './pages/dashboard.aux';

await createClientHydrator({
  components: [HomePage, PostDetailPage, DashboardPage],
});
```

---

## 5. Public API Reference

| Export | Signature | Description |
| :--- | :--- | :--- |
| `aurelia` | `aurelia<E, TComponent, TData>(component \| config): Handler<E>` | Creates a Hono route handler that runs `loader`, renders via `@aureliajs/ssr`, and returns streaming or buffered HTML5 (or JSON if `dataEndpoint: true`). |
| `aureliaAction` | `aureliaAction<E>(source, options?): Handler<E>` | Dispatches HTTP mutations to a component's static `actions` map or standalone `AureliaActionMap<E>` by `?_action=name` or form field `_action`. |
| `aureliaDefaults` | `aureliaDefaults<E>(defaults): MiddlewareHandler<E>` | Registers request-scoped defaults via `WeakMap<Request>`. |

Subpath exports: `.`, `./server` (identical server primitives), `./client` (hydration runtime), and `./build` (client/Worker bundlers).

---

## 6. Deployment & Live Example

The reference implementation in [`example/`](./example/README.md) is deployed
to Cloudflare Workers as **`aurelia-hono-ssr`** and served from
**https://aurelia-hono-ssr.sandiko.workers.dev** (redeployed 23 November 2026).

Deployment is intentionally a two-step build:

```bash
cd packages/hono-aurelia/example
bun run build           # client bundle + typecheck
bun run build:worker    # → dist/worker.js
bun run deploy:worker   # wrangler deploy (build also runs via wrangler.toml)
```

`buildWorker()` from `@hono/aurelia/build` uses `Bun.build` with a `jsdom` stub
so the LinkeDOM SSR path is active in `workerd`, defines `WORKER=true`, and
leaves `@hono/aurelia` itself free of `node:*` imports. The example uses a Hono
`staticAssets()` middleware: the `ASSETS` binding serves `./public` on Workers,
while `import.meta.url` is only resolved for the local Bun filesystem fallback.

The adapter stays platform-neutral: Vercel, Bun/Node servers and containers are
equally valid targets; the Worker deployment above is proof of the edge path,
not a framework requirement. See the
[example deployment guide](./example/README.md#deployment) for commands,
bindings and live smoke tests.

---

## 7. Known Limitations & Open Areas for Community Improvement

1. **Streaming Error Handling After Preamble Flush**: Once `shell.preamble` is flushed in `streaming: true` mode, HTTP status code `200` is already committed to the wire (a fundamental property of HTTP/1.1 & HTTP/2 streaming). Contributors interested in out-of-order streaming error boundaries or trailer headers are welcome to propose RFCs.
2. **Edge Runtime Compatibility**: `@hono/aurelia` itself is 100% Web-Standards and Edge-safe (zero `node:*` imports). Cloudflare Workers execution is proven by the live example via `buildWorker()` with the LinkeDOM path; broader parity (e.g. Deno Deploy and environments without a Worker-style asset binding) still depends on `@aureliajs/ssr` DOM-backend work.
3. **CSRF & Progressive Form Enhancement**: `aureliaAction()` checks `Origin` and `Sec-Fetch-Site` for mutations by default and sends a `303` PRG redirect when a plain HTML form posts without JavaScript. Enhanced submissions go through `<form au-enhance>` from `@hono/aurelia/client`. A stricter trust model can still be layered with `hono/csrf` or `csrf: { trustedOrigins, requireOriginOnForms }`.

---

## 8. Testing

```bash
cd packages/hono-aurelia
bun run build
bun test
```
