import {
  canonicalIcelandRoadSourceProvenanceKey,
  directionStatusFromOfficialMetadata,
  isIcelandRoadDirectionEvidenceArtifactV1,
  isIcelandRoadDirectionInferenceAttestationV1,
  isIcelandRoadDirectionInferencePolicyV1,
  validateIcelandRoadDirectionInferenceSet,
} from './roadGraphDirectionInference'
import type {
  IcelandRoadDirectionInferenceAttestationV1,
  IcelandRoadDirectionEvidenceArtifactV1,
  IcelandRoadDirectionInferencePolicyV1,
  IcelandRoadGraphDiagnostics,
  IcelandRoadGraphSegmentInput,
} from './roadGraphTypes'
import {
  canonicalVegagerdinRoadSourceId,
  classifyVegagerdinRoadFeature,
  VEGAGERDIN_ACCESS_CONNECTOR_SOURCE,
  VEGAGERDIN_ASSESSMENT_ROAD_SOURCE,
  VEGAGERDIN_SURFACE_SOURCE,
  type VegagerdinArcGisSourceDescriptor,
} from './vegagerdinRoadGraphSource'

/** Active production schema remains v1 until the later rollout gate. */
export const ROAD_GRAPH_SNAPSHOT_SCHEMA_VERSION = 1
export const ROAD_GRAPH_SNAPSHOT_SCHEMA_VERSION_V2 = 2
export const ROAD_GRAPH_NODE_SNAP_TOLERANCE_M = 20
export const ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_RECIPROCAL_V1 =
  'teskeid-road-runtime-v1:topology-reciprocal-section-endpoints-v1:bidirectional-routing-v1'
export const ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2 =
  'teskeid-road-runtime-v1:topology-source-attested-exact-interior-vertex-v2:bidirectional-routing-v1'
export const ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_ENDPOINT_JUNCTION_V3 =
  'teskeid-road-runtime-v1:topology-attested-endpoint-junctions-v3:bidirectional-routing-v1'
export const ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4 =
  'teskeid-road-runtime-v1:topology-source-attested-hub-endpoint-gaps-v4:bidirectional-routing-v1'
/** Current reader/materializer generation; refresh rollout is gated separately. */
export const ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT =
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4

export type RoadGraphRuntimeBuildPolicyFingerprint =
  | typeof ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_RECIPROCAL_V1
  | typeof ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2
  | typeof ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_ENDPOINT_JUNCTION_V3
  | typeof ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4

/**
 * Hash-bound materialisation contract for the topology-enhanced schema-v1
 * bridge. Old runtimes ignore this optional top-level field and continue to
 * verify the legacy diagnostics stored in the snapshot row. New runtimes use
 * the exact enhanced diagnostics below and fail closed on contract drift.
 */
export interface RoadGraphRuntimeBuildContractV1 {
  schemaVersion: 1
  policyFingerprint: RoadGraphRuntimeBuildPolicyFingerprint
  diagnostics: IcelandRoadGraphDiagnostics
  goldenRoutePassCount: number
  goldenRouteTotalCount: number
  topologyReceiptIds: string[]
}

export interface RoadGraphSnapshotPayloadV1 {
  schemaVersion: 1
  source: 'vegagerdin'
  sourceFetchedAtIso: string
  nodeSnapToleranceM: number
  runtimeBuildContract?: RoadGraphRuntimeBuildContractV1
  segments: IcelandRoadGraphSegmentInput[]
}

export interface RoadGraphSnapshotSourceArtifactV2 {
  descriptor: VegagerdinArcGisSourceDescriptor
  featureCount: number
  /** SHA-256 of the canonical raw FeatureCollection payload. */
  contentSha256: string
}

