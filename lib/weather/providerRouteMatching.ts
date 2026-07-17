/**
 * Provider-neutral route geometry matching.
 *
 * Matches fixed provider points (e.g. Veðurstofan stations, future Vegagerðin points)
 * directly against a route polyline — not through sampled MET/Yr forecast points.
 *
 * Usage:
 *   const matches = matchProviderPointsToRoute({
 *     points: providerPoints,
 *     routePolyline: routeGeometry.points,
 *     maxDistanceM: 15_000,
 *   })
 */

/**
 * Product-policy maximum perpendicular distance from route polyline for fixed provider points.
 * Used by both the route-selection provider-stations endpoint and the final travel route endpoint
 * so both surfaces show the same stations. Change here to update both simultaneously.
 */
export const DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M = 1_000

export type ProviderRoutePoint = {
  id: string
  name?: string | null
  lat: number | null
  lon: number | null
}

export type ProviderRouteMatch<T extends ProviderRoutePoint> = {
  point: T
  distanceM: number
  distanceFromOriginM: number
  routeFraction: number
  nearestRoutePoint: { lat: number; lon: number }
}

/** A Veðurstofan (or future provider) station matched to a route, with forecast data for the preview card. */
export type ProviderStationPoint = {
  stationId: string
  stationName: string
  lat: number
  lon: number
  distanceM: number
  distanceFromOriginM: number
  routeFraction: number
  atimeIso: string | null
  sourceUrl: string | null
  forecastRows: Array<{
    ftimeIso: string
    windSpeedMs: number | null
    precipitationMmPerHour: number | null
    temperatureC: number | null
    windDirectionText: string | null
    weatherText: string | null
  }>
}

/** Haversine great-circle distance between two WGS84 points, in metres. */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Ramer-Douglas-Peucker simplification ─────────────────────────────────────

/**
 * Perpendicular distance from point P to line segment AB, in metres.
 * Uses flat-earth approximation (valid for short segments, ≤500 km).
 * Falls back to haversine distance when A === B.
 */
function perpendicularToSegmentM(
  pLat: number, pLon: number,
  aLat: number, aLon: number,
  bLat: number, bLon: number,
): number {
  const cosLat = Math.cos(((aLat + bLat) / 2) * Math.PI / 180)
  const mPerDegLat = 111_320
  const mPerDegLon = mPerDegLat * cosLat
  const bx = (bLon - aLon) * mPerDegLon
  const by = (bLat - aLat) * mPerDegLat
  const px = (pLon - aLon) * mPerDegLon
  const py = (pLat - aLat) * mPerDegLat
  const len2 = bx * bx + by * by
  if (len2 === 0) return haversineM(pLat, pLon, aLat, aLon)
  return Math.abs(px * by - py * bx) / Math.sqrt(len2)
}

/**
 * Ramer-Douglas-Peucker polyline simplification.
 *
 * Keeps points that deviate more than epsilonM metres from the simplified chord.
 * Always preserves the first and last point.
 *
 * Use this instead of stride sampling when route shape must be preserved: straight
 * highway segments are aggressively pruned while curves and fjords are retained.
 * Suitable for `providerMatchingPoints` in RouteGeometry.
 */
export function rdpSimplify(
  points: ReadonlyArray<{ lat: number; lon: number }>,
  epsilonM: number,
): Array<{ lat: number; lon: number }> {
  if (points.length <= 2) return [...points]

  const first = points[0]
  const last = points[points.length - 1]

  let maxDist = 0
  let maxIdx = 0
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularToSegmentM(
      points[i].lat, points[i].lon,
      first.lat, first.lon,
      last.lat, last.lon,
    )
    if (d > maxDist) { maxDist = d; maxIdx = i }
  }

  if (maxDist > epsilonM) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilonM)
    const right = rdpSimplify(points.slice(maxIdx), epsilonM)
    // left ends with points[maxIdx], right starts with points[maxIdx] — drop duplicate
    return [...left.slice(0, -1), ...right]
  }

  return [{ ...first }, { ...last }]
}

// ── Point-to-polyline distance ────────────────────────────────────────────────

/**
 * Minimum distance in metres from a fixed point to any segment of a polyline.
 *
 * Uses clamped projection onto each segment (flat-earth approximation, valid
 * for segments ≤500 km). This is strictly better than vertex-only proximity:
 * if a route segment passes within radiusM of the point but no decoded vertex
 * lands inside the radius, vertex-only checks would miss it.
 *
 * Returns Infinity for an empty polyline.
 *
 * Use this wherever a yes/no "does the route pass within X metres of this
 * point?" decision is needed (caution detection, gate matching, etc.).
 */
export function pointToPolylineDistanceM(
  lat: number,
  lon: number,
  polyline: ReadonlyArray<{ lat: number; lon: number }>,
): number {
  if (polyline.length === 0) return Infinity
  if (polyline.length === 1) return haversineM(lat, lon, polyline[0].lat, polyline[0].lon)
  let minDistM = Infinity
  for (let i = 0; i + 1 < polyline.length; i++) {
    const aLat = polyline[i].lat, aLon = polyline[i].lon
    const bLat = polyline[i + 1].lat, bLon = polyline[i + 1].lon
    const cosLat = Math.cos(((aLat + bLat) / 2) * Math.PI / 180)
    const mPerDegLat = 111_320
    const mPerDegLon = mPerDegLat * cosLat
    const bx = (bLon - aLon) * mPerDegLon
    const by = (bLat - aLat) * mPerDegLat
    const px = (lon - aLon) * mPerDegLon
    const py = (lat - aLat) * mPerDegLat
    const len2 = bx * bx + by * by
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2))
    const d = haversineM(lat, lon, aLat + t * (bLat - aLat), aLon + t * (bLon - aLon))
    if (d < minDistM) minDistM = d
  }
  return minDistM
}

