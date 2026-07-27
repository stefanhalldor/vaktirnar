import type { WindDisplayStatus } from '@/lib/weather/windDisplayStatus'

export type RouteWindArrowPoint = {
  lat: number
  lon: number
}

export type RouteWindArrowStation = {
  stationId: string
  distanceFromOriginM: number | null
  routeFraction: number | null
  measuredAtIso: string
  statusWindMs: number | null
  windDirectionDeg: number | null
  windDirectionText: string | null
  windDisplayStatus: WindDisplayStatus
}

export type RouteWindArrowLane = 'left' | 'right'

export type RouteWindArrowFeature = {
  type: 'Feature'
  id: string
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: {
    stationId: string
    windTowardDeg: number
    roadBearingDeg: number
    iconOffset: [number, number]
    windDisplayStatus: WindDisplayStatus
    opacity: number
    freshness: 'fresh' | 'aging'
    lane: RouteWindArrowLane
    distanceFromOriginM: number
  }
}

export type RouteWindArrowFeatureCollection = {
  type: 'FeatureCollection'
  features: RouteWindArrowFeature[]
}

export type BuildRouteWindArrowFieldInput = {
  routePoints: ReadonlyArray<RouteWindArrowPoint>
  stations: ReadonlyArray<RouteWindArrowStation>
  nowMs?: number
  cacheStatus?: string | null
  baseSpacingM?: number
  sideOffsetAtIconSizeOne?: number
  maxStationInfluenceM?: number
  maxFeatures?: number
  freshMaxAgeMs?: number
  maxAgeMs?: number
  maxFutureSkewMs?: number
}

const EARTH_RADIUS_M = 6_371_000
const DEFAULT_BASE_SPACING_M = 8_000
const DEFAULT_SIDE_OFFSET_AT_ICON_SIZE_ONE = 24
const DEFAULT_MAX_STATION_INFLUENCE_M = 15_000
const DEFAULT_MAX_FEATURES = 180
const DEFAULT_FRESH_MAX_AGE_MS = 15 * 60_000
const DEFAULT_MAX_AGE_MS = 30 * 60_000
const DEFAULT_MAX_FUTURE_SKEW_MS = 5 * 60_000
const EMPTY_FIELD: RouteWindArrowFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
}
const LANES = [
  { lane: 'left', bearingOffsetDeg: -90 },
  { lane: 'right', bearingOffsetDeg: 90 },
] as const
const ICELANDIC_WIND_FROM_DEGREES: Record<string, number> = {
  N: 0,
  NNA: 22.5,
  NA: 45,
  ANA: 67.5,
  A: 90,
  ASA: 112.5,
  SA: 135,
  SSA: 157.5,
  S: 180,
  SSV: 202.5,
  SV: 225,
  VSV: 247.5,
  V: 270,
  VNV: 292.5,
  NV: 315,
  NNV: 337.5,
}

function toRadians(value: number): number {
  return value * Math.PI / 180
}

function toDegrees(value: number): number {
  return value * 180 / Math.PI
}

export function normalizeBearingDeg(value: number): number {
  return ((value % 360) + 360) % 360
}

/**
 * Vegagerðin reports the meteorological FROM bearing. The map arrow shows the
 * direction the measured wind is travelling toward, so a north wind points
 * south. MapLibre applies camera bearing separately for map-aligned symbols.
 */
export function windTowardBearingDeg(windFromDeg: number): number | null {
  if (!Number.isFinite(windFromDeg)) return null
  return normalizeBearingDeg(windFromDeg + 180)
}

export function windDirectionTextToFromBearingDeg(value: string | null | undefined): number | null {
  const normalized = value?.trim().toUpperCase()
  if (!normalized) return null
  const numeric = Number(normalized.replace(',', '.'))
  if (Number.isFinite(numeric)) return normalizeBearingDeg(numeric)
  return ICELANDIC_WIND_FROM_DEGREES[normalized] ?? null
}

export function resolveWindTowardBearingDeg(
  degrees: number | null | undefined,
  text: string | null | undefined,
): number | null {
  const fromBearing = typeof degrees === 'number' && Number.isFinite(degrees)
    ? normalizeBearingDeg(degrees)
    : windDirectionTextToFromBearingDeg(text)
  return fromBearing === null ? null : windTowardBearingDeg(fromBearing)
}

