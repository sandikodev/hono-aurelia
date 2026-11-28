/**
 * @hono/aurelia/client Soft Navigation & Preload Controller
 *
 * Bridges initial SSR hydration (`@aureliajs/ssr/client`) with SPA-grade soft navigation,
 * hover/tap data prefetching (`data-au-preload`), and in-place loader revalidation (`invalidate`)
 * backed by `@hono/aurelia`'s content-negotiated JSON `dataEndpoint`.
 */

import {
  AppTask,
  Aurelia,
  CustomElement,
  IAppRoot,
  Registration,
  type Constructable,
} from 'aurelia';
import {
  decodeHydrationPayload,
  hydrateFromServer,
  IRequestContext,
  peekHydrationPayload,
  type ClientHydratorOptions,
  type HydrationPayload,
  type HydrationResult,
  type IRequestContextType,
} from '@aureliajs/ssr/client';
import {
  AuEnhanceCustomAttribute,
  IAureliaClientNavigator,
  type ClientNavigatorController,
} from './enhance';

/** Component- or navigator-level hook for per-history-entry form/tab state. */
export interface HistorySnapshotHook {
  capture(): unknown;
  restore(value: unknown): void;
}

export interface ClientNavigatorOptions<
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TData = Record<string, unknown>,
> extends ClientHydratorOptions<TContext, TData> {
  /** Intercept same-origin `<a>` clicks for soft client navigation (default: `true`). */
  interceptLinks?: boolean;
  /** Enable `data-au-preload="hover|tap"` link prefetching (default: `true`). */
  preload?: boolean;
  /** Time-to-live in ms for preloaded route JSON entries (default: `5000`). */
  preloadTtl?: number;
  /**
   * Fallback snapshot hook when the active component does not expose one.
   * A hook on the component instance takes precedence.
   */
  snapshot?: HistorySnapshotHook;
  /** Custom `fetch` implementation (useful for hermetic unit testing without network). */
  fetch?: typeof fetch;
}

function asSnapshotHook(value: unknown): HistorySnapshotHook | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Partial<HistorySnapshotHook>;
  return typeof candidate.capture === 'function' && typeof candidate.restore === 'function'
    ? (candidate as HistorySnapshotHook)
    : null;
}

interface RouteDataEnvelope<
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TData = Record<string, unknown>,
> extends HydrationPayload<TContext, TData> {
  readonly title?: string;
}

interface CachedPreload<
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TData = Record<string, unknown>,
> {
  readonly expiresAt: number;
  readonly promise: Promise<RouteDataEnvelope<TContext, TData> | null>;
}

function kebabCase(str: string): string {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function indexComponents(
  components: readonly Constructable[] | Readonly<Record<string, Constructable>>
): ReadonlyMap<string, Constructable> {
  const map = new Map<string, Constructable>();
  const registerComp = (comp: Constructable, explicitKey?: string) => {
    if (explicitKey) map.set(explicitKey, comp);
    if (CustomElement.isType(comp)) {
      map.set(CustomElement.getDefinition(comp).name, comp);
    }
    if (comp.name) {
      map.set(comp.name, comp);
      map.set(kebabCase(comp.name), comp);
    }
  };

  if (Array.isArray(components)) {
    for (const comp of components) registerComp(comp);
  } else {
    for (const [key, comp] of Object.entries(components)) {
      registerComp(comp, key);
    }
  }
  return map;
}

function resolveHostElement(doc: Document, target?: string | HTMLElement): HTMLElement | null {
  if (target && typeof target !== 'string') return target;
  if (typeof target === 'string') return doc.querySelector<HTMLElement>(target);
  return (
    doc.querySelector<HTMLElement>('app-root') ??
    doc.getElementById('ssr-root') ??
    doc.body
  );
}

function findAnchor(target: EventTarget | null, boundary: Node): HTMLAnchorElement | null {
  let node = target as Node | null;
  while (node && node !== boundary) {
    if (
      node.nodeType === 1 &&
      (node as Element).tagName.toUpperCase() === 'A' &&
      (node as HTMLAnchorElement).hasAttribute('href')
    ) {
      return node as HTMLAnchorElement;
    }
    node = node.parentNode;
  }
  return null;
}

function isEligibleLink(anchor: HTMLAnchorElement, currentOrigin: string): URL | null {
  if (anchor.hasAttribute('download')) return null;
  if (anchor.hasAttribute('data-au-reload')) return null;
  const targetAttr = anchor.getAttribute('target');
  if (targetAttr && targetAttr !== '_self') return null;
  const rel = anchor.getAttribute('rel') ?? '';
  if (/\bexternal\b/i.test(rel)) return null;

  const rawHref = anchor.getAttribute('href');
  if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
    return null;
  }

  try {
    const resolved = new URL(rawHref, currentOrigin);
    if (resolved.origin !== currentOrigin) return null;
    return resolved;
  } catch {
    return null;
  }
}

