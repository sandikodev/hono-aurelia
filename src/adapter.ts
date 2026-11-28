/**
 * @hono/aurelia Route & Action Adapter
 *
 * Ultra-thin, zero-cast, Web-Standards-compliant Hono adapter for Aurelia 2 SSR.
 * - Scoped defaults via `WeakMap<Request, AureliaDefaultsOptions>` (zero `c.var` pollution).
 * - True Web Streams streaming SSR (flushes `<head>` before awaiting SSR render).
 * - Zero Node filesystem imports — 100% Edge/Bun/Deno/Node compatible.
 */

import type { Context, Env, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { CustomElement } from 'aurelia';
import {
  DEFAULT_SCRIPT_ID,
  createDeferredScript,
  createDocumentShell,
  createHtmlDocument,
  createHydrationScript,
  renderAurelia,
  serializeState,
  serializeStateStream,
  stringifyPayload,
  type AureliaComponent,
  type ComponentProps,
  type DeferredPromiseEntry,
  type RenderContext,
} from '@aureliajs/ssr';
import type {
  AureliaActionHandler,
  AureliaActionMap,
  AureliaActionOptions,
  AureliaActionSource,
  AureliaCsrfOptions,
  AureliaDefaultsOptions,
  AureliaLayoutOptions,
  AureliaLoader,
  AureliaRouteComponent,
  AureliaRouteConfig,
} from './types';

/**
 * Per-request scoped defaults keyed by the Web Standard `Request` instance.
 * Avoids polluting Hono's `c.var`, requires zero type casts, and auto-GCs with the request.
 */
const defaultsByRequest = new WeakMap<Request, unknown>();
const layoutDataByRequest = new WeakMap<Request, Record<string, unknown>>();

/**
 * Hono middleware registering router-scoped defaults for downstream `aurelia()` handlers.
 * Canonical alias: `aureliaRenderer` (matching `@hono/react-renderer` mental model).
 */
export function aureliaDefaults<E extends Env = Env>(
  defaults: AureliaDefaultsOptions<E> = {}
): MiddlewareHandler<E> {
  return async (c, next) => {
    const existing = defaultsByRequest.get(c.req.raw) as AureliaDefaultsOptions<E> | undefined;
    const defaultCss =
      defaults.document?.cssBundle === false
        ? false
        : (defaults.document?.cssBundle ?? existing?.document?.cssBundle ?? '/style.css');
    const defaultJs =
      defaults.document?.jsBundle === false
        ? false
        : (defaults.document?.jsBundle ?? existing?.document?.jsBundle ?? '/client.js');

    const merged: AureliaDefaultsOptions<E> = {
      ...existing,
      ...defaults,
      document: {
        cssBundle: defaultCss,
        jsBundle: defaultJs,
        ...existing?.document,
        ...defaults.document,
      },
    };
    defaultsByRequest.set(c.req.raw, merged);

    c.setRenderer(async (componentOrContent: unknown, options?: unknown) => {
      if (
        typeof componentOrContent === 'function' ||
        (typeof componentOrContent === 'object' &&
          componentOrContent !== null &&
          ('template' in componentOrContent ||
            (componentOrContent.constructor && CustomElement.isType(componentOrContent.constructor))))
      ) {
        const handler = aurelia<E>({
          component: componentOrContent as AureliaComponent,
          ...(typeof options === 'object' && options !== null ? options : {}),
          ...(typeof options === 'string' ? { title: options } : {}),
        });
        return handler(c);
      }
      return c.html(String(componentOrContent));
    });

    await next();
  };
}

/**
 * Idiomatic Hono alias matching the `@hono/react-renderer` middleware naming convention.
 */
export const aureliaRenderer = aureliaDefaults;

/**
 * Hono middleware executing a parent layout data loader whose returned props cascade
 * into downstream `aurelia()` route handlers on the same request (`{ ...layoutData, ...pageData }`).
 * Returning a `Response` (such as a `302` redirect) short-circuits downstream handlers immediately.
 */
export function aureliaLayout<
  E extends Env = Env,
  TData extends Record<string, unknown> = Record<string, unknown>,
>(
  loaderOrOptions: AureliaLoader<E, TData> | AureliaLayoutOptions<E, TData>
): MiddlewareHandler<E> {
  const loader =
    typeof loaderOrOptions === 'function' ? loaderOrOptions : loaderOrOptions.loader;

  return async (c, next) => {
    const result = await loader(c);
    if (result instanceof Response) {
      return result;
    }
    if (result && typeof result === 'object') {
      const prev = layoutDataByRequest.get(c.req.raw) ?? {};
      layoutDataByRequest.set(c.req.raw, { ...prev, ...result });
    }
    await next();
    return;
  };
}

function containsPromise(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (typeof (value as { then?: unknown }).then === 'function') return true;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => containsPromise(item, seen));
  }
  if (value instanceof Map) {
    for (const [k, v] of value.entries()) {
      if (containsPromise(k, seen) || containsPromise(v, seen)) return true;
    }
    return false;
  }
  if (value instanceof Set) {
    for (const item of value) {
      if (containsPromise(item, seen)) return true;
    }
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  for (const val of Object.values(value)) {
    if (containsPromise(val, seen)) return true;
  }
  return false;
}

