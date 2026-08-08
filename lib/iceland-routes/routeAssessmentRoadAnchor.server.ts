import 'server-only'

import { createHash } from 'node:crypto'
import {
  haversineDistanceM,
  ICELAND_ROUTING_PROFILES,
  icelandRoadGraphEdgeCost,
  isIcelandRoadGraphEdgeAssessmentEligible,
  isIcelandRoadGraphEdgeAllowed,
} from './roadGraph'
import type {
  IcelandRoadGraph,
  IcelandRoadGraphEdge,
  IcelandRoadGraphNode,
  IcelandRoadRoutingProfile,
} from './roadGraphTypes'
import type { LatLon } from './types'

const MAX_CANONICAL_NODE_CANDIDATES = 64
const TRUSTED_ANCHOR_EQUIVALENCE_M = 0.5
const COST_EPSILON = 1e-9
const FRACTION_EPSILON = 1e-10
// A projected point is re-derived from its signed coordinates later in the
// route flow. Normalizing the along-edge fraction prevents sub-millimetre
// floating-point drift from changing partial-edge IDs and route provenance.
const ASSESSMENT_FRACTION_DECIMAL_PLACES = 10
// Start at the geometrically nearest eligible road. Widen only when that road
// cannot participate in a direction-correct connected route. Fine early bands
// prevent route cost from moving a selected place hundreds of metres merely
// to obtain a cheaper through-route.
const NEAREST_REACHABLE_SEARCH_BANDS_M = [0, 5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000] as const

export type RouteAssessmentAnchorRequest = Readonly<{
  kind: 'canonical_node' | 'projected_road' | 'trusted_anchor'
  point: LatLon
}>

export type ResolvedRouteAssessmentAnchor = Readonly<{
  kind: 'settlement_node' | 'projected_road'
  point: LatLon
  snapDistanceM: number
}>

export type RouteAssessmentRoadAnchorsResult =
  | Readonly<{
      status: 'ok'
      origin: ResolvedRouteAssessmentAnchor
      destination: ResolvedRouteAssessmentAnchor
      connectedRoadEdges: readonly IcelandRoadGraphEdge[]
      alternatives: readonly RouteAssessmentRoadAlternative[]
      alternativesComplete: boolean
      alternativeSearchAttempts: number
      routeProvenanceFingerprint: string
    }>
  | Readonly<{
      status:
        | 'no_origin_anchor'
        | 'no_destination_anchor'
        | 'ambiguous_trusted_anchor'
        | 'no_route'
        | 'incomplete'
    }>

export type FindRouteAssessmentRoadAnchorsOptions = Readonly<{
  maxOriginSnapDistanceM: number
  maxDestinationSnapDistanceM: number
  maxAlternatives?: number
  maxAlternativeOverlap?: number
  /** Hard synchronous budget for endpoint projection and primary route selection. */
  deadlineAtMs?: number
  alternativeDeadlineAtMs?: number
  profile?: IcelandRoadRoutingProfile
  /** Segment exclusions applied to the primary and every derived alternative. */
  excludedSegmentIds?: ReadonlySet<string>
  /**
   * Geometry-aware policy applied to every edge portion actually traversed.
   * Projected endpoint slices are checked independently from their source edge,
   * so a caller can forbid entering an area without discarding the whole road.
   */
  edgeAdmissibility?: RouteAssessmentRoadEdgeAdmissibility
}>

export type RouteAssessmentRoadEdgeAdmissibility = (
  edge: IcelandRoadGraphEdge,
) => boolean

export type RouteAssessmentRoadAlternative = Readonly<{
  connectedRoadEdges: readonly IcelandRoadGraphEdge[]
  overlapWithPrimary: number
  routeProvenanceFingerprint: string
}>

type NodeCandidate = Readonly<{
  kind: 'settlement_node'
  node: IcelandRoadGraphNode
  point: LatLon
  distanceM: number
}>

type EdgeCandidate = Readonly<{
  kind: 'projected_road'
  edge: IcelandRoadGraphEdge
  point: LatLon
  distanceM: number
  fraction: number
}>

type AnchorCandidate = NodeCandidate | EdgeCandidate

type EdgeProjection = Readonly<{
  point: LatLon
  distanceM: number
  fraction: number
}>

type CandidateResolution =
  | Readonly<{ status: 'ok'; candidates: readonly AnchorCandidate[] }>
  | Readonly<{ status: 'none' | 'ambiguous' | 'incomplete' }>

type QueueEntry = Readonly<{
  nodeId: string
  cost: number
  snapDistanceM: number
  key: string
}>

type SelectedRoute = Readonly<{
  cost: number
  snapDistanceM: number
  key: string
  origin: AnchorCandidate
  destination: AnchorCandidate
  connectedRoadEdges: readonly IcelandRoadGraphEdge[]
}>

type RouteSearchConstraints = Readonly<{
  excludedSegmentIds?: ReadonlySet<string>
  edgeAdmissibility?: RouteAssessmentRoadEdgeAdmissibility
}>

type RouteSearchResult =
  | Readonly<{ status: 'ok'; route: SelectedRoute | null }>
  | Readonly<{ status: 'incomplete' }>

const FASTEST_CAR_PROFILE = ICELAND_ROUTING_PROFILES.fastestCar

function finitePoint(point: LatLon): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lon)
}

function canonicalAssessmentFraction(value: number): number {
  const clamped = Math.max(0, Math.min(1, value))
  return Number(clamped.toFixed(ASSESSMENT_FRACTION_DECIMAL_PLACES))
}

function geometryUsesCanonicalDirection(geometry: readonly LatLon[]): boolean {
  for (let offset = 0; offset < geometry.length; offset += 1) {
    const fromStart = geometry[offset]
    const fromEnd = geometry[geometry.length - 1 - offset]
    if (fromStart.lat !== fromEnd.lat) return fromStart.lat < fromEnd.lat
    if (fromStart.lon !== fromEnd.lon) return fromStart.lon < fromEnd.lon
  }
  return true
}