export async function createClientNavigator<
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TData = Record<string, unknown>,
>(options: ClientNavigatorOptions<TContext, TData>): Promise<ClientNavigatorController | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  const win = window;
  const doc = document;
  const initialHost = resolveHostElement(doc, options.target);
  if (!initialHost) {
    const err = new Error('[createClientNavigator] Target host element not found.');
    options.onError?.(err);
    return null;
  }

  let host: HTMLElement = initialHost;

  const fetcher = options.fetch ?? fetch;
  const preloadTtl = options.preloadTtl ?? 5_000;
  const registry = indexComponents(options.components);
  const preloadCache = new Map<string, CachedPreload<TContext, TData>>();

  let activeApp: Aurelia | null = null;
  let activeComponentName = '';
  let activeInstance: object | null = null;
  let activeUrl = win.location?.href ?? 'http://localhost/';
  let mutableContext: {
    data: TContext;
    url: string;
    params: Record<string, string>;
    query: Record<string, string>;
    isServer: boolean;
    isClient: boolean;
  } | null = null;
  let navEpoch = 0;

  // Per-entry snapshot bookkeeping. The key lives in history.state while the
  // serialized value lives in sessionStorage, so a reload does not grow URLs.
  const snapshotPrefix = 'aurelia:snapshot:';
  let snapshotCounter = 0;
  let currentSnapshotKey: string | null = null;

  const nextSnapshotKey = (): string => `${snapshotPrefix}${Date.now().toString(36)}-${++snapshotCounter}`;
  const readSnapshot = (key: string): unknown => {
    try {
      const raw = win.sessionStorage?.getItem(key);
      return raw == null ? undefined : JSON.parse(raw);
    } catch {
      return undefined;
    }
  };
  const writeSnapshot = (key: string, value: unknown): void => {
    try {
      win.sessionStorage?.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be unavailable or full; navigation must still proceed.
    }
  };
  const activeSnapshotHook = (): HistorySnapshotHook | null =>
    asSnapshotHook((activeInstance as Record<string, unknown> | null)?.snapshot) ?? options.snapshot ?? null;

  const captureActiveSnapshot = (): void => {
    if (!currentSnapshotKey) return;
    const hook = activeSnapshotHook();
    if (!hook) return;
    try {
      writeSnapshot(currentSnapshotKey, hook.capture());
    } catch {
      // A component hook must not be able to break navigation.
    }
  };
  const restoreSnapshot = (key: string | null): void => {
    if (!key) return;
    const value = readSnapshot(key);
    if (value === undefined) return;
    const hook = activeSnapshotHook();
    if (!hook) return;
    try {
      hook.restore(value);
    } catch (error) {
      options.onError?.(error);
    }
  };

  const mountComponent = async (
    compName: string,
    ComponentClass: Constructable,
    contextData: TContext,
    initialData: TData | undefined,
    urlStr: string,
    params?: Readonly<Record<string, string>>,
    ssrScope?: HydrationResult<TData, TContext>['ssrScope'],
    epoch?: number
  ): Promise<object> => {
    const isStale = (): boolean => epoch !== undefined && epoch !== navEpoch;
    const discardApp = async (app: Aurelia): Promise<void> => {
      try {
        await app.stop(true);
        app.dispose();
      } catch {
        // Ignore teardown errors from an abandoned concurrent mount
      }
    };

    const hadPriorApp = activeApp !== null;
    if (activeApp) {
      try {
        await activeApp.stop(true);
        activeApp.dispose();
      } catch {
        // Ignore teardown errors during rapid route transitions
      }
      activeApp = null;
    }

    // A newer navigation took over while the previous app was tearing down.
    if (isStale()) {
      return activeInstance ?? {};
    }

    if (hadPriorApp && !ssrScope) {
      if (host.parentNode && host.tagName.toUpperCase() !== 'BODY') {
        const freshHost = host.cloneNode(false) as HTMLElement;
        host.replaceWith(freshHost);
        host = freshHost;
      }
    }

    const parsedUrl = new URL(urlStr, win.location?.origin || 'http://localhost');
    mutableContext = {
      data: contextData,
      url: parsedUrl.toString(),
      params: { ...params },
      query: Object.fromEntries(parsedUrl.searchParams),
      isServer: false,
      isClient: true,
    };

    const app = new Aurelia();
    app.register(
      Registration.instance(IRequestContext, mutableContext as IRequestContextType<TContext>),
      Registration.instance(IAureliaClientNavigator, controller),
      AuEnhanceCustomAttribute
    );

    if (options.registrations && options.registrations.length > 0) {
      app.register(...options.registrations);
    }

    if (initialData && typeof initialData === 'object') {
      const props = initialData;
      app.register(
        AppTask.activating(IAppRoot, (root) => {
          Object.assign(root.controller.viewModel as object, props);
        })
      );
    }

    if (ssrScope) {
      const root = await app.hydrate({
        host,
        component: ComponentClass,
        ssrScope,
      });
      if (isStale()) {
        await discardApp(app);
        return activeInstance ?? {};
      }
      activeApp = app;
      activeComponentName = compName;
      activeInstance = root.controller.viewModel as object;
      activeUrl = parsedUrl.toString();
      return activeInstance;
    }

    host.replaceChildren();
    await app.app({ host, component: ComponentClass }).start();
    if (isStale()) {
      await discardApp(app);
      return activeInstance ?? {};
    }
    activeApp = app;
    activeComponentName = compName;
    activeInstance = app.root.controller.viewModel as object;
    activeUrl = parsedUrl.toString();
    return activeInstance;
  };

  const fetchRouteEnvelope = async (targetUrl: string): Promise<RouteDataEnvelope<TContext, TData> | null> => {
    const response = await fetcher(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return null;
    }

    const parsed = (await response.json()) as RouteDataEnvelope<TContext, TData>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.component !== 'string') {
      return null;
    }
    return parsed;
  };

  const commitHistory = (
    resolvedUrl: URL,
    historyMode: 'push' | 'replace' | 'none',
    snapshotKey: string
  ): void => {
    const state = {
      ...(win.history?.state as Record<string, unknown> | undefined),
      aureliaUrl: resolvedUrl.toString(),
      aureliaSnapshotKey: snapshotKey,
    };
    if (historyMode === 'push' && win.history?.pushState) {
      win.history.pushState(state, '', resolvedUrl.pathname + resolvedUrl.search + resolvedUrl.hash);
    } else if (historyMode === 'replace' && win.history?.replaceState) {
      win.history.replaceState(state, '', resolvedUrl.pathname + resolvedUrl.search + resolvedUrl.hash);
    }
    currentSnapshotKey = snapshotKey;
  };

  const applyEnvelope = async (
    envelope: RouteDataEnvelope<TContext, TData>,
    resolvedUrl: URL,
    historyMode: 'push' | 'replace' | 'none',
    epoch: number,
    snapshotKey: string
  ): Promise<object | null> => {
    if (epoch !== navEpoch) {
      return activeInstance;
    }

    const decoded = decodeHydrationPayload<TData, TContext>(envelope);
    const nextCompName = decoded.component;
    const NextClass = registry.get(nextCompName) ?? options.fallback;

    if (!NextClass) {
      return null;
    }

    if (envelope.title) {
      doc.title = envelope.title;
    }

    // Same-component transition: update DI request context & reactive view-model properties in place
    if (activeInstance && nextCompName === activeComponentName && mutableContext) {
      mutableContext.url = resolvedUrl.toString();
      mutableContext.query = Object.fromEntries(resolvedUrl.searchParams);
      mutableContext.params = { ...decoded.params };
      mutableContext.data = decoded.context;
      if (decoded.initialData && typeof decoded.initialData === 'object') {
        Object.assign(activeInstance, decoded.initialData);
      }
      activeUrl = resolvedUrl.toString();
      commitHistory(resolvedUrl, historyMode, snapshotKey);
      return activeInstance;
    }

    const instance = await mountComponent(
      nextCompName,
      NextClass,
      decoded.context,
      decoded.initialData,
      resolvedUrl.toString(),
      decoded.params,
      undefined,
      epoch
    );

    if (epoch !== navEpoch) {
      return activeInstance;
    }

    commitHistory(resolvedUrl, historyMode, snapshotKey);
    return instance;
  };

  const listenersCleanup: Array<() => void> = [];

  const controller: ClientNavigatorController = {
    get currentInstance() {
      return activeInstance;
    },
    get currentUrl() {
      return activeUrl;
    },

    async preload(url: string): Promise<void> {
      const origin = new URL(activeUrl).origin;
      const resolved = new URL(url, origin);
      if (resolved.origin !== origin) return;
      const key = resolved.pathname + resolved.search;
      const now = Date.now();
      const hit = preloadCache.get(key);
      if (hit && hit.expiresAt > now) {
        await hit.promise;
        return;
      }
      const promise = fetchRouteEnvelope(resolved.toString()).catch(() => null);
      preloadCache.set(key, { expiresAt: now + preloadTtl, promise });
      await promise;
    },

    async navigate(url: string, navOpts?: { replace?: boolean }): Promise<object | null> {
      const epoch = ++navEpoch;
      const replace = navOpts?.replace === true;
      captureActiveSnapshot();
      const snapshotKey = replace
        ? (currentSnapshotKey ?? nextSnapshotKey())
        : nextSnapshotKey();
      const origin = new URL(activeUrl).origin;
      const resolved = new URL(url, origin);
      if (resolved.origin !== origin) {
        win.location?.assign(resolved.toString());
        return null;
      }
      const key = resolved.pathname + resolved.search;
      const now = Date.now();
      const cached = preloadCache.get(key);
      preloadCache.delete(key);

      const envelope =
        cached && cached.expiresAt > now
          ? await cached.promise
          : await fetchRouteEnvelope(resolved.toString());

      if (epoch !== navEpoch) {
        return activeInstance;
      }

      if (!envelope) {
        win.location?.assign(resolved.toString());
        return null;
      }

      return await applyEnvelope(envelope, resolved, replace ? 'replace' : 'push', epoch, snapshotKey);
    },

    async invalidate(url?: string): Promise<void> {
      const epoch = ++navEpoch;
      captureActiveSnapshot();
      const snapshotKey = currentSnapshotKey ?? nextSnapshotKey();
      preloadCache.clear();
      const target = url ?? activeUrl;
      const origin = new URL(activeUrl).origin;
      const resolved = new URL(target, origin);
      if (resolved.origin !== origin) return;
      const envelope = await fetchRouteEnvelope(resolved.toString());
      if (envelope) {
        await applyEnvelope(envelope, resolved, 'none', epoch, snapshotKey);
      }
    },

    dispose(): void {
      preloadCache.clear();
      for (const off of listenersCleanup) {
        off();
      }
      listenersCleanup.length = 0;
    },
  };

  // Initial boot from SSR hydration script
  const peekedComponent = peekHydrationPayload(options.scriptId)?.component;
  const hydration = hydrateFromServer<TData, TContext>({
    scriptId: options.scriptId,
    maxAge: options.maxAge,
  });

  const bootName = hydration?.component ?? peekedComponent ?? '';
  const BootClass = (bootName ? registry.get(bootName) : undefined) ?? options.fallback;

  if (!BootClass) {
    const err = new Error(
      `[createClientNavigator] No component registered for "${bootName}". Available: ${Array.from(registry.keys()).join(', ')}`
    );
    options.onError?.(err);
    return null;
  }

  const bootedInstance = await mountComponent(
    bootName || BootClass.name,
    BootClass,
    (hydration?.context ?? {}) as TContext,
    hydration?.initialData,
    activeUrl,
    hydration?.params,
    hydration?.ssrScope
  );
  const initialHistoryState = (win.history?.state as Record<string, unknown> | null) ?? {};
  const existingSnapshotKey =
    typeof initialHistoryState.aureliaSnapshotKey === 'string'
      ? initialHistoryState.aureliaSnapshotKey
      : null;
  currentSnapshotKey = existingSnapshotKey ?? nextSnapshotKey();
  if (!existingSnapshotKey && win.history?.replaceState) {
    win.history.replaceState(
      { ...initialHistoryState, aureliaSnapshotKey: currentSnapshotKey },
      ''
    );
  }

  options.onHydrated?.(bootName || BootClass.name, bootedInstance, hydration);

  // Delegated link click interception
  if (options.interceptLinks !== false) {
    const onClick = (ev: MouseEvent) => {
      if (ev.defaultPrevented || ev.button !== 0) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      const anchor = findAnchor(ev.target, doc);
      if (!anchor) return;
      const origin = new URL(activeUrl).origin;
      const resolved = isEligibleLink(anchor, origin);
      if (!resolved) return;

      ev.preventDefault();
      void controller.navigate(resolved.toString());
    };
    doc.addEventListener('click', onClick);
    listenersCleanup.push(() => doc.removeEventListener('click', onClick));
  }

  // Back/forward: capture the outgoing entry, then restore the incoming entry's
  // snapshot after its component has mounted.
  const onPopState = (ev: PopStateEvent) => {
    if (!win.location) return;
    const state = (ev.state as { aureliaSnapshotKey?: unknown } | null) ?? null;
    const targetKey =
      typeof state?.aureliaSnapshotKey === 'string'
        ? state.aureliaSnapshotKey
        : (currentSnapshotKey ?? nextSnapshotKey());
    captureActiveSnapshot();
    const epoch = ++navEpoch;
    const resolved = new URL(win.location.href);
    void fetchRouteEnvelope(resolved.toString()).then(async (env) => {
      if (!env || epoch !== navEpoch) return;
      await applyEnvelope(env, resolved, 'none', epoch, targetKey);
      restoreSnapshot(targetKey);
    });
  };
  win.addEventListener('popstate', onPopState);
  listenersCleanup.push(() => win.removeEventListener('popstate', onPopState));

  // Delegated hover/tap preloading (`data-au-preload="hover"` | `data-au-preload="tap"` | `data-au-preload`)
  if (options.preload !== false) {
    const maybePreload = (ev: Event, mode: 'hover' | 'tap') => {
      const anchor = findAnchor(ev.target, doc);
      if (!anchor) return;
      const preloadContainer = anchor.closest('[data-au-preload]');
      if (!preloadContainer) return;
      const rawVal = (preloadContainer.getAttribute('data-au-preload') || 'hover').trim().toLowerCase();
      if (rawVal === 'off' || rawVal === 'false') return;
      if (mode === 'hover' && rawVal !== 'hover' && rawVal !== '' && rawVal !== 'true') return;

      const origin = new URL(activeUrl).origin;
      const resolved = isEligibleLink(anchor, origin);
      if (resolved) {
        void controller.preload(resolved.toString());
      }
    };

    const onPointerOver = (ev: Event) => maybePreload(ev, 'hover');
    const onPointerDown = (ev: Event) => maybePreload(ev, 'tap');
    doc.addEventListener('mouseover', onPointerOver, { passive: true });
    doc.addEventListener('pointerdown', onPointerDown, { passive: true });
    listenersCleanup.push(() => {
      doc.removeEventListener('mouseover', onPointerOver);
      doc.removeEventListener('pointerdown', onPointerDown);
    });
  }

  return controller;
}
