import type {
  IcelandRoadGraphTopologyReceiptBinding,
  IcelandRoadGraphTopologySectionBinding,
} from './roadGraph'
import type {
  IcelandRoadGraphPoint,
  IcelandRoadGraphSegmentInput,
} from './roadGraphTypes'
import {
  reconcileSourceAttestedJunctionGaps,
  type RoadTopologyArtifactEvidence,
  type RoadTopologyDirection,
  type RoadTopologyPoint,
  type RoadTopologyReconciliationCandidate,
  type RoadTopologyReconciliationPolicy,
  type RoadTopologySourceSegment,
  type SourceAttestedJunctionGapReceipt,
} from './roadGraphTopologyReconciliation'

export const VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V1 =
  'vegagerdin-reciprocal-section-endpoints-v1'
export const VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V2 =
  'vegagerdin-attested-section-junctions-v2'
export const VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V3 =
  'vegagerdin-attested-endpoint-junctions-v3'
export const VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V4 =
  'vegagerdin-source-attested-hub-endpoint-gaps-v4'
export const VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID =
  VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V4
export const VEGAGERDIN_TOPOLOGY_MAXIMUM_GAP_M = 50
export const VEGAGERDIN_TOPOLOGY_EXACT_VERTEX_TOLERANCE_M = 0.001

export type VegagerdinTopologyReconciliationPolicyId =
  | typeof VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V1
  | typeof VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V2
  | typeof VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V3
  | typeof VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V4

const COORDINATE_EPSILON_DEG = 1e-9
const ELEVATION_EPSILON_M = 1e-6
const DISTANCE_EPSILON_M = 1e-6
const MOTOR_VEHICLE_PROFILE = 'motor_vehicle'

export interface VegagerdinRoadTopologyArtifactInput {
  artifactId: string
  contentSha256: string
  validationReportId: string
}

export interface VegagerdinRoadGraphTopologyResult {
  policyId: VegagerdinTopologyReconciliationPolicyId
  candidates: readonly RoadTopologyReconciliationCandidate[]
  receipts: readonly SourceAttestedJunctionGapReceipt[]
  bindings: readonly IcelandRoadGraphTopologyReceiptBinding[]
  sectionLedger: readonly IcelandRoadGraphTopologySectionBinding[]
  topologySegmentCount: number
}

interface GraphEdgeBinding {
  segmentId: string
  sourceId: string
  edgeIndex: number
}

interface AggregatedOfficialSection {
  topology: RoadTopologySourceSegment
  startGraphSegment: IcelandRoadGraphSegmentInput
  endGraphSegment: IcelandRoadGraphSegmentInput
  edgeBindings: readonly GraphEdgeBinding[]
}

interface ParsedChildId {
  geometryIndex: number
  surfaceIndex: number | null
}

function parseChildId(segment: IcelandRoadGraphSegmentInput): ParsedChildId | null {
  if (!segment.id.startsWith(`${segment.sourceId}:`)) return null
  const suffix = segment.id.slice(segment.sourceId.length)
  const match = /^:geometry-(\d+)(?::surface-(\d+))?$/.exec(suffix)
  if (!match) return null
  const geometryIndex = Number(match[1])
  const surfaceIndex = match[2] === undefined ? null : Number(match[2])
  return Number.isSafeInteger(geometryIndex)
    && geometryIndex >= 0
    && (surfaceIndex === null || (Number.isSafeInteger(surfaceIndex) && surfaceIndex >= 0))
    ? { geometryIndex, surfaceIndex }
    : null
}

function samePoint(a: IcelandRoadGraphPoint, b: IcelandRoadGraphPoint): boolean {
  if (
    Math.abs(a.lat - b.lat) > COORDINATE_EPSILON_DEG
    || Math.abs(a.lon - b.lon) > COORDINATE_EPSILON_DEG
  ) return false
  if (a.elevationM === undefined || b.elevationM === undefined) {
    return a.elevationM === b.elevationM
  }
  return Math.abs(a.elevationM - b.elevationM) <= ELEVATION_EPSILON_M
}

