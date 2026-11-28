/**
 * @hono/aurelia Client Entrypoint
 *
 * Lightweight, zero-server-leak client hydration, soft-navigation, and progressive
 * form enhancement (`au-enhance`) utilities for Aurelia 2 on Hono.
 */

export {
  decodeHydrationPayload,
  decodeRichValue,
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

export {
  AuEnhanceCustomAttribute,
  EnhanceConfiguration,
  IAureliaClientNavigator,
  resolveClientNavigator,
  type ClientNavigatorController,
  type EnhanceAfterSubmit,
  type EnhanceResultContext,
  type EnhanceSubmitContext,
  type EnhanceSubmitHook,
} from './enhance';

export {
  createClientNavigator,
  type ClientNavigatorOptions,
  type HistorySnapshotHook,
} from './navigator';

export {
  createLiveStream,
  subscribeLive,
  parseLiveFrame,
  type LiveMessage,
  type LiveStreamController,
  type LiveStreamOptions,
} from './live-client';
