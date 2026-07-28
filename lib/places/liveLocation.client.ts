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
  accuracyM: number | null
  timestamp: number
  headingDeg: number | null
  headingSource: 'device' | 'derived' | null
  speedMps: number | null
}

export type LiveLocationFollowMode = 'follow' | 'free'
export type LiveLocationFollowEvent =
  | 'programmatic_camera'
  | 'user_camera'
  | 'recenter'
  | 'zoom_changed'

export type LiveLocationFollowDecision = {
  mode: LiveLocationFollowMode
  moveCamera: boolean
}

export type LiveLocationWatchOptions = {
  onPosition: (point: LiveLocationPoint) => void
  onError: (code: LiveLocationErrorCode) => void
  enableHighAccuracy?: boolean
  maximumAgeMs?: number
  timeoutMs?: number
}

export const LIVE_LOCATION_FOLLOW_ZOOM_MIN = 5
export const LIVE_LOCATION_FOLLOW_ZOOM_MAX = 18
export const LIVE_LOCATION_FOLLOW_ZOOM_DEFAULT = 14
export const LIVE_LOCATION_FOLLOW_ZOOM_STORAGE_KEY = 'teskeid_route_live_follow_zoom_v1'

const DEVICE_HEADING_MIN_SPEED_MPS = 2
const HEADING_MAX_ACCURACY_M = 50
const DERIVED_HEADING_MIN_ELAPSED_MS = 750
const DERIVED_HEADING_MAX_ELAPSED_MS = 15_000
const DERIVED_HEADING_MIN_DISTANCE_M = 15
const DERIVED_HEADING_MAX_SPEED_MPS = 70
const RETAINED_HEADING_MAX_AGE_MS = 10_000
const HEADING_SMOOTHING_FACTOR = 0.45
const DEVICE_DERIVED_AGREEMENT_DEG = 35
const DEVICE_OUTLIER_CONFIRMATION_DEG = 30
const DEVICE_OUTLIER_MAX_AGE_MS = 4_000

type HeadingSample = {
  lat: number
  lon: number
  accuracyM: number
  timestamp: number
}

export function clampLiveLocationFollowZoom(value: unknown): number {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : Number.NaN
  if (!Number.isFinite(numeric)) return LIVE_LOCATION_FOLLOW_ZOOM_DEFAULT
  return Math.max(
    LIVE_LOCATION_FOLLOW_ZOOM_MIN,
    Math.min(LIVE_LOCATION_FOLLOW_ZOOM_MAX, Math.round(numeric)),
  )
}

export function reduceLiveLocationFollowMode(
  mode: LiveLocationFollowMode,
  event: LiveLocationFollowEvent,
): LiveLocationFollowDecision {
  if (event === 'user_camera') return { mode: 'free', moveCamera: false }
  if (event === 'recenter') return { mode: 'follow', moveCamera: true }
  if (event === 'zoom_changed') return { mode, moveCamera: mode === 'follow' }
  return { mode, moveCamera: false }
}

export function normalizeHeadingDegrees(value: number): number {
  return ((value % 360) + 360) % 360
}

export function headingAngularDistanceDegrees(a: number, b: number): number {
  const normalizedA = normalizeHeadingDegrees(a)
  const normalizedB = normalizeHeadingDegrees(b)
  return Math.abs(((normalizedB - normalizedA + 540) % 360) - 180)
}

/**
 * Returns the numerically nearest representation of a geographic bearing.
 * CSS can then animate 359° -> 361° instead of taking the long way to 1°.
 */
export function nearestEquivalentHeadingDegrees(
  previousUnwrapped: number | null,
  target: number,
): number {
  const normalizedTarget = normalizeHeadingDegrees(target)
  if (previousUnwrapped === null || !Number.isFinite(previousUnwrapped)) {
    return normalizedTarget
  }
  const previousNormalized = normalizeHeadingDegrees(previousUnwrapped)
  const shortestDelta = ((normalizedTarget - previousNormalized + 540) % 360) - 180
  return previousUnwrapped + shortestDelta
}

export function stabilizeHeadingDegrees(previous: number | null, next: number): number {
  const normalizedNext = normalizeHeadingDegrees(next)
  if (previous === null || !Number.isFinite(previous)) return normalizedNext
  const normalizedPrevious = normalizeHeadingDegrees(previous)
  const shortestDelta = ((normalizedNext - normalizedPrevious + 540) % 360) - 180
  return normalizeHeadingDegrees(
    normalizedPrevious + shortestDelta * HEADING_SMOOTHING_FACTOR,
  )
}

