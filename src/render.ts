/**
 * @hono/aurelia-ssr Renderer
 * 
 * Production-grade Server-Side Rendering engine for Aurelia 2 on Hono.
 * Boots real Aurelia 2 components in an isolated server DOM environment with
 * concurrency mutex locks, environment snapshot/restore, and memory-safe caching.
 */

import { JSDOM } from 'jsdom';
import {
  Aurelia,
  CustomElement,
  PLATFORM,
  Registration,
  ITemplateElementFactory,
  IPlatform,
  DI,
  resolve,
  type Constructable,
} from 'aurelia';
import type { RenderOptions, RenderContext } from './types.js';

interface ISSRContext {
  readonly preserveMarkers: boolean;
}
const ISSRContext = /*@__PURE__*/ DI.createInterface<ISSRContext>('ISSRContext');

/**
 * Single-process FIFO mutex to prevent concurrent SSR requests from clobbering
 * shared Aurelia PLATFORM and DOM globals during the render critical section.
 */
class RenderMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  public async acquire(): Promise<() => void> {
    if (this.locked) {
      await new Promise<void>((resolvePromise) => this.queue.push(resolvePromise));
    }
    this.locked = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (this.queue.length > 0) {
        const next = this.queue.shift()!;
        next();
      } else {
        this.locked = false;
      }
    };
  }
}

const renderMutex = new RenderMutex();

/**
 * Cache for wrapped plain objects / plain classes to prevent defining
 * dynamic custom element classes on every request (which causes metadata leaks).
 */
const plainWrapperCache = new WeakMap<object, Constructable>();
let plainWrapperCounter = 0;

const DOM_PROPS = [
  'window',
  'document',
  'HTMLElement',
  'Element',
  'Node',
  'CustomEvent',
  'Event',
  'MutationObserver',
  'DocumentFragment',
  'CharacterData',
  'Comment',
  'Text',
  'HTMLTemplateElement',
  'CSSStyleSheet',
  'ShadowRoot',
  'customElements',
] as const;

/**
 * In-memory storage shim for localStorage and sessionStorage on server
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  public get length(): number {
    return this.store.size;
  }

  public clear(): void {
    this.store.clear();
  }

  public getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  public key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }

  public setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

/**
 * Install safe browser shims on the JSDOM window so components reading
 * window APIs during SSR do not throw errors.
 */