function validMaxDistance(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function deadlineExceeded(deadlineAtMs: number | undefined): boolean {
  return deadlineAtMs !== undefined
    && Number.isFinite(deadlineAtMs)
    && Date.now() >= deadlineAtMs
}

function earliestDeadline(
  first: number | undefined,
  second: number | undefined,
): number | undefined {
  const values = [first, second].filter((value): value is number => (
    value !== undefined && Number.isFinite(value)
  ))
  return values.length > 0 ? Math.min(...values) : undefined
}

function accessCost(distanceM: number, profile: IcelandRoadRoutingProfile): number {
  return profile.objective === 'fastest'
    ? (distanceM / 1_000 / 50) * 3_600
    : distanceM
}

function candidateKey(candidate: AnchorCandidate): string {
  return candidate.kind === 'settlement_node'
    ? `node:${candidate.node.id}`
    : `edge:${candidate.edge.segmentId}:${candidate.edge.id}:${candidate.fraction.toFixed(12)}`
}

function sortedNodeCandidates(
  graph: IcelandRoadGraph,
  point: LatLon,
  maxDistanceM: number,
  deadlineAtMs?: number,
): NodeCandidate[] | null {
  if (!finitePoint(point) || !validMaxDistance(maxDistanceM)) return []
  const candidates: NodeCandidate[] = []
  for (const node of graph.nodes.values()) {
    if (deadlineExceeded(deadlineAtMs)) return null
    const distanceM = haversineDistanceM(point, node.point)
    if (distanceM <= maxDistanceM) {
      candidates.push({ kind: 'settlement_node', node, point: node.point, distanceM })
    }
  }
  candidates
    .sort((a, b) => a.distanceM - b.distanceM || a.node.id.localeCompare(b.node.id))
  if (deadlineExceeded(deadlineAtMs)) return null
  return candidates.slice(0, MAX_CANONICAL_NODE_CANDIDATES)
}

function edgeGeometryDistances(
  edge: IcelandRoadGraphEdge,
  deadlineAtMs?: number,
  reverse = false,
): number[] | null {
  if (edge.geometry.length < 2) return null
  const cumulative = [0]
  for (let index = 1; index < edge.geometry.length; index += 1) {
    if (deadlineExceeded(deadlineAtMs)) return null
    const previous = edge.geometry[reverse ? edge.geometry.length - index : index - 1]
    const current = edge.geometry[reverse ? edge.geometry.length - 1 - index : index]
    if (!finitePoint(previous) || !finitePoint(current)) return null
    cumulative.push(cumulative[index - 1] + haversineDistanceM(previous, current))
  }
  if (deadlineExceeded(deadlineAtMs)) return null
  const totalDistanceM = cumulative[cumulative.length - 1] ?? 0
  return Number.isFinite(totalDistanceM) && totalDistanceM > 0 ? cumulative : null
}

function projectPointToEdge(
  point: LatLon,
  edge: IcelandRoadGraphEdge,
  deadlineAtMs?: number,
): EdgeProjection | null {
  if (!finitePoint(point) || deadlineExceeded(deadlineAtMs)) return null
  const usesCanonicalDirection = geometryUsesCanonicalDirection(edge.geometry)
  const reverseGeometry = !usesCanonicalDirection
  const cumulative = edgeGeometryDistances(edge, deadlineAtMs, reverseGeometry)
  if (!cumulative) return null
  const totalDistanceM = cumulative[cumulative.length - 1]
  let best: { point: LatLon; distanceM: number; distanceAlongEdgeM: number } | null = null

  for (let index = 0; index + 1 < edge.geometry.length; index += 1) {
    if (deadlineExceeded(deadlineAtMs)) return null
    const a = edge.geometry[reverseGeometry ? edge.geometry.length - 1 - index : index]
    const b = edge.geometry[reverseGeometry ? edge.geometry.length - 2 - index : index + 1]
    const metresPerDegreeLat = 111_320
    const metresPerDegreeLon = metresPerDegreeLat
      * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180)
    const bx = (b.lon - a.lon) * metresPerDegreeLon
    const by = (b.lat - a.lat) * metresPerDegreeLat
    const px = (point.lon - a.lon) * metresPerDegreeLon
    const py = (point.lat - a.lat) * metresPerDegreeLat
    const lengthSquared = bx * bx + by * by
    const segmentFraction = lengthSquared <= 0
      ? 0
      : Math.max(0, Math.min(1, (px * bx + py * by) / lengthSquared))
    const projectedPoint = {
      lat: a.lat + segmentFraction * (b.lat - a.lat),
      lon: a.lon + segmentFraction * (b.lon - a.lon),
    }
    const distanceM = haversineDistanceM(point, projectedPoint)
    const segmentLengthM = cumulative[index + 1] - cumulative[index]
    const distanceAlongEdgeM = cumulative[index] + segmentFraction * segmentLengthM
    if (
      !best
      || distanceM < best.distanceM - COST_EPSILON
      || (
        Math.abs(distanceM - best.distanceM) <= COST_EPSILON
        && distanceAlongEdgeM < best.distanceAlongEdgeM
      )
    ) {
      best = { point: projectedPoint, distanceM, distanceAlongEdgeM }
    }
  }

  if (deadlineExceeded(deadlineAtMs)) return null
  if (!best) return null
  const canonicalFraction = canonicalAssessmentFraction(best.distanceAlongEdgeM / totalDistanceM)
  const fraction = usesCanonicalDirection ? canonicalFraction : 1 - canonicalFraction
  const projectedPoint = pointAtGeometryFraction(
    edge.geometry,
    cumulative,
    canonicalFraction,
    deadlineAtMs,
    reverseGeometry,
  )
  if (!projectedPoint) return null
  return {
    point: projectedPoint,
    distanceM: haversineDistanceM(point, projectedPoint),
    fraction,
  }
}

function sortedEdgeCandidates(
  graph: IcelandRoadGraph,
  point: LatLon,
  maxDistanceM: number,
  profile: IcelandRoadRoutingProfile,
  deadlineAtMs: number | undefined,
): Readonly<{ status: 'ok'; candidates: EdgeCandidate[] }> | Readonly<{ status: 'incomplete' }> {
  if (!finitePoint(point) || !validMaxDistance(maxDistanceM)) {
    return { status: 'ok', candidates: [] }
  }
  const candidates: EdgeCandidate[] = []
  for (const edge of graph.edges) {
    if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
    if (
      !isIcelandRoadGraphEdgeAssessmentEligible(edge)
      || !isIcelandRoadGraphEdgeAllowed(edge, profile)
    ) continue
    const projection = projectPointToEdge(point, edge, deadlineAtMs)
    if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
    if (projection && projection.distanceM <= maxDistanceM) {
      candidates.push({
        kind: 'projected_road',
        edge,
        point: projection.point,
        distanceM: projection.distanceM,
        fraction: projection.fraction,
      })
    }
  }
  if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
  candidates.sort((a, b) => (
    a.distanceM - b.distanceM
    || a.edge.segmentId.localeCompare(b.edge.segmentId)
    || a.edge.id.localeCompare(b.edge.id)
    || a.fraction - b.fraction
  ))
  return deadlineExceeded(deadlineAtMs)
    ? { status: 'incomplete' }
    : { status: 'ok', candidates }
}