// ── Segment projection ────────────────────────────────────────────────────────

type ProjectionResult = {
  distanceM: number
  distanceFromOriginM: number
  routeFraction: number
  nearestLat: number
  nearestLon: number
}

/**
 * Projects a point onto the nearest polyline segment.
 * Assumes polyline has at least one point; callers must guard on empty polyline.
 */
function projectToPolyline(
  pLat: number, pLon: number,
  polyline: ReadonlyArray<{ lat: number; lon: number }>,
): ProjectionResult {
  if (polyline.length === 1) {
    return {
      distanceM: Math.round(haversineM(pLat, pLon, polyline[0].lat, polyline[0].lon)),
      distanceFromOriginM: 0,
      routeFraction: 0,
      nearestLat: polyline[0].lat,
      nearestLon: polyline[0].lon,
    }
  }
  // Precompute segment lengths and total route length
  let totalLengthM = 0
  const segLengths: number[] = []
  for (let i = 0; i + 1 < polyline.length; i++) {
    const len = haversineM(polyline[i].lat, polyline[i].lon, polyline[i + 1].lat, polyline[i + 1].lon)
    segLengths.push(len)
    totalLengthM += len
  }
  // Find nearest segment and clamped projection parameter t
  let minDistM = Infinity
  let bestSegIdx = 0
  let bestT = 0
  for (let i = 0; i + 1 < polyline.length; i++) {
    const aLat = polyline[i].lat, aLon = polyline[i].lon
    const bLat = polyline[i + 1].lat, bLon = polyline[i + 1].lon
    const cosLat = Math.cos(((aLat + bLat) / 2) * Math.PI / 180)
    const mPerDegLat = 111_320
    const mPerDegLon = mPerDegLat * cosLat
    const bx = (bLon - aLon) * mPerDegLon
    const by = (bLat - aLat) * mPerDegLat
    const px = (pLon - aLon) * mPerDegLon
    const py = (pLat - aLat) * mPerDegLat
    const len2 = bx * bx + by * by
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2))
    const d = haversineM(pLat, pLon, aLat + t * (bLat - aLat), aLon + t * (bLon - aLon))
    if (d < minDistM) { minDistM = d; bestSegIdx = i; bestT = t }
  }
  // Accumulate distance from origin to projected point
  let distFromOriginM = 0
  for (let i = 0; i < bestSegIdx; i++) distFromOriginM += segLengths[i]
  distFromOriginM += bestT * segLengths[bestSegIdx]
  const nearestLat = polyline[bestSegIdx].lat + bestT * (polyline[bestSegIdx + 1].lat - polyline[bestSegIdx].lat)
  const nearestLon = polyline[bestSegIdx].lon + bestT * (polyline[bestSegIdx + 1].lon - polyline[bestSegIdx].lon)
  return {
    distanceM: Math.round(minDistM),
    distanceFromOriginM: Math.round(distFromOriginM),
    routeFraction: totalLengthM > 0 ? distFromOriginM / totalLengthM : 0,
    nearestLat,
    nearestLon,
  }
}

/**
 * Matches fixed provider points to a route polyline by direct spatial proximity.
 *
 * Rules:
 * - Points with null, undefined, or non-finite coordinates are ignored.
 * - Each point is projected to the nearest polyline segment (not just nearest vertex).
 * - Only points within `maxDistanceM` metres of the polyline are included.
 * - Duplicate `id` values: first occurrence wins.
 * - Result is sorted by `distanceFromOriginM` ascending, then by `id` for stable output.
 * - If `maxPoints` is provided, result is capped after sorting.
 * - Empty routePolyline returns []; single-point polyline is handled safely.
 */
export function matchProviderPointsToRoute<T extends ProviderRoutePoint>(input: {
  points: readonly T[]
  routePolyline: ReadonlyArray<{ lat: number; lon: number }>
  maxDistanceM: number
  maxPoints?: number
}): ProviderRouteMatch<T>[] {
  const { points, routePolyline, maxDistanceM, maxPoints } = input

  if (routePolyline.length === 0) return []

  const seen = new Set<string>()
  const matches: ProviderRouteMatch<T>[] = []

  for (const point of points) {
    if (point.lat === null || point.lat === undefined || !isFinite(point.lat)) continue
    if (point.lon === null || point.lon === undefined || !isFinite(point.lon)) continue
    if (seen.has(point.id)) continue
    seen.add(point.id)

    const proj = projectToPolyline(point.lat, point.lon, routePolyline)
    if (proj.distanceM > maxDistanceM) continue

    matches.push({
      point,
      distanceM: proj.distanceM,
      distanceFromOriginM: proj.distanceFromOriginM,
      routeFraction: proj.routeFraction,
      nearestRoutePoint: { lat: proj.nearestLat, lon: proj.nearestLon },
    })
  }

  matches.sort((a, b) =>
    a.distanceFromOriginM !== b.distanceFromOriginM
      ? a.distanceFromOriginM - b.distanceFromOriginM
      : a.point.id.localeCompare(b.point.id),
  )

  return maxPoints !== undefined ? matches.slice(0, maxPoints) : matches
}
