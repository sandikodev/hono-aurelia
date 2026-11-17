/**
 * @hono/aurelia Types
 * 
 * Thin adapter type definitions for Aurelia 2 SSR on Hono.
 */

import type { Context } from 'hono';
import type { DocumentOptions } from '@aureliajs/ssr';

export type { DocumentOptions } from '@aureliajs/ssr';

/**
 * Route configuration for aurelia() adapter
 */
export interface AureliaRouteConfig {
  component: unknown;
  title?: string;
  requiresAuth?: boolean;
  loaders?: {
    [key: string]: (c: Context) => Promise<unknown>;
  };
  actions?: {
    [key: string]: (c: Context) => Promise<unknown | Response>;
  };
  action?: (c: Context) => Promise<unknown | Response>;
  fallback?: 'spa' | 'error';
  document?: DocumentOptions;
  streaming?: boolean;
}

/**
 * Aurelia Component with optional co-located route metadata and loaders
 */
export interface AureliaComponentWithMetadata {
  name?: string;
  title?: string;
  requiresAuth?: boolean;
  loader?: (c: Context) => Promise<Record<string, unknown> | unknown>;
  loaders?: Record<string, (c: Context) => Promise<unknown>>;
  action?: (c: Context) => Promise<unknown | Response>;
  actions?: Record<string, (c: Context) => Promise<unknown | Response>>;
  fallback?: 'spa' | 'error';
  clientOnly?: boolean;
  serverOnly?: boolean;
}

/**
 * Configuration for aureliaDefaults() middleware
 */
export interface AureliaDefaultsOptions {
  document?: DocumentOptions;
  streaming?: boolean;
  fallback?: 'spa' | 'error';
}

/**
 * Options for serveAureliaAssets() static asset middleware
 */
export interface ServeAssetsOptions {
  root: string;
  prefix?: string;
  maxAge?: number;
}
