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

/**
 * Extended threshold for Vegagerðin route station matching.
 *
 * Vegagerðin stations are physical roadside measurement posts. Their registered
 * coordinates can be several hundred metres from the road centreline (offset to
 * verge or service area), and the route polyline uses projected road centrelines.
 * A 2.5 km buffer catches stations that are genuinely on the route but fall just
 * outside the strict 1 km threshold due to coordinate offset or road geometry.
 *
 * False-positive risk is low on Icelandic highways: parallel roads within 2.5 km
 * are rare outside of Reykjavík, and each match is still projected to its nearest
 * route segment so `distanceFromOriginM` / `routeFraction` are accurate.
 */
export const VEGAGERDIN_PROVIDER_ROUTE_MAX_DISTANCE_M = 2_500

/**
 * Confidence boundary used when comparing route alternatives. A point more
 * than 50 km along the route from the nearest usable road-weather station is
 * treated as having limited measurement coverage. This mirrors the existing
 * 50 km unavailable-confidence boundary used by the Veðurstofan station
 * provider while keeping the claim strictly about evidence, not bad weather.
 */
export const ROUTE_WEATHER_STATION_CONFIDENCE_DISTANCE_KM = 50

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

/**
 * Returns the greatest along-route distance from any route position to the
 * nearest matched station. End points are included, while gaps between two
 * stations contribute half their length because either station can cover the
 * midpoint. Returns null when the route or station evidence is unavailable.
 */
export function maximumRouteDistanceToMatchedStationKm(
  routeDistanceKm: number,
  routeFractions: readonly number[],
): number | null {
  if (!Number.isFinite(routeDistanceKm) || routeDistanceKm <= 0) return null
  const positions = [...new Set(routeFractions
    .filter(fraction => Number.isFinite(fraction))
    .map(fraction => Math.max(0, Math.min(1, fraction))))]
    .sort((a, b) => a - b)
  if (positions.length === 0) return null

  let maximumFraction = Math.max(positions[0], 1 - positions[positions.length - 1])
  for (let index = 1; index < positions.length; index += 1) {
    maximumFraction = Math.max(maximumFraction, (positions[index] - positions[index - 1]) / 2)
  }
  return maximumFraction * routeDistanceKm
}

export type RouteMeasurementGap = {
  startFraction: number
  endFraction: number
  distanceKm: number
}

/**
 * Returns the exact portions of a route that are farther than `maximumDistanceKm`
 * along the route from every usable matched station.
 *
 * Station positions are provider-neutral route fractions. Each station covers
 * the interval `±maximumDistanceKm`; the returned gaps are the complement of
 * the merged coverage intervals. With no usable stations the whole route is a
 * measurement gap, matching the existing limited-confidence policy.
 */
export function routeMeasurementGaps(
  routeDistanceKm: number,
  routeFractions: readonly number[],
  maximumDistanceKm = ROUTE_WEATHER_STATION_CONFIDENCE_DISTANCE_KM,
): RouteMeasurementGap[] {
  if (
    !Number.isFinite(routeDistanceKm)
    || routeDistanceKm <= 0
    || !Number.isFinite(maximumDistanceKm)
    || maximumDistanceKm < 0
  ) return []

  const positions = [...new Set(routeFractions
    .filter(fraction => Number.isFinite(fraction))
    .map(fraction => Math.max(0, Math.min(1, fraction))))]
    .sort((a, b) => a - b)

  if (positions.length === 0) {
    return [{ startFraction: 0, endFraction: 1, distanceKm: routeDistanceKm }]
  }

  const coverageFraction = maximumDistanceKm / routeDistanceKm
  const coverageIntervals = positions.map(position => ({
    start: Math.max(0, position - coverageFraction),
    end: Math.min(1, position + coverageFraction),
  }))
  const mergedCoverage: Array<{ start: number; end: number }> = []
  for (const interval of coverageIntervals) {
    const previous = mergedCoverage[mergedCoverage.length - 1]
    if (!previous || interval.start > previous.end) {
      mergedCoverage.push({ ...interval })
    } else {
      previous.end = Math.max(previous.end, interval.end)
    }
  }

  const gaps: RouteMeasurementGap[] = []
  let coveredUntil = 0
  for (const interval of mergedCoverage) {
    if (interval.start > coveredUntil) {
      gaps.push({
        startFraction: coveredUntil,
        endFraction: interval.start,
        distanceKm: (interval.start - coveredUntil) * routeDistanceKm,
      })
    }
    coveredUntil = Math.max(coveredUntil, interval.end)
  }
  if (coveredUntil < 1) {
    gaps.push({
      startFraction: coveredUntil,
      endFraction: 1,
      distanceKm: (1 - coveredUntil) * routeDistanceKm,
    })
  }
  return gaps
}

/**
 * Extracts a route geometry between two along-route fractions. Boundary points
 * are interpolated on their containing segments so the rendered gap begins and
 * ends at the same 50 km policy boundary used by `routeMeasurementGaps`.
 */
