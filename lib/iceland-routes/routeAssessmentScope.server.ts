import 'server-only'

import {
  findOfficialSettlementContainingPoint,
  getOfficialPostalAssessmentIdentity,
  getOfficialPostalLocality,
  getOfficialSettlementById,
  type OfficialPostalLocality,
  type OfficialSettlementRecord,
} from '@/lib/places/officialPlaceDirectory.server'
import type { ConfirmedLocationInput } from '@/lib/places/providerCandidate'
import { haversineDistanceM, isIcelandRoadGraphEdgeAssessmentEligible } from './roadGraph'
import { getIcelandRoadGraph } from './roadGraphRuntime.server'
import {
  resolveVerifiedHmsPostalIdentity,
  resolveVerifiedHmsSourceIdentity,
  type VerifiedHmsPostalIdentity,
} from './routeAssessmentHmsIdentity.server'
import {
  findRouteAssessmentRoadAnchors,
  type RouteAssessmentAnchorRequest,
} from './routeAssessmentRoadAnchor.server'
import type { IcelandRoadGraphEdge } from './roadGraphTypes'
import type {
  RouteAssessmentEndpoint,
  RouteAssessmentScope,
} from './routeAssessmentScope'
import { createRouteAssessmentScopeId } from './routeAssessmentScopeId.server'

const ASSESSMENT_GRAPH_MAX_SNAP_DISTANCE_M = 5_000
const ASSESSMENT_GRAPH_TIMEOUT_MS = process.env.NODE_ENV === 'test' ? 1_000 : 8_000

type ReadyUrbanResolution = Readonly<{
  status: 'ready'
  identityKind: 'urban_settlement'
  settlement: OfficialSettlementRecord
}>

type ReadyRuralResolution = Readonly<{
  status: 'ready'
  identityKind: 'rural_postal_area'
  postalCode: string
  postalLocality: OfficialPostalLocality
  postalAreaId: string
}>

type ReadyRoadAnchorResolution = Readonly<{
  status: 'ready'
  identityKind: 'official_road_anchor'
}>

type ReadyAssessmentResolution =
  | ReadyUrbanResolution
  | ReadyRuralResolution
  | ReadyRoadAnchorResolution

type AssessmentResolution =
  | ReadyAssessmentResolution
  | Readonly<{
      status: 'unavailable'
      reason: 'assessment_area_unavailable' | 'assessment_mapping_invalid'
    }>

function urbanResolution(settlement: OfficialSettlementRecord): ReadyUrbanResolution {
  return { status: 'ready', identityKind: 'urban_settlement', settlement }
}

function roadAnchorResolution(): ReadyRoadAnchorResolution {
  return { status: 'ready', identityKind: 'official_road_anchor' }
}

function mayUseGenericRoadAnchor(location: ConfirmedLocationInput): boolean {
  const source = location.source?.trim()
  return source === undefined
    || source === ''
    || source === 'map'
    || source === 'device'
    || source === 'saved'
    || source === 'recent'
}

function resolveVerifiedPostalIdentity(
  verified: VerifiedHmsPostalIdentity,
): AssessmentResolution {
  const officialPostalLocality = getOfficialPostalLocality(verified.postalCode)
  const currentIdentity = getOfficialPostalAssessmentIdentity(verified.postalCode)
  if (
    !officialPostalLocality
    || officialPostalLocality.sourceId !== verified.postalLocalitySourceId
    || officialPostalLocality.name !== verified.postalLocality
    || !currentIdentity
    || currentIdentity.kind === 'unresolved'
    || currentIdentity.kind !== verified.assessmentIdentity.kind
  ) {
    return { status: 'unavailable', reason: 'assessment_mapping_invalid' }
  }

  if (currentIdentity.kind === 'urban_settlement') {
    if (
      verified.assessmentIdentity.kind !== 'urban_settlement'
      || currentIdentity.settlementId !== verified.assessmentIdentity.settlementId
    ) {
      return { status: 'unavailable', reason: 'assessment_mapping_invalid' }
    }
    const settlement = getOfficialSettlementById(currentIdentity.settlementId)
    return settlement
      ? urbanResolution(settlement)
      : { status: 'unavailable', reason: 'assessment_mapping_invalid' }
  }

  if (
    verified.assessmentIdentity.kind !== 'rural_postal_area'
    || officialPostalLocality.classification !== 'Dreifbýli'
    || currentIdentity.postalAreaId !== verified.assessmentIdentity.postalAreaId
  ) {
    return { status: 'unavailable', reason: 'assessment_mapping_invalid' }
  }
  return {
    status: 'ready',
    identityKind: 'rural_postal_area',
    postalCode: verified.postalCode,
    postalLocality: officialPostalLocality,
    postalAreaId: currentIdentity.postalAreaId,
  }
}

