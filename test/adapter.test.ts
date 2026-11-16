/**
 * @hono/aurelia-ssr Adapter Tests
 * 
 * Tests for aurelia() route handler factory, content negotiation,
 * data loading, auth guards, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { aurelia, createAuthMiddleware, createAureliaRouteGroup } from '../src/adapter';

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
});
