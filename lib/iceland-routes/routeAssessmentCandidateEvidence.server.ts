import 'server-only'

import type { RouteOption } from '@/lib/weather/provider.types'
import { rdpSimplifyToMaxPoints } from '@/lib/weather/providerRouteMatching'
import { matchRouteCautions } from '@/lib/weather/routeCautions'
import {
  buildIcelandRoadGraphRouteFromEdges,
  haversineDistanceM,
  ICELAND_ROUTING_PROFILES,
  icelandRoadGraphEdgeCost,
} from './roadGraph'
import type {
  IcelandRoadGraph,
  IcelandRoadGraphEdge,
  IcelandRoadGraphRoute,
} from './roadGraphTypes'
import { findRouteAssessmentRoadAnchors } from './routeAssessmentRoadAnchor.server'
import {
  createTeskeidAssessmentAlternativeRouteId,
  TESKEID_ROUTE_CANDIDATE_ID,
  TESKEID_ROUTE_CANDIDATE_ID_PREFIX,
} from './routeAssessmentCandidateIdentity.server'
import {
  createRouteAssessmentScopeId,
  ROUTE_ASSESSMENT_ANCHOR_REDERIVATION_TOLERANCE_M,
} from './routeAssessmentScopeId.server'

const TESKEID_TRANSPORT_RDP_EPSILON_M = 3
const TESKEID_TRANSPORT_MAX_POINTS = 1_000
const TESKEID_ROUTE_ENDPOINT_TOLERANCE_M = 1
const TESKEID_ROUTE_MAX_CONNECTED_GEOMETRY_GAP_M = 50
const TESKEID_ROUTE_EXACT_TOPOLOGY_CONNECTOR_TOLERANCE_M = 0.001
const TESKEID_ROUTE_METRIC_TOLERANCE = 0.500001
const TESKEID_ROUTE_COST_TOLERANCE = 1e-6

type Point = { lat: number; lon: number }

export type TeskeidAssessmentRouteEvidence = Readonly<{
  route: RouteOption
  connectedRoadEdges: readonly IcelandRoadGraphEdge[]
  routeProvenanceFingerprint: string
}>

export type TeskeidAssessmentRouteEvidenceOutcome =
  | Readonly<{
      status: 'ready'
      evidence: readonly TeskeidAssessmentRouteEvidence[]
      originSnapDistanceM: number
      destinationSnapDistanceM: number
    }>
  | Readonly<{ status: 'incomplete' | 'unavailable'; evidence: readonly [] }>

export function roadGraphRouteToTeskeidOption(
  route: IcelandRoadGraphRoute,
  origin: Point,
  destination: Point,
  index: number,
  originSnapDistanceM: number,
  destinationSnapDistanceM: number,
  routeId?: string,
): RouteOption {
  const labels = ['TESKEID_EXPERIMENTAL', 'TESKEID_DERIVED_DURATION']
  if (index > 0) labels.push('TESKEID_ALTERNATIVE')
  if (route.surface.gravelM > 0) labels.push('TESKEID_GRAVEL')
  if (route.surface.mixedM > 0) labels.push('TESKEID_MIXED_SURFACE')
  if (route.surface.unknownM > 0) labels.push('TESKEID_UNKNOWN_SURFACE')
  if (originSnapDistanceM > 1_000 || destinationSnapDistanceM > 1_000) {
    labels.push('TESKEID_LONG_SNAP')
  }
  const transportPoints = rdpSimplifyToMaxPoints(
    route.geometry,
    TESKEID_TRANSPORT_RDP_EPSILON_M,
    TESKEID_TRANSPORT_MAX_POINTS,
  ).map(point => ({ lat: point.lat, lon: point.lon }))
  const cautions = matchRouteCautions(
    transportPoints,
    { placeId: 'origin', displayName: 'origin', formattedAddress: 'origin', ...origin },
    { placeId: 'destination', displayName: 'destination', formattedAddress: 'destination', ...destination },
    { evidencePointsOnly: true },
  )
  return {
    id: routeId
      ?? (index === 0 ? TESKEID_ROUTE_CANDIDATE_ID : `${TESKEID_ROUTE_CANDIDATE_ID_PREFIX}${index}`),
    routeIndex: -(index + 1),
    provider: 'teskeid',
    labels,
    isDefault: false,
    points: transportPoints,
    distanceM: route.distanceM,
    durationS: route.durationS,
    cautions,
    experimental: {
      derivedDuration: true,
      surface: route.surface,
      ...(route.fRoadDistanceM > 0
        ? { fRoad: { distanceM: route.fRoadDistanceM, roadNumbers: [...route.fRoadNumbers] } }
        : {}),
    },
  }
}