export interface RoadGraphSnapshotPayloadV2 {
  schemaVersion: 2
  source: 'vegagerdin'
  /** Deterministic official-source effective time, never the fetch wall clock. */
  sourceEffectiveAtIso: string
  nodeSnapToleranceM: number
  sourceArtifacts: RoadGraphSnapshotSourceArtifactV2[]
  /** Structural-only until trusted byte ingestion and activation-time checks exist. */
  directionInferencePolicy: IcelandRoadDirectionInferencePolicyV1 | null
  directionEvidenceArtifacts: IcelandRoadDirectionEvidenceArtifactV1[]
  /** Empty until an independently evidenced inference artifact is approved. */
  directionAttestations: IcelandRoadDirectionInferenceAttestationV1[]
  segments: IcelandRoadGraphSegmentInput[]
}

export type RoadGraphSnapshotPayload = RoadGraphSnapshotPayloadV1 | RoadGraphSnapshotPayloadV2

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed)
  return Object.keys(value).every(key => allowedKeys.has(key))
}

function optionalString(value: unknown, maxLength: number): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length > 0 && value.length <= maxLength)
}

function finiteInteger(value: unknown, min = Number.MIN_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min
}

function canonicalIso(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

function parseableTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function validPoint(value: unknown, allowElevation: boolean): boolean {
  if (!isRecord(value)) return false
  if (allowElevation && !hasOnlyKeys(value, ['lat', 'lon', 'elevationM'])) return false
  if (!allowElevation && !hasOnlyKeys(value, ['lat', 'lon'])) return false
  if (typeof value.lat !== 'number' || !Number.isFinite(value.lat) || value.lat < 62 || value.lat > 68) return false
  if (typeof value.lon !== 'number' || !Number.isFinite(value.lon) || value.lon < -26 || value.lon > -12) return false
  return value.elevationM === undefined || (
    allowElevation
    && typeof value.elevationM === 'number'
    && Number.isFinite(value.elevationM)
    && value.elevationM >= -1_000
    && value.elevationM <= 10_000
  )
}

function validCommonSegment(value: Record<string, unknown>, allowUnknownDirection: boolean): boolean {
  if (typeof value.id !== 'string' || value.id.length === 0 || value.id.length > 300) return false
  if (value.source !== 'vegagerdin') return false
  if (typeof value.sourceId !== 'string' || value.sourceId.length === 0 || value.sourceId.length > 300) return false
  if (!['trunk', 'highland_trunk', 'connector', 'district', 'local', 'ferry', 'other'].includes(String(value.roadClass))) return false
  if (!['paved', 'gravel', 'mixed', 'unknown'].includes(String(value.surface))) return false
  const directions = allowUnknownDirection
    ? ['both', 'forward', 'reverse', 'unknown']
    : ['both', 'forward', 'reverse']
  if (!directions.includes(String(value.direction))) return false
  if (!optionalString(value.roadNumber, 80) || !optionalString(value.roadName, 300)) return false
  if (value.lengthM !== undefined && (typeof value.lengthM !== 'number' || !Number.isFinite(value.lengthM) || value.lengthM <= 0)) return false
  if (value.speedKmh !== undefined && (typeof value.speedKmh !== 'number' || !Number.isFinite(value.speedKmh) || value.speedKmh <= 0 || value.speedKmh > 200)) return false
  if (value.speedSource !== undefined && !['official', 'derived'].includes(String(value.speedSource))) return false
  for (const key of ['isFRoad', 'isMountainRoad', 'isSeasonal'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') return false
  }
  if (!Array.isArray(value.geometry) || value.geometry.length < 2 || value.geometry.length > 100_000) return false
  return true
}

function validSegmentV1(value: unknown): value is IcelandRoadGraphSegmentInput {
  if (!isRecord(value) || !validCommonSegment(value, false)) return false
  // Preserve the exact v1 compatibility boundary: extra point metadata was
  // ignored as long as the required coordinates were valid.
  return (value.geometry as unknown[]).every(point => (
    isRecord(point)
    && typeof point.lat === 'number'
    && Number.isFinite(point.lat)
    && point.lat >= 62
    && point.lat <= 68
    && typeof point.lon === 'number'
    && Number.isFinite(point.lon)
    && point.lon >= -26
    && point.lon <= -12
  ))
}

function validOfficialMetadata(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (!hasOnlyKeys(value, [
    'provider', 'sourceLayerId', 'sourceObjectId', 'sectionId', 'sectionNumber',
    'sectionStartLabel', 'sectionEndLabel', 'roadPartCode', 'roadPartNumber',
    'ownerCode', 'roadClassCode', 'roadType', 'directionCode', 'directionFieldState',
    'inUseFromEpochMs', 'outOfUseAtEpochMs', 'sourceUpdatedAtEpochMs',
  ])) return false
  if (value.provider !== 'vegagerdin') return false
  if (value.sourceLayerId !== 6 && value.sourceLayerId !== 8) return false
  if (!finiteInteger(value.sourceObjectId, 0) || !finiteInteger(value.sectionId, 0)) return false
  if (!optionalString(value.sectionNumber, 80)) return false
  if (!optionalString(value.sectionStartLabel, 300) || !optionalString(value.sectionEndLabel, 300)) return false
  if (!finiteInteger(value.roadPartCode) || !optionalString(value.roadPartNumber, 80)) return false
  if (!finiteInteger(value.ownerCode) || !finiteInteger(value.roadClassCode)) return false
  if (!optionalString(value.roadType, 120)) return false
  if (value.directionCode !== null && !finiteInteger(value.directionCode)) return false
  if (!['missing', 'null', 'integer', 'invalid'].includes(String(value.directionFieldState))) return false
  if (typeof value.inUseFromEpochMs !== 'number' || !Number.isFinite(value.inUseFromEpochMs) || value.inUseFromEpochMs < 0) return false
  if (typeof value.outOfUseAtEpochMs !== 'number' || !Number.isFinite(value.outOfUseAtEpochMs) || value.outOfUseAtEpochMs <= value.inUseFromEpochMs) return false
  return value.sourceUpdatedAtEpochMs === undefined || (
    typeof value.sourceUpdatedAtEpochMs === 'number'
    && Number.isFinite(value.sourceUpdatedAtEpochMs)
    && value.sourceUpdatedAtEpochMs >= 0
  )
}

const V2_SEGMENT_KEYS = [
  'id', 'source', 'sourceId', 'geometry', 'lengthM', 'roadNumber', 'roadName',
  'roadClass', 'surface', 'direction', 'speedKmh', 'speedSource', 'isFRoad',
  'isMountainRoad', 'isSeasonal', 'networkRole', 'official', 'directionStatus',
] as const

function validSegmentV2(value: unknown, effectiveAtEpochMs: number): value is IcelandRoadGraphSegmentInput {
  if (!isRecord(value) || !hasOnlyKeys(value, V2_SEGMENT_KEYS) || !validCommonSegment(value, true)) return false
  if (value.networkRole !== 'assessment_public' && value.networkRole !== 'access_connector') return false
  if (!validOfficialMetadata(value.official)) return false
  if (![
    'authoritative_both', 'authoritative_forward', 'authoritative_reverse',
    'unknown_missing', 'unknown_domain_drift',
  ].includes(String(value.directionStatus))) return false
  if (!(value.geometry as unknown[]).every(point => validPoint(point, true))) return false
  const official = value.official as Record<string, unknown>
  const semanticSourceId = canonicalVegagerdinRoadSourceId({
    sourceLayerId: official.sourceLayerId as 6 | 8,
    sectionId: official.sectionId as number,
    roadPartCode: official.roadPartCode as number,
    roadPartNumber: official.roadPartNumber as string | undefined,
  })
  if (value.sourceId !== semanticSourceId) return false
  if (!String(value.id).startsWith(`${semanticSourceId}:geometry-`)) return false
  const directionStatus = directionStatusFromOfficialMetadata(
    official as unknown as NonNullable<IcelandRoadGraphSegmentInput['official']>,
  )
  if (!directionStatus || directionStatus !== value.directionStatus) return false
  const rawDirectionProperties = official.directionFieldState === 'missing'
    ? {}
    : official.directionFieldState === 'null'
      ? { STEFNA: null }
      : official.directionFieldState === 'invalid'
        ? { STEFNA: '__invalid_direction__' }
        : { STEFNA: official.directionCode }
  const classification = classifyVegagerdinRoadFeature({
    sourceLayerId: official.sourceLayerId as number,
    effectiveAtEpochMs,
    properties: {
      OBJECTID: official.sourceObjectId,
      IDKAFLI: official.sectionId,
      VEGFLOKKUR: official.roadClassCode,
      VEGTEGUND: official.roadType,
      DAGS_INOTKUN: official.inUseFromEpochMs,
      DAGS_URNOTKUN: official.outOfUseAtEpochMs,
      VEGHLUTI: official.roadPartCode,
      NRVEGHLUTI: official.roadPartNumber,
      ...rawDirectionProperties,
      IDVEGEIGANDI: official.ownerCode,
    },
  })
  return classification.classification !== 'excluded'
    && classification.classification === value.networkRole
    && classification.direction === value.direction
    && classification.directionStatus === value.directionStatus
    && classification.roadClass === value.roadClass
}

function validRuntimeDiagnostics(value: unknown): value is IcelandRoadGraphDiagnostics {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'nodeCount', 'edgeCount', 'segmentCount', 'weakComponentCount',
    'largestWeakComponentNodeCount', 'isolatedNodeCount', 'surfaceEdgeCounts',
    'derivedSpeedEdgeCount', 'topologyConnectorEdgeCount',
  ])) return false
  if (
    !finiteInteger(value.nodeCount, 1)
    || !finiteInteger(value.edgeCount, 1)
    || !finiteInteger(value.segmentCount, 1)
    || !finiteInteger(value.weakComponentCount, 1)
    || !finiteInteger(value.largestWeakComponentNodeCount, 1)
    || value.largestWeakComponentNodeCount > value.nodeCount
    || !finiteInteger(value.isolatedNodeCount, 0)
    || value.isolatedNodeCount > value.nodeCount
    || !finiteInteger(value.derivedSpeedEdgeCount, 0)
    || !finiteInteger(value.topologyConnectorEdgeCount, 0)
    || value.topologyConnectorEdgeCount > value.edgeCount
  ) return false
  const surfaceEdgeCounts = value.surfaceEdgeCounts
  if (!isRecord(surfaceEdgeCounts) || !hasOnlyKeys(
    surfaceEdgeCounts,
    ['paved', 'gravel', 'mixed', 'unknown'],
  )) return false
  return ['paved', 'gravel', 'mixed', 'unknown'].every(
    key => finiteInteger(surfaceEdgeCounts[key], 0),
  )
}

