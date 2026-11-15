/**
 * Client-side hydration for SSR context and data
 * 
 * Restores server-rendered state on the client without refetching data.
 * Prevents hydration mismatches and duplicate API calls.
 */

import type { HydrationPayload, HydrationResult } from './types.js'

export type { HydrationResult }

/**
 * Ensure a minimal Storage implementation exists when running in SSR/Node environments
 * where `sessionStorage` is not natively provided on `globalThis`.
 */
function ensureSessionStorage(): Storage {
  if (typeof globalThis.sessionStorage !== 'undefined') {
    return globalThis.sessionStorage
  }

  const store: Record<string, string> = {}
  const memoryStorage = new Proxy(store, {
    get(target, prop: string | symbol) {
      if (prop === 'getItem') {
        return (key: string) => (Object.prototype.hasOwnProperty.call(target, key) ? target[key] : null)
      }
      if (prop === 'setItem') {
        return (key: string, value: string) => {
          target[key] = String(value)
        }
      }
      if (prop === 'removeItem') {
        return (key: string) => {
          delete target[key]
        }
      }
      if (prop === 'clear') {
        return () => {
          for (const k of Object.keys(target)) {
            delete target[k]
          }
        }
      }
      if (prop === 'key') {
        return (index: number) => Object.keys(target)[index] ?? null
      }
      if (prop === 'length') {
        return Object.keys(target).length
      }
      return target[prop as string]
    },
  }) as unknown as Storage

  Object.defineProperty(globalThis, 'sessionStorage', {
    value: memoryStorage,
    configurable: true,
    writable: true,
  })

  return memoryStorage
}

/**
 * Restore hydration payload from server-rendered HTML
 * 
 * Called on client after initial render to:
 * 1. Extract window.__HYDRATION__ payload
 * 2. Validate payload integrity (timestamp freshness)
 * 3. Make data available to components
 * 4. Prevent duplicate API calls
 * 
 * @example
 * ```typescript
 * // In app.ts (Aurelia bootstrapping)
 * import { hydrateFromServer } from '@hono/aurelia-ssr'
 * 
 * const hydration = hydrateFromServer()
 * if (hydration) {
 *   // Set auth context in service
 *   authService.setContext(hydration.context)
 *   
 *   // Make data available to page components
 *   store.dispatch('setInitialData', hydration.initialData)
 * }
 * ```
 * 
 * @param options - Configuration options
 * @param options.maxAge - Max age of hydration payload in ms (default: 30000 = 30s)
 * @param options.payloadKey - Window property containing hydration (default: '__HYDRATION__')
 * @returns Hydration result or null if not available
 * @throws Error if hydration payload is invalid or expired
 */
