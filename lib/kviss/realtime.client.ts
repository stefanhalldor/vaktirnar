'use client'

import { createClient } from '@/lib/supabase/client'
import type { AuthoritativeRefreshSubscription } from '@/lib/realtime/useAuthoritativeRefresh'

export const KVISS_REALTIME_DEFAULT_THROTTLE_MS = 300

function validThrottleMs(throttleMs: number): number {
  return Number.isFinite(throttleMs) && throttleMs >= 0
    ? throttleMs
    : KVISS_REALTIME_DEFAULT_THROTTLE_MS
}

/**
 * Adapts Kviss' lossy Supabase bell to the provider-neutral refresh contract.
 * No event payload is trusted or applied; every accepted bell only invalidates
 * the authoritative HTTP projection.
 */
export function createKvissRealtimeSubscription(
  topic: string | null,
  throttleMs = KVISS_REALTIME_DEFAULT_THROTTLE_MS,
): AuthoritativeRefreshSubscription | undefined {
  if (!topic) return undefined
  const broadcastThrottleMs = validThrottleMs(throttleMs)

  return onInvalidate => {
    const client = createClient()
    let active = true
    let lastBroadcastAt = Number.NEGATIVE_INFINITY
    const invalidateIfActive = () => {
      if (active) onInvalidate()
    }
    const onBroadcast = () => {
      const now = Date.now()
      if (!active || now - lastBroadcastAt < broadcastThrottleMs) return
      lastBroadcastAt = now
      onInvalidate()
    }
    const channel = client.channel(topic)
      .on('broadcast', { event: 'invalidate' }, onBroadcast)
      .subscribe(status => {
        if (status === 'SUBSCRIBED') invalidateIfActive()
      })

    return () => {
      if (!active) return
      active = false
      void client.removeChannel(channel).catch(() => undefined)
    }
  }
}
