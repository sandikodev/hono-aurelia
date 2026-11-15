/**
 * @hono/aurelia-ssr State Serialization
 * 
 * Serialize auth context and initial data for hydration with strict whitelist
 * projection to guarantee sensitive fields are never leaked to the client.
 */

import type { RenderContext, HydrationPayload, User, Workspace } from './types.js';

/**
 * Public User DTO whitelist fields safe to send to browser.
 */
const ALLOWED_USER_FIELDS = new Set([
  'id',
  'email',
  'name',
  'avatarUrl',
  'avatar',
  'role',
  'createdAt',
]);

/**
 * Public Workspace DTO whitelist fields safe to send to browser.
 */
const ALLOWED_WORKSPACE_FIELDS = new Set([
  'id',
  'name',
  'slug',
  'plan',
  'role',
]);

/**
 * Serialize auth context + initial data for client hydration.
 *
 * Employs a strict whitelist projection for user and workspace contexts
 * to eliminate credential and token leakage vectors.
 * 
 * @param context - Auth context (user, workspace, role)
 * @param initialData - Optional initial data to hydrate
 * @param componentName - Component name for validation
 * @returns Promise<HydrationPayload>
 */
export async function serializeState(
  context: RenderContext,
  initialData?: Record<string, unknown>,
  componentName?: string
): Promise<HydrationPayload> {
  try {
    // Project context through whitelist
    const cleanedContext = projectContext(context);

    // Recursively clean and sanitize initial data
    const cleanedData = initialData
      ? (cleanData(initialData) as Record<string, unknown> | undefined)
      : undefined;

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
    console.error('[serializeState] ERROR:', error);
    
    // Fallback to safe minimal unauthenticated payload
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
 * Whitelist-based projection of auth context.
 * Guarantees that only explicitly approved properties are serialized.
 */
function projectContext(context: RenderContext): RenderContext {
  return {
    user: context.user ? projectObject<User>(context.user, ALLOWED_USER_FIELDS) : null,
    workspace: context.workspace ? projectObject<Workspace>(context.workspace, ALLOWED_WORKSPACE_FIELDS) : null,
    role: typeof context.role === 'string' ? context.role : null,
  };
}

/**
 * Project an object by keeping only whitelisted keys and primitive values.
 */
function projectObject<T extends Record<string, unknown>>(
  obj: unknown,
  allowedKeys: Set<string>
): T | null {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return null;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (!allowedKeys.has(key)) {
      continue;
    }

    // Only allow serializable primitives or clean nested structures
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    } else if (typeof value === 'object') {
      result[key] = cleanData(value);
    }
  }

  return result as T;
}

/**
 * Recursively clean data, removing circular references, functions, and symbols
 */
function cleanData(
  data: unknown,
  seen = new WeakSet<object>()
): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  // Primitive types
  if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
    return data;
  }

  // Skip non-serializable types
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
    const result: Record<string, unknown> = {};

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
 * Serialize payload to JSON string with escaping for HTML script context.
 * 
 * Safely escapes characters that could break out of a `<script>` tag (XSS):
 * - `<` to `\u003c` (prevents </script> and <!-- tag breaks)
 * - `>` to `\u003e`
 * - `&` to `\u0026`
 * - `\u2028` and `\u2029` (prevents JS newline issues)
 */
export function stringifyPayload(payload: HydrationPayload): string {
  const json = JSON.stringify(payload);
  
  return json
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
