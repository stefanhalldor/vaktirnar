import 'server-only'

import type { IcelandRoadGraphSegmentInput } from './roadGraphTypes'
import {
  normalizeVegagerdinRoadGraphSegments,
  VEGAGERDIN_ASSESSMENT_ROAD_SOURCE,
  VEGAGERDIN_ROAD_LAYER_QUERY_URL,
  VEGAGERDIN_SURFACE_LAYER_QUERY_URL,
  VEGAGERDIN_SURFACE_SOURCE,
  type ArcGisGeoJsonFeatureCollection,
  type VegagerdinArcGisSourceDescriptor,
} from './vegagerdinRoadGraphSource'

export { VEGAGERDIN_ROAD_LAYER_QUERY_URL, VEGAGERDIN_SURFACE_LAYER_QUERY_URL }

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function buildQueryUrl(
  descriptor: VegagerdinArcGisSourceDescriptor,
  resultOffset: number,
  pageSize: number,
): string {
  const url = new URL(descriptor.queryUrl)
  url.searchParams.set('where', descriptor.query.where)
  url.searchParams.set('outFields', descriptor.outFields.join(','))
  url.searchParams.set('returnGeometry', String(descriptor.query.returnGeometry))
  url.searchParams.set('returnZ', String(descriptor.query.returnZ))
  url.searchParams.set('outSR', String(descriptor.query.outSR))
  url.searchParams.set('resultOffset', String(resultOffset))
  url.searchParams.set('resultRecordCount', String(pageSize))
  url.searchParams.set('orderByFields', descriptor.query.orderByFields)
  url.searchParams.set('f', descriptor.query.format)
  return url.toString()
}

async function fetchAllFeatures(
  descriptor: VegagerdinArcGisSourceDescriptor,
  fetchImpl: FetchLike,
  signal?: AbortSignal,
): Promise<ArcGisGeoJsonFeatureCollection> {
  const pageSize = descriptor.query.pageSize
  const features: ArcGisGeoJsonFeatureCollection['features'] = []
  let offset = 0

  for (;;) {
    const response = await fetchImpl(buildQueryUrl(descriptor, offset, pageSize), {
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
  /** Lets deterministic local candidate generation share its snapshot time. */
  effectiveAtEpochMs?: number
}

/**
 * Read-only discovery/import boundary. It performs no persistence. User-facing
 * consumers must never call this boundary. Only the protected snapshot refresh
 * worker may contact the live source; roadGraphRuntime reads the validated LKG.
 */
export async function fetchVegagerdinRoadGraphSegments(
  options: FetchVegagerdinRoadGraphSegmentsOptions = {},
): Promise<IcelandRoadGraphSegmentInput[]> {
  const fetchImpl = options.fetchImpl ?? fetch
  const effectiveAtEpochMs = options.effectiveAtEpochMs ?? Date.now()
  const [roads, surfaces] = await Promise.all([
    fetchAllFeatures(VEGAGERDIN_ASSESSMENT_ROAD_SOURCE, fetchImpl, options.signal),
    fetchAllFeatures(VEGAGERDIN_SURFACE_SOURCE, fetchImpl, options.signal),
  ])
  return normalizeVegagerdinRoadGraphSegments({
    roads,
    surfaces,
    roadLayerId: VEGAGERDIN_ASSESSMENT_ROAD_SOURCE.layerId,
    effectiveAtEpochMs,
  })
}