function parseMimeQuality(acceptHeader: string, mime: string): number {
  const lower = acceptHeader.toLowerCase();
  const idx = lower.indexOf(mime);
  if (idx === -1) return 0;
  const segment = acceptHeader.slice(idx + mime.length).split(',')[0] ?? '';
  const qMatch = /;\s*q=([0-9.]+)/i.exec(segment);
  if (!qMatch?.[1]) return 1;
  const value = Number(qMatch[1]);
  return Number.isFinite(value) ? value : 0;
}

function acceptsJsonOverHtml(acceptHeader?: string): boolean {
  if (!acceptHeader || !acceptHeader.includes('application/json')) return false;
  if (!acceptHeader.includes('text/html')) return true;
  return parseMimeQuality(acceptHeader, 'application/json') > parseMimeQuality(acceptHeader, 'text/html');
}

function acceptsHtmlOverJson(acceptHeader?: string): boolean {
  if (!acceptHeader || !acceptHeader.includes('text/html')) return false;
  if (!acceptHeader.includes('application/json')) return true;
  return parseMimeQuality(acceptHeader, 'text/html') >= parseMimeQuality(acceptHeader, 'application/json');
}

function resolveComponentName(component: unknown): string {
  if (!component) return 'Page';
  if (typeof component === 'function' && CustomElement.isType(component)) {
    return CustomElement.getDefinition(component).name;
  }
  if (
    typeof component === 'object' &&
    component.constructor &&
    CustomElement.isType(component.constructor)
  ) {
    return CustomElement.getDefinition(component.constructor).name;
  }
  const named = component as { name?: string };
  return named.name || 'Page';
}

function isRouteConfig<
  E extends Env,
  TComponent extends object,
  TData extends Record<string, unknown>,
>(value: unknown): value is AureliaRouteConfig<E, TComponent, TData> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    'component' in (value as Record<string, unknown>) &&
    !CustomElement.isType((value as object).constructor)
  );
}

/**
 * Aurelia 2 SSR route handler factory for Hono.
 */
export function aurelia<
  E extends Env = Env,
  TComponent extends object = object,
  TData extends Record<string, unknown> = ComponentProps<TComponent>,
>(config: AureliaRouteConfig<E, TComponent, TData>): (c: Context<E>) => Promise<Response>;
export function aurelia<
  E extends Env = Env,
  TComponent extends object = object,
  TData extends Record<string, unknown> = ComponentProps<TComponent>,
>(
  component: AureliaComponent<TComponent>,
  options?: Omit<AureliaRouteConfig<E, TComponent, TData>, 'component'>
): (c: Context<E>) => Promise<Response>;
export function aurelia<
  E extends Env = Env,
  TComponent extends object = object,
  TData extends Record<string, unknown> = ComponentProps<TComponent>,
>(
  component: AureliaComponent<TComponent>,
  title?: string | ((data: TData, c: Context<E>) => string)
): (c: Context<E>) => Promise<Response>;
export function aurelia<
  E extends Env = Env,
  TComponent extends object = object,
  TData extends Record<string, unknown> = ComponentProps<TComponent>,