function installBrowserShims(win: Window & Record<string, unknown>): void {
  // localStorage / sessionStorage
  if (!win.localStorage) {
    Object.defineProperty(win, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  }
  if (!win.sessionStorage) {
    Object.defineProperty(win, 'sessionStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
  }

  // matchMedia shim
  if (!win.matchMedia) {
    win.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }

  // ResizeObserver shim
  if (!win.ResizeObserver) {
    win.ResizeObserver = class {
      public observe(): void {}
      public unobserve(): void {}
      public disconnect(): void {}
    };
  }

  // requestAnimationFrame / cancelAnimationFrame
  if (!win.requestAnimationFrame) {
    win.requestAnimationFrame = (callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), 16) as unknown as number;
  }
  if (!win.cancelAnimationFrame) {
    win.cancelAnimationFrame = (id: number) => clearTimeout(id);
  }

  // scrollTo / scroll
  if (!win.scrollTo) {
    win.scrollTo = () => {};
  }
  if (!win.scroll) {
    win.scroll = () => {};
  }
}

/**
 * Snapshot existing globalThis and PLATFORM properties before sync.
 */
function snapshotEnvironment(): {
  globalDescriptors: Map<string, PropertyDescriptor | undefined>;
  platformProps: Map<string, unknown>;
} {
  const globalDescriptors = new Map<string, PropertyDescriptor | undefined>();
  for (const prop of DOM_PROPS) {
    globalDescriptors.set(prop, Object.getOwnPropertyDescriptor(globalThis, prop));
  }

  const platformProps = new Map<string, unknown>();
  const p = PLATFORM as unknown as Record<string, unknown>;
  for (const prop of DOM_PROPS) {
    if (p && prop in p) {
      platformProps.set(prop, p[prop]);
    }
  }

  return { globalDescriptors, platformProps };
}

/**
 * Synchronize DOM window globals and Aurelia's BrowserPlatform
 */
function syncDomEnvironment(win: Window & Record<string, unknown>): void {
  const p = PLATFORM as unknown as Record<string, unknown>;
  for (const prop of DOM_PROPS) {
    if (win[prop] !== undefined) {
      Object.defineProperty(globalThis, prop, {
        value: win[prop],
        configurable: true,
        writable: true,
      });
      if (p && prop in p) {
        p[prop] = win[prop];
      }
    }
  }
}

/**
 * Restore previous environment state
 */
function restoreEnvironment(snapshot: {
  globalDescriptors: Map<string, PropertyDescriptor | undefined>;
  platformProps: Map<string, unknown>;
}): void {
  for (const [prop, desc] of snapshot.globalDescriptors.entries()) {
    if (desc !== undefined) {
      Object.defineProperty(globalThis, prop, desc);
    } else {
      delete (globalThis as Record<string, unknown>)[prop];
    }
  }

  const p = PLATFORM as unknown as Record<string, unknown>;
  for (const [prop, val] of snapshot.platformProps.entries()) {
    p[prop] = val;
  }
}

/**
 * Request-scoped TemplateElementFactory for Aurelia 2 SSR.
 * 
 * Standard Aurelia 2 TemplateElementFactory caches HTMLTemplateElement instances
 * across the entire process lifetime in a module-level dictionary (`markupCache`).
 * In multi-request SSR where each request creates and destroys its own JSDOM instance,
 * using cached template elements from a destroyed document causes AUR0757 mismatch errors.
 * 
 * This SSR factory creates fresh template elements within the active request's DOM document.
 */
class SsrTemplateElementFactory implements ITemplateElementFactory {
  private readonly platform = resolve(IPlatform);

  public createTemplate(input: string | Node): HTMLTemplateElement {
    if (typeof input === 'string') {
      const template = this.platform.document.createElement('template');
      template.innerHTML = input;
      return template;
    }
    if (input.nodeName !== 'TEMPLATE') {
      const template = this.platform.document.createElement('template');
      template.content.appendChild(input);
      return template;
    }
    return input as HTMLTemplateElement;
  }
}

/**
 * Render an Aurelia component to HTML string using real Aurelia 2 engine
 * 
 * @param options - Render options (component, context, props, timeout, registrations)
 * @returns Promise<string> - Rendered HTML
 * 
 * @example
 * ```typescript
 * const html = await renderAurelia({
 *   component: DashboardPage,
 *   context: { user, workspace, role },
 *   timeout: 5000,
 * });
 * ```
 */
export async function renderAurelia(options: RenderOptions): Promise<string> {
  const {
    component,
    context = { user: null, workspace: null, role: null },
    props = {},
    timeout = 5000,
  } = options;

  // Validate inputs
  if (!component) {
    throw new Error('renderAurelia: component is required');
  }

  const releaseMutex = await renderMutex.acquire();
  const snapshot = snapshotEnvironment();

  // Create isolated DOM environment
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="ssr-root"></div></body></html>', {
    url: options.url || 'http://localhost/',
    contentType: 'text/html',
    pretendToBeVisual: true,
  });

  const win = dom.window as unknown as Window & Record<string, unknown>;
  installBrowserShims(win);
  syncDomEnvironment(win);

  try {
    const renderPromise = performAureliaRender(
      component,
      context,
      props,
      win,
      options
    );

    const result = await Promise.race([
      renderPromise,
      new Promise<string>((_, reject) =>
        setTimeout(
          () => reject(new Error(`renderAurelia timeout after ${timeout}ms`)),
          timeout
        )
      ),
    ]);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[renderAurelia] ERROR:', error);

    if (errorMessage.includes('timeout')) {
      return `<div class="ssr-error">${escapeHtml(errorMessage)}</div>`;
    }

    return '<div class="ssr-container"></div>';
  } finally {
    try {
      dom.window.close();
    } catch {
      // Ignore cleanup errors
    }
    restoreEnvironment(snapshot);
    releaseMutex();
  }
}

/**
 * Perform real Aurelia 2 rendering in the isolated DOM window
 */
