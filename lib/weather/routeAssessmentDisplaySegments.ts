import { haversineM } from './providerRouteMatching'

export type RouteDisplayPoint = Readonly<{
  lat: number
  lon: number
}>

export type RouteAssessmentDisplaySegments = Readonly<{
  unassessedBefore: RouteDisplayPoint[]
  assessed: RouteDisplayPoint[]
  unassessedAfter: RouteDisplayPoint[]
  assessedStartPoint: RouteDisplayPoint
  assessedEndPoint: RouteDisplayPoint
}>

const FRACTION_EPSILON = 1e-6
const DISTANCE_EPSILON_M = 0.01

function hasValidCoordinates(point: RouteDisplayPoint): boolean {
  return Number.isFinite(point.lat)
    && Number.isFinite(point.lon)
    && point.lat >= -90
    && point.lat <= 90
    && point.lon >= -180
    && point.lon <= 180
}

function hasValidAssessedRange(startRouteFraction: number, endRouteFraction: number): boolean {
  return Number.isFinite(startRouteFraction)
    && Number.isFinite(endRouteFraction)
    && startRouteFraction >= 0
    && endRouteFraction <= 1
    && startRouteFraction < endRouteFraction
}

/**
 * A partial assessment may only display provider evidence with a verified
 * position inside its signed route-fraction boundary. Missing fractions fail
 * closed instead of being presented as evidence for the assessed section.
 */
export function isRouteFractionWithinAssessedRange(
  routeFraction: number | null | undefined,
  startRouteFraction: number,
  endRouteFraction: number,
): boolean {
  if (
    !hasValidAssessedRange(startRouteFraction, endRouteFraction)
    || routeFraction === null
    || routeFraction === undefined
    || !Number.isFinite(routeFraction)
  ) return false

  return routeFraction >= startRouteFraction - FRACTION_EPSILON
    && routeFraction <= endRouteFraction + FRACTION_EPSILON
}

function interpolatePoint(
  start: RouteDisplayPoint,
  end: RouteDisplayPoint,
  fraction: number,
): RouteDisplayPoint {
  return {
    lat: start.lat + (end.lat - start.lat) * fraction,
    lon: start.lon + (end.lon - start.lon) * fraction,
  }
}

function pointAtDistance(
  points: readonly RouteDisplayPoint[],
  cumulativeDistancesM: readonly number[],
  targetDistanceM: number,
): RouteDisplayPoint {
  const lastIndex = points.length - 1
  if (targetDistanceM <= DISTANCE_EPSILON_M) return { ...points[0] }
  if (targetDistanceM >= cumulativeDistancesM[lastIndex] - DISTANCE_EPSILON_M) {
    return { ...points[lastIndex] }
  }

  for (let index = 1; index <= lastIndex; index += 1) {
    const segmentEndDistanceM = cumulativeDistancesM[index]
    if (segmentEndDistanceM < targetDistanceM) continue

    const segmentStartDistanceM = cumulativeDistancesM[index - 1]
    const segmentDistanceM = segmentEndDistanceM - segmentStartDistanceM
    if (segmentDistanceM <= DISTANCE_EPSILON_M) return { ...points[index] }

    return interpolatePoint(
      points[index - 1],
      points[index],
      (targetDistanceM - segmentStartDistanceM) / segmentDistanceM,
    )
  }

  return { ...points[lastIndex] }
}

function pointsAreEqual(a: RouteDisplayPoint, b: RouteDisplayPoint): boolean {
  return Math.abs(a.lat - b.lat) <= Number.EPSILON
    && Math.abs(a.lon - b.lon) <= Number.EPSILON
}

function sliceRouteByDistance(
  points: readonly RouteDisplayPoint[],
  cumulativeDistancesM: readonly number[],
  startDistanceM: number,
  endDistanceM: number,
): RouteDisplayPoint[] {
  if (endDistanceM - startDistanceM <= DISTANCE_EPSILON_M) return []

  const result: RouteDisplayPoint[] = [
    pointAtDistance(points, cumulativeDistancesM, startDistanceM),
  ]

  for (let index = 1; index < points.length - 1; index += 1) {
    const distanceM = cumulativeDistancesM[index]
    if (
      distanceM > startDistanceM + DISTANCE_EPSILON_M
      && distanceM < endDistanceM - DISTANCE_EPSILON_M
    ) result.push({ ...points[index] })
  }

  const endPoint = pointAtDistance(points, cumulativeDistancesM, endDistanceM)
  if (!pointsAreEqual(result[result.length - 1], endPoint)) result.push(endPoint)
  return result.length >= 2 ? result : []
}

/**
 * Splits a route polyline at fractional distances along its actual cumulative
 * geometry. Boundary points are interpolated inside their line segment so the
 * display does not move the truth boundary to a nearby sampled vertex.
 */
export function splitRouteByAssessedFractions(
  points: readonly RouteDisplayPoint[],
  startRouteFraction: number,
  endRouteFraction: number,
): RouteAssessmentDisplaySegments | null {
  if (
    points.length < 2
    || points.some(point => !hasValidCoordinates(point))
    || !hasValidAssessedRange(startRouteFraction, endRouteFraction)
  ) return null

  const cumulativeDistancesM: number[] = [0]
  for (let index = 1; index < points.length; index += 1) {
    cumulativeDistancesM.push(
      cumulativeDistancesM[index - 1]
        + haversineM(
          points[index - 1].lat,
          points[index - 1].lon,
          points[index].lat,
          points[index].lon,
        ),
    )
  }

  const totalDistanceM = cumulativeDistancesM[cumulativeDistancesM.length - 1]
  if (!Number.isFinite(totalDistanceM) || totalDistanceM <= DISTANCE_EPSILON_M) return null

  const startDistanceM = totalDistanceM * startRouteFraction
  const endDistanceM = totalDistanceM * endRouteFraction
  const assessed = sliceRouteByDistance(
    points,
    cumulativeDistancesM,
    startDistanceM,
    endDistanceM,
  )
  if (assessed.length < 2) return null

  return {
    unassessedBefore: startRouteFraction > FRACTION_EPSILON
      ? sliceRouteByDistance(points, cumulativeDistancesM, 0, startDistanceM)
      : [],
    assessed,
    unassessedAfter: endRouteFraction < 1 - FRACTION_EPSILON
      ? sliceRouteByDistance(points, cumulativeDistancesM, endDistanceM, totalDistanceM)
      : [],
    assessedStartPoint: assessed[0],
    assessedEndPoint: assessed[assessed.length - 1],
  }
}
