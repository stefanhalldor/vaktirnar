import 'server-only'

import type { RouteOption } from '@/lib/weather/provider.types'

import {
  buildIcelandRoadGraphRouteFromEdges,
} from './roadGraph'
import type {
  IcelandRoadGraph,
  IcelandRoadGraphEdge,
  IcelandRoadGraphRoute,
} from './roadGraphTypes'
import {
  roadGraphRouteToTeskeidOption,
  providerNeutralCuratedLabelsForEvidence,
  teskeidAssessmentRouteEdgesHaveIntegrity,
  teskeidAssessmentEvidenceMatchesSignedRoute,
  type TeskeidAssessmentRouteEvidence,
} from './routeAssessmentCandidateEvidence.server'
import {
  createRouteAssessmentRouteProvenanceFingerprint,
  restoreRouteAssessmentEdgeSlice,
} from './routeAssessmentRoadAnchor.server'
import {
  createTeskeidAssessmentAlternativeRouteId,
  TESKEID_ROUTE_CANDIDATE_ID,
} from './routeAssessmentCandidateIdentity.server'
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

/**
 * Strictly rebinds restored graph evidence to the signed Teskeið route without
 * an unsafe cast or another route search. Labels/cautions are deliberately
 * taken from the signed option only after the graph-derived geometry and
 * metrics, labels, surface classification, F-road state, and cautions have
 * been rebuilt from the current graph. The shared strict matcher remains the
 * final geometry/provenance authority.
 */
export function restoredRouteOptionEvidenceMatchesSignedRoute(input: Readonly<{
  restored: RestoredRouteOptionEvidence
  signedRoute: RouteOption
  claim: RouteOptionEvidenceV1
  origin: RouteEnvelopeEndpoint
  destination: RouteEnvelopeEndpoint
}>): boolean {
  const { restored, signedRoute, claim, origin, destination } = input
  if (
    signedRoute.provider !== 'teskeid'
    || !Array.isArray(signedRoute.labels)
    || !validAnchorKind(claim.originAnchorKind)
    || !validAnchorKind(claim.destinationAnchorKind)
  ) return false
  const alternativeIndex = Math.abs(signedRoute.routeIndex) - 1
  const expectedRouteId = signedRoute.routeIndex === -1
    ? TESKEID_ROUTE_CANDIDATE_ID
    : Number.isInteger(alternativeIndex) && alternativeIndex >= 1 && alternativeIndex <= 4
      ? createTeskeidAssessmentAlternativeRouteId(
          alternativeIndex,
          claim.routeProvenanceFingerprint,
        )
      : null
  if (!expectedRouteId || signedRoute.id !== expectedRouteId) return false
  const authoritativeCuratedLabels = providerNeutralCuratedLabelsForEvidence({
    connectedRoadEdges: restored.connectedRoadEdges,
    origin,
    destination,
    signedLabels: signedRoute.labels,
  })
  const graphDerived = roadGraphRouteToTeskeidOption(
    restored.route,
    origin,
    destination,
    0,
    0,
    0,
    expectedRouteId,
    authoritativeCuratedLabels,
  )
  const canonicalLabels = signedRoute.routeIndex === -1
    ? graphDerived.labels
    : [...graphDerived.labels, 'TESKEID_ALTERNATIVE']
  const evidence: TeskeidAssessmentRouteEvidence = {
    route: {
      ...graphDerived,
      routeIndex: signedRoute.routeIndex,
      labels: canonicalLabels,
    },
    connectedRoadEdges: restored.connectedRoadEdges,
    routeProvenanceFingerprint: claim.routeProvenanceFingerprint,
    originAnchorKind: claim.originAnchorKind,
    destinationAnchorKind: claim.destinationAnchorKind,
  }
  return teskeidAssessmentEvidenceMatchesSignedRoute(evidence, signedRoute)
    && exactRouteExperimental(graphDerived.experimental, signedRoute.experimental)
    && exactUniqueStringSet(canonicalLabels, signedRoute.labels)
    && exactRouteCautions(graphDerived.cautions, signedRoute.cautions)
}

function exactUniqueStringSet(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  return leftSet.size === left.length
    && rightSet.size === right.length
    && leftSet.size === rightSet.size
    && left.every(value => rightSet.has(value))
}

function exactStringArray(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function exactRouteExperimental(
  left: RouteOption['experimental'],
  right: RouteOption['experimental'],
): boolean {
  if (!left || !right) return left === right
  return left.derivedDuration === right.derivedDuration
    && left.surface.pavedM === right.surface.pavedM
    && left.surface.gravelM === right.surface.gravelM
    && left.surface.mixedM === right.surface.mixedM
    && left.surface.unknownM === right.surface.unknownM
    && (
      left.fRoad === undefined || right.fRoad === undefined
        ? left.fRoad === right.fRoad
        : left.fRoad.distanceM === right.fRoad.distanceM
          && exactStringArray(left.fRoad.roadNumbers, right.fRoad.roadNumbers)
    )
}

function exactRouteCautions(
  left: RouteOption['cautions'],
  right: RouteOption['cautions'],
): boolean {
  if (left === undefined || right === undefined) return left === right
  return left.length === right.length && left.every((caution, index) => {
    const other = right[index]
    return Boolean(other)
      && caution.id === other.id
      && caution.severity === other.severity
      && caution.labelKey === other.labelKey
      && caution.summaryKey === other.summaryKey
      && caution.detailKey === other.detailKey
      && exactStringArray(caution.appliesTo, other.appliesTo)
  })
}
