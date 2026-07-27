'use client'

import { validateIcelandicCoords } from '@/lib/weather/coords'

export type LiveLocationErrorCode =
  | 'unsupported'
  | 'insecure_context'
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'
  | 'outside_iceland'

export type LiveLocationPoint = {
  lat: number
  lon: number
  accuracyM: number
  timestamp: number
}

export type LiveLocationWatchOptions = {
  onPosition: (point: LiveLocationPoint) => void
  onError: (code: LiveLocationErrorCode) => void
  enableHighAccuracy?: boolean
  maximumAgeMs?: number
  timeoutMs?: number
}

/**
 * Starts an explicit, browser-local location watch for a map marker.
 *
 * This helper never reverse-geocodes, fetches, logs, stores or otherwise sends
 * the coordinates anywhere. The caller owns the returned cleanup function and
 * must stop the watch when the marker is hidden or its UI context is left.
 */
export function watchLiveLocation(options: LiveLocationWatchOptions): () => void {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    options.onError('insecure_context')
    return () => {}
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    options.onError('unsupported')
    return () => {}
  }

  let stopped = false
  const watchId = navigator.geolocation.watchPosition(
    position => {
      if (stopped) return
      const lat = position.coords.latitude
      const lon = position.coords.longitude
      if (!validateIcelandicCoords(lat, lon)) {
        options.onError('outside_iceland')
        return
      }
      options.onPosition({
        lat,
        lon,
        accuracyM: Number.isFinite(position.coords.accuracy)
          ? Math.max(0, position.coords.accuracy)
          : 0,
        timestamp: position.timestamp,
      })
    },
    error => {
      if (stopped) return
      options.onError(
        error.code === 1
          ? 'permission_denied'
          : error.code === 3
            ? 'timeout'
            : 'position_unavailable',
      )
    },
    {
      enableHighAccuracy: options.enableHighAccuracy ?? false,
      maximumAge: options.maximumAgeMs ?? 15_000,
      timeout: options.timeoutMs ?? 15_000,
    },
  )

  return () => {
    if (stopped) return
    stopped = true
    navigator.geolocation.clearWatch(watchId)
  }
}
