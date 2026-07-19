'use client'

import { useMemo } from 'react'
import type { ConditionFeedPreviewItemDto } from '@/lib/chat/types'
import { useFeedLoader } from './useFeedLoader'

/**
 * Fetches the public conditions feed and tracks "new since acknowledged" count.
 *
 * Thin wrapper over `useFeedLoader` with a fixed fetcher for the feed-preview endpoint.
 *
 * - Polls every `pollIntervalMs` milliseconds (default 30 000).
 * - On first successful load, records a baseline — existing items are not counted as new.
 * - `acknowledgeCurrentItems` resets the badge count.
 * - When `isOpen` is true, items arriving via polling are silently acknowledged.
 */
export function useConditionsFeedPreview({
  limitItems = 10,
  pollIntervalMs = 30_000,
  disabled = false,
  isOpen = false,
}: {
  limitItems?: number
  pollIntervalMs?: number
  disabled?: boolean
  /** Pass the current open state of the drawer to suppress badges for already-visible items. */
  isOpen?: boolean
} = {}) {
  const fetcher = useMemo(() => async (): Promise<ConditionFeedPreviewItemDto[]> => {
    const res = await fetch(
      `/api/teskeid/weather/vedurpuls/feed-preview?limitItems=${limitItems}`
    )
    if (!res.ok) return []
    const payload = await res.json() as { items: ConditionFeedPreviewItemDto[] }
    return payload.items ?? []
  // limitItems is stable per render cycle; useFeedLoader handles re-fetching via cacheKey.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitItems])

  return useFeedLoader<ConditionFeedPreviewItemDto>({
    fetcher,
    cacheKey: String(limitItems),
    pollIntervalMs,
    disabled,
    isOpen,
  })
}