function haversineDistanceM(a: RouteWindArrowPoint, b: RouteWindArrowPoint): number {
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const dLat = lat2 - lat1
  const dLon = toRadians(b.lon - a.lon)
  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

function initialBearingDeg(a: RouteWindArrowPoint, b: RouteWindArrowPoint): number {
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const dLon = toRadians(b.lon - a.lon)
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return normalizeBearingDeg(toDegrees(Math.atan2(y, x)))
}

function positiveOption(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
}

function normalizeRoutePoints(
  points: ReadonlyArray<RouteWindArrowPoint>,
): RouteWindArrowPoint[] {
  const result: RouteWindArrowPoint[] = []
  for (const point of points) {
    if (
      !Number.isFinite(point.lat) ||
      !Number.isFinite(point.lon) ||
      point.lat < -90 || point.lat > 90 ||
      point.lon < -180 || point.lon > 180
    ) {
      continue
    }
    const previous = result[result.length - 1]
    if (previous && haversineDistanceM(previous, point) < 1) continue
    result.push({ lat: point.lat, lon: point.lon })
  }
  return result
}

function buildCumulativeDistances(points: ReadonlyArray<RouteWindArrowPoint>): number[] {
  const cumulative = [0]
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative[index - 1] + haversineDistanceM(points[index - 1], points[index]))
  }
  return cumulative
}

function interpolateRoutePoint(
  points: ReadonlyArray<RouteWindArrowPoint>,
  cumulative: ReadonlyArray<number>,
  distanceM: number,
): { point: RouteWindArrowPoint; roadBearingDeg: number } {
  let low = 1
  let high = cumulative.length - 1
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (cumulative[middle] < distanceM) low = middle + 1
    else high = middle
  }
  const segmentEndIndex = Math.max(1, low)
  const segmentStartIndex = segmentEndIndex - 1
  const start = points[segmentStartIndex]
  const end = points[segmentEndIndex]
  const segmentStartM = cumulative[segmentStartIndex]
  const segmentLengthM = Math.max(1, cumulative[segmentEndIndex] - segmentStartM)
  const ratio = Math.max(0, Math.min(1, (distanceM - segmentStartM) / segmentLengthM))
  return {
    point: {
      lat: start.lat + (end.lat - start.lat) * ratio,
      lon: start.lon + (end.lon - start.lon) * ratio,
    },
    roadBearingDeg: initialBearingDeg(start, end),
  }
}

function stationDistanceFromOriginM(
  station: RouteWindArrowStation,
  routeLengthM: number,
): number | null {
  if (typeof station.distanceFromOriginM === 'number' && Number.isFinite(station.distanceFromOriginM)) {
    return Math.max(0, Math.min(routeLengthM, station.distanceFromOriginM))
  }
  if (typeof station.routeFraction === 'number' && Number.isFinite(station.routeFraction)) {
    return Math.max(0, Math.min(1, station.routeFraction)) * routeLengthM
  }
  return null
}

function stationFreshness(
  measuredAtIso: string,
  nowMs: number,
  freshMaxAgeMs: number,
  maxAgeMs: number,
  maxFutureSkewMs: number,
): { freshness: 'fresh' | 'aging'; opacity: number } | null {
  const measuredAtMs = Date.parse(measuredAtIso)
  if (!Number.isFinite(measuredAtMs)) return null
  if (measuredAtMs - nowMs > maxFutureSkewMs) return null
  const ageMs = Math.max(0, nowMs - measuredAtMs)
  if (ageMs > maxAgeMs) return null
  return ageMs <= freshMaxAgeMs
    ? { freshness: 'fresh', opacity: 0.82 }
    : { freshness: 'aging', opacity: 0.46 }
}

/**
 * MapLibre rotates icon-offset together with icon-rotate. Expressing the
 * road-normal vector in the arrow's local coordinate system therefore keeps
 * both lanes perpendicular to the road, at a stable visual distance, while
 * the arrow continues to point toward the true geographic wind bearing.
 */
function iconOffsetForRoadSide(
  roadBearingDeg: number,
  windTowardDeg: number,
  bearingOffsetDeg: number,
  distanceAtIconSizeOne: number,
): [number, number] {
  const relativeBearing = toRadians(normalizeBearingDeg(
    roadBearingDeg + bearingOffsetDeg - windTowardDeg,
  ))
  return [
    Math.sin(relativeBearing) * distanceAtIconSizeOne,
    -Math.cos(relativeBearing) * distanceAtIconSizeOne,
  ]
}

