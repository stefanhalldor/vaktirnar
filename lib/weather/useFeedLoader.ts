'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

function computeMaxLatestAt(list: { latestAt: string }[]): string {
  return list.length > 0
    ? list.reduce((max, s) => (s.latestAt > max ? s.latestAt : max), list[0].latestAt)
    : new Date(0).toISOString()
}

/**
 * Generic polling hook for item feeds with "new since acknowledged" badge tracking.
 *
 * - Polls on `pollIntervalMs` interval (default 30 000 ms).
 * - Establishes a baseline on the first successful load — items already visible are not counted.
 * - On subsequent polls, counts items with `latestAt` newer than the last acknowledged timestamp.
 * - When `isOpen` is true, incoming items are silently acknowledged so the badge never fires for
 *   content the user can already see in the open drawer.
 * - `acknowledgeCurrentItems` resets the count and updates the acknowledged timestamp; also called
 *   automatically whenever `isOpen` transitions to true.
 * - `refresh` triggers an immediate fetch outside the polling interval (e.g. on a push event).
 * - When `cacheKey` changes, the baseline resets and an immediate re-fetch is triggered.
 */
export function useFeedLoader<T extends { latestAt: string }>({
  fetcher,
  cacheKey = '',
  pollIntervalMs = 30_000,
  disabled = false,
  isOpen = false,
}: {
  /** Async function that returns the current list of items. */
  fetcher: () => Promise<T[]>
  /** Stable string key — changes trigger an immediate re-fetch and baseline reset. */
  cacheKey?: string
  /** Poll interval in ms. Default 30 000. */
  pollIntervalMs?: number
  /** Skip fetching and polling entirely. Default false. */
  disabled?: boolean
  /**
   * When true, items that arrive via polling are silently acknowledged — no badge appears
   * for content already visible in the open drawer. Also triggers an immediate ack on transition
   * from false → true.
   */
  isOpen?: boolean
}): {
  items: T[]
  loading: boolean
  newSinceOpenCount: number
  acknowledgeCurrentItems: () => void
  refresh: () => void
} {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [newSinceOpenCount, setNewSinceOpenCount] = useState(0)

  // acknowledgedAt: highest latestAt the user has seen. null = baseline not yet set.
  const acknowledgedAtRef = useRef<string | null>(null)
  // Keep latest isOpen value accessible inside the polling closure without re-creating the effect.
  const isOpenRef = useRef(isOpen)
  useEffect(() => { isOpenRef.current = isOpen }, [isOpen])

  // loadRef: allows refresh() to trigger a load without being inside the effect closure.
  const loadRef = useRef<(() => void) | null>(null)

  const acknowledgeCurrentItems = useCallback(() => {
    setItems(current => {
      acknowledgedAtRef.current = computeMaxLatestAt(current)
      setNewSinceOpenCount(0)
      return current
    })
  }, [])

  // When the drawer opens, immediately ack current items so pre-existing content is not counted.
  useEffect(() => {
    if (isOpen) acknowledgeCurrentItems()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const refresh = useCallback(() => { loadRef.current?.() }, [])

  useEffect(() => {
    if (disabled) {
      // Clear stale items immediately so callers never see data from a previous key/source.
      setItems([])
      setNewSinceOpenCount(0)
      acknowledgedAtRef.current = null
      setLoading(false)
      return
    }

    // Clear stale items and signal loading before the new fetch resolves.
    // This prevents previous-route or previous-key items from remaining visible
    // while a new request is in flight — especially important for route-scoped feeds
    // where each route has a distinct station set and showing wrong-route reports
    // is worse than briefly showing nothing.
    //
    // `fetcher` is intentionally omitted from deps: callers must change `cacheKey`
    // when the effective fetch target changes. The fetcher function itself is read
    // via closure from the enclosing render — `cacheKey` is the semantic invalidation signal.
    setItems([])
    setLoading(true)
    acknowledgedAtRef.current = null
    setNewSinceOpenCount(0)

    let cancelled = false

    async function load() {
      try {
        const result = await fetcher()
        if (cancelled) return
        setItems(result)

        if (acknowledgedAtRef.current === null) {
          // First successful load: establish baseline, no badge.
          acknowledgedAtRef.current = computeMaxLatestAt(result)
        } else if (isOpenRef.current) {
          // Drawer open while poll arrived: silently ack — user can already see these items.
          acknowledgedAtRef.current = computeMaxLatestAt(result)
        } else {
          const ack = acknowledgedAtRef.current
          setNewSinceOpenCount(result.filter(s => s.latestAt > ack).length)
        }
      } catch {
        /* silent — feed is optional */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadRef.current = load
    void load()
    const id = setInterval(() => void load(), pollIntervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
      loadRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, cacheKey, pollIntervalMs])

  return { items, loading, newSinceOpenCount, acknowledgeCurrentItems, refresh }
}