function normalizeProjectedEndpointCandidates(
  graph: IcelandRoadGraph,
  requestPoint: LatLon,
  candidates: readonly EdgeCandidate[],
  deadlineAtMs: number | undefined,
): AnchorCandidate[] | null {
  const normalized: AnchorCandidate[] = []
  const normalizedNodeIds = new Set<string>()
  for (const candidate of candidates) {
    if (deadlineExceeded(deadlineAtMs)) return null
    const endpointNodes = [
      graph.nodes.get(candidate.edge.fromNodeId),
      graph.nodes.get(candidate.edge.toNodeId),
    ].filter((node): node is IcelandRoadGraphNode => Boolean(node))
      .filter(node => equivalentPoints(candidate.point, node.point))
      .sort((a, b) => (
        haversineDistanceM(candidate.point, a.point)
          - haversineDistanceM(candidate.point, b.point)
        || a.id.localeCompare(b.id)
      ))
    const node = endpointNodes[0]
    if (!node) {
      normalized.push(candidate)
      continue
    }
    if (normalizedNodeIds.has(node.id)) continue
    normalizedNodeIds.add(node.id)
    normalized.push({
      kind: 'settlement_node',
      node,
      point: node.point,
      distanceM: haversineDistanceM(requestPoint, node.point),
    })
  }
  normalized.sort((a, b) => (
    a.distanceM - b.distanceM
    || candidateKey(a).localeCompare(candidateKey(b))
  ))
  return deadlineExceeded(deadlineAtMs) ? null : normalized
}

function equivalentPoints(a: LatLon, b: LatLon): boolean {
  return haversineDistanceM(a, b) <= TRUSTED_ANCHOR_EQUIVALENCE_M
}

/**
 * A trusted anchor is already a graph-derived, signed route endpoint. Rebuild
 * its identity with a tiny tolerance and fail closed at crossings or parallel
 * roads instead of guessing which physical segment an old anchor represented.
 */
function resolveTrustedCandidates(
  graph: IcelandRoadGraph,
  point: LatLon,
  maxDistanceM: number,
  profile: IcelandRoadRoutingProfile,
  deadlineAtMs: number | undefined,
): CandidateResolution {
  if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
  const nodes = sortedNodeCandidates(graph, point, maxDistanceM, deadlineAtMs)
  if (!nodes) return { status: 'incomplete' }
  const equivalentNodes = nodes.filter(candidate => (
    candidate.distanceM <= TRUSTED_ANCHOR_EQUIVALENCE_M
  ))
  if (equivalentNodes.length > 0) {
    const representative = equivalentNodes[0]
    if (equivalentNodes.some(candidate => !equivalentPoints(candidate.point, representative.point))) {
      return { status: 'ambiguous' }
    }
    return {
      status: 'ok',
      candidates: equivalentNodes.filter(candidate => (
        equivalentPoints(candidate.point, representative.point)
      )),
    }
  }

  const edgeResolution = sortedEdgeCandidates(graph, point, maxDistanceM, profile, deadlineAtMs)
  if (edgeResolution.status !== 'ok') return edgeResolution
  const edges = edgeResolution.candidates
  if (edges.length === 0) return { status: 'none' }
  const representative = edges[0]
  const samePhysicalProjection = edges.filter(candidate => (
    candidate.edge.segmentId === representative.edge.segmentId
    && equivalentPoints(candidate.point, representative.point)
  ))
  if (samePhysicalProjection.length !== edges.length) return { status: 'ambiguous' }
  return { status: 'ok', candidates: samePhysicalProjection }
}

