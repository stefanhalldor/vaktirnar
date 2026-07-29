import { haversineDistanceM } from './roadGraph'
import type { IcelandRoadGraphEdge } from './roadGraphTypes'

export type TrustedRoutePoint = { lat: number; lon: number }

export type TrustedSettlementGeometry = {
  type: 'MultiPolygon'
  coordinates: readonly (readonly (readonly (readonly [number, number])[])[])[]
}

export type TrustedSettlementBoundary = {
  id: string
  name: string
  geometry: TrustedSettlementGeometry
}

export type RouteWeatherCoverageBoundary = {
  kind: 'exact' | 'settlement_gateway' | 'official_road_anchor'
  label: string
  point: TrustedRoutePoint
  routeFraction: number
  distanceFromTripOriginM: number
  /** Distance-proportional estimate because the current provider contract has route-level duration only. */
  elapsedFromTripOriginS: number
  roadNumber?: string
  roadName?: string
}

export type RouteWeatherCoverage =
  | {
      status: 'full' | 'partial'
      start: RouteWeatherCoverageBoundary
      end: RouteWeatherCoverageBoundary
      coverageDistanceM: number
      coverageDurationS: number
      unassessedBeforeM?: number
      unassessedAfterM?: number
      distanceConfidence: 'reference_route'
    }
  | {
      status: 'same_urban_area'
      settlementId: string
      settlementName: string
    }
  | {
      status: 'unavailable'
      reason:
        | 'invalid_reference_route'
        | 'road_graph_unavailable'
        | 'no_connected_official_road'
        | 'reference_route_mismatch'
    }

export type TrustedRouteCoverageInput = {
  origin: TrustedRoutePoint & { name: string }
  destination: TrustedRoutePoint & { name: string }
  referenceRoute: readonly TrustedRoutePoint[]
  routeDistanceM: number
  routeDurationS: number
  connectedRoadEdges: readonly IcelandRoadGraphEdge[]
  originSnapDistanceM: number
  destinationSnapDistanceM: number
  originSettlement?: TrustedSettlementBoundary | null
  destinationSettlement?: TrustedSettlementBoundary | null
}

type Projection = {
  distanceM: number
  distanceFromOriginM: number
  routeFraction: number
  nearestPoint: TrustedRoutePoint
  routeBearingDeg: number
}

type MatchedEdge = {
  edge: IcelandRoadGraphEdge
  startFraction: number
  endFraction: number
  startReferenceDistanceM: number
  endReferenceDistanceM: number
}

type MatchedRun = {
  edges: MatchedEdge[]
  startFraction: number
  endFraction: number
  startReferenceDistanceM: number
  endReferenceDistanceM: number
  graphLengthM: number
}

const MAX_ENDPOINT_REFERENCE_DISTANCE_M = 1_500
// A wider tolerance can silently accept a nearby parallel or private road as
// the official route. Fail closed once the two geometries are more than the
// normal low-metre provider/official-data drift apart.
const MAX_OFFICIAL_EDGE_DISTANCE_M = 25
const OFFICIAL_EDGE_SAMPLE_SPACING_M = 100
const MAX_EDGE_HEADING_DIFFERENCE_DEG = 50
const MAX_PROJECTION_BACKTRACK_M = 25
const MAX_CONTIGUOUS_REFERENCE_GAP_M = 500
const EXACT_ENDPOINT_SNAP_M = 250
const MIN_TRUSTED_RUN_M = 750

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function normalizeAngle(value: number): number {
  return ((value % 360) + 360) % 360
}

function angularDifference(a: number, b: number): number {
  const difference = Math.abs(normalizeAngle(a) - normalizeAngle(b))
  return Math.min(difference, 360 - difference)
}

function bearingDegrees(a: TrustedRoutePoint, b: TrustedRoutePoint): number {
  const lat1 = a.lat * Math.PI / 180
  const lat2 = b.lat * Math.PI / 180
  const dLon = (b.lon - a.lon) * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return normalizeAngle(Math.atan2(y, x) * 180 / Math.PI)
}

function cumulativeDistances(points: readonly TrustedRoutePoint[]): number[] {
  const distances = [0]
  for (let index = 1; index < points.length; index += 1) {
    distances.push(distances[index - 1] + haversineDistanceM(points[index - 1], points[index]))
  }
  return distances
}

