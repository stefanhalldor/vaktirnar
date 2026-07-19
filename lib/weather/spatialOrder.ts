/**
 * Spatial ordering helpers for station context maps and nearby forecast cards.
 *
 * Stations that are nearest to a point may not be in a logical geographic order
 * for a driver. These helpers reorder a set of nearby stations so that the rendered
 * list reads naturally on a map: north-to-south when latitude spread dominates,
 * west-to-east when longitude spread dominates.
 *
 * Reusable for Vegagerðin-near-Veðurstofan, Veðurstofan-near-Vegagerðin, and
 * route-segment station context when route-order is not available.
 */

/**
 * Sorts stations by the dominant geographic axis of their extent.
 * Adjusts longitude spread for Iceland's latitude so that degrees-per-km
 * are comparable between axes before choosing the sort direction.
 *
 * - Latitude spread dominates → north-to-south (descending lat)
 * - Longitude spread dominates → west-to-east (ascending lon; Iceland lons are negative)
 *
 * Returns a new array; does not mutate the input.
 */
export function sortStationsForContext<T extends { lat: number; lon: number }>(stations: T[]): T[] {
  if (stations.length <= 1) return [...stations]
  const lats = stations.map(s => s.lat)
  const lons = stations.map(s => s.lon)
  const latSpread = Math.max(...lats) - Math.min(...lats)
  const lonSpread = Math.max(...lons) - Math.min(...lons)
  // Cosine correction so one degree of longitude is comparable to one degree of latitude
  const midLat = (Math.max(...lats) + Math.min(...lats)) / 2
  const adjustedLonSpread = lonSpread * Math.cos((midLat * Math.PI) / 180)
  return latSpread >= adjustedLonSpread
    ? [...stations].sort((a, b) => b.lat - a.lat) // north-to-south
    : [...stations].sort((a, b) => a.lon - b.lon) // west-to-east
}
