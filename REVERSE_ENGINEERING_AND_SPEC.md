# @hono/aurelia-ssr: Reverse Engineering Analysis & Architectural Specification

**Document Version:** 2.0.0  
**Status:** Living Engineering Blueprint & Community RFC Candidate  
**Target Communities:** Honojs (`honojs/middleware`) & Aurelia (`aurelia/aurelia`)  
**Reference Implementations Analyzed:**  
1. `iflamed/hono-react-ssr-shadcn-ui` (React SSR + Hono + Vite + Cloudflare/Node pattern)
2. `Vheissu/aurelia2-plugins` (`packages/aurelia2-ssr` by Aurelia Core Member Dwayne Charrington)
3. `@hono/react-renderer` & Hono Core (`hono/jsx`)

---

## 1. Executive Summary & Problem Statement

### 1.1 The Problem in Existing Approaches
In early iterations of `@hono/aurelia-ssr`, rendering was handled via a naive placeholder string replacement:
```typescript
// ANTI-PATTERN (Current placeholder in render.ts)
html = html.replace(/\{\{([^}]+)\}\}/g, (_match, prop) => {
  return String(getPropertyValue(instance, prop.trim()) ?? '');
});
```
This workaround fails to provide real Aurelia 2 capabilities:
- **No real Aurelia custom elements** (`<ui-button>`, `<ui-card>`, etc. are ignored).
- **No template binding expressions** (`${expr}`, `repeat.for`, `if.bind`, `value.two-way`).
- **No Dependency Injection resolution** (`resolve(AuthService)` fails without a container).
- **No lifecycle execution** (`binding`, `bound`, `attaching`, `attached`).

### 1.2 The Goal
Build a **production-grade, zero-workaround SSR integration** for Aurelia 2 on Hono that:
1. Boots real Aurelia 2 components in an isolated, request-scoped server DOM environment.
2. Provides seamless Hono route middleware (`app.get('/route', aurelia({...}))`).
3. Emits clean, pre-rendered semantic HTML with zero hydration flash (FOUC).
4. Ships a robust client hydration bridge that reuses server state without duplicate network calls.
5. Serves as the official candidate to submit to Hono and Aurelia communities.

---

## 2. Reverse Engineering Analysis

### 2.1 Stack 1: Hono Middleware & Rendering Pipeline (`hono-react-ssr-shadcn-ui`)

#### Core Finding: The `c.setRenderer()` & `c.render()` Contract
In `hono-react-ssr-shadcn-ui`, Hono does not hardcode HTML rendering. Instead, it uses Hono's custom renderer pattern:

```typescript
// src/server/renderer.tsx
import { reactRenderer } from "@hono/react-renderer";
import Document from "./document";

export const Renderer = reactRenderer(Document, {
  docType: true,
});
```

#### How Hono Content Negotiation Works
1. When a browser visits a page (`Accept: text/html,application/xhtml+xml...`), Hono executes the SSR renderer and responds with full HTML.
2. When client-side routing or an API client requests data (`Accept: application/json`), the middleware can bypass HTML rendering and return raw loader JSON.
3. In `src/server/document.tsx`, the server injects the serialized state directly into the HTML:
   ```html
   <script>window._hono_view = ${serializeInlineJson(view)};</script>
   ```
4. In `src/client/hydrate.tsx`, the client picks up `window._hono_view` to hydrate the DOM:
   ```typescript
   const view = window._hono_view;
   const Page = await loadView(view.name);
   hydrateRoot(document.getElementById("app")!, <ClientShell view={view}><Page {...view.props} /></ClientShell>);
   ```

---

### 2.2 Stack 2: Real Aurelia 2 Server-Side Execution (`aurelia2-ssr`)

Dwayne Charrington (Aurelia 2 Core Team Member) solved Aurelia 2 SSR in `Vheissu/aurelia2-plugins/packages/aurelia2-ssr`.

#### Key Architectural Findings:

1. **Aurelia 2 is a Real-DOM Framework (Not Virtual DOM)**:
   React uses a virtual DOM tree (pure JS objects), which can easily execute in Node.js without a DOM.  
   Aurelia 2 compiles and binds directly to DOM nodes (`Node`, `Element`, `DocumentFragment`). Therefore, **server execution requires a per-request DOM simulation environment**.

2. **Per-Request Window Isolation (Preventing Global Pollution)**:
   Node.js has a shared global scope (`globalThis`). If request A sets `globalThis.window = dom.window`, and request B arrives simultaneously, request B will mutate or read request A's DOM and authentication state.  
   `aurelia2-ssr` solves this with a **Request-Scoped Window pattern**:
   ```typescript
   export async function render(url: string, window: Window) {
     const routerRegistrations = await createSsrRouterRegistrations({ path: url });
     return renderAureliaToString({
       window, // Isolated JSDOM / Happy-DOM window
       component: RootComponent,
       registrations: [
         RouterConfiguration.customize({ useUrlFragmentHash: false }),
         ...routerRegistrations,
         ...customRegistrations
       ],
       settle: 50 // Wait for microtasks and async bindings to settle
     });
   }
   ```

3. **Storage & Browser Shims**:
   Components often read `localStorage` or `matchMedia`. On the server, `aurelia2-ssr` provides memory-backed fallback shims so components do not throw runtime exceptions.

4. **Lifecycle Execution on Server**:
   During SSR, the component passes through:
   - `constructor` (Dependency Injection)
   - `binding` & `bound` (Data bindings connected)
   - `attaching` & `attached` (DOM tree assembled)
   - **Important:** `detaching` and `detached` run after HTML serialization during cleanup.

---

## 3. Target Architecture for `@hono/aurelia-ssr`

```
┌────────────────────────────────────────────────────────────────────────┐
│                              HTTP Request                              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Hono Route Handler                              │
│   app.get('/dashboard', aurelia({ component: DashboardPage, ... }))    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
       ┌────────────────────────────┴────────────────────────────┐
       ▼                                                         ▼
[Accept: application/json]                              [Accept: text/html]
       │                                                         │
Return Loader Data (JSON)                                        ▼
                                                ┌─────────────────────────────────┐
                                                │   1. Resolve Server Loaders     │
                                                │      (c.req, cookies, auth)     │
                                                └────────────────┬────────────────┘
                                                                 │
                                                                 ▼
                                                ┌─────────────────────────────────┐
                                                │   2. Isolate Request DOM        │
                                                │      (JSDOM / Happy-DOM Window) │
                                                └────────────────┬────────────────┘
                                                                 │
                                                                 ▼
                                                ┌─────────────────────────────────┐
                                                │   3. Boot Aurelia 2 Container   │
                                                │      - Register Global Custom El│
                                                │      - Inject Server Context    │
                                                │      - Mount Root Component     │
                                                │      - Await settle/microtasks  │
                                                └────────────────┬────────────────┘
                                                                 │
                                                                 ▼
                                                ┌─────────────────────────────────┐
                                                │   4. Extract HTML & State       │
                                                │      - dom.serialize()          │
                                                │      - Serialize Loader State   │
                                                │      - Inject Asset Manifest    │
                                                └────────────────┬────────────────┘
                                                                 │
                                                                 ▼
                                                ┌─────────────────────────────────┐
                                                │   5. Cleanup DOM & Emit HTML    │
                                                │      - Close virtual window     │
                                                │      - Return c.html(doc)       │
                                                └─────────────────────────────────┘
```

---

## 4. Module Specifications

### 4.1 Module: `engine.ts` (Real Aurelia Server Runner)
Replaces the naive regex replacement. Responsible for:
- Creating a child DI container per request.
- Registering `@aurelia/runtime-html` using the simulated window.
- Registering custom elements, value converters, and binding behaviors.
- Mounting the component to `<div id="app"></div>`.
- Awaiting lifecycle execution (`attached`) and microtask queue flushing.
- Extracting the rendered inner HTML.