function projectPointToReference(
  point: TrustedRoutePoint,
  referenceRoute: readonly TrustedRoutePoint[],
  cumulative: readonly number[],
): Projection | null {
  const totalDistanceM = cumulative[cumulative.length - 1] ?? 0
  if (referenceRoute.length < 2 || totalDistanceM <= 0) return null

  let best: (Projection & { segmentIndex: number }) | null = null
  for (let index = 0; index + 1 < referenceRoute.length; index += 1) {
    const a = referenceRoute[index]
    const b = referenceRoute[index + 1]
    const cosLat = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180)
    const metresPerDegreeLat = 111_320
    const metresPerDegreeLon = metresPerDegreeLat * cosLat
    const bx = (b.lon - a.lon) * metresPerDegreeLon
    const by = (b.lat - a.lat) * metresPerDegreeLat
    const px = (point.lon - a.lon) * metresPerDegreeLon
    const py = (point.lat - a.lat) * metresPerDegreeLat
    const lengthSquared = bx * bx + by * by
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / lengthSquared))
    const nearestPoint = {
      lat: a.lat + t * (b.lat - a.lat),
      lon: a.lon + t * (b.lon - a.lon),
    }
    const distanceM = haversineDistanceM(point, nearestPoint)
    if (!best || distanceM < best.distanceM) {
      const segmentDistanceM = (cumulative[index + 1] ?? cumulative[index]) - cumulative[index]
      const distanceFromOriginM = cumulative[index] + t * segmentDistanceM
      best = {
        distanceM,
        distanceFromOriginM,
        routeFraction: clamp01(distanceFromOriginM / totalDistanceM),
        nearestPoint,
        routeBearingDeg: bearingDegrees(a, b),
        segmentIndex: index,
      }
    }
  }
  return best
}

function sampledEdgePoints(edge: IcelandRoadGraphEdge): TrustedRoutePoint[] {
  if (edge.geometry.length < 2) return [...edge.geometry]
  const result: TrustedRoutePoint[] = [{ ...edge.geometry[0] }]
  for (let index = 0; index + 1 < edge.geometry.length; index += 1) {
    const start = edge.geometry[index]
    const end = edge.geometry[index + 1]
    const segmentDistanceM = haversineDistanceM(start, end)
    const segmentCount = Math.max(1, Math.ceil(segmentDistanceM / OFFICIAL_EDGE_SAMPLE_SPACING_M))
    for (let sample = 1; sample <= segmentCount; sample += 1) {
      const fraction = sample / segmentCount
      const point = {
        lat: start.lat + fraction * (end.lat - start.lat),
        lon: start.lon + fraction * (end.lon - start.lon),
      }
      const previous = result[result.length - 1]
      if (point.lat !== previous.lat || point.lon !== previous.lon) result.push(point)
    }
  }
  return result
}

function matchOfficialEdge(
  edge: IcelandRoadGraphEdge,
  referenceRoute: readonly TrustedRoutePoint[],
  cumulative: readonly number[],
): MatchedEdge | null {
  const samples = sampledEdgePoints(edge)
  const projections = samples
    .map(point => projectPointToReference(point, referenceRoute, cumulative))
    .filter((projection): projection is Projection => projection !== null)
  if (projections.length < 2) return null
  // Every distance-spaced sample must be close. An average/percentage rule can
  // hide one long sparse detour and incorrectly bridge an untrusted section.
  if (projections.some(projection => projection.distanceM > MAX_OFFICIAL_EDGE_DISTANCE_M)) {
    return null
  }
  for (let index = 1; index < projections.length; index += 1) {
    if (
      projections[index].distanceFromOriginM + MAX_PROJECTION_BACKTRACK_M
      < projections[index - 1].distanceFromOriginM
    ) {
      return null
    }
  }

  const first = projections[0]
  const last = projections[projections.length - 1]

  const edgeStart = samples[0]
  const edgeEnd = samples[samples.length - 1]
  const edgeLengthM = haversineDistanceM(edgeStart, edgeEnd)
  if (
    edgeLengthM >= 100
    && angularDifference(bearingDegrees(edgeStart, edgeEnd), first.routeBearingDeg)
      > MAX_EDGE_HEADING_DIFFERENCE_DEG
  ) {
    return null
  }

  return {
    edge,
    startFraction: clamp01(Math.min(first.routeFraction, last.routeFraction)),
    endFraction: clamp01(Math.max(first.routeFraction, last.routeFraction)),
    startReferenceDistanceM: Math.min(first.distanceFromOriginM, last.distanceFromOriginM),
    endReferenceDistanceM: Math.max(first.distanceFromOriginM, last.distanceFromOriginM),
  }
}