function validRuntimeBuildContractV1(value: unknown): value is RoadGraphRuntimeBuildContractV1 {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    'schemaVersion', 'policyFingerprint', 'diagnostics', 'goldenRoutePassCount',
    'goldenRouteTotalCount', 'topologyReceiptIds',
  ])) return false
  if (
    value.schemaVersion !== 1
    || (value.policyFingerprint !== ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_RECIPROCAL_V1
      && value.policyFingerprint !== ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2
      && value.policyFingerprint !== ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_ENDPOINT_JUNCTION_V3
      && value.policyFingerprint !== ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4)
    || !validRuntimeDiagnostics(value.diagnostics)
    || !finiteInteger(value.goldenRoutePassCount, 1)
    || !finiteInteger(value.goldenRouteTotalCount, 1)
    || value.goldenRoutePassCount !== value.goldenRouteTotalCount
    || !Array.isArray(value.topologyReceiptIds)
    || value.topologyReceiptIds.length > 50_000
  ) return false
  const receiptIds = value.topologyReceiptIds
  if (receiptIds.some(id => typeof id !== 'string' || id.length === 0 || id.length > 1_000)) {
    return false
  }
  if (new Set(receiptIds).size !== receiptIds.length) return false
  return receiptIds.every((id, index) => index === 0 || receiptIds[index - 1] < id)
}