async function performAureliaRender(
  component: unknown,
  context: RenderContext,
  props: Record<string, unknown>,
  win: Window & Record<string, unknown>,
  options: RenderOptions
): Promise<string> {
  // Extract template safely to catch any errors from getters
  let rawTemplate: string | undefined;
  try {
    if (component && typeof component === 'object' && 'template' in component) {
      rawTemplate = (component as { template?: string }).template;
    } else if (typeof component === 'function' && 'template' in component) {
      rawTemplate = (component as { template?: string }).template;
    }
  } catch (err) {
    throw new Error(`Template resolution failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Normalize legacy {{prop}} syntax to Aurelia 2 ${prop} syntax if present
  let template = rawTemplate;
  if (template && typeof template === 'string') {
    template = template.replace(/\{\{([^}]+)\}\}/g, '${$1}');
  }

  let rootComponent: Constructable | object;

  if (CustomElement.isType(component)) {
    // If component is a defined CustomElement class, instantiate directly
    const instance = new (component as Constructable)() as Record<string, unknown>;
    instance._renderContext = context;
    instance.user = context.user;
    instance.workspace = context.workspace;
    instance.role = context.role;
    Object.assign(instance, props);
    rootComponent = instance;
  } else if (typeof component === 'function') {
    // Plain class (not decorated with CustomElement)
    let Wrapper = plainWrapperCache.get(component as object);
    if (!Wrapper) {
      Wrapper = CustomElement.define(
        {
          name: `ssr-class-wrapper-${++plainWrapperCounter}`,
          template: template || '<div></div>',
        },
        component as Constructable
      );
      plainWrapperCache.set(component as object, Wrapper);
    }
    const instance = new Wrapper() as Record<string, unknown>;
    instance._renderContext = context;
    instance.user = context.user;
    instance.workspace = context.workspace;
    instance.role = context.role;
    Object.assign(instance, props);
    rootComponent = instance;
  } else if (typeof component === 'object' && component !== null) {
    // Plain object component: { template: '...', ...props }
    let Wrapper = plainWrapperCache.get(component);
    if (!Wrapper) {
      const plainObj = component as Record<string, unknown> & { template?: string };
      class PlainObjWrapper {
        constructor() {
          Object.assign(this, plainObj);
        }
      }
      // If plainObj has methods (e.g. attached, binding), copy to prototype
      for (const key of Object.getOwnPropertyNames(plainObj)) {
        if (typeof plainObj[key] === 'function' && key !== 'constructor') {
          (PlainObjWrapper.prototype as Record<string, unknown>)[key] = plainObj[key];
        }
      }
      Wrapper = CustomElement.define(
        {
          name: `ssr-obj-wrapper-${++plainWrapperCounter}`,
          template: template || plainObj.template || '<div></div>',
        },
        PlainObjWrapper
      );
      plainWrapperCache.set(component, Wrapper);
    }
    const instance = new Wrapper() as Record<string, unknown>;
    instance._renderContext = context;
    instance.user = context.user;
    instance.workspace = context.workspace;
    instance.role = context.role;
    Object.assign(instance, props);
    rootComponent = instance;
  } else {
    throw new Error('renderAurelia: component is invalid');
  }

  // Initialize Aurelia with request-scoped template element factory and SSR marker preservation
  const app = new Aurelia();
  app.register(
    Registration.singleton(ITemplateElementFactory, SsrTemplateElementFactory),
    Registration.instance(ISSRContext, { preserveMarkers: true })
  );

  // Register additional registrations if provided
  if (options.registrations && Array.isArray(options.registrations)) {
    app.register(...options.registrations);
  }

  const host = win.document.getElementById('ssr-root');
  if (!host) {
    throw new Error('Host element #ssr-root not found in server DOM');
  }

  // Mount and start Aurelia application
  await app.app({ host, component: rootComponent }).start();

  // If a settle delay is requested (or microtask drain)
  if (options.settle && options.settle > 0) {
    await new Promise((r) => setTimeout(r, options.settle));
  }

  const renderedHtml = host.innerHTML;

  // Cleanly stop Aurelia
  await app.stop();

  return renderedHtml;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}
