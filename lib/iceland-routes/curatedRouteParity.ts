import type { RouteOption } from '@/lib/weather/provider.types'
import type { IcelandRoadGraphEdge } from './roadGraphTypes'

export type CuratedRoutePoint = Readonly<{ lat: number; lon: number }>
export type CuratedRouteBounds = Readonly<{
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}>

export type CuratedRouteParityRule = Readonly<{
  id:
    | 'northern-westfjords-via-holmavik'
    | 'capital-south-east-via-hellisheidi'
    | 'capital-east-via-hellisheidi'
    | 'capital-north-ring-south-east-north'
    | 'capital-southeast-ring-north-east-south'
    | 'avoid-oxi-via-reydarfjordur'
  legacyOwner: 'teskeid_graph' | 'google_adapter'
  owner: 'teskeid_graph'
  labels: readonly string[]
  cautionIds: readonly string[]
  inclusionPriority: 'safety' | 'hellisheidi' | 'ring'
  trigger: string
  postcondition: string
  dedupePolicy: string
  ownerImplementation: string
  proof: readonly string[]
}>

/**
 * Versioned product-behaviour inventory. This is deliberately provider-neutral:
 * it records the outcome that Teskeið must preserve, never a Google request body.
 */
export const CURATED_ROUTE_PARITY_MANIFEST_VERSION = 'v238.1'

export const CURATED_ROUTE_PARITY_MANIFEST: readonly CuratedRouteParityRule[] = [
  {
    id: 'northern-westfjords-via-holmavik',
    legacyOwner: 'teskeid_graph',
    owner: 'teskeid_graph',
    labels: ['CURATED_VIA_HOLMAVIK'],
    cautionIds: ['westfjords-south-route60'],
    inclusionPriority: 'safety',
    trigger: 'Exactly one endpoint is inside the northern-Westfjords boundary.',
    postcondition: 'Ordered Hólmavík and northern Route 61 gates, without returning south through the Hólmavík geofence.',
    dedupePolicy: 'Merge by exact edge sequence or provenance; existing validated route wins.',
    ownerImplementation: 'routeAssessmentCandidateEvidence.server.ts#resolveHolmavikAssessmentAlternative',
    proof: ['unit:both-directions-and-no-backtrack', 'real-artifact:reykjavik-thingeyri-both-directions', 'signed-evidence:round-trip'],
  },
  {
    id: 'capital-south-east-via-hellisheidi',
    legacyOwner: 'google_adapter',
    owner: 'teskeid_graph',
    labels: ['CURATED_VIA_HELLISHEIDI'],
    cautionIds: [],
    inclusionPriority: 'hellisheidi',
    trigger: 'Capital-area origin to the exact south/southeast destination bounds.',
    postcondition: 'Complete graph route crosses the verified Route 1 Hellisheiði gate.',
    dedupePolicy: 'Reuse and label an existing corridor route; never publish a distinct slower duplicate.',
    ownerImplementation: 'routeAssessmentCandidateEvidence.server.ts#applyProviderNeutralCuratedRoutes',
    proof: ['unit:exact-bounds-and-negatives', 'unit:duplicate-suppression-60s', 'real-artifact:reykjavik-hveragerdi'],
  },
  {
    id: 'capital-east-via-hellisheidi',
    legacyOwner: 'google_adapter',
    owner: 'teskeid_graph',
    labels: ['CURATED_VIA_HELLISHEIDI', 'CURATED_EAST_ICELAND_VIA_HELLISHEIDI'],
    cautionIds: [],
    inclusionPriority: 'hellisheidi',
    trigger: 'Capital-area origin to the exact east-Iceland destination bounds.',
    postcondition: 'Complete graph route crosses the verified Route 1 Hellisheiði gate and carries both stable labels.',
    dedupePolicy: 'Reuse and label an existing corridor route; merge both labels by exact evidence identity.',
    ownerImplementation: 'routeAssessmentCandidateEvidence.server.ts#applyProviderNeutralCuratedRoutes',
    proof: ['unit:exact-bounds-and-dual-label', 'real-artifact:reykjavik-egilsstadir'],
  },
  {
    id: 'capital-north-ring-south-east-north',
    legacyOwner: 'google_adapter',
    owner: 'teskeid_graph',
    labels: ['CURATED_RING_ROAD'],
    cautionIds: [],
    inclusionPriority: 'ring',
    trigger: 'Capital-area origin to north/northeast bounds when the fastest route is at least 350 km.',
    postcondition: 'Ordered south, east and northeast Route 1 gates before the destination.',
    dedupePolicy: 'Merge by exact edge sequence or provenance; mandatory ring route is included before generic cap.',
    ownerImplementation: 'routeAssessmentCandidateEvidence.server.ts#resolveCuratedAssessmentAlternative',
    proof: ['unit:distance-and-bounds-gates', 'real-artifact:reykjavik-akureyri-counterclockwise'],
  },
  {
    id: 'capital-southeast-ring-north-east-south',
    legacyOwner: 'google_adapter',
    owner: 'teskeid_graph',
    labels: ['CURATED_RING_ROAD'],
    cautionIds: [],
    inclusionPriority: 'ring',
    trigger: 'Capital-area origin to southeast-coast bounds when the fastest route is at least 350 km.',
    postcondition: 'Ordered north and northeast Route 1 gates, no Road 939, and no pass beyond the destination followed by a return.',
    dedupePolicy: 'Merge by exact edge sequence or provenance; mandatory ring route is included before generic cap.',
    ownerImplementation: 'routeAssessmentCandidateEvidence.server.ts#resolveCuratedAssessmentAlternative',
    proof: ['unit:distance-bounds-and-no-backtrack', 'real-artifact:reykjavik-hofn-clockwise'],
  },
  {
    id: 'avoid-oxi-via-reydarfjordur',
    legacyOwner: 'google_adapter',
    owner: 'teskeid_graph',
    labels: ['CURATED_AVOID_OXI'],
    cautionIds: ['oxi-axarvegur-939'],
    inclusionPriority: 'safety',
    trigger: 'At least one complete candidate uses Axarvegur 939 / Öxi.',
    postcondition: 'A complete candidate crosses the Reyðarfjörður corridor and contains neither Road 939 evidence nor the Öxi caution.',
    dedupePolicy: 'Reuse only a validated Reyðarfjörður-safe candidate; merge by exact evidence identity before mandatory cap.',
    ownerImplementation: 'routeAssessmentCandidateEvidence.server.ts#applyProviderNeutralCuratedRoutes',
    proof: ['unit:reuse-dedupe-and-failed-validation', 'real-artifact:egilsstadir-hofn-both-directions'],
  },
] as const