async function resolveAssessmentIdentity(
  location: ConfirmedLocationInput,
): Promise<AssessmentResolution> {
  const source = location.source?.trim()
  if (source === 'official' && location.placeType === 'settlement' && location.sourceId) {
    const officialSelection = getOfficialSettlementById(location.sourceId)
    return officialSelection
      ? urbanResolution(officialSelection)
      : { status: 'unavailable', reason: 'assessment_area_unavailable' }
  }

  // A selected HMS row carries an exact first-party identity. It must always
  // be revalidated before polygon containment so a stale/forged source ID
  // cannot inherit a settlement merely from its client-provided coordinates.
  if (source === 'hms') {
    const verified = await resolveVerifiedHmsPostalIdentity(location)
    if (verified) return resolveVerifiedPostalIdentity(verified)

    // A real HMS row without a configured postal/settlement identity may use
    // the generic road fallback, but only after its exact source ID has been
    // re-attested. A stale or forged selection remains terminal.
    const verifiedSource = await resolveVerifiedHmsSourceIdentity(location)
    const expectedSourceId = location.sourceId?.trim()
    return verifiedSource && expectedSourceId && verifiedSource.sourceId === expectedSourceId
      ? roadAnchorResolution()
      : { status: 'unavailable', reason: 'assessment_area_unavailable' }
  }

  const containing = findOfficialSettlementContainingPoint(location.lat, location.lon)
  if (containing) {
    const settlement = getOfficialSettlementById(containing.id)
    return settlement
      ? urbanResolution(settlement)
      : { status: 'unavailable', reason: 'assessment_mapping_invalid' }
  }

  if (!mayUseGenericRoadAnchor(location)) {
    return { status: 'unavailable', reason: 'assessment_area_unavailable' }
  }

  // Client postcode, locality, municipality and labels are untrusted. Bounded
  // first-party lookup rehydrates map/device/saved/recent coordinate evidence.
  const verified = await resolveVerifiedHmsPostalIdentity(location)
  return verified
    ? resolveVerifiedPostalIdentity(verified)
    : roadAnchorResolution()
}

