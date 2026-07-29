import 'server-only'

import {
  findOfficialSettlementContainingPoint,
  type OfficialSettlementBoundary,
} from '@/lib/places/officialPlaceDirectory.server'
import type { RouteOption } from '@/lib/weather/provider.types'
import { findIcelandRoadGraphRoute, ICELAND_ROUTING_PROFILES } from './roadGraph'
import { getIcelandRoadGraph } from './roadGraphRuntime.server'
import { findRouteAssessmentRoadAnchors } from './routeAssessmentRoadAnchor.server'
import {
  createRouteAssessmentScopeId,
  ROUTE_ASSESSMENT_ANCHOR_REDERIVATION_TOLERANCE_M,
} from './routeAssessmentScopeId.server'
import {
  resolveTeskeidAssessmentRouteEvidence,
  teskeidAssessmentEvidenceMatchesSignedRoute,
} from './routeAssessmentCandidateEvidence.server'
import {
  parseTeskeidAssessmentAlternativeRouteId,
  TESKEID_ROUTE_CANDIDATE_ID,
} from './routeAssessmentCandidateIdentity.server'
import {
  resolveTrustedRouteCoverage,
  type RouteWeatherCoverage,
  type TrustedRoutePoint,
  type TrustedSettlementBoundary,
} from './trustedRouteCoverage'

const ROAD_GRAPH_COVERAGE_TIMEOUT_MS = 5_000
const ROAD_GRAPH_ENDPOINT_SEARCH_RADIUS_M = 25_000

type ResolveTrustedRouteCoverageInput = {
  origin: TrustedRoutePoint & { name: string }
  destination: TrustedRoutePoint & { name: string }
  referenceRoute: readonly TrustedRoutePoint[]
  routeDistanceM: number
  routeDurationS: number
  /** Present only after the signed route-envelope assessment claim is verified. */
  assessmentScopeId?: string | null
  /** Present only for a Teskeið route recovered from that same verified scoped envelope. */
  selectedTeskeidRoute?: RouteOption | null
}

function toTrustedSettlement(
  settlement: OfficialSettlementBoundary | null,
): TrustedSettlementBoundary | null {
  return settlement
    ? {
        id: settlement.id,
        name: settlement.name,
        geometry: settlement.geometry,
      }
    : null
}

async function withCoverageTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('road_graph_coverage_timeout')), ROAD_GRAPH_COVERAGE_TIMEOUT_MS)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Resolves a trusted, contiguous weather-assessment interval against the
 * already-selected provider geometry. It never calls a routing provider.
 */