export function sliceRoutePolylineByFractions(
  points: ReadonlyArray<{ lat: number; lon: number }>,
  startFraction: number,
  endFraction: number,
): Array<{ lat: number; lon: number }> {
  if (
    points.length < 2
    || !Number.isFinite(startFraction)
    || !Number.isFinite(endFraction)
  ) return []

  const start = Math.max(0, Math.min(1, Math.min(startFraction, endFraction)))
  const end = Math.max(0, Math.min(1, Math.max(startFraction, endFraction)))
  if (end <= start) return []

  const segmentLengths = points.slice(1).map((point, index) => (
    haversineM(points[index].lat, points[index].lon, point.lat, point.lon)
  ))
  const totalDistanceM = segmentLengths.reduce((sum, distance) => sum + distance, 0)
  if (totalDistanceM <= 0) return []

  const startDistanceM = start * totalDistanceM
  const endDistanceM = end * totalDistanceM
  const result: Array<{ lat: number; lon: number }> = []
  const appendPoint = (point: { lat: number; lon: number }) => {
    const previous = result[result.length - 1]
    if (previous && previous.lat === point.lat && previous.lon === point.lon) return
    result.push(point)
  }

  let traversedM = 0
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLengthM = segmentLengths[index]
    const segmentStartM = traversedM
    const segmentEndM = traversedM + segmentLengthM
    traversedM = segmentEndM
    if (segmentLengthM <= 0 || segmentEndM < startDistanceM) continue
    if (segmentStartM > endDistanceM) break

    const overlapStartM = Math.max(startDistanceM, segmentStartM)
    const overlapEndM = Math.min(endDistanceM, segmentEndM)
    if (overlapEndM < overlapStartM) continue
    const from = points[index]
    const to = points[index + 1]
    const interpolate = (distanceM: number) => {
      const ratio = (distanceM - segmentStartM) / segmentLengthM
      return {
        lat: from.lat + ((to.lat - from.lat) * ratio),
        lon: from.lon + ((to.lon - from.lon) * ratio),
      }
    }
    appendPoint(interpolate(overlapStartM))
    appendPoint(interpolate(overlapEndM))
  }

  return result.length >= 2 ? result : []
}

type BoundedRdpSegment = {
  startIndex: number
  endIndex: number
  splitIndex: number
  deviationM: number
}

function boundedRdpSegment(
  points: ReadonlyArray<{ lat: number; lon: number }>,
  startIndex: number,
  endIndex: number,
): BoundedRdpSegment | null {
  if (endIndex <= startIndex + 1) return null

  const first = points[startIndex]
  const last = points[endIndex]
  let splitIndex = -1
  let deviationM = -1
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const deviation = perpendicularToSegmentM(
      points[index].lat,
      points[index].lon,
      first.lat,
      first.lon,
      last.lat,
      last.lon,
    )
    if (deviation > deviationM) {
      splitIndex = index
      deviationM = deviation
    }
  }

  return splitIndex < 0
    ? null
    : { startIndex, endIndex, splitIndex, deviationM }
}

function pushBoundedRdpSegment(
  heap: BoundedRdpSegment[],
  segment: BoundedRdpSegment,
): void {
  heap.push(segment)
  let index = heap.length - 1
  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2)
    if (heap[parentIndex].deviationM >= segment.deviationM) break
    heap[index] = heap[parentIndex]
    index = parentIndex
  }
  heap[index] = segment
}

function popBoundedRdpSegment(heap: BoundedRdpSegment[]): BoundedRdpSegment | null {
  if (heap.length === 0) return null
  const first = heap[0]
  const last = heap.pop()!
  if (heap.length === 0) return first

  let index = 0
  while (true) {
    const leftIndex = index * 2 + 1
    if (leftIndex >= heap.length) break
    const rightIndex = leftIndex + 1
    const childIndex = rightIndex < heap.length
      && heap[rightIndex].deviationM > heap[leftIndex].deviationM
      ? rightIndex
      : leftIndex
    if (heap[childIndex].deviationM <= last.deviationM) break
    heap[index] = heap[childIndex]
    index = childIndex
  }
  heap[index] = last
  return first
}

/**
 * Shape-preserving RDP simplification with a hard point budget.
 *
 * Segments with the greatest deviation are split first. This retains the most
 * important bends when a dense provider polyline cannot fit inside a transport
 * contract, instead of stride sampling that can skip fjords or mountain bends.
 * The first and last points are always preserved and the input is never mutated.
 */
export function rdpSimplifyToMaxPoints(
  points: ReadonlyArray<{ lat: number; lon: number }>,
  epsilonM: number,
  maxPoints: number,
): Array<{ lat: number; lon: number }> {
  if (!Number.isFinite(epsilonM) || epsilonM < 0) {
    throw new Error('epsilonM must be a non-negative finite number')
  }
  if (!Number.isInteger(maxPoints) || maxPoints < 2) {
    throw new Error('maxPoints must be an integer of at least 2')
  }
  if (points.length <= 2) return points.map(point => ({ ...point }))

  const kept = new Uint8Array(points.length)
  kept[0] = 1
  kept[points.length - 1] = 1
  let keptCount = 2

  const heap: BoundedRdpSegment[] = []
  const initial = boundedRdpSegment(points, 0, points.length - 1)
  if (initial) pushBoundedRdpSegment(heap, initial)

  while (keptCount < maxPoints) {
    const segment = popBoundedRdpSegment(heap)
    if (!segment || segment.deviationM <= epsilonM) break

    kept[segment.splitIndex] = 1
    keptCount += 1
    const left = boundedRdpSegment(points, segment.startIndex, segment.splitIndex)
    const right = boundedRdpSegment(points, segment.splitIndex, segment.endIndex)
    if (left) pushBoundedRdpSegment(heap, left)
    if (right) pushBoundedRdpSegment(heap, right)
  }

  const result: Array<{ lat: number; lon: number }> = []
  for (let index = 0; index < points.length; index += 1) {
    if (kept[index]) result.push({ ...points[index] })
  }
  return result
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
