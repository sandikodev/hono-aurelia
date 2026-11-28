/**
 * @hono/aurelia defineEnv()
 *
 * Schema validation for environment values sourced from Hono `c.env` (Workers)
 * or `process.env` (Bun/Node) without importing `node:*`. The returned object
 * keeps private values server-side and exposes an explicit public subset for
 * embedding in HTML or shipping to the client.
 */

import type { Context, MiddlewareHandler } from 'hono';

export type EnvValueType = 'string' | 'number' | 'boolean' | 'url' | 'enum';

export interface EnvFieldOptions {
  readonly type: EnvValueType;
  readonly required?: boolean;
  readonly default?: string | number | boolean;
  readonly public?: boolean;
  /** Allowed values for `type: 'enum'`. */
  readonly values?: readonly string[];
}

export type EnvField = EnvValueType | EnvFieldOptions;
export type EnvSchema = Readonly<Record<string, EnvField>>;
export type EnvSource = Readonly<Record<string, unknown>>;

type InferField<F extends EnvField> =
  F extends 'string' ? string :
  F extends 'number' ? number :
  F extends 'boolean' ? boolean :
  F extends 'url' ? string :
  F extends { type: 'number' } ? number :
  F extends { type: 'boolean' } ? boolean :
  F extends { type: 'url' } ? string :
  F extends { type: 'enum' } ? string :
  string;

export type EnvValues<T extends EnvSchema> = {
  readonly [K in keyof T]: InferField<T[K]>;
};

export type PublicEnvKey<T extends EnvSchema> = {
  [K in keyof T]: T[K] extends { public: true }
    ? K
    : K extends `PUBLIC_${string}`
      ? K
      : never;
}[keyof T];

export type PublicEnv<T extends EnvSchema> = {
  readonly [K in PublicEnvKey<T>]: EnvValues<T>[K];
};

export interface ResolvedEnv<T extends EnvSchema> {
  readonly values: EnvValues<T>;
  readonly public: PublicEnv<T>;
}

export interface DefinedEnv<T extends EnvSchema> {
  /** Validated private + public values. Never serialize this object. */
  readonly values: EnvValues<T>;
  /** Public values only. Safe to embed as JSON in an SSR document. */
  readonly public: PublicEnv<T>;
  /** Validate a specific source (including a Hono context) and return both subsets. */
  resolve(input?: EnvSource | Context): ResolvedEnv<T>;
  /** Hono middleware publishing both subsets on `c.var.env` and `c.var.publicEnv`. */
  middleware(): MiddlewareHandler;
}

export interface DefineEnvOptions {
  /** Explicit source or factory. Otherwise `c.env` is used, then `process.env`. */
  readonly source?: EnvSource | ((c?: Context) => EnvSource);
  /** Prefix that marks a key as public in addition to `public: true`. Default `PUBLIC_`. */
  readonly publicPrefix?: string;
}

type Coerced =
  | { readonly ok: true; readonly value: string | number | boolean }
  | { readonly ok: false; readonly optional?: true; readonly error?: string };

function globalProcessEnv(): EnvSource {
  const g = globalThis as { process?: { env?: Record<string, unknown> } };
  return g.process?.env ?? {};
}

function isHonoContext(input: EnvSource | Context): input is Context {
  return 'req' in input && 'env' in input;
}

function coerce(key: string, field: EnvField, raw: unknown): Coerced {
  const options: EnvFieldOptions = typeof field === 'string' ? { type: field } : field;
  const missing =
    raw === undefined ||
    raw === null ||
    (typeof raw === 'string' && raw.trim().length === 0);

  if (missing) {
    if (options.default !== undefined) return { ok: true, value: options.default };
    if (options.required === false) return { ok: false, optional: true };
    return { ok: false, error: `${key}: required value is missing` };
  }

  switch (options.type) {
    case 'string':
      if (typeof raw !== 'string') return { ok: false, error: `${key}: expected a string` };
      return { ok: true, value: raw };
    case 'number': {
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(value)) return { ok: false, error: `${key}: expected a finite number` };
      return { ok: true, value };
    }
    case 'boolean':
      if (typeof raw === 'boolean') return { ok: true, value: raw };
      if (raw === 'true' || raw === '1' || raw === 1) return { ok: true, value: true };
      if (raw === 'false' || raw === '0' || raw === 0) return { ok: true, value: false };
      return { ok: false, error: `${key}: expected true or false` };
    case 'url':
      if (typeof raw !== 'string') return { ok: false, error: `${key}: expected an absolute URL` };
      try {
        new URL(raw);
        return { ok: true, value: raw };
      } catch {
        return { ok: false, error: `${key}: expected an absolute URL` };
      }
    case 'enum':
      if (typeof raw !== 'string' || !(options.values ?? []).includes(raw)) {
        return {
          ok: false,
          error: `${key}: expected one of ${(options.values ?? []).join(', ')}`,
        };
      }
      return { ok: true, value: raw };
    default:
      return { ok: false, error: `${key}: unsupported schema type` };
  }
}

/**
 * Define a validated environment contract.
 *
 * Validation is lazy: importing a module that calls `defineEnv()` does not throw
 * before the values are actually read or a request is handled.
 */
export function defineEnv<T extends EnvSchema>(
  schema: T,
  options: DefineEnvOptions = {}
): DefinedEnv<T> {
  const prefix = options.publicPrefix ?? 'PUBLIC_';

  const resolve = (input?: EnvSource | Context): ResolvedEnv<T> => {
    let source: EnvSource;
    if (input && !isHonoContext(input)) {
      // An explicit per-call source always wins over the definition default.
      source = input;
    } else if (options.source) {
      source =
        typeof options.source === 'function'
          ? options.source(input && isHonoContext(input) ? input : undefined)
          : options.source;
    } else if (input && isHonoContext(input)) {
      source = (input.env as EnvSource | undefined) ?? globalProcessEnv();
    } else {
      source = globalProcessEnv();
    }

    const values: Record<string, unknown> = {};
    const publicValues: Record<string, unknown> = {};
    const errors: string[] = [];

    for (const [key, field] of Object.entries(schema)) {
      const result = coerce(key, field, source[key]);
      if (!result.ok) {
        if (result.optional) continue;
        errors.push(result.error ?? `${key}: invalid value`);
        continue;
      }
      values[key] = result.value;

      const fieldOptions: EnvFieldOptions = typeof field === 'string' ? { type: field } : field;
      const isPublic =
        fieldOptions.public === true ||
        (prefix.length > 0 && key.startsWith(prefix));
      if (isPublic) publicValues[key] = result.value;
    }

    if (errors.length > 0) {
      throw new Error(`[defineEnv] Invalid environment configuration:\n- ${errors.join('\n- ')}`);
    }

    return {
      values: values as EnvValues<T>,
      public: publicValues as PublicEnv<T>,
    };
  };

  return {
    get values() {
      return resolve().values;
    },
    get public() {
      return resolve().public;
    },
    resolve,
    middleware(): MiddlewareHandler {
      return async (c, next) => {
        const resolved = resolve(c);
        const setter = c as unknown as { set: (key: string, value: unknown) => void };
        setter.set('env', resolved.values);
        setter.set('publicEnv', resolved.public);
        await next();
      };
    },
  };
}
