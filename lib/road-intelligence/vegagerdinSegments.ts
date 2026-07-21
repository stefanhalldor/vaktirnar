/**
 * Vegagerðin faerd FeatureServer — road segment query helpers.
 *
 * The `faerd` (condition) ArcGIS FeatureServer provides road segment geometries
 * with current road-condition attributes. CORS blocked for browser — use the
 * same-origin `/api/teskeid/road-intelligence/road-segments` proxy route.
 *
 * Endpoint confirmed: https://vegasja.vegagerdin.is/arcgis/rest/services/data/faerd/FeatureServer
 * Layer 14 ("Færð - 2") is the broad overview road-condition line layer.
 *
 * Attribution: Vegagerðin — CC BY-compatible open data.
 */

export type SegmentsBboxError = 'invalid_bbox' | 'bbox_out_of_range'
export type VegagerdinRoadStatus =
  | 'clear'
  | 'caution'
  | 'difficult'
  | 'danger'
  | 'closed'
  | 'unknown'

export type SegmentsBboxRequest =
  | { ok: true; bbox: [number, number, number, number] } // [west, south, east, north] WGS84
  | { ok: false; error: SegmentsBboxError }

// Hard limit on features returned per request to avoid huge payloads.
// Iceland at zoom 6 has thousands of road segments; 500 is a reasonable M2B-1 proof sample.
export const SEGMENTS_MAX_FEATURES = 500

export const ROAD_SEGMENT_FALLBACK_COLOR = '#64748B'

export const ROAD_SEGMENT_STATUS_COLORS: Record<VegagerdinRoadStatus, string> = {
  clear: '#00DF30',
  caution: '#FFDF00',
  difficult: '#FFA500',
  danger: '#EF4444',
  closed: '#111827',
  unknown: ROAD_SEGMENT_FALLBACK_COLOR,
}

const ROAD_SEGMENT_STATUS_LABELS: Record<VegagerdinRoadStatus, string> = {
  clear: 'Greiðfært',
  caution: 'Varasamt',
  difficult: 'Erfitt færi',
  danger: 'Hættulegt',
  closed: 'Lokað',
  unknown: 'Óþekkt færð',
}

export const FAERD_FEATURE_LAYER_ID = 14

const FAERD_SEGMENT_OUT_FIELDS = [
  'OBJECTID',
  'NAFN_LEIDAR',
  'NRVEGUR',
  'NRKAFLI',
  'AST1_LITUR',
  'AST1_NAFN',
  'AST1_FAERD',
  'AST1_SKILTI',
  'TIMIKEYRSLA',
] as const

// faerd FeatureServer road-condition line layer. Append /query to run ArcGIS REST feature queries.
const FAERD_QUERY_URL =
  `https://vegasja.vegagerdin.is/arcgis/rest/services/data/faerd/FeatureServer/${FAERD_FEATURE_LAYER_ID}/query`

// Generous Iceland envelope (includes surrounding ocean for map viewports at zoom 5–8).
// Requests that do not intersect this envelope are rejected as out-of-range.
const ICELAND_ENV = { west: -27, east: -10, south: 61, north: 69 } as const

// Maximum bbox span — prevents world-scale queries from leaking through.
// At zoom 6 Iceland fills ~15° lon × ~6° lat; 30° × 15° allows very zoomed-out viewports.
const MAX_LON_SPAN = 30
const MAX_LAT_SPAN = 15

export function parseSegmentsBboxRequest(searchParams: URLSearchParams): SegmentsBboxRequest {
  const raw = searchParams.get('bbox')
  if (!raw) return { ok: false, error: 'invalid_bbox' }

  const parts = raw.split(',').map((p) => Number(p.trim()))
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) {
    return { ok: false, error: 'invalid_bbox' }
  }

  const [west, south, east, north] = parts as [number, number, number, number]
  if (west >= east || south >= north) return { ok: false, error: 'invalid_bbox' }
  if (Math.abs(west) > 180 || Math.abs(east) > 180) return { ok: false, error: 'invalid_bbox' }
  if (south < -90 || north > 90) return { ok: false, error: 'invalid_bbox' }

  // Reject bboxes that do not intersect Iceland or exceed the max viewport span.
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