function buildMatchedRuns(
  matches: readonly (MatchedEdge | null)[],
  routeDistanceM: number,
): MatchedRun[] {
  const runs: MatchedRun[] = []
  let current: MatchedRun | null = null
  for (const match of matches) {
    const referenceGapM = current && match
      ? Math.max(0, match.startReferenceDistanceM - current.endReferenceDistanceM)
      : Number.POSITIVE_INFINITY
    const previousEdge = current?.edges[current.edges.length - 1]?.edge
    const continues = current !== null
      && match !== null
      && previousEdge?.toNodeId === match.edge.fromNodeId
      && match.startReferenceDistanceM + MAX_PROJECTION_BACKTRACK_M
        >= current.endReferenceDistanceM
      && referenceGapM <= MAX_CONTIGUOUS_REFERENCE_GAP_M
    if (!match || !continues || !current) {
      if (current) runs.push(current)
      current = match
        ? {
            edges: [match],
            startFraction: match.startFraction,
            endFraction: match.endFraction,
            startReferenceDistanceM: match.startReferenceDistanceM,
            endReferenceDistanceM: match.endReferenceDistanceM,
            graphLengthM: match.edge.lengthM,
          }
        : null
      continue
    }
    current.edges.push(match)
    current.endFraction = Math.max(current.endFraction, match.endFraction)
    current.endReferenceDistanceM = Math.max(
      current.endReferenceDistanceM,
      match.endReferenceDistanceM,
    )
    current.graphLengthM += match.edge.lengthM
  }
  if (current) runs.push(current)
  return runs.filter(run => (
    run.graphLengthM >= MIN_TRUSTED_RUN_M
    && (run.endFraction - run.startFraction) * routeDistanceM >= MIN_TRUSTED_RUN_M
  ))
}

function pointOnSegment(
  point: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
): boolean {
  const cross = (point[1] - a[1]) * (b[0] - a[0]) - (point[0] - a[0]) * (b[1] - a[1])
  if (Math.abs(cross) > 1e-12) return false
  return point[0] >= Math.min(a[0], b[0]) - 1e-12
    && point[0] <= Math.max(a[0], b[0]) + 1e-12
    && point[1] >= Math.min(a[1], b[1]) - 1e-12
    && point[1] <= Math.max(a[1], b[1]) + 1e-12
}

function pointInRing(
  point: readonly [number, number],
  ring: readonly (readonly [number, number])[],
): boolean {
  let inside = false
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const a = ring[previous]
    const b = ring[current]
    if (pointOnSegment(point, a, b)) return true
    const crosses = (a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    if (crosses) inside = !inside
  }
  return inside
}

function geometryContains(
  geometry: TrustedSettlementGeometry,
  point: TrustedRoutePoint,
): boolean {
  const coordinate: readonly [number, number] = [point.lon, point.lat]
  return geometry.coordinates.some(polygon => (
    Boolean(polygon[0])
    && pointInRing(coordinate, polygon[0])
    && !polygon.slice(1).some(hole => pointInRing(coordinate, hole))
  ))
}

function segmentIntersectionT(
  a: TrustedRoutePoint,
  b: TrustedRoutePoint,
  c: readonly [number, number],
  d: readonly [number, number],
): number | null {
  const ax = a.lon
  const ay = a.lat
  const bx = b.lon
  const by = b.lat
  const cx = c[0]
  const cy = c[1]
  const dx = d[0]
  const dy = d[1]
  const denominator = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx)
  if (Math.abs(denominator) < 1e-14) return null
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denominator
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denominator
  return t >= -1e-10 && t <= 1 + 1e-10 && u >= -1e-10 && u <= 1 + 1e-10
    ? clamp01(t)
    : null
}

type ContainmentInterval = { startFraction: number; endFraction: number }

