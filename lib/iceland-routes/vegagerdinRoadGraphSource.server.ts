import 'server-only'

import type { IcelandRoadGraphSegmentInput } from './roadGraphTypes'
import {
  normalizeVegagerdinRoadGraphSegments,
  type ArcGisGeoJsonFeatureCollection,
} from './vegagerdinRoadGraphSource'

export const VEGAGERDIN_ROAD_LAYER_QUERY_URL =
  'https://vegasja.vegagerdin.is/arcgis/rest/services/data/vegakerfi/MapServer/6/query'
export const VEGAGERDIN_SURFACE_LAYER_QUERY_URL =
  'https://vegasja.vegagerdin.is/arcgis/rest/services/data/slitlag/MapServer/0/query'

const ROAD_FIELDS = [
  'OBJECTID',
  'IDKAFLI',
  'NRVEGUR',
  'NRKAFLI',
  'KAFLIVEGURHEITI',
  'KAFLILENGD',
  'VEGFLOKKUR',
  'VEGTEGUND',
  'STEFNA',
  'DAGSGRUNNUR',
] as const

const SURFACE_FIELDS = [
  'OBJECTID',
  'IDKAFLI',
  'NRVEGUR',
  'NRKAFLI',
  'KAFLIVEGURHEITI',
  'SLITLAGLENGD',
  'VEGFLOKKUR',
  'VEGTEGUND',
  'GERD_SL',
  'DAGSGRUNNUR',
] as const

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function buildQueryUrl(
  baseUrl: string,
  fields: readonly string[],
  resultOffset: number,
  pageSize: number,
): string {
  const url = new URL(baseUrl)
  url.searchParams.set('where', '1=1')
  url.searchParams.set('outFields', fields.join(','))
  url.searchParams.set('returnGeometry', 'true')
  url.searchParams.set('outSR', '4326')
  url.searchParams.set('resultOffset', String(resultOffset))
  url.searchParams.set('resultRecordCount', String(pageSize))
  url.searchParams.set('orderByFields', 'OBJECTID ASC')
  url.searchParams.set('f', 'geojson')
  return url.toString()
}

async function fetchAllFeatures(
  baseUrl: string,
  fields: readonly string[],
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): Promise<ArcGisGeoJsonFeatureCollection> {
  const pageSize = 1000
  const features: ArcGisGeoJsonFeatureCollection['features'] = []
  let offset = 0

  for (;;) {
    const response = await fetchImpl(buildQueryUrl(baseUrl, fields, offset, pageSize), {
      signal,
      headers: { accept: 'application/geo+json, application/json' },
    })
    if (!response.ok) throw new Error(`vegagerdin_road_graph_source_http_${response.status}`)
    const payload = await response.json() as ArcGisGeoJsonFeatureCollection
    if (payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
      throw new Error('vegagerdin_road_graph_source_invalid_payload')
    }
    features.push(...payload.features)
    if (!payload.exceededTransferLimit && payload.features.length < pageSize) break
    if (payload.features.length === 0) throw new Error('vegagerdin_road_graph_source_pagination_stalled')
    offset += payload.features.length
  }

  return { type: 'FeatureCollection', features }
}

export interface FetchVegagerdinRoadGraphSegmentsOptions {
  fetchImpl?: FetchLike
  signal?: AbortSignal
}

/**
 * Read-only discovery/import boundary. It performs no persistence and must not
 * be called in a user request path until cache/refresh policy is approved.
 */
export async function fetchVegagerdinRoadGraphSegments(
  options: FetchVegagerdinRoadGraphSegmentsOptions = {},
): Promise<IcelandRoadGraphSegmentInput[]> {
  const fetchImpl = options.fetchImpl ?? fetch
  const [roads, surfaces] = await Promise.all([
    fetchAllFeatures(VEGAGERDIN_ROAD_LAYER_QUERY_URL, ROAD_FIELDS, fetchImpl, options.signal),
    fetchAllFeatures(VEGAGERDIN_SURFACE_LAYER_QUERY_URL, SURFACE_FIELDS, fetchImpl, options.signal),
  ])
  return normalizeVegagerdinRoadGraphSegments({ roads, surfaces })
}

