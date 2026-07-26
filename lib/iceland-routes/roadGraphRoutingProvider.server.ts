import 'server-only'

import {
  findIcelandRoadGraphRoute,
  ICELAND_ROUTING_PROFILES,
} from './roadGraph'
import type { IcelandRoadGraph, IcelandRoadRoutingProfile } from './roadGraphTypes'
import type {
  IcelandRoutingProvider,
  IcelandRoutingRequest,
  IcelandRoutingResult,
} from './routingProvider'

function requestProfile(request: IcelandRoutingRequest): IcelandRoadRoutingProfile {
  const base: IcelandRoadRoutingProfile = request.vehicleProfile === 'caravan' || request.vehicleProfile === 'motorhome'
    ? ICELAND_ROUTING_PROFILES.caravan
    : request.vehicleProfile === 'low_car'
      ? ICELAND_ROUTING_PROFILES.fastestPaved
      : ICELAND_ROUTING_PROFILES.fastestCar

  const avoid = new Set(request.avoid ?? [])
  return {
    ...base,
    requirePaved: base.requirePaved || avoid.has('gravel'),
    avoidFRoads: base.avoidFRoads || avoid.has('f_roads'),
    avoidMountainRoads: base.avoidMountainRoads || avoid.has('mountain_roads'),
  }
}

export class IcelandRoadGraphRoutingProvider implements IcelandRoutingProvider {
  readonly id = 'teskeid_routes' as const

  constructor(
    private readonly graph: IcelandRoadGraph,
    private readonly maxSnapDistanceM = 25_000,
  ) {}

  async calculateRoutes(request: IcelandRoutingRequest): Promise<IcelandRoutingResult> {
    const result = findIcelandRoadGraphRoute(
      this.graph,
      request.origin.point,
      request.destination.point,
      { profile: requestProfile(request), maxSnapDistanceM: this.maxSnapDistanceM },
    )
    if (result.status !== 'ok') {
      throw new Error(`teskeid_routes: ${result.status}`)
    }

    return {
      provider: this.id,
      calculatedAt: new Date().toISOString(),
      paths: [{
        id: `teskeid-road-graph-${result.snappedOriginNodeId}-${result.snappedDestinationNodeId}`,
        geometry: result.route.geometry,
        distanceM: result.route.distanceM,
        durationS: result.route.durationS,
        segmentIds: result.route.segmentIds,
        resultKind: 'road_graph',
        surfaceBreakdown: result.route.surface,
        derivedSpeedDistanceM: result.route.derivedSpeedDistanceM,
        originSnapDistanceM: result.originSnapDistanceM,
        destinationSnapDistanceM: result.destinationSnapDistanceM,
        confidence: 'experimental',
        warnings: [
          ...(result.route.derivedSpeedDistanceM > 0 ? ['travel-time-uses-derived-speeds'] : []),
          ...(result.originSnapDistanceM > 1_000 ? ['origin-snap-distance-over-1km'] : []),
          ...(result.destinationSnapDistanceM > 1_000 ? ['destination-snap-distance-over-1km'] : []),
        ],
      }],
    }
  }
}
