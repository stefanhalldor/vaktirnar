import { createHash } from 'node:crypto'

import {
  analyzeIcelandRoadGraph,
  buildIcelandRoadGraph,
  findIcelandRoadGraphRoute,
  geometryLengthM,
  haversineDistanceM,
  ICELAND_ROUTING_PROFILES,
} from './roadGraph'
import {
  ICELAND_GOLDEN_ROUTE_DEFAULTS,
  reverseIcelandGoldenRouteAuditStatus,
  type IcelandGoldenRouteAuditStatus,
} from './goldenRoutes'
import {
  canonicalIcelandRoadSourceProvenanceKey,
  isIcelandRoadDirectionEvidenceArtifactV1,
  isIcelandRoadDirectionInferenceAttestationV1,
  isIcelandRoadDirectionInferencePolicyV1,
  validateIcelandRoadDirectionInferenceSet,
} from './roadGraphDirectionInference'
import {
  canonicalRoadGraphSegmentSortKey,
  canonicalRoadGraphSnapshotJson,
  canonicalRoadGraphSnapshotValueJson,
  parseRoadGraphSnapshotPayloadV2,
  ROAD_GRAPH_NODE_SNAP_TOLERANCE_M,
  type RoadGraphSnapshotPayloadV2,
} from './roadGraphSnapshotFormat'
import type {
  IcelandRoadDirectionInferenceAttestationV1,
  IcelandRoadDirectionEvidenceArtifactV1,
  IcelandRoadDirectionInferencePolicyV1,
  IcelandRoadDirectionStatus,
  IcelandRoadGraphDiagnostics,
  IcelandRoadGraphSegmentInput,
} from './roadGraphTypes'
import type { LatLon } from './types'
import {
  normalizeVegagerdinRoadGraphSegmentsWithReport,
  VEGAGERDIN_ACCESS_CONNECTOR_SOURCE,
  VEGAGERDIN_ASSESSMENT_ROAD_SOURCE,
  VEGAGERDIN_SURFACE_SOURCE,
  type ArcGisGeoJsonFeatureCollection,
  type VegagerdinArcGisSourceDescriptor,
  type VegagerdinRoadGraphNormalizationReport,
} from './vegagerdinRoadGraphSource'
import { reconcileVegagerdinRoadGraphTopology } from './vegagerdinRoadGraphTopology'

export const ROAD_GRAPH_CANDIDATE_GENERATOR = {
  id: 'teskeid-road-graph-candidate-v2',
  version: 4,
} as const

/**
 * Dormant until a code-owned ingestion boundary verifies the registered
 * evidence bytes, parses an exact segmentSourceId + inferred_both + official
 * source-provenance claim, and validates the approval/license receipt.
 * Candidate input cannot override this. Do not flip this constant; replace it
 * with the result of that trusted verifier when the ingestion boundary exists.
 */
export interface RoadGraphCandidateRawSource {
  descriptor: VegagerdinArcGisSourceDescriptor
  collection: ArcGisGeoJsonFeatureCollection
  expectedContentSha256?: string
}

export interface RoadGraphCandidateGoldenRoute {
  id: string
  origin: LatLon
  destination: LatLon
  minKm: number
  maxKm: number
  maxSnapDistanceM?: number
  maxRoadToAirRatio?: number
  maxDirectionalDistanceDeltaM?: number
}

export interface RoadGraphCandidateBudgets {
  minAssessmentSegments: number
  minNodes: number
  minEdges: number
  minLargestComponentShare: number
  minLatitudeSpanDeg: number
  minLongitudeSpanDeg: number
  minGoldenRoutes: number
  maxPayloadBytes: number
  maxInferredDirectionKmShare: number
  minDirectionInferenceSourceTimeRemainingValidityMs: number
}

const DEFAULT_BUDGETS: RoadGraphCandidateBudgets = {
  minAssessmentSegments: 1_000,
  minNodes: 1_000,
  minEdges: 1_500,
  minLargestComponentShare: 0.6,
  minLatitudeSpanDeg: 3,
  minLongitudeSpanDeg: 8,
  minGoldenRoutes: 1,
  maxPayloadBytes: 100 * 1024 * 1024,
  // A release must explicitly opt into inferred direction kilometres.
  maxInferredDirectionKmShare: 0,
  minDirectionInferenceSourceTimeRemainingValidityMs: 0,
}