export const CAPITAL_AREA_BOUNDS: CuratedRouteBounds = {
  minLat: 63.95,
  maxLat: 64.25,
  minLon: -22.10,
  maxLon: -21.40,
}

export const WESTFJORDS_NORTH_BOUNDS: CuratedRouteBounds = {
  minLat: 65.80,
  maxLat: 66.50,
  minLon: -25.0,
  maxLon: -22.00,
}

export const HOLMAVIK_GATE: CuratedRoutePoint = { lat: 65.703, lon: -21.685 }
export const HOLMAVIK_NORTH_ROUTE61_GATE: CuratedRoutePoint = { lat: 65.7503, lon: -22.1291 }
export const HOLMAVIK_PROXIMITY_M = 8_000

export const SOUTH_EAST_VIA_HELLISHEIDI_BOUNDS: CuratedRouteBounds = {
  minLat: 63.35,
  maxLat: 64.15,
  minLon: -21.25,
  maxLon: -13.0,
}

export const EAST_ICELAND_VIA_HELLISHEIDI_BOUNDS: CuratedRouteBounds = {
  minLat: 64.35,
  maxLat: 65.50,
  minLon: -15.90,
  maxLon: -13.0,
}

export const NORTH_ICELAND_RING_ROAD_BOUNDS: CuratedRouteBounds = {
  minLat: 65.40,
  maxLat: 66.7,
  minLon: -22.0,
  maxLon: -14.0,
}

export const SOUTHEAST_COAST_RING_ROAD_BOUNDS: CuratedRouteBounds = {
  minLat: 63.5,
  maxLat: 65.0,
  minLon: -15.9,
  maxLon: -13.0,
}

