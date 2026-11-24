import { describe, it, expect } from 'bun:test';
import { DI } from 'aurelia';
import { app } from '../src/index';
import { initialPosts, dashboardStats, activityStream } from './fixtures';
import { createFakeD1 } from './fake-d1';
import { PostService } from '../src/services/post-service';
import { DashboardService } from '../src/services/dashboard-service';
import { HomePage } from '../src/pages/home';
import { PostDetailPage } from '../src/pages/post-detail';
import { DashboardPage } from '../src/pages/dashboard';

// The app has no built-in fixtures: tests inject explicit rows through a D1
// binding, exactly as Cloudflare Workers do in production.
const db = createFakeD1();
const request = (
  input: Request | string | URL,
  init?: RequestInit,
  env: Record<string, unknown> = {},
) => app.request(input, init, { DB: db, TELEMETRY_TOKEN: 'test-token', ...env });

describe('Canonical Hono + Aurelia 2 SSR Fullstack Reference Test Suite', () => {
  // =========================================================================
  // 1. Home Page (GET /) — Public SSR & Content Negotiation
  // =========================================================================
  describe('1. Home Page (GET /)', () => {
    it('renders complete HTML5 document with pre-rendered posts and metadata', async () => {
      const res = await request('http://localhost:3000/', {
        headers: { Accept: 'text/html' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');

      const html = await res.text();

      // HTML5 Shell & Document Structure
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('<head>');
      expect(html).toContain('<title>Hono + Aurelia 2 SSR - Engineering Blog</title>');
      expect(html).toContain('href="/style.css"');
      expect(html).toContain('src="/client.js"');

      // Navigation & Branding Preamble
      expect(html).toContain('Aurelia <span class="brand-accent">2</span>');
      expect(html).toContain('Hono SSR');
      expect(html).toContain('Edge SSR Active');
      expect(html).toContain('Overview');
      expect(html).toContain('Telemetry');
      expect(html).toContain('API (JSON)');

      // Hero Section
      expect(html).toContain('Enterprise Architecture meets');
      expect(html).toContain('Modern Edge Velocity');
      expect(html).toContain('Real native DOM server-side rendering powered by Hono and LinkeDOM.');

      // KPI Performance Bar
      expect(html).toContain('LinkeDOM SSR Render Time');
      expect(html).toContain('0 KB');
      expect(html).toContain('Client Virtual-DOM Overhead');
      expect(html).toContain('100%');
      expect(html).toContain('Safe Request Isolation');

      // Publications Section & Cards Grid
      expect(html).toContain('Featured Engineering Articles');
      expect(html).toContain(`${initialPosts.length} Publications`);
      expect(html).toContain('Hono + Aurelia 2 SSR Architecture');
      expect(html).toContain('Zero-FOUC Real DOM Server Rendering');
      expect(html).toContain('State Hydration Without Duplicate Fetching');

      // Category Chips with scoped CSS classes
      expect(html).toContain('category-chip is-arch');
      expect(html).toContain('category-chip is-fe');
      expect(html).toContain('category-chip is-data');

      // Hydration Payload Script Tag
      expect(html).toContain('id="__AURELIA_SSR_DATA__" type="application/json"');
      expect(html).not.toContain('window.__HYDRATION__ =');
    });

    it('serves JSON payload via HTTP Content Negotiation on the same route', async () => {
      const res = await request('http://localhost:3000/', {
        headers: { Accept: 'application/json' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const json = (await res.json()) as {
        component: string;
        title: string;
        initialData: { posts: typeof initialPosts };
      };

      expect(json.component).toBe('home-page');
      expect(json.title).toBe('Hono + Aurelia 2 SSR - Engineering Blog');
      expect(Array.isArray(json.initialData.posts)).toBe(true);
      expect(json.initialData.posts.length).toBe(initialPosts.length);
      expect(json.initialData.posts[0].slug).toBe('hono-aurelia-architecture');
    });

    it('validates HomePage component ViewModel methods and static loader', async () => {
      // Static metadata
      expect(HomePage.title).toBe('Hono + Aurelia 2 SSR - Engineering Blog');

      // Static loader
      const loaded = await HomePage.loader({ env: { DB: db } });
      expect(Array.isArray(loaded.posts)).toBe(true);
      expect(loaded.posts.length).toBeGreaterThan(0);

      // Category CSS mapper via DI container
      const container = DI.createContainer();
      const vm = container.get(HomePage);
      expect(vm.getCategoryClass('Architecture')).toBe('is-arch');
      expect(vm.getCategoryClass('Frontend Engineering')).toBe('is-fe');
      expect(vm.getCategoryClass('Data Transfer')).toBe('is-data');
      expect(vm.getCategoryClass('Unknown')).toBe('is-data');
      expect(vm.getCategoryClass(undefined)).toBe('is-data');
    });
  });

  // =========================================================================
  // 2. Post Detail Page (GET /posts/:slug) — Dynamic SSR & Fallbacks
  // =========================================================================
  describe('2. Post Detail Page (GET /posts/:slug)', () => {
    it('evaluates dynamic title and renders post detail SSR with full content', async () => {
      const res = await request('http://localhost:3000/posts/hono-aurelia-architecture', {
        headers: { Accept: 'text/html' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');

      const html = await res.text();

      // Dynamic Title
      expect(html).toContain('<title>Hono + Aurelia 2 SSR Architecture — Aurelia 2 SSR</title>');

      // Breadcrumb & Header
      expect(html).toContain('← Overview');
      expect(html).toContain('Architecture');
      expect(html).toContain('By <strong>');
      expect(html).toContain('Sandikodev</strong>');
      expect(html).toContain('Nov 14, 2026');
      expect(html).toContain('4 min read');

      // Rich Article Content
      expect(html).toContain('The Virtual-DOM Serialization Bottleneck');
      expect(html).toContain('Aurelia 2 Direct Native DOM Execution');
      expect(html).toContain('Idiomatic Hono Route &amp; Action Composition');
      expect(html).toContain('Sub-2ms TTFB:');

      // Interactions (Claps & Discussion)
      expect(html).toContain('Enjoyed this architectural write-up?');
      expect(html).toContain('Claps');
      expect(html).toContain('Discussion');
      expect(html).toContain('Responses');
      expect(html).toContain('Alex Chen');
      expect(html).toContain('Incredible performance compared to Next.js fiber reconciliation!');

      // Comment Form
      expect(html).toContain('Engineer Name or Handle:');
      expect(html).toContain('Comment Perspective:');
      expect(html).toContain('Post Perspective');

      // Hydration Script Payload
      expect(html).toContain('id="__AURELIA_SSR_DATA__" type="application/json"');
      expect(html).toContain('"slug":"hono-aurelia-architecture"');
    });

    it('renders secondary post (Zero-FOUC) correctly with zero layout shift claim', async () => {
      const res = await request('http://localhost:3000/posts/zero-fouc-real-dom', {
        headers: { Accept: 'text/html' },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('<title>Zero-FOUC Real DOM Server Rendering — Aurelia 2 SSR</title>');
      expect(html).toContain('Zero-FOUC Real DOM Server Rendering');
      expect(html).toContain('Frontend Engineering');
      expect(html).toContain('Guaranteed Zero Cumulative Layout Shift');
    });

    it('renders third post (State Hydration) with empty comments empty-state placeholder', async () => {
      const res = await request('http://localhost:3000/posts/state-hydration', {
        headers: { Accept: 'text/html' },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('<title>State Hydration Without Duplicate Fetching — Aurelia 2 SSR</title>');
      expect(html).toContain('State Hydration Without Duplicate Fetching');
      expect(html).toContain('No responses yet. Be the first engineer to share your thoughts!');
    });

    it('returns HTTP 404 status and renders graceful fallback UI for non-existent post', async () => {
      const res = await request('http://localhost:3000/posts/non-existent-article-slug', {
        headers: { Accept: 'text/html' },
      });

      expect(res.status).toBe(404);
      const html = await res.text();

      // Dynamic Title on 404
      expect(html).toContain('<title>Article Not Found</title>');

      // Fallback UI
      expect(html).toContain('Article Not Found');
      expect(html).toContain('The requested technical publication does not exist or has been relocated.');
      expect(html).toContain('Back to Publications Overview');
    });

    it('serves JSON payload for post detail via Content Negotiation', async () => {
      const res = await request('http://localhost:3000/posts/hono-aurelia-architecture', {
        headers: { Accept: 'application/json' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const json = (await res.json()) as {
        component: string;
        title: string;
        initialData: { post: { slug: string; title: string; claps: number } };
      };

      expect(json.component).toBe('post-detail-page');
      expect(json.title).toBe('Hono + Aurelia 2 SSR Architecture — Aurelia 2 SSR');
      expect(json.initialData.post.slug).toBe('hono-aurelia-architecture');
      expect(typeof json.initialData.post.claps).toBe('number');
    });

    it('serves 404 JSON response for non-existent post via Content Negotiation', async () => {
      const res = await request('http://localhost:3000/posts/non-existent-article-slug', {
        headers: { Accept: 'application/json' },
      });

      expect(res.status).toBe(404);
      const json = (await res.json()) as {
        component: string;
        title: string;
        initialData: { post: null };
      };

      expect(json.component).toBe('post-detail-page');
      expect(json.title).toBe('Article Not Found');
      expect(json.initialData.post).toBeNull();
    });

    it('validates PostDetailPage ViewModel static helpers', () => {
      // Dynamic Title
      expect(PostDetailPage.title({ post: { title: 'Custom Title' } as any })).toBe(
        'Custom Title — Aurelia 2 SSR'
      );
      expect(PostDetailPage.title({ post: null })).toBe('Article Not Found');
      expect(PostDetailPage.title({} as any)).toBe('Article Not Found');

      // Dynamic Status
      expect(PostDetailPage.status({ post: { id: 1 } as any })).toBe(200);
      expect(PostDetailPage.status({ post: null })).toBe(404);
      expect(PostDetailPage.status({} as any)).toBe(404);

      // Category CSS mappings via DI container
      const container = DI.createContainer();
      const vm = container.get(PostDetailPage);
      expect(vm.getCategoryClass('Architecture')).toBe('is-arch');
      expect(vm.getCategoryClass('Frontend Engineering')).toBe('is-fe');
      expect(vm.getCategoryClass('Data Transfer')).toBe('is-data');
    });
  });

  // =========================================================================
  // 3. Dashboard Page (GET /dashboard) — Protected Telemetry & Guards
  // =========================================================================
  describe('3. Dashboard Page (GET /dashboard)', () => {
    it('blocks unauthenticated access with HTTP 401 Unauthorized', async () => {
      const res = await request('http://localhost:3000/dashboard');
      expect(res.status).toBe(401);

      const json = (await res.json()) as { error: string; message: string };
      expect(json.error).toBe('Unauthorized');
      expect(json.message).toBe('Authentication required');
    });

    it('blocks access when an invalid token is provided', async () => {
      const res = await request('http://localhost:3000/dashboard?token=invalid-secret-key');
      expect(res.status).toBe(401);
    });

    it('blocks access when an invalid Authorization Bearer token is provided', async () => {
      const res = await request('http://localhost:3000/dashboard', {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      expect(res.status).toBe(401);
    });

    it('allows access and renders Telemetry Dashboard SSR when valid query token is passed', async () => {
      const res = await request('http://localhost:3000/dashboard?token=test-token', {
        headers: { Accept: 'text/html' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');

      const html = await res.text();

      // Title & Navigation
      expect(html).toContain('<title>Telemetry Dashboard - Aurelia 2 SSR</title>');
      expect(html).toContain('Telemetry Live');

      // Authenticated Identity Header
      expect(html).toContain('Session authenticated as');
      expect(html).toContain('Operator');
      expect(html).toContain('owner');
      expect(html).toContain('Guarded by Hono <code>requireAuth</code> middleware');

      // Telemetry KPI Cards & Meters
      expect(html).toContain('Monthly Impressions');
      expect(html).toContain(dashboardStats.views.toLocaleString());
      expect(html).toContain('Published Articles');
      expect(html).toContain(String(dashboardStats.posts));
      expect(html).toContain('Audience Engagement');
      expect(html).toContain(`${dashboardStats.engagement}%`);

      // Real-Time Audit Stream Trail
      expect(html).toContain('Real-Time Audit &amp; Deployment Trail');
      expect(html).toContain('Published new SSR architecture guide');
      expect(html).toContain('Received 12 claps on Zero-FOUC article');
      expect(html).toContain('Verified Edge Event');
      expect(html).toContain('Node/Bun Isolated Worker Scope');

      // Hydration Data
      expect(html).toContain('id="__AURELIA_SSR_DATA__" type="application/json"');
      expect(html).toContain('"component":"dashboard-page"');
    });

    it('allows access via Authorization: Bearer test-token header', async () => {
      const res = await request('http://localhost:3000/dashboard', {
        headers: {
          Authorization: 'Bearer test-token',
          Accept: 'text/html',
        },
      });

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('Telemetry Dashboard');
      expect(html).toContain('Operator');
    });

    it('serves Dashboard JSON payload via Content Negotiation when authenticated', async () => {
      const res = await request('http://localhost:3000/dashboard?token=test-token', {
        headers: { Accept: 'application/json' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const json = (await res.json()) as {
        component: string;
        title: string;
        initialData: {
          stats: typeof dashboardStats;
          activity: typeof activityStream;
          user: { name: string; email: string };
          role: string;
        };
      };

      expect(json.component).toBe('dashboard-page');
      expect(json.initialData.stats.views).toBe(dashboardStats.views);
      expect(json.initialData.activity.length).toBe(activityStream.length);
      expect(json.initialData.user.name).toBe('Operator');
      expect(json.initialData.role).toBe('owner');
    });

    it('validates DashboardPage ViewModel static helpers', () => {
      expect(DashboardPage.title).toBe('Telemetry Dashboard - Aurelia 2 SSR');
    });
  });

  // =========================================================================
  // 4. Server Actions (POST /posts/:slug) via aureliaAction
  // =========================================================================
  describe('4. Server Actions (POST /posts/:slug)', () => {
    it('dispatches "like" action, increments claps count and returns updated total', async () => {
      const targetSlug = 'hono-aurelia-architecture';
      const postBefore = initialPosts.find((p) => p.slug === targetSlug)!;
      const initialClaps = postBefore.claps;

      const res = await request(
        `http://localhost:3000/posts/${targetSlug}?_action=like`,
        {
          method: 'POST',
          headers: { Accept: 'application/json' },
        }
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; claps: number };
      expect(body.success).toBe(true);
      expect(body.claps).toBe(initialClaps + 1);

      // Verify the mutation is persisted in the datastore, not a fixture object.
      const after = await (
        await request('http://localhost:3000/api/posts', {
          headers: { Accept: 'application/json' },
        })
      ).json();
      expect(after.find((p: { slug: string }) => p.slug === targetSlug).claps).toBe(
        initialClaps + 1,
      );
    });

    it('returns 404 when "like" action is dispatched on a non-existent slug', async () => {
      const res = await request(
        'http://localhost:3000/posts/unknown-slug-target?_action=like',
        {
          method: 'POST',
          headers: { Accept: 'application/json' },
        }
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Post not found');
    });

    it('dispatches "comment" action, appends new comment with author and text', async () => {
      const targetSlug = 'zero-fouc-real-dom';
      const post = initialPosts.find((p) => p.slug === targetSlug)!;
      const initialCount = post.comments.length;

      const payload = {
        author: 'Dan Abramov',
        text: 'LinkeDOM isolation without JSDOM memory leaks is truly top tier.',
      };

      const res = await request(
        `http://localhost:3000/posts/${targetSlug}?_action=comment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        success: boolean;
        comment: { id: number; author: string; text: string; date: string };
      };

      expect(body.success).toBe(true);
      expect(body.comment.author).toBe('Dan Abramov');
      expect(body.comment.text).toBe(payload.text);
      expect(typeof body.comment.id).toBe('number');
      expect(initialCount).toBeGreaterThanOrEqual(0);

      // Verify the comment is read back from the datastore on the next render.
      const detail = await request(`http://localhost:3000/posts/${targetSlug}`, {
        headers: { Accept: 'text/html' },
      });
      expect(await detail.text()).toContain(payload.text);
    });

    it('defaults author to "Anonymous Engineer" when author is omitted in comment action', async () => {
      const targetSlug = 'state-hydration';
      const res = await request(
        `http://localhost:3000/posts/${targetSlug}?_action=comment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ text: 'Remarkable zero-duplicate fetching benchmark.' }),
        }
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        success: boolean;
        comment: { author: string; text: string };
      };
      expect(body.success).toBe(true);
      expect(body.comment.author).toBe('Anonymous Engineer');
      expect(body.comment.text).toBe('Remarkable zero-duplicate fetching benchmark.');
    });

    it('returns 400 Bad Request when comment text is missing or whitespace only', async () => {
      const res = await request(
        'http://localhost:3000/posts/hono-aurelia-architecture?_action=comment',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ author: 'Tester', text: '   ' }),
        }
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Comment text is required');
    });

    it('returns 400 Bad Request when comment request body is malformed JSON', async () => {
      const res = await request(
        'http://localhost:3000/posts/hono-aurelia-architecture?_action=comment',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: 'malformed-non-json-payload',
        }
      );

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Comment text is required');
    });

    it('returns 404 when "comment" action is dispatched on a non-existent slug', async () => {
      const res = await request(
        'http://localhost:3000/posts/ghost-slug?_action=comment',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ text: 'Valid text' }),
        }
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Post not found');
    });

    it('returns 404 when an unknown action name is dispatched', async () => {
      const res = await request(
        'http://localhost:3000/posts/hono-aurelia-architecture?_action=destroy',
        {
          method: 'POST',
          headers: { Accept: 'application/json' },
        }
      );

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Action "destroy" not found');
    });

    it('returns 404 when POST /posts/:slug is called without _action query parameter', async () => {
      const res = await request('http://localhost:3000/posts/hono-aurelia-architecture', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Action "default" not found');
    });
  });

  // =========================================================================
  // 5. Public & Protected JSON APIs & Health Endpoints
  // =========================================================================
  describe('5. Public & Protected JSON APIs & Health Endpoints', () => {
    it('GET /api/posts returns array of all posts with full schema', async () => {
      const res = await request('http://localhost:3000/api/posts');

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const posts = (await res.json()) as typeof initialPosts;
      expect(Array.isArray(posts)).toBe(true);
      expect(posts.length).toBeGreaterThanOrEqual(3);

      for (const p of posts) {
        expect(typeof p.id).toBe('number');
        expect(typeof p.title).toBe('string');
        expect(typeof p.slug).toBe('string');
        expect(typeof p.category).toBe('string');
        expect(typeof p.excerpt).toBe('string');
        expect(typeof p.content).toBe('string');
        expect(typeof p.author).toBe('string');
        expect(typeof p.date).toBe('string');
        expect(typeof p.readTime).toBe('string');
        expect(typeof p.claps).toBe('number');
        expect(Array.isArray(p.comments)).toBe(true);
      }
    });

    it('GET /api/dashboard/stats rejects unauthenticated requests with 401', async () => {
      const res = await request('http://localhost:3000/api/dashboard/stats');
      expect(res.status).toBe(401);
    });

    it('GET /api/dashboard/stats returns stats and activity when authenticated with query token', async () => {
      const res = await request('http://localhost:3000/api/dashboard/stats?token=test-token');

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const data = (await res.json()) as {
        stats: typeof dashboardStats;
        activity: typeof activityStream;
      };

      expect(data.stats.title).toBe('Production Metrics');
      expect(data.stats.views).toBe(dashboardStats.views);
      expect(data.stats.posts).toBe(dashboardStats.posts);
      expect(data.stats.engagement).toBe(dashboardStats.engagement);

      expect(Array.isArray(data.activity)).toBe(true);
      expect(data.activity.length).toBe(activityStream.length);
      for (const act of data.activity) {
        expect(typeof act.id).toBe('number');
        expect(['post', 'like', 'comment']).toContain(act.type);
        expect(typeof act.action).toBe('string');
        expect(typeof act.timestamp).toBe('string');
      }
    });

    it('GET /api/dashboard/stats returns stats when authenticated via Bearer header', async () => {
      const res = await request('http://localhost:3000/api/dashboard/stats', {
        headers: { Authorization: 'Bearer test-token' },
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as { stats: typeof dashboardStats };
      expect(data.stats.views).toBe(dashboardStats.views);
    });

    it('GET /health returns health probe status 200 with ISO timestamp', async () => {
      const res = await request('http://localhost:3000/health');

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const body = (await res.json()) as { status: string; timestamp: string };
      expect(body.status).toBe('ok');
      expect(typeof body.timestamp).toBe('string');

      const parsedDate = new Date(body.timestamp);
      expect(Number.isNaN(parsedDate.getTime())).toBe(false);
    });

    it('GET /favicon.ico serves Aurelia SVG icon with 24-hour cache header', async () => {
      const res = await request('http://localhost:3000/favicon.ico');

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/svg+xml');
      expect(res.headers.get('cache-control')).toBe('public, max-age=86400');

      const svg = await res.text();
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toMatch(/fill="#(c81b66|ed2578)"/);
      expect(svg).toContain('>Au<');
    });

    it('GET /llms.txt serves markdown agent discovery file with H1 title and links', async () => {
      const res = await request('http://localhost:3000/llms.txt');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/plain');
      const text = await res.text();
      expect(text).toContain('# Aurelia 2 Fullstack Ecosystem & Meta-Framework Specification');
      expect(text).toContain('https://aurelia-hono-ssr.sandiko.workers.dev');
      expect(text).toContain('Convention-over-Configuration');
    });

    it('GET /.well-known/ard.json serves valid ARD JSON manifest', async () => {
      const res = await request('http://localhost:3000/.well-known/ard.json');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      const json = await res.json();
      expect(json.ard_version).toBe('1.0');
      expect(json.name).toBe('Aurelia 2 Fullstack Ecosystem & Meta-Framework');
      expect(Array.isArray(json.endpoints)).toBe(true);
      expect(Array.isArray(json.packages)).toBe(true);
      expect(Array.isArray(json.rfc_proposals)).toBe(true);
    });

    it('enforces hardened HTTP security headers on all responses', async () => {
      const res = await request('http://localhost:3000/');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin');
      expect(res.headers.get('strict-transport-security')).toContain('max-age=31536000');
      expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    });
  });

  // =========================================================================
  // 6. Universal Static Asset Streaming & Cloudflare Rewrites (staticAssets)
  // =========================================================================
  describe('6. Universal Static Asset Streaming & Cloudflare Rewrites', () => {
    it('serves style.css via /public/ prefix with zero-copy caching headers', async () => {
      const res = await request('http://localhost:3000/public/style.css');

      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('public, max-age=');

      const css = await res.text();
      expect(css).toContain('--primary');
      expect(css).toContain('--bg');
    });

    it('serves style.css via direct root path (/style.css)', async () => {
      const res = await request('http://localhost:3000/style.css');

      expect(res.status).toBe(200);
      const css = await res.text();
      expect(css).toContain('--font-sans');
    });

    it('serves client.js via /public/ prefix and direct root path', async () => {
      const resPublic = await request('http://localhost:3000/public/client.js');
      expect(resPublic.status).toBe(200);

      const resDirect = await request('http://localhost:3000/client.js');
      expect(resDirect.status).toBe(200);
    });

    it('simulates Cloudflare Workers ASSETS binding: rewrites /public prefix and streams assets', async () => {
      let forwardedPath = '';
      const mockCloudflareAssets = {
        fetch: async (req: Request) => {
          const url = new URL(req.url);
          forwardedPath = url.pathname;
          return new Response('/* worker-cloudflare-stream */', {
            status: 200,
            headers: { 'Content-Type': 'text/css' },
          });
        },
      };

      const res = await request(
        'http://localhost:3000/public/style.css',
        {},
        { ASSETS: mockCloudflareAssets }
      );

      expect(res.status).toBe(200);
      expect(forwardedPath).toBe('/style.css'); // Stripped prefix for Cloudflare ASSETS binding
      const text = await res.text();
      expect(text).toBe('/* worker-cloudflare-stream */');
    });

    it('simulates Cloudflare Workers ASSETS binding: handles direct static extensions', async () => {
      let capturedPath = '';
      const mockCloudflareAssets = {
        fetch: async (req: Request) => {
          const url = new URL(req.url);
          capturedPath = url.pathname;
          return new Response('{"mock": true}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      };

      const res = await request(
        'http://localhost:3000/assets/manifest.json',
        {},
        { ASSETS: mockCloudflareAssets }
      );

      expect(res.status).toBe(200);
      expect(capturedPath).toBe('/assets/manifest.json');
    });
  });

  // =========================================================================
  // 7. Domain Services Unit & Concurrency Verification
  // =========================================================================
  describe('7. Domain Services Unit & Concurrency Verification', () => {
    it('PostService resolves posts, fetches by slug, claps and adds comments cleanly', async () => {
      const service = new PostService(db);

      // getPosts
      const posts = await service.getPosts();
      expect(Array.isArray(posts)).toBe(true);
      expect(posts.length).toBeGreaterThan(0);

      // getBySlug
      const post = await service.getBySlug('hono-aurelia-architecture');
      expect(post).not.toBeNull();
      expect(post?.title).toBe('Hono + Aurelia 2 SSR Architecture');

      const nullPost = await service.getBySlug('ghost-unknown');
      expect(nullPost).toBeNull();

      // clap
      const clapsBefore = post!.claps;
      const clapped = await service.clap('hono-aurelia-architecture');
      expect(clapped?.claps).toBe(clapsBefore + 1);

      const nullClap = await service.clap('ghost-unknown');
      expect(nullClap).toBeNull();

      // addComment
      const comment = await service.addComment(
        'hono-aurelia-architecture',
        'Staff Architect',
        'Direct LinkeDOM execution eliminates V-DOM reconciliation latency.'
      );
      expect(comment).not.toBeNull();
      expect(comment?.author).toBe('Staff Architect');
      expect(comment?.text).toContain('Direct LinkeDOM execution');

      const nullComment = await service.addComment('ghost-unknown', 'Dev', 'Text');
      expect(nullComment).toBeNull();
    });

    it('DashboardService resolves telemetry metrics and activity stream', async () => {
      const service = new DashboardService(db);
      const metrics = await service.getMetrics();

      expect(metrics.stats.title).toBe('Production Metrics');
      expect(metrics.stats.views).toBe(dashboardStats.views);
      expect(Array.isArray(metrics.activity)).toBe(true);
      expect(metrics.activity.length).toBe(activityStream.length);
    });
  });

  // =========================================================================
  // 8. Hydration Script Payload Integrity & XSS Security
  // =========================================================================
  describe('8. Hydration Script Payload Integrity & XSS Security', () => {
    it('verifies __AURELIA_SSR_DATA__ JSON script payload is parseable and valid', async () => {
      const res = await request('http://localhost:3000/posts/hono-aurelia-architecture', {
        headers: { Accept: 'text/html' },
      });

      expect(res.status).toBe(200);
      const html = await res.text();

      const scriptMatch = html.match(
        /<script id="__AURELIA_SSR_DATA__" type="application\/json">([\s\S]*?)<\/script>/
      );
      expect(scriptMatch).not.toBeNull();

      const rawJson = scriptMatch![1];
      const parsed = JSON.parse(rawJson);

      expect(parsed.component).toBe('post-detail-page');
      expect(parsed.initialData.post.slug).toBe('hono-aurelia-architecture');
      expect(typeof parsed.timestamp).toBe('number');
    });

    it('ensures HTML does not contain unsafe inline executable script hydration globals', async () => {
      const res = await request('http://localhost:3000/', {
        headers: { Accept: 'text/html' },
      });

      const html = await res.text();
      expect(html).not.toContain('window.__HYDRATION__ =');
      expect(html).not.toContain('window.__DATA__ =');
    });
  });
});
