'use client'

import { useCallback, useEffect, useRef } from 'react'

export type AuthoritativeRefreshScopeKey = string | number | null

export interface AuthoritativeRefreshLoadContext {
  /** Aborted when this scope is disabled, replaced or unmounted. */
  signal: AbortSignal
  scopeKey: AuthoritativeRefreshScopeKey
  /** Check immediately before committing asynchronously loaded domain state. */
  isCurrent(): boolean
}

export type AuthoritativeRefreshLoader = (
  context: AuthoritativeRefreshLoadContext,
) => Promise<void>

export type AuthoritativeRefreshSubscription = (
  onInvalidate: () => void,
) => void | (() => void)

export interface UseAuthoritativeRefreshOptions {
  /** Stable identity for the domain scope whose late loads must be discarded. */
  scopeKey: AuthoritativeRefreshScopeKey
  enabled: boolean
  /** Omit, use null, or use a non-positive value to disable fallback polling. */
  pollIntervalMs?: number | null
  /**
   * Controls visibility, online and bfcache recovery without restarting the
   * scope or affecting its initial load. Defaults to true.
   */
  recoveryEnabled?: boolean
  /** Owns domain state and domain-specific error handling. */
  load: AuthoritativeRefreshLoader
  /** Provider-neutral invalidation bell. It must return its cleanup function. */
  subscribe?: AuthoritativeRefreshSubscription
  /**
   * Identity of the current subscription (for example an opaque topic).
   * Changing it replaces only the subscription; it does not restart the
   * authoritative load lifecycle for the scope.
   */
  subscriptionKey?: unknown
}

export interface AuthoritativeRefreshRequestOptions {
  /**
   * If a load is active, guarantee one fresh load immediately after it.
   * Concurrent requests share the same single queued refresh.
   */
  afterCurrent?: boolean
}

export interface UseAuthoritativeRefreshResult {
  refresh(options?: AuthoritativeRefreshRequestOptions): Promise<void>
}

interface Deferred {
  promise: Promise<void>
  resolve(): void
  reject(reason: unknown): void
}

function createDeferred(): Deferred {
  let resolve!: () => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<void>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

/**
 * Coordinates authoritative client refreshes without knowing the transport or
 * domain payload. The loader is responsible for applying data and representing
 * errors; autonomous triggers deliberately keep rejected loads out of the
 * browser's unhandled-rejection channel.
 */
export function useAuthoritativeRefresh({
  scopeKey,
  enabled,
  pollIntervalMs = null,
  recoveryEnabled = true,
  load,
  subscribe,
  subscriptionKey = scopeKey,
}: UseAuthoritativeRefreshOptions): UseAuthoritativeRefreshResult {
  const loadRef = useRef(load)
  const subscribeRef = useRef(subscribe)
  const pollIntervalRef = useRef(pollIntervalMs)
  const recoveryEnabledRef = useRef(recoveryEnabled)
  const generationRef = useRef(0)
  const requestRef = useRef<(
    options?: AuthoritativeRefreshRequestOptions,
  ) => Promise<void>>(() => Promise.resolve())
  const reschedulePollRef = useRef<() => void>(() => undefined)

  loadRef.current = load
  subscribeRef.current = subscribe
  pollIntervalRef.current = pollIntervalMs
  recoveryEnabledRef.current = recoveryEnabled
  const hasSubscription = Boolean(subscribe)

  const refresh = useCallback((options?: AuthoritativeRefreshRequestOptions) => {
    return requestRef.current(options)
  }, [])

  useEffect(() => {
    const generation = generationRef.current + 1
    generationRef.current = generation

    if (!enabled) {
      requestRef.current = () => Promise.resolve()
      return () => {
        if (generationRef.current === generation) generationRef.current += 1
      }
    }

    let stopped = false
    let timerId: number | null = null
    let inFlight: Promise<void> | null = null
    let inFlightController: AbortController | null = null
    let queued: Deferred | null = null

    const isCurrent = () => !stopped && generationRef.current === generation

    const clearTimer = () => {
      if (timerId === null) return
      window.clearTimeout(timerId)
      timerId = null
    }

    let request: (
      options?: AuthoritativeRefreshRequestOptions,
    ) => Promise<void>

    const runAutonomously = (options?: AuthoritativeRefreshRequestOptions) => {
      // The domain loader owns error state/reporting. The scheduler must still
      // remain alive after a rejected background refresh.
      void request(options).catch(() => undefined)
    }

    const schedulePoll = () => {
      clearTimer()
      const intervalMs = pollIntervalRef.current
      if (
        !isCurrent()
        || intervalMs === null
        || !Number.isFinite(intervalMs)
        || intervalMs <= 0
        || document.visibilityState !== 'visible'
      ) return

      timerId = window.setTimeout(() => {
        timerId = null
        if (!isCurrent() || document.visibilityState !== 'visible') return
        runAutonomously()
      }, intervalMs)
    }

    const startLoad = (): Promise<void> => {
      clearTimer()
      const controller = new AbortController()
      inFlightController = controller
      const task = Promise.resolve().then(async () => {
        if (!isCurrent()) return
        await loadRef.current({
          signal: controller.signal,
          scopeKey,
          isCurrent,
        })
      })
      inFlight = task

      void task.then(
        () => settleLoad(task),
        () => settleLoad(task),
      )
      return task
    }

    const settleLoad = (task: Promise<void>) => {
      if (inFlight !== task) return
      inFlight = null
      inFlightController = null

      if (!isCurrent()) {
        if (queued) {
          queued.resolve()
          queued = null
        }
        return
      }

      const afterCurrent = queued
      queued = null
      if (afterCurrent) {
        const next = startLoad()
        void next.then(afterCurrent.resolve, afterCurrent.reject)
        return
      }
      schedulePoll()
    }

    request = (options = {}) => {
      if (!isCurrent()) return Promise.resolve()
      if (inFlight) {
        if (!options.afterCurrent) return inFlight
        if (!queued) queued = createDeferred()
        return queued.promise
      }
      return startLoad()
    }
    requestRef.current = request
    const reschedulePoll = () => {
      if (!inFlight) schedulePoll()
    }
    reschedulePollRef.current = reschedulePoll

    const forceRefresh = () => runAutonomously({ afterCurrent: true })
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        clearTimer()
        return
      }
      if (recoveryEnabledRef.current) forceRefresh()
      else schedulePoll()
    }
    const onOnline = () => {
      if (recoveryEnabledRef.current) forceRefresh()
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && recoveryEnabledRef.current) forceRefresh()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('online', onOnline)
    window.addEventListener('pageshow', onPageShow)
    runAutonomously()

    return () => {
      stopped = true
      clearTimer()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('pageshow', onPageShow)
      inFlightController?.abort()
      inFlightController = null
      if (queued) {
        // Avoid leaving an externally awaited afterCurrent promise pending.
        queued.resolve()
        queued = null
      }
      if (generationRef.current === generation) generationRef.current += 1
      if (requestRef.current === request) requestRef.current = () => Promise.resolve()
      if (reschedulePollRef.current === reschedulePoll) {
        reschedulePollRef.current = () => undefined
      }
    }
  }, [enabled, scopeKey])

  useEffect(() => {
    reschedulePollRef.current()
  }, [pollIntervalMs])

  useEffect(() => {
    if (!enabled || !subscribeRef.current) return
    let active = true
    const onInvalidate = () => {
      if (!active) return
      void refresh({ afterCurrent: true }).catch(() => undefined)
    }
    const unsubscribe = subscribeRef.current(onInvalidate)
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [enabled, hasSubscription, refresh, scopeKey, subscriptionKey])

  return { refresh }
}