// These gates become production authority only together with the official-
// artifact postcondition tests. A gate must resolve to Road 1 evidence; mere
// proximity to the coordinate is never sufficient.
export const HELLISHEIDI_GATE: CuratedRoutePoint = { lat: 64.036, lon: -21.392 }
export const RING_ROAD_SOUTH_GATE: CuratedRoutePoint = { lat: 63.415, lon: -18.977 }
export const RING_ROAD_EAST_GATE: CuratedRoutePoint = { lat: 64.295, lon: -15.148 }
// Corrected from the legacy Google shaping point (65.130, -14.514), which the
// official artifact proves is 8.27 km off Road 1. This is an exact verified
// Road 1 graph vertex south-west of Egilsstaðir.
export const RING_ROAD_NORTHEAST_GATE: CuratedRoutePoint = {
  lat: 65.1417552142078,
  lon: -14.339348946038276,
}
export const RING_ROAD_NORTH_GATE: CuratedRoutePoint = { lat: 65.540, lon: -19.520 }
export const REYDARFJORDUR_GATE: CuratedRoutePoint = { lat: 65.0317, lon: -14.2183 }
export const OXI_STATION: CuratedRoutePoint = { lat: 64.8257, lon: -14.6573 }

export const CURATED_GATE_MAX_SNAP_DISTANCE_M = 2_500
export const CURATED_CORRIDOR_PROXIMITY_M = 2_500
export const OXI_EVIDENCE_PROXIMITY_M = 1_500
export const HELLISHEIDI_DUPLICATE_TOLERANCE_S = 60
export const RING_ROUTE_MIN_FASTEST_DISTANCE_M = 350_000

export function pointInCuratedBounds(
  point: CuratedRoutePoint,
  bounds: CuratedRouteBounds,
): boolean {
  return point.lat >= bounds.minLat
    && point.lat <= bounds.maxLat
    && point.lon >= bounds.minLon
    && point.lon <= bounds.maxLon
}

export type EndpointCuratedRuleId =
  | 'capital-south-east-via-hellisheidi'
  | 'capital-east-via-hellisheidi'
  | 'capital-north-ring-south-east-north'
  | 'capital-southeast-ring-north-east-south'

/** Exact directional endpoint triggers migrated from the legacy adapter. */
export function triggeredEndpointCuratedRuleIds(input: {
  origin: CuratedRoutePoint
  destination: CuratedRoutePoint
  fastestDistanceM: number
}): readonly EndpointCuratedRuleId[] {
  if (!pointInCuratedBounds(input.origin, CAPITAL_AREA_BOUNDS)) return []
  const result: EndpointCuratedRuleId[] = []
  if (pointInCuratedBounds(input.destination, SOUTH_EAST_VIA_HELLISHEIDI_BOUNDS)) {
    result.push('capital-south-east-via-hellisheidi')
  }
  if (pointInCuratedBounds(input.destination, EAST_ICELAND_VIA_HELLISHEIDI_BOUNDS)) {
    result.push('capital-east-via-hellisheidi')
  }
  if (
    input.fastestDistanceM >= RING_ROUTE_MIN_FASTEST_DISTANCE_M
    && pointInCuratedBounds(input.destination, NORTH_ICELAND_RING_ROAD_BOUNDS)
  ) result.push('capital-north-ring-south-east-north')
  if (
    input.fastestDistanceM >= RING_ROUTE_MIN_FASTEST_DISTANCE_M
    && pointInCuratedBounds(input.destination, SOUTHEAST_COAST_RING_ROAD_BOUNDS)
  ) result.push('capital-southeast-ring-north-east-south')
  return result
}

export function routeEdgesUseRoad(
  edges: readonly IcelandRoadGraphEdge[],
  roadNumber: string,
): boolean {
  return edges.some(edge => edge.roadNumber?.toUpperCase() === roadNumber.toUpperCase())
}

export function routeHasOxiEvidence(input: {
  route: RouteOption
  edges: readonly IcelandRoadGraphEdge[]
}): boolean {
  return routeEdgesUseRoad(input.edges, '939')
    || Boolean(input.route.cautions?.some(caution => caution.id === 'oxi-axarvegur-939'))
}

export function shouldSuppressDistinctHellisheidiCandidate(input: {
  candidateDurationS: number
  fastestBaseDurationS: number
  baseAlreadyUsesCorridor: boolean
}): boolean {
  return input.baseAlreadyUsesCorridor
    && input.candidateDurationS >= input.fastestBaseDurationS - HELLISHEIDI_DUPLICATE_TOLERANCE_S
}
