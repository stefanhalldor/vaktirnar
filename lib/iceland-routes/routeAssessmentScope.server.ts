import 'server-only'

import {
  findOfficialSettlementContainingPoint,
  getOfficialPostalLocality,
  getOfficialSettlementById,
  type OfficialSettlementRecord,
} from '@/lib/places/officialPlaceDirectory.server'
import type { ConfirmedLocationInput } from '@/lib/places/providerCandidate'
import { getIcelandRoadGraph } from './roadGraphRuntime.server'
import { resolveVerifiedHmsPostalIdentity } from './routeAssessmentHmsIdentity.server'
import type { PostalAssessmentMapping } from './routeAssessmentMapping'
import {
  findRouteAssessmentRoadAnchors,
  type RouteAssessmentAnchorRequest,
} from './routeAssessmentRoadAnchor.server'
import type { RouteAssessmentEndpoint, RouteAssessmentScope } from './routeAssessmentScope'
import { createRouteAssessmentScopeId } from './routeAssessmentScopeId.server'

const ASSESSMENT_GRAPH_MAX_SNAP_DISTANCE_M = 5_000
const ASSESSMENT_GRAPH_TIMEOUT_MS = process.env.NODE_ENV === 'test' ? 1_000 : 8_000

type SettlementResolution =
  | {
      status: 'ready'
      settlement: OfficialSettlementRecord
      anchorKind: 'settlement_nodes' | 'projected_road'
    }
  | { status: 'unavailable'; reason: 'assessment_area_unavailable' | 'assessment_mapping_invalid' }

function resolveMappedSettlement(
  mapping: PostalAssessmentMapping,
  anchorKind: 'settlement_nodes' | 'projected_road',
): SettlementResolution {
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
  return { status: 'ready', settlement, anchorKind }
}

async function resolveAssessmentSettlement(
  location: ConfirmedLocationInput,
): Promise<SettlementResolution> {
  if (location.source === 'official' && location.placeType === 'settlement' && location.sourceId) {
    const officialSelection = getOfficialSettlementById(location.sourceId)
    return officialSelection
      ? { status: 'ready', settlement: officialSelection, anchorKind: 'settlement_nodes' }
      : { status: 'unavailable', reason: 'assessment_area_unavailable' }
  }

  const containing = findOfficialSettlementContainingPoint(location.lat, location.lon)
  if (containing) {
    const settlement = getOfficialSettlementById(containing.id)
    return settlement
      ? { status: 'ready', settlement, anchorKind: 'settlement_nodes' }
      : { status: 'unavailable', reason: 'assessment_mapping_invalid' }
  }

  // Client postcode, locality and display labels are untrusted. Only a bounded
  // first-party HMS lookup may select one of the explicit assessment mappings.
  const verified = await resolveVerifiedHmsPostalIdentity(location)
  return verified
    ? resolveMappedSettlement(verified.mapping, verified.anchorKind)
    : { status: 'unavailable', reason: 'assessment_area_unavailable' }
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

function anchorRequest(
  resolution: Extract<SettlementResolution, { status: 'ready' }>,
  navigationLocation: ConfirmedLocationInput,
): RouteAssessmentAnchorRequest {
  return resolution.anchorKind === 'settlement_nodes'
    ? {
        kind: 'canonical_node',
        point: { lat: resolution.settlement.lat, lon: resolution.settlement.lon },
      }
    : {
        kind: 'projected_road',
        point: { lat: navigationLocation.lat, lon: navigationLocation.lon },
      }
}

/**
 * Resolves canonical settlement road anchors before any routing-provider call.
 * Exact navigation coordinates are used only for bounded HMS classification
 * and ephemeral public-road projection. They are never returned, logged, or
 * persisted by this resolver.
 */
export async function resolveRouteAssessmentScope(
  navigationOrigin: ConfirmedLocationInput,
  navigationDestination: ConfirmedLocationInput,
): Promise<RouteAssessmentScope> {
  let originResolution: SettlementResolution
  let destinationResolution: SettlementResolution
  try {
    const resolutions = await Promise.all([
      resolveAssessmentSettlement(navigationOrigin),
      resolveAssessmentSettlement(navigationDestination),
    ])
    originResolution = resolutions[0]
    destinationResolution = resolutions[1]
  } catch {
    return { status: 'unavailable', reason: 'assessment_area_unavailable' }
  }
  if (originResolution.status !== 'ready') {
    return { status: 'unavailable', reason: originResolution.reason }
  }
  if (destinationResolution.status !== 'ready') {
    return { status: 'unavailable', reason: destinationResolution.reason }
  }

  const originSettlement = originResolution.settlement
  const destinationSettlement = destinationResolution.settlement
  if (
    originResolution.anchorKind === 'settlement_nodes'
    && destinationResolution.anchorKind === 'settlement_nodes'
    && originSettlement.id === destinationSettlement.id
  ) {
    return {
      status: 'same_area',
      settlementId: originSettlement.id,
      settlementName: originSettlement.name,
    }
  }

  try {
    const graph = await withAssessmentTimeout(getIcelandRoadGraph())
    const anchors = findRouteAssessmentRoadAnchors(
      graph,
      anchorRequest(originResolution, navigationOrigin),
      anchorRequest(destinationResolution, navigationDestination),
      {
        maxOriginSnapDistanceM: ASSESSMENT_GRAPH_MAX_SNAP_DISTANCE_M,
        maxDestinationSnapDistanceM: ASSESSMENT_GRAPH_MAX_SNAP_DISTANCE_M,
      },
    )
    if (anchors.status !== 'ok') {
      return { status: 'unavailable', reason: 'no_connected_official_road' }
    }

    return {
      status: 'ready',
      scopeId: createRouteAssessmentScopeId({
        originAnchorKind: anchors.origin.kind,
        originPoint: anchors.origin.point,
        destinationAnchorKind: anchors.destination.kind,
        destinationPoint: anchors.destination.point,
        routeProvenanceFingerprint: anchors.routeProvenanceFingerprint,
      }),
      origin: endpoint(originSettlement, anchors.origin.point),
      destination: endpoint(destinationSettlement, anchors.destination.point),
    }
  } catch {
    return { status: 'unavailable', reason: 'road_graph_unavailable' }
  }
}
