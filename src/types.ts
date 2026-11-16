/**
 * @hono/aurelia-ssr Types
 * 
 * Core type definitions for server-side rendering Aurelia components on Hono.
 */

import type { Context } from 'hono';

/**
 * Authentication context passed from Hono middleware to renderer
 */
export interface RenderContext {
  user: User | null;
  workspace: Workspace | null;
  role: string | null;
}

/**
 * User object from auth middleware
 */
export interface User {
  id: string;
  email: string;
  name: string;
  [key: string]: unknown;
}

/**
 * Workspace/tenant object from auth middleware
 */
export interface Workspace {
  id: string;
  name: string;
  [key: string]: unknown;
}

/**
 * Hydration payload sent to client
 * Contains auth context + initial data
 */
export interface HydrationPayload {
  component: string;
  context: {
    user: User | null;
    workspace: Workspace | null;
    role: string | null;
    isAuthenticated: boolean;
  };
  initialData?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Hydration result on client-side after extraction
 * Contains validated context and initial data
 */
export interface HydrationResult<TData = Record<string, unknown>> {
  context: {
    user?: User;
    workspace?: Workspace;
    role?: string;
    isAuthenticated: boolean;
  };
  initialData?: TData;
  timestamp: number;
}

/**
 * Options for renderAurelia()
 */
export interface RenderOptions {
  component: unknown;
  context?: RenderContext;
  props?: Record<string, unknown>;
  timeout?: number;
  registrations?: unknown[];
  settle?: number;
  url?: string;
}

/**
 * Options for createHtmlDocument()
 */
export interface DocumentOptions {
  title?: string;
  lang?: string;
  basePath?: string;
  cssBundle?: string;
  jsBundle?: string;
  nonce?: string;
  meta?: Record<string, string>[];
}

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
}

/**
 * Hydration options for client
 */
export interface HydrationOptions {
  autoRestoreAuth?: boolean;
  autoCacheData?: boolean;
  debug?: boolean;
}
