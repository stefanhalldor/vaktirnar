import type { LatLon } from './types'

export type IcelandRoutingProviderId = 'google_routes' | 'teskeid_routes'

export type IcelandRoutingVehicleProfile =
  | 'car'
  | 'low_car'
  | 'caravan'
  | 'motorhome'
  | 'motorcycle'

export type IcelandRoutingAvoidance =
  | 'gravel'
  | 'f_roads'
  | 'mountain_roads'
  | 'single_lane_roads'
  | 'single_lane_bridges'

export interface IcelandRoutingPlace {
  /** Provider-neutral label for request-scoped diagnostics only. */
  label?: string
  point: LatLon
}

export interface IcelandRoutingRequest {
  origin: IcelandRoutingPlace
  destination: IcelandRoutingPlace
  vehicleProfile: IcelandRoutingVehicleProfile
  avoid?: readonly IcelandRoutingAvoidance[]
  departureTime?: string
  alternatives?: boolean
}

export type IcelandRoutingConfidence = 'experimental' | 'reviewed' | 'verified'

export interface IcelandRoutingSurfaceBreakdown {
  pavedM: number
  gravelM: number
  mixedM: number
  unknownM: number
}

export interface IcelandRoutingPath {
  id: string
  geometry: readonly LatLon[]
  distanceM: number
  durationS: number
  segmentIds: readonly string[]
  routeFamilyId?: string
  /** Distinguishes hand-placed discovery geometry from a connected road-graph result. */
  resultKind?: 'corridor_fixture' | 'road_graph'
  surfaceBreakdown?: IcelandRoutingSurfaceBreakdown
  derivedSpeedDistanceM?: number
  originSnapDistanceM?: number
  destinationSnapDistanceM?: number
  warnings?: readonly string[]
  confidence: IcelandRoutingConfidence
}

export interface IcelandRoutingResult {
  provider: IcelandRoutingProviderId
  paths: readonly IcelandRoutingPath[]
  calculatedAt: string
}

/**
 * Provider-neutral boundary for routing engines.
 *
 * Implementations must not leak provider-specific payloads through this contract.
 * In particular, raw Google geometry or route content must never be persisted as
 * canonical Teskeid road data.
 */
export interface IcelandRoutingProvider {
  readonly id: IcelandRoutingProviderId
  calculateRoutes(request: IcelandRoutingRequest): Promise<IcelandRoutingResult>
}