function resolveCandidates(
  graph: IcelandRoadGraph,
  request: RouteAssessmentAnchorRequest,
  maxDistanceM: number,
  profile: IcelandRoadRoutingProfile,
  deadlineAtMs: number | undefined,
): CandidateResolution {
  if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
  if (request.kind === 'canonical_node' || request.kind === 'projected_road') {
    const edgeResolution = sortedEdgeCandidates(
      graph,
      request.point,
      maxDistanceM,
      profile,
      deadlineAtMs,
    )
    if (edgeResolution.status !== 'ok') return edgeResolution
    const candidates = normalizeProjectedEndpointCandidates(
      graph,
      request.point,
      edgeResolution.candidates,
      deadlineAtMs,
    )
    if (!candidates || deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
    return candidates.length > 0 ? { status: 'ok', candidates } : { status: 'none' }
  }
  return resolveTrustedCandidates(graph, request.point, maxDistanceM, profile, deadlineAtMs)
}

function pointAtGeometryFraction(
  geometry: readonly LatLon[],
  cumulative: readonly number[],
  fraction: number,
  deadlineAtMs?: number,
  reverse = false,
): LatLon | null {
  if (deadlineExceeded(deadlineAtMs)) return null
  const clamped = Math.max(0, Math.min(1, fraction))
  const totalDistanceM = cumulative[cumulative.length - 1]
  const targetDistanceM = totalDistanceM * clamped
  for (let index = 0; index + 1 < cumulative.length; index += 1) {
    if (deadlineExceeded(deadlineAtMs)) return null
    if (targetDistanceM > cumulative[index + 1]) continue
    const segmentDistanceM = cumulative[index + 1] - cumulative[index]
    const segmentFraction = segmentDistanceM <= 0
      ? 0
      : (targetDistanceM - cumulative[index]) / segmentDistanceM
    const a = geometry[reverse ? geometry.length - 1 - index : index]
    const b = geometry[reverse ? geometry.length - 2 - index : index + 1]
    return {
      lat: a.lat + segmentFraction * (b.lat - a.lat),
      lon: a.lon + segmentFraction * (b.lon - a.lon),
    }
  }
  return deadlineExceeded(deadlineAtMs)
    ? null
    : geometry[reverse ? 0 : geometry.length - 1]
}

function sliceEdge(
  edge: IcelandRoadGraphEdge,
  rawStartFraction: number,
  rawEndFraction: number,
  deadlineAtMs?: number,
): IcelandRoadGraphEdge | null {
  if (deadlineExceeded(deadlineAtMs)) return null
  const startFraction = Math.max(0, Math.min(1, rawStartFraction))
  const endFraction = Math.max(0, Math.min(1, rawEndFraction))
  if (endFraction - startFraction <= FRACTION_EPSILON) return null
  if (startFraction <= FRACTION_EPSILON && endFraction >= 1 - FRACTION_EPSILON) return edge

  const cumulative = edgeGeometryDistances(edge, deadlineAtMs)
  if (!cumulative) return null
  const totalDistanceM = cumulative[cumulative.length - 1]
  const startDistanceM = totalDistanceM * startFraction
  const endDistanceM = totalDistanceM * endFraction
  const startPoint = pointAtGeometryFraction(
    edge.geometry,
    cumulative,
    startFraction,
    deadlineAtMs,
  )
  if (!startPoint) return null
  const geometry: LatLon[] = [startPoint]
  for (let index = 1; index + 1 < edge.geometry.length; index += 1) {
    if (deadlineExceeded(deadlineAtMs)) return null
    if (cumulative[index] > startDistanceM && cumulative[index] < endDistanceM) {
      geometry.push(edge.geometry[index])
    }
  }
  const endPoint = pointAtGeometryFraction(
    edge.geometry,
    cumulative,
    endFraction,
    deadlineAtMs,
  )
  if (!endPoint || deadlineExceeded(deadlineAtMs)) return null
  const previous = geometry[geometry.length - 1]
  if (previous.lat !== endPoint.lat || previous.lon !== endPoint.lon) geometry.push(endPoint)
  if (geometry.length < 2) return null

  const span = endFraction - startFraction
  const marker = `${startFraction.toFixed(12)}-${endFraction.toFixed(12)}`
  return {
    ...edge,
    id: `${edge.id}:assessment:${marker}`,
    fromNodeId: startFraction <= FRACTION_EPSILON
      ? edge.fromNodeId
      : `${edge.id}:assessment:${startFraction.toFixed(12)}`,
    toNodeId: endFraction >= 1 - FRACTION_EPSILON
      ? edge.toNodeId
      : `${edge.id}:assessment:${endFraction.toFixed(12)}`,
    geometry,
    lengthM: edge.lengthM * span,
    travelTimeS: edge.travelTimeS * span,
  }
}

/**
 * Recreates a signed assessment-only prefix/suffix edge from its immutable
 * source edge. Full graph edges are returned by identity elsewhere; this
 * helper accepts only the exact fixed-precision marker emitted by sliceEdge.
 */
export function restoreRouteAssessmentEdgeSlice(
  sourceEdge: IcelandRoadGraphEdge,
  claimedEdgeId: string,
): IcelandRoadGraphEdge | null {
  const prefix = `${sourceEdge.id}:assessment:`
  if (!claimedEdgeId.startsWith(prefix)) return null
  const marker = claimedEdgeId.slice(prefix.length)
  const match = /^(\d\.\d{12})-(\d\.\d{12})$/.exec(marker)
  if (!match) return null
  const startFraction = Number(match[1])
  const endFraction = Number(match[2])
  if (
    !Number.isFinite(startFraction)
    || !Number.isFinite(endFraction)
    || startFraction < 0
    || endFraction > 1
    || endFraction <= startFraction
  ) return null
  const restored = sliceEdge(sourceEdge, startFraction, endFraction)
  return restored?.id === claimedEdgeId ? restored : null
}

function routeSearchEdgeAllowed(
  edge: IcelandRoadGraphEdge,
  profile: IcelandRoadRoutingProfile,
  constraints: RouteSearchConstraints,
): boolean {
  return isIcelandRoadGraphEdgeAllowed(
    edge,
    profile,
    constraints.excludedSegmentIds,
  ) && (constraints.edgeAdmissibility?.(edge) ?? true)
}

function originStart(
  candidate: AnchorCandidate,
  profile: IcelandRoadRoutingProfile,
  constraints: RouteSearchConstraints,
  deadlineAtMs?: number,
): {
  nodeId: string
  cost: number
  prefix: readonly IcelandRoadGraphEdge[]
} | null {
  if (deadlineExceeded(deadlineAtMs)) return null
  if (candidate.kind === 'settlement_node') {
    return { nodeId: candidate.node.id, cost: accessCost(candidate.distanceM, profile), prefix: [] }
  }
  const prefix = sliceEdge(candidate.edge, candidate.fraction, 1, deadlineAtMs)
  if (deadlineExceeded(deadlineAtMs)) return null
  if (prefix && !routeSearchEdgeAllowed(prefix, profile, constraints)) return null
  return {
    nodeId: candidate.edge.toNodeId,
    cost: accessCost(candidate.distanceM, profile)
      + icelandRoadGraphEdgeCost(candidate.edge, profile, 1 - candidate.fraction),
    prefix: prefix ? [prefix] : [],
  }
}

function destinationEnd(
  candidate: AnchorCandidate,
  profile: IcelandRoadRoutingProfile,
  constraints: RouteSearchConstraints,
  deadlineAtMs?: number,
): {
  nodeId: string
  cost: number
  suffix: readonly IcelandRoadGraphEdge[]
} | null {
  if (deadlineExceeded(deadlineAtMs)) return null
  if (candidate.kind === 'settlement_node') {
    return { nodeId: candidate.node.id, cost: accessCost(candidate.distanceM, profile), suffix: [] }
  }
  const suffix = sliceEdge(candidate.edge, 0, candidate.fraction, deadlineAtMs)
  if (deadlineExceeded(deadlineAtMs)) return null
  if (suffix && !routeSearchEdgeAllowed(suffix, profile, constraints)) return null
  return {
    nodeId: candidate.edge.fromNodeId,
    cost: accessCost(candidate.distanceM, profile)
      + icelandRoadGraphEdgeCost(candidate.edge, profile, candidate.fraction),
    suffix: suffix ? [suffix] : [],
  }
}

class MinPriorityQueue {
  private readonly values: QueueEntry[] = []

  get size(): number {
    return this.values.length
  }

  private before(a: QueueEntry, b: QueueEntry): boolean {
    return a.cost < b.cost - COST_EPSILON
      || (
        Math.abs(a.cost - b.cost) <= COST_EPSILON
        && (
          a.snapDistanceM < b.snapDistanceM - COST_EPSILON
          || (
            Math.abs(a.snapDistanceM - b.snapDistanceM) <= COST_EPSILON
            && a.key < b.key
          )
        )
      )
  }

  push(value: QueueEntry): void {
    this.values.push(value)
    let index = this.values.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (this.before(this.values[parent], value)) break
      this.values[index] = this.values[parent]
      index = parent
    }
    this.values[index] = value
  }

  pop(): QueueEntry | null {
    if (this.values.length === 0) return null
    const first = this.values[0]
    const last = this.values.pop()!
    if (this.values.length === 0) return first
    let index = 0
    while (true) {
      const left = index * 2 + 1
      const right = left + 1
      if (left >= this.values.length) break
      const smaller = right < this.values.length && this.before(this.values[right], this.values[left])
        ? right
        : left
      if (this.before(last, this.values[smaller])) break
      this.values[index] = this.values[smaller]
      index = smaller
    }
    this.values[index] = last
    return first
  }
}