export async function resolveTrustedRouteCoverageFromRuntime(
  input: ResolveTrustedRouteCoverageInput,
): Promise<RouteWeatherCoverage> {
  const {
    assessmentScopeId: _assessmentScopeId,
    selectedTeskeidRoute: _selectedTeskeidRoute,
    ...coverageInput
  } = input
  const hasAssessmentScopeClaim = typeof input.assessmentScopeId === 'string'
    && input.assessmentScopeId.length > 0
  const originSettlement = toTrustedSettlement(
    findOfficialSettlementContainingPoint(input.origin.lat, input.origin.lon),
  )
  const destinationSettlement = toTrustedSettlement(
    findOfficialSettlementContainingPoint(input.destination.lat, input.destination.lon),
  )

  // Same-town classification is polygon + route based and therefore needs no
  // road-graph read when the complete selected route stays inside the polygon.
  // If it exits/re-enters, continue into the graph path instead of turning the
  // empty classification-only edge list into a false no-road result.
  if (
    !hasAssessmentScopeClaim
    && originSettlement
    && destinationSettlement
    && originSettlement.id === destinationSettlement.id
  ) {
    const sameUrbanResult = resolveTrustedRouteCoverage({
      ...coverageInput,
      connectedRoadEdges: [],
      originSnapDistanceM: 0,
      destinationSnapDistanceM: 0,
      originSettlement,
      destinationSettlement,
    })
    if (sameUrbanResult.status === 'same_urban_area') return sameUrbanResult
  }

  const alternativeDeadlineAtMs = Date.now() + ROAD_GRAPH_COVERAGE_TIMEOUT_MS - 250
  try {
    const graph = await withCoverageTimeout(getIcelandRoadGraph())
    if (hasAssessmentScopeClaim) {
      if (input.selectedTeskeidRoute) {
        const isPrimary = input.selectedTeskeidRoute.id === TESKEID_ROUTE_CANDIDATE_ID
        const alternativeIdentity = parseTeskeidAssessmentAlternativeRouteId(
          input.selectedTeskeidRoute.id,
        )
        if (!isPrimary && !alternativeIdentity) {
          return { status: 'unavailable', reason: 'no_connected_official_road' }
        }
        const evidence = resolveTeskeidAssessmentRouteEvidence({
          graph,
          origin: input.origin,
          destination: input.destination,
          assessmentScopeId: input.assessmentScopeId!,
          includeAlternatives: Boolean(alternativeIdentity),
          alternativeDeadlineAtMs,
        })
        if (evidence.status !== 'ready') {
          return { status: 'unavailable', reason: 'no_connected_official_road' }
        }
        const selectedEvidence = evidence.evidence.find(candidate => (
          teskeidAssessmentEvidenceMatchesSignedRoute(candidate, input.selectedTeskeidRoute!)
        ))
        if (!selectedEvidence) {
          return { status: 'unavailable', reason: 'no_connected_official_road' }
        }
        return resolveTrustedRouteCoverage({
          ...coverageInput,
          connectedRoadEdges: selectedEvidence.connectedRoadEdges,
          originSnapDistanceM: evidence.originSnapDistanceM,
          destinationSnapDistanceM: evidence.destinationSnapDistanceM,
          originSettlement,
          destinationSettlement,
        })
      }
      const anchors = findRouteAssessmentRoadAnchors(
        graph,
        { kind: 'trusted_anchor', point: input.origin },
        { kind: 'trusted_anchor', point: input.destination },
        {
          maxOriginSnapDistanceM: ROUTE_ASSESSMENT_ANCHOR_REDERIVATION_TOLERANCE_M,
          maxDestinationSnapDistanceM: ROUTE_ASSESSMENT_ANCHOR_REDERIVATION_TOLERANCE_M,
        },
      )
      if (anchors.status !== 'ok') {
        return { status: 'unavailable', reason: 'no_connected_official_road' }
      }
      const rederivedScopeId = createRouteAssessmentScopeId({
        originAnchorKind: anchors.origin.kind,
        originPoint: anchors.origin.point,
        destinationAnchorKind: anchors.destination.kind,
        destinationPoint: anchors.destination.point,
        routeProvenanceFingerprint: anchors.routeProvenanceFingerprint,
      })
      if (rederivedScopeId !== input.assessmentScopeId) {
        return { status: 'unavailable', reason: 'no_connected_official_road' }
      }
      return resolveTrustedRouteCoverage({
        ...coverageInput,
        connectedRoadEdges: anchors.connectedRoadEdges,
        originSnapDistanceM: anchors.origin.snapDistanceM,
        destinationSnapDistanceM: anchors.destination.snapDistanceM,
        originSettlement,
        destinationSettlement,
      })
    }

    const graphResult = findIcelandRoadGraphRoute(
      graph,
      input.origin,
      input.destination,
      {
        profile: ICELAND_ROUTING_PROFILES.fastestCar,
        maxSnapDistanceM: ROAD_GRAPH_ENDPOINT_SEARCH_RADIUS_M,
      },
    )
    if (graphResult.status !== 'ok') {
      return { status: 'unavailable', reason: 'no_connected_official_road' }
    }
    const edgeById = new Map(graph.edges.map(edge => [edge.id, edge]))
    const connectedRoadEdges = graphResult.route.edgeIds
      .map(edgeId => edgeById.get(edgeId))
      .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge))
    if (connectedRoadEdges.length !== graphResult.route.edgeIds.length) {
      return { status: 'unavailable', reason: 'road_graph_unavailable' }
    }

    return resolveTrustedRouteCoverage({
      ...coverageInput,
      connectedRoadEdges,
      originSnapDistanceM: graphResult.originSnapDistanceM,
      destinationSnapDistanceM: graphResult.destinationSnapDistanceM,
      originSettlement,
      destinationSettlement,
    })
  } catch {
    return { status: 'unavailable', reason: 'road_graph_unavailable' }
  }
}
