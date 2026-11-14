import { describe, it, expect } from 'vitest';
import { serializeState, validatePayload, stringifyPayload } from '../src/serialize.js';
import type { RenderContext } from '../src/types.js';

describe('serializeState()', () => {
  const mockContext: RenderContext = {
    user: {
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
    },
    workspace: {
      id: 'ws_456',
      name: 'Test Workspace',
    },
    role: 'owner',
  };

  it('should create a valid hydration payload', async () => {
    const payload = await serializeState(mockContext);

    expect(payload).toHaveProperty('component');
    expect(payload).toHaveProperty('context');
    expect(payload).toHaveProperty('timestamp');
    expect(payload.context.isAuthenticated).toBe(true);
  });

  it('should exclude sensitive fields', async () => {
    const contextWithSecrets = {
      ...mockContext,
      user: {
        ...mockContext.user!,
        password: 'secret123',
        refreshToken: 'token_secret',
        apiKey: 'key_secret',
      },
    };

    const payload = await serializeState(contextWithSecrets);

    expect(payload.context.user).not.toHaveProperty('password');
    expect(payload.context.user).not.toHaveProperty('refreshToken');
    expect(payload.context.user).not.toHaveProperty('apiKey');
    expect(payload.context.user?.email).toBe('test@example.com');
  });

  it('should handle null user', async () => {
    const contextNoAuth: RenderContext = {
      user: null,
      workspace: mockContext.workspace,
      role: null,
    };

    const payload = await serializeState(contextNoAuth);

    expect(payload.context.isAuthenticated).toBe(false);
    expect(payload.context.user).toBeNull();
  });

  it('should include initial data', async () => {
    const initialData = {
      overview: { stats: { total: 1234 } },
      activity: [{ id: 1, action: 'created' }],
    };

    const payload = await serializeState(mockContext, initialData);

    expect(payload.initialData).toEqual(initialData);
  });

  it('should handle circular references in data', async () => {
    const circularData: any = {
      name: 'test',
    };
    circularData.self = circularData;

    const payload = await serializeState(mockContext, circularData);

    expect(payload.initialData).toBeDefined();
    expect(JSON.stringify(payload)).toBeDefined();
  });

  it('should set component name', async () => {
    const payload = await serializeState(mockContext, {}, 'dashboard-page');

    expect(payload.component).toBe('dashboard-page');
  });

  it('should set current timestamp', async () => {
    const before = Date.now();
    const payload = await serializeState(mockContext);
    const after = Date.now();

    expect(payload.timestamp).toBeGreaterThanOrEqual(before);
    expect(payload.timestamp).toBeLessThanOrEqual(after);
  });
});

describe('validatePayload()', () => {
  it('should validate serializable payload', async () => {
    const payload = await serializeState({
      user: null,
      workspace: null,
      role: null,
    });

    expect(validatePayload(payload)).toBe(true);
  });
});

describe('stringifyPayload()', () => {
  it('should produce valid JSON string for script tag assignment', async () => {
    const payload = await serializeState({
      user: { id: 'u1', email: 'test@example.com', name: 'Test' },
      workspace: null,
      role: 'user',
    });

    const str = stringifyPayload(payload);

    expect(typeof str).toBe('string');
    // Double quotes must remain valid JSON/JS string delimiters
    expect(str).toContain('"');
    expect(str).not.toContain('\\u0022');
    // Must be directly parseable as JSON and valid in a JS expression
    expect(JSON.parse(str)).toHaveProperty('context');
  });

  it('should prevent XSS injection', () => {
    const maliciousPayload: any = {
      component: '<script>alert("xss")</script>',
      context: { user: null, workspace: null, role: null, isAuthenticated: false },
      timestamp: Date.now(),
    };

    const str = stringifyPayload(maliciousPayload);

    // < and > must be escaped so browser HTML parser cannot break out of <script>
    expect(str).toContain('\\u003c');
    expect(str).toContain('\\u003e');
    expect(str).not.toContain('<script>');
  });
});