function betterRoute(candidate: SelectedRoute, current: SelectedRoute | null): boolean {
  return !current
    || candidate.cost < current.cost - COST_EPSILON
    || (
      Math.abs(candidate.cost - current.cost) <= COST_EPSILON
      && (
        candidate.snapDistanceM < current.snapDistanceM - COST_EPSILON
        || (
          Math.abs(candidate.snapDistanceM - current.snapDistanceM) <= COST_EPSILON
          && candidate.key < current.key
        )
      )
    )
}

function routeSnapDistanceM(
  origin: AnchorCandidate,
  destination: AnchorCandidate,
): number {
  return origin.distanceM + destination.distanceM
}

function directProjectedRoute(
  origins: readonly AnchorCandidate[],
  destinations: readonly AnchorCandidate[],
  profile: IcelandRoadRoutingProfile,
  constraints: RouteSearchConstraints,
  deadlineAtMs: number | undefined,
): RouteSearchResult {
  let selected: SelectedRoute | null = null
  for (const origin of origins) {
    if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
    if (origin.kind !== 'projected_road') continue
    for (const destination of destinations) {
      if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
      if (
        destination.kind !== 'projected_road'
        || destination.edge.id !== origin.edge.id
        || destination.fraction - origin.fraction <= FRACTION_EPSILON
      ) continue
      const partial = sliceEdge(
        origin.edge,
        origin.fraction,
        destination.fraction,
        deadlineAtMs,
      )
      if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
      if (!partial || !routeSearchEdgeAllowed(partial, profile, constraints)) continue
      const candidate: SelectedRoute = {
        cost: accessCost(origin.distanceM, profile)
          + icelandRoadGraphEdgeCost(origin.edge, profile, destination.fraction - origin.fraction)
          + accessCost(destination.distanceM, profile),
        snapDistanceM: routeSnapDistanceM(origin, destination),
        key: `${candidateKey(origin)}>${candidateKey(destination)}`,
        origin,
        destination,
        connectedRoadEdges: [partial],
      }
      if (betterRoute(candidate, selected)) selected = candidate
    }
  }
  return deadlineExceeded(deadlineAtMs)
    ? { status: 'incomplete' }
    : { status: 'ok', route: selected }
}