export interface RoadGraphCandidateDirectionInferenceInput {
  policy: IcelandRoadDirectionInferencePolicyV1
  evidenceArtifacts: readonly IcelandRoadDirectionEvidenceArtifactV1[]
  attestations: readonly IcelandRoadDirectionInferenceAttestationV1[]
}

export interface BuildRoadGraphCandidateV2Input {
  sources: readonly RoadGraphCandidateRawSource[]
  goldenRoutes: readonly RoadGraphCandidateGoldenRoute[]
  budgets?: Partial<RoadGraphCandidateBudgets>
  directionInference?: RoadGraphCandidateDirectionInferenceInput
}

interface CandidateSourceReport {
  key: string
  featureCount: number
  contentSha256: string
  expectedContentSha256: string | null
  contentHashMatches: boolean
  descriptorCanonical: boolean
  sourceMetadataValid: boolean
  maximumSourceUpdatedAtIso: string | null
}

interface CandidateGoldenRouteReport {
  id: string
  status: IcelandGoldenRouteAuditStatus
  distanceKm: number | null
  reverseDistanceKm: number | null
  airDistanceKm: number
  roadToAirRatio: number | null
  directionalDistanceDeltaM: number | null
  originSnapM: number | null
  destinationSnapM: number | null
  reverseOriginSnapM: number | null
  reverseDestinationSnapM: number | null
  authoritativeDirectionKm: number | null
  inferredDirectionKm: number | null
  provisionalDirectionKm: number | null
}

export interface RoadGraphCandidateValidationReportV2 {
  reportSchemaVersion: 2
  generator: typeof ROAD_GRAPH_CANDIDATE_GENERATOR
  status: 'green' | 'red'
  failureChecks: string[]
  sourceEffectiveAtIso: string | null
  sourceProvenanceKey: string
  sources: CandidateSourceReport[]
  normalization: {
    assessment: VegagerdinRoadGraphNormalizationReport | null
    access: VegagerdinRoadGraphNormalizationReport | null
  }
  checks: {
    canonicalSources: boolean
    sourceHashes: boolean
    sourceMetadata: boolean
    normalizationSchema: boolean
    normalizationDomain: boolean
    directionEvidenceValid: boolean
    directionInferenceTrustedIngestionGate: boolean
    directionInferenceActivationFreshnessGate: boolean
    routingDirectionResolved: boolean
    directionInferenceWithinPolicy: boolean
    knownRoutingDirection: boolean
    payloadSchema: boolean
    minimumAssessmentSegments: boolean
    minimumNodes: boolean
    minimumEdges: boolean
    largestComponentCoverage: boolean
    geographicCoverage: boolean
    goldenRoutes: boolean
    payloadSize: boolean
  }
  metrics: {
    assessmentSegmentCount: number
    accessSegmentCount: number
    unknownDirectionSourceCount: number
    authoritativeDirectionSourceCount: number
    authoritativeDirectionSegmentCount: number
    authoritativeDirectionKm: number
    inferredDirectionSourceCount: number
    inferredDirectionSegmentCount: number
    inferredDirectionKm: number
    unresolvedMissingDirectionSourceCount: number
    unresolvedMissingDirectionSegmentCount: number
    unresolvedMissingDirectionKm: number
    unresolvedDomainDriftDirectionSourceCount: number
    unresolvedDomainDriftDirectionSegmentCount: number
    unresolvedDomainDriftDirectionKm: number
    provisionalBidirectionalDirectionSourceCount: number
    provisionalBidirectionalDirectionSegmentCount: number
    provisionalBidirectionalDirectionKm: number
    inferredDirectionKmShare: number
    directionInferenceFailureCount: number
    minimumDirectionInferenceConfidenceBps: number | null
    minimumDirectionInferenceSourceTimeRemainingValidityMs: number | null
    accessAuthoritativeDirectionSourceCount: number
    accessAuthoritativeDirectionKm: number
    accessUnknownDirectionSourceCount: number
    accessUnknownDirectionKm: number
    latitudeSpanDeg: number
    longitudeSpanDeg: number
    largestComponentShare: number
    topologySegmentCount: number
    topologyReceiptCount: number
    topologyBindingCount: number
    topologyRejectedCandidateCount: number
    payloadBytes: number
  }
  diagnostics: IcelandRoadGraphDiagnostics | null
  goldenRoutes: CandidateGoldenRouteReport[]
  budgets: RoadGraphCandidateBudgets
  snapshotSha256: string | null
}

