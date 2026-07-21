export type RoadIntelligenceMapProxySourceId = 'vegakerfi'

export type RoadIntelligenceMapProxyError =
  | 'invalid_source'
  | 'invalid_bbox'

export type RoadIntelligenceMapProxyRequest =
  | {
      ok: true
      sourceId: RoadIntelligenceMapProxySourceId
      bbox: [number, number, number, number]
    }
  | {
      ok: false
      error: RoadIntelligenceMapProxyError
    }

const WEB_MERCATOR_LIMIT = 20037508.342789244

const VEGAGERDIN_EXPORT_ENDPOINTS: Record<RoadIntelligenceMapProxySourceId, string> = {
  vegakerfi: 'https://vegasja.vegagerdin.is/arcgis/rest/services/data/vegakerfi/MapServer/export',
}

function isMapProxySourceId(value: string | null): value is RoadIntelligenceMapProxySourceId {
  return value === 'vegakerfi'
}

function parseWebMercatorBbox(value: string | null): [number, number, number, number] | null {
  if (!value) return null

  const parts = value.split(',').map((part) => Number(part.trim()))
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null

  const [minX, minY, maxX, maxY] = parts
  if (minX >= maxX || minY >= maxY) return null
  if (parts.some((part) => Math.abs(part) > WEB_MERCATOR_LIMIT)) return null

  return [minX, minY, maxX, maxY]
}

export function parseRoadIntelligenceMapProxyRequest(
  searchParams: URLSearchParams,
): RoadIntelligenceMapProxyRequest {
  const sourceId = searchParams.get('source')
  if (!isMapProxySourceId(sourceId)) {
    return { ok: false, error: 'invalid_source' }
  }

  const bbox = parseWebMercatorBbox(searchParams.get('bbox'))
  if (!bbox) {
    return { ok: false, error: 'invalid_bbox' }
  }

  return { ok: true, sourceId, bbox }
}

export function buildVegagerdinMapExportUrl(
  sourceId: RoadIntelligenceMapProxySourceId,
  bbox: [number, number, number, number],
): string {
  const url = new URL(VEGAGERDIN_EXPORT_ENDPOINTS[sourceId])

  url.searchParams.set('bbox', bbox.join(','))
  url.searchParams.set('bboxSR', '3857')
  url.searchParams.set('imageSR', '3857')
  url.searchParams.set('size', '256,256')
  url.searchParams.set('dpi', '96')
  url.searchParams.set('format', 'png32')
  url.searchParams.set('transparent', 'true')
  url.searchParams.set('f', 'image')

  return url.toString()
}

export function isAllowedVegagerdinMapContentType(contentType: string | null): boolean {
  return contentType?.toLowerCase().startsWith('image/png') ?? false
}
