/**
 * @hono/aurelia-ssr Renderer
 * 
 * Core function to render Aurelia components to HTML strings on the server.
 */

import { JSDOM } from 'jsdom';
import type { RenderOptions, RenderContext } from './types.js';

/**
 * Render an Aurelia component to HTML string
 * 
 * @param options - Render options (component, context, props, timeout)
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
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/',
    contentType: 'text/html',
    pretendToBeVisual: true,
  });

  // Setup global objects for Aurelia
  // In jsdom, window is read-only, so we setup the necessary globals
  const globalThis = dom.window as any;
  globalThis.globalThis = globalThis;
  // Don't reassign window - it's already the window object in jsdom
  if (!globalThis.document) globalThis.document = dom.document;
  if (!globalThis.navigator) globalThis.navigator = dom.window.navigator;
  if (!globalThis.location) globalThis.location = dom.window.location;

  try {
    // Render with timeout
    const renderPromise = performRender(
      dom,
      component,
      context,
      props
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
    // Return error message in HTML for debugging
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[renderAurelia]', errorMessage);
    
    // In development, include error; in production, return empty container
    if (process.env.NODE_ENV === 'development') {
      return `<div class="ssr-error">${escapeHtml(errorMessage)}</div>`;
    }
    
    return '<div class="ssr-container"></div>';
  } finally {
    // Cleanup DOM
    try {
      dom.window.close();
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Perform the actual render operation
 */
async function performRender(
  dom: JSDOM,
  component: any,
  context: RenderContext,
  props: Record<string, any>
): Promise<string> {
  // Create a simple component instance
  // In real Aurelia, this would use the Aurelia runtime
  // For now, we simulate by rendering the component's template
  
  const instance = createComponentInstance(
    component,
    context,
    props,
    dom.window as any
  );

  // Call attached() lifecycle if it exists
  if (instance && typeof instance.attached === 'function') {
    await instance.attached();
  }

  // Render template to HTML string
  const html = renderTemplate(instance, component, dom.window as any);
  
  return html;
}

/**
 * Create a component instance with context injected
 */
function createComponentInstance(
  component: any,
  context: RenderContext,
  props: Record<string, any>,
  windowObj: any
): any {
  try {
    // If component is a class, instantiate it
    const instance = typeof component === 'function'
      ? new component()
      : { ...component };

    // Inject context
    if (instance && typeof instance === 'object') {
      instance._renderContext = context;
      
      // Inject props
      Object.assign(instance, props);
    }

    return instance;
  } catch (error) {
    console.error('[createComponentInstance]', error);
    return null;
  }
}

/**
 * Render component template to HTML string
 */
function renderTemplate(
  instance: any,
  component: any,
  windowObj: any
): string {
  try {
    // Get template from component metadata or template property
    let template = '';

    if (instance && instance.template) {
      template = instance.template;
    } else if (component.template) {
      template = component.template;
    } else if (component.__aureliaMetadata && component.__aureliaMetadata.template) {
      template = component.__aureliaMetadata.template;
    }

    // Simple template rendering (replace {{ }} placeholders)
    if (template && instance) {
      let html = template;
      
      // Replace {{property}} with values from instance
      html = html.replace(/\{\{([^}]+)\}\}/g, (match, prop) => {
        const value = getPropertyValue(instance, prop.trim());
        return String(value ?? '');
      });

      return html;
    }

    // Fallback: return empty container
    return '<div class="ssr-container"></div>';
  } catch (error) {
    console.error('[renderTemplate]', error);
    return '<div class="ssr-container"></div>';
  }
}

/**
 * Get nested property value safely
 */
function getPropertyValue(obj: any, path: string): any {
  try {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  } catch {
    return undefined;
  }
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
