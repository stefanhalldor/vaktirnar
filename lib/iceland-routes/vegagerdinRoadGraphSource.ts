import type { LatLon } from './types'
import { geometryLengthM, haversineDistanceM } from './roadGraph'
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
  intervals: VegagerdinSurfaceInterval[]
  hasInvalidInterval: boolean
}

interface VegagerdinSurfaceInterval {
  objectId: number
  startStation: number
  endStation: number
  lengthM: number
  surface: 'paved' | 'gravel'
}

interface LinearReferencedSurfaceSegment {
  geometry: readonly LatLon[]
  lengthM: number
  surface: 'paved' | 'gravel'
}

const STATION_TOLERANCE_M = 10

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
    const existing = result.get(sectionId) ?? {
      surfaces: new Set<IcelandRoadSurface>(),
      intervals: [],
      hasInvalidInterval: false,
    }
    const surface = vegagerdinSurface(properties.GERD_SL)
    existing.surfaces.add(surface)
    const objectId = finiteNumber(properties.OBJECTID)
    const startStation = finiteNumber(properties.UPPH_STOD)
    const endStation = finiteNumber(properties.ENDA_STOD)
    const lengthM = finiteNumber(properties.SLITLAGLENGD)
    if (
      objectId === null
      || startStation === null
      || endStation === null
      || lengthM === null
      || lengthM <= 0
      || (surface !== 'paved' && surface !== 'gravel')
    ) {
      existing.hasInvalidInterval = true
    } else {
      existing.intervals.push({ objectId, startStation, endStation, lengthM, surface })
    }
    result.set(sectionId, existing)
  }
  return result
}

function summarizedSurface(summary: VegagerdinSurfaceSummary | undefined): IcelandRoadSurface {
  if (!summary || summary.surfaces.size === 0) return 'unknown'
  if (summary.surfaces.size > 1) return 'mixed'
  return [...summary.surfaces][0]
}

function interpolatePoint(a: LatLon, b: LatLon, ratio: number): LatLon {
  return {
    lat: a.lat + (b.lat - a.lat) * ratio,
    lon: a.lon + (b.lon - a.lon) * ratio,
  }
}

function pointAtGeometryDistance(
  geometry: readonly LatLon[],
  targetM: number,
): LatLon {
  if (targetM <= 0) return geometry[0]
  let traversedM = 0
  for (let index = 1; index < geometry.length; index += 1) {
    const segmentLengthM = haversineDistanceM(geometry[index - 1], geometry[index])
    if (traversedM + segmentLengthM >= targetM) {
      if (segmentLengthM <= 0) return geometry[index]
      return interpolatePoint(
        geometry[index - 1],
        geometry[index],
        (targetM - traversedM) / segmentLengthM,
      )
    }
    traversedM += segmentLengthM
  }
  return geometry[geometry.length - 1]
}

function samePoint(a: LatLon, b: LatLon): boolean {
  return a.lat === b.lat && a.lon === b.lon
}

function sliceGeometryByFraction(
  geometry: readonly LatLon[],
  startFraction: number,
  endFraction: number,
): readonly LatLon[] {
  const geometryDistanceM = geometryLengthM(geometry)
  if (geometryDistanceM <= 0) return []
  const startDistanceM = Math.max(0, Math.min(1, startFraction)) * geometryDistanceM
  const endDistanceM = Math.max(0, Math.min(1, endFraction)) * geometryDistanceM
  if (endDistanceM <= startDistanceM) return []

  const result: LatLon[] = [pointAtGeometryDistance(geometry, startDistanceM)]
  let traversedM = 0
  for (let index = 1; index < geometry.length; index += 1) {
    traversedM += haversineDistanceM(geometry[index - 1], geometry[index])
    if (traversedM > startDistanceM && traversedM < endDistanceM) {
      const point = geometry[index]
      if (!samePoint(result[result.length - 1], point)) result.push(point)
    }
  }
  const endPoint = pointAtGeometryDistance(geometry, endDistanceM)
  if (!samePoint(result[result.length - 1], endPoint)) result.push(endPoint)
  return result
}

/**
 * Converts Vegagerðin's authoritative station intervals into topology-safe
 * subsections of the canonical road geometry. Any incomplete or contradictory
 * input returns null so callers retain the previous fail-closed surface value.
 */