function graphRoute(
  graph: IcelandRoadGraph,
  origins: readonly AnchorCandidate[],
  destinations: readonly AnchorCandidate[],
  profile: IcelandRoadRoutingProfile,
  constraints: RouteSearchConstraints,
  deadlineAtMs?: number,
): RouteSearchResult {
  const distanceByNode = new Map<string, number>()
  const snapByNode = new Map<string, number>()
  const keyByNode = new Map<string, string>()
  const sourceByNode = new Map<string, {
    candidate: AnchorCandidate
    startNodeId: string
    prefix: readonly IcelandRoadGraphEdge[]
  }>()
  const previousByNode = new Map<string, IcelandRoadGraphEdge>()
  const queue = new MinPriorityQueue()

  for (const candidate of origins) {
    if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
    const start = originStart(candidate, profile, constraints, deadlineAtMs)
    if (!start) {
      if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
      continue
    }
    if (!graph.nodes.has(start.nodeId)) continue
    const key = candidateKey(candidate)
    const snapDistanceM = candidate.distanceM
    const previousSnap = snapByNode.get(start.nodeId) ?? Number.POSITIVE_INFINITY
    const previousCost = distanceByNode.get(start.nodeId) ?? Number.POSITIVE_INFINITY
    const previousKey = keyByNode.get(start.nodeId)
    if (
      start.cost > previousCost + COST_EPSILON
      || (
        Math.abs(start.cost - previousCost) <= COST_EPSILON
        && (
          snapDistanceM > previousSnap + COST_EPSILON
          || (
            Math.abs(snapDistanceM - previousSnap) <= COST_EPSILON
            && previousKey !== undefined
            && key >= previousKey
          )
        )
      )
    ) continue
    distanceByNode.set(start.nodeId, start.cost)
    snapByNode.set(start.nodeId, snapDistanceM)
    keyByNode.set(start.nodeId, key)
    sourceByNode.set(start.nodeId, {
      candidate,
      startNodeId: start.nodeId,
      prefix: start.prefix,
    })
    previousByNode.delete(start.nodeId)
    queue.push({
      nodeId: start.nodeId,
      cost: start.cost,
      snapDistanceM,
      key,
    })
  }

  const destinationByNode = new Map<string, Array<{
    candidate: AnchorCandidate
    cost: number
    suffix: readonly IcelandRoadGraphEdge[]
  }>>()
  for (const candidate of destinations) {
    if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
    const end = destinationEnd(candidate, profile, constraints, deadlineAtMs)
    if (!end) {
      if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
      continue
    }
    if (!graph.nodes.has(end.nodeId)) continue
    const values = destinationByNode.get(end.nodeId) ?? []
    values.push({ candidate, cost: end.cost, suffix: end.suffix })
    destinationByNode.set(end.nodeId, values)
  }
  for (const values of destinationByNode.values()) {
    if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
    values.sort((a, b) => candidateKey(a.candidate).localeCompare(candidateKey(b.candidate)))
    if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
  }

  let selected: SelectedRoute | null = null
  const visited = new Set<string>()
  while (queue.size > 0) {
    if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
    const current = queue.pop()
    if (!current || visited.has(current.nodeId)) continue
    if (selected && current.cost > selected.cost + COST_EPSILON) break
    if (
      Math.abs((distanceByNode.get(current.nodeId) ?? Number.POSITIVE_INFINITY) - current.cost) > COST_EPSILON
      || Math.abs((snapByNode.get(current.nodeId) ?? Number.POSITIVE_INFINITY) - current.snapDistanceM) > COST_EPSILON
      || keyByNode.get(current.nodeId) !== current.key
    ) continue
    visited.add(current.nodeId)

    const source = sourceByNode.get(current.nodeId)
    if (!source) continue
    for (const destination of destinationByNode.get(current.nodeId) ?? []) {
      if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
      const path: IcelandRoadGraphEdge[] = []
      let pathComplete = true
      let cursor = current.nodeId
      while (cursor !== source.startNodeId) {
        if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
        const edge = previousByNode.get(cursor)
        if (!edge) {
          pathComplete = false
          break
        }
        path.push(edge)
        cursor = edge.fromNodeId
      }
      if (!pathComplete) continue
      path.reverse()
      const connectedRoadEdges = [...source.prefix, ...path, ...destination.suffix]
      if (connectedRoadEdges.length === 0) continue
      const candidate: SelectedRoute = {
        cost: current.cost + destination.cost,
        snapDistanceM: routeSnapDistanceM(source.candidate, destination.candidate),
        key: `${current.key}>${candidateKey(destination.candidate)}`,
        origin: source.candidate,
        destination: destination.candidate,
        connectedRoadEdges,
      }
      if (betterRoute(candidate, selected)) selected = candidate
    }

    const outgoing: IcelandRoadGraphEdge[] = []
    for (const edge of graph.outgoing.get(current.nodeId) ?? []) {
      if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
      if (routeSearchEdgeAllowed(edge, profile, constraints)) {
        outgoing.push(edge)
      }
    }
    outgoing.sort((a, b) => a.id.localeCompare(b.id))
    if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
    for (const edge of outgoing) {
      if (deadlineExceeded(deadlineAtMs)) return { status: 'incomplete' }
      if (!graph.nodes.has(edge.toNodeId) || visited.has(edge.toNodeId)) continue
      const candidateCost = current.cost + icelandRoadGraphEdgeCost(edge, profile)
      const candidateKeyValue = `${current.key}>${edge.id}`
      const previousSnap = snapByNode.get(edge.toNodeId) ?? Number.POSITIVE_INFINITY
      const previousCost = distanceByNode.get(edge.toNodeId) ?? Number.POSITIVE_INFINITY
      const previousKey = keyByNode.get(edge.toNodeId)
      if (
        candidateCost > previousCost + COST_EPSILON
        || (
          Math.abs(candidateCost - previousCost) <= COST_EPSILON
          && (
            current.snapDistanceM > previousSnap + COST_EPSILON
            || (
              Math.abs(current.snapDistanceM - previousSnap) <= COST_EPSILON
              && previousKey !== undefined
              && candidateKeyValue >= previousKey
            )
          )
        )
      ) continue
      distanceByNode.set(edge.toNodeId, candidateCost)
      snapByNode.set(edge.toNodeId, current.snapDistanceM)
      keyByNode.set(edge.toNodeId, candidateKeyValue)
      sourceByNode.set(edge.toNodeId, source)
      previousByNode.set(edge.toNodeId, edge)
      queue.push({
        nodeId: edge.toNodeId,
        cost: candidateCost,
        snapDistanceM: current.snapDistanceM,
        key: candidateKeyValue,
      })
    }
  }
  return deadlineExceeded(deadlineAtMs)
    ? { status: 'incomplete' }
    : { status: 'ok', route: selected }
}

function routeEdgeKey(route: SelectedRoute): string {
  return route.connectedRoadEdges.map(edge => edge.id).join('|')
}

function routeSegmentIds(route: SelectedRoute): string[] {
  return [...new Set(route.connectedRoadEdges.map(edge => edge.segmentId))]
}

/**
 * Searches a bounded set of real graph detours while keeping the exact anchor
 * candidates selected for the attested primary. Projected prefix/suffix edge
 * slices are therefore mandatory and identical for every returned path.
 */
