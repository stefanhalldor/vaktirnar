/**
 * Vegagerðin road-surface helpers.
 *
 * Source: vegakerfi/yfirbord MapServer layer 0 ("Slitlag").
 * Field `GERD_SL` currently maps 0 -> Möl and 1 -> Bundið.
 */

import { haversineM } from '@/lib/weather/providerRouteMatching'

export type RoadSurfaceBboxError = 'invalid_bbox' | 'bbox_out_of_range'
export type VegagerdinRoadSurfaceType = 'paved' | 'gravel' | 'unknown'

export type RoadSurfaceBboxRequest =
  | { ok: true; bbox: [number, number, number, number] }
  | { ok: false; error: RoadSurfaceBboxError }

export type RouteSurfaceIssue = {
  surfaceType: VegagerdinRoadSurfaceType
  label: string
  roadName: string | null
  roadNumber: string | null
  distanceM: number
  lengthM: number | null
}

export type RouteSurfaceSummary = {
  checked: boolean
  hasGravel: boolean
  gravelIssueCount: number
  gravelLengthM: number | null
  nearestGravelDistanceM: number | null
  gravelRoadNames: string[]
  issues: RouteSurfaceIssue[]
}

export const ROAD_SURFACE_LAYER_ID = 0
export const ROAD_SURFACE_MAX_FEATURES = 2_000
export const ROAD_SURFACE_ROUTE_MATCH_MAX_DISTANCE_M = 450

const ROAD_SURFACE_QUERY_URL =
  `https://vegasja.vegagerdin.is/arcgis/rest/services/vegakerfi/yfirbord/MapServer/${ROAD_SURFACE_LAYER_ID}/query`

const ICELAND_ENV = { west: -27, east: -10, south: 61, north: 69 } as const
const MAX_LON_SPAN = 30
const MAX_LAT_SPAN = 15

const ROAD_SURFACE_OUT_FIELDS = [
  'OBJECTID',
  'NRVEGUR',
  'NRKAFLI',
  'KAFLIVEGURHEITI',
  'GERD_SL',
  'SLITLAGLENGD',
  'VEGFLOKKUR',
  'VEGTEGUND',
] as const

export function parseRoadSurfaceBboxRequest(searchParams: URLSearchParams): RoadSurfaceBboxRequest {
  const raw = searchParams.get('bbox')
  if (!raw) return { ok: false, error: 'invalid_bbox' }

  const parts = raw.split(',').map((part) => Number(part.trim()))
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return { ok: false, error: 'invalid_bbox' }
  }

  const [west, south, east, north] = parts as [number, number, number, number]
  if (west >= east || south >= north) return { ok: false, error: 'invalid_bbox' }
  if (Math.abs(west) > 180 || Math.abs(east) > 180) return { ok: false, error: 'invalid_bbox' }
  if (south < -90 || north > 90) return { ok: false, error: 'invalid_bbox' }

  const intersectsIceland =
    west < ICELAND_ENV.east &&
    east > ICELAND_ENV.west &&
    south < ICELAND_ENV.north &&
    north > ICELAND_ENV.south
  if (!intersectsIceland) return { ok: false, error: 'bbox_out_of_range' }
  if (east - west > MAX_LON_SPAN || north - south > MAX_LAT_SPAN) {
    return { ok: false, error: 'bbox_out_of_range' }
  }

  return { ok: true, bbox: [west, south, east, north] }
}

export function buildVegagerdinRoadSurfaceQueryUrl(
  bbox: [number, number, number, number],
): string {
  const [west, south, east, north] = bbox
  const url = new URL(ROAD_SURFACE_QUERY_URL)

  url.searchParams.set('where', '1=1')
  url.searchParams.set('geometryType', 'esriGeometryEnvelope')
  url.searchParams.set('geometry', `${west},${south},${east},${north}`)
  url.searchParams.set('inSR', '4326')
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects')
  url.searchParams.set('outFields', ROAD_SURFACE_OUT_FIELDS.join(','))
  url.searchParams.set('returnGeometry', 'true')
  url.searchParams.set('outSR', '4326')
  url.searchParams.set('resultRecordCount', String(ROAD_SURFACE_MAX_FEATURES))
  url.searchParams.set('f', 'geojson')

  return url.toString()
}

