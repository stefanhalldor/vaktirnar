import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  useAuthoritativeRefresh,
  type AuthoritativeRefreshLoadContext,
} from '../useAuthoritativeRefresh'

interface Deferred {
  promise: Promise<void>
  resolve(): void
  reject(reason: unknown): void
}

function deferred(): Deferred {
  let resolve!: () => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<void>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState')

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value })
}

function dispatchPageShow(persisted: boolean) {
  const event = new Event('pageshow')
  Object.defineProperty(event, 'persisted', { configurable: true, value: persisted })
  window.dispatchEvent(event)
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility)
})

describe('useAuthoritativeRefresh', () => {
  it('single-flights ordinary refreshes and keeps exactly one queued afterCurrent refresh', async () => {
    const first = deferred()
    const second = deferred()
    const third = deferred()
    const load = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise)
    const { result } = renderHook(() => useAuthoritativeRefresh({
      scopeKey: 'quiz:one',
      enabled: true,
      load,
    }))

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))

    let ordinary!: Promise<void>
    let ordinaryTwo!: Promise<void>
    let queuedOne!: Promise<void>
    let queuedTwo!: Promise<void>
    act(() => {
      ordinary = result.current.refresh()
      ordinaryTwo = result.current.refresh()
      queuedOne = result.current.refresh({ afterCurrent: true })
      queuedTwo = result.current.refresh({ afterCurrent: true })
    })

    expect(ordinaryTwo).toBe(ordinary)
    expect(queuedTwo).toBe(queuedOne)
    expect(load).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.resolve()
      await first.promise
    })
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))

    let queuedDuringSecond!: Promise<void>
    let queuedDuringSecondAgain!: Promise<void>
    act(() => {
      queuedDuringSecond = result.current.refresh({ afterCurrent: true })
      queuedDuringSecondAgain = result.current.refresh({ afterCurrent: true })
    })
    expect(queuedDuringSecondAgain).toBe(queuedDuringSecond)

    await act(async () => {
      second.resolve()
      await queuedOne
    })
    await waitFor(() => expect(load).toHaveBeenCalledTimes(3))

    await act(async () => {
      third.resolve()
      await queuedDuringSecond
    })
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('uses recursive visible-only polling and force-refreshes when visibility returns', async () => {
    vi.useFakeTimers()
    setVisibility('visible')
    const load = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useAuthoritativeRefresh({
      scopeKey: 'chat:one',
      enabled: true,
      pollIntervalMs: 1_000,
      load,
    }))

    await act(async () => { await Promise.resolve() })
    expect(load).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(load).toHaveBeenCalledTimes(2)

    act(() => {
      setVisibility('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(load).toHaveBeenCalledTimes(2)

    await act(async () => {
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })
    expect(load).toHaveBeenCalledTimes(3)

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(load).toHaveBeenCalledTimes(4)
  })

  it('performs the initial authoritative load even when the document starts hidden', async () => {
    vi.useFakeTimers()
    setVisibility('hidden')
    const load = vi.fn().mockResolvedValue(undefined)
    renderHook(() => useAuthoritativeRefresh({
      scopeKey: 'hidden-initial-scope',
      enabled: true,
      pollIntervalMs: 1_000,
      load,
    }))

    await act(async () => { await Promise.resolve() })
    expect(load).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(load).toHaveBeenCalledTimes(1)

    await act(async () => {
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('reschedules dynamic polling and recovery controls without restarting the scope', async () => {
    vi.useFakeTimers()
    setVisibility('visible')
    const contexts: AuthoritativeRefreshLoadContext[] = []
    const load = vi.fn().mockImplementation(async (context: AuthoritativeRefreshLoadContext) => {
      contexts.push(context)
    })
    const { rerender } = renderHook(
      ({ pollIntervalMs, recoveryEnabled }) => useAuthoritativeRefresh({
        scopeKey: 'stable-scope',
        enabled: true,
        pollIntervalMs,
        recoveryEnabled,
        load,
      }),
      {
        initialProps: {
          pollIntervalMs: null as number | null,
          recoveryEnabled: true,
        },
      },
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(load).toHaveBeenCalledTimes(1)
    const initialContext = contexts[0]

    rerender({ pollIntervalMs: 5_000, recoveryEnabled: false })
    expect(initialContext.signal.aborted).toBe(false)
    expect(initialContext.isCurrent()).toBe(true)
    expect(load).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(new Event('online'))
      dispatchPageShow(true)
      setVisibility('hidden')
      document.dispatchEvent(new Event('visibilitychange'))
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(4_999) })
    expect(load).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(load).toHaveBeenCalledTimes(2)

    rerender({ pollIntervalMs: null, recoveryEnabled: false })
    expect(initialContext.signal.aborted).toBe(false)
    expect(initialContext.isCurrent()).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('coalesces visibility, online, pageshow and subscription recovery behind an active load', async () => {
    const first = deferred()
    const second = deferred()
    const load = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    let invalidate: (() => void) | undefined
    const unsubscribe = vi.fn()
    const subscribe = vi.fn((onInvalidate: () => void) => {
      invalidate = onInvalidate
      return unsubscribe
    })
    renderHook(() => useAuthoritativeRefresh({
      scopeKey: 'quiz:recovery',
      enabled: true,
      load,
      subscribe,
    }))

    await act(async () => { await Promise.resolve() })
    expect(load).toHaveBeenCalledTimes(1)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('online'))
      dispatchPageShow(false)
      dispatchPageShow(true)
      invalidate?.()
      invalidate?.()
    })
    expect(load).toHaveBeenCalledTimes(1)

    await act(async () => {
      first.resolve()
      await first.promise
    })
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))

    await act(async () => {
      second.resolve()
      await second.promise
    })
    expect(load).toHaveBeenCalledTimes(2)
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it('replaces only the subscription when its identity changes', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const firstCleanup = vi.fn()
    const secondCleanup = vi.fn()
    const firstSubscribe = vi.fn(() => firstCleanup)
    const secondSubscribe = vi.fn(() => secondCleanup)
    const { rerender, unmount } = renderHook(
      ({ subscriptionKey, subscribe }) => useAuthoritativeRefresh({
        scopeKey: 'same-session',
        subscriptionKey,
        enabled: true,
        load,
        subscribe,
      }),
      { initialProps: { subscriptionKey: 'topic-one', subscribe: firstSubscribe } },
    )

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    rerender({ subscriptionKey: 'topic-two', subscribe: secondSubscribe })

    expect(firstCleanup).toHaveBeenCalledTimes(1)
    expect(secondSubscribe).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledTimes(1)
    unmount()
    expect(secondCleanup).toHaveBeenCalledTimes(1)
  })

  it('tracks subscription availability and treats scope changes as subscription boundaries', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const firstCleanup = vi.fn()
    const secondCleanup = vi.fn()
    const subscribe = vi.fn()
      .mockReturnValueOnce(firstCleanup)
      .mockReturnValueOnce(secondCleanup)
    const { rerender, unmount } = renderHook(
      ({ scopeKey, available }) => useAuthoritativeRefresh({
        scopeKey,
        subscriptionKey: 'same-topic',
        enabled: true,
        load,
        subscribe: available ? subscribe : undefined,
      }),
      { initialProps: { scopeKey: 'scope-one', available: false } },
    )

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    rerender({ scopeKey: 'scope-one', available: true })
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledTimes(1)

    rerender({ scopeKey: 'scope-two', available: true })
    expect(firstCleanup).toHaveBeenCalledTimes(1)
    expect(subscribe).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))

    unmount()
    expect(secondCleanup).toHaveBeenCalledTimes(1)
  })

  it('aborts and cleans the old scope while stale completion cannot schedule more work', async () => {
    vi.useFakeTimers()
    setVisibility('visible')
    const oldLoad = deferred()
    const oldCleanup = vi.fn()
    const newCleanup = vi.fn()
    const contexts: AuthoritativeRefreshLoadContext[] = []
    const load = vi.fn((context: AuthoritativeRefreshLoadContext) => {
      contexts.push(context)
      return context.scopeKey === 'old' ? oldLoad.promise : Promise.resolve()
    })
    const subscribe = vi.fn(() => oldCleanup)
    const { rerender, unmount } = renderHook(
      ({ scopeKey, currentSubscribe }) => useAuthoritativeRefresh({
        scopeKey,
        enabled: true,
        pollIntervalMs: 1_000,
        load,
        subscribe: currentSubscribe,
      }),
      { initialProps: { scopeKey: 'old', currentSubscribe: subscribe } },
    )

    await act(async () => { await Promise.resolve() })
    expect(load).toHaveBeenCalledTimes(1)
    const oldContext = contexts[0]
    const nextSubscribe = vi.fn(() => newCleanup)
    rerender({ scopeKey: 'new', currentSubscribe: nextSubscribe })

    expect(oldCleanup).toHaveBeenCalledTimes(1)
    expect(oldContext.signal.aborted).toBe(true)
    expect(oldContext.isCurrent()).toBe(false)
    await act(async () => { await Promise.resolve() })
    expect(load).toHaveBeenCalledTimes(2)

    await act(async () => {
      oldLoad.resolve()
      await oldLoad.promise
      await vi.advanceTimersByTimeAsync(1_000)
    })
    // Only the current scope's recursive poll may run.
    expect(load).toHaveBeenCalledTimes(3)

    unmount()
    expect(newCleanup).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(load).toHaveBeenCalledTimes(3)
  })

  it('keeps a caller-visible loader rejection while autonomous polling recovers', async () => {
    vi.useFakeTimers()
    const error = new Error('domain-load-failed')
    const load = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useAuthoritativeRefresh({
      scopeKey: 'errors',
      enabled: true,
      pollIntervalMs: 1_000,
      load,
    }))

    await act(async () => { await Promise.resolve() })
    let request!: Promise<void>
    act(() => { request = result.current.refresh() })
    await expect(request).rejects.toBe(error)

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(load).toHaveBeenCalledTimes(3)
  })
})