function assessmentRoadAlternatives(
  graph: IcelandRoadGraph,
  primary: SelectedRoute,
  profile: IcelandRoadRoutingProfile,
  constraints: RouteSearchConstraints,
  rawMaxAlternatives: number | undefined,
  rawMaxOverlap: number | undefined,
  deadlineAtMs: number | undefined,
): { alternatives: RouteAssessmentRoadAlternative[]; complete: boolean; attempts: number } {
  const maxAlternatives = Number.isFinite(rawMaxAlternatives)
    ? Math.max(0, Math.min(4, Math.floor(rawMaxAlternatives!)))
    : 0
  if (maxAlternatives === 0) return { alternatives: [], complete: true, attempts: 0 }
  const maxOverlap = Number.isFinite(rawMaxOverlap)
    ? Math.max(0, Math.min(1, rawMaxOverlap!))
    : 0.94
  if (deadlineExceeded(deadlineAtMs)) {
    return { alternatives: [], complete: false, attempts: 0 }
  }

  // A projected endpoint's physical segment is required to reach the signed
  // point. Excluding it would claim to avoid a road that the mandatory partial
  // edge still uses, so only internal primary segments are detour spurs.
  const endpointSegmentIds = new Set<string>()
  if (primary.origin.kind === 'projected_road') {
    endpointSegmentIds.add(primary.origin.edge.segmentId)
  }
  if (primary.destination.kind === 'projected_road') {
    endpointSegmentIds.add(primary.destination.edge.segmentId)
  }
  const eligibleSegmentIds = routeSegmentIds(primary).filter(segmentId => (
    !endpointSegmentIds.has(segmentId)
  ))
  if (deadlineExceeded(deadlineAtMs)) {
    return { alternatives: [], complete: false, attempts: 0 }
  }
  if (eligibleSegmentIds.length === 0) {
    return { alternatives: [], complete: true, attempts: 0 }
  }

  const primarySegmentIds = new Set(routeSegmentIds(primary))
  const primaryKey = routeEdgeKey(primary)
  const candidates = new Map<string, { route: SelectedRoute; overlapWithPrimary: number }>()
  const stride = Math.max(1, Math.ceil(eligibleSegmentIds.length / 40))
  let complete = true
  let attempts = 0
  for (let index = 0; index < eligibleSegmentIds.length; index += stride) {
    if (deadlineExceeded(deadlineAtMs)) {
      complete = false
      break
    }
    attempts += 1
    const routeResult = graphRoute(
      graph,
      [primary.origin],
      [primary.destination],
      profile,
      {
        ...constraints,
        excludedSegmentIds: new Set([
          ...(constraints.excludedSegmentIds ?? []),
          eligibleSegmentIds[index],
        ]),
      },
      deadlineAtMs,
    )
    if (routeResult.status === 'incomplete') {
      complete = false
      break
    }
    if (deadlineExceeded(deadlineAtMs)) {
      complete = false
      break
    }
    const route = routeResult.route
    if (!route) continue
    const key = routeEdgeKey(route)
    if (key === primaryKey || candidates.has(key)) continue
    const candidateSegmentIds = new Set(routeSegmentIds(route))
    const sharedCount = [...candidateSegmentIds]
      .filter(segmentId => primarySegmentIds.has(segmentId))
      .length
    const overlapWithPrimary = sharedCount / Math.max(
      primarySegmentIds.size,
      candidateSegmentIds.size,
      1,
    )
    if (overlapWithPrimary > maxOverlap) continue
    candidates.set(key, { route, overlapWithPrimary })
  }

  const sortedCandidates = [...candidates.values()]
  sortedCandidates.sort((a, b) => (
    a.route.cost - b.route.cost
    || routeEdgeKey(a.route).localeCompare(routeEdgeKey(b.route))
  ))
  if (deadlineExceeded(deadlineAtMs)) complete = false
  const alternatives: RouteAssessmentRoadAlternative[] = []
  for (const candidate of sortedCandidates.slice(0, maxAlternatives)) {
    if (deadlineExceeded(deadlineAtMs)) {
      complete = false
      break
    }
    const routeFingerprint = createRouteAssessmentRouteProvenanceFingerprint(candidate.route)
    if (deadlineExceeded(deadlineAtMs)) {
      complete = false
      break
    }
    alternatives.push({
      connectedRoadEdges: candidate.route.connectedRoadEdges,
      overlapWithPrimary: candidate.overlapWithPrimary,
      routeProvenanceFingerprint: routeFingerprint,
    })
  }
  return { alternatives, complete, attempts }
}

function publicAnchor(candidate: AnchorCandidate): ResolvedRouteAssessmentAnchor {
  return {
    kind: candidate.kind,
    point: candidate.point,
    snapDistanceM: Math.round(candidate.distanceM),
  }
}

export function createRouteAssessmentRouteProvenanceFingerprint(route: Readonly<{
  origin: Readonly<{ kind: 'settlement_node' | 'projected_road'; point: LatLon }>
  destination: Readonly<{ kind: 'settlement_node' | 'projected_road'; point: LatLon }>
  connectedRoadEdges: readonly IcelandRoadGraphEdge[]
}>): string {
  const edgeIdentity = route.connectedRoadEdges.map(edge => ({
    id: edge.id,
    segmentId: edge.segmentId,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    geometry: edge.geometry.map(point => [point.lat.toFixed(7), point.lon.toFixed(7)]),
    lengthM: edge.lengthM.toFixed(3),
    travelTimeS: edge.travelTimeS.toFixed(3),
    speedKmh: edge.speedKmh,
    speedSource: edge.speedSource,
    roadNumber: edge.roadNumber ?? null,
    roadName: edge.roadName ?? null,
    roadClass: edge.roadClass,
    surface: edge.surface,
    isFRoad: edge.isFRoad,
    isMountainRoad: edge.isMountainRoad,
    isSeasonal: edge.isSeasonal,
    networkRole: edge.networkRole ?? null,
    ...(edge.directionBasis
      ? {
          directionEvidence: {
            basis: edge.directionBasis,
            status: edge.directionStatus ?? null,
            inference: edge.directionInference
              ? {
                  schemaVersion: edge.directionInference.schemaVersion,
                  kind: edge.directionInference.kind,
                  attestationId: edge.directionInference.attestationId,
                  contentSha256: edge.directionInference.contentSha256,
                  segmentSourceId: edge.directionInference.segmentSourceId,
                  sourceProvenanceKey: edge.directionInference.sourceProvenanceKey,
                  policyId: edge.directionInference.policyId,
                  policyVersion: edge.directionInference.policyVersion,
                  generatorId: edge.directionInference.generatorId,
                  generatorVersion: edge.directionInference.generatorVersion,
                  evidenceArtifactId: edge.directionInference.evidenceArtifactId,
                  evidenceContentSha256: edge.directionInference.evidenceContentSha256,
                  confidenceBps: edge.directionInference.confidenceBps,
                  validFromIso: edge.directionInference.validFromIso,
                  expiresAtIso: edge.directionInference.expiresAtIso,
                }
              : null,
            policy: edge.directionInferencePolicy
              ? {
                  schemaVersion: edge.directionInferencePolicy.schemaVersion,
                  policyId: edge.directionInferencePolicy.policyId,
                  policyVersion: edge.directionInferencePolicy.policyVersion,
                  generatorId: edge.directionInferencePolicy.generatorId,
                  generatorVersion: edge.directionInferencePolicy.generatorVersion,
                  minimumConfidenceBps: edge.directionInferencePolicy.minimumConfidenceBps,
                }
              : null,
            evidenceArtifact: edge.directionEvidenceArtifact
              ? {
                  schemaVersion: edge.directionEvidenceArtifact.schemaVersion,
                  artifactId: edge.directionEvidenceArtifact.artifactId,
                  datasetId: edge.directionEvidenceArtifact.datasetId,
                  datasetVersion: edge.directionEvidenceArtifact.datasetVersion,
                  sourceUrl: edge.directionEvidenceArtifact.sourceUrl,
                  effectiveAtIso: edge.directionEvidenceArtifact.effectiveAtIso,
                  contentSha256: edge.directionEvidenceArtifact.contentSha256,
                  policyId: edge.directionEvidenceArtifact.policyId,
                  policyVersion: edge.directionEvidenceArtifact.policyVersion,
                  generatorId: edge.directionEvidenceArtifact.generatorId,
                  generatorVersion: edge.directionEvidenceArtifact.generatorVersion,
                  licenseReviewId: edge.directionEvidenceArtifact.licenseReviewId,
                }
              : null,
          },
        }
      : {}),
    official: edge.official
      ? {
          provider: edge.official.provider,
          sourceLayerId: edge.official.sourceLayerId,
          sourceObjectId: edge.official.sourceObjectId,
          sectionId: edge.official.sectionId,
          sectionNumber: edge.official.sectionNumber ?? null,
          roadPartCode: edge.official.roadPartCode,
          roadPartNumber: edge.official.roadPartNumber ?? null,
          ownerCode: edge.official.ownerCode,
          roadClassCode: edge.official.roadClassCode,
          directionCode: edge.official.directionCode,
          ...(edge.official.directionFieldState
            ? { directionFieldState: edge.official.directionFieldState }
            : {}),
          inUseFromEpochMs: edge.official.inUseFromEpochMs,
          outOfUseAtEpochMs: edge.official.outOfUseAtEpochMs,
          sourceUpdatedAtEpochMs: edge.official.sourceUpdatedAtEpochMs ?? null,
        }
      : null,
  }))
  return createHash('sha256')
    .update(JSON.stringify({
      version: 1,
      origin: {
        kind: route.origin.kind,
        point: [route.origin.point.lat.toFixed(7), route.origin.point.lon.toFixed(7)],
      },
      destination: {
        kind: route.destination.kind,
        point: [route.destination.point.lat.toFixed(7), route.destination.point.lon.toFixed(7)],
      },
      edges: edgeIdentity,
    }))
    .digest('base64url')
}