function distanceBetweenSamplesM(from: HeadingSample, to: HeadingSample): number {
  const earthRadiusM = 6_371_000
  const toRadians = (degrees: number) => degrees * Math.PI / 180
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)
  const deltaLat = toRadians(to.lat - from.lat)
  const deltaLon = toRadians(to.lon - from.lon)
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  const boundedHaversine = Math.max(0, Math.min(1, haversine))
  return earthRadiusM * 2 * Math.atan2(
    Math.sqrt(boundedHaversine),
    Math.sqrt(1 - boundedHaversine),
  )
}

function bearingBetweenSamplesDeg(from: HeadingSample, to: HeadingSample): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180
  const toDegrees = (radians: number) => radians * 180 / Math.PI
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)
  const deltaLon = toRadians(to.lon - from.lon)
  const y = Math.sin(deltaLon) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon)
  return normalizeHeadingDegrees(toDegrees(Math.atan2(y, x)))
}

function interpolateHeadingDegrees(from: number, to: number, ratio: number): number {
  const unwrappedTo = nearestEquivalentHeadingDegrees(from, to)
  return normalizeHeadingDegrees(from + (unwrappedTo - from) * ratio)
}

function maxPlausibleHeadingChangeDegrees(speedMps: number | null, elapsedMs: number): number {
  const turnRateDegPerSecond = speedMps !== null && speedMps >= 15
    ? 30
    : speedMps !== null && speedMps >= 5
      ? 60
      : 120
  const elapsedSeconds = Math.max(0.25, Math.min(4, elapsedMs / 1_000))
  return Math.max(15, turnRateDegPerSecond * elapsedSeconds)
}

function limitHeadingChangeDegrees(
  previous: number | null,
  next: number,
  maxChangeDeg: number,
): number {
  if (previous === null || !Number.isFinite(previous)) return normalizeHeadingDegrees(next)
  const unwrappedNext = nearestEquivalentHeadingDegrees(previous, next)
  const delta = unwrappedNext - previous
  if (Math.abs(delta) <= maxChangeDeg) return normalizeHeadingDegrees(unwrappedNext)
  return normalizeHeadingDegrees(previous + Math.sign(delta) * maxChangeDeg)
}

export function deriveLiveLocationHeading(
  previous: HeadingSample,
  current: HeadingSample,
): number | null {
  if (
    previous.accuracyM > HEADING_MAX_ACCURACY_M ||
    current.accuracyM > HEADING_MAX_ACCURACY_M
  ) {
    return null
  }

  const elapsedMs = current.timestamp - previous.timestamp
  if (
    !Number.isFinite(elapsedMs) ||
    elapsedMs < DERIVED_HEADING_MIN_ELAPSED_MS ||
    elapsedMs > DERIVED_HEADING_MAX_ELAPSED_MS
  ) {
    return null
  }

  const distanceM = distanceBetweenSamplesM(previous, current)
  const combinedAccuracyM = Math.hypot(previous.accuracyM, current.accuracyM)
  const noiseFloorM = Math.max(DERIVED_HEADING_MIN_DISTANCE_M, combinedAccuracyM * 1.5)
  if (
    !Number.isFinite(distanceM) ||
    distanceM < noiseFloorM ||
    distanceM / (elapsedMs / 1_000) > DERIVED_HEADING_MAX_SPEED_MPS
  ) {
    return null
  }

  return bearingBetweenSamplesDeg(previous, current)
}

function finiteAccuracyM(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null
}

function deviceCourseHeadingDeg(coords: GeolocationCoordinates): number | null {
  const heading = coords.heading
  const speed = coords.speed
  const accuracyM = finiteAccuracyM(coords.accuracy)
  if (
    heading === null ||
    !Number.isFinite(heading) ||
    heading < 0 ||
    heading >= 360 ||
    speed === null ||
    !Number.isFinite(speed) ||
    speed < DEVICE_HEADING_MIN_SPEED_MPS ||
    speed > DERIVED_HEADING_MAX_SPEED_MPS ||
    accuracyM === null ||
    accuracyM > HEADING_MAX_ACCURACY_M
  ) {
    return null
  }
  return heading
}