function settlementContainmentIntervals(
  route: readonly TrustedRoutePoint[],
  geometry: TrustedSettlementGeometry,
  cumulative: readonly number[],
): ContainmentInterval[] {
  const totalDistanceM = cumulative[cumulative.length - 1] ?? 0
  if (route.length < 2 || totalDistanceM <= 0) return []
  const intervals: ContainmentInterval[] = []
  for (let index = 0; index + 1 < route.length; index += 1) {
    const a = route[index]
    const b = route[index + 1]
    const segmentDistanceM = cumulative[index + 1] - cumulative[index]
    const breakpoints = new Set<number>([0, 1])
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        for (let ringIndex = 0; ringIndex + 1 < ring.length; ringIndex += 1) {
          const t = segmentIntersectionT(a, b, ring[ringIndex], ring[ringIndex + 1])
          if (t !== null) breakpoints.add(t)
        }
      }
    }
    const sorted = [...breakpoints].sort((left, right) => left - right)
    for (let part = 0; part + 1 < sorted.length; part += 1) {
      const startT = sorted[part]
      const endT = sorted[part + 1]
      if (endT - startT <= 1e-10) continue
      const midpointT = (startT + endT) / 2
      const midpoint = {
        lat: a.lat + midpointT * (b.lat - a.lat),
        lon: a.lon + midpointT * (b.lon - a.lon),
      }
      if (!geometryContains(geometry, midpoint)) continue
      const startFraction = (cumulative[index] + startT * segmentDistanceM) / totalDistanceM
      const endFraction = (cumulative[index] + endT * segmentDistanceM) / totalDistanceM
      const previous = intervals[intervals.length - 1]
      if (previous && startFraction - previous.endFraction <= 1e-8) {
        previous.endFraction = endFraction
      } else {
        intervals.push({ startFraction, endFraction })
      }
    }
  }
  return intervals
}

function pointAtRouteFraction(
  route: readonly TrustedRoutePoint[],
  cumulative: readonly number[],
  fraction: number,
): TrustedRoutePoint {
  const totalDistanceM = cumulative[cumulative.length - 1]
  const targetDistanceM = clamp01(fraction) * totalDistanceM
  for (let index = 0; index + 1 < route.length; index += 1) {
    if (cumulative[index + 1] < targetDistanceM) continue
    const segmentDistanceM = cumulative[index + 1] - cumulative[index]
    const t = segmentDistanceM <= 0 ? 0 : (targetDistanceM - cumulative[index]) / segmentDistanceM
    return {
      lat: route[index].lat + t * (route[index + 1].lat - route[index].lat),
      lon: route[index].lon + t * (route[index + 1].lon - route[index].lon),
    }
  }
  return { ...route[route.length - 1] }
}

function edgeForBoundary(run: MatchedRun, fraction: number): IcelandRoadGraphEdge {
  return run.edges.reduce((best, candidate) => {
    const bestDistance = Math.min(
      Math.abs(best.startFraction - fraction),
      Math.abs(best.endFraction - fraction),
    )
    const candidateDistance = Math.min(
      Math.abs(candidate.startFraction - fraction),
      Math.abs(candidate.endFraction - fraction),
    )
    return candidateDistance < bestDistance ? candidate : best
  }).edge
}

function roadLabel(edge: IcelandRoadGraphEdge): string {
  return edge.roadName?.trim()
    || edge.roadNumber?.trim()
    || ''
}

function buildBoundary(input: {
  kind: RouteWeatherCoverageBoundary['kind']
  label: string
  fraction: number
  route: readonly TrustedRoutePoint[]
  cumulative: readonly number[]
  routeDistanceM: number
  routeDurationS: number
  edge?: IcelandRoadGraphEdge
}): RouteWeatherCoverageBoundary | null {
  const fraction = clamp01(input.fraction)
  const referencePoint = pointAtRouteFraction(input.route, input.cumulative, fraction)
  let point = referencePoint
  if (input.kind === 'official_road_anchor') {
    if (!input.edge || input.edge.geometry.length < 2) return null
    const officialCumulative = cumulativeDistances(input.edge.geometry)
    const officialProjection = projectPointToReference(
      referencePoint,
      input.edge.geometry,
      officialCumulative,
    )
    if (
      !officialProjection
      || officialProjection.distanceM > MAX_OFFICIAL_EDGE_DISTANCE_M
    ) {
      return null
    }
    // Anchor coordinates must be on the connected official-road geometry.
    // Progress and ETA deliberately remain relative to the selected provider route.
    point = officialProjection.nearestPoint
  }
  return {
    kind: input.kind,
    label: input.label,
    point,
    routeFraction: fraction,
    distanceFromTripOriginM: Math.round(fraction * input.routeDistanceM),
    elapsedFromTripOriginS: Math.round(fraction * input.routeDurationS),
    ...(input.edge?.roadNumber ? { roadNumber: input.edge.roadNumber } : {}),
    ...(input.edge?.roadName ? { roadName: input.edge.roadName } : {}),
  }
}

