/**
 * @hono/aurelia Types
 *
 * Strictly typed, Web-Standards-compliant generic TypeScript interfaces
 * for Aurelia 2 SSR and Server Actions on Hono.
 */

import type { Context, Env } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type {
  AureliaComponent,
  ComponentProps,
  DocumentOptions,
  SSREngine,
  SerializeOptions,
} from '@aureliajs/ssr';

export type {
  AureliaComponent,
  ComponentProps,
  DocumentOptions,
  SSREngine,
  SerializeOptions,
} from '@aureliajs/ssr';

/**
 * Server-side data loader executed prior to SSR.
 * Return a typed props object for the component, or a `Response` to short-circuit (e.g., redirect).
 */
export type AureliaLoader<
  E extends Env = Env,
  TData extends Record<string, unknown> = Record<string, unknown>,
> = (c: Context<E>) => Promise<TData | Response> | TData | Response;

/**
 * Server action handler invoked by `aureliaAction()`.
 */
export type AureliaActionHandler<E extends Env = Env, TResult = unknown> = (
  c: Context<E>
) => Promise<TResult | Response> | TResult | Response;

/**
 * Dictionary of named server actions.
 */
export type AureliaActionMap<E extends Env = Env> = Readonly<
  Record<string, AureliaActionHandler<E>>
>;

/**
 * Valid strongly-typed targets for `aureliaAction()`.
 * Eliminates runtime constructor/function sniffing in favor of compile-time type safety.
 */
export type AureliaActionSource<E extends Env = Env> =
  | AureliaActionMap<E>
  | { readonly actions: AureliaActionMap<E> }
  | { readonly action: AureliaActionHandler<E> };

/**
 * Aurelia component with optional co-located static route metadata (`<script server>`).
 */
export interface AureliaRouteComponent<
  E extends Env = Env,
  TComponent extends object = object,
  TData extends Record<string, unknown> = ComponentProps<TComponent>,
> {
  readonly name?: string;
  readonly title?: string | ((data: TData, c: Context<E>) => string);
  readonly status?: ContentfulStatusCode | ((data: TData, c: Context<E>) => ContentfulStatusCode);
  readonly loader?: AureliaLoader<E, TData>;
  readonly action?: AureliaActionHandler<E>;
  readonly actions?: AureliaActionMap<E>;
  readonly fallback?: 'spa' | 'throw';
  readonly clientOnly?: boolean;
  readonly serverOnly?: boolean;
}

/**
 * Route configuration for `aurelia()` SSR handler.
 */
export interface AureliaRouteConfig<
  E extends Env = Env,
  TComponent extends object = object,
  TData extends Record<string, unknown> = ComponentProps<TComponent>,
> {
  component: AureliaComponent<TComponent>;
  title?: string | ((data: TData, c: Context<E>) => string);
  status?: ContentfulStatusCode | ((data: TData, c: Context<E>) => ContentfulStatusCode);
  loader?: AureliaLoader<E, TData>;
  /**
   * DOM emulation engine to use (`'auto'` | `'jsdom'` | `'linkedom'`).
   * Defaults to `'auto'`, which uses `'linkedom'` on Cloudflare Workers / Edge and `'jsdom'` on Node/Bun.
   */
  engine?: SSREngine;
  /**
   * Custom request context extractor for `IRequestContext.data`.
   * Defaults to Hono's `c.var`.
   */
  context?: (c: Context<E>) => Record<string, unknown> | Promise<Record<string, unknown>>;
  document?: DocumentOptions;
  serialize?: SerializeOptions;
  /**
   * Enables true Web Streams streaming SSR (`ReadableStream`):
   * flushes `<head>` and CSS immediately before awaiting Aurelia component rendering.
   */
  streaming?: boolean;
  /**
   * Opt-in JSON data endpoint when client explicitly sends `Accept: application/json`.
   * Disabled (`false`) by default.
   */
  dataEndpoint?: boolean;
  /** Preserve Aurelia 2 `<!--au-->` hydration markers (default: `true`). */
  preserveMarkers?: boolean;
  /**
   * Failure strategy when loading or rendering throws.
   * - `'throw'` (default): delegates to `onError` or Hono's native `app.onError()`.
   * - `'spa'`: renders an empty HTML5 shell for client-side fallback rendering.
   */
  fallback?: 'spa' | 'throw';
  onError?: (error: unknown, c: Context<E>) => Response | Promise<Response>;
  registrations?: readonly unknown[];
  timeout?: number;
}

/**
 * Options for `aureliaAction()`.
 */
export interface AureliaActionOptions<E extends Env = Env> {
  /**
   * Resolves the action key to dispatch for an incoming request.
   * Defaults to query param `_action`, then header `X-Action`, then `'default'`.
   */
  resolveAction?: (c: Context<E>) => string | undefined | Promise<string | undefined>;
}

/**
 * Scoped middleware defaults for `aureliaDefaults()`.
 */
export interface AureliaDefaultsOptions<E extends Env = Env> {
  document?: DocumentOptions;
  serialize?: SerializeOptions;
  engine?: SSREngine;
  streaming?: boolean;
  dataEndpoint?: boolean;
  preserveMarkers?: boolean;
  fallback?: 'spa' | 'throw';
  context?: (c: Context<E>) => Record<string, unknown> | Promise<Record<string, unknown>>;
  onError?: (error: unknown, c: Context<E>) => Response | Promise<Response>;
  registrations?: readonly unknown[];
  timeout?: number;
}
