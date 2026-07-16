'use client'

import { useEffect, useState } from 'react'
import type { AugmentedChatMessage } from './ChatMessageRow'

/**
 * Shared preview hook for single-station Veðurpúls preview surfaces.
 *
 * Fetches messages from `url` on mount, then polls every `pollingIntervalMs`.
 * Also refreshes immediately when a `teskeid:pulse:refresh` custom window event fires,
 * which is dispatched after a successful send in the same tab.
 *
 * Re-runs the effect when `url` changes (e.g., on stationId change).
 */
export function useChatPreview({
  url,
  pollingIntervalMs = 30_000,
}: {
  url: string
  pollingIntervalMs?: number
}): { messages: AugmentedChatMessage[]; loaded: boolean } {
  const [messages, setMessages] = useState<AugmentedChatMessage[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Reset immediately so stale messages from the previous URL never flash under the new target.
    setMessages([])
    setLoaded(false)
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(url)
        if (res.ok && !cancelled) setMessages(await res.json())
      } catch { /* silent */ } finally {
        if (!cancelled) setLoaded(true)
      }
    }

    load()
    const id = setInterval(load, pollingIntervalMs)

    function handleRefresh() { void load() }
    window.addEventListener('teskeid:pulse:refresh', handleRefresh)

    return () => {
      cancelled = true
      clearInterval(id)
      window.removeEventListener('teskeid:pulse:refresh', handleRefresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, pollingIntervalMs])

  return { messages, loaded }
}
