import type { LatLon } from './types'
import type {
  IcelandRoadClass,
  IcelandRoadDirection,
  IcelandRoadGraphSegmentInput,
  IcelandRoadSurface,
} from './roadGraphTypes'

export interface ArcGisGeoJsonFeature {
  type: 'Feature'
  id?: string | number
  geometry: {
    type: 'LineString' | 'MultiLineString'
    coordinates: unknown
  } | null
  properties: Record<string, unknown> | null
}

export interface ArcGisGeoJsonFeatureCollection {
  type: 'FeatureCollection'
  features: ArcGisGeoJsonFeature[]
  exceededTransferLimit?: boolean
}

interface VegagerdinRoadMetadata {
  sectionId: number
  roadNumber?: string
  roadName?: string
  roadClass: IcelandRoadClass
  roadType?: string
  direction: IcelandRoadDirection
}

interface VegagerdinSurfaceSummary {
  surfaces: Set<IcelandRoadSurface>
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function vegagerdinRoadClass(value: unknown): IcelandRoadClass {
  if (value === 1) return 'trunk'
  if (value === 8) return 'highland_trunk'
  if (value === 2) return 'connector'
  if (value === 3) return 'district'
  if (value === 4) return 'local'
  if (value === 7) return 'ferry'
  return 'other'
}

export function vegagerdinDirection(value: unknown): IcelandRoadDirection {
  if (value === 1) return 'forward'
  if (value === -1) return 'reverse'
  return 'both'
}

export function vegagerdinSurface(value: unknown): IcelandRoadSurface {
  if (value === 1) return 'paved'
  if (value === 0) return 'gravel'
  return 'unknown'
}

function toLatLon(value: unknown): LatLon | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const lon = finiteNumber(value[0])
  const lat = finiteNumber(value[1])
  if (lat === null || lon === null || lat < 62 || lat > 68 || lon < -27 || lon > -11) {
    return null
  }
  return { lat, lon }
}

function geometryParts(feature: ArcGisGeoJsonFeature): readonly (readonly LatLon[])[] {
  if (!feature.geometry) return []
  const rawParts = feature.geometry.type === 'LineString'
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates
  if (!Array.isArray(rawParts)) return []

  const parts: LatLon[][] = []
  for (const rawPart of rawParts) {
    if (!Array.isArray(rawPart)) continue
    const points = rawPart.map(toLatLon).filter((point): point is LatLon => point !== null)
    if (points.length >= 2) parts.push(points)
  }
  return parts
}

function readRoadMetadata(
  collection: ArcGisGeoJsonFeatureCollection,
): ReadonlyMap<number, VegagerdinRoadMetadata> {
  const result = new Map<number, VegagerdinRoadMetadata>()
  for (const feature of collection.features) {
    const properties = feature.properties ?? {}
    const sectionId = finiteNumber(properties.IDKAFLI)
    if (sectionId === null) continue
    result.set(sectionId, {
      sectionId,
      roadNumber: nonEmptyString(properties.NRVEGUR),
      roadName: nonEmptyString(properties.KAFLIVEGURHEITI),
      roadClass: vegagerdinRoadClass(properties.VEGFLOKKUR),
      roadType: nonEmptyString(properties.VEGTEGUND),
      direction: vegagerdinDirection(properties.STEFNA),
    })
  }
  return result
}

function readSurfaceSummaries(
  collection: ArcGisGeoJsonFeatureCollection,
): ReadonlyMap<number, VegagerdinSurfaceSummary> {
  const result = new Map<number, VegagerdinSurfaceSummary>()
  for (const feature of collection.features) {
    const properties = feature.properties ?? {}
    const sectionId = finiteNumber(properties.IDKAFLI)
    if (sectionId === null) continue
    const existing = result.get(sectionId) ?? { surfaces: new Set<IcelandRoadSurface>() }
    existing.surfaces.add(vegagerdinSurface(properties.GERD_SL))
    result.set(sectionId, existing)
  }
  return result
}

function summarizedSurface(summary: VegagerdinSurfaceSummary | undefined): IcelandRoadSurface {
  if (!summary || summary.surfaces.size === 0) return 'unknown'
  if (summary.surfaces.size > 1) return 'mixed'
  return [...summary.surfaces][0]
}

export interface NormalizeVegagerdinRoadGraphInput {
  roads: ArcGisGeoJsonFeatureCollection
  surfaces: ArcGisGeoJsonFeatureCollection
}

/**
 * Uses the canonical road layer for topology. Slitlag geometry is split by
 * surface but is not a connected routing network, so it is joined by IDKAFLI
 * as an attribute. A section with more than one surface becomes `mixed`, which
 * is safely excluded by require-paved profiles until linear referencing can
 * split it without damaging topology.
 */
export function normalizeVegagerdinRoadGraphSegments({
  roads,
  surfaces,
}: NormalizeVegagerdinRoadGraphInput): IcelandRoadGraphSegmentInput[] {
  const roadMetadata = readRoadMetadata(roads)
  const surfaceSummaries = readSurfaceSummaries(surfaces)
  const result: IcelandRoadGraphSegmentInput[] = []

  for (const feature of roads.features) {
    const properties = feature.properties ?? {}
    const objectId = finiteNumber(properties.OBJECTID)
    const sectionId = finiteNumber(properties.IDKAFLI)
    if (objectId === null || sectionId === null) continue
    const metadata = roadMetadata.get(sectionId)
    const roadNumber = metadata?.roadNumber ?? nonEmptyString(properties.NRVEGUR)
    const roadType = metadata?.roadType ?? nonEmptyString(properties.VEGTEGUND)
    const roadClass = metadata?.roadClass ?? vegagerdinRoadClass(properties.VEGFLOKKUR)
    const isFRoad = roadNumber?.toUpperCase().startsWith('F') === true ||
      roadType?.toUpperCase().startsWith('F') === true
    const parts = geometryParts(feature)

    parts.forEach((geometry, partIndex) => {
      result.push({
        id: `vegagerdin-road-${objectId}-${partIndex}`,
        source: 'vegagerdin',
        sourceId: String(objectId),
        geometry,
        lengthM: parts.length === 1 ? finiteNumber(properties.KAFLILENGD) ?? undefined : undefined,
        roadNumber,
        roadName: metadata?.roadName ?? nonEmptyString(properties.KAFLIVEGURHEITI),
        roadClass,
        surface: summarizedSurface(surfaceSummaries.get(sectionId)),
        direction: metadata?.direction ?? 'both',
        isFRoad,
        isMountainRoad: roadClass === 'highland_trunk' || isFRoad,
        // F-road does not by itself prove a current or permanent seasonal closure.
        // Live/seasonal state must come from a dedicated authoritative source.
        isSeasonal: false,
      })
    })
  }

  return result
}