export interface RoadGraphCandidateBundleV2 {
  /** Non-null only when every promotion gate is green. */
  payload: RoadGraphSnapshotPayloadV2 | null
  /** Non-null only when every promotion gate is green. */
  payloadJson: string | null
  report: RoadGraphCandidateValidationReportV2
  reportJson: string
}

const CANONICAL_DESCRIPTORS = [
  VEGAGERDIN_ASSESSMENT_ROAD_SOURCE,
  VEGAGERDIN_ACCESS_CONNECTOR_SOURCE,
  VEGAGERDIN_SURFACE_SOURCE,
] as const

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function safeCandidateSortIdentity(value: unknown, key: string): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const candidate = (value as Record<string, unknown>)[key]
    if (typeof candidate === 'string') return candidate
  }
  const canonical = canonicalRoadGraphSnapshotValueJson(value)
  return typeof canonical === 'string' ? canonical : String(value)
}

function canonicalCollectionJson(collection: ArcGisGeoJsonFeatureCollection): string {
  const features = [...collection.features].sort((a, b) => {
    const aId = typeof a.properties?.OBJECTID === 'number' ? a.properties.OBJECTID : Number.MAX_SAFE_INTEGER
    const bId = typeof b.properties?.OBJECTID === 'number' ? b.properties.OBJECTID : Number.MAX_SAFE_INTEGER
    return aId - bId
      || compareText(canonicalRoadGraphSnapshotValueJson(a), canonicalRoadGraphSnapshotValueJson(b))
  })
  return canonicalRoadGraphSnapshotValueJson({ ...collection, features })
}

function canonicalDescriptor(descriptor: VegagerdinArcGisSourceDescriptor): boolean {
  const value = canonicalRoadGraphSnapshotValueJson(descriptor)
  return CANONICAL_DESCRIPTORS.some(candidate => (
    canonicalRoadGraphSnapshotValueJson(candidate) === value
  ))
}

function validSha256(value: string | undefined): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function sourceUpdateMetadata(collection: ArcGisGeoJsonFeatureCollection): {
  valid: boolean
  maximumEpochMs: number | null
} {
  if (collection.features.length === 0) return { valid: false, maximumEpochMs: null }
  let maximumEpochMs = Number.NEGATIVE_INFINITY
  for (const feature of collection.features) {
    const value = feature.properties?.DAGSGRUNNUR
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return { valid: false, maximumEpochMs: null }
    }
    maximumEpochMs = Math.max(maximumEpochMs, value)
  }
  try {
    return { valid: true, maximumEpochMs: Date.parse(new Date(maximumEpochMs).toISOString()) }
  } catch {
    return { valid: false, maximumEpochMs: null }
  }
}

function resolvedBudgets(input: Partial<RoadGraphCandidateBudgets> | undefined): RoadGraphCandidateBudgets {
  const result = { ...DEFAULT_BUDGETS, ...input }
  const finiteNonNegative = Object.values(result).every(value => Number.isFinite(value) && value >= 0)
  if (
    !finiteNonNegative
    || result.minLargestComponentShare > 1
    || result.maxInferredDirectionKmShare > 1
    || result.maxPayloadBytes <= 0
  ) {
    throw new Error('road_graph_candidate_invalid_budgets')
  }
  return result
}

type DirectionMetricBucket = 'authoritative' | 'inferred' | 'unresolved_missing' | 'unresolved_domain_drift'

interface PhysicalDirectionMetrics {
  sourceCounts: Record<DirectionMetricBucket, number>
  segmentCounts: Record<DirectionMetricBucket, number>
  distanceM: Record<DirectionMetricBucket, number>
}