export function isAllowedRoadSurfaceContentType(contentType: string | null): boolean {
  const ct = contentType?.toLowerCase() ?? ''
  return ct.startsWith('application/json') || ct.startsWith('application/geo+json')
}

function readStringProperty(properties: Record<string, unknown>, key: string): string | null {
  const value = properties[key]
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function readFiniteNumber(properties: Record<string, unknown>, key: string): number | null {
  const value = properties[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function classifyVegagerdinRoadSurface(value: unknown): VegagerdinRoadSurfaceType {
  if (value === 0 || value === '0') return 'gravel'
  if (value === 1 || value === '1') return 'paved'
  if (typeof value === 'string') {
    const lower = value.trim().toLocaleLowerCase('is-IS')
    if (
      lower === 'gravel' ||
      lower.includes('möl') ||
      lower.includes('mol') ||
      lower.includes('grus')
    ) return 'gravel'
    if (lower === 'paved' || lower.includes('bund') || lower.includes('malbik')) return 'paved'
  }
  return 'unknown'
}

export function roadSurfaceLabel(surfaceType: VegagerdinRoadSurfaceType): string {
  switch (surfaceType) {
    case 'gravel':
      return 'Möl'
    case 'paved':
      return 'Bundið'
    default:
      return 'Óþekkt slitlag'
  }
}

export function normalizeVegagerdinRoadSurfaceGeoJson(
  input: unknown,
): { ok: true; geojson: Record<string, unknown>; featureCount: number } | { ok: false } {
  if (typeof input !== 'object' || input === null) return { ok: false }

  const body = input as Record<string, unknown>
  if (body['type'] !== 'FeatureCollection' || !Array.isArray(body['features'])) {
    return { ok: false }
  }

  const features = (body['features'] as unknown[]).slice(0, ROAD_SURFACE_MAX_FEATURES)
  const normalizedFeatures = features.map((feature) => {
    if (typeof feature !== 'object' || feature === null) return feature

    const featureRecord = feature as Record<string, unknown>
    const rawProperties = featureRecord['properties']
    const properties =
      typeof rawProperties === 'object' && rawProperties !== null
        ? (rawProperties as Record<string, unknown>)
        : {}
    const surfaceType = classifyVegagerdinRoadSurface(properties['GERD_SL'])

    return {
      ...featureRecord,
      properties: {
        ...properties,
        teskeidRoadSurfaceType: surfaceType,
        teskeidRoadSurfaceLabel: roadSurfaceLabel(surfaceType),
      },
    }
  })

  return {
    ok: true,
    geojson: {
      ...body,
      type: 'FeatureCollection',
      features: normalizedFeatures,
    },
    featureCount: normalizedFeatures.length,
  }
}

type Coordinate = [number, number]

function isCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  )
}

function flattenLineStrings(geometry: unknown): Coordinate[][] {
  if (typeof geometry !== 'object' || geometry === null) return []
  const record = geometry as { type?: unknown; coordinates?: unknown }
  if (record.type === 'LineString' && Array.isArray(record.coordinates)) {
    const coords = record.coordinates.filter(isCoordinate)
    return coords.length >= 2 ? [coords] : []
  }
  if (record.type === 'MultiLineString' && Array.isArray(record.coordinates)) {
    return record.coordinates
      .filter(Array.isArray)
      .map((line) => line.filter(isCoordinate))
      .filter((line) => line.length >= 2)
  }
  return []
}

function pointToSegmentDistanceM(
  point: { lat: number; lon: number },
  a: Coordinate,
  b: Coordinate,
): number {
  const aLon = a[0]
  const aLat = a[1]
  const bLon = b[0]
  const bLat = b[1]
  const cosLat = Math.cos(((aLat + bLat) / 2) * Math.PI / 180)
  const mPerDegLat = 111_320
  const mPerDegLon = mPerDegLat * cosLat
  const bx = (bLon - aLon) * mPerDegLon
  const by = (bLat - aLat) * mPerDegLat
  const px = (point.lon - aLon) * mPerDegLon
  const py = (point.lat - aLat) * mPerDegLat
  const len2 = bx * bx + by * by
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2))
  const projectedLat = aLat + t * (bLat - aLat)
  const projectedLon = aLon + t * (bLon - aLon)
  return haversineM(point.lat, point.lon, projectedLat, projectedLon)
}

