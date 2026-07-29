import 'server-only'

import type { RouteOption } from '@/lib/weather/provider.types'
import { rdpSimplifyToMaxPoints } from '@/lib/weather/providerRouteMatching'
import { matchRouteCautions } from '@/lib/weather/routeCautions'
import { buildIcelandRoadGraphRouteFromEdges } from './roadGraph'
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
  )
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

export function resolveTeskeidAssessmentRouteEvidence(input: {
  graph: IcelandRoadGraph
  origin: Point
  destination: Point
  assessmentScopeId: string
  includeAlternatives: boolean
  alternativeDeadlineAtMs?: number
}): TeskeidAssessmentRouteEvidenceOutcome {
  const anchors = findRouteAssessmentRoadAnchors(
    input.graph,
    { kind: 'trusted_anchor', point: input.origin },
    { kind: 'trusted_anchor', point: input.destination },
    {
      maxOriginSnapDistanceM: ROUTE_ASSESSMENT_ANCHOR_REDERIVATION_TOLERANCE_M,
      maxDestinationSnapDistanceM: ROUTE_ASSESSMENT_ANCHOR_REDERIVATION_TOLERANCE_M,
      maxAlternatives: input.includeAlternatives ? 4 : 0,
      maxAlternativeOverlap: 0.94,
      alternativeDeadlineAtMs: input.alternativeDeadlineAtMs,
    },
  )
  if (anchors.status !== 'ok') return { status: 'unavailable', evidence: [] }

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

  const primaryRoute = buildIcelandRoadGraphRouteFromEdges(anchors.connectedRoadEdges)
  if (!validRoute(primaryRoute)) return { status: 'unavailable', evidence: [] }
  const evidence: TeskeidAssessmentRouteEvidence[] = [{
    route: roadGraphRouteToTeskeidOption(
      primaryRoute,
      anchors.origin.point,
      anchors.destination.point,
      0,
      anchors.origin.snapDistanceM,
      anchors.destination.snapDistanceM,
      TESKEID_ROUTE_CANDIDATE_ID,
    ),
    connectedRoadEdges: anchors.connectedRoadEdges,
    routeProvenanceFingerprint: anchors.routeProvenanceFingerprint,
  }]

  for (const [alternativeIndex, alternative] of anchors.alternatives.entries()) {
    const route = buildIcelandRoadGraphRouteFromEdges(alternative.connectedRoadEdges)
    if (!validRoute(route)) return { status: 'unavailable', evidence: [] }
    evidence.push({
      route: roadGraphRouteToTeskeidOption(
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
      ),
      connectedRoadEdges: alternative.connectedRoadEdges,
      routeProvenanceFingerprint: alternative.routeProvenanceFingerprint,
    })
  }
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