export function parseRoadGraphRuntimeBuildContractV1(
  value: unknown,
): RoadGraphRuntimeBuildContractV1 | null {
  return validRuntimeBuildContractV1(value) ? value : null
}

/**
 * The enhanced v1 payload stays readable by the original v1 parser/runtime:
 * every official assessment segment is serialized as legacy `both`. STEFNA
 * remains preserved in official metadata and directionStatus for source
 * diagnostics, but it is not a routing constraint.
 */
export function serializeRoadGraphSnapshotSegmentsV1(
  segments: readonly IcelandRoadGraphSegmentInput[],
): IcelandRoadGraphSegmentInput[] {
  return segments.map(segment => segment.official
    ? { ...segment, direction: 'both' }
    : { ...segment })
}

function validEnhancedV1Segment(
  value: unknown,
  effectiveAtEpochMs: number,
): value is IcelandRoadGraphSegmentInput {
  if (!isRecord(value) || value.direction !== 'both') return false
  const sourceDirection = value.directionStatus === 'authoritative_both'
    ? 'both'
    : value.directionStatus === 'authoritative_forward'
      ? 'forward'
      : value.directionStatus === 'authoritative_reverse'
        ? 'reverse'
        : value.directionStatus === 'unknown_missing'
          || value.directionStatus === 'unknown_domain_drift'
          ? 'unknown'
          : null
  if (!sourceDirection) return false
  const sourceTruthValue: unknown = { ...value, direction: sourceDirection }
  if (!validSegmentV2(sourceTruthValue, effectiveAtEpochMs)) return false
  const segment = sourceTruthValue as IcelandRoadGraphSegmentInput
  return segment.networkRole === 'assessment_public'
    && segment.official?.sourceLayerId === 6
}