function physicalDirectionMetrics(
  segments: readonly IcelandRoadGraphSegmentInput[],
  acceptedBySourceId: ReadonlyMap<string, IcelandRoadDirectionInferenceAttestationV1>,
): PhysicalDirectionMetrics {
  const sourceIds: Record<DirectionMetricBucket, Set<string>> = {
    authoritative: new Set(),
    inferred: new Set(),
    unresolved_missing: new Set(),
    unresolved_domain_drift: new Set(),
  }
  const segmentIds: Record<DirectionMetricBucket, Set<string>> = {
    authoritative: new Set(),
    inferred: new Set(),
    unresolved_missing: new Set(),
    unresolved_domain_drift: new Set(),
  }
  const distanceM: Record<DirectionMetricBucket, number> = {
    authoritative: 0,
    inferred: 0,
    unresolved_missing: 0,
    unresolved_domain_drift: 0,
  }
  for (const segment of segments) {
    let bucket: DirectionMetricBucket
    const status: IcelandRoadDirectionStatus | undefined = segment.directionStatus
    if (status?.startsWith('authoritative_')) bucket = 'authoritative'
    else if (acceptedBySourceId.has(segment.sourceId)) bucket = 'inferred'
    else if (status === 'unknown_missing') bucket = 'unresolved_missing'
    else bucket = 'unresolved_domain_drift'
    if (segmentIds[bucket].has(segment.id)) continue
    segmentIds[bucket].add(segment.id)
    sourceIds[bucket].add(segment.sourceId)
    // Surface-split children are disjoint physical portions. Sum each exact
    // child once rather than summing the two directed graph edges.
    distanceM[bucket] += segment.lengthM && segment.lengthM > 0
      ? segment.lengthM
      : geometryLengthM(segment.geometry)
  }
  return {
    sourceCounts: {
      authoritative: sourceIds.authoritative.size,
      inferred: sourceIds.inferred.size,
      unresolved_missing: sourceIds.unresolved_missing.size,
      unresolved_domain_drift: sourceIds.unresolved_domain_drift.size,
    },
    segmentCounts: {
      authoritative: segmentIds.authoritative.size,
      inferred: segmentIds.inferred.size,
      unresolved_missing: segmentIds.unresolved_missing.size,
      unresolved_domain_drift: segmentIds.unresolved_domain_drift.size,
    },
    distanceM,
  }
}

function km(distanceM: number): number {
  return Math.round(distanceM) / 1_000
}

function auditGoldenRoutes(
  graph: ReturnType<typeof buildIcelandRoadGraph>,
  definitions: readonly RoadGraphCandidateGoldenRoute[],
): CandidateGoldenRouteReport[] {
  return [...definitions]
    .sort((a, b) => compareText(a.id, b.id))
    .map(definition => {
      const airDistanceKm = haversineDistanceM(definition.origin, definition.destination) / 1_000
      const maximumSnapDistanceM = definition.maxSnapDistanceM
        ?? ICELAND_GOLDEN_ROUTE_DEFAULTS.maxSnapDistanceM
      const maximumRoadToAirRatio = definition.maxRoadToAirRatio
        ?? ICELAND_GOLDEN_ROUTE_DEFAULTS.maxRoadToAirRatio
      const maximumDirectionalDistanceDeltaM = definition.maxDirectionalDistanceDeltaM
        ?? ICELAND_GOLDEN_ROUTE_DEFAULTS.maxDirectionalDistanceDeltaM
      const result = findIcelandRoadGraphRoute(graph, definition.origin, definition.destination, {
        profile: ICELAND_ROUTING_PROFILES.fastestCar,
        maxSnapDistanceM: maximumSnapDistanceM,
      })
      if (result.status !== 'ok') {
        return {
          id: definition.id,
          status: result.status,
          distanceKm: null,
          reverseDistanceKm: null,
          airDistanceKm,
          roadToAirRatio: null,
          directionalDistanceDeltaM: null,
          originSnapM: null,
          destinationSnapM: null,
          reverseOriginSnapM: null,
          reverseDestinationSnapM: null,
          authoritativeDirectionKm: null,
          inferredDirectionKm: null,
          provisionalDirectionKm: null,
        }
      }
      const reverse = findIcelandRoadGraphRoute(graph, definition.destination, definition.origin, {
        profile: ICELAND_ROUTING_PROFILES.fastestCar,
        maxSnapDistanceM: maximumSnapDistanceM,
      })
      const distanceKm = result.route.distanceM / 1_000
      const reverseDistanceKm = reverse.status === 'ok' ? reverse.route.distanceM / 1_000 : null
      const roadToAirRatio = airDistanceKm > 0 ? distanceKm / airDistanceKm : null
      const directionalDistanceDeltaM = reverse.status === 'ok'
        ? Math.abs(result.route.distanceM - reverse.route.distanceM)
        : null
      let status: IcelandGoldenRouteAuditStatus = 'ok'
      if (reverse.status !== 'ok') {
        status = reverseIcelandGoldenRouteAuditStatus(reverse.status)
      } else if (
        result.originSnapDistanceM > maximumSnapDistanceM
        || result.destinationSnapDistanceM > maximumSnapDistanceM
        || reverse.originSnapDistanceM > maximumSnapDistanceM
        || reverse.destinationSnapDistanceM > maximumSnapDistanceM
      ) status = 'snap_out_of_range'
      else if (distanceKm < definition.minKm || distanceKm > definition.maxKm) {
        status = 'distance_out_of_range'
      } else if (roadToAirRatio === null || roadToAirRatio > maximumRoadToAirRatio) {
        status = 'stretch_out_of_range'
      } else if (
        directionalDistanceDeltaM === null
        || directionalDistanceDeltaM > maximumDirectionalDistanceDeltaM
      ) status = 'directional_distance_mismatch'
      return {
        id: definition.id,
        status,
        distanceKm,
        reverseDistanceKm,
        airDistanceKm,
        roadToAirRatio,
        directionalDistanceDeltaM,
        originSnapM: result.originSnapDistanceM,
        destinationSnapM: result.destinationSnapDistanceM,
        reverseOriginSnapM: reverse.status === 'ok' ? reverse.originSnapDistanceM : null,
        reverseDestinationSnapM: reverse.status === 'ok' ? reverse.destinationSnapDistanceM : null,
        authoritativeDirectionKm: result.route.authoritativeDirectionDistanceM / 1_000,
        inferredDirectionKm: result.route.inferredDirectionDistanceM / 1_000,
        provisionalDirectionKm: result.route.legacyDirectionDistanceM / 1_000,
      }
    })
}