function topologyPoint(point: IcelandRoadGraphPoint): RoadTopologyPoint {
  return {
    lat: point.lat,
    lon: point.lon,
    ...(point.elevationM === undefined ? {} : { zM: point.elevationM }),
  }
}

function topologyDirection(
  _segment: IcelandRoadGraphSegmentInput,
): RoadTopologyDirection {
  // STEFNA remains available as raw source metadata, but Teskeið does not use
  // it as a routing constraint. Reciprocal official section joins are therefore
  // traversable in both directions as well.
  return 'both'
}

function metadataIdentity(segment: IcelandRoadGraphSegmentInput): string | null {
  const official = segment.official
  if (!official) return null
  return JSON.stringify({
    official,
    roadNumber: segment.roadNumber ?? null,
    direction: segment.direction,
    directionStatus: segment.directionStatus ?? null,
    networkRole: segment.networkRole ?? null,
  })
}

function aggregateOfficialSection(
  sourceId: string,
  sourceSegments: readonly IcelandRoadGraphSegmentInput[],
): AggregatedOfficialSection | null {
  if (sourceSegments.length === 0) return null
  const parsed = sourceSegments.map(segment => ({ segment, child: parseChildId(segment) }))
  if (parsed.some(value => value.child === null)) return null
  const children = parsed as { segment: IcelandRoadGraphSegmentInput; child: ParsedChildId }[]
  if (new Set(children.map(value => value.child.geometryIndex)).size !== 1) return null
  if (children[0].child.geometryIndex !== 0) return null

  const identity = metadataIdentity(children[0].segment)
  if (!identity || children.some(value => metadataIdentity(value.segment) !== identity)) return null
  const official = children[0].segment.official
  const roadNumber = children[0].segment.roadNumber
  const direction = topologyDirection(children[0].segment)
  if (
    !official
    || official.provider !== 'vegagerdin'
    || official.sourceLayerId !== 6
    || children[0].segment.networkRole !== 'assessment_public'
    || !roadNumber
    || !official.sectionNumber
    || !direction
  ) return null

  const hasSurfaceChildren = children.some(value => value.child.surfaceIndex !== null)
  if (hasSurfaceChildren && children.some(value => value.child.surfaceIndex === null)) return null
  children.sort((a, b) => (
    (a.child.surfaceIndex ?? 0) - (b.child.surfaceIndex ?? 0)
    || a.segment.id.localeCompare(b.segment.id)
  ))
  if (hasSurfaceChildren && children.some((value, index) => value.child.surfaceIndex !== index)) {
    return null
  }

  const geometry: IcelandRoadGraphPoint[] = []
  const edgeBindings: GraphEdgeBinding[] = []
  for (const { segment } of children) {
    if (segment.sourceId !== sourceId || segment.geometry.length < 2) return null
    if (geometry.length === 0) geometry.push(...segment.geometry)
    else {
      if (!samePoint(geometry[geometry.length - 1], segment.geometry[0])) return null
      geometry.push(...segment.geometry.slice(1))
    }
    for (let edgeIndex = 0; edgeIndex + 1 < segment.geometry.length; edgeIndex += 1) {
      edgeBindings.push({ segmentId: segment.id, sourceId, edgeIndex })
    }
  }
  if (geometry.length < 2 || edgeBindings.length !== geometry.length - 1) return null

  const first = children[0].segment
  const last = children[children.length - 1].segment
  return {
    topology: {
      id: sourceId,
      sourceFeatureId: sourceId,
      officialSection: {
        authority: 'vegagerdin',
        datasetId: `vegagerdin:vegakerfi:layer-${official.sourceLayerId}`,
        roadNumber,
        sectionNumber: official.sectionNumber,
      },
      geometry: geometry.map(topologyPoint),
      endpointLabels: {
        start: official.sectionStartLabel ?? null,
        end: official.sectionEndLabel ?? null,
      },
      networkRole: 'assessment',
      roadPart: String(official.roadPartCode),
      direction,
      lifecycle: 'active',
      eligibleRoutingProfiles: [MOTOR_VEHICLE_PROFILE],
    },
    startGraphSegment: first,
    endGraphSegment: last,
    edgeBindings,
  }
}