export function buildRouteWindArrowField({
  routePoints,
  stations,
  nowMs = Date.now(),
  cacheStatus = null,
  baseSpacingM: rawBaseSpacingM,
  sideOffsetAtIconSizeOne: rawSideOffsetAtIconSizeOne,
  maxStationInfluenceM: rawMaxStationInfluenceM,
  maxFeatures: rawMaxFeatures,
  freshMaxAgeMs: rawFreshMaxAgeMs,
  maxAgeMs: rawMaxAgeMs,
  maxFutureSkewMs: rawMaxFutureSkewMs,
}: BuildRouteWindArrowFieldInput): RouteWindArrowFeatureCollection {
  if (cacheStatus === 'history_fallback') return EMPTY_FIELD

  const points = normalizeRoutePoints(routePoints)
  if (points.length < 2 || stations.length === 0) return EMPTY_FIELD

  const cumulative = buildCumulativeDistances(points)
  const routeLengthM = cumulative[cumulative.length - 1]
  if (!Number.isFinite(routeLengthM) || routeLengthM < 1) return EMPTY_FIELD

  const baseSpacingM = positiveOption(rawBaseSpacingM, DEFAULT_BASE_SPACING_M)
  const sideOffsetAtIconSizeOne = positiveOption(
    rawSideOffsetAtIconSizeOne,
    DEFAULT_SIDE_OFFSET_AT_ICON_SIZE_ONE,
  )
  const maxStationInfluenceM = positiveOption(
    rawMaxStationInfluenceM,
    DEFAULT_MAX_STATION_INFLUENCE_M,
  )
  const maxFeatures = Math.max(1, Math.floor(positiveOption(rawMaxFeatures, DEFAULT_MAX_FEATURES)))
  const freshMaxAgeMs = positiveOption(rawFreshMaxAgeMs, DEFAULT_FRESH_MAX_AGE_MS)
  const maxAgeMs = Math.max(freshMaxAgeMs, positiveOption(rawMaxAgeMs, DEFAULT_MAX_AGE_MS))
  const maxFutureSkewMs = positiveOption(rawMaxFutureSkewMs, DEFAULT_MAX_FUTURE_SKEW_MS)

  const usableStations = stations
    .map(station => {
      const alongRouteM = stationDistanceFromOriginM(station, routeLengthM)
      const windTowardDeg = resolveWindTowardBearingDeg(
        station.windDirectionDeg,
        station.windDirectionText,
      )
      const freshness = stationFreshness(
        station.measuredAtIso,
        nowMs,
        freshMaxAgeMs,
        maxAgeMs,
        maxFutureSkewMs,
      )
      const hasWindMeasurement = typeof station.statusWindMs === 'number' &&
        Number.isFinite(station.statusWindMs) &&
        station.statusWindMs > 0 &&
        station.windDisplayStatus !== 'no_data' &&
        station.windDisplayStatus !== 'no_wind_data'
      return alongRouteM !== null && windTowardDeg !== null && freshness && hasWindMeasurement
        ? { station, alongRouteM, windTowardDeg, ...freshness }
        : null
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.alongRouteM - b.alongRouteM || a.station.stationId.localeCompare(b.station.stationId))
  if (usableStations.length === 0) return EMPTY_FIELD

  const maxAnchorCount = Math.max(1, Math.floor(maxFeatures / LANES.length))
  const desiredAnchorCount = Math.max(1, Math.ceil(routeLengthM / baseSpacingM))
  const anchorCount = Math.min(maxAnchorCount, desiredAnchorCount)
  const features: RouteWindArrowFeature[] = []

  for (let anchorIndex = 0; anchorIndex < anchorCount; anchorIndex += 1) {
    const distanceFromOriginM = routeLengthM * (anchorIndex + 0.5) / anchorCount
    let nearest = usableStations[0]
    for (let stationIndex = 1; stationIndex < usableStations.length; stationIndex += 1) {
      const candidate = usableStations[stationIndex]
      if (
        Math.abs(candidate.alongRouteM - distanceFromOriginM) <
        Math.abs(nearest.alongRouteM - distanceFromOriginM)
      ) {
        nearest = candidate
      }
    }
    if (Math.abs(nearest.alongRouteM - distanceFromOriginM) > maxStationInfluenceM) continue

    const sample = interpolateRoutePoint(points, cumulative, distanceFromOriginM)
    for (const lane of LANES) {
      if (features.length >= maxFeatures) break
      features.push({
        type: 'Feature',
        id: `${nearest.station.stationId}:${anchorIndex}:${lane.lane}`,
        geometry: {
          type: 'Point',
          coordinates: [sample.point.lon, sample.point.lat],
        },
        properties: {
          stationId: nearest.station.stationId,
          windTowardDeg: nearest.windTowardDeg,
          roadBearingDeg: sample.roadBearingDeg,
          iconOffset: iconOffsetForRoadSide(
            sample.roadBearingDeg,
            nearest.windTowardDeg,
            lane.bearingOffsetDeg,
            sideOffsetAtIconSizeOne,
          ),
          windDisplayStatus: nearest.station.windDisplayStatus,
          opacity: nearest.opacity,
          freshness: nearest.freshness,
          lane: lane.lane,
          distanceFromOriginM: Math.round(distanceFromOriginM),
        },
      })
    }
  }

  return { type: 'FeatureCollection', features }
}