export function buildVegagerdinSegmentsQueryUrl(
  bbox: [number, number, number, number],
): string {
  const [west, south, east, north] = bbox
  const url = new URL(FAERD_QUERY_URL)

  url.searchParams.set('where', '1=1')
  url.searchParams.set('geometryType', 'esriGeometryEnvelope')
  url.searchParams.set('geometry', `${west},${south},${east},${north}`)
  url.searchParams.set('inSR', '4326')
  url.searchParams.set('spatialRel', 'esriSpatialRelIntersects')
  url.searchParams.set('outFields', FAERD_SEGMENT_OUT_FIELDS.join(','))
  url.searchParams.set('returnGeometry', 'true')
  url.searchParams.set('outSR', '4326')
  url.searchParams.set('resultRecordCount', String(SEGMENTS_MAX_FEATURES))
  url.searchParams.set('f', 'geojson')

  return url.toString()
}

export function isAllowedSegmentsContentType(contentType: string | null): boolean {
  const ct = contentType?.toLowerCase() ?? ''
  return ct.startsWith('application/json') || ct.startsWith('application/geo+json')
}

function readStringProperty(
  properties: Record<string, unknown>,
  key: string,
): string | null {
  const value = properties[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function normalizeRoadConditionColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed.toUpperCase() : null
}

export function classifyVegagerdinRoadStatus(
  properties: Record<string, unknown>,
): VegagerdinRoadStatus {
  const color = normalizeRoadConditionColor(properties['AST1_LITUR'])
  const label = [
    readStringProperty(properties, 'AST1_NAFN'),
    readStringProperty(properties, 'AST1_FAERD'),
    readStringProperty(properties, 'AST1_SKILTI'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('is-IS')

  if (label.includes('loka') || label.includes('ófært')) return 'closed'
  if (label.includes('flughált') || label.includes('óveður')) return 'danger'
  if (label.includes('þungfært') || label.includes('snjó') || label.includes('hált')) {
    return 'difficult'
  }
  if (label.includes('hálkublett') || label.includes('varas')) return 'caution'
  if (label.includes('greiðfært')) return 'clear'

  switch (color) {
    case '#00DF30':
      return 'clear'
    case '#FFDF00':
      return 'caution'
    case '#FFA500':
    case '#FF6600':
      return 'difficult'
    case '#0000FF':
    case '#EF4444':
    case '#FF0000':
      return 'danger'
    case '#000000':
    case '#111827':
      return 'closed'
    default:
      return 'unknown'
  }
}

export function normalizeVegagerdinRoadSegmentGeoJson(
  input: unknown,
): { ok: true; geojson: Record<string, unknown>; featureCount: number } | { ok: false } {
  if (typeof input !== 'object' || input === null) return { ok: false }

  const body = input as Record<string, unknown>
  if (body['type'] !== 'FeatureCollection' || !Array.isArray(body['features'])) {
    return { ok: false }
  }

  const features = (body['features'] as unknown[]).slice(0, SEGMENTS_MAX_FEATURES)
  const normalizedFeatures = features.map((feature) => {
    if (typeof feature !== 'object' || feature === null) return feature

    const featureRecord = feature as Record<string, unknown>
    const rawProperties = featureRecord['properties']
    const properties =
      typeof rawProperties === 'object' && rawProperties !== null
        ? (rawProperties as Record<string, unknown>)
        : {}

    const status = classifyVegagerdinRoadStatus(properties)
    const providerColor = normalizeRoadConditionColor(properties['AST1_LITUR'])
    const providerLabel = readStringProperty(properties, 'AST1_NAFN')

    return {
      ...featureRecord,
      properties: {
        ...properties,
        teskeidRoadStatus: status,
        teskeidRoadStatusLabel: providerLabel ?? ROAD_SEGMENT_STATUS_LABELS[status],
        teskeidRoadStatusColor: providerColor ?? ROAD_SEGMENT_STATUS_COLORS[status],
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
