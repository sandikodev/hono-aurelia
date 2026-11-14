/**
 * Tests for hydrateFromServer() functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  hydrateFromServer,
  isHydrationAvailable,
  peekHydrationPayload,
  clearHydration,
  HydrationCache,
  hydrationCache,
} from '../src/hydrate'
import type { HydrationPayload } from '../src/types'

describe('hydrateFromServer', () => {
  beforeEach(() => {
    // Clear any existing payload
    clearHydration()
  })

  it('returns null when no payload exists', () => {
    const result = hydrateFromServer()
    expect(result).toBeNull()
  })

  it('returns null when payload is on different key', () => {
    const payload = createPayload()
    ;(globalThis as any).__OTHER_KEY__ = payload
    
    const result = hydrateFromServer()
    expect(result).toBeNull()
  })

  it('extracts and normalizes context correctly', () => {
    const payload = createPayload({
      context: {
        user: { id: 1, name: 'Alice' },
        workspace: 'acme',
        role: 'admin',
      },
    })
    ;(globalThis as any).__HYDRATION__ = payload

    const result = hydrateFromServer()
    expect(result).not.toBeNull()
    expect(result?.context.user).toEqual({ id: 1, name: 'Alice' })
    expect(result?.context.workspace).toEqual('acme')
    expect(result?.context.role).toEqual('admin')
    expect(result?.context.isAuthenticated).toBe(true)
  })

  it('sets isAuthenticated=false when user is null', () => {
    const payload = createPayload({
      context: { user: null },
    })
    ;(globalThis as any).__HYDRATION__ = payload

    const result = hydrateFromServer()
    expect(result?.context.isAuthenticated).toBe(false)
    expect(result?.context.user).toBeUndefined()
  })

  it('includes initialData when provided', () => {
    const initialData = { users: [{ id: 1 }], posts: [] }
    const payload = createPayload({ initialData })
    ;(globalThis as any).__HYDRATION__ = payload

    const result = hydrateFromServer()
    expect(result?.initialData).toEqual(initialData)
  })

  it('clears payload from window after hydrating', () => {
    const payload = createPayload()
    ;(globalThis as any).__HYDRATION__ = payload

    hydrateFromServer()
    expect((globalThis as any).__HYDRATION__).toBeUndefined()
  })

  it('rejects stale payloads', () => {
    const payload = createPayload({
      timestamp: Date.now() - 40_000, // 40 seconds ago
    })
    ;(globalThis as any).__HYDRATION__ = payload

    const result = hydrateFromServer({ maxAge: 30_000 })
    expect(result).toBeNull()
  })

  it('accepts fresh payloads', () => {
    const payload = createPayload({
      timestamp: Date.now() - 5_000, // 5 seconds ago
    })
    ;(globalThis as any).__HYDRATION__ = payload

    const result = hydrateFromServer({ maxAge: 30_000 })
    expect(result).not.toBeNull()
  })

  it('throws on invalid component type', () => {
    const payload = createPayload({
      component: 123 as any, // Invalid
    })
    ;(globalThis as any).__HYDRATION__ = payload

    expect(() => hydrateFromServer()).toThrow(TypeError)
  })

  it('throws on missing context', () => {
    const payload = createPayload({
      context: undefined as any,
    })
    ;(globalThis as any).__HYDRATION__ = payload

    expect(() => hydrateFromServer()).toThrow(TypeError)
  })

  it('throws on invalid timestamp', () => {
    const payload = createPayload({
      timestamp: -100,
    })
    ;(globalThis as any).__HYDRATION__ = payload

    expect(() => hydrateFromServer()).toThrow(TypeError)
  })

  it('throws on non-object initialData', () => {
    const payload = createPayload({
      initialData: 'not an object' as any,
    })
    ;(globalThis as any).__HYDRATION__ = payload

    expect(() => hydrateFromServer()).toThrow(TypeError)
  })

  it('uses custom payloadKey', () => {
    const payload = createPayload()
    ;(globalThis as any).__CUSTOM_KEY__ = payload

    const result = hydrateFromServer({ payloadKey: '__CUSTOM_KEY__' })
    expect(result).not.toBeNull()
  })

  it('handles missing optional context fields', () => {
    const payload = createPayload({
      context: { user: null }, // Only user, no workspace/role
    })
    ;(globalThis as any).__HYDRATION__ = payload

    const result = hydrateFromServer()
    expect(result?.context.workspace).toBeUndefined()
    expect(result?.context.role).toBeUndefined()
  })
})

describe('isHydrationAvailable', () => {
  beforeEach(() => clearHydration())

  it('returns false when no payload exists', () => {
    expect(isHydrationAvailable()).toBe(false)
  })

  it('returns true when payload exists', () => {
    const payload = createPayload()
    ;(globalThis as any).__HYDRATION__ = payload

    expect(isHydrationAvailable()).toBe(true)
  })

  it('does not consume the payload', () => {
    const payload = createPayload()
    ;(globalThis as any).__HYDRATION__ = payload

    isHydrationAvailable()
    expect((globalThis as any).__HYDRATION__).toBeDefined()
  })

  it('uses custom payloadKey', () => {
    const payload = createPayload()
    ;(globalThis as any).__CUSTOM_KEY__ = payload

    expect(isHydrationAvailable('__CUSTOM_KEY__')).toBe(true)
    expect(isHydrationAvailable()).toBe(false)
  })
})

describe('peekHydrationPayload', () => {
  beforeEach(() => clearHydration())

  it('returns undefined when no payload exists', () => {
    expect(peekHydrationPayload()).toBeUndefined()
  })

  it('returns payload without consuming it', () => {
    const payload = createPayload()
    ;(globalThis as any).__HYDRATION__ = payload

    const peeked = peekHydrationPayload()
    expect(peeked).toEqual(payload)
    expect((globalThis as any).__HYDRATION__).toBeDefined()
  })

  it('uses custom payloadKey', () => {
    const payload = createPayload()
    ;(globalThis as any).__CUSTOM_KEY__ = payload

    expect(peekHydrationPayload('__CUSTOM_KEY__')).toEqual(payload)
  })
})

describe('clearHydration', () => {
  it('removes payload from window', () => {
    const payload = createPayload()
    ;(globalThis as any).__HYDRATION__ = payload

    clearHydration()
    expect((globalThis as any).__HYDRATION__).toBeUndefined()
  })

  it('uses custom payloadKey', () => {
    const payload = createPayload()
    ;(globalThis as any).__CUSTOM_KEY__ = payload

    clearHydration('__CUSTOM_KEY__')
    expect((globalThis as any).__CUSTOM_KEY__).toBeUndefined()
  })
})

describe('HydrationCache', () => {
  let cache: HydrationCache

  beforeEach(() => {
    cache = new HydrationCache()
    cache.clear()
  })

  it('stores and retrieves data', () => {
    const data = { users: [{ id: 1 }] }
    cache.set('users', data)

    expect(cache.get('users')).toEqual(data)
  })

  it('returns null for non-existent keys', () => {
    expect(cache.get('nonexistent')).toBeNull()
  })

  it('checks key existence with has()', () => {
    cache.set('key', { data: 'value' })

    expect(cache.has('key')).toBe(true)
    expect(cache.has('nonexistent')).toBe(false)
  })

  it('deletes keys', () => {
    cache.set('key', { data: 'value' })
    cache.delete('key')

    expect(cache.get('key')).toBeNull()
  })

  it('respects custom TTL', () => {
    // Mock Date.now() to control time
    const now = Date.now()
    vi.useFakeTimers()
    vi.setSystemTime(now)

    cache.set('key', { data: 'value' }, 1000) // 1 second TTL

    // Still fresh at 500ms
    vi.advanceTimersByTime(500)
    expect(cache.get('key')).not.toBeNull()

    // Expired at 1500ms
    vi.advanceTimersByTime(1000)
    expect(cache.get('key')).toBeNull()

    vi.useRealTimers()
  })

  it('defaults to 24 hour TTL', () => {
    const now = Date.now()
    vi.useFakeTimers()
    vi.setSystemTime(now)

    cache.set('key', { data: 'value' })

    // Still fresh at 12 hours
    vi.advanceTimersByTime(12 * 60 * 60 * 1000)
    expect(cache.get('key')).not.toBeNull()

    // Expired at 25 hours
    vi.advanceTimersByTime(13 * 60 * 60 * 1000)
    expect(cache.get('key')).toBeNull()

    vi.useRealTimers()
  })

  it('handles invalid JSON gracefully', () => {
    // Manually set invalid JSON
    sessionStorage.setItem('hydration:bad', 'not json')

    expect(cache.get('bad')).toBeNull()
  })

  it('clears all hydration cache', () => {
    cache.set('key1', { data: 1 })
    cache.set('key2', { data: 2 })

    cache.clear()

    expect(cache.get('key1')).toBeNull()
    expect(cache.get('key2')).toBeNull()
  })

  it('prefixes cache keys', () => {
    cache.set('mykey', { data: 'value' })

    // Check that key is prefixed in storage
    expect(sessionStorage.getItem('hydration:mykey')).toBeDefined()
    expect(sessionStorage.getItem('mykey')).toBeNull()
  })
})

describe('hydrationCache singleton', () => {
  beforeEach(() => {
    hydrationCache.clear()
  })

  it('is reusable across calls', () => {
    hydrationCache.set('shared', { data: 'value' })

    // Different reference but same cache
    expect(hydrationCache.get('shared')).not.toBeNull()
  })
})

// ============= Helper Functions =============

function createPayload(overrides?: Partial<HydrationPayload>): HydrationPayload {
  return {
    component: 'TestPage',
    context: {
      user: null,
      workspace: undefined,
      role: undefined,
    },
    timestamp: Date.now(),
    ...overrides,
  }
}
