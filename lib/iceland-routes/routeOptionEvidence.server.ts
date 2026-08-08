import 'server-only'

import {
  buildIcelandRoadGraphRouteFromEdges,
} from './roadGraph'
import type {
  IcelandRoadGraph,
  IcelandRoadGraphEdge,
  IcelandRoadGraphRoute,
} from './roadGraphTypes'
import {
  teskeidAssessmentRouteEdgesHaveIntegrity,
  type TeskeidAssessmentRouteEvidence,
} from './routeAssessmentCandidateEvidence.server'
import {
  createRouteAssessmentRouteProvenanceFingerprint,
  restoreRouteAssessmentEdgeSlice,
} from './routeAssessmentRoadAnchor.server'
import type {
  RouteEnvelopeEndpoint,
  RouteOptionEvidenceV1,
} from './routeOptionEnvelope.server'
import { ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT } from './roadGraphSnapshotFormat'

const MAX_BOUND_EDGE_COUNT = 10_000
const ROUTE_PROVENANCE_FINGERPRINT_PATTERN = /^[A-Za-z0-9_-]{43}$/

type BoundRouteEvidenceInput = Readonly<{
  origin: RouteEnvelopeEndpoint
  destination: RouteEnvelopeEndpoint
  evidence: TeskeidAssessmentRouteEvidence
}>

export type RestoredRouteOptionEvidence = Readonly<{
  connectedRoadEdges: readonly IcelandRoadGraphEdge[]
  route: IcelandRoadGraphRoute
}>

function validAnchorKind(value: unknown): value is RouteOptionEvidenceV1['originAnchorKind'] {
  return value === 'settlement_node' || value === 'projected_road'
}

function recomputedProvenanceFingerprint(
  claim: RouteOptionEvidenceV1,
  origin: RouteEnvelopeEndpoint,
  destination: RouteEnvelopeEndpoint,
  connectedRoadEdges: readonly IcelandRoadGraphEdge[],
): string {
  return createRouteAssessmentRouteProvenanceFingerprint({
    origin: { kind: claim.originAnchorKind, point: origin },
    destination: { kind: claim.destinationAnchorKind, point: destination },
    connectedRoadEdges,
  })
}

/**
 * Creates the compact claim that is signed together with a route option.
 * The claim contains graph identities only; no display names, exact user
 * locations, road geometry, or other client-originated metadata are copied.
 */
export function createRouteOptionEvidenceClaim(
  input: BoundRouteEvidenceInput,
): RouteOptionEvidenceV1 | null {
  const { evidence, origin, destination } = input
  if (
    evidence.connectedRoadEdges.length === 0
    || evidence.connectedRoadEdges.length > MAX_BOUND_EDGE_COUNT
    || !ROUTE_PROVENANCE_FINGERPRINT_PATTERN.test(evidence.routeProvenanceFingerprint)
    || !validAnchorKind(evidence.originAnchorKind)
    || !validAnchorKind(evidence.destinationAnchorKind)
    || !teskeidAssessmentRouteEdgesHaveIntegrity({
      connectedRoadEdges: evidence.connectedRoadEdges,
      origin,
      destination,
    })
  ) return null

  const claim: RouteOptionEvidenceV1 = {
    graphBuildPolicyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT,
    routeProvenanceFingerprint: evidence.routeProvenanceFingerprint,
    originAnchorKind: evidence.originAnchorKind,
    destinationAnchorKind: evidence.destinationAnchorKind,
    edgeIds: evidence.connectedRoadEdges.map(edge => edge.id),
    nodeIds: [
      evidence.connectedRoadEdges[0].fromNodeId,
      ...evidence.connectedRoadEdges.map(edge => edge.toNodeId),
    ],
  }
  if (
    new Set(claim.edgeIds).size !== claim.edgeIds.length
    || recomputedProvenanceFingerprint(
      claim,
      origin,
      destination,
      evidence.connectedRoadEdges,
    ) !== claim.routeProvenanceFingerprint
  ) return null
  return claim
}

/**
 * Restores an already-routed path from the current immutable graph. This is
 * deliberately a ledger lookup, not another route or alternative search.
 */
export function restoreRouteOptionEvidence(input: Readonly<{
  graph: IcelandRoadGraph
  claim: RouteOptionEvidenceV1
  origin: RouteEnvelopeEndpoint
  destination: RouteEnvelopeEndpoint
}>): RestoredRouteOptionEvidence | null {
  const { graph, claim, origin, destination } = input
  if (
    claim.graphBuildPolicyFingerprint !== ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT
    || !ROUTE_PROVENANCE_FINGERPRINT_PATTERN.test(claim.routeProvenanceFingerprint)
    || !validAnchorKind(claim.originAnchorKind)
    || !validAnchorKind(claim.destinationAnchorKind)
    || claim.edgeIds.length === 0
    || claim.edgeIds.length > MAX_BOUND_EDGE_COUNT
    || claim.nodeIds.length !== claim.edgeIds.length + 1
    || new Set(claim.edgeIds).size !== claim.edgeIds.length
  ) return null

  const edgeById = new Map<string, IcelandRoadGraphEdge>()
  for (const edge of graph.edges) {
    if (edgeById.has(edge.id)) return null
    edgeById.set(edge.id, edge)
  }
  const connectedRoadEdges: IcelandRoadGraphEdge[] = []
  for (const [index, edgeId] of claim.edgeIds.entries()) {
    let edge = edgeById.get(edgeId)
    if (!edge) {
      const markerIndex = edgeId.lastIndexOf(':assessment:')
      if (markerIndex <= 0) return null
      const sourceEdge = edgeById.get(edgeId.slice(0, markerIndex))
      if (!sourceEdge) return null
      edge = restoreRouteAssessmentEdgeSlice(sourceEdge, edgeId) ?? undefined
    }
    if (!edge) return null
    connectedRoadEdges.push({
      ...edge,
      fromNodeId: claim.nodeIds[index],
      toNodeId: claim.nodeIds[index + 1],
    })
  }
  if (!teskeidAssessmentRouteEdgesHaveIntegrity({
    connectedRoadEdges,
    origin,
    destination,
  })) return null
  if (
    recomputedProvenanceFingerprint(claim, origin, destination, connectedRoadEdges)
      !== claim.routeProvenanceFingerprint
  ) return null

  return {
    connectedRoadEdges,
    route: buildIcelandRoadGraphRouteFromEdges(connectedRoadEdges),
  }
}
