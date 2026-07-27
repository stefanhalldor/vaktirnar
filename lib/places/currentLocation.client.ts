'use client'

import type { PlaceSource, SelectedLocation } from '@/lib/places/types'
import { validateIcelandicCoords } from '@/lib/weather/coords'

export type CurrentLocationErrorCode =
  | 'unsupported'
  | 'insecure_context'
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'
  | 'outside_iceland'
  | 'aborted'

export class CurrentLocationError extends Error {
  readonly code: CurrentLocationErrorCode

  constructor(code: CurrentLocationErrorCode) {
    super(code)
    this.name = 'CurrentLocationError'
    this.code = code
  }
}

export type CurrentLocationOptions = {
  /** Localized fallback shown when the reverse lookup has no useful label. */
  fallbackName: string
  /** Localized wrapper for a nearby HMS label; it must not imply exact address matching. */
  formatNearbyLabel?: (place: string) => string
  signal?: AbortSignal
  timeoutMs?: number
  maximumAgeMs?: number
  enableHighAccuracy?: boolean
}

export type CurrentDeviceLocation = SelectedLocation & { source: 'device' }
export type MapSelectedLocation = SelectedLocation & { source: 'map' }

export type CoordinateLocationOptions = {
  /** Localized fallback shown when the reverse lookup has no useful label. */
  fallbackName: string
  /** Localized wrapper for a nearby HMS label; it must not imply exact address matching. */
  formatNearbyLabel?: (place: string) => string
  signal?: AbortSignal
}

type ReverseGeocodePayload = {
  location?: unknown
  place?: unknown
  result?: unknown
  name?: unknown
  formattedAddress?: unknown
  source?: unknown
  placeType?: unknown
  postalCode?: unknown
  postalLocality?: unknown
  municipality?: unknown
  municipalityCode?: unknown
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function placeSourceValue(value: unknown): PlaceSource | undefined {
  return value === 'hms' ||
    value === 'official' ||
    value === 'device' ||
    value === 'map' ||
    value === 'saved' ||
    value === 'static' ||
    value === 'curated' ||
    value === 'google'
    ? value
    : undefined
}

function reverseLocationFrom(payload: ReverseGeocodePayload): Record<string, unknown> {
  const nested = payload.location ?? payload.place ?? payload.result
  return nested && typeof nested === 'object'
    ? nested as Record<string, unknown>
    : payload as Record<string, unknown>
}

async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch('/api/place/reverse-geocode', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lon }),
      signal,
    })

    if (!response.ok) return null
    const payload = await response.json().catch(() => null) as ReverseGeocodePayload | null
    return payload ? reverseLocationFrom(payload) : null
  } catch (error) {
    if (signal?.aborted) throw new CurrentLocationError('aborted')
    return null
  }
}

async function locationFromCoordinates(
  lat: number,
  lon: number,
  source: 'device' | 'map',
  options: CoordinateLocationOptions,
  accuracyM?: number,
): Promise<CurrentDeviceLocation | MapSelectedLocation> {
  if (!validateIcelandicCoords(lat, lon)) {
    throw new CurrentLocationError('outside_iceland')
  }
  if (options.signal?.aborted) {
    throw new CurrentLocationError('aborted')
  }

  const reverse = await reverseGeocode(lat, lon, options.signal)
  const reverseName = reverse
    ? stringValue(reverse.name ?? reverse.displayName)
    : undefined
  const formattedAddress = reverse
    ? stringValue(reverse.formattedAddress ?? reverse.address)
    : undefined
  const nearbyPlace = formattedAddress ?? reverseName
  const labelSource = nearbyPlace && reverse
    ? placeSourceValue(reverse.source)
    : undefined

  return {
    id: `${source}:${lat.toFixed(6)}:${lon.toFixed(6)}`,
    name: options.fallbackName,
    formattedAddress: nearbyPlace
      ? options.formatNearbyLabel?.(nearbyPlace) ?? nearbyPlace
      : options.fallbackName,
    lat,
    lon,
    source,
    labelSource,
    placeType: 'point',
    postalCode: reverse ? stringValue(reverse.postalCode) : undefined,
    postalLocality: reverse ? stringValue(reverse.postalLocality) : undefined,
    municipality: reverse ? stringValue(reverse.municipality) : undefined,
    municipalityCode: reverse ? stringValue(reverse.municipalityCode) : undefined,
    accuracyM,
  }
}

/**
 * Resolves display copy for an exact point chosen on the map.
 *
 * The clicked coordinate remains authoritative. Reverse lookup is same-origin,
 * display-only, and may fail without preventing the user from selecting the point.
 */
export async function getLocationFromCoordinates(
  lat: number,
  lon: number,
  options: CoordinateLocationOptions,
): Promise<MapSelectedLocation> {
  return locationFromCoordinates(lat, lon, 'map', options) as Promise<MapSelectedLocation>
}

function readPosition(
  options: Pick<CurrentLocationOptions, 'signal' | 'timeoutMs' | 'maximumAgeMs' | 'enableHighAccuracy'>,
): Promise<GeolocationPosition> {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return Promise.reject(new CurrentLocationError('insecure_context'))
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new CurrentLocationError('unsupported'))
  }
  if (options.signal?.aborted) {
    return Promise.reject(new CurrentLocationError('aborted'))
  }

  return new Promise((resolve, reject) => {
    let settled = false

    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      options.signal?.removeEventListener('abort', handleAbort)
      callback()
    }
    const handleAbort = () => finish(() => reject(new CurrentLocationError('aborted')))

    options.signal?.addEventListener('abort', handleAbort, { once: true })
    navigator.geolocation.getCurrentPosition(
      position => finish(() => resolve(position)),
      error => finish(() => {
        const code: CurrentLocationErrorCode =
          error.code === 1
            ? 'permission_denied'
            : error.code === 2
              ? 'position_unavailable'
              : error.code === 3
                ? 'timeout'
                : 'position_unavailable'
        reject(new CurrentLocationError(code))
      }),
      {
        enableHighAccuracy: options.enableHighAccuracy ?? false,
        maximumAge: options.maximumAgeMs ?? 5 * 60 * 1000,
        timeout: options.timeoutMs ?? 15_000,
      },
    )
  })
}

/**
 * Requests a single device position after an explicit user action.
 *
 * The exact device coordinates remain authoritative. Reverse geocoding is only
 * used for display copy and failure there never prevents selecting the point.
 */
export async function getCurrentLocation(
  options: CurrentLocationOptions,
): Promise<CurrentDeviceLocation> {
  const position = await readPosition(options)
  const lat = position.coords.latitude
  const lon = position.coords.longitude

  const accuracyM = Number.isFinite(position.coords.accuracy)
    ? Math.max(0, position.coords.accuracy)
    : undefined

  return locationFromCoordinates(lat, lon, 'device', options, accuracyM) as Promise<CurrentDeviceLocation>
}
