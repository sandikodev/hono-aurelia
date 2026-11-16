/**
 * @hono/aurelia-ssr HTML Document Builder
 * 
 * Build complete HTML documents with hydration payload injection.
 */

import type { HydrationPayload, DocumentOptions } from './types.js';
import { stringifyPayload } from './serialize.js';

/**
 * Create complete HTML document with hydration payload
 * 
 * @param bodyContent - Rendered component HTML
 * @param payload - Hydration payload with auth + data
 * @param options - Document options (title, lang, bundle paths)
 * @returns string - Complete HTML document
 * 
 * @example
 * ```typescript
 * const html = createHtmlDocument(
 *   renderedHtml,
 *   payload,
 *   { title: 'Dashboard', cssBundle: '/assets/main.css' }
 * );
 * ```
 */
export function createHtmlDocument(
  bodyContent: string,
  payload: HydrationPayload,
  options: DocumentOptions = {}
): string {
  const {
    title = 'Application',
    lang = 'en',
    basePath = '/',
    cssBundle = '/assets/main.css',
    jsBundle = '/src/main.ts',
    nonce,
  } = options;

  // Serialize payload for injection
  const payloadJson = stringifyPayload(payload);
  const nonceAttr = nonce ? ` nonce="${escapeAttr(nonce)}"` : '';

  // Build HTML document
  const html = `<!DOCTYPE html>
<html lang="${escapeAttr(lang)}" class="h-full">
  <head>
    <!-- Meta -->
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>${escapeHtml(title)}</title>
    
    <!-- Router base -->
    <base href="${escapeAttr(basePath)}" />
    
    <!-- Styles -->
    <link rel="stylesheet" href="${escapeAttr(cssBundle)}" />
    
    <!-- Hydration Payload -->
    <script${nonceAttr}>
      window.__HYDRATION__ = ${payloadJson};
      window.__HYDRATION_TIME__ = ${payload.timestamp};
    </script>
  </head>
  <body class="h-full">
    <!-- App Root -->
    <app-root>${bodyContent}</app-root>
    
    <!-- Main Application -->
    <script type="module" src="${escapeAttr(jsBundle)}"${nonceAttr}></script>
  </body>
</html>`;

  return html;
}

/**
 * Escape HTML special characters in text content
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

/**
 * Escape HTML special characters in attribute values
 */
export function escapeAttr(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&"']/g, (char) => map[char] || char);
}

/**
 * Create minimal HTML shell for SPA fallback
 */
export function createFallbackHtml(title = 'Loading'): string {
  return `<!DOCTYPE html>
<html lang="en" class="h-full">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <base href="/" />
  </head>
  <body class="h-full">
    <app-root></app-root>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>`;
}

/**
 * Create error page HTML
 */
export function createErrorHtml(
  statusCode: number,
  message: string,
  details?: string
): string {
  return `<!DOCTYPE html>
<html lang="en" class="h-full">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Error ${statusCode}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f5f5f5;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
      }
      .error-container {
        background: white;
        padding: 2rem;
        border-radius: 8px;
        max-width: 500px;
        text-align: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      h1 {
        font-size: 3rem;
        color: #333;
        margin-bottom: 0.5rem;
      }
      .message {
        font-size: 1.2rem;
        color: #666;
        margin-bottom: 1rem;
      }
      .details {
        font-size: 0.9rem;
        color: #999;
        background: #f9f9f9;
        padding: 1rem;
        border-radius: 4px;
        margin-bottom: 2rem;
        font-family: monospace;
        overflow-x: auto;
      }
      a {
        color: #0066cc;
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <div class="error-container">
      <h1>${escapeHtml(String(statusCode))}</h1>
      <div class="message">${escapeHtml(message)}</div>
      ${details ? `<div class="details">${escapeHtml(details)}</div>` : ''}
      <a href="/">← Go back home</a>
    </div>
  </body>
</html>`;
}

/**
 * Validate HTML structure
 */
export function validateHtmlStructure(html: string): boolean {
  const hasDoctype = html.includes('<!DOCTYPE html>');
  const hasHtmlTag = html.includes('<html');
  const hasHead = html.includes('<head');
  const hasBody = html.includes('<body');
  const hasScript = html.includes('<script');
  const hasBase = html.includes('<base');

  return hasDoctype && hasHtmlTag && hasHead && hasBody && hasScript && hasBase;
}
