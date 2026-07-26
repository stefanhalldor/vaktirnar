import 'server-only'

import { ROUTE_FAMILIES } from './routeFamilies'
import type {
  IcelandRoutingProvider,
  IcelandRoutingRequest,
  IcelandRoutingResult,
} from './routingProvider'
import type { LatLon } from './types'

/**
 * Teskeid routing provider — corridor fixture experiment.
 *
 * Phase 1 (this file): returns curated corridor waypoints from ROUTE_FAMILIES as a
 * fixed geometry path. The geometry is not turn-by-turn; it consists of the same
 * hand-verified corridor waypoints already used for provider station matching.
 *
 * Purpose: validate the shadow runner contract end-to-end against real origin/
 * destination pairs before committing to a routing engine or open-data source.
 *
 * Limitations:
 * - Only routes originating in the capital region are matched.
 * - Distance and duration are corridor-length estimates, not road-network distances.
 * - segmentIds are empty until segment geometry is verified and linked (future R2 work).
 * - confidence is always 'experimental'.
 *
 * This provider must never be used as the primary provider for user-facing results.
 */

/** Haversine distance in metres between two lat/lon points. */
function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLon = ((bLon - aLon) * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const a =
    sinDLat * sinDLat +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * sinDLon * sinDLon
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function distM(a: LatLon, b: LatLon): number {
  return haversineM(a.lat, a.lon, b.lat, b.lon)
}

/** Capital-region anchor used to qualify origin for fixture matching. */
const CAPITAL_ANCHOR: LatLon = { lat: 64.135, lon: -21.895 }

/**
 * Maximum distance from origin to the capital anchor for a route to be matchable.
 * Covers Greater Reykjavík, Reykjanes, and the near capital area (~120 km radius).
 */
const ORIGIN_CAPITAL_MAX_M = 120_000

/**
 * Maximum distance from the destination to a route family's terminal waypoint.
 * ~80 km covers the immediate area around major destinations.
 */
const DEST_TERMINAL_MAX_M = 80_000

/** Average speed used to estimate duration from corridor distance. */
const AVG_SPEED_KMH = 85

function matchRouteFamily(
  origin: LatLon,
  destination: LatLon,
): (typeof ROUTE_FAMILIES)[number] | null {
  // Only match capital-originating routes for now.
  if (distM(origin, CAPITAL_ANCHOR) > ORIGIN_CAPITAL_MAX_M) return null

  let best: { family: (typeof ROUTE_FAMILIES)[number]; distM: number } | null = null

  for (const family of ROUTE_FAMILIES) {
    const waypoints = family.corridorWaypoints
    if (waypoints.length === 0) continue
    const terminal = waypoints[waypoints.length - 1]
    const d = distM(destination, terminal)
    if (d <= DEST_TERMINAL_MAX_M) {
      if (!best || d < best.distM) {
        best = { family, distM: d }
      }
    }
  }

  return best?.family ?? null
}

function corridorDistance(waypoints: readonly LatLon[]): number {
  let total = 0
  for (let i = 1; i < waypoints.length; i++) {
    total += distM(waypoints[i - 1], waypoints[i])
  }
  return total
}

export class TeskeidRoutingProvider implements IcelandRoutingProvider {
  readonly id = 'teskeid_routes' as const

  async calculateRoutes(request: IcelandRoutingRequest): Promise<IcelandRoutingResult> {
    const family = matchRouteFamily(request.origin.point, request.destination.point)

    if (!family) {
      // Stable, privacy-safe error code — no coordinates or place labels in the message.
      throw new Error('teskeid_routes: no_corridor_fixture')
    }

    const geometry = family.corridorWaypoints as readonly LatLon[]
    const distanceM = Math.round(corridorDistance(geometry))
    const durationS = Math.round((distanceM / 1000 / AVG_SPEED_KMH) * 3600)

    return {
      provider: 'teskeid_routes',
      calculatedAt: new Date().toISOString(),
      paths: [
        {
          id: `teskeid-${family.id}-fixture`,
          geometry,
          distanceM,
          durationS,
          segmentIds: [],
          routeFamilyId: family.id,
          resultKind: 'corridor_fixture',
          confidence: 'experimental',
          warnings: [
            'corridor-waypoints-only: not turn-by-turn; distance and duration are estimates',
          ],
        },
      ],
    }
  }
}