function validRoute(route: IcelandRoadGraphRoute): boolean {
  return route.geometry.length >= 2 && route.distanceM > 0 && route.durationS > 0
}

function routeEdgeCost(edges: readonly IcelandRoadGraphEdge[]): number {
  return edges.reduce((sum, edge) => (
    sum + icelandRoadGraphEdgeCost(edge, ICELAND_ROUTING_PROFILES.fastestCar)
  ), 0)
}

/**
 * Exact official T-junctions deliberately use two distinct graph nodes at the
 * same physical point and join them with a zero-cost topology edge. Accept
 * that edge only when every graph-builder receipt marker is present and the
 * geometry is still exact; ordinary zero-length road edges remain invalid.
 */
function isAttestedExactTopologyConnector(edge: IcelandRoadGraphEdge): boolean {
  const start = edge.geometry[0]
  const end = edge.geometry[1]
  return edge.geometry.length === 2
    && Boolean(start && end)
    && edge.fromNodeId !== edge.toNodeId
    && edge.lengthM === 0
    && edge.travelTimeS === 0
    && edge.graphRole === 'topology_connector'
    && edge.assessmentEligible === false
    && edge.topologyDirectionAttested === true
    && typeof edge.topologyReceiptId === 'string'
    && edge.topologyReceiptId.length > 0
    && edge.segmentId === `${edge.topologyReceiptId}:connector`
    && typeof edge.topologyProvenanceKey === 'string'
    && edge.topologyProvenanceKey.length > 0
    && edge.id.startsWith(
      `${edge.segmentId}:${encodeURIComponent(edge.topologyProvenanceKey)}:`,
    )
    && edge.speedSource === 'derived'
    && edge.roadClass === 'other'
    && edge.surface === 'unknown'
    && edge.official === undefined
    && edge.sourceNetworkRole === undefined
    && edge.networkRole === undefined
    && haversineDistanceM(start, end)
      <= TESKEID_ROUTE_EXACT_TOPOLOGY_CONNECTOR_TOLERANCE_M
}

/**
 * Rejects a route before publication if its ordered graph evidence no longer
 * describes one continuous path between the signed assessment anchors.
 */
