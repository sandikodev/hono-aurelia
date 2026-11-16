/**
 * @hono/aurelia-ssr Types
 * 
 * Hono-specific type definitions and re-exports of @aureliajs/ssr core types.
 */

import type { Context } from 'hono';
import type { DocumentOptions } from '@aureliajs/ssr';

// Re-export all core Aurelia SSR types
export type {
  RenderContext,
  User,
  Workspace,
  HydrationPayload,
  HydrationResult,
  RenderOptions,
  DocumentOptions,
  HydrationOptions,
  ClientHydratorOptions,
  IRequestContext,
} from '@aureliajs/ssr';

/**
 * Route configuration for aurelia() adapter
 */
export interface AureliaRouteConfig {
  component: unknown;
  title: string;
  requiresAuth?: boolean;
  loaders?: {
    [key: string]: (c: Context) => Promise<unknown>;
  };
  fallback?: 'spa' | 'error';
  document?: DocumentOptions;
  streaming?: boolean;
}

/**
 * Configuration for createAuthMiddleware()
 */
export interface AuthMiddlewareConfig {
  getUserFromToken?: (token: string) => Promise<unknown>;
  getWorkspaceFromRequest?: (c: Context) => Promise<unknown>;
  getRoleForUser?: (user: unknown, workspace: unknown) => string | null;
}
