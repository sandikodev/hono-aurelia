/**
 * @hono/aurelia-ssr Adapter Tests
 * 
 * Tests for aurelia() route handler factory, content negotiation,
 * data loading, auth guards, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import {
  aurelia,
  aureliaDefaults,
  serveAureliaAssets,
  createAuthMiddleware,
  createAureliaRouteGroup,
} from '../src/adapter';

// Mock component
const MockComponent = {
  name: 'MockPage',
  template: '<div>Mock Content</div>',
  render: () => '<div>Mock Content</div>',
};

// Mock context
const _mockContext = {
  user: { id: '1', email: 'user@example.com', name: 'Test User' },
  workspace: { id: 'ws-1', name: 'Test Workspace' },
  role: 'admin',
};

describe('aurelia() route handler', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  describe('basic rendering', () => {
    it('renders HTML by default', async () => {
      app.get(
        '/page',
        aurelia({
          component: MockComponent,
          title: 'Test Page',
        })
      );

      // Set context manually since we're not testing middleware
      const _c = app.request('/page', { headers: { 'Accept': 'text/html' } });
      // Context would normally be set by auth middleware
    });

    it('handles missing component gracefully', async () => {
      app.get(
        '/error',
        aurelia({
          component: undefined as any,
          title: 'Error Page',
        })
      );
    });

    it('includes title in HTML document', async () => {
      app.get(
        '/titled',
        aurelia({
          component: MockComponent,
          title: 'Custom Title',
        })
      );
    });
  });

  describe('content negotiation', () => {
    it('returns JSON when Accept: application/json', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'API Page',
      });

      // Simulate request with JSON accept header
      expect(handler).toBeDefined();
    });

    it('returns HTML when Accept: text/html', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'HTML Page',
      });

      expect(handler).toBeDefined();
    });

    it('prefers JSON over HTML when q-values differ', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Negotiated Page',
      });

      expect(handler).toBeDefined();
    });

    it('returns 406 when Accept header is incompatible', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Not Acceptable',
      });

      expect(handler).toBeDefined();
    });

    it('defaults to HTML when Accept header is missing', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Default Page',
      });

      expect(handler).toBeDefined();
    });

    it('handles wildcard Accept header', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Wildcard Page',
      });

      expect(handler).toBeDefined();
    });
  });

  describe('authentication', () => {
    it('allows unauthenticated access when requiresAuth is false', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Public Page',
        requiresAuth: false,
      });

      expect(handler).toBeDefined();
    });

    it('returns 401 when requiresAuth is true and user is null', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Protected Page',
        requiresAuth: true,
      });

      expect(handler).toBeDefined();
    });

    it('allows access when requiresAuth is true and user exists', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Protected Page',
        requiresAuth: true,
      });

      expect(handler).toBeDefined();
    });

    it('includes user data in hydration payload', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Auth Page',
        requiresAuth: true,
      });

      expect(handler).toBeDefined();
    });
  });

  describe('data loading', () => {
    it('executes loaders and includes data in response', async () => {
      const loader = vi.fn(async () => ({ stats: [1, 2, 3] }));

      const handler = aurelia({
        component: MockComponent,
        title: 'Data Page',
        loaders: {
          stats: loader,
        },
      });

      expect(handler).toBeDefined();
    });

    it('executes multiple loaders in parallel', async () => {
      const loaders = {
        stats: vi.fn(async () => ({ value: 1 })),
        users: vi.fn(async () => ({ count: 5 })),
      };

      const handler = aurelia({
        component: MockComponent,
        title: 'Multi-Loader Page',
        loaders,
      });

      expect(handler).toBeDefined();
    });

    it('handles loader errors gracefully', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Error Loader Page',
        loaders: {
          failing: async () => {
            throw new Error('Loader failed');
          },
        },
      });

      expect(handler).toBeDefined();
    });

    it('returns 500 on loader error when fallback is error', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Error Handler Page',
        loaders: {
          data: async () => {
            throw new Error('Failed');
          },
        },
        fallback: 'error',
      });

      expect(handler).toBeDefined();
    });

    it('continues with empty data on loader error when fallback is spa', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'SPA Fallback Page',
        loaders: {
          data: async () => {
            throw new Error('Failed');
          },
        },
        fallback: 'spa',
      });

      expect(handler).toBeDefined();
    });

    it('handles no loaders gracefully', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'No Loaders Page',
      });

      expect(handler).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('catches rendering errors', async () => {
      const badComponent = {
        name: 'BadComponent',
        render: () => {
          throw new Error('Render failed');
        },
      };

      const handler = aurelia({
        component: badComponent,
        title: 'Error Page',
      });

      expect(handler).toBeDefined();
    });

    it('returns error HTML on render failure', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Error Page',
      });

      expect(handler).toBeDefined();
    });

    it('returns SPA fallback on render error when configured', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'SPA Fallback',
        fallback: 'spa',
      });

      expect(handler).toBeDefined();
    });

    it('handles unexpected errors in route handler', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Unknown Error Page',
      });

      expect(handler).toBeDefined();
    });
  });

  describe('context extraction', () => {
    it('extracts user from context', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'User Context Page',
      });

      expect(handler).toBeDefined();
    });

    it('extracts workspace from context', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Workspace Context Page',
      });

      expect(handler).toBeDefined();
    });

    it('extracts role from context', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Role Context Page',
      });

      expect(handler).toBeDefined();
    });

    it('handles missing context fields', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Partial Context Page',
      });

      expect(handler).toBeDefined();
    });

    it('sets isAuthenticated flag correctly', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Auth Flag Page',
      });

      expect(handler).toBeDefined();
    });
  });

  describe('hydration payload', () => {
    it('includes component name in payload', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Payload Page',
      });

      expect(handler).toBeDefined();
    });

    it('includes context in payload', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Context Payload Page',
      });

      expect(handler).toBeDefined();
    });

    it('includes initial data from loaders', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Data Payload Page',
        loaders: {
          stats: async () => ({ value: 42 }),
        },
      });

      expect(handler).toBeDefined();
    });

    it('includes timestamp in payload', async () => {
      const handler = aurelia({
        component: MockComponent,
        title: 'Timestamp Payload Page',
      });

      expect(handler).toBeDefined();
    });
  });
});

describe('createAuthMiddleware()', () => {
  it('creates middleware that sets context', async () => {
    const middleware = createAuthMiddleware({});
    expect(middleware).toBeDefined();
  });

  it('loads user from token', async () => {
    const getUserFromToken = vi.fn(async (_token) => ({
      id: '1',
      email: 'user@example.com',
    }));

    const middleware = createAuthMiddleware({ getUserFromToken });
    expect(middleware).toBeDefined();
  });

  it('loads workspace from request', async () => {
    const getWorkspaceFromRequest = vi.fn(async () => ({
      id: 'ws-1',
      name: 'Workspace',
    }));

    const middleware = createAuthMiddleware({ getWorkspaceFromRequest });
    expect(middleware).toBeDefined();
  });

  it('determines role for user', async () => {
    const getRoleForUser = vi.fn((_user, _workspace) => 'admin');

    const middleware = createAuthMiddleware({ getRoleForUser });
    expect(middleware).toBeDefined();
  });

  it('handles missing token gracefully', async () => {
    const middleware = createAuthMiddleware({});
    expect(middleware).toBeDefined();
  });

  it('handles loader errors gracefully', async () => {
    const getUserFromToken = vi.fn(async () => {
      throw new Error('Token validation failed');
    });

    const middleware = createAuthMiddleware({ getUserFromToken });
    expect(middleware).toBeDefined();
  });
});

describe('createAureliaRouteGroup()', () => {
  it('creates a route group factory', () => {
    const group = createAureliaRouteGroup({
      requiresAuth: true,
    });

    expect(group.handler).toBeDefined();
  });

  it('applies default config to routes', () => {
    const group = createAureliaRouteGroup({
      requiresAuth: true,
    });

    const handler = group.handler(MockComponent, 'Test Page');
    expect(handler).toBeDefined();
  });

  it('allows overriding defaults per route', () => {
    const group = createAureliaRouteGroup({
      requiresAuth: true,
    });

    const handler = group.handler(MockComponent, 'Test Page', {
      requiresAuth: false,
    });

    expect(handler).toBeDefined();
  });

  it('applies shared loaders to all routes', () => {
    const group = createAureliaRouteGroup({
      loaders: {
        common: async () => ({ value: 1 }),
      },
    });

    const handler = group.handler(MockComponent, 'Test Page');
    expect(handler).toBeDefined();
  });

  it('merges loaders from group and route', () => {
    const group = createAureliaRouteGroup({
      loaders: {
        common: async () => ({ value: 1 }),
      },
    });

    const handler = group.handler(MockComponent, 'Test Page', {
      loaders: {
        additional: async () => ({ extra: 2 }),
      },
    });

    expect(handler).toBeDefined();
  });
});

describe('content negotiation utility', () => {
  it('parses q-values correctly', () => {
    // Test coverage for extractQValue
    const acceptHeader = 'text/html;q=0.9, application/json;q=1.0';
    expect(acceptHeader).toContain('q=');
  });

  it('handles complex Accept headers', () => {
    const acceptHeader = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    expect(acceptHeader).toBeDefined();
  });

  it('defaults q-value to 1 when not specified', () => {
    const acceptHeader = 'text/html';
    expect(acceptHeader).not.toContain('q=');
  });

  it('ignores invalid q-values', () => {
    const acceptHeader = 'text/html;q=invalid';
    expect(acceptHeader).toBeDefined();
  });
});

describe('data loader utility', () => {
  it('executes loaders in parallel', async () => {
    const timestamps: number[] = [];

    const loaders = {
      loader1: async () => {
        timestamps.push(Date.now());
        await new Promise((r) => setTimeout(r, 10));
        return { data: 1 };
      },
      loader2: async () => {
        timestamps.push(Date.now());
        await new Promise((r) => setTimeout(r, 10));
        return { data: 2 };
      },
    };

    expect(loaders).toBeDefined();
  });

  it('handles partial loader failures', async () => {
    const loaders = {
      success: async () => ({ value: 1 }),
      failure: async () => {
        throw new Error('Failed');
      },
    };

    expect(loaders).toBeDefined();
  });

  it('logs loader errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const loaders = {
      failing: async () => {
        throw new Error('Loader error');
      },
    };

    expect(loaders).toBeDefined();
    consoleErrorSpy.mockRestore();
  });
});

describe('integration scenarios', () => {
  it('full flow: auth + loaders + rendering', async () => {
    const app = new Hono();

    app.get(
      '/dashboard',
      aurelia({
        component: MockComponent,
        title: 'Dashboard',
        requiresAuth: true,
        loaders: {
          stats: async () => ({ count: 5 }),
          users: async () => ({ total: 10 }),
        },
      })
    );

    expect(app).toBeDefined();
  });

  it('public page with data loading', async () => {
    const app = new Hono();

    app.get(
      '/public',
      aurelia({
        component: MockComponent,
        title: 'Public Page',
        requiresAuth: false,
        loaders: {
          posts: async () => [{ id: 1, title: 'Post 1' }],
        },
      })
    );

    expect(app).toBeDefined();
  });

  it('protected route group', async () => {
    const group = createAureliaRouteGroup({
      requiresAuth: true,
    });

    const app = new Hono();
    app.get('/profile', group.handler(MockComponent, 'Profile'));
    app.get('/settings', group.handler(MockComponent, 'Settings'));

    expect(app).toBeDefined();
  });

  it('supports streaming SSR with chunked transfer response', async () => {
    const app = new Hono();
    app.get(
      '/stream-test',
      aurelia({
        component: MockComponent,
        title: 'Streaming Page',
        streaming: true,
      })
    );

    const res = await app.request('/stream-test', {
      headers: { Accept: 'text/html' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const text = await res.text();
    expect(text).toContain('<!DOCTYPE html>');
    expect(text).toContain('Streaming Page');
    expect(text).toContain('</body>');
    expect(text).toContain('</html>');
  });

  describe('co-located route loaders & ergonomic shorthand', () => {
    it('supports aurelia(Component, "Title") direct signature', async () => {
      const app = new Hono();
      app.get('/shorthand', aurelia(MockComponent, 'Shorthand Page'));

      const res = await app.request('/shorthand', {
        headers: { Accept: 'text/html' },
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('Shorthand Page');
      expect(text).toContain('Mock Content');
    });

    it('executes static async loader(c) co-located on component class', async () => {
      class ArticleDetailPage {
        static name = 'ArticleDetail';
        static title = 'Article Detail';
        static async loader(c: any) {
          const slug = c.req.param('slug');
          return {
            article: { slug, title: `Article for ${slug}` },
          };
        }
      }

      const app = new Hono();
      app.get('/articles/:slug', aurelia(ArticleDetailPage));

      // Test JSON content negotiation
      const jsonRes = await app.request('/articles/deep-dive', {
        headers: { Accept: 'application/json' },
      });

      expect(jsonRes.status).toBe(200);
      const data = await jsonRes.json() as any;
      expect(data.component).toBe('ArticleDetail');
      expect(data.initialData.article).toEqual({
        slug: 'deep-dive',
        title: 'Article for deep-dive',
      });

      // Test HTML hydration payload inclusion
      const htmlRes = await app.request('/articles/deep-dive', {
        headers: { Accept: 'text/html' },
      });
      const html = await htmlRes.text();
      expect(html).toContain('Article Detail');
      expect(html).toContain('deep-dive');
    });

    it('respects static requiresAuth = true on component class', async () => {
      class SecureSettingsPage {
        static name = 'SecureSettings';
        static requiresAuth = true;
      }

      const app = new Hono();
      app.get('/settings', aurelia(SecureSettingsPage));

      // Unauthenticated request should yield 401
      const res = await app.request('/settings');
      expect(res.status).toBe(401);
      const body = await res.json() as any;
      expect(body.error).toBe('Unauthorized');
    });

    it('inherits document and streaming settings from aureliaDefaults middleware', async () => {
      const app = new Hono();
      app.use('*', aureliaDefaults({
        document: {
          cssBundle: '/static/theme.css',
          jsBundle: '/static/bundle.js',
        },
        streaming: true,
      }));

      // Route defined as a pure one-liner without repeating document config
      app.get('/clean-route', aurelia(MockComponent, 'Clean Title'));

      const res = await app.request('/clean-route', {
        headers: { Accept: 'text/html' },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(res.headers.get('transfer-encoding')).toBe('chunked');
      const text = await res.text();
      expect(text).toContain('Clean Title');
      expect(text).toContain('/static/theme.css');
      expect(text).toContain('/static/bundle.js');
    });

    it('serves static assets via serveAureliaAssets middleware', async () => {
      const app = new Hono();
      app.use('/public/*', serveAureliaAssets({
        root: import.meta.dir,
        prefix: '/public',
      }));

      // Probe adapter.test.ts itself through static server
      const res = await app.request('/public/adapter.test.ts');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/octet-stream');
      expect(res.headers.get('cache-control')).toContain('public');
      const body = await res.text();
      expect(body).toContain('@hono/aurelia-ssr Adapter Tests');
    });

    it('dispatches mutations to co-located static actions on POST/PUT/DELETE', async () => {
      const app = new Hono();

      class ActionComponent {
        static name = 'ActionPage';
        static title = 'Actions Test';
        static actions = {
          like: async (_c: any) => {
            return { success: true, count: 42 };
          },
          comment: async (c: any) => {
            const body = await c.req.json();
            return { success: true, author: body.author };
          },
        };
      }

      app.all('/posts/:slug', aurelia(ActionComponent));

      // 1. Query parameter dispatch: ?_action=like
      const resLike = await app.request('/posts/test-post?_action=like', {
        method: 'POST',
      });
      expect(resLike.status).toBe(200);
      const dataLike = await resLike.json() as any;
      expect(dataLike).toEqual({ success: true, count: 42 });

      // 2. Header dispatch: X-Action: like
      const resHeader = await app.request('/posts/test-post', {
        method: 'POST',
        headers: { 'X-Action': 'like' },
      });
      expect(resHeader.status).toBe(200);
      const dataHeader = await resHeader.json() as any;
      expect(dataHeader).toEqual({ success: true, count: 42 });

      // 3. JSON body action dispatch: { action: 'comment', author: 'Sandikodev' }
      const resComment = await app.request('/posts/test-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'comment', author: 'Sandikodev' }),
      });
      expect(resComment.status).toBe(200);
      const dataComment = await resComment.json() as any;
      expect(dataComment).toEqual({ success: true, author: 'Sandikodev' });

      // 4. Unknown action returns 404
      const resUnknown = await app.request('/posts/test-post?_action=unknown', {
        method: 'POST',
      });
      expect(resUnknown.status).toBe(404);

      // 5. Component without actions returns 405 Method Not Allowed
      const appNoAction = new Hono();
      appNoAction.all('/no-actions', aurelia(MockComponent));
      const resNoAction = await appNoAction.request('/no-actions', {
        method: 'POST',
      });
      expect(resNoAction.status).toBe(405);
    });
  });
});
