/**
 * Unit tests for useFeedLoader.
 *
 * Covers the drawer-open auto-ack semantic:
 * - Items arriving via polling while isOpen=true must not increase newSinceOpenCount.
 * - Items arriving while isOpen=false do increase newSinceOpenCount.
 * - Transitioning isOpen=false→true immediately resets newSinceOpenCount to 0.
 * - acknowledgeCurrentItems resets the count manually.
 * - cacheKey change resets baseline and re-fetches.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFeedLoader } from '@/lib/weather/useFeedLoader'

function makeItem(latestAt: string) {
  return { id: latestAt, latestAt }
}

/** Flushes microtasks so that a synchronously-resolved mock Promise propagates into React state. */
async function flushAsync() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

/** Advances fake timers by `ms` and flushes the async callbacks that were triggered. */
async function advanceAndFlush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const POLL_MS = 1_000

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ── Baseline ───────────────────────────────────────────────────────────────────

describe('useFeedLoader — baseline on first load', () => {
  it('sets newSinceOpenCount=0 after first load regardless of item timestamps', async () => {
    const fetcher = vi.fn().mockResolvedValue([makeItem('2026-01-01T10:00:00Z')])
    const { result } = renderHook(() => useFeedLoader({ fetcher }))

    await flushAsync()

    expect(result.current.newSinceOpenCount).toBe(0)
    expect(result.current.items).toHaveLength(1)
    expect(result.current.loading).toBe(false)
  })
})

// ── isOpen=false: new items show badge ────────────────────────────────────────

describe('useFeedLoader — badge fires when drawer is closed', () => {
  it('counts items newer than baseline as new when isOpen=false', async () => {
    let callCount = 0
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) return [makeItem('2026-01-01T10:00:00Z')]
      return [makeItem('2026-01-01T10:00:00Z'), makeItem('2026-01-01T11:00:00Z')]
    })

    const { result } = renderHook(() =>
      useFeedLoader({ fetcher, pollIntervalMs: POLL_MS, isOpen: false })
    )

    // First load: baseline set, no badge
    await flushAsync()
    expect(result.current.newSinceOpenCount).toBe(0)

    // Advance time: poll fires once → one new item
    await advanceAndFlush(POLL_MS)
    expect(result.current.newSinceOpenCount).toBe(1)
    expect(result.current.items).toHaveLength(2)
  })
})

// ── isOpen=true: new items are silently acked ─────────────────────────────────

describe('useFeedLoader — no badge when drawer is open', () => {
  it('does not increase newSinceOpenCount when isOpen=true and new items arrive', async () => {
    let callCount = 0
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) return [makeItem('2026-01-01T10:00:00Z')]
      return [makeItem('2026-01-01T10:00:00Z'), makeItem('2026-01-01T11:00:00Z')]
    })

    const { result } = renderHook(() =>
      useFeedLoader({ fetcher, pollIntervalMs: POLL_MS, isOpen: true })
    )

    // First load: baseline set
    await flushAsync()
    expect(result.current.newSinceOpenCount).toBe(0)

    // Poll fires while open: new item silently acked
    await advanceAndFlush(POLL_MS)
    expect(result.current.newSinceOpenCount).toBe(0)
    expect(result.current.items).toHaveLength(2)
  })
})

// ── isOpen transition false→true resets count ─────────────────────────────────

describe('useFeedLoader — opening drawer resets badge count', () => {
  it('resets newSinceOpenCount to 0 when isOpen transitions false→true', async () => {
    let callCount = 0
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) return [makeItem('2026-01-01T10:00:00Z')]
      return [makeItem('2026-01-01T10:00:00Z'), makeItem('2026-01-01T11:00:00Z')]
    })

    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) => useFeedLoader({ fetcher, pollIntervalMs: POLL_MS, isOpen }),
      { initialProps: { isOpen: false } }
    )

    // First load
    await flushAsync()
    expect(result.current.newSinceOpenCount).toBe(0)

    // Poll arrives while closed → badge fires
    await advanceAndFlush(POLL_MS)
    expect(result.current.newSinceOpenCount).toBe(1)

    // User opens drawer → count resets immediately
    act(() => { rerender({ isOpen: true }) })
    await flushAsync()
    expect(result.current.newSinceOpenCount).toBe(0)
  })
})

// ── acknowledgeCurrentItems ────────────────────────────────────────────────────

describe('useFeedLoader — acknowledgeCurrentItems', () => {
  it('resets newSinceOpenCount when called manually', async () => {
    let callCount = 0
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) return [makeItem('2026-01-01T10:00:00Z')]
      return [makeItem('2026-01-01T10:00:00Z'), makeItem('2026-01-01T11:00:00Z')]
    })

    const { result } = renderHook(() =>
      useFeedLoader({ fetcher, pollIntervalMs: POLL_MS, isOpen: false })
    )

    await flushAsync()
    await advanceAndFlush(POLL_MS)
    expect(result.current.newSinceOpenCount).toBe(1)

    act(() => { result.current.acknowledgeCurrentItems() })
    expect(result.current.newSinceOpenCount).toBe(0)
  })
})