>(
  configOrComponent:
    | AureliaRouteConfig<E, TComponent, TData>
    | AureliaComponent<TComponent>,
  maybeConfigOrTitle?:
    | string
    | ((data: TData, c: Context<E>) => string)
    | Omit<AureliaRouteConfig<E, TComponent, TData>, 'component'>
): (c: Context<E>) => Promise<Response> {
  let config: AureliaRouteConfig<E, TComponent, TData>;
  if (isRouteConfig<E, TComponent, TData>(configOrComponent)) {
    config = configOrComponent;
  } else if (
    maybeConfigOrTitle &&
    typeof maybeConfigOrTitle === 'object' &&
    typeof maybeConfigOrTitle !== 'function'
  ) {
    config = {
      component: configOrComponent,
      ...maybeConfigOrTitle,
    };
  } else {
    config = {
      component: configOrComponent,
      title: maybeConfigOrTitle as string | ((data: TData, c: Context<E>) => string) | undefined,
    };
  }

  const compMeta = config.component as unknown as
    | AureliaRouteComponent<E, TComponent, TData>
    | null
    | undefined;

  return async (c: Context<E>): Promise<Response> => {
    const scoped = defaultsByRequest.get(c.req.raw) as AureliaDefaultsOptions<E> | undefined;

    const streaming = config.streaming ?? scoped?.streaming ?? false;
    const dataEndpoint = config.dataEndpoint ?? scoped?.dataEndpoint ?? false;
    const preserveMarkers = config.preserveMarkers ?? scoped?.preserveMarkers ?? true;
    const engine = config.engine ?? scoped?.engine;
    const fallback = config.fallback ?? compMeta?.fallback ?? scoped?.fallback ?? 'throw';
    const documentOpts = { ...scoped?.document, ...config.document };
    const serializeOpts = {
      ...scoped?.serialize,
      ...config.serialize,
      params: c.req.param(),
    };
    const onError = config.onError ?? scoped?.onError;
    const timeout = config.timeout ?? scoped?.timeout;
    const registrations = [...(scoped?.registrations ?? []), ...(config.registrations ?? [])];

    try {
      // 1. Extract request context (defaults directly to Hono's c.var without internal pollution)
      const contextResolver = config.context ?? scoped?.context;
      const context: RenderContext = contextResolver
        ? await contextResolver(c)
        : ((c.var as Record<string, unknown> | undefined) ?? {});

      // 2. Execute single typed loader merged atop any parent aureliaLayout() data
      const inheritedLayoutData = layoutDataByRequest.get(c.req.raw);
      const activeLoader = config.loader ?? compMeta?.loader;
      let pageData: Record<string, unknown> = {};

      if (typeof activeLoader === 'function') {
        try {
          const loaded = await activeLoader(c);
          if (loaded instanceof Response) {
            return loaded;
          }
          if (loaded && typeof loaded === 'object') {
            pageData = loaded;
          }
        } catch (loaderError) {
          if (fallback !== 'spa') throw loaderError;
        }
      }

      const initialData = (
        inheritedLayoutData ? { ...inheritedLayoutData, ...pageData } : pageData
      ) as TData;

      const componentName = resolveComponentName(config.component);

      // 3. Resolve title & HTTP status code
      const titleSource = config.title ?? compMeta?.title ?? compMeta?.name;
      const effectiveTitle =
        typeof titleSource === 'function'
          ? titleSource(initialData, c) || 'Aurelia App'
          : titleSource || 'Aurelia App';

      const statusSource = config.status ?? compMeta?.status;
      const effectiveStatus: ContentfulStatusCode =
        typeof statusSource === 'function'
          ? statusSource(initialData, c)
          : statusSource ?? 200;

      // 4. Opt-in JSON data endpoint (uses identical serializeState & replacer pipeline as HTML SSR)
      if (dataEndpoint && acceptsJsonOverHtml(c.req.header('Accept'))) {
        const payload = await serializeState(context, initialData, componentName, serializeOpts);
        const bodyJson = stringifyPayload({
          ...payload,
          title: effectiveTitle,
        });
        return c.body(bodyJson, effectiveStatus, {
          'Content-Type': 'application/json; charset=utf-8',
          Vary: 'Accept',
        });
      }

      const renderOptions = {
        component: config.component,
        context,
        props: initialData as ComponentProps<TComponent>,
        url: c.req.url,
        params: c.req.param(),
        query: c.req.query(),
        engine,
        preserveMarkers,
        registrations: registrations.length > 0 ? registrations : undefined,
        timeout,
      };

      // 5. True Web Streams streaming SSR: flush <head> immediately before awaiting SSR body
      if (streaming && !documentOpts.template) {
        const shell = createDocumentShell({
          title: effectiveTitle,
          ...documentOpts,
        });
        const scriptId = documentOpts.scriptId ?? DEFAULT_SCRIPT_ID;
        const encoder = new TextEncoder();

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              // Flush <head> + CSS links immediately for near-zero TTFB
              controller.enqueue(encoder.encode(shell.preamble));

              let html = '';
              try {
                html = await renderAurelia(renderOptions);
              } catch (renderError) {
                if (fallback === 'spa') {
                  html = '';
                } else {
                  throw renderError;
                }
              }

              const useDeferredStream =
                serializeOpts?.richTypes === true ||
                containsPromise(initialData) ||
                containsPromise(context);

              if (useDeferredStream) {
                const { payload, pending } = serializeStateStream(
                  context,
                  initialData,
                  componentName,
                  {
                    ...serializeOpts,
                    richTypes: true,
                  }
                );

                controller.enqueue(encoder.encode(html));
                controller.enqueue(
                  encoder.encode(`\n    ${createHydrationScript(payload, scriptId)}`)
                );

                let nextNestedIndex = 0;
                const drainPending = async (
                  entries: readonly DeferredPromiseEntry[]
                ): Promise<void> => {
                  const nestedTasks: Promise<void>[] = [];
                  await Promise.all(
                    entries.map((entry) =>
                      entry.promise.then(
                        (resolvedValue) => {
                          const nestedEntries: DeferredPromiseEntry[] = [];
                          const scriptChunk = createDeferredScript(entry.id, resolvedValue, {
                            replacer: serializeOpts?.replacer,
                            onPromise: (nestedPromise) => {
                              const nestedId = `dn${++nextNestedIndex}`;
                              nestedPromise.then(undefined, () => {});
                              nestedEntries.push({ id: nestedId, promise: nestedPromise });
                              return nestedId;
                            },
                          });
                          controller.enqueue(encoder.encode(`\n    ${scriptChunk}`));
                          if (nestedEntries.length > 0) {
                            nestedTasks.push(drainPending(nestedEntries));
                          }
                        },
                        (rejectedError) => {
                          const errorChunk = createDeferredScript(entry.id, undefined, {
                            error: rejectedError,
                          });
                          controller.enqueue(encoder.encode(`\n    ${errorChunk}`));
                        }
                      )
                    )
                  );
                  if (nestedTasks.length > 0) {
                    await Promise.all(nestedTasks);
                  }
                };

                if (pending.length > 0) {
                  await drainPending(pending);
                }

                controller.enqueue(encoder.encode(shell.postamble));
                controller.close();
                return;
              }

              const payload = await serializeState(
                context,
                initialData,
                componentName,
                serializeOpts
              );

              controller.enqueue(encoder.encode(html));
              controller.enqueue(encoder.encode(`\n    ${createHydrationScript(payload, scriptId)}`));
              controller.enqueue(encoder.encode(shell.postamble));
              controller.close();
            } catch (streamError) {
              controller.error(streamError);
            }
          },
        });

        return c.body(stream, effectiveStatus, {
          'Content-Type': 'text/html; charset=utf-8',
          'Transfer-Encoding': 'chunked',
        });
      }

      // 6. Buffered HTML5 SSR response
      let html = '';
      try {
        html = await renderAurelia(renderOptions);
      } catch (renderError) {
        if (fallback === 'spa') {
          html = '';
        } else {
          throw renderError;
        }
      }

      const payload = await serializeState(context, initialData, componentName, serializeOpts);
      const document = createHtmlDocument(html, payload, {
        title: effectiveTitle,
        ...documentOpts,
      });

      return c.html(document, effectiveStatus, { Vary: 'Accept' });
    } catch (error) {
      if (typeof onError === 'function') {
        return await onError(error, c);
      }
      throw error;
    }
  };
}

