# `@hono/aurelia`

**Thin, Web-Standards / Edge-Safe Aurelia 2 SSR & Action Adapter for Hono.**

[![Hono](https://img.shields.io/badge/Hono-4.x-E36002)](https://hono.dev)
[![Aurelia 2](https://img.shields.io/badge/Aurelia-v2.0.0--rc.2-ED2B88)](https://aurelia.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Design Principles

- **Zero `node:*` imports**: Built strictly on Web Standards (`Request`, `Response`, `ReadableStream`, `TextEncoder`, `WeakMap<Request>`).
- **Composable Hono Idioms**: Authentication, caching, static asset serving (`serveStatic`), and global error handling (`app.onError`) stay in standard Hono middleware — never duplicated inside the view adapter.
- **True Streaming SSR**: When `streaming: true`, flushes `<head>` (`shell.preamble`) immediately over a Web `ReadableStream` before awaiting `renderAurelia()`.
- **Request-Scoped Defaults**: `aureliaDefaults()` stores configuration in a `WeakMap<Request, ...>` without mutating `c.var` or global singletons.
- **Strictly Typed Generics**: End-to-end type inference across Hono `Env`, Aurelia component `ComponentProps<TComponent>`, and loader `TData`.

---

## Installation

```bash
pnpm add @hono/aurelia @aureliajs/ssr aurelia hono
```

---

## Usage

### 1. Server Routes (`aurelia`, `aureliaAction`, `aureliaDefaults`)

```ts
import { Hono } from 'hono';
import { aurelia, aureliaAction, aureliaDefaults } from '@hono/aurelia';
import { HomePage } from './pages/home.aux';
import { PostDetailPage } from './pages/post-detail.aux';

const app = new Hono();

app.use(
  '*',
  aureliaDefaults({
    document: {
      cssBundle: '/public/style.css',
      jsBundle: '/public/client.js',
    },
    streaming: true,
    dataEndpoint: true, // Opt-in: Accept: application/json returns hydration payload
  })
);

// Shorthand: consumes co-located static `loader`, `actions`, `title` on the component
app.get('/', aurelia(HomePage));
app.get('/posts/:slug', aurelia(PostDetailPage));
app.post('/posts/:slug', aureliaAction(PostDetailPage));

// Explicit typed options form
app.get(
  '/profile/:id',
  aurelia({
    component: ProfilePage,
    loader: async (c) => ({ userId: c.req.param('id') }),
    title: ({ data }) => `Profile ${data.userId}`,
    status: ({ data }) => (data.userId ? 200 : 404),
  })
);

export default app;
```

### 2. Client-Side Hydration (`@hono/aurelia/client`)

```ts
import { createClientHydrator } from '@hono/aurelia/client';
import { HomePage } from './pages/home.aux';
import { PostDetailPage } from './pages/post-detail.aux';

const hydrate = createClientHydrator({
  'home-page': HomePage,
  'post-detail-page': PostDetailPage,
});

await hydrate();
```

---

## Core API

- `aurelia<E, TComponent, TData>(componentOrOptions)` — Creates a typed Hono `Handler<E>` that executes `loader(c)`, renders via `@aureliajs/ssr`, and returns a streaming or buffered HTML5 response (or JSON when `dataEndpoint: true` and `Accept: application/json`).
- `aureliaAction<E>(source)` — Dispatches `POST`/`PUT`/`PATCH`/`DELETE` form or JSON mutations to co-located `actions` handlers (`?_action=name` or form field `_action`).
- `aureliaDefaults<E>(defaults)` — Request-scoped Hono middleware supplying shared `document`, `streaming`, `dataEndpoint`, `context`, `timeout`, and `onError` defaults via `WeakMap<Request>`.
- `@hono/aurelia/client` — Browser-safe re-export of `@aureliajs/ssr/client` hydration utilities.