function isGeolocationSecurityError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'SecurityError'
  )
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
  let headingAnchor: HeadingSample | null = null
  let stableHeading: number | null = null
  let stableHeadingSource: LiveLocationPoint['headingSource'] = null
  let stableHeadingTimestamp = 0
  let lastProcessedTimestamp = 0
  let pendingDeviceHeading: { headingDeg: number; timestamp: number } | null = null
  let watchId: number | null = null
  const stop = () => {
    if (stopped) return
    stopped = true
    if (watchId !== null) navigator.geolocation.clearWatch(watchId)
  }

  try {
    watchId = navigator.geolocation.watchPosition(
      position => {
        if (stopped) return
        const lat = position.coords.latitude
        const lon = position.coords.longitude
        if (!validateIcelandicCoords(lat, lon)) {
          options.onError('outside_iceland')
          return
        }
        const trustedAccuracyM = finiteAccuracyM(position.coords.accuracy)
        const accuracyM = trustedAccuracyM
        const timestamp = Number.isFinite(position.timestamp) ? position.timestamp : Date.now()
        if (timestamp <= lastProcessedTimestamp) return
        lastProcessedTimestamp = timestamp
        const speedMps =
          position.coords.speed !== null &&
          Number.isFinite(position.coords.speed) &&
          position.coords.speed >= 0 &&
          position.coords.speed <= DERIVED_HEADING_MAX_SPEED_MPS
            ? position.coords.speed
            : null
        const currentSample: HeadingSample = {
          lat,
          lon,
          accuracyM: trustedAccuracyM ?? Number.POSITIVE_INFINITY,
          timestamp,
        }
        const deviceHeading = deviceCourseHeadingDeg(position.coords)
        const derivedHeading = headingAnchor
          ? deriveLiveLocationHeading(headingAnchor, currentSample)
          : null
        if (derivedHeading !== null) {
          headingAnchor = currentSample
        } else if (
          headingAnchor === null ||
          timestamp - headingAnchor.timestamp > DERIVED_HEADING_MAX_ELAPSED_MS
        ) {
          headingAnchor = currentSample.accuracyM <= HEADING_MAX_ACCURACY_M
            ? currentSample
            : headingAnchor
        }

        let nextRawHeading: number | null = null
        let nextHeadingSource: LiveLocationPoint['headingSource'] = null
        if (deviceHeading !== null && derivedHeading !== null) {
          if (
            headingAngularDistanceDegrees(deviceHeading, derivedHeading) <=
            DEVICE_DERIVED_AGREEMENT_DEG
          ) {
            nextRawHeading = interpolateHeadingDegrees(derivedHeading, deviceHeading, 0.4)
            nextHeadingSource = 'device'
          } else {
            // GPS displacement is independent of the browser course value and
            // wins when the two disagree strongly while the vehicle is moving.
            nextRawHeading = derivedHeading
            nextHeadingSource = 'derived'
          }
          pendingDeviceHeading = null
        } else if (derivedHeading !== null) {
          nextRawHeading = derivedHeading
          nextHeadingSource = 'derived'
          pendingDeviceHeading = null
        } else if (deviceHeading !== null) {
          const elapsedSinceStableMs = stableHeadingTimestamp > 0
            ? timestamp - stableHeadingTimestamp
            : 0
          const plausibleChangeDeg = maxPlausibleHeadingChangeDegrees(
            speedMps,
            elapsedSinceStableMs,
          )
          const deviceLooksContinuous = stableHeading !== null &&
            headingAngularDistanceDegrees(stableHeading, deviceHeading) <= plausibleChangeDeg
          const pendingLooksConsistent = pendingDeviceHeading !== null &&
            timestamp - pendingDeviceHeading.timestamp <= DEVICE_OUTLIER_MAX_AGE_MS &&
            headingAngularDistanceDegrees(
              pendingDeviceHeading.headingDeg,
              deviceHeading,
            ) <= DEVICE_OUTLIER_CONFIRMATION_DEG

          if (deviceLooksContinuous) {
            nextRawHeading = deviceHeading
            nextHeadingSource = 'device'
            pendingDeviceHeading = null
          } else if (
            pendingLooksConsistent &&
            (stableHeading === null || speedMps === null || speedMps < 15)
          ) {
            nextRawHeading = interpolateHeadingDegrees(
              pendingDeviceHeading!.headingDeg,
              deviceHeading,
              0.5,
            )
            nextHeadingSource = 'device'
            pendingDeviceHeading = null
          } else {
            pendingDeviceHeading = { headingDeg: deviceHeading, timestamp }
          }
        }

        if (nextRawHeading !== null) {
          const elapsedSinceStableMs = stableHeadingTimestamp > 0
            ? timestamp - stableHeadingTimestamp
            : 1_000
          const boundedHeading = limitHeadingChangeDegrees(
            stableHeading,
            nextRawHeading,
            maxPlausibleHeadingChangeDegrees(speedMps, elapsedSinceStableMs),
          )
          stableHeading = stabilizeHeadingDegrees(stableHeading, boundedHeading)
          stableHeadingSource = nextHeadingSource
          stableHeadingTimestamp = timestamp
        }
        if (timestamp - stableHeadingTimestamp > RETAINED_HEADING_MAX_AGE_MS) {
          stableHeading = null
          stableHeadingSource = null
        }
        options.onPosition({
          lat,
          lon,
          accuracyM,
          timestamp,
          headingDeg: stableHeading,
          headingSource: stableHeadingSource,
          speedMps,
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
  } catch (error) {
    stopped = true
    options.onError(
      isGeolocationSecurityError(error) ? 'permission_denied' : 'position_unavailable',
    )
  }

  return stop
}
