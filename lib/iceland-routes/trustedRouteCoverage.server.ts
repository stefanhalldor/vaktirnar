import 'server-only'

import {
  findOfficialSettlementContainingPoint,
  type OfficialSettlementBoundary,
} from '@/lib/places/officialPlaceDirectory.server'
import { findIcelandRoadGraphRoute, ICELAND_ROUTING_PROFILES } from './roadGraph'
import { getIcelandRoadGraph } from './roadGraphRuntime.server'
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
  if (originSettlement && destinationSettlement && originSettlement.id === destinationSettlement.id) {
    const sameUrbanResult = resolveTrustedRouteCoverage({
      ...input,
      connectedRoadEdges: [],
      originSnapDistanceM: 0,
      destinationSnapDistanceM: 0,
      originSettlement,
      destinationSettlement,
    })
    if (sameUrbanResult.status === 'same_urban_area') return sameUrbanResult
  }

  try {
    const graph = await withCoverageTimeout(getIcelandRoadGraph())
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
      ...input,
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
