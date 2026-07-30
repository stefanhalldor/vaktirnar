import type { LatLon } from './types'
import { geometryLengthM, haversineDistanceM } from './roadGraph'
import type {
  IcelandRoadClass,
  IcelandRoadDirection,
  IcelandRoadDirectionFieldState,
  IcelandRoadDirectionStatus,
  IcelandRoadGraphPoint,
  IcelandRoadGraphSegmentInput,
  IcelandRoadNetworkRole,
  IcelandRoadOfficialSegmentMetadata,
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

export const VEGAGERDIN_ROAD_LAYER_QUERY_URL =
  'https://vegasja.vegagerdin.is/arcgis/rest/services/data/vegakerfi/MapServer/6/query'
export const VEGAGERDIN_ACCESS_CONNECTOR_LAYER_QUERY_URL =
  'https://vegasja.vegagerdin.is/arcgis/rest/services/data/vegakerfi/MapServer/8/query'
export const VEGAGERDIN_SURFACE_LAYER_QUERY_URL =
  'https://vegasja.vegagerdin.is/arcgis/rest/services/data/slitlag/MapServer/0/query'

export const VEGAGERDIN_ROAD_FIELDS = [
  'OBJECTID',
  'IDKAFLI',
  'NRVEGUR',
  'NRKAFLI',
  'KAFLIHEITIUPPHAF',
  'KAFLIHEITIENDIR',
  'KAFLIVEGURHEITI',
  'KAFLILENGD',
  'KAFLISTODUPPHAF',
  'KAFLISTODENDIR',
  'VEGFLOKKUR',
  'VEGTEGUND',
  'DAGS_INOTKUN',
  'DAGS_URNOTKUN',
  'VEGHLUTI',
  'NRVEGHLUTI',
  'STEFNA',
  'IDVEGEIGANDI',
  'DAGSGRUNNUR',
] as const

export const VEGAGERDIN_SURFACE_FIELDS = [
  'OBJECTID',
  'IDKAFLI',
  'NRVEGUR',
  'NRKAFLI',
  'KAFLIVEGURHEITI',
  'SLITLAGLENGD',
  'UPPH_STOD',
  'ENDA_STOD',
  'VEGFLOKKUR',
  'VEGTEGUND',
  'GERD_SL',
  'DAGSGRUNNUR',
] as const

export interface VegagerdinArcGisSourceDescriptor {
  key: 'assessment_public_roads' | 'access_connector_roads' | 'road_surfaces'
  dataset: 'vegakerfi' | 'slitlag'
  layerId: number
  queryUrl: string
  outFields: readonly string[]
  query: {
    where: '1=1'
    outSR: 4326
    returnGeometry: true
    returnZ: boolean
    orderByFields: 'OBJECTID ASC'
    format: 'geojson'
    pageSize: 1000
  }
}

const CANONICAL_QUERY = {
  where: '1=1',
  outSR: 4326,
  returnGeometry: true,
  orderByFields: 'OBJECTID ASC',
  format: 'geojson',
  pageSize: 1000,
} as const

export const VEGAGERDIN_ASSESSMENT_ROAD_SOURCE: VegagerdinArcGisSourceDescriptor = {
  key: 'assessment_public_roads',
  dataset: 'vegakerfi',
  layerId: 6,
  queryUrl: VEGAGERDIN_ROAD_LAYER_QUERY_URL,
  outFields: VEGAGERDIN_ROAD_FIELDS,
  query: { ...CANONICAL_QUERY, returnZ: true },
}

/** Typed provenance only; the current production fetch boundary does not fetch layer 8. */
export const VEGAGERDIN_ACCESS_CONNECTOR_SOURCE: VegagerdinArcGisSourceDescriptor = {
  key: 'access_connector_roads',
  dataset: 'vegakerfi',
  layerId: 8,
  queryUrl: VEGAGERDIN_ACCESS_CONNECTOR_LAYER_QUERY_URL,
  outFields: VEGAGERDIN_ROAD_FIELDS,
  query: { ...CANONICAL_QUERY, returnZ: true },
}

export const VEGAGERDIN_SURFACE_SOURCE: VegagerdinArcGisSourceDescriptor = {
  key: 'road_surfaces',
  dataset: 'slitlag',
  layerId: 0,
  queryUrl: VEGAGERDIN_SURFACE_LAYER_QUERY_URL,
  outFields: VEGAGERDIN_SURFACE_FIELDS,
  query: { ...CANONICAL_QUERY, returnZ: false },
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
  geometry: readonly IcelandRoadGraphPoint[]
  lengthM: number
  surface: 'paved' | 'gravel'
}

const STATION_TOLERANCE_M = 10
const ASSESSMENT_ROAD_LAYER_ID = 6
const ACCESS_CONNECTOR_LAYER_ID = 8
const ASSESSMENT_OWNER_CODE = 0
const ASSESSMENT_ROAD_CLASS_CODES = new Set([1, 2, 3, 4, 8])
const ACCESS_ROAD_CLASS_BY_OWNER = new Map<number, ReadonlySet<number>>([
  [1, new Set([11])],
  [2, new Set([12])],
])
const ROUTABLE_ROAD_PART_CODES = new Set([1, 3, 4, 5, 6, 7])
const KNOWN_OWNER_CODES = new Set([0, 1, 2, 3])
const KNOWN_ROAD_CLASS_CODES = new Set([1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 14])
const KNOWN_ROAD_PART_CODES = new Set([1, 3, 4, 5, 6, 7, 9, 51, 53, 54, 55, 56, 57, 59])
const KNOWN_DIRECTION_CODES = new Set([-1, 1, 2])

export const VEGAGERDIN_ROAD_EXCLUSION_REASONS = [
  'invalid_identity',
  'invalid_geometry',
  'missing_official_metadata',
  'unknown_source_layer',
  'unknown_owner_code',
  'unauthorized_owner',
  'unknown_road_class_code',
  'ineligible_road_class',
  'unknown_road_part_code',
  'ineligible_road_part',
  'invalid_lifecycle',
  'inactive_lifecycle',
] as const

export type VegagerdinRoadExclusionReason = typeof VEGAGERDIN_ROAD_EXCLUSION_REASONS[number]

export interface VegagerdinRoadGraphNormalizationReport {
  sourceLayerId: number
  effectiveAtEpochMs: number
  inputRoadFeatureCount: number
  inputSurfaceFeatureCount: number
  acceptedFeatureCount: number
  acceptedAssessmentFeatureCount: number
  acceptedAccessConnectorFeatureCount: number
  acceptedSegmentCount: number
  excludedFeatureCount: number
  exclusionCounts: Record<VegagerdinRoadExclusionReason, number>
  invalidSurfaceFeatureCount: number
  surfaceFallbackSectionCount: number
  schemaDriftDetected: boolean
  domainDriftDetected: boolean
  nonDirectionDomainDriftDetected: boolean
  directionDomainDriftDetected: boolean
  unknownOwnerCodes: number[]
  unknownRoadClassCodes: number[]
  unknownRoadPartCodes: number[]
  unknownDirectionCodes: number[]
  unknownDirectionFeatureCount: number
  unknownMissingDirectionFeatureCount: number
  unknownDomainDriftDirectionFeatureCount: number
  invalidDirectionFieldFeatureCount: number
  duplicateSemanticIdentityFeatureCount: number
}

export interface NormalizeVegagerdinRoadGraphResult {
  segments: IcelandRoadGraphSegmentInput[]
  report: VegagerdinRoadGraphNormalizationReport
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function officialInteger(value: unknown): number | null {
  const number = finiteNumber(value)
  return number !== null && Number.isSafeInteger(number) ? number : null
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function officialString(value: unknown): string | undefined {
  if (typeof value === 'string') return nonEmptyString(value)
  const number = officialInteger(value)
  return number === null ? undefined : String(number)
}

function semanticToken(value: string | undefined): string {
  return encodeURIComponent((value ?? 'none').normalize('NFC'))
}

function compareCanonicalText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Stable semantic identity. OBJECTID remains provenance and is never the key. */
export function canonicalVegagerdinRoadSourceId(input: {
  sourceLayerId: 6 | 8
  sectionId: number
  roadPartCode: number
  roadPartNumber?: string
}): string {
  return [
    'vegagerdin',
    `layer-${input.sourceLayerId}`,
    `section-${input.sectionId}`,
    `road-part-${input.roadPartCode}`,
    `road-part-number-${semanticToken(input.roadPartNumber)}`,
  ].join(':')
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
  if (value === 2) return 'both'
  return 'unknown'
}

export interface VegagerdinDirectionEvidence {
  direction: IcelandRoadDirection
  directionStatus: IcelandRoadDirectionStatus
  directionCode: number | null
  directionFieldState: IcelandRoadDirectionFieldState
}

/** Preserves missing, explicit NULL and numeric domain drift as distinct facts. */
export function vegagerdinDirectionEvidence(
  properties: Record<string, unknown>,
): VegagerdinDirectionEvidence {
  if (!Object.prototype.hasOwnProperty.call(properties, 'STEFNA')) {
    return {
      direction: 'unknown',
      directionStatus: 'unknown_missing',
      directionCode: null,
      directionFieldState: 'missing',
    }
  }
  if (properties.STEFNA === null) {
    return {
      direction: 'unknown',
      directionStatus: 'unknown_missing',
      directionCode: null,
      directionFieldState: 'null',
    }
  }
  const directionCode = officialInteger(properties.STEFNA)
  if (directionCode === null) {
    return {
      direction: 'unknown',
      directionStatus: 'unknown_domain_drift',
      directionCode: null,
      directionFieldState: 'invalid',
    }
  }
  const direction = vegagerdinDirection(directionCode)
  const directionStatus: IcelandRoadDirectionStatus = direction === 'both'
    ? 'authoritative_both'
    : direction === 'forward'
      ? 'authoritative_forward'
      : direction === 'reverse'
        ? 'authoritative_reverse'
        : 'unknown_domain_drift'
  return { direction, directionStatus, directionCode, directionFieldState: 'integer' }
}

export function vegagerdinSurface(value: unknown): IcelandRoadSurface {
  if (value === 1) return 'paved'
  if (value === 0) return 'gravel'
  return 'unknown'
}

function toRoadGraphPoint(value: unknown): IcelandRoadGraphPoint | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const lon = finiteNumber(value[0])
  const lat = finiteNumber(value[1])
  if (lat === null || lon === null || lat < 62 || lat > 68 || lon < -26 || lon > -12) {
    return null
  }
  if (value.length < 3 || value[2] === null || value[2] === undefined) return { lat, lon }
  const elevationM = finiteNumber(value[2])
  if (elevationM === null || elevationM < -1_000 || elevationM > 10_000) return null
  return { lat, lon, elevationM }
}

function geometryParts(feature: ArcGisGeoJsonFeature): readonly (readonly IcelandRoadGraphPoint[])[] | null {
  if (!feature.geometry) return null
  const rawParts = feature.geometry.type === 'LineString'
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates
  if (!Array.isArray(rawParts) || rawParts.length === 0) return null

  const parts: IcelandRoadGraphPoint[][] = []
  for (const rawPart of rawParts) {
    if (!Array.isArray(rawPart) || rawPart.length < 2) return null
    const points: IcelandRoadGraphPoint[] = []
    for (const rawPoint of rawPart) {
      const point = toRoadGraphPoint(rawPoint)
      if (!point) return null
      points.push(point)
    }
    parts.push(points)
  }
  return parts
}

function readSurfaceSummaries(
  collection: ArcGisGeoJsonFeatureCollection,
): {
  summaries: ReadonlyMap<number, VegagerdinSurfaceSummary>
  invalidFeatureCount: number
} {
  const result = new Map<number, VegagerdinSurfaceSummary>()
  let invalidFeatureCount = 0
  for (const feature of collection.features) {
    const properties = feature.properties ?? {}
    const sectionId = officialInteger(properties.IDKAFLI)
    if (sectionId === null) {
      invalidFeatureCount += 1
      continue
    }
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
      invalidFeatureCount += 1
    } else {
      existing.intervals.push({ objectId, startStation, endStation, lengthM, surface })
    }
    result.set(sectionId, existing)
  }
  return { summaries: result, invalidFeatureCount }
}

function summarizedSurface(summary: VegagerdinSurfaceSummary | undefined): IcelandRoadSurface {
  if (!summary || summary.surfaces.size === 0) return 'unknown'
  if (summary.surfaces.size > 1) return 'mixed'
  return [...summary.surfaces][0]
}

function interpolatePoint(
  a: IcelandRoadGraphPoint,
  b: IcelandRoadGraphPoint,
  ratio: number,
): IcelandRoadGraphPoint {
  const point: IcelandRoadGraphPoint = {
    lat: a.lat + (b.lat - a.lat) * ratio,
    lon: a.lon + (b.lon - a.lon) * ratio,
  }
  if (a.elevationM !== undefined && b.elevationM !== undefined) {
    point.elevationM = a.elevationM + (b.elevationM - a.elevationM) * ratio
  }
  return point
}

function pointAtGeometryDistance(
  geometry: readonly IcelandRoadGraphPoint[],
  targetM: number,
): IcelandRoadGraphPoint {
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
  geometry: readonly IcelandRoadGraphPoint[],
  startFraction: number,
  endFraction: number,
): readonly IcelandRoadGraphPoint[] {
  const geometryDistanceM = geometryLengthM(geometry)
  if (geometryDistanceM <= 0) return []
  const startDistanceM = Math.max(0, Math.min(1, startFraction)) * geometryDistanceM
  const endDistanceM = Math.max(0, Math.min(1, endFraction)) * geometryDistanceM
  if (endDistanceM <= startDistanceM) return []

  const result: IcelandRoadGraphPoint[] = [pointAtGeometryDistance(geometry, startDistanceM)]
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
  geometry: readonly IcelandRoadGraphPoint[]
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
  /** 6 is the assessed public network; 8 is the unassessed access layer. */
  roadLayerId: number
  /** Timestamp represented by the candidate snapshot, never an implicit clock. */
  effectiveAtEpochMs: number
}

export type VegagerdinRoadFeatureClassification =
  | {
      classification: IcelandRoadNetworkRole
      direction: IcelandRoadDirection
      directionStatus: IcelandRoadDirectionStatus
      roadClass: IcelandRoadClass
      official: IcelandRoadOfficialSegmentMetadata
    }
  | {
      classification: 'excluded'
      reason: VegagerdinRoadExclusionReason
    }

function exclusionCounts(): Record<VegagerdinRoadExclusionReason, number> {
  return Object.fromEntries(
    VEGAGERDIN_ROAD_EXCLUSION_REASONS.map(reason => [reason, 0]),
  ) as Record<VegagerdinRoadExclusionReason, number>
}

function sourceMetadata(properties: Record<string, unknown>): {
  objectId: number
  sectionId: number
  ownerCode: number
  roadClassCode: number
  roadPartCode: number
  inUseFromEpochMs: number
  outOfUseAtEpochMs: number
} | null {
  const objectId = officialInteger(properties.OBJECTID)
  const sectionId = officialInteger(properties.IDKAFLI)
  const ownerCode = officialInteger(properties.IDVEGEIGANDI)
  const roadClassCode = officialInteger(properties.VEGFLOKKUR)
  const roadPartCode = officialInteger(properties.VEGHLUTI)
  const inUseFromEpochMs = finiteNumber(properties.DAGS_INOTKUN)
  const outOfUseAtEpochMs = finiteNumber(properties.DAGS_URNOTKUN)
  if (
    objectId === null
    || objectId < 0
    || sectionId === null
    || sectionId < 0
  ) return null
  if (
    ownerCode === null
    || roadClassCode === null
    || roadPartCode === null
    || inUseFromEpochMs === null
    || outOfUseAtEpochMs === null
  ) return null
  return {
    objectId,
    sectionId,
    ownerCode,
    roadClassCode,
    roadPartCode,
    inUseFromEpochMs,
    outOfUseAtEpochMs,
  }
}

export function classifyVegagerdinRoadFeature(input: {
  properties: Record<string, unknown>
  sourceLayerId: number
  effectiveAtEpochMs: number
}): VegagerdinRoadFeatureClassification {
  const { properties, sourceLayerId, effectiveAtEpochMs } = input
  if (!Number.isFinite(effectiveAtEpochMs) || effectiveAtEpochMs < 0) {
    return { classification: 'excluded', reason: 'invalid_lifecycle' }
  }
  if (sourceLayerId !== ASSESSMENT_ROAD_LAYER_ID && sourceLayerId !== ACCESS_CONNECTOR_LAYER_ID) {
    return { classification: 'excluded', reason: 'unknown_source_layer' }
  }
  const rawObjectId = officialInteger(properties.OBJECTID)
  const rawSectionId = officialInteger(properties.IDKAFLI)
  if (rawObjectId === null || rawObjectId < 0 || rawSectionId === null || rawSectionId < 0) {
    return { classification: 'excluded', reason: 'invalid_identity' }
  }
  const metadata = sourceMetadata(properties)
  if (!metadata) return { classification: 'excluded', reason: 'missing_official_metadata' }
  if (!KNOWN_OWNER_CODES.has(metadata.ownerCode)) {
    return { classification: 'excluded', reason: 'unknown_owner_code' }
  }
  if (!KNOWN_ROAD_CLASS_CODES.has(metadata.roadClassCode)) {
    return { classification: 'excluded', reason: 'unknown_road_class_code' }
  }
  if (!KNOWN_ROAD_PART_CODES.has(metadata.roadPartCode)) {
    return { classification: 'excluded', reason: 'unknown_road_part_code' }
  }
  if (
    metadata.inUseFromEpochMs < 0
    || metadata.outOfUseAtEpochMs <= metadata.inUseFromEpochMs
  ) return { classification: 'excluded', reason: 'invalid_lifecycle' }
  if (
    effectiveAtEpochMs < metadata.inUseFromEpochMs
    || effectiveAtEpochMs >= metadata.outOfUseAtEpochMs
  ) return { classification: 'excluded', reason: 'inactive_lifecycle' }
  if (!ROUTABLE_ROAD_PART_CODES.has(metadata.roadPartCode)) {
    return { classification: 'excluded', reason: 'ineligible_road_part' }
  }

  let classification: IcelandRoadNetworkRole
  if (sourceLayerId === ASSESSMENT_ROAD_LAYER_ID) {
    if (metadata.ownerCode !== ASSESSMENT_OWNER_CODE) {
      return { classification: 'excluded', reason: 'unauthorized_owner' }
    }
    if (!ASSESSMENT_ROAD_CLASS_CODES.has(metadata.roadClassCode)) {
      return { classification: 'excluded', reason: 'ineligible_road_class' }
    }
    classification = 'assessment_public'
  } else {
    const allowedClasses = ACCESS_ROAD_CLASS_BY_OWNER.get(metadata.ownerCode)
    if (!allowedClasses) return { classification: 'excluded', reason: 'unauthorized_owner' }
    if (!allowedClasses.has(metadata.roadClassCode)) {
      return { classification: 'excluded', reason: 'ineligible_road_class' }
    }
    classification = 'access_connector'
  }

  const directionEvidence = vegagerdinDirectionEvidence(properties)
  const sourceUpdatedAtEpochMs = finiteNumber(properties.DAGSGRUNNUR)
  const roadType = nonEmptyString(properties.VEGTEGUND)
  return {
    classification,
    direction: directionEvidence.direction,
    directionStatus: directionEvidence.directionStatus,
    roadClass: vegagerdinRoadClass(metadata.roadClassCode),
    official: {
      provider: 'vegagerdin',
      sourceLayerId,
      sourceObjectId: metadata.objectId,
      sectionId: metadata.sectionId,
      sectionNumber: officialString(properties.NRKAFLI),
      sectionStartLabel: nonEmptyString(properties.KAFLIHEITIUPPHAF),
      sectionEndLabel: nonEmptyString(properties.KAFLIHEITIENDIR),
      roadPartCode: metadata.roadPartCode,
      roadPartNumber: officialString(properties.NRVEGHLUTI),
      ownerCode: metadata.ownerCode,
      roadClassCode: metadata.roadClassCode,
      roadType,
      directionCode: directionEvidence.directionCode,
      directionFieldState: directionEvidence.directionFieldState,
      inUseFromEpochMs: metadata.inUseFromEpochMs,
      outOfUseAtEpochMs: metadata.outOfUseAtEpochMs,
      sourceUpdatedAtEpochMs: sourceUpdatedAtEpochMs ?? undefined,
    },
  }
}

function sortedNumbers(values: ReadonlySet<number>): number[] {
  return [...values].sort((a, b) => a - b)
}

function compareOfficialSegments(
  a: IcelandRoadGraphSegmentInput,
  b: IcelandRoadGraphSegmentInput,
): number {
  const sourceId = compareCanonicalText(a.sourceId, b.sourceId)
  if (sourceId !== 0) return sourceId
  return compareCanonicalText(a.id, b.id)
}

/**
 * Uses the canonical road layer for topology. Slitlag geometry is split by
 * surface but is not a connected routing network, so its authoritative station
 * intervals are projected onto the canonical road geometry. Invalid or
 * incomplete intervals retain the previous fail-closed mixed/unknown value.
 */
export function normalizeVegagerdinRoadGraphSegmentsWithReport({
  roads,
  surfaces,
  roadLayerId,
  effectiveAtEpochMs,
}: NormalizeVegagerdinRoadGraphInput): NormalizeVegagerdinRoadGraphResult {
  if (!Number.isFinite(effectiveAtEpochMs) || effectiveAtEpochMs < 0) {
    throw new Error('vegagerdin_road_graph_invalid_effective_time')
  }
  const { summaries: surfaceSummaries, invalidFeatureCount: invalidSurfaceFeatureCount } =
    readSurfaceSummaries(surfaces)
  const result: IcelandRoadGraphSegmentInput[] = []
  const counts = exclusionCounts()
  const unknownOwnerCodes = new Set<number>()
  const unknownRoadClassCodes = new Set<number>()
  const unknownRoadPartCodes = new Set<number>()
  const unknownDirectionCodes = new Set<number>()
  const fallbackSectionIds = new Set<number>()
  let acceptedFeatureCount = 0
  let acceptedAssessmentFeatureCount = 0
  let acceptedAccessConnectorFeatureCount = 0
  let unknownDirectionFeatureCount = 0
  let unknownMissingDirectionFeatureCount = 0
  let unknownDomainDriftDirectionFeatureCount = 0
  let invalidDirectionFieldFeatureCount = 0
  let duplicateSemanticIdentityFeatureCount = 0

  const orderedFeatures = [...roads.features].sort((a, b) => {
    const aId = officialInteger(a.properties?.OBJECTID) ?? Number.MAX_SAFE_INTEGER
    const bId = officialInteger(b.properties?.OBJECTID) ?? Number.MAX_SAFE_INTEGER
    return aId - bId
  })
  const sourceRowCounts = new Map<string, number>()
  const semanticIdentityCounts = new Map<string, number>()
  for (const feature of orderedFeatures) {
    const objectId = officialInteger(feature.properties?.OBJECTID)
    if (objectId === null) continue
    const key = `${roadLayerId}:${objectId}`
    sourceRowCounts.set(key, (sourceRowCounts.get(key) ?? 0) + 1)
    const sectionId = officialInteger(feature.properties?.IDKAFLI)
    const roadPartCode = officialInteger(feature.properties?.VEGHLUTI)
    if (
      (roadLayerId === ASSESSMENT_ROAD_LAYER_ID || roadLayerId === ACCESS_CONNECTOR_LAYER_ID)
      && sectionId !== null
      && roadPartCode !== null
    ) {
      const semanticKey = canonicalVegagerdinRoadSourceId({
        sourceLayerId: roadLayerId,
        sectionId,
        roadPartCode,
        roadPartNumber: officialString(feature.properties?.NRVEGHLUTI),
      })
      semanticIdentityCounts.set(semanticKey, (semanticIdentityCounts.get(semanticKey) ?? 0) + 1)
    }
  }

  for (const feature of orderedFeatures) {
    const properties = feature.properties ?? {}
    const ownerCode = officialInteger(properties.IDVEGEIGANDI)
    const roadClassCode = officialInteger(properties.VEGFLOKKUR)
    const roadPartCode = officialInteger(properties.VEGHLUTI)
    const directionEvidence = vegagerdinDirectionEvidence(properties)
    const directionCode = directionEvidence.directionCode
    if (ownerCode !== null && !KNOWN_OWNER_CODES.has(ownerCode)) unknownOwnerCodes.add(ownerCode)
    if (roadClassCode !== null && !KNOWN_ROAD_CLASS_CODES.has(roadClassCode)) unknownRoadClassCodes.add(roadClassCode)
    if (roadPartCode !== null && !KNOWN_ROAD_PART_CODES.has(roadPartCode)) unknownRoadPartCodes.add(roadPartCode)
    if (directionCode !== null && !KNOWN_DIRECTION_CODES.has(directionCode)) unknownDirectionCodes.add(directionCode)
    if (directionEvidence.directionFieldState === 'invalid') invalidDirectionFieldFeatureCount += 1

    const classification = classifyVegagerdinRoadFeature({
      properties,
      sourceLayerId: roadLayerId,
      effectiveAtEpochMs,
    })
    if (classification.classification === 'excluded') {
      counts[classification.reason] += 1
      continue
    }
    const sourceRowKey = `${roadLayerId}:${classification.official.sourceObjectId}`
    if ((sourceRowCounts.get(sourceRowKey) ?? 0) !== 1) {
      counts.invalid_identity += 1
      continue
    }
    const semanticSourceId = canonicalVegagerdinRoadSourceId({
      sourceLayerId: classification.official.sourceLayerId,
      sectionId: classification.official.sectionId,
      roadPartCode: classification.official.roadPartCode,
      roadPartNumber: classification.official.roadPartNumber,
    })
    if ((semanticIdentityCounts.get(semanticSourceId) ?? 0) !== 1) {
      counts.invalid_identity += 1
      duplicateSemanticIdentityFeatureCount += 1
      continue
    }
    const parts = geometryParts(feature)
    if (!parts) {
      counts.invalid_geometry += 1
      continue
    }

    const {
      official,
      roadClass,
      direction,
      directionStatus,
      classification: networkRole,
    } = classification
    if (direction === 'unknown') {
      unknownDirectionFeatureCount += 1
      if (directionStatus === 'unknown_missing') unknownMissingDirectionFeatureCount += 1
      else unknownDomainDriftDirectionFeatureCount += 1
    }
    const sectionId = official.sectionId
    const roadNumber = nonEmptyString(properties.NRVEGUR)
    const roadType = official.roadType
    const isFRoad = roadNumber?.toUpperCase().startsWith('F') === true ||
      roadType?.toUpperCase().startsWith('F') === true
    // Access connectors establish reachability only. They must not acquire an
    // assessed surface claim through a section-id join.
    const surfaceSummary = networkRole === 'assessment_public'
      ? surfaceSummaries.get(sectionId)
      : undefined
    const roadLengthM = finiteNumber(properties.KAFLILENGD)
    const linearSegments = networkRole === 'assessment_public' && parts.length === 1
      ? linearReferencedSurfaceSegments({
          geometry: parts[0],
          roadStartStation: finiteNumber(properties.KAFLISTODUPPHAF),
          roadEndStation: finiteNumber(properties.KAFLISTODENDIR),
          roadLengthM,
          summary: surfaceSummary,
        })
      : null
    if (networkRole === 'assessment_public' && !linearSegments) fallbackSectionIds.add(sectionId)

    parts.forEach((geometry, partIndex) => {
      const resolvedSegments = partIndex === 0 && linearSegments
        ? linearSegments
        : [{
            geometry,
            lengthM: parts.length === 1 ? roadLengthM ?? undefined : undefined,
            surface: networkRole === 'access_connector'
              ? 'unknown'
              : summarizedSurface(surfaceSummary),
          }]
      resolvedSegments.forEach((segment, surfaceIndex) => {
        result.push({
          id: resolvedSegments.length === 1
            ? `${semanticSourceId}:geometry-${partIndex}`
            : `${semanticSourceId}:geometry-${partIndex}:surface-${surfaceIndex}`,
          source: 'vegagerdin',
          sourceId: semanticSourceId,
          geometry: segment.geometry,
          lengthM: segment.lengthM,
          roadNumber,
          roadName: nonEmptyString(properties.KAFLIVEGURHEITI),
          roadClass,
          surface: segment.surface,
          direction,
          directionStatus,
          isFRoad,
          isMountainRoad: roadClass === 'highland_trunk' || isFRoad,
          networkRole,
          official,
        })
      })
    })
    acceptedFeatureCount += 1
    if (networkRole === 'assessment_public') acceptedAssessmentFeatureCount += 1
    else acceptedAccessConnectorFeatureCount += 1
  }

  result.sort(compareOfficialSegments)
  const excludedFeatureCount = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const schemaDriftReasons: readonly VegagerdinRoadExclusionReason[] = [
    'invalid_identity',
    'invalid_geometry',
    'missing_official_metadata',
    'invalid_lifecycle',
  ]
  const nonDirectionDomainDriftDetected = unknownOwnerCodes.size > 0
    || unknownRoadClassCodes.size > 0
    || unknownRoadPartCodes.size > 0
  const directionDomainDriftDetected = unknownDirectionCodes.size > 0
    || invalidDirectionFieldFeatureCount > 0
  const domainDriftDetected = nonDirectionDomainDriftDetected || directionDomainDriftDetected
  return {
    segments: result,
    report: {
      sourceLayerId: roadLayerId,
      effectiveAtEpochMs,
      inputRoadFeatureCount: roads.features.length,
      inputSurfaceFeatureCount: surfaces.features.length,
      acceptedFeatureCount,
      acceptedAssessmentFeatureCount,
      acceptedAccessConnectorFeatureCount,
      acceptedSegmentCount: result.length,
      excludedFeatureCount,
      exclusionCounts: counts,
      invalidSurfaceFeatureCount,
      surfaceFallbackSectionCount: fallbackSectionIds.size,
      schemaDriftDetected: invalidSurfaceFeatureCount > 0
        || invalidDirectionFieldFeatureCount > 0
        || schemaDriftReasons.some(reason => counts[reason] > 0),
      domainDriftDetected,
      nonDirectionDomainDriftDetected,
      directionDomainDriftDetected,
      unknownOwnerCodes: sortedNumbers(unknownOwnerCodes),
      unknownRoadClassCodes: sortedNumbers(unknownRoadClassCodes),
      unknownRoadPartCodes: sortedNumbers(unknownRoadPartCodes),
      unknownDirectionCodes: sortedNumbers(unknownDirectionCodes),
      unknownDirectionFeatureCount,
      unknownMissingDirectionFeatureCount,
      unknownDomainDriftDirectionFeatureCount,
      invalidDirectionFieldFeatureCount,
      duplicateSemanticIdentityFeatureCount,
    },
  }
}

/** Compatibility wrapper for callers that only need the accepted segments. */
export function normalizeVegagerdinRoadGraphSegments(
  input: NormalizeVegagerdinRoadGraphInput,
): IcelandRoadGraphSegmentInput[] {
  return normalizeVegagerdinRoadGraphSegmentsWithReport(input).segments
}
