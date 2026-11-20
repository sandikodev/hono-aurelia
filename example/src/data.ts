/**
 * Shared in-memory data store for the Fullstack Aurelia 2 SSR + Hono reference app.
 */

export interface Comment {
  id: number;
  author: string;
  text: string;
  date: string;
}

export interface Post {
  id: number;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  content: string;
  author: string;
  date: string;
  readTime: string;
  claps: number;
  comments: Comment[];
}

export interface DashboardStats {
  title: string;
  views: number;
  posts: number;
  engagement: number;
}

export interface ActivityItem {
  id: number;
  type: 'post' | 'like' | 'comment';
  action: string;
  timestamp: string;
}

export const initialPosts: Post[] = [
  {
    id: 1,
    title: 'Hono + Aurelia 2 SSR Architecture',
    slug: 'hono-aurelia-architecture',
    category: 'Architecture',
    excerpt: 'Deep-dive into executing isolated virtual DOM scopes per request in Node and edge runtimes.',
    content: `<p class="article-lead">
Server-Side Rendering (SSR) in Aurelia 2 delivers pre-rendered HTML straight from the server, eliminating First Contentful Paint (FCP) latency and guaranteeing 100% SEO indexing.
</p>

<h2>The Virtual-DOM Serialization Bottleneck</h2>
<p>
Modern frontend meta-frameworks relying on Virtual-DOM architectures (such as React Server Components) face a fundamental architectural penalty: they must serialize complex fiber component graphs over the network via proprietary flight protocols. This introduces significant serialization latency, heavy hydration runtime overhead (~45 KB+ baseline bundle), and artificial <code>'use client'</code> vs <code>'use server'</code> boundary friction.
</p>

<div class="callout callout-info">
  <div class="callout-header">
    <span class="callout-icon">⚡</span>
    <strong>Aurelia 2 Direct Native DOM Execution</strong>
  </div>
  <p>
    Aurelia 2 operates directly against standard W3C DOM elements and light-DOM slot projections (<code>&lt;au-slot&gt;</code>). On the server, LinkeDOM boots in microseconds without heavyweight JSDOM dependencies.
  </p>
</div>

<h2>Idiomatic Hono Route &amp; Action Composition</h2>
<p>
By pairing Aurelia 2 with Hono's ultra-lightweight Web Standards HTTP engine, declaring a fullstack server-rendered route becomes a clean, declarative one-liner:
</p>

<div class="code-box">
  <div class="code-box-header">
    <span class="code-box-dot red"></span>
    <span class="code-box-dot yellow"></span>
    <span class="code-box-dot green"></span>
    <span class="code-box-title">src/index.ts</span>
  </div>
  <pre><code>// Declarative SSR route &amp; co-located Server Action dispatch
app.get('/posts/:slug', aurelia(PostDetailPage));
app.post('/posts/:slug', aureliaAction(PostDetailPage));</code></pre>
</div>

<h2>Key Performance Benchmarks</h2>
<p>
Running under Bun 1.4+ and Cloudflare Workers (workerd isolate), this architecture achieves:
</p>
<ul class="article-list">
  <li><strong>Sub-2ms TTFB:</strong> HTML preamble headers are flushed to the wire via native Web Streams before heavy body rendering completes.</li>
  <li><strong>0 KB Virtual-DOM Overhead:</strong> The client browser downloads only the compiled ViewModel and Aurelia runtime—no fiber reconciler or shadow trees.</li>
  <li><strong>Zero FOUC (Flash of Unstyled Content):</strong> Real HTML and CSS critical stylesheets are delivered synchronously in the initial TCP packet.</li>
</ul>`,
    author: 'Sandikodev',
    date: 'Nov 14, 2026',
    readTime: '4 min read',
    claps: 128,
    comments: [
      { id: 1, author: 'Alex Chen', text: 'Incredible performance compared to Next.js fiber reconciliation!', date: '2 hours ago' },
      { id: 2, author: 'Sarah Connor', text: 'The request-scoped JSDOM isolation is clean and safe.', date: '30 minutes ago' },
    ],
  },
  {
    id: 2,
    title: 'Zero-FOUC Real DOM Server Rendering',
    slug: 'zero-fouc-real-dom',
    category: 'Frontend Engineering',
    excerpt: 'Eliminating the Flash of Unstyled Content using request-scoped BrowserPlatform synchronization.',
    content: `<p class="article-lead">
A notorious pitfall in modern single-page applications is FOUC (Flash of Unstyled Content) during initial layout rendering, causing layout shifts and jarring flashes of blank components.
</p>

<h2>Request-Scoped BrowserPlatform Synchronization</h2>
<p>
In Aurelia 2 SSR, the complete HTML document shell is assembled synchronously on the server. CSS stylesheets, font preload links, and critical DOM bindings are embedded into the initial response stream before the browser paints the first frame.
</p>

<div class="callout callout-success">
  <div class="callout-header">
    <span class="callout-icon">🛡️</span>
    <strong>Guaranteed Zero Cumulative Layout Shift (CLS: 0.00)</strong>
  </div>
  <p>
    Because standard DOM layout tags are rendered directly on the server rather than injected asynchronously by client scripts, the browser paints the final layout on the very first frame.
  </p>
</div>

<h2>Eliminating Global Singleton State</h2>
<p>
To ensure absolute thread and request safety, <code>@hono/aurelia</code> isolates each request's DOM context using a dedicated <code>BrowserPlatform</code> instance. No shared globals, no memory leaks between concurrent requests, and zero cross-tenant data leakage.
</p>`,
    author: 'Sandikodev',
    date: 'Nov 13, 2026',
    readTime: '3 min read',
    claps: 94,
    comments: [
      { id: 1, author: 'Marcus Aurelius', text: 'Native DOM standards make styling predictable and clean.', date: 'Yesterday' },
    ],
  },
  {
    id: 3,
    title: 'State Hydration Without Duplicate Fetching',
    slug: 'state-hydration',
    category: 'Data Transfer',
    excerpt: 'Serializing server loaders into window.__HYDRATION__ to prevent redundant client network calls.',
    content: `<p class="article-lead">
When a page renders on the server, data loaders resolve database queries, cache lookups, and microservice RPCs. If the client application blindly refetches the exact same data upon mounting, significant server resources and bandwidth are wasted.
</p>

<h2>Secure JSON Serialization via &lt;script type="application/json"&gt;</h2>
<p>
In <code>@hono/aurelia</code>, loader results are automatically serialized into an inert, XSS-safe JSON script block:
</p>

<div class="code-box">
  <div class="code-box-header">
    <span class="code-box-dot red"></span>
    <span class="code-box-dot yellow"></span>
    <span class="code-box-dot green"></span>
    <span class="code-box-title">HTML Preamble</span>
  </div>
  <pre><code>&lt;script id="__AURELIA_SSR_DATA__" type="application/json"&gt;
  {"component":"post-detail-page","initialData":{"post":{...}}}
&lt;/script&gt;</code></pre>
</div>

<div class="callout callout-info">
  <div class="callout-header">
    <span class="callout-icon">💡</span>
    <strong>Instant Client Hydration</strong>
  </div>
  <p>
    When <code>createClientHydrator()</code> initializes on the client, it reads this JSON block synchronously, restoring ViewModel state without a single extra HTTP fetch.
  </p>
</div>`,
    author: 'Sandikodev',
    date: 'Nov 12, 2026',
    readTime: '5 min read',
    claps: 156,
    comments: [],
  },
];

export const dashboardStats: DashboardStats = {
  title: 'Production Metrics',
  views: 14250,
  posts: 3,
  engagement: 94,
};

export const activityStream: ActivityItem[] = [
  { id: 1, type: 'post', action: 'Published new SSR architecture guide', timestamp: '10 minutes ago' },
  { id: 2, type: 'like', action: 'Received 12 claps on Zero-FOUC article', timestamp: '1 hour ago' },
  { id: 3, type: 'comment', action: 'New comment from Alex Chen verified', timestamp: '2 hours ago' },
  { id: 4, type: 'post', action: 'Submodule gitlink synchronized across monorepo', timestamp: '4 hours ago' },
];