function hasActionsObject<E extends Env>(
  source: AureliaActionSource<E>
): source is { readonly actions: AureliaActionMap<E> } {
  return (
    'actions' in source &&
    typeof source.actions === 'object' &&
    source.actions !== null
  );
}

function hasSingleAction<E extends Env>(
  source: AureliaActionSource<E>
): source is { readonly action: AureliaActionHandler<E> } {
  return 'action' in source && typeof source.action === 'function';
}

function isCsrfAllowed(req: Request, csrfOption?: boolean | AureliaCsrfOptions): boolean {
  if (csrfOption === false) return true;
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  const opts: AureliaCsrfOptions = typeof csrfOption === 'object' ? csrfOption : {};
  const trusted = new Set(opts.trustedOrigins ?? []);
  const reqOrigin = new URL(req.url).origin;
  const originHeader = req.headers.get('origin');
  const secFetchSite = req.headers.get('sec-fetch-site');

  if (secFetchSite === 'cross-site') {
    return false;
  }

  if (originHeader !== null) {
    return originHeader === reqOrigin || trusted.has(originHeader);
  }

  if (secFetchSite !== null) {
    return secFetchSite === 'same-origin' || secFetchSite === 'none';
  }

  return !opts.requireOriginOnForms;
}

function buildPrgLocation(reqUrl: string): string {
  const parsed = new URL(reqUrl);
  parsed.searchParams.delete('_action');
  const qs = parsed.searchParams.toString();
  return qs ? `${parsed.pathname}?${qs}` : parsed.pathname;
}

