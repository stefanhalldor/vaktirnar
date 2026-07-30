import type { LatLon } from './types'

export type IcelandRoadSurface = 'paved' | 'gravel' | 'mixed' | 'unknown'

export type IcelandRoadClass =
  | 'trunk'
  | 'highland_trunk'
  | 'connector'
  | 'district'
  | 'local'
  | 'ferry'
  | 'other'

/**
 * `unknown` is deliberately not treated as two-way. The graph builder only
 * emits routable edges for an explicitly attested direction.
 */
export type IcelandRoadDirection = 'both' | 'forward' | 'reverse' | 'unknown'

/** Source truth for routing direction. Inference never changes this value. */
export type IcelandRoadDirectionStatus =
  | 'authoritative_both'
  | 'authoritative_forward'
  | 'authoritative_reverse'
  | 'unknown_missing'
  | 'unknown_domain_drift'

/** Audits how the raw official STEFNA field was represented in the source row. */
export type IcelandRoadDirectionFieldState = 'missing' | 'null' | 'integer' | 'invalid'

/**
 * `provisional` is a routing-only interpretation of an official missing/NULL
 * direction. It never upgrades the official source truth and is deliberately
 * kept out of verified direction presentation.
 */
export type IcelandRoadDirectionBasis = 'authoritative' | 'inferred' | 'provisional'

export type IcelandRoadNetworkRole = 'assessment_public' | 'access_connector'

/**
 * A graph-only topology connector is deliberately not a source network role.
 * It exists solely because a validated reconciliation receipt bridged a small
 * source-attested geometry gap.
 */
export type IcelandRoadGraphEdgeRole = 'source_segment' | 'topology_connector'

export type IcelandRoadSourceClassification = IcelandRoadNetworkRole | 'excluded'

export interface IcelandRoadGraphPoint extends LatLon {
  /** Optional source elevation (ArcGIS Z), in metres. */
  elevationM?: number
}

/**
 * Source-attested identifiers used to audit topology and eligibility. These
 * values are facts from the official row; inferred routing facts belong
 * elsewhere.
 */
export interface IcelandRoadOfficialSegmentMetadata {
  provider: 'vegagerdin'
  sourceLayerId: 6 | 8
  sourceObjectId: number
  sectionId: number
  sectionNumber?: string
  sectionStartLabel?: string
  sectionEndLabel?: string
  roadPartCode: number
  roadPartNumber?: string
  ownerCode: number
  roadClassCode: number
  roadType?: string
  /** Raw official code; non-domain values remain auditable and route as unknown. */
  directionCode: number | null
  /** Required for schema-v2 official rows; optional only at the v1 compatibility boundary. */
  directionFieldState?: IcelandRoadDirectionFieldState
  inUseFromEpochMs: number
  outOfUseAtEpochMs: number
  sourceUpdatedAtEpochMs?: number
}

export type IcelandRoadSpeedSource = 'official' | 'derived'

export interface IcelandRoadGraphSegmentInput {
  id: string
  source: 'vegagerdin' | 'teskeid_fixture'
  sourceId: string
  geometry: readonly IcelandRoadGraphPoint[]
  lengthM?: number
  roadNumber?: string
  roadName?: string
  roadClass: IcelandRoadClass
  surface: IcelandRoadSurface
  direction: IcelandRoadDirection
  /** Required for official schema-v2 rows; source truth remains unknown after inference. */
  directionStatus?: IcelandRoadDirectionStatus
  speedKmh?: number
  speedSource?: IcelandRoadSpeedSource
  isFRoad?: boolean
  isMountainRoad?: boolean
  isSeasonal?: boolean
  /** Required for official schema-v2 snapshots; optional for v1 and fixtures. */
  networkRole?: IcelandRoadNetworkRole
  /** Required for official schema-v2 snapshots; optional for v1 and fixtures. */
  official?: IcelandRoadOfficialSegmentMetadata
}

/**
 * Structural form for a separately produced assertion that one exact semantic
 * source row may be traversed both ways. It is not provenance truth until a
 * trusted ingestion boundary verifies the referenced bytes and exact claim.
 * The content hash and id are derived from all other fields; official truth is
 * never rewritten.
 */
export interface IcelandRoadDirectionInferenceAttestationV1 {
  schemaVersion: 1
  kind: 'inferred_both'
  attestationId: string
  contentSha256: string
  segmentSourceId: string
  sourceProvenanceKey: string
  policyId: string
  policyVersion: string
  generatorId: string
  generatorVersion: string
  evidenceArtifactId: string
  evidenceContentSha256: string
  confidenceBps: number
  validFromIso: string
  expiresAtIso: string
}

export interface IcelandRoadDirectionInferencePolicyV1 {
  schemaVersion: 1
  policyId: string
  policyVersion: string
  generatorId: string
  generatorVersion: string
  minimumConfidenceBps: number
}

/** Structural registry metadata; trusted ingestion must still verify the bytes. */
export interface IcelandRoadDirectionEvidenceArtifactV1 {
  schemaVersion: 1
  artifactId: string
  datasetId: string
  datasetVersion: string
  sourceUrl: string
  effectiveAtIso: string
  contentSha256: string
  policyId: string
  policyVersion: string
  generatorId: string
  generatorVersion: string
  licenseReviewId: string
}

