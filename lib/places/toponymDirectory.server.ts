import { validateIcelandicCoords } from '@/lib/weather/coords'
import type { SelectedLocation } from './types'

const TOPONYM_WFS_URL = 'https://gis.lmi.is/geoserver/wfs'
const TOPONYM_WFS_LAYER = 'IS_50V:v_ornefni_allt'
const TOPONYM_FETCH_TIMEOUT_MS = 4_000
const TOPONYM_MAX_RESPONSE_BYTES = 1_048_576
const TOPONYM_FETCH_LIMIT = 16

type GeoJsonFeature = {
  geometry?: unknown
  bbox?: unknown
  properties?: unknown
}

type GeoJsonFeatureCollection = {
  features?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null
}

function cqlLikeLiteral(value: string): string {
  return value
    .replace(/[\\%_]/g, ' ')
    .replace(/'/g, "''")
    .replace(/\s+/g, ' ')
    .trim()
}

function flattenCoordinates(value: unknown, points: Array<readonly [number, number]>): void {
  if (!Array.isArray(value)) return
  if (
    value.length >= 2
    && typeof value[0] === 'number'
    && Number.isFinite(value[0])
    && typeof value[1] === 'number'
    && Number.isFinite(value[1])
  ) {
    points.push([value[0], value[1]])
    return
  }
  for (const child of value) flattenCoordinates(child, points)
}

function representativePoint(feature: GeoJsonFeature): { lat: number; lon: number } | null {
  if (Array.isArray(feature.bbox) && feature.bbox.length >= 4) {
    const [minLon, minLat, maxLon, maxLat] = feature.bbox
    if ([minLon, minLat, maxLon, maxLat].every(value => (
      typeof value === 'number' && Number.isFinite(value)
    ))) {
      const lat = (Number(minLat) + Number(maxLat)) / 2
      const lon = (Number(minLon) + Number(maxLon)) / 2
      if (validateIcelandicCoords(lat, lon)) return { lat, lon }
    }
  }

  if (!isRecord(feature.geometry)) return null
  const points: Array<readonly [number, number]> = []
  flattenCoordinates(feature.geometry.coordinates, points)
  if (points.length === 0) return null
  const bounds = points.reduce((result, [lon, lat]) => ({
    minLat: Math.min(result.minLat, lat),
    maxLat: Math.max(result.maxLat, lat),
    minLon: Math.min(result.minLon, lon),
    maxLon: Math.max(result.maxLon, lon),
  }), {
    minLat: Number.POSITIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
    minLon: Number.POSITIVE_INFINITY,
    maxLon: Number.NEGATIVE_INFINITY,
  })
  const lat = (bounds.minLat + bounds.maxLat) / 2
  const lon = (bounds.minLon + bounds.maxLon) / 2
  return validateIcelandicCoords(lat, lon) ? { lat, lon } : null
}

function capitalize(value: string): string {
  return value.length > 0 ? value[0].toLocaleUpperCase('is') + value.slice(1) : value
}

function toSelectedLocation(feature: unknown): SelectedLocation | null {
  if (!isRecord(feature)) return null
  const properties = isRecord(feature.properties) ? feature.properties : null
  if (!properties) return null
  const uuid = boundedString(properties.uuid, 160)
  const name = boundedString(properties.ornefni, 160)
  const featureType = boundedString(properties.nafnberi, 120)
    ?? boundedString(properties.ornefnaflokkur, 120)
  const point = representativePoint(feature)
  if (!uuid || !name || !point) return null

  const coordinateContext = `${point.lat.toFixed(3)}, ${point.lon.toFixed(3)}`
  return {
    id: `official:toponym:${uuid}`,
    source: 'official',
    sourceId: `toponym:${uuid}`,
    name,
    formattedAddress: featureType
      ? `${capitalize(featureType)} · ${coordinateContext}`
      : coordinateContext,
    placeType: 'point',
    lat: point.lat,
    lon: point.lon,
  }
}

function parseFeatureCollection(value: unknown, limit: number): SelectedLocation[] {
  if (!isRecord(value)) return []
  const features = (value as GeoJsonFeatureCollection).features
  if (!Array.isArray(features)) return []
  const seen = new Set<string>()
  const results: SelectedLocation[] = []
  for (const feature of features) {
    const place = toSelectedLocation(feature)
    if (!place || !place.sourceId || seen.has(place.sourceId)) continue
    seen.add(place.sourceId)
    results.push(place)
    if (results.length >= limit) break
  }
  return results
}

async function readBoundedText(response: Response): Promise<string | null> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > TOPONYM_MAX_RESPONSE_BYTES) return null
  const text = await response.text()
  return new TextEncoder().encode(text).byteLength <= TOPONYM_MAX_RESPONSE_BYTES ? text : null
}

/**
 * Bounded, fail-soft search against the official IS 50V geographical-name layer.
 * The returned coordinate is a representative point for routing; Teskeið's
 * existing endpoint resolver remains responsible for snapping it to a road.
 */
export async function searchOfficialToponyms(query: string, limit = 8): Promise<SelectedLocation[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2 || trimmed.length > 100) return []
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 10)
  const escapedQuery = cqlLikeLiteral(trimmed)
  if (escapedQuery.length < 2) return []
  const params = new URLSearchParams({
    service: 'WFS',
    version: '2.0.0',
    request: 'GetFeature',
    typeNames: TOPONYM_WFS_LAYER,
    outputFormat: 'application/json',
    srsName: 'EPSG:4326',
    count: String(TOPONYM_FETCH_LIMIT),
    propertyName: 'uuid,ornefni,nafnberi,ornefnaflokkur,birtingarkvardi,geom',
    sortBy: 'birtingarkvardi A,ornefni A',
    CQL_FILTER: `ornefni ILIKE '%${escapedQuery}%'`,
  })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TOPONYM_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(`${TOPONYM_WFS_URL}?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/geo+json, application/json' },
      signal: controller.signal,
      next: { revalidate: 60 * 60 },
    })
    if (!response.ok) return []
    const text = await readBoundedText(response)
    if (!text) return []
    const payload = JSON.parse(text) as unknown
    return parseFeatureCollection(payload, safeLimit)
  } catch {
    return []
  } finally {
    clearTimeout(timeout)
  }
}