function topologyPolicy(
  sections: readonly AggregatedOfficialSection[],
  artifact: VegagerdinRoadTopologyArtifactInput,
  policyId: VegagerdinTopologyReconciliationPolicyId,
): RoadTopologyReconciliationPolicy {
  const datasetIds = [...new Set(sections.map(section => section.topology.officialSection.datasetId))]
    .sort()
  const roadParts = [...new Set(sections.map(section => section.topology.roadPart))].sort()
  const provenance: RoadTopologyArtifactEvidence = {
    artifactId: artifact.artifactId,
    contentSha256: artifact.contentSha256,
    validationReportId: artifact.validationReportId,
    numericCeilingRationale: policyId === VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V4
      ? 'The 50 m repair window remains bounded above the unchanged 20 m node snap. A deferred one-sided gap requires a unique named target endpoint already attested as a hub by an independent reciprocal or exact-endpoint receipt, source alignment within 35 degrees, target crossing between 45 and 135 degrees, reliable elevation within 5 m when known, and fail-closed third-party safeguards.'
      : policyId === VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V3
        ? 'The 50 m repair window remains bounded above the unchanged 20 m node snap. Unique reciprocal endpoint gaps must stay inside both road-end forward half-planes (at most 90 degrees), while one-sided references require one exact target endpoint or interior vertex within 1 mm. Reliable elevation and third-party crossing safeguards remain fail-closed.'
      : policyId === VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V2
        ? 'Non-zero repairs retain the 50 m reciprocal-reference ceiling. One-sided official references are accepted only at one unique interior target vertex within a 1 mm horizontal tolerance.'
        : 'A 50 m repair window is bounded above the unchanged 20 m endpoint snap and is accepted only with unique reciprocal official section references plus geometry safeguards.',
  }
  return {
    policyId,
    requiredRoutingProfile: MOTOR_VEHICLE_PROFILE,
    eligibleTargetDatasetIds: datasetIds,
    eligibleTargetRoles: ['assessment'],
    eligibleTargetRoadParts: roadParts,
    compatibleNetworkRolePairs: [],
    compatibleRoadPartPairs: [],
    maximumGapDistanceM: VEGAGERDIN_TOPOLOGY_MAXIMUM_GAP_M,
    projectionTieToleranceM: 0.05,
    endpointClearanceM: 1,
    maximumElevationDifferenceM: 5,
    minimumCrossingAngleDeg: 45,
    minimumGapForHeadingCheckM: 0.5,
    maximumGapApproachDifferenceDeg: 35,
    allowSourceAttestedExactInteriorVertex:
      policyId !== VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V1,
    allowSourceAttestedExactTargetEndpoint:
      policyId === VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V3
      || policyId === VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V4,
    allowSourceAttestedHubEndpointGap:
      policyId === VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V4,
    useReliableElevationForEndpointJunctions:
      policyId === VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V3
      || policyId === VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V4,
    reciprocalReferenceTargetsEndpoint:
      policyId === VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V3
      || policyId === VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V4,
    maximumEndpointJunctionTurnDeg: 90,
    exactVertexToleranceM: VEGAGERDIN_TOPOLOGY_EXACT_VERTEX_TOLERANCE_M,
    artifact: provenance,
  }
}