function parseEnhancedV1(value: Record<string, unknown>): RoadGraphSnapshotPayloadV1 | null {
  if (!hasOnlyKeys(value, [
    'schemaVersion', 'source', 'sourceFetchedAtIso', 'nodeSnapToleranceM',
    'runtimeBuildContract', 'segments',
  ])) return null
  if (value.schemaVersion !== 1 || value.source !== 'vegagerdin') return null
  if (!canonicalIso(value.sourceFetchedAtIso)) return null
  if (value.nodeSnapToleranceM !== ROAD_GRAPH_NODE_SNAP_TOLERANCE_M) return null
  if (!validRuntimeBuildContractV1(value.runtimeBuildContract)) return null
  if (!Array.isArray(value.segments) || value.segments.length === 0 || value.segments.length > 50_000) return null
  const effectiveAtEpochMs = Date.parse(value.sourceFetchedAtIso)
  if (!value.segments.every(segment => validEnhancedV1Segment(segment, effectiveAtEpochMs))) return null
  const segmentIds = value.segments.map(segment => segment.id)
  if (new Set(segmentIds).size !== segmentIds.length) return null
  const semanticRows = new Map<string, string>()
  for (const segment of value.segments) {
    const officialJson = canonicalRoadGraphSnapshotValueJson(segment.official)
    const existing = semanticRows.get(segment.sourceId)
    if (existing !== undefined && existing !== officialJson) return null
    semanticRows.set(segment.sourceId, officialJson)
  }
  return value as unknown as RoadGraphSnapshotPayloadV1
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isRecord(value)) return value
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    const item = value[key]
    if (item !== undefined) result[key] = canonicalize(item)
  }
  return result
}

function compareCanonicalText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function canonicalRoadGraphSnapshotValueJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

const CANONICAL_SOURCE_DESCRIPTORS = [
  VEGAGERDIN_ASSESSMENT_ROAD_SOURCE,
  VEGAGERDIN_ACCESS_CONNECTOR_SOURCE,
  VEGAGERDIN_SURFACE_SOURCE,
] as const

