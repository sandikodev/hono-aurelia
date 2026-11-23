-- Initial seed data for Aurelia 2 SSR + Hono D1 database

INSERT OR IGNORE INTO posts (id, slug, title, category, excerpt, content, author, date, read_time, claps)
VALUES
(
  1,
  'hono-aurelia-architecture',
  'Hono + Aurelia 2 SSR Architecture',
  'Architecture',
  'Deep-dive into executing isolated virtual DOM scopes per request in Node and edge runtimes.',
  '<p class="article-lead">Server-Side Rendering (SSR) in Aurelia 2 delivers pre-rendered HTML straight from the server, eliminating First Contentful Paint (FCP) latency and guaranteeing 100% SEO indexing.</p><h2>The Virtual-DOM Serialization Bottleneck</h2><p>Modern frontend meta-frameworks relying on Virtual-DOM architectures (such as React Server Components) face a fundamental architectural penalty: they must serialize complex fiber component graphs over the network via proprietary flight protocols. This introduces significant serialization latency, heavy hydration runtime overhead (~45 KB+ baseline bundle), and artificial <code>''use client''</code> vs <code>''use server''</code> boundary friction.</p><div class="callout callout-info"><div class="callout-header"><span class="callout-icon">⚡</span><strong>Aurelia 2 Direct Native DOM Execution</strong></div><p>Aurelia 2 operates directly against standard W3C DOM elements and light-DOM slot projections (<code>&lt;au-slot&gt;</code>). On the server, LinkeDOM boots in microseconds without heavyweight JSDOM dependencies.</p></div><h2>Key Performance Benchmarks</h2><ul class="article-list"><li><strong>Sub-2ms TTFB:</strong> HTML preamble headers are flushed to the wire via native Web Streams before heavy body rendering completes.</li><li><strong>0 KB Virtual-DOM Overhead:</strong> The client browser downloads only the compiled ViewModel and Aurelia runtime—no fiber reconciler or shadow trees.</li><li><strong>Zero FOUC (Flash of Unstyled Content):</strong> Real HTML and CSS critical stylesheets are delivered synchronously in the initial TCP packet.</li></ul>',
  'Sandikodev',
  'Nov 14, 2026',
  '4 min read',
  128
),
(
  2,
  'zero-fouc-real-dom',
  'Zero-FOUC Real DOM Server Rendering',
  'Frontend Engineering',
  'Eliminating the Flash of Unstyled Content using request-scoped BrowserPlatform synchronization.',
  '<p class="article-lead">A notorious pitfall in modern single-page applications is FOUC (Flash of Unstyled Content) during initial layout rendering, causing layout shifts and jarring flashes of blank components.</p><h2>Request-Scoped BrowserPlatform Synchronization</h2><p>In Aurelia 2 SSR, the complete HTML document shell is assembled synchronously on the server. CSS stylesheets, font preload links, and critical DOM bindings are embedded into the initial response stream before the browser paints the first frame.</p><div class="callout callout-success"><div class="callout-header"><span class="callout-icon">🛡️</span><strong>Guaranteed Zero Cumulative Layout Shift (CLS: 0.00)</strong></div><p>Because standard DOM layout tags are rendered directly on the server rather than injected asynchronously by client scripts, the browser paints the final layout on the very first frame.</p></div><h2>Eliminating Global Singleton State</h2><p>To ensure absolute thread and request safety, <code>@hono/aurelia</code> isolates each request''s DOM context using a dedicated <code>BrowserPlatform</code> instance. No shared globals, no memory leaks between concurrent requests, and zero cross-tenant data leakage.</p>',
  'Sandikodev',
  'Nov 13, 2026',
  '3 min read',
  94
),
(
  3,
  'state-hydration',
  'State Hydration Without Duplicate Fetching',
  'Data Transfer',
  'Serializing server loaders into window.__HYDRATION__ to prevent redundant client network calls.',
  '<p class="article-lead">When a page renders on the server, data loaders resolve database queries, cache lookups, and microservice RPCs. If the client application blindly refetches the exact same data upon mounting, significant server resources and bandwidth are wasted.</p><h2>Secure JSON Serialization via &lt;script type="application/json"&gt;</h2><p>In <code>@hono/aurelia</code>, loader results are automatically serialized into an inert, XSS-safe JSON script block.</p><div class="callout callout-info"><div class="callout-header"><span class="callout-icon">💡</span><strong>Instant Client Hydration</strong></div><p>When <code>createClientHydrator()</code> initializes on the client, it reads this JSON block synchronously, restoring ViewModel state without a single extra HTTP fetch.</p></div>',
  'Sandikodev',
  'Nov 12, 2026',
  '5 min read',
  156
);

INSERT OR IGNORE INTO comments (id, post_slug, author, text, date)
VALUES
(1, 'hono-aurelia-architecture', 'Alex Chen', 'Incredible performance compared to Next.js fiber reconciliation!', '2 hours ago'),
(2, 'hono-aurelia-architecture', 'Sarah Connor', 'The request-scoped JSDOM isolation is clean and safe.', '30 minutes ago'),
(3, 'zero-fouc-real-dom', 'Marcus Aurelius', 'Native DOM standards make styling predictable and clean.', 'Yesterday');

INSERT OR REPLACE INTO telemetry_stats (id, title, views, engagement)
VALUES (1, 'Production Metrics', 14250, 94);

INSERT OR IGNORE INTO telemetry_activity (id, type, action, timestamp)
VALUES
(1, 'post', 'Published new SSR architecture guide', '10 minutes ago'),
(2, 'like', 'Received 12 claps on Zero-FOUC article', '1 hour ago'),
(3, 'comment', 'New comment from Alex Chen verified', '2 hours ago'),
(4, 'post', 'Submodule gitlink synchronized across monorepo', '4 hours ago');