export function teskeidAssessmentRouteEdgesHaveIntegrity(input: {
  connectedRoadEdges: readonly IcelandRoadGraphEdge[]
  origin: Point
  destination: Point
}): boolean {
  const { connectedRoadEdges, origin, destination } = input
  if (connectedRoadEdges.length === 0) return false
  const edgeIds = new Set<string>()
  let distanceM = 0
  let durationS = 0
  for (const [index, edge] of connectedRoadEdges.entries()) {
    const start = edge.geometry[0]
    const end = edge.geometry.at(-1)
    if (
      !start
      || !end
      || edge.geometry.length < 2
      || !Number.isFinite(edge.lengthM)
      || !Number.isFinite(edge.travelTimeS)
      || (
        (edge.lengthM <= 0 || edge.travelTimeS <= 0)
        && !isAttestedExactTopologyConnector(edge)
      )
      || edgeIds.has(edge.id)
    ) return false
    edgeIds.add(edge.id)
    distanceM += edge.lengthM
    durationS += edge.travelTimeS
    if (index > 0) {
      const previous = connectedRoadEdges[index - 1]
      const previousEnd = previous.geometry.at(-1)
      if (
        !previousEnd
        || previous.toNodeId !== edge.fromNodeId
        || haversineDistanceM(previousEnd, start) > TESKEID_ROUTE_MAX_CONNECTED_GEOMETRY_GAP_M
      ) return false
    }
  }
  const first = connectedRoadEdges[0].geometry[0]
  const last = connectedRoadEdges.at(-1)?.geometry.at(-1)
  if (
    !last
    || haversineDistanceM(first, origin) > TESKEID_ROUTE_ENDPOINT_TOLERANCE_M
    || haversineDistanceM(last, destination) > TESKEID_ROUTE_ENDPOINT_TOLERANCE_M
  ) return false

  const rebuilt = buildIcelandRoadGraphRouteFromEdges(connectedRoadEdges)
  return validRoute(rebuilt)
    && Math.abs(rebuilt.distanceM - distanceM) <= TESKEID_ROUTE_METRIC_TOLERANCE
    && Math.abs(rebuilt.durationS - durationS) <= TESKEID_ROUTE_METRIC_TOLERANCE
}

function deadlineExceeded(deadlineAtMs: number | undefined): boolean {
  return deadlineAtMs !== undefined
    && Number.isFinite(deadlineAtMs)
    && Date.now() >= deadlineAtMs
}

