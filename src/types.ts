/**
 * @hono/aurelia Types
 *
 * Pure, generic, idiomatic TypeScript definitions for Aurelia 2 SSR on Hono.
 */

import type { Context, Env } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { DocumentOptions, SerializeOptions } from '@aureliajs/ssr';

export type { DocumentOptions, SerializeOptions } from '@aureliajs/ssr';

/**
 * Server-side data loader executed before rendering an Aurelia route.
 * Returning a `Response` short-circuits SSR (e.g., redirects, 401/404 responses).
 */
export type AureliaLoader<E extends Env = Env, TResult = unknown> = (
  c: Context<E>
) => Promise<TResult | Response> | TResult | Response;

/**
 * Mutation / form action handler for `aureliaAction()`.
 */
export type AureliaActionHandler<E extends Env = Env, TResult = unknown> = (
  c: Context<E>
) => Promise<TResult | Response> | TResult | Response;

/**
 * Route configuration for `aurelia()` SSR handler.
 */
export interface AureliaRouteConfig<
  E extends Env = Env,
  TData extends Record<string, unknown> = Record<string, unknown>,
> {
  component: unknown;
  title?: string | ((data: TData, c: Context<E>) => string);
  status?: ContentfulStatusCode | ((data: TData, c: Context<E>) => ContentfulStatusCode);
  loader?: AureliaLoader<E, TData>;
  loaders?: Record<string, AureliaLoader<E>>;
  /**
   * Custom context extractor. Defaults to reading `c.var` (excluding internal keys).
   */
  context?: (c: Context<E>) => Record<string, unknown> | Promise<Record<string, unknown>>;
  document?: DocumentOptions;
  serialize?: SerializeOptions;
  streaming?: boolean;
  /**
   * Opt-in JSON data endpoint when client explicitly sends `Accept: application/json`.
   * Disabled (`false`) by default to avoid exposing internal SSR payloads unintentionally.
   */
  dataEndpoint?: boolean;
  /**
   * Failure strategy when rendering or data loading throws.
   * - `'throw'` (default): delegates to `onError` or rethrows for Hono's `app.onError()`.
   * - `'spa'`: renders an empty HTML document shell for client-side fallback rendering.
   */
  fallback?: 'spa' | 'throw';
  onError?: (error: unknown, c: Context<E>) => Response | Promise<Response>;
  registrations?: unknown[];
  timeout?: number;
}

/**
 * Aurelia component with optional co-located static route metadata (`<script server>`).
 */
export interface AureliaComponentWithMetadata<
  E extends Env = Env,
  TData extends Record<string, unknown> = Record<string, unknown>,
> {
  name?: string;
  title?: string | ((data: TData, c: Context<E>) => string);
  status?: ContentfulStatusCode | ((data: TData, c: Context<E>) => ContentfulStatusCode);
  loader?: AureliaLoader<E, TData>;
  loaders?: Record<string, AureliaLoader<E>>;
  action?: AureliaActionHandler<E>;
  actions?: Record<string, AureliaActionHandler<E>>;
  fallback?: 'spa' | 'throw';
  clientOnly?: boolean;
  serverOnly?: boolean;
}

/**
 * Options for `aureliaAction()` explicit mutation handler.
 */
export interface AureliaActionOptions<E extends Env = Env> {
  /**
   * Resolves which named action to invoke for the incoming request.
   * Defaults to query param `_action`, then header `X-Action`, then `'default'`.
   */
  resolveAction?: (c: Context<E>) => string | undefined | Promise<string | undefined>;
}

/**
 * Scoped configuration for `aureliaDefaults()` Hono middleware.
 */
export interface AureliaDefaultsOptions<E extends Env = Env> {
  document?: DocumentOptions;
  serialize?: SerializeOptions;
  streaming?: boolean;
  dataEndpoint?: boolean;
  fallback?: 'spa' | 'throw';
  context?: (c: Context<E>) => Record<string, unknown> | Promise<Record<string, unknown>>;
  onError?: (error: unknown, c: Context<E>) => Response | Promise<Response>;
  registrations?: unknown[];
  timeout?: number;
}