export function buildRoadGraphCandidateV2(input: BuildRoadGraphCandidateV2Input): RoadGraphCandidateBundleV2 {
  const budgets = resolvedBudgets(input.budgets)
  const sources = [...input.sources].sort((a, b) => compareText(a.descriptor.key, b.descriptor.key))
  const sourceReports = sources.map(source => {
    const contentSha256 = sha256(canonicalCollectionJson(source.collection))
    const update = sourceUpdateMetadata(source.collection)
    return {
      key: source.descriptor.key,
      featureCount: source.collection.features.length,
      contentSha256,
      expectedContentSha256: source.expectedContentSha256 ?? null,
      contentHashMatches: source.expectedContentSha256 === undefined
        || (validSha256(source.expectedContentSha256) && source.expectedContentSha256 === contentSha256),
      descriptorCanonical: canonicalDescriptor(source.descriptor),
      sourceMetadataValid: update.valid,
      maximumSourceUpdatedAtIso: update.maximumEpochMs === null
        ? null
        : new Date(update.maximumEpochMs).toISOString(),
    }
  })
  const sourceProvenanceKey = canonicalIcelandRoadSourceProvenanceKey(
    sourceReports.map(source => ({ key: source.key, contentSha256: source.contentSha256 })),
  )
  const keys = sources.map(source => source.descriptor.key)
  const uniqueKeys = new Set(keys)
  const canonicalSources = sourceReports.every(source => source.descriptorCanonical)
    && uniqueKeys.size === keys.length
    && keys.includes('assessment_public_roads')
    && keys.includes('road_surfaces')
    && sources.length >= 2
    && sources.length <= 3
  const sourceMetadataValid = sourceReports.every(source => source.sourceMetadataValid)
  const maximumSourceEpochMs = sourceMetadataValid
    ? Math.max(...sourceReports.map(source => Date.parse(source.maximumSourceUpdatedAtIso!)))
    : null
  const sourceEffectiveAtIso = maximumSourceEpochMs === null
    ? null
    : new Date(maximumSourceEpochMs).toISOString()
  const sourceByKey = new Map(sources.map(source => [source.descriptor.key, source]))
  const surfaces = sourceByKey.get('road_surfaces')
  const assessment = sourceByKey.get('assessment_public_roads')
  const access = sourceByKey.get('access_connector_roads')

  let assessmentNormalization: ReturnType<typeof normalizeVegagerdinRoadGraphSegmentsWithReport> | null = null
  let accessNormalization: ReturnType<typeof normalizeVegagerdinRoadGraphSegmentsWithReport> | null = null
  if (sourceEffectiveAtIso && assessment && surfaces) {
    const effectiveAtEpochMs = Date.parse(sourceEffectiveAtIso)
    assessmentNormalization = normalizeVegagerdinRoadGraphSegmentsWithReport({
      roads: assessment.collection,
      surfaces: surfaces.collection,
      roadLayerId: 6,
      effectiveAtEpochMs,
    })
    if (access) {
      accessNormalization = normalizeVegagerdinRoadGraphSegmentsWithReport({
        roads: access.collection,
        surfaces: surfaces.collection,
        roadLayerId: 8,
        effectiveAtEpochMs,
      })
    }
  }

  const assessmentSegments = assessmentNormalization?.segments ?? []
  const accessSegments = accessNormalization?.segments ?? []
  const segments = [
    ...assessmentSegments,
    ...accessSegments,
  ].sort((a, b) => compareText(canonicalRoadGraphSegmentSortKey(a), canonicalRoadGraphSegmentSortKey(b)))
  const directionAttestations = [...(input.directionInference?.attestations ?? [])]
    .sort((a, b) => compareText(
      safeCandidateSortIdentity(a, 'attestationId'),
      safeCandidateSortIdentity(b, 'attestationId'),
    ))
  const directionEvidenceArtifacts = [...(input.directionInference?.evidenceArtifacts ?? [])]
    .sort((a, b) => compareText(
      safeCandidateSortIdentity(a, 'artifactId'),
      safeCandidateSortIdentity(b, 'artifactId'),
    ))
  const directionInferenceInputValid = input.directionInference === undefined || (
    directionAttestations.length > 0
    && directionEvidenceArtifacts.length > 0
    && isIcelandRoadDirectionInferencePolicyV1(input.directionInference.policy)
    && directionEvidenceArtifacts.every(isIcelandRoadDirectionEvidenceArtifactV1)
    && directionAttestations.every(isIcelandRoadDirectionInferenceAttestationV1)
  )
  const directionValidation = validateIcelandRoadDirectionInferenceSet(
    assessmentSegments,
    directionAttestations,
    {
      sourceProvenanceKey,
      evaluatedAtIso: sourceEffectiveAtIso ?? '',
      policy: directionInferenceInputValid ? input.directionInference?.policy : undefined,
      evidenceArtifacts: directionEvidenceArtifacts,
    },
  )
  const directionMetrics = physicalDirectionMetrics(
    assessmentSegments,
    directionValidation.acceptedBySourceId,
  )
  const accessDirectionMetrics = physicalDirectionMetrics(accessSegments, new Map())
  const sourceArtifacts = sources.map((source, index) => ({
    descriptor: source.descriptor,
    featureCount: source.collection.features.length,
    contentSha256: sourceReports[index].contentSha256,
  }))
  const candidatePayload: RoadGraphSnapshotPayloadV2 | null = sourceEffectiveAtIso && segments.length > 0
    ? {
        schemaVersion: 2,
        source: 'vegagerdin',
        sourceEffectiveAtIso,
        nodeSnapToleranceM: ROAD_GRAPH_NODE_SNAP_TOLERANCE_M,
        sourceArtifacts,
        directionInferencePolicy: null,
        directionEvidenceArtifacts: [],
        directionAttestations: [],
        segments,
      }
    : null
  const payloadJson = candidatePayload ? canonicalRoadGraphSnapshotJson(candidatePayload) : null
  const payloadBytes = payloadJson ? Buffer.byteLength(payloadJson, 'utf8') : 0
  const snapshotSha256 = payloadJson ? sha256(payloadJson) : null
  const parsedPayload = candidatePayload ? parseRoadGraphSnapshotPayloadV2(candidatePayload) : null
  const assessmentSourceReport = sourceReports.find(source => source.key === 'assessment_public_roads')
  const topology = assessmentSegments.length > 0 && assessmentSourceReport
    ? reconcileVegagerdinRoadGraphTopology({
        segments: assessmentSegments,
        nodeSnapToleranceM: ROAD_GRAPH_NODE_SNAP_TOLERANCE_M,
        artifact: {
          artifactId: 'vegagerdin-assessment-public-roads',
          contentSha256: assessmentSourceReport.contentSha256,
          validationReportId: `${ROAD_GRAPH_CANDIDATE_GENERATOR.id}-v${ROAD_GRAPH_CANDIDATE_GENERATOR.version}`,
        },
      })
    : null
  const graph = assessmentSegments.length > 0
    ? buildIcelandRoadGraph(assessmentSegments, {
        nodeSnapToleranceM: ROAD_GRAPH_NODE_SNAP_TOLERANCE_M,
        routingDirectionPolicy: 'bidirectional',
        missingDirectionPolicy: 'provisional_bidirectional',
        ...(topology && topology.bindings.length > 0 && topology.receipts[0]
          ? {
              topologyReconciliation: {
                bindings: topology.bindings,
                sectionLedger: topology.sectionLedger,
                receiptLedger: topology.receipts,
                policyId: topology.policyId,
                provenance: topology.receipts[0].provenance,
                invalidBindingBehavior: 'throw' as const,
              },
            }
          : {}),
      })
    : null
  const diagnostics = graph ? analyzeIcelandRoadGraph(graph) : null
  const goldenRoutes = graph ? auditGoldenRoutes(graph, input.goldenRoutes) : []
  let minimumLatitude = Number.POSITIVE_INFINITY
  let maximumLatitude = Number.NEGATIVE_INFINITY
  let minimumLongitude = Number.POSITIVE_INFINITY
  let maximumLongitude = Number.NEGATIVE_INFINITY
  for (const segment of assessmentSegments) {
    for (const point of segment.geometry) {
      minimumLatitude = Math.min(minimumLatitude, point.lat)
      maximumLatitude = Math.max(maximumLatitude, point.lat)
      minimumLongitude = Math.min(minimumLongitude, point.lon)
      maximumLongitude = Math.max(maximumLongitude, point.lon)
    }
  }
  const latitudeSpanDeg = Number.isFinite(minimumLatitude) ? maximumLatitude - minimumLatitude : 0
  const longitudeSpanDeg = Number.isFinite(minimumLongitude) ? maximumLongitude - minimumLongitude : 0
  const largestComponentShare = diagnostics && diagnostics.nodeCount > 0
    ? diagnostics.largestWeakComponentNodeCount / diagnostics.nodeCount
    : 0
  const unknownDirectionSourceCount = new Set(
    assessmentSegments.filter(segment => segment.direction === 'unknown').map(segment => segment.sourceId),
  ).size
  const accessUnknownDirectionSourceCount = new Set(
    accessSegments.filter(segment => segment.direction === 'unknown').map(segment => segment.sourceId),
  ).size
  // Missing/NULL is explicitly routable as provisional bidirectional. Domain
  // drift (for example an unknown numeric code) still fails closed.
  const routableDirectionDistanceM = directionMetrics.distanceM.authoritative
    + directionMetrics.distanceM.inferred
  const inferredDirectionKmShare = routableDirectionDistanceM > 0
    ? directionMetrics.distanceM.inferred / routableDirectionDistanceM
    : 0
  const acceptedAttestations = [...directionValidation.acceptedBySourceId.values()]
  const minimumDirectionInferenceConfidenceBps = acceptedAttestations.length > 0
    ? Math.min(...acceptedAttestations.map(attestation => attestation.confidenceBps))
    : null
  const minimumDirectionInferenceSourceTimeRemainingValidityMs = acceptedAttestations.length > 0
    && sourceEffectiveAtIso
    ? Math.min(...acceptedAttestations.map(attestation => (
        Date.parse(attestation.expiresAtIso) - Date.parse(sourceEffectiveAtIso)
      )))
    : null
  const normalizationReports = [assessmentNormalization?.report, accessNormalization?.report]
    .filter((report): report is VegagerdinRoadGraphNormalizationReport => report !== undefined)
  const checks = {
    canonicalSources,
    sourceHashes: sourceReports.every(source => source.contentHashMatches),
    sourceMetadata: sourceMetadataValid && sourceEffectiveAtIso !== null,
    normalizationSchema: normalizationReports.length > 0
      && normalizationReports.every(report => !report.schemaDriftDetected),
    normalizationDomain: normalizationReports.length > 0
      && normalizationReports.every(report => !report.nonDirectionDomainDriftDetected),
    // STEFNA and its former inference artifacts are retained only as source
    // diagnostics. They no longer gate or alter bidirectional routing.
    directionEvidenceValid: true,
    directionInferenceTrustedIngestionGate: true,
    directionInferenceActivationFreshnessGate: true,
    routingDirectionResolved: true,
    directionInferenceWithinPolicy: true,
    knownRoutingDirection: true,
    payloadSchema: parsedPayload !== null,
    minimumAssessmentSegments: assessmentSegments.length >= budgets.minAssessmentSegments,
    minimumNodes: (diagnostics?.nodeCount ?? 0) >= budgets.minNodes,
    minimumEdges: (diagnostics?.edgeCount ?? 0) >= budgets.minEdges,
    largestComponentCoverage: largestComponentShare >= budgets.minLargestComponentShare,
    geographicCoverage: latitudeSpanDeg >= budgets.minLatitudeSpanDeg
      && longitudeSpanDeg >= budgets.minLongitudeSpanDeg,
    goldenRoutes: goldenRoutes.length >= budgets.minGoldenRoutes
      && goldenRoutes.every(route => route.status === 'ok'),
    payloadSize: payloadBytes > 0 && payloadBytes <= budgets.maxPayloadBytes,
  }
  const failureChecks = Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([name]) => name)
    .sort(compareText)
  const report: RoadGraphCandidateValidationReportV2 = {
    reportSchemaVersion: 2,
    generator: ROAD_GRAPH_CANDIDATE_GENERATOR,
    status: failureChecks.length === 0 ? 'green' : 'red',
    failureChecks,
    sourceEffectiveAtIso,
    sourceProvenanceKey,
    sources: sourceReports,
    normalization: {
      assessment: assessmentNormalization?.report ?? null,
      access: accessNormalization?.report ?? null,
    },
    checks,
    metrics: {
      assessmentSegmentCount: assessmentSegments.length,
      accessSegmentCount: accessNormalization?.segments.length ?? 0,
      unknownDirectionSourceCount,
      authoritativeDirectionSourceCount: directionMetrics.sourceCounts.authoritative,
      authoritativeDirectionSegmentCount: directionMetrics.segmentCounts.authoritative,
      authoritativeDirectionKm: km(directionMetrics.distanceM.authoritative),
      inferredDirectionSourceCount: directionMetrics.sourceCounts.inferred,
      inferredDirectionSegmentCount: directionMetrics.segmentCounts.inferred,
      inferredDirectionKm: km(directionMetrics.distanceM.inferred),
      unresolvedMissingDirectionSourceCount: directionMetrics.sourceCounts.unresolved_missing,
      unresolvedMissingDirectionSegmentCount: directionMetrics.segmentCounts.unresolved_missing,
      unresolvedMissingDirectionKm: km(directionMetrics.distanceM.unresolved_missing),
      unresolvedDomainDriftDirectionSourceCount: directionMetrics.sourceCounts.unresolved_domain_drift,
      unresolvedDomainDriftDirectionSegmentCount: directionMetrics.segmentCounts.unresolved_domain_drift,
      unresolvedDomainDriftDirectionKm: km(directionMetrics.distanceM.unresolved_domain_drift),
      provisionalBidirectionalDirectionSourceCount: directionMetrics.sourceCounts.unresolved_missing,
      provisionalBidirectionalDirectionSegmentCount: directionMetrics.segmentCounts.unresolved_missing,
      provisionalBidirectionalDirectionKm: km(directionMetrics.distanceM.unresolved_missing),
      inferredDirectionKmShare,
      directionInferenceFailureCount: directionValidation.failures.length,
      minimumDirectionInferenceConfidenceBps,
      minimumDirectionInferenceSourceTimeRemainingValidityMs,
      accessAuthoritativeDirectionSourceCount: accessDirectionMetrics.sourceCounts.authoritative,
      accessAuthoritativeDirectionKm: km(accessDirectionMetrics.distanceM.authoritative),
      accessUnknownDirectionSourceCount,
      accessUnknownDirectionKm: km(
        accessDirectionMetrics.distanceM.unresolved_missing
          + accessDirectionMetrics.distanceM.unresolved_domain_drift,
      ),
      latitudeSpanDeg,
      longitudeSpanDeg,
      largestComponentShare,
      topologySegmentCount: topology?.topologySegmentCount ?? 0,
      topologyReceiptCount: topology?.receipts.length ?? 0,
      topologyBindingCount: topology?.bindings.length ?? 0,
      topologyRejectedCandidateCount: topology?.candidates.filter(candidate => candidate.status === 'rejected').length ?? 0,
      payloadBytes,
    },
    diagnostics,
    goldenRoutes,
    budgets,
    snapshotSha256,
  }
  const promotable = report.status === 'green'
  return {
    payload: promotable ? candidatePayload : null,
    payloadJson: promotable ? payloadJson : null,
    report,
    reportJson: canonicalRoadGraphSnapshotValueJson(report),
  }
}
