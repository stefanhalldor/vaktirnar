/**
 * LMÍ (Landmælingar Íslands) tile proxy helpers.
 *
 * Routes tile requests from MapLibre through the same-origin proxy.
 * LMÍ OWS WMS endpoint confirmed CORS-open (Access-Control-Allow-Origin: *)
 * on 2026-07-20, but GeoWebCache (WMTS) was not separately confirmed and
 * returned 502 for LMI_Island_einfalt in practice — so we use WMS bbox proxy
 * (same pattern as Vegagerðin map-proxy).
 *
 * LMÍ data is CC BY 4.0. Attribution must be shown in the map UI.
 * Proxy is auth + road-intelligence-v1 gated (prototype only).
 */

// --- WMS bbox proxy (active approach) ---

export type LmiWmsTileError = 'invalid_bbox'

export type LmiWmsTileRequest =
  | { ok: true; bbox: [number, number, number, number] }
  | { ok: false; error: LmiWmsTileError }

const WEB_MERCATOR_LIMIT = 20037508.342789244

// LMÍ OWS WMS endpoint. CORS confirmed open. Layer LMI_Island_einfalt
// validated to return image/png for EPSG:3857 GetMap.
const LMI_OWS_WMS_BASE =
  'https://gis.lmi.is/geoserver/ows' +
  '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
  '&FORMAT=image%2Fpng&TRANSPARENT=false' +
  '&LAYERS=LMI_Island_einfalt' +
  '&CRS=EPSG%3A3857&STYLES=' +
  '&WIDTH=256&HEIGHT=256'

export function parseLmiWmsTileRequest(searchParams: URLSearchParams): LmiWmsTileRequest {
  const raw = searchParams.get('bbox')
  if (!raw) return { ok: false, error: 'invalid_bbox' }

  const parts = raw.split(',').map((p) => Number(p.trim()))
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) {
    return { ok: false, error: 'invalid_bbox' }
  }

  const [minX, minY, maxX, maxY] = parts as [number, number, number, number]
  if (minX >= maxX || minY >= maxY) return { ok: false, error: 'invalid_bbox' }
  if (parts.some((p) => Math.abs(p) > WEB_MERCATOR_LIMIT)) {
    return { ok: false, error: 'invalid_bbox' }
  }

  return { ok: true, bbox: [minX, minY, maxX, maxY] }
}

export function buildLmiWmsUrl(bbox: [number, number, number, number]): string {
  return LMI_OWS_WMS_BASE + `&BBOX=${bbox.join(',')}`
}

export function isAllowedLmiTileContentType(contentType: string | null): boolean {
  return contentType?.toLowerCase().startsWith('image/png') ?? false
}

// --- WMTS / GWC helpers (kept for reference; not used by active route) ---
// GWC returned 502 for LMI_Island_einfalt on 2026-07-21 — layer may not be
// published in the tile cache. Retained so tile coordinates can be validated
// if GWC is revisited later.

export type LmiTileProxyError = 'invalid_z' | 'invalid_x' | 'invalid_y'

export type LmiTileProxyRequest =
  | { ok: true; z: number; x: number; y: number }
  | { ok: false; error: LmiTileProxyError }

const MAX_ZOOM = 22

function parseTileInt(value: string | null, field: string): number | LmiTileProxyError {
  if (value === null || value === '') return field as LmiTileProxyError
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) return field as LmiTileProxyError
  return n
}

export function parseLmiTileRequest(searchParams: URLSearchParams): LmiTileProxyRequest {
  const z = parseTileInt(searchParams.get('z'), 'invalid_z')
  if (typeof z === 'string') return { ok: false, error: z }

  if (z > MAX_ZOOM) return { ok: false, error: 'invalid_z' }

  const maxCoord = Math.pow(2, z) - 1

  const x = parseTileInt(searchParams.get('x'), 'invalid_x')
  if (typeof x === 'string') return { ok: false, error: x }
  if (x > maxCoord) return { ok: false, error: 'invalid_x' }

  const y = parseTileInt(searchParams.get('y'), 'invalid_y')
  if (typeof y === 'string') return { ok: false, error: y }
  if (y > maxCoord) return { ok: false, error: 'invalid_y' }

  return { ok: true, z, x, y }
}

export function buildLmiWmtsTileUrl(z: number, x: number, y: number): string {
  const base =
    'https://gis.lmi.is/geoserver/gwc/service/wmts' +
    '?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
    '&LAYER=LMI_Island_einfalt&STYLE=' +
    '&TILEMATRIXSET=EPSG%3A3857' +
    '&FORMAT=image%2Fpng'
  return (
    base +
    `&TILEMATRIX=EPSG%3A3857%3A${z}` +
    `&TILEROW=${y}` +
    `&TILECOL=${x}`
  )
}