export interface IcelandRoadGraphNode {
  id: string
  point: LatLon
}

export interface IcelandRoadGraphEdge {
  id: string
  segmentId: string
  fromNodeId: string
  toNodeId: string
  geometry: readonly LatLon[]
  lengthM: number
  travelTimeS: number
  speedKmh: number
  speedSource: IcelandRoadSpeedSource
  roadNumber?: string
  roadName?: string
  roadClass: IcelandRoadClass
  surface: IcelandRoadSurface
  isFRoad: boolean
  isMountainRoad: boolean
  isSeasonal: boolean
  /** `undefined` remains compatible with legacy v1 in-memory fixtures. */
  graphRole?: IcelandRoadGraphEdgeRole
  /** Source classification; never contains the graph-only topology role. */
  sourceNetworkRole?: IcelandRoadNetworkRole
  /** @deprecated Compatibility alias for existing v1 consumers. */
  networkRole?: IcelandRoadNetworkRole
  official?: IcelandRoadOfficialSegmentMetadata
  /** Absent only for legacy v1/fixture edges and graph-only topology connectors. */
  directionBasis?: IcelandRoadDirectionBasis
  directionStatus?: IcelandRoadDirectionStatus
  /** Present only when `directionBasis` is `inferred`. */
  directionInference?: IcelandRoadDirectionInferenceAttestationV1
  /** Exact policy used to accept `directionInference`. */
  directionInferencePolicy?: IcelandRoadDirectionInferencePolicyV1
  /** Exact structural registry metadata; trusted byte ingestion remains gated. */
  directionEvidenceArtifact?: IcelandRoadDirectionEvidenceArtifactV1
  assessmentEligible?: boolean
  topologyReceiptId?: string
  topologyDirectionAttested?: true
  topologyProvenanceKey?: string
}

export interface IcelandRoadGraph {
  nodes: ReadonlyMap<string, IcelandRoadGraphNode>
  edges: readonly IcelandRoadGraphEdge[]
  outgoing: ReadonlyMap<string, readonly IcelandRoadGraphEdge[]>
  /** Accepted receipt ids; absent on manually constructed legacy graphs. */
  topologyReceiptIds?: readonly string[]
  /** Accepted inference ids; absent on legacy manually constructed graphs. */
  directionAttestationIds?: readonly string[]
}

export interface IcelandRoadGraphDiagnostics {
  nodeCount: number
  edgeCount: number
  segmentCount: number
  weakComponentCount: number
  largestWeakComponentNodeCount: number
  isolatedNodeCount: number
  surfaceEdgeCounts: Record<IcelandRoadSurface, number>
  derivedSpeedEdgeCount: number
  topologyConnectorEdgeCount?: number
}

export type IcelandRoadRoutingObjective = 'fastest' | 'shortest'

export interface IcelandRoadRoutingProfile {
  objective: IcelandRoadRoutingObjective
  requirePaved?: boolean
  avoidFRoads?: boolean
  avoidMountainRoads?: boolean
  gravelPenaltyFactor?: number
  mountainPenaltyFactor?: number
}

export interface IcelandRoadSurfaceBreakdown {
  pavedM: number
  gravelM: number
  mixedM: number
  unknownM: number
}

export interface IcelandRoadRouteEvidencePortion {
  edgeId: string
  segmentId: string
  /** Exact traversal range along the complete ordered route, including any gap connectors. */
  startDistanceM: number
  endDistanceM: number
  distanceM: number
  geometry: readonly LatLon[]
  roadNumber?: string
  roadName?: string
}

export interface IcelandRoadGravelPortion extends IcelandRoadRouteEvidencePortion {
  surface: 'gravel'
}

export interface IcelandRoadInferredDirectionPortion extends IcelandRoadRouteEvidencePortion {
  attestationId: string
}

export interface IcelandRoadGraphRoute {
  nodeIds: readonly string[]
  edgeIds: readonly string[]
  segmentIds: readonly string[]
  geometry: readonly LatLon[]
  distanceM: number
  durationS: number
  surface: IcelandRoadSurfaceBreakdown
  derivedSpeedDistanceM: number
  fRoadDistanceM: number
  fRoadNumbers: readonly string[]
  /** Graph-only connectors are excluded from public edge/segment truth above. */
  topologyConnectorIds: readonly string[]
  assessedDistanceM: number
  unassessedConnectorDistanceM: number
  authoritativeDirectionDistanceM: number
  inferredDirectionDistanceM: number
  /** Active v1/fixtures have no schema-v2 direction evidence. */
  legacyDirectionDistanceM: number
  directionAttestationIds: readonly string[]
  /** Exact assessed gravel portions in route traversal order. */
  gravelPortions: readonly IcelandRoadGravelPortion[]
  /** Exact inferred portions in route traversal order. */
  inferredDirectionPortions: readonly IcelandRoadInferredDirectionPortion[]
}

export type IcelandRoadGraphRouteResult =
  | {
      status: 'ok'
      route: IcelandRoadGraphRoute
      snappedOriginNodeId: string
      snappedDestinationNodeId: string
      originSnapDistanceM: number
      destinationSnapDistanceM: number
    }
  | {
      status: 'no_nearby_node' | 'no_route'
    }
