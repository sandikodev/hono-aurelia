/**
 * @hono/aurelia-ssr Renderer
 * 
 * Production-grade Server-Side Rendering engine for Aurelia 2 on Hono.
 * Boots real Aurelia 2 components in an isolated server DOM environment.
 */

import { JSDOM } from 'jsdom';
import { Aurelia, CustomElement, PLATFORM, type Constructable } from 'aurelia';
import type { RenderOptions, RenderContext } from './types.js';

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

  // Create isolated DOM environment
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="ssr-root"></div></body></html>', {
    url: options.url || 'http://localhost/',
    contentType: 'text/html',
    pretendToBeVisual: true,
  });

  const win = dom.window as unknown as Window & Record<string, unknown>;
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
    console.error('[renderAurelia]', errorMessage);

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

  // Setup component definition and instance
  let rootDefinition: Constructable<object> | object;
  const instance: Record<string, unknown> = {};

  // Inject context and props into instance
  instance._renderContext = context;
  instance.user = context.user;
  instance.workspace = context.workspace;
  instance.role = context.role;
  Object.assign(instance, props);

  let defTemplate = template;
  let compDef: ReturnType<typeof CustomElement.getDefinition> | null = null;
  let attachedHook: (() => Promise<void> | void) | null = null;

  if (CustomElement.isType(component)) {
    compDef = CustomElement.getDefinition(component);
    const origInstance = new compDef.Type() as Record<string, unknown> & { attached?: () => Promise<void> | void };
    attachedHook = origInstance.attached ?? null;
    Object.assign(instance, origInstance, props);
    const rawTemplate = compDef.template;
    const stringTemplate = typeof rawTemplate === 'string' ? rawTemplate : undefined;
    defTemplate = defTemplate || stringTemplate || '<div></div>';
  } else if (typeof component === 'function') {
    const ComponentClass = component as new () => Record<string, unknown> & {
      template?: string;
      attached?: () => Promise<void> | void;
    };
    const origInstance = new ComponentClass();
    attachedHook = origInstance.attached ?? null;
    Object.assign(instance, origInstance, props);
    defTemplate = defTemplate || origInstance.template || '<div></div>';
  } else if (typeof component === 'object' && component !== null) {
    const compObj = component as Record<string, unknown> & {
      template?: string;
      attached?: () => Promise<void> | void;
    };
    attachedHook = compObj.attached ?? null;
    Object.assign(instance, compObj, props);
    defTemplate = defTemplate || compObj.template || '<div></div>';
  } else {
    throw new Error('renderAurelia: component is invalid');
  }

  const BaseClass = (compDef?.Type || (typeof component === 'function' ? component : Object)) as new () => Record<string, unknown>;

  class DynamicRoot extends BaseClass {
    constructor() {
      super();
      Object.assign(this, instance);
    }
    async attached() {
      if (typeof attachedHook === 'function') {
        await attachedHook.call(this);
      }
    }
  }

  rootDefinition = CustomElement.define(
    {
      ...compDef,
      name: 'ssr-root-comp',
      template: defTemplate,
    },
    DynamicRoot
  );

  // Initialize Aurelia
  const app = new Aurelia();

  // Register additional registrations if provided
  if (options.registrations && Array.isArray(options.registrations)) {
    app.register(...options.registrations);
  }

  const host = win.document.getElementById('ssr-root');
  if (!host) {
    throw new Error('Host element #ssr-root not found in server DOM');
  }

  // Mount and start Aurelia application
  await app.app({ host, component: rootDefinition }).start();

  // If a settle delay is requested (or default microtask drain)
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