function validSourceArtifact(value: unknown): value is RoadGraphSnapshotSourceArtifactV2 {
  if (!isRecord(value) || !hasOnlyKeys(value, ['descriptor', 'featureCount', 'contentSha256'])) return false
  if (!finiteInteger(value.featureCount, 0)) return false
  if (typeof value.contentSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.contentSha256)) return false
  const descriptorJson = canonicalRoadGraphSnapshotValueJson(value.descriptor)
  return CANONICAL_SOURCE_DESCRIPTORS.some(
    descriptor => canonicalRoadGraphSnapshotValueJson(descriptor) === descriptorJson,
  )
}

function parseLegacyV1(value: Record<string, unknown>): RoadGraphSnapshotPayloadV1 | null {
  if (value.schemaVersion !== 1 || value.source !== 'vegagerdin') return null
  if (!parseableTimestamp(value.sourceFetchedAtIso)) return null
  if (value.nodeSnapToleranceM !== ROAD_GRAPH_NODE_SNAP_TOLERANCE_M) return null
  if (!Array.isArray(value.segments) || value.segments.length === 0 || value.segments.length > 50_000) return null
  if (!value.segments.every(validSegmentV1)) return null
  return value as unknown as RoadGraphSnapshotPayloadV1
}

function parseV1(value: Record<string, unknown>): RoadGraphSnapshotPayloadV1 | null {
  return value.runtimeBuildContract !== undefined ? parseEnhancedV1(value) : parseLegacyV1(value)
}

function parseV2(value: Record<string, unknown>): RoadGraphSnapshotPayloadV2 | null {
  if (!hasOnlyKeys(value, [
    'schemaVersion', 'source', 'sourceEffectiveAtIso', 'nodeSnapToleranceM',
    'sourceArtifacts', 'directionInferencePolicy', 'directionEvidenceArtifacts',
    'directionAttestations', 'segments',
  ])) return null
  if (value.schemaVersion !== ROAD_GRAPH_SNAPSHOT_SCHEMA_VERSION_V2 || value.source !== 'vegagerdin') return null
  if (!canonicalIso(value.sourceEffectiveAtIso)) return null
  if (value.nodeSnapToleranceM !== ROAD_GRAPH_NODE_SNAP_TOLERANCE_M) return null
  if (!Array.isArray(value.sourceArtifacts) || value.sourceArtifacts.length < 2 || value.sourceArtifacts.length > 3) return null
  if (!value.sourceArtifacts.every(validSourceArtifact)) return null
  const sourceKeys = value.sourceArtifacts.map(artifact => artifact.descriptor.key)
  if (new Set(sourceKeys).size !== sourceKeys.length) return null
  if (!sourceKeys.includes('assessment_public_roads') || !sourceKeys.includes('road_surfaces')) return null
  if (value.directionInferencePolicy !== null
    && !isIcelandRoadDirectionInferencePolicyV1(value.directionInferencePolicy)) return null
  if (!Array.isArray(value.directionEvidenceArtifacts) || value.directionEvidenceArtifacts.length > 50_000) return null
  if (!value.directionEvidenceArtifacts.every(isIcelandRoadDirectionEvidenceArtifactV1)) return null
  if (!Array.isArray(value.directionAttestations) || value.directionAttestations.length > 50_000) return null
  if (!value.directionAttestations.every(isIcelandRoadDirectionInferenceAttestationV1)) return null
  const hasInference = value.directionAttestations.length > 0 || value.directionEvidenceArtifacts.length > 0
  if (hasInference !== (value.directionInferencePolicy !== null)) return null
  if (hasInference && (value.directionAttestations.length === 0 || value.directionEvidenceArtifacts.length === 0)) return null
  if (!Array.isArray(value.segments) || value.segments.length === 0 || value.segments.length > 50_000) return null
  const effectiveAtEpochMs = Date.parse(value.sourceEffectiveAtIso)
  if (!value.segments.every(segment => validSegmentV2(segment, effectiveAtEpochMs))) return null
  const segmentIds = value.segments.map(segment => segment.id)
  if (new Set(segmentIds).size !== segmentIds.length) return null
  const semanticRows = new Map<string, string>()
  for (const segment of value.segments) {
    const officialJson = canonicalRoadGraphSnapshotValueJson(segment.official)
    const existing = semanticRows.get(segment.sourceId)
    if (existing !== undefined && existing !== officialJson) return null
    semanticRows.set(segment.sourceId, officialJson)
  }
  const includedRoadLayers = new Set(
    value.sourceArtifacts
      .filter(artifact => artifact.descriptor.dataset === 'vegakerfi')
      .map(artifact => artifact.descriptor.layerId),
  )
  if (value.segments.some(segment => !includedRoadLayers.has(segment.official!.sourceLayerId))) return null
  if (value.directionAttestations.length > 0 && value.directionInferencePolicy) {
    const sourceProvenanceKey = canonicalIcelandRoadSourceProvenanceKey(
      value.sourceArtifacts.map(artifact => ({
        key: artifact.descriptor.key,
        contentSha256: artifact.contentSha256,
      })),
    )
    const validation = validateIcelandRoadDirectionInferenceSet(
      value.segments,
      value.directionAttestations,
      {
        sourceProvenanceKey,
        evaluatedAtIso: value.sourceEffectiveAtIso,
        policy: value.directionInferencePolicy,
        evidenceArtifacts: value.directionEvidenceArtifacts,
      },
    )
    if (validation.failures.length > 0) return null
  }
  return value as unknown as RoadGraphSnapshotPayloadV2
}