/**
 * Resolves canonical and ephemeral navigation endpoints by projecting them to
 * eligible road-segment geometry, then selects one direction-correct route for
 * the requested profile. Exact inputs are used only during projection; the
 * returned anchors are graph-derived points.
 */
export function findRouteAssessmentRoadAnchors(
  graph: IcelandRoadGraph,
  originRequest: RouteAssessmentAnchorRequest,
  destinationRequest: RouteAssessmentAnchorRequest,
  options: FindRouteAssessmentRoadAnchorsOptions,
): RouteAssessmentRoadAnchorsResult {
  const profile = options.profile ?? FASTEST_CAR_PROFILE
  const constraints: RouteSearchConstraints = {
    excludedSegmentIds: options.excludedSegmentIds,
    edgeAdmissibility: options.edgeAdmissibility,
  }
  if (deadlineExceeded(options.deadlineAtMs)) return { status: 'incomplete' }
  const originResolution = resolveCandidates(
    graph,
    originRequest,
    options.maxOriginSnapDistanceM,
    profile,
    options.deadlineAtMs,
  )
  if (originResolution.status === 'incomplete') return { status: 'incomplete' }
  if (originResolution.status === 'ambiguous') return { status: 'ambiguous_trusted_anchor' }
  if (originResolution.status !== 'ok') return { status: 'no_origin_anchor' }

  const destinationResolution = resolveCandidates(
    graph,
    destinationRequest,
    options.maxDestinationSnapDistanceM,
    profile,
    options.deadlineAtMs,
  )
  if (destinationResolution.status === 'incomplete') return { status: 'incomplete' }
  if (destinationResolution.status === 'ambiguous') return { status: 'ambiguous_trusted_anchor' }
  if (destinationResolution.status !== 'ok') return { status: 'no_destination_anchor' }

  const nearestOriginDistanceM = originResolution.candidates[0]?.distanceM ?? 0
  const nearestDestinationDistanceM = destinationResolution.candidates[0]?.distanceM ?? 0
  const maximumRequestedSnapDistanceM = Math.max(
    options.maxOriginSnapDistanceM,
    options.maxDestinationSnapDistanceM,
  )
  const searchBands = [
    ...NEAREST_REACHABLE_SEARCH_BANDS_M.filter(band => band < maximumRequestedSnapDistanceM),
    maximumRequestedSnapDistanceM,
  ]
  let selected: SelectedRoute | null = null
  for (const bandM of searchBands) {
    if (deadlineExceeded(options.deadlineAtMs)) return { status: 'incomplete' }
    const originCandidates = originResolution.candidates.filter(candidate => (
      candidate.distanceM <= nearestOriginDistanceM + bandM
    ))
    const destinationCandidates = destinationResolution.candidates.filter(candidate => (
      candidate.distanceM <= nearestDestinationDistanceM + bandM
    ))
    const directResult = directProjectedRoute(
      originCandidates,
      destinationCandidates,
      profile,
      constraints,
      options.deadlineAtMs,
    )
    if (directResult.status === 'incomplete') return { status: 'incomplete' }
    const routedResult = graphRoute(
      graph,
      originCandidates,
      destinationCandidates,
      profile,
      constraints,
      options.deadlineAtMs,
    )
    if (routedResult.status === 'incomplete') return { status: 'incomplete' }
    const direct = directResult.route
    const routed = routedResult.route
    selected = direct && (!routed || betterRoute(direct, routed)) ? direct : routed
    if (selected) break
  }
  if (!selected) return { status: 'no_route' }
  if (deadlineExceeded(options.deadlineAtMs)) return { status: 'incomplete' }

  const alternatives = assessmentRoadAlternatives(
    graph,
    selected,
    profile,
    constraints,
    options.maxAlternatives,
    options.maxAlternativeOverlap,
    earliestDeadline(options.deadlineAtMs, options.alternativeDeadlineAtMs),
  )
  if (deadlineExceeded(options.deadlineAtMs)) return { status: 'incomplete' }
  const primaryRouteProvenanceFingerprint = createRouteAssessmentRouteProvenanceFingerprint(selected)
  if (deadlineExceeded(options.deadlineAtMs)) return { status: 'incomplete' }
  return {
    status: 'ok',
    origin: publicAnchor(selected.origin),
    destination: publicAnchor(selected.destination),
    connectedRoadEdges: selected.connectedRoadEdges,
    alternatives: alternatives.alternatives,
    alternativesComplete: alternatives.complete,
    alternativeSearchAttempts: alternatives.attempts,
    routeProvenanceFingerprint: primaryRouteProvenanceFingerprint,
  }
}