function getGlobalStorage(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

export function hydrateFromServer<TData = Record<string, unknown>>(options?: {
  maxAge?: number
  payloadKey?: string
}): HydrationResult<TData> | null {
  const maxAge = options?.maxAge ?? 30_000
  const payloadKey = options?.payloadKey ?? '__HYDRATION__'

  // Check if payload exists on window
  const storage = getGlobalStorage()
  const payload = storage[payloadKey] as HydrationPayload | undefined

  if (!payload) {
    return null
  }

  // Validate payload structure
  validatePayload(payload)

  // Check if payload is fresh (server-side check prevents time skew)
  const age = Date.now() - payload.timestamp
  if (age > maxAge) {
    console.warn(
      `Hydration payload is stale (age: ${age}ms, max: ${maxAge}ms). ` +
      `Falling back to API calls.`
    )
    return null
  }

  // Extract and normalize context
  const context = {
    user: payload.context.user ?? undefined,
    workspace: payload.context.workspace ?? undefined,
    role: payload.context.role ?? undefined,
    isAuthenticated: !!payload.context.user,
  }

  // Create hydration result
  const result: HydrationResult<TData> = {
    context,
    initialData: payload.initialData as TData | undefined,
    timestamp: payload.timestamp,
  }

  // Clear payload from window to prevent accidental reuse
  delete storage[payloadKey]

  return result
}

/**
 * Validate hydration payload structure
 * 
 * Ensures payload has required fields and types are correct.
 * Prevents invalid data from reaching components.
 * 
 * @throws TypeError if payload structure is invalid
 */
function validatePayload(payload: unknown): asserts payload is HydrationPayload {
  if (!payload || typeof payload !== 'object') {
    throw new TypeError('Hydration payload must be an object')
  }

  const obj = payload as Record<string, unknown>

  if (typeof obj.component !== 'string') {
    throw new TypeError('Hydration payload.component must be a string')
  }

  if (!obj.context || typeof obj.context !== 'object') {
    throw new TypeError('Hydration payload.context must be an object')
  }

  if (typeof obj.timestamp !== 'number' || obj.timestamp <= 0) {
    throw new TypeError('Hydration payload.timestamp must be a positive number')
  }

  // initialData is optional but must be object if present
  if (obj.initialData !== undefined && typeof obj.initialData !== 'object') {
    throw new TypeError('Hydration payload.initialData must be an object if provided')
  }
}

/**
 * Check if hydration is available without consuming it
 * 
 * Useful for logging, debugging, or conditional logic.
 * Does not remove payload from window.
 * 
 * @param payloadKey - Window property containing hydration (default: '__HYDRATION__')
 * @returns True if hydration payload is available
 */
export function isHydrationAvailable(payloadKey = '__HYDRATION__'): boolean {
  const payload = getGlobalStorage()[payloadKey]
  return !!payload
}

/**
 * Get hydration payload without consuming it
 * 
 * For debugging or advanced use cases.
 * Returns raw payload without validation or clearing.
 * 
 * @param payloadKey - Window property containing hydration (default: '__HYDRATION__')
 * @returns Raw hydration payload or undefined
 */
export function peekHydrationPayload(
  payloadKey = '__HYDRATION__'
): HydrationPayload | undefined {
  return getGlobalStorage()[payloadKey] as HydrationPayload | undefined
}

/**
 * Clear hydration payload from window
 * 
 * Useful for testing or manual cleanup.
 * hydrateFromServer() already does this automatically.
 * 
 * @param payloadKey - Window property containing hydration (default: '__HYDRATION__')
 */
export function clearHydration(payloadKey = '__HYDRATION__'): void {
  delete getGlobalStorage()[payloadKey]
}

/**
 * Cache manager for initial data
 * 
 * Stores hydrated data in sessionStorage to prevent refetch
 * if component unmounts and remounts during same session.
 * 
 * @example
 * ```typescript
 * const cache = new HydrationCache()
 * 
 * // Store hydrated data
 * cache.set('users', users)
 * 
 * // Retrieve later
 * const cached = cache.get('users')
 * if (cached) {
 *   // Use cached data instead of fetching
 *   this.users = cached
 * }
 * ```
 */
export class HydrationCache {
  private prefix = 'hydration:'
  private ttl = 24 * 60 * 60 * 1000 // 24 hours

  constructor() {
    ensureSessionStorage()
  }

  /**
   * Store data in cache
   */
  set<T = unknown>(key: string, value: T, ttlMs?: number): void {
    const fullKey = this.prefix + key
    const entry = {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.ttl),
    }
    try {
      ensureSessionStorage().setItem(fullKey, JSON.stringify(entry))
    } catch (error) {
      // sessionStorage might be unavailable in some contexts
      console.warn('HydrationCache: Unable to store in sessionStorage', error)
    }
  }

  /**
   * Retrieve data from cache
   * 
   * Returns null if key doesn't exist, expired, or invalid.
   */
  get<T = unknown>(key: string): T | null {
    const fullKey = this.prefix + key
    try {
      const item = ensureSessionStorage().getItem(fullKey)
      if (!item) return null

      const entry = JSON.parse(item) as { value: T; expiresAt: number }
      
      // Check if expired
      if (entry.expiresAt < Date.now()) {
        this.delete(key)
        return null
      }

      return entry.value
    } catch {
      // Invalid JSON or sessionStorage error
      return null
    }
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    return this.get(key) !== null
  }

  /**
   * Remove key from cache
   */
  delete(key: string): void {
    const fullKey = this.prefix + key
    try {
      ensureSessionStorage().removeItem(fullKey)
    } catch {
      // sessionStorage might be unavailable
    }
  }

  /**
   * Clear all hydration cache
   */
  clear(): void {
    try {
      const storage = ensureSessionStorage()
      const keys = Object.keys(storage)
      for (const key of keys) {
        if (key.startsWith(this.prefix)) {
          storage.removeItem(key)
        }
      }
    } catch {
      // sessionStorage might be unavailable
    }
  }
}

/**
 * Shared cache instance
 */
export const hydrationCache = new HydrationCache()
