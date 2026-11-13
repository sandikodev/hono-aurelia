/**
 * @hono/aurelia-ssr State Serialization
 * 
 * Serialize auth context and initial data for hydration.
 */

import type { RenderContext, HydrationPayload } from './types.js';

/**
 * Serialize auth context + initial data for client hydration
 * 
 * @param context - Auth context (user, workspace, role)
 * @param initialData - Optional initial data to hydrate
 * @param componentName - Component name for validation
 * @returns Promise<HydrationPayload>
 * 
 * @example
 * ```typescript
 * const payload = await serializeState(
 *   { user, workspace, role },
 *   { overview: dashboardData, activity: activityData },
 *   'dashboard-page'
 * );
 * ```
 */
export async function serializeState(
  context: RenderContext,
  initialData?: Record<string, any>,
  componentName?: string
): Promise<HydrationPayload> {
  try {
    // Validate and clean context
    const cleanedContext = cleanContext(context);

    // Validate and clean initial data
    const cleanedData = initialData ? cleanData(initialData) : undefined;

    // Create hydration payload
    const payload: HydrationPayload = {
      component: componentName || 'unknown',
      context: {
        user: cleanedContext.user,
        workspace: cleanedContext.workspace,
        role: cleanedContext.role,
        isAuthenticated: cleanedContext.user !== null,
      },
      initialData: cleanedData,
      timestamp: Date.now(),
    };

    return payload;
  } catch (error) {
    console.error('[serializeState]', error);
    
    // Fallback to minimal payload
    return {
      component: componentName || 'unknown',
      context: {
        user: null,
        workspace: null,
        role: null,
        isAuthenticated: false,
      },
      timestamp: Date.now(),
    };
  }
}

/**
 * Clean context by removing sensitive fields
 */
function cleanContext(context: RenderContext): RenderContext {
  const SENSITIVE_FIELDS = [
    'password',
    'refreshToken',
    'apiKey',
    'secretKey',
    'token',
    'secret',
  ];

  const result = { ...context };

  // Clean user object
  if (result.user) {
    result.user = cleanObject(result.user, SENSITIVE_FIELDS);
  }

  // Clean workspace object
  if (result.workspace) {
    result.workspace = cleanObject(result.workspace, SENSITIVE_FIELDS);
  }

  return result;
}

/**
 * Remove sensitive fields from object
 */
function cleanObject(
  obj: any,
  sensitiveFields: string[]
): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => cleanObject(item, sensitiveFields));
  }

  const cleaned: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Check if field is sensitive (case-insensitive)
    if (sensitiveFields.some(field => field.toLowerCase() === key.toLowerCase())) {
      // Skip sensitive fields
      continue;
    }

    // Recursively clean nested objects
    if (value !== null && typeof value === 'object') {
      cleaned[key] = cleanObject(value, sensitiveFields);
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      cleaned[key] = value;
    }
    // Skip functions, symbols, undefined
  }

  return cleaned;
}

/**
 * Recursively clean data, removing circular references
 */
function cleanData(
  data: any,
  seen = new WeakSet()
): any {
  if (data === null || data === undefined) {
    return data;
  }

  // Primitive types
  if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  // Skip functions and symbols
  if (typeof data === 'function' || typeof data === 'symbol') {
    return undefined;
  }

  // Handle circular references
  if (typeof data === 'object') {
    if (seen.has(data)) {
      return '[Circular]';
    }
    seen.add(data);
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => cleanData(item, seen));
  }

  // Handle objects
  if (typeof data === 'object') {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      // Skip private/internal properties
      if (key.startsWith('_') || key.startsWith('$')) {
        continue;
      }

      // Skip non-serializable types
      if (typeof value === 'function' || typeof value === 'symbol') {
        continue;
      }

      // Recursively clean
      const cleaned = cleanData(value, seen);
      
      if (cleaned !== undefined) {
        result[key] = cleaned;
      }
    }

    return result;
  }

  return data;
}

/**
 * Verify payload can be serialized to JSON
 */
export function validatePayload(payload: HydrationPayload): boolean {
  try {
    JSON.stringify(payload);
    return true;
  } catch {
    return false;
  }
}

/**
 * Serialize payload to JSON string with escaping for HTML
 */
export function stringifyPayload(payload: HydrationPayload): string {
  const json = JSON.stringify(payload);
  
  // Escape special characters for HTML context
  return json
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/"/g, '\\u0022')
    .replace(/'/g, '\\u0027');
}