/** Parser used by the active v1 runtime until the explicit rollout phase. */
export function parseRoadGraphSnapshotPayload(value: unknown): RoadGraphSnapshotPayloadV1 | null {
  return isRecord(value) ? parseV1(value) : null
}

/** Mirrors the original schema-v1 reader for cold code-rollback preflight. */
export function parseRoadGraphSnapshotPayloadLegacyV1Compatibility(
  value: unknown,
): RoadGraphSnapshotPayloadV1 | null {
  return isRecord(value) ? parseLegacyV1(value) : null
}

/** Exact fail-closed parser for local schema-v2 candidates. */
export function parseRoadGraphSnapshotPayloadV2(value: unknown): RoadGraphSnapshotPayloadV2 | null {
  return isRecord(value) ? parseV2(value) : null
}

export function canonicalRoadGraphSegmentSortKey(segment: IcelandRoadGraphSegmentInput): string {
  return `${segment.sourceId}:${segment.id}`
}

function canonicalV2(payload: RoadGraphSnapshotPayloadV2): RoadGraphSnapshotPayloadV2 {
  const identity = (value: unknown, key: string): string => {
    if (isRecord(value) && typeof value[key] === 'string') return value[key]
    const canonical = canonicalRoadGraphSnapshotValueJson(value)
    return typeof canonical === 'string' ? canonical : String(value)
  }
  return {
    ...payload,
    sourceArtifacts: [...payload.sourceArtifacts].sort((a, b) => (
      compareCanonicalText(a.descriptor.key, b.descriptor.key)
    )),
    directionEvidenceArtifacts: [...payload.directionEvidenceArtifacts].sort((a, b) => (
      compareCanonicalText(identity(a, 'artifactId'), identity(b, 'artifactId'))
    )),
    directionAttestations: [...payload.directionAttestations].sort((a, b) => (
      compareCanonicalText(identity(a, 'attestationId'), identity(b, 'attestationId'))
    )),
    segments: [...payload.segments].sort((a, b) => (
      compareCanonicalText(canonicalRoadGraphSegmentSortKey(a), canonicalRoadGraphSegmentSortKey(b))
    )),
  }
}

export function canonicalRoadGraphSnapshotJson(payload: RoadGraphSnapshotPayload): string {
  return canonicalRoadGraphSnapshotValueJson(payload.schemaVersion === 2 ? canonicalV2(payload) : payload)
}

/** Stable content identity; v2 contains no wall-clock retrieval timestamp. */
export function canonicalRoadGraphSnapshotContentJson(payload: RoadGraphSnapshotPayloadV2): string {
  return canonicalRoadGraphSnapshotValueJson(canonicalV2(payload))
}
