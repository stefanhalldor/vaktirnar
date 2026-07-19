/**
 * Haversine-based station filter for the /vedrid overview route lens.
 *
 * Filters weather stations to those within the corridor of a resolved route family.
 * Returns null when no route is resolved (show all stations).
 */

import type { OverviewRouteLensResult } from './lensTypes'

function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * Returns a Set of station IDs that fall within the route corridor.
 * Returns null when lensResult is not 'resolved' — callers should show all stations.
 *
 * @param stations - Array of stations with id, lat, lon (both providers combined).
 * @param lensResult - Current route lens resolution result.
 */
export function filterStationIdsForRouteLens(
  stations: readonly { id: string; lat: number; lon: number }[],
  lensResult: OverviewRouteLensResult,
): Set<string> | null {
  if (lensResult.status !== 'resolved') return null

  const { corridorWaypoints, corridorRadiusKm } = lensResult.routeFamily
  const result = new Set<string>()

  for (const station of stations) {
    for (const waypoint of corridorWaypoints) {
      if (haversineKm(station, waypoint) <= corridorRadiusKm) {
        result.add(station.id)
        break
      }
    }
  }

  return result
}