// ── stale items cleared on cacheKey change ────────────────────────────────────

describe('useFeedLoader — stale items cleared on cacheKey change', () => {
  it('clears items immediately when cacheKey changes, before new fetch resolves', async () => {
    let resolve: (v: ReturnType<typeof makeItem>[]) => void
    let callCount = 0
    const fetcher = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve([makeItem('2026-01-01T10:00:00Z')])
      // Second call: block until test releases it
      return new Promise<ReturnType<typeof makeItem>[]>(r => { resolve = r })
    })

    const { result, rerender } = renderHook(
      ({ cacheKey }: { cacheKey: string }) => useFeedLoader({ fetcher, cacheKey }),
      { initialProps: { cacheKey: 'key-a' } }
    )

    // First load completes — items visible
    await flushAsync()
    expect(result.current.items).toHaveLength(1)
    expect(result.current.loading).toBe(false)

    // Change key: items should clear immediately, loading resumes
    act(() => { rerender({ cacheKey: 'key-b' }) })
    // Just flush React state (not the blocked fetcher)
    await act(async () => { await Promise.resolve() })
    expect(result.current.items).toHaveLength(0)
    expect(result.current.loading).toBe(true)

    // Release the blocked fetch
    act(() => { resolve([makeItem('2026-01-02T09:00:00Z')]) })
    await flushAsync()
    expect(result.current.items).toHaveLength(1)
    expect(result.current.loading).toBe(false)
  })
})

// ── disabled clears items ─────────────────────────────────────────────────────

describe('useFeedLoader — disabled clears existing items', () => {
  it('clears items and resets count when disabled becomes true', async () => {
    let callCount = 0
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount++
      return [makeItem('2026-01-01T10:00:00Z')]
    })

    const { result, rerender } = renderHook(
      ({ disabled }: { disabled: boolean }) =>
        useFeedLoader({ fetcher, pollIntervalMs: POLL_MS, disabled }),
      { initialProps: { disabled: false } }
    )

    // Initial load: items visible
    await flushAsync()
    expect(result.current.items).toHaveLength(1)
    expect(result.current.loading).toBe(false)

    // Disable: items should clear
    act(() => { rerender({ disabled: true }) })
    await flushAsync()
    expect(result.current.items).toHaveLength(0)
    expect(result.current.newSinceOpenCount).toBe(0)
    expect(result.current.loading).toBe(false)
  })

  it('re-enables and fetches fresh data after disabled→false transition', async () => {
    let callCount = 0
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount++
      return [makeItem(`2026-01-0${callCount}T10:00:00Z`)]
    })

    const { result, rerender } = renderHook(
      ({ disabled }: { disabled: boolean }) =>
        useFeedLoader({ fetcher, pollIntervalMs: POLL_MS, disabled }),
      { initialProps: { disabled: true } }
    )

    // Starts disabled: no items, not loading
    await flushAsync()
    expect(result.current.items).toHaveLength(0)
    expect(result.current.loading).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()

    // Enable: should fetch fresh data
    act(() => { rerender({ disabled: false }) })
    await flushAsync()
    expect(result.current.items).toHaveLength(1)
    expect(result.current.newSinceOpenCount).toBe(0)
    expect(result.current.loading).toBe(false)
  })
})

// ── cacheKey change resets baseline ───────────────────────────────────────────

describe('useFeedLoader — cacheKey change resets baseline', () => {
  it('re-fetches and resets newSinceOpenCount when cacheKey changes', async () => {
    let callCount = 0
    const fetcher = vi.fn().mockImplementation(async () => {
      callCount++
      if (callCount === 1) return [makeItem('2026-01-01T10:00:00Z')]
      if (callCount === 2) return [makeItem('2026-01-01T10:00:00Z'), makeItem('2026-01-01T11:00:00Z')]
      // After key change: different item, baseline resets — should not count as new
      return [makeItem('2026-01-02T09:00:00Z')]
    })

    const { result, rerender } = renderHook(
      ({ cacheKey }: { cacheKey: string }) => useFeedLoader({ fetcher, pollIntervalMs: POLL_MS, cacheKey }),
      { initialProps: { cacheKey: 'key-a' } }
    )

    // First load: baseline set
    await flushAsync()
    expect(result.current.newSinceOpenCount).toBe(0)

    // Poll: badge fires
    await advanceAndFlush(POLL_MS)
    expect(result.current.newSinceOpenCount).toBe(1)

    // Change cacheKey → baseline resets, immediate re-fetch
    act(() => { rerender({ cacheKey: 'key-b' }) })
    await flushAsync()
    expect(result.current.newSinceOpenCount).toBe(0)
    expect(result.current.items).toHaveLength(1)
    expect(result.current.items[0].latestAt).toBe('2026-01-02T09:00:00Z')
  })
})