export function resolveTeskeidAssessmentRouteEvidence(input: {
  graph: IcelandRoadGraph
  origin: Point
  destination: Point
  assessmentScopeId: string
  includeAlternatives: boolean
  /** Absolute deadline shared by primary reconstruction and evidence conversion. */
  deadlineAtMs?: number
  alternativeDeadlineAtMs?: number
}): TeskeidAssessmentRouteEvidenceOutcome {
  // Callers that predate the explicit overall deadline already pass the
  // alternative deadline. Treat it as the fail-closed overall bound too, so
  // primary reconstruction can never run unbounded on those paths.
  const deadlineAtMs = input.deadlineAtMs ?? input.alternativeDeadlineAtMs
  if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete', evidence: [] }
  const anchors = findRouteAssessmentRoadAnchors(
    input.graph,
    { kind: 'trusted_anchor', point: input.origin },
    { kind: 'trusted_anchor', point: input.destination },
    {
      maxOriginSnapDistanceM: ROUTE_ASSESSMENT_ANCHOR_REDERIVATION_TOLERANCE_M,
      maxDestinationSnapDistanceM: ROUTE_ASSESSMENT_ANCHOR_REDERIVATION_TOLERANCE_M,
      maxAlternatives: input.includeAlternatives ? 4 : 0,
      maxAlternativeOverlap: 0.94,
      deadlineAtMs,
      alternativeDeadlineAtMs: input.alternativeDeadlineAtMs,
    },
  )
  if (anchors.status === 'incomplete') return { status: 'incomplete', evidence: [] }
  if (anchors.status !== 'ok') return { status: 'unavailable', evidence: [] }
  if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete', evidence: [] }

  const rederivedScopeId = createRouteAssessmentScopeId({
    originAnchorKind: anchors.origin.kind,
    originPoint: anchors.origin.point,
    destinationAnchorKind: anchors.destination.kind,
    destinationPoint: anchors.destination.point,
    routeProvenanceFingerprint: anchors.routeProvenanceFingerprint,
  })
  if (rederivedScopeId !== input.assessmentScopeId) {
    return { status: 'unavailable', evidence: [] }
  }
  if (input.includeAlternatives && !anchors.alternativesComplete) {
    return { status: 'incomplete', evidence: [] }
  }

  if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete', evidence: [] }
  if (!teskeidAssessmentRouteEdgesHaveIntegrity({
    connectedRoadEdges: anchors.connectedRoadEdges,
    origin: anchors.origin.point,
    destination: anchors.destination.point,
  })) return { status: 'unavailable', evidence: [] }
  const primaryRoute = buildIcelandRoadGraphRouteFromEdges(anchors.connectedRoadEdges)
  if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete', evidence: [] }
  if (!validRoute(primaryRoute)) return { status: 'unavailable', evidence: [] }
  const primaryOption = roadGraphRouteToTeskeidOption(
    primaryRoute,
    anchors.origin.point,
    anchors.destination.point,
    0,
    anchors.origin.snapDistanceM,
    anchors.destination.snapDistanceM,
    TESKEID_ROUTE_CANDIDATE_ID,
  )
  if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete', evidence: [] }
  const evidence: TeskeidAssessmentRouteEvidence[] = [{
    route: primaryOption,
    connectedRoadEdges: anchors.connectedRoadEdges,
    routeProvenanceFingerprint: anchors.routeProvenanceFingerprint,
  }]
  const primaryCost = routeEdgeCost(anchors.connectedRoadEdges)
  const routeFingerprints = new Set([anchors.routeProvenanceFingerprint])
  const routeEdgeKeys = new Set([
    anchors.connectedRoadEdges.map(edge => edge.id).join('|'),
  ])

  for (const [alternativeIndex, alternative] of anchors.alternatives.entries()) {
    if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete', evidence: [] }
    const edgeKey = alternative.connectedRoadEdges.map(edge => edge.id).join('|')
    if (
      routeFingerprints.has(alternative.routeProvenanceFingerprint)
      || routeEdgeKeys.has(edgeKey)
      || !teskeidAssessmentRouteEdgesHaveIntegrity({
        connectedRoadEdges: alternative.connectedRoadEdges,
        origin: anchors.origin.point,
        destination: anchors.destination.point,
      })
      || routeEdgeCost(alternative.connectedRoadEdges) < primaryCost - TESKEID_ROUTE_COST_TOLERANCE
    ) return { status: 'unavailable', evidence: [] }
    routeFingerprints.add(alternative.routeProvenanceFingerprint)
    routeEdgeKeys.add(edgeKey)
    const route = buildIcelandRoadGraphRouteFromEdges(alternative.connectedRoadEdges)
    if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete', evidence: [] }
    if (!validRoute(route)) return { status: 'unavailable', evidence: [] }
    const option = roadGraphRouteToTeskeidOption(
      route,
      anchors.origin.point,
      anchors.destination.point,
      alternativeIndex + 1,
      anchors.origin.snapDistanceM,
      anchors.destination.snapDistanceM,
      createTeskeidAssessmentAlternativeRouteId(
        alternativeIndex + 1,
        alternative.routeProvenanceFingerprint,
      ),
    )
    if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete', evidence: [] }
    evidence.push({
      route: option,
      connectedRoadEdges: alternative.connectedRoadEdges,
      routeProvenanceFingerprint: alternative.routeProvenanceFingerprint,
    })
  }
  if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete', evidence: [] }
  return {
    status: 'ready',
    evidence,
    originSnapDistanceM: anchors.origin.snapDistanceM,
    destinationSnapDistanceM: anchors.destination.snapDistanceM,
  }
}

function exactPoints(
  left: readonly Point[] | undefined,
  right: readonly Point[] | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right
  return left.length === right.length && left.every((point, index) => (
    point.lat === right[index].lat && point.lon === right[index].lon
  ))
}

/** Strictly binds signed route geometry and metrics to regenerated graph evidence. */
export function teskeidAssessmentEvidenceMatchesSignedRoute(
  evidence: TeskeidAssessmentRouteEvidence,
  signedRoute: RouteOption,
): boolean {
  return signedRoute.provider === 'teskeid'
    && signedRoute.id === evidence.route.id
    && signedRoute.routeIndex === evidence.route.routeIndex
    && signedRoute.distanceM === evidence.route.distanceM
    && signedRoute.durationS === evidence.route.durationS
    && exactPoints(signedRoute.points, evidence.route.points)
    && exactPoints(signedRoute.providerMatchingPoints, evidence.route.providerMatchingPoints)
}