function requiresExplicitConnector(
  receipt: SourceAttestedJunctionGapReceipt,
  nodeSnapToleranceM: number,
): boolean {
  if (receipt.connector.lengthM > nodeSnapToleranceM + DISTANCE_EPSILON_M) return true
  const nearestTargetEndpointDistanceM = Math.min(
    receipt.targetSplit.distanceFromStartM,
    receipt.targetSplit.distanceToEndM,
  )
  // A projection that is effectively part of an already-snappable endpoint
  // must not split the target segment. The normal graph endpoint resolver will
  // connect these sections without introducing a second, almost-identical
  // node that can sever the target road. Genuine interior joins and gaps that
  // exceed the normal snap tolerance still require an explicit connector.
  return receipt.connector.lengthM + nearestTargetEndpointDistanceM
    > nodeSnapToleranceM + DISTANCE_EPSILON_M
}

/**
 * Adapts surface-split graph children to one official section, reconciles only
 * structured reciprocal endpoint references, and maps every accepted receipt
 * back to exact graph child/edge identities. No place, coordinate or section
 * allow-list participates in the decision.
 */
export function reconcileVegagerdinRoadGraphTopology(input: {
  segments: readonly IcelandRoadGraphSegmentInput[]
  nodeSnapToleranceM: number
  artifact: VegagerdinRoadTopologyArtifactInput
  policyId?: VegagerdinTopologyReconciliationPolicyId
}): VegagerdinRoadGraphTopologyResult {
  if (!Number.isFinite(input.nodeSnapToleranceM) || input.nodeSnapToleranceM <= 0) {
    throw new Error('invalid_vegagerdin_topology_node_snap_tolerance')
  }
  const policyId = input.policyId ?? VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID
  const grouped = new Map<string, IcelandRoadGraphSegmentInput[]>()
  for (const segment of input.segments) {
    const existing = grouped.get(segment.sourceId) ?? []
    existing.push(segment)
    grouped.set(segment.sourceId, existing)
  }
  const sections = [...grouped.entries()]
    .map(([sourceId, segments]) => aggregateOfficialSection(sourceId, segments))
    .filter((value): value is AggregatedOfficialSection => value !== null)
    .sort((a, b) => a.topology.id.localeCompare(b.topology.id))
  if (sections.length === 0) {
    return {
      policyId, candidates: [], receipts: [], bindings: [], sectionLedger: [],
      topologySegmentCount: 0,
    }
  }

  const reconciliation = reconcileSourceAttestedJunctionGaps(
    sections.map(section => section.topology),
    topologyPolicy(
      sections,
      input.artifact,
      policyId,
    ),
  )
  const byTopologyId = new Map(sections.map(section => [section.topology.id, section]))
  const bindings: IcelandRoadGraphTopologyReceiptBinding[] = []
  for (const receipt of reconciliation.receipts) {
    if (!requiresExplicitConnector(receipt, input.nodeSnapToleranceM)) continue
    const source = byTopologyId.get(receipt.sourceSegmentId)
    const target = byTopologyId.get(receipt.targetSegmentId)
    const targetEdge = target?.edgeBindings[receipt.targetSplit.edgeIndex]
    if (!source || !target || !targetEdge) continue
    const sourceGraphSegment = receipt.sourceEndpoint === 'start'
      ? source.startGraphSegment
      : source.endGraphSegment
    bindings.push({
      receipt,
      sourceGraph: {
        segmentId: sourceGraphSegment.id,
        sourceId: sourceGraphSegment.sourceId,
        endpoint: receipt.sourceEndpoint,
      },
      targetGraph: {
        segmentId: targetEdge.segmentId,
        sourceId: targetEdge.sourceId,
        topologyEdgeIndex: receipt.targetSplit.edgeIndex,
        edgeIndex: targetEdge.edgeIndex,
        edgeFraction: receipt.targetSplit.edgeFraction,
      },
    })
  }

  return {
    policyId,
    candidates: reconciliation.candidates,
    receipts: reconciliation.receipts,
    bindings: bindings.sort((a, b) => a.receipt.id.localeCompare(b.receipt.id)),
    sectionLedger: sections.map(section => ({
      topologySegmentId: section.topology.id,
      sourceFeatureId: section.topology.sourceFeatureId,
      officialSection: section.topology.officialSection,
      graphEdges: section.edgeBindings,
    })),
    topologySegmentCount: sections.length,
  }
}