export function resolveTrustedRouteCoverage(
  input: TrustedRouteCoverageInput,
): RouteWeatherCoverage {
  const { referenceRoute, routeDistanceM, routeDurationS } = input
  if (
    referenceRoute.length < 2
    || !Number.isFinite(routeDistanceM)
    || routeDistanceM <= 0
    || !Number.isFinite(routeDurationS)
    || routeDurationS <= 0
    || referenceRoute.some(point => !Number.isFinite(point.lat) || !Number.isFinite(point.lon))
  ) {
    return { status: 'unavailable', reason: 'invalid_reference_route' }
  }
  if (
    haversineDistanceM(input.origin, referenceRoute[0]) > MAX_ENDPOINT_REFERENCE_DISTANCE_M
    || haversineDistanceM(input.destination, referenceRoute[referenceRoute.length - 1])
      > MAX_ENDPOINT_REFERENCE_DISTANCE_M
  ) {
    return { status: 'unavailable', reason: 'invalid_reference_route' }
  }

  const cumulative = cumulativeDistances(referenceRoute)
  const referenceDistanceM = cumulative[cumulative.length - 1] ?? 0
  if (referenceDistanceM <= 0) {
    return { status: 'unavailable', reason: 'invalid_reference_route' }
  }
  const referenceToleranceFraction = MAX_PROJECTION_BACKTRACK_M / referenceDistanceM

  if (
    input.originSettlement
    && input.destinationSettlement
    && input.originSettlement.id === input.destinationSettlement.id
  ) {
    const intervals = settlementContainmentIntervals(
      referenceRoute,
      input.originSettlement.geometry,
      cumulative,
    )
    const fullyInside = intervals.length === 1
      && intervals[0].startFraction <= 1e-8
      && intervals[0].endFraction >= 1 - 1e-8
    if (fullyInside) {
      return {
        status: 'same_urban_area',
        settlementId: input.originSettlement.id,
        settlementName: input.originSettlement.name,
      }
    }
  }

  if (input.connectedRoadEdges.length === 0) {
    return { status: 'unavailable', reason: 'no_connected_official_road' }
  }
  const matches = input.connectedRoadEdges.map(edge => (
    matchOfficialEdge(edge, referenceRoute, cumulative)
  ))
  const runs = buildMatchedRuns(matches, routeDistanceM)
  if (runs.length === 0) {
    return { status: 'unavailable', reason: 'reference_route_mismatch' }
  }
  const run = [...runs].sort((a, b) => (
    (b.endFraction - b.startFraction) - (a.endFraction - a.startFraction)
    || b.graphLengthM - a.graphLengthM
  ))[0]

  let startFraction = run.startFraction
  let endFraction = run.endFraction
  let startKind: RouteWeatherCoverageBoundary['kind'] = 'official_road_anchor'
  let endKind: RouteWeatherCoverageBoundary['kind'] = 'official_road_anchor'
  let startLabel: string | null = null
  let endLabel: string | null = null

  if (input.originSnapDistanceM <= EXACT_ENDPOINT_SNAP_M && startFraction * routeDistanceM <= EXACT_ENDPOINT_SNAP_M) {
    startFraction = 0
    startKind = 'exact'
    startLabel = input.origin.name
  }
  if (
    input.destinationSnapDistanceM <= EXACT_ENDPOINT_SNAP_M
    && (1 - endFraction) * routeDistanceM <= EXACT_ENDPOINT_SNAP_M
  ) {
    endFraction = 1
    endKind = 'exact'
    endLabel = input.destination.name
  }

  if (input.originSettlement && geometryContains(input.originSettlement.geometry, input.origin)) {
    const intervals = settlementContainmentIntervals(referenceRoute, input.originSettlement.geometry, cumulative)
    const originInterval = intervals.find(interval => interval.startFraction <= 1e-8)
    const gatewayFraction = originInterval?.endFraction
    if (
      gatewayFraction !== undefined
      && gatewayFraction > 1e-6
      && gatewayFraction >= run.startFraction - referenceToleranceFraction
      && gatewayFraction <= run.endFraction + referenceToleranceFraction
    ) {
      startFraction = Math.max(startFraction, gatewayFraction)
      startKind = 'settlement_gateway'
      startLabel = input.originSettlement.name
    }
  }

  if (input.destinationSettlement && geometryContains(input.destinationSettlement.geometry, input.destination)) {
    const intervals = settlementContainmentIntervals(referenceRoute, input.destinationSettlement.geometry, cumulative)
    const destinationInterval = [...intervals]
      .reverse()
      .find(interval => interval.endFraction >= 1 - 1e-8)
    const gatewayFraction = destinationInterval?.startFraction
    if (
      gatewayFraction !== undefined
      && gatewayFraction < 1 - 1e-6
      && gatewayFraction >= run.startFraction - referenceToleranceFraction
      && gatewayFraction <= run.endFraction + referenceToleranceFraction
    ) {
      endFraction = Math.min(endFraction, gatewayFraction)
      endKind = 'settlement_gateway'
      endLabel = input.destinationSettlement.name
    }
  }

  if ((endFraction - startFraction) * routeDistanceM < MIN_TRUSTED_RUN_M) {
    return { status: 'unavailable', reason: 'reference_route_mismatch' }
  }

  const startEdge = edgeForBoundary(run, startFraction)
  const endEdge = edgeForBoundary(run, endFraction)
  const start = buildBoundary({
    kind: startKind,
    label: startLabel ?? roadLabel(startEdge),
    fraction: startFraction,
    route: referenceRoute,
    cumulative,
    routeDistanceM,
    routeDurationS,
    edge: startEdge,
  })
  const end = buildBoundary({
    kind: endKind,
    label: endLabel ?? roadLabel(endEdge),
    fraction: endFraction,
    route: referenceRoute,
    cumulative,
    routeDistanceM,
    routeDurationS,
    edge: endEdge,
  })
  if (!start || !end) {
    return { status: 'unavailable', reason: 'reference_route_mismatch' }
  }
  const unassessedBeforeM = Math.round(startFraction * routeDistanceM)
  const unassessedAfterM = Math.round((1 - endFraction) * routeDistanceM)
  const full = unassessedBeforeM <= EXACT_ENDPOINT_SNAP_M
    && unassessedAfterM <= EXACT_ENDPOINT_SNAP_M

  return {
    status: full ? 'full' : 'partial',
    start,
    end,
    coverageDistanceM: Math.round((endFraction - startFraction) * routeDistanceM),
    coverageDurationS: Math.round((endFraction - startFraction) * routeDurationS),
    ...(unassessedBeforeM > EXACT_ENDPOINT_SNAP_M ? { unassessedBeforeM } : {}),
    ...(unassessedAfterM > EXACT_ENDPOINT_SNAP_M ? { unassessedAfterM } : {}),
    distanceConfidence: 'reference_route',
  }
}

export function sliceRouteByFractions(
  route: readonly TrustedRoutePoint[],
  startFraction: number,
  endFraction: number,
): { points: TrustedRoutePoint[]; cumulativeDistanceFromTripOriginM: number[] } {
  if (route.length < 2 || startFraction < 0 || endFraction > 1 || startFraction >= endFraction) {
    return { points: [], cumulativeDistanceFromTripOriginM: [] }
  }
  const cumulative = cumulativeDistances(route)
  const totalDistanceM = cumulative[cumulative.length - 1]
  const startDistanceM = startFraction * totalDistanceM
  const endDistanceM = endFraction * totalDistanceM
  const points: TrustedRoutePoint[] = [pointAtRouteFraction(route, cumulative, startFraction)]
  const distances = [startDistanceM]
  for (let index = 1; index + 1 < route.length; index += 1) {
    if (cumulative[index] <= startDistanceM || cumulative[index] >= endDistanceM) continue
    points.push({ ...route[index] })
    distances.push(cumulative[index])
  }
  points.push(pointAtRouteFraction(route, cumulative, endFraction))
  distances.push(endDistanceM)
  return { points, cumulativeDistanceFromTripOriginM: distances }
}
