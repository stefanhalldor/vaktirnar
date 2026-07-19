/**
 * Nearest-station spatial helpers.
 *
 * Uses the haversine formula for great-circle distance on the Earth's surface.
 * Suitable for Iceland-scale distances where flat-earth approximations introduce
 * meaningful error (fjords, mountains). Not accurate for route-network proximity.
 */

const EARTH_RADIUS_M = 6_371_000

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Returns the approximate straight-line distance in metres between two
 * WGS84 coordinates using the haversine formula.
 */
export function haversineDistanceM(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
): number {
  const dLat = toRad(to.lat - from.lat)
  const dLon = toRad(to.lon - from.lon)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export type NearestStation = {
  stationId: string
  name: string
  lat: number
  lon: number
  /** Straight-line distance from the reference point in metres. */
  distanceM: number
}

/**
 * Returns the N nearest stations to the reference point, sorted by distance
 * ascending. Ties are broken by stationId for deterministic ordering.
 *
 * Stations without a valid stationId, lat, or lon are excluded.
 * If fewer than N candidates have coordinates, returns all that do.
 */
export function findNearestStations(
  ref: { lat: number; lon: number },
  candidates: ReadonlyArray<{ stationId: string | null; name: string; lat: number | null; lon: number | null }>,
  n: number
): NearestStation[] {
  const scored: NearestStation[] = []
  for (const c of candidates) {
    if (!c.stationId || c.lat === null || c.lon === null) continue
    scored.push({
      stationId: c.stationId,
      name: c.name,
      lat: c.lat,
      lon: c.lon,
      distanceM: haversineDistanceM(ref, { lat: c.lat, lon: c.lon }),
    })
  }
  scored.sort((a, b) => a.distanceM - b.distanceM || a.stationId.localeCompare(b.stationId))
  return scored.slice(0, n)
}