function endpoint(
  resolution: ReadyAssessmentResolution,
  point: { lat: number; lon: number },
  accessDistanceM: number,
  selectedRoadEdge?: IcelandRoadGraphEdge,
): RouteAssessmentEndpoint | null {
  if (resolution.identityKind === 'urban_settlement') {
    const settlement = resolution.settlement
    return {
      name: settlement.name,
      formattedAddress: settlement.name,
      lat: point.lat,
      lon: point.lon,
      source: 'official',
      sourceId: settlement.id,
      accessDistanceM,
      identityKind: 'urban_settlement',
      placeType: 'settlement',
      ...(settlement.postalCode ? { postalCode: settlement.postalCode } : {}),
      ...(settlement.postalLocality ? { postalLocality: settlement.postalLocality } : {}),
    }
  }
  if (resolution.identityKind === 'rural_postal_area') {
    const formattedAddress = `${resolution.postalCode} ${resolution.postalLocality.name}`
    return {
      name: resolution.postalLocality.name,
      formattedAddress,
      lat: point.lat,
      lon: point.lon,
      source: 'official',
      sourceId: resolution.postalAreaId,
      accessDistanceM,
      identityKind: 'rural_postal_area',
      placeType: 'point',
      postalCode: resolution.postalCode,
      postalLocality: resolution.postalLocality.name,
      postalLocalitySourceId: resolution.postalLocality.sourceId,
    }
  }

  if (!selectedRoadEdge || !isIcelandRoadGraphEdgeAssessmentEligible(selectedRoadEdge)) return null
  const segmentId = selectedRoadEdge.segmentId.trim()
  if (!segmentId) return null
  const roadNumber = selectedRoadEdge.roadNumber?.trim()
  const roadName = selectedRoadEdge.roadName?.trim()
  const graphLabel = [roadNumber, roadName].filter(Boolean).join(' · ')
    || segmentId
  return {
    name: graphLabel,
    formattedAddress: graphLabel,
    lat: point.lat,
    lon: point.lon,
    source: 'official',
    sourceId: `official-road:${segmentId}`,
    accessDistanceM,
    identityKind: 'official_road_anchor',
    placeType: 'point',
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
  _resolution: ReadyAssessmentResolution,
  navigationLocation: ConfirmedLocationInput,
): RouteAssessmentAnchorRequest {
  // The place chosen in step 1 remains the physical endpoint for every place
  // type. Settlement identity is still used for naming/attestation, but must
  // never move an exact address or map point to the settlement centre.
  return {
    kind: 'projected_road',
    point: { lat: navigationLocation.lat, lon: navigationLocation.lon },
  }
}

function broaderPlaceAnchorRequest(
  resolution: ReadyAssessmentResolution,
  navigationLocation: ConfirmedLocationInput,
): RouteAssessmentAnchorRequest | null {
  if (resolution.identityKind !== 'urban_settlement') return null
  const point = {
    lat: resolution.settlement.lat,
    lon: resolution.settlement.lon,
  }
  return haversineDistanceM(point, navigationLocation) < 1
    ? null
    : { kind: 'projected_road', point }
}

function resolveRoadAnchorsWithPlaceFallback(
  graph: Awaited<ReturnType<typeof getIcelandRoadGraph>>,
  originResolution: ReadyAssessmentResolution,
  destinationResolution: ReadyAssessmentResolution,
  navigationOrigin: ConfirmedLocationInput,
  navigationDestination: ConfirmedLocationInput,
  deadlineAtMs: number,
) {
  const exactOrigin = anchorRequest(originResolution, navigationOrigin)
  const exactDestination = anchorRequest(destinationResolution, navigationDestination)
  const broaderOrigin = broaderPlaceAnchorRequest(originResolution, navigationOrigin)
  const broaderDestination = broaderPlaceAnchorRequest(destinationResolution, navigationDestination)
  const attempts: ReadonlyArray<Readonly<{
    origin: RouteAssessmentAnchorRequest
    destination: RouteAssessmentAnchorRequest
  }>> = [
    { origin: exactOrigin, destination: exactDestination },
    ...(broaderOrigin ? [{ origin: broaderOrigin, destination: exactDestination }] : []),
    ...(broaderDestination ? [{ origin: exactOrigin, destination: broaderDestination }] : []),
    ...(broaderOrigin && broaderDestination
      ? [{ origin: broaderOrigin, destination: broaderDestination }]
      : []),
  ]

  for (const attempt of attempts) {
    const result = findRouteAssessmentRoadAnchors(
      graph,
      attempt.origin,
      attempt.destination,
      {
        maxOriginSnapDistanceM: ASSESSMENT_GRAPH_MAX_SNAP_DISTANCE_M,
        maxDestinationSnapDistanceM: ASSESSMENT_GRAPH_MAX_SNAP_DISTANCE_M,
        deadlineAtMs,
      },
    )
    // A deadline is transient. Never replace exact user coordinates with a
    // broader place merely because the graph was still loading or calculating.
    if (result.status === 'incomplete' || result.status === 'ok') return result
  }

  return { status: 'no_route' as const }
}

function selectedEndpointEdge(
  resolution: ReadyAssessmentResolution,
  connectedRoadEdges: readonly IcelandRoadGraphEdge[],
  side: 'origin' | 'destination',
): IcelandRoadGraphEdge | undefined {
  if (resolution.identityKind !== 'official_road_anchor') return undefined
  return side === 'origin' ? connectedRoadEdges[0] : connectedRoadEdges.at(-1)
}

/**
 * Resolves official identities and connected road anchors before an
 * assessment-road claim is made. Exact navigation endpoints remain separate:
 * they are legitimate inputs for identity, access and later full-route weather
 * work, while this returned scope contains only verified assessment anchors.
 */
export async function resolveRouteAssessmentScope(
  navigationOrigin: ConfirmedLocationInput,
  navigationDestination: ConfirmedLocationInput,
): Promise<RouteAssessmentScope> {
  let originResolution: AssessmentResolution
  let destinationResolution: AssessmentResolution
  try {
    const resolutions = await Promise.all([
      resolveAssessmentIdentity(navigationOrigin),
      resolveAssessmentIdentity(navigationDestination),
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

  if (
    originResolution.identityKind === 'urban_settlement'
    && destinationResolution.identityKind === 'urban_settlement'
    && originResolution.settlement.id === destinationResolution.settlement.id
    && navigationOrigin.lat === navigationDestination.lat
    && navigationOrigin.lon === navigationDestination.lon
  ) {
    return {
      status: 'same_area',
      settlementId: originResolution.settlement.id,
      settlementName: originResolution.settlement.name,
    }
  }

  try {
    const deadlineAtMs = Date.now() + ASSESSMENT_GRAPH_TIMEOUT_MS
    const graph = await withAssessmentTimeout(getIcelandRoadGraph())
    const anchors = resolveRoadAnchorsWithPlaceFallback(
      graph,
      originResolution,
      destinationResolution,
      navigationOrigin,
      navigationDestination,
      deadlineAtMs,
    )
    if (anchors.status === 'incomplete') {
      return { status: 'unavailable', reason: 'road_graph_unavailable' }
    }
    if (anchors.status !== 'ok') {
      return { status: 'unavailable', reason: 'no_connected_official_road' }
    }

    const origin = endpoint(
      originResolution,
      anchors.origin.point,
      haversineDistanceM(navigationOrigin, anchors.origin.point),
      selectedEndpointEdge(originResolution, anchors.connectedRoadEdges, 'origin'),
    )
    const destination = endpoint(
      destinationResolution,
      anchors.destination.point,
      haversineDistanceM(navigationDestination, anchors.destination.point),
      selectedEndpointEdge(destinationResolution, anchors.connectedRoadEdges, 'destination'),
    )
    if (!origin || !destination) {
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
      origin,
      destination,
    }
  } catch {
    return { status: 'unavailable', reason: 'road_graph_unavailable' }
  }
}