/**
 * Strictly typed explicit Hono route handler for Aurelia server actions.
 *
 * Accepts either a named action map `{ like, comment }` or a component exposing
 * static `actions` / `action`. Enforces Fetch-spec CSRF validation by default and
 * supports Post/Redirect/Get (PRG) fallback for non-JS HTML `<form>` submissions.
 */
export function aureliaAction<E extends Env = Env>(
  source: AureliaActionSource<E>,
  options?: AureliaActionOptions<E>
): (c: Context<E>) => Promise<Response> {
  const actionMap: AureliaActionMap<E> | undefined = hasActionsObject(source)
    ? source.actions
    : hasSingleAction(source)
      ? undefined
      : (source as AureliaActionMap<E>);

  const singleAction: AureliaActionHandler<E> | undefined = hasSingleAction(source)
    ? source.action
    : undefined;

  return async (c: Context<E>): Promise<Response> => {
    if (!isCsrfAllowed(c.req.raw, options?.csrf)) {
      return c.json({ error: 'Cross-site action request forbidden' }, 403);
    }

    const resolved = options?.resolveAction
      ? await options.resolveAction(c)
      : c.req.query('_action') || c.req.header('X-Action');
    const actionName = resolved || 'default';

    const handler =
      actionMap?.[actionName] ?? (actionName === 'default' ? singleAction : undefined);

    if (!handler) {
      if (actionMap && Object.keys(actionMap).length > 0) {
        return c.json({ error: `Action "${actionName}" not found` }, 404);
      }
      return c.text('Method Not Allowed', 405);
    }

    const result = await handler(c);
    if (result instanceof Response) {
      return result;
    }

    const isEnhanced = c.req.header('X-Aurelia-Enhance') === '1';
    if (!isEnhanced && acceptsHtmlOverJson(c.req.header('Accept'))) {
      const target =
        typeof options?.redirectTo === 'function'
          ? options.redirectTo(result, c)
          : (options?.redirectTo ?? buildPrgLocation(c.req.url));
      return c.redirect(target, 303);
    }

    return c.json(result !== undefined ? result : { success: true });
  };
}