function lineDistanceToRouteM(
  line: Coordinate[],
  routePoints: ReadonlyArray<{ lat: number; lon: number }>,
): number {
  let minDistanceM = Infinity
  for (const point of routePoints) {
    for (let i = 0; i + 1 < line.length; i++) {
      const distanceM = pointToSegmentDistanceM(point, line[i], line[i + 1])
      if (distanceM < minDistanceM) minDistanceM = distanceM
    }
  }
  return minDistanceM
}

export function summarizeRouteRoadSurface(input: {
  routePoints: ReadonlyArray<{ lat: number; lon: number }>
  surfaceGeoJson: Record<string, unknown>
  maxDistanceM?: number
}): RouteSurfaceSummary {
  const maxDistanceM = input.maxDistanceM ?? ROAD_SURFACE_ROUTE_MATCH_MAX_DISTANCE_M
  const features = input.surfaceGeoJson['features']
  if (!Array.isArray(features) || input.routePoints.length < 2) {
    return {
      checked: false,
      hasGravel: false,
      gravelIssueCount: 0,
      gravelLengthM: null,
      nearestGravelDistanceM: null,
      gravelRoadNames: [],
      issues: [],
    }
  }

  const issues: RouteSurfaceIssue[] = []

  for (const feature of features) {
    if (typeof feature !== 'object' || feature === null) continue
    const featureRecord = feature as Record<string, unknown>
    const properties =
      typeof featureRecord['properties'] === 'object' && featureRecord['properties'] !== null
        ? (featureRecord['properties'] as Record<string, unknown>)
        : {}
    const surfaceType = classifyVegagerdinRoadSurface(
      properties['teskeidRoadSurfaceType'] ?? properties['GERD_SL'],
    )
    if (surfaceType !== 'gravel') continue

    const lines = flattenLineStrings(featureRecord['geometry'])
    if (lines.length === 0) continue
    const distanceM = Math.min(...lines.map((line) => lineDistanceToRouteM(line, input.routePoints)))
    if (!Number.isFinite(distanceM) || distanceM > maxDistanceM) continue

    issues.push({
      surfaceType,
      label: readStringProperty(properties, 'teskeidRoadSurfaceLabel') ?? roadSurfaceLabel(surfaceType),
      roadName: readStringProperty(properties, 'KAFLIVEGURHEITI'),
      roadNumber: readStringProperty(properties, 'NRVEGUR'),
      distanceM: Math.round(distanceM),
      lengthM: readFiniteNumber(properties, 'SLITLAGLENGD'),
    })
  }

  const gravelLengthValues = issues
    .map((issue) => issue.lengthM)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0)
  const gravelRoadNames = Array.from(
    new Set(
      issues
        .map((issue) => issue.roadName ?? (issue.roadNumber ? `Vegur ${issue.roadNumber}` : null))
        .filter((value): value is string => value !== null),
    ),
  ).slice(0, 5)

  return {
    checked: true,
    hasGravel: issues.length > 0,
    gravelIssueCount: issues.length,
    gravelLengthM: gravelLengthValues.length > 0
      ? Math.round(gravelLengthValues.reduce((sum, value) => sum + value, 0))
      : null,
    nearestGravelDistanceM: issues.length > 0
      ? Math.min(...issues.map((issue) => issue.distanceM))
      : null,
    gravelRoadNames,
    issues,
  }
}

export function buildRouteSurfaceBbox(
  routePoints: ReadonlyArray<{ lat: number; lon: number }>,
  paddingDeg = 0.08,
): [number, number, number, number] | null {
  const valid = routePoints.filter(
    (point) =>
      Number.isFinite(point.lat) &&
      Number.isFinite(point.lon) &&
      point.lat >= -90 &&
      point.lat <= 90 &&
      Math.abs(point.lon) <= 180,
  )
  if (valid.length === 0) return null

  const lats = valid.map((point) => point.lat)
  const lons = valid.map((point) => point.lon)
  return [
    Math.max(-180, Math.min(...lons) - paddingDeg),
    Math.max(-90, Math.min(...lats) - paddingDeg),
    Math.min(180, Math.max(...lons) + paddingDeg),
    Math.min(90, Math.max(...lats) + paddingDeg),
  ]
}
