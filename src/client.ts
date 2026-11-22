/**
 * @hono/aurelia Client Entrypoint
 *
 * Lightweight, zero-server-leak client hydration utilities for Aurelia 2 on Hono.
 * Re-exports the client-side hydration engine from @aureliajs/ssr/client.
 */

export {
  hydrateFromServer,
  isHydrationAvailable,
  peekHydrationPayload,
  clearHydration,
  createClientHydrator,
  IRequestContext,
  resolveRequestContext,
  DEFAULT_SCRIPT_ID,
  type AureliaComponent,
  type ComponentProps,
  type RenderContext,
  type HydrationPayload,
  type HydrationResult,
  type HydrateFromServerOptions,
  type ClientHydratorOptions,
  type IRequestContextType,
} from '@aureliajs/ssr/client';