function linearReferencedSurfaceSegments(input: {
  geometry: readonly LatLon[]
  roadStartStation: number | null
  roadEndStation: number | null
  roadLengthM: number | null
  summary: VegagerdinSurfaceSummary | undefined
}): LinearReferencedSurfaceSegment[] | null {
  const { geometry, roadStartStation, roadEndStation, roadLengthM, summary } = input
  if (
    !summary
    || summary.hasInvalidInterval
    || summary.intervals.length === 0
    || roadStartStation === null
    || roadEndStation === null
    || roadLengthM === null
    || roadLengthM <= 0
  ) return null

  const stationSpanM = Math.abs(roadEndStation - roadStartStation)
  if (stationSpanM <= 0 || Math.abs(stationSpanM - roadLengthM) > STATION_TOLERANCE_M) return null
  const fractionTolerance = STATION_TOLERANCE_M / stationSpanM
  const intervals = summary.intervals.map(interval => {
    const intervalSpanM = Math.abs(interval.endStation - interval.startStation)
    if (
      intervalSpanM <= 0
      || Math.abs(intervalSpanM - interval.lengthM) > STATION_TOLERANCE_M
    ) return null
    const firstFraction = (interval.startStation - roadStartStation) / (roadEndStation - roadStartStation)
    const secondFraction = (interval.endStation - roadStartStation) / (roadEndStation - roadStartStation)
    const startFraction = Math.min(firstFraction, secondFraction)
    const endFraction = Math.max(firstFraction, secondFraction)
    if (startFraction < -fractionTolerance || endFraction > 1 + fractionTolerance) return null
    return {
      ...interval,
      startFraction: Math.max(0, startFraction),
      endFraction: Math.min(1, endFraction),
    }
  })
  if (intervals.some(interval => interval === null)) return null
  const ordered = intervals
    .filter((interval): interval is NonNullable<typeof interval> => interval !== null)
    .sort((a, b) => a.startFraction - b.startFraction || a.endFraction - b.endFraction || a.objectId - b.objectId)

  let cursor = 0
  const merged: Array<{
    startFraction: number
    endFraction: number
    lengthM: number
    surface: 'paved' | 'gravel'
  }> = []
  for (const interval of ordered) {
    if (Math.abs(interval.startFraction - cursor) > fractionTolerance) return null
    if (interval.endFraction <= cursor) return null
    const previous = merged[merged.length - 1]
    if (previous?.surface === interval.surface) {
      previous.endFraction = interval.endFraction
      previous.lengthM += interval.lengthM
    } else {
      merged.push({
        startFraction: interval.startFraction,
        endFraction: interval.endFraction,
        lengthM: interval.lengthM,
        surface: interval.surface,
      })
    }
    cursor = interval.endFraction
  }
  if (Math.abs(1 - cursor) > fractionTolerance) return null

  const segments = merged.map((interval, index) => ({
    geometry: index === 0 && merged.length === 1
      ? geometry
      : sliceGeometryByFraction(geometry, interval.startFraction, interval.endFraction),
    lengthM: merged.length === 1 ? roadLengthM : interval.lengthM,
    surface: interval.surface,
  }))
  return segments.every(segment => segment.geometry.length >= 2) ? segments : null
}

export interface NormalizeVegagerdinRoadGraphInput {
  roads: ArcGisGeoJsonFeatureCollection
  surfaces: ArcGisGeoJsonFeatureCollection
}

/**
 * Uses the canonical road layer for topology. Slitlag geometry is split by
 * surface but is not a connected routing network, so its authoritative station
 * intervals are projected onto the canonical road geometry. Invalid or
 * incomplete intervals retain the previous fail-closed mixed/unknown value.
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
    const surfaceSummary = surfaceSummaries.get(sectionId)
    const roadLengthM = finiteNumber(properties.KAFLILENGD)
    const linearSegments = parts.length === 1
      ? linearReferencedSurfaceSegments({
          geometry: parts[0],
          roadStartStation: finiteNumber(properties.KAFLISTODUPPHAF),
          roadEndStation: finiteNumber(properties.KAFLISTODENDIR),
          roadLengthM,
          summary: surfaceSummary,
        })
      : null

    parts.forEach((geometry, partIndex) => {
      const resolvedSegments = partIndex === 0 && linearSegments
        ? linearSegments
        : [{
            geometry,
            lengthM: parts.length === 1 ? roadLengthM ?? undefined : undefined,
            surface: summarizedSurface(surfaceSummary),
          }]
      resolvedSegments.forEach((segment, surfaceIndex) => {
        result.push({
          id: resolvedSegments.length === 1
            ? `vegagerdin-road-${objectId}-${partIndex}`
            : `vegagerdin-road-${objectId}-${partIndex}-surface-${surfaceIndex}`,
          source: 'vegagerdin',
          sourceId: String(objectId),
          geometry: segment.geometry,
          lengthM: segment.lengthM,
          roadNumber,
          roadName: metadata?.roadName ?? nonEmptyString(properties.KAFLIVEGURHEITI),
          roadClass,
          surface: segment.surface,
          direction: metadata?.direction ?? 'both',
          isFRoad,
          isMountainRoad: roadClass === 'highland_trunk' || isFRoad,
          // F-road does not by itself prove a current or permanent seasonal closure.
          // Live/seasonal state must come from a dedicated authoritative source.
          isSeasonal: false,
        })
      })
    })
  }

  return result
}
