import 'server-only'

import {
  findOfficialSettlementContainingPoint,
  getOfficialPostalLocality,
  getOfficialSettlementById,
  type OfficialSettlementRecord,
} from '@/lib/places/officialPlaceDirectory.server'
import type { ConfirmedLocationInput } from '@/lib/places/providerCandidate'
import { findIcelandRoadGraphRoute, ICELAND_ROUTING_PROFILES } from './roadGraph'
import { getIcelandRoadGraph } from './roadGraphRuntime.server'
import { getRuralPostalAssessmentMapping } from './routeAssessmentMapping'
import type { RouteAssessmentEndpoint, RouteAssessmentScope } from './routeAssessmentScope'

const ASSESSMENT_GRAPH_MAX_SNAP_DISTANCE_M = 5_000
const ASSESSMENT_GRAPH_TIMEOUT_MS = process.env.NODE_ENV === 'test' ? 1_000 : 8_000

type SettlementResolution =
  | { status: 'ready'; settlement: OfficialSettlementRecord }
  | { status: 'unavailable'; reason: 'assessment_area_unavailable' | 'assessment_mapping_invalid' }

function resolveAssessmentSettlement(location: ConfirmedLocationInput): SettlementResolution {
  if (location.source === 'official' && location.placeType === 'settlement' && location.sourceId) {
    const officialSelection = getOfficialSettlementById(location.sourceId)
    return officialSelection
      ? { status: 'ready', settlement: officialSelection }
      : { status: 'unavailable', reason: 'assessment_area_unavailable' }
  }

  const containing = findOfficialSettlementContainingPoint(location.lat, location.lon)
  if (containing) {
    const settlement = getOfficialSettlementById(containing.id)
    return settlement
      ? { status: 'ready', settlement }
      : { status: 'unavailable', reason: 'assessment_mapping_invalid' }
  }

  const mapping = getRuralPostalAssessmentMapping(location.postalCode)
  if (!mapping) return { status: 'unavailable', reason: 'assessment_area_unavailable' }

  const postalLocality = getOfficialPostalLocality(mapping.postalCode)
  const settlement = getOfficialSettlementById(mapping.assessmentSettlementId)
  if (
    !postalLocality
    || postalLocality.sourceId !== mapping.postalLocalitySourceId
    || postalLocality.name !== mapping.expectedPostalLocalityName
    || postalLocality.classification !== mapping.expectedPostalLocalityClassification
    || !settlement
    || settlement.name !== mapping.expectedSettlementName
  ) {
    return { status: 'unavailable', reason: 'assessment_mapping_invalid' }
  }
  return { status: 'ready', settlement }
}

function endpoint(
  settlement: OfficialSettlementRecord,
  point: { lat: number; lon: number },
): RouteAssessmentEndpoint {
  return {
    name: settlement.name,
    formattedAddress: settlement.name,
    lat: point.lat,
    lon: point.lon,
    source: 'official',
    sourceId: settlement.id,
    placeType: 'settlement',
    ...(settlement.postalCode ? { postalCode: settlement.postalCode } : {}),
    ...(settlement.postalLocality ? { postalLocality: settlement.postalLocality } : {}),
  }
}

async function withAssessmentTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('assessment_graph_timeout')), ASSESSMENT_GRAPH_TIMEOUT_MS)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Resolves canonical settlement road anchors before any routing-provider call.
 * Exact navigation coordinates are used only to classify the selected area and
 * are never returned, logged, or persisted by this resolver.
 */
export async function resolveRouteAssessmentScope(
  navigationOrigin: ConfirmedLocationInput,
  navigationDestination: ConfirmedLocationInput,
): Promise<RouteAssessmentScope> {
  const originResolution = resolveAssessmentSettlement(navigationOrigin)
  const destinationResolution = resolveAssessmentSettlement(navigationDestination)
  if (originResolution.status !== 'ready') {
    return { status: 'unavailable', reason: originResolution.reason }
  }
  if (destinationResolution.status !== 'ready') {
    return { status: 'unavailable', reason: destinationResolution.reason }
  }

  const originSettlement = originResolution.settlement
  const destinationSettlement = destinationResolution.settlement
  if (originSettlement.id === destinationSettlement.id) {
    return {
      status: 'same_area',
      settlementId: originSettlement.id,
      settlementName: originSettlement.name,
    }
  }

  try {
    const graph = await withAssessmentTimeout(getIcelandRoadGraph())
    const route = findIcelandRoadGraphRoute(
      graph,
      { lat: originSettlement.lat, lon: originSettlement.lon },
      { lat: destinationSettlement.lat, lon: destinationSettlement.lon },
      {
        profile: ICELAND_ROUTING_PROFILES.fastestCar,
        maxSnapDistanceM: ASSESSMENT_GRAPH_MAX_SNAP_DISTANCE_M,
      },
    )
    if (route.status !== 'ok') {
      return { status: 'unavailable', reason: 'no_connected_official_road' }
    }
    const originNode = graph.nodes.get(route.snappedOriginNodeId)
    const destinationNode = graph.nodes.get(route.snappedDestinationNodeId)
    if (!originNode || !destinationNode || route.route.geometry.length < 2) {
      return { status: 'unavailable', reason: 'road_graph_unavailable' }
    }

    return {
      status: 'ready',
      scopeId: [
        originSettlement.id,
        route.snappedOriginNodeId,
        destinationSettlement.id,
        route.snappedDestinationNodeId,
      ].join(':'),
      origin: endpoint(originSettlement, originNode.point),
      destination: endpoint(destinationSettlement, destinationNode.point),
    }
  } catch {
    return { status: 'unavailable', reason: 'road_graph_unavailable' }
  }
}
