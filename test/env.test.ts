import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { defineEnv, type EnvSchema } from '../src/server';

describe('@hono/aurelia defineEnv', () => {
  it('coerces declared fields, applies defaults, and keeps private values out of public output', () => {
    const schema = {
      API_TOKEN: 'string',
      DATABASE_URL: { type: 'url' as const },
      PORT: { type: 'number' as const, default: 8787 },
      DEBUG: { type: 'boolean' as const },
      REGION: { type: 'enum' as const, values: ['asia', 'eu', 'us'], public: true },
      OPTIONAL_CACHE: { type: 'string' as const, required: false },
      PUBLIC_APP_NAME: 'string',
    } satisfies EnvSchema;

    const env = defineEnv(schema, {
      source: {
        API_TOKEN: 'super-secret',
        DATABASE_URL: 'https://db.example/tenant',
        DEBUG: 'true',
        REGION: 'asia',
        PUBLIC_APP_NAME: 'AureliaKit',
      },
    });

    expect(env.values).toEqual({
      API_TOKEN: 'super-secret',
      DATABASE_URL: 'https://db.example/tenant',
      PORT: 8787,
      DEBUG: true,
      REGION: 'asia',
      PUBLIC_APP_NAME: 'AureliaKit',
    });
    expect(env.public).toEqual({
      REGION: 'asia',
      PUBLIC_APP_NAME: 'AureliaKit',
    });
    expect(JSON.stringify(env.public)).not.toContain('super-secret');
    expect(JSON.stringify(env.public)).not.toContain('DATABASE_URL');
  });

  it('reports all invalid fields in one error and accepts a different per-request source', () => {
    const env = defineEnv(
      {
        REQUIRED_SECRET: 'string',
        PORT: { type: 'number' },
        FLAG: { type: 'boolean' },
        REGION: { type: 'enum', values: ['asia', 'eu'] },
      },
      { source: {} }
    );

    let message = '';
    try {
      void env.values;
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('REQUIRED_SECRET: required value is missing');
    expect(message).toContain('PORT: required value is missing');
    expect(message).toContain('FLAG: required value is missing');
    expect(message).toContain('REGION: required value is missing');

    const resolved = env.resolve({
      REQUIRED_SECRET: 'token',
      PORT: '3000',
      FLAG: '0',
      REGION: 'eu',
    });
    expect(resolved.values).toEqual({
      REQUIRED_SECRET: 'token',
      PORT: 3000,
      FLAG: false,
      REGION: 'eu',
    });
    expect(resolved.public).toEqual({});

    expect(() => env.resolve({ REQUIRED_SECRET: 'x', PORT: 'abc', FLAG: 'yes', REGION: 'mars' })).toThrow(
      /expected a finite number[\s\S]*expected true or false[\s\S]*expected one of asia, eu/
    );
  });

  it('reads process.env without importing node:* and ignores undeclared variables', () => {
    const key = '__AURELIA_ENV_TEST_TOKEN__';
    const previous = process.env[key];
    process.env[key] = 'from-process';
    try {
      const env = defineEnv({ [key]: 'string', LEAK: 'string' }, { source: undefined });
      expect(() => env.values).toThrow(/LEAK: required value is missing/);

      const withOptional = defineEnv({
        [key]: 'string',
        LEAK: { type: 'string', required: false },
      });
      expect(withOptional.values[key]).toBe('from-process');
      expect(withOptional.public).toEqual({});
    } finally {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  });

  it('validates Workers-style c.env through Hono middleware without leaking it to the client response', async () => {
    const env = defineEnv({
      API_TOKEN: 'string',
      PUBLIC_SITE_URL: { type: 'url' as const },
    });

    const app = new Hono();
    app.onError((_error, c) => c.text('invalid env', 500));
    app.use('*', env.middleware());
    app.get('/', (c) => {
      const publicEnv = (c as unknown as { var: { publicEnv: Record<string, unknown> } }).var.publicEnv;
      return c.json({ publicEnv });
    });

    const res = await app.request('http://localhost/', undefined, {
      API_TOKEN: 'worker-only-secret',
      PUBLIC_SITE_URL: 'https://app.example',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      publicEnv: { PUBLIC_SITE_URL: 'https://app.example' },
    });

    const missing = await app.request('http://localhost/');
    expect(missing.status).toBe(500);
  });
});