### 4.2 Module: `environment.ts` (Request-Scoped DOM)
- Spawns a lightweight JSDOM or Happy-DOM instance per render.
- Injects standard Web API mocks: `matchMedia`, `localStorage` (memory store), `ResizeObserver`.
- Guarantees complete cleanup in a `finally` block to prevent Node.js memory leaks.

### 4.3 Module: `document.ts` (HTML Envelope)
Generates the outer HTML document:
```html
<!DOCTYPE html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    ${metaTags}
    ${stylesheetTags}
    ${modulePreloadTags}
    <!-- Serialized State for Client Hydration -->
    <script id="__AURELIA_STATE__">
      window.__AURELIA_STATE__ = ${serializedState};
    </script>
  </head>
  <body>
    <div id="app">${renderedAppHtml}</div>
    ${clientScriptTags}
  </body>
</html>
```

### 4.4 Module: `hydrate.ts` (Client Hydration)
- Client-side entry script.
- Reads `window.__AURELIA_STATE__`.
- Initializes Aurelia 2 on `#app`.
- Passes the preloaded state into the root component / DI services so **zero duplicate API calls** occur on load.

---

## 5. Specification for `examples/fullstack-ssr`

The example application at `/home/dev/project/aureliajs/examples/fullstack-ssr` will serve as the live proof-of-concept demonstrating:
1. **Server Routes**:
   - `GET /` -> Public Landing Page (SSR pre-rendered).
   - `GET /dashboard` -> Protected Dashboard (Server auth validation + SSR pre-rendered data).
2. **True Aurelia 2 Components**:
   - Class-based components with `@customElement({ name: '...', template })`.
   - Real templates with `${kpi.value}`, `repeat.for="item of items"`, `if.bind="hasAccess"`.
3. **Tailwind CSS / Shadcn Design System Tokens**:
   - Semantic color system (`bg-background`, `text-foreground`, `border-border`).
   - Unified dark/light mode SSR rendering without canvas flickering.
4. **Vite Production Bundling**:
   - SSR build: compiles server bundle (`entry-server.ts`).
   - Client build: compiles client bundle with manifest (`manifest.json`).

---

## 6. Community Proposal Strategy (Hono + Aurelia)

### 6.1 Proposal to Hono Community (`honojs/middleware`)
- **Pitch**: Hono currently officially supports React (`@hono/react-renderer`). Adding `@hono/aurelia-ssr` brings a clean, enterprise-grade MVVM framework into the Hono ecosystem.
- **Selling Points**:
  - Web-standards aligned.
  - Benchmarks showing competitive cold start and memory usage against React SSR.
  - Zero lock-in, idiomatic Hono middleware API (`app.use('*', aureliaRenderer(...))`).

### 6.2 Proposal to Aurelia Community (`aurelia/aurelia` / Discourse)
- **Pitch**: Aurelia 2 has world-class client performance, but developers are migrating to Next.js/Nuxt because Aurelia lacks an official fullstack SSR story.
- **Selling Points**:
  - Hono is the fastest-growing modern server framework (Cloudflare, Bun, Node, Deno).
  - Pairs Aurelia's clean TypeScript/HTML templates with Hono's ultra-fast edge runtime.
  - Reference implementation ready with production tests and documentation.

---

## 7. Action Plan

- [x] Clone and reverse engineer `iflamed/hono-react-ssr-shadcn-ui`.
- [x] Analyze `aurelia2-ssr` and request-scoped DOM execution patterns.
- [x] Author comprehensive Reverse Engineering & Architecture Specification.
- [ ] Implement `engine.ts` with real Aurelia 2 runtime rendering in `packages/hono-aurelia-ssr`.
- [ ] Update `examples/fullstack-ssr` to use real Aurelia 2 custom elements and Vite SSR pipeline.
- [ ] Add end-to-end integration tests verifying SSR HTML output, hydration fidelity, and state transfer.
- [ ] Prepare finalized RFC document for submission to maintainers.
