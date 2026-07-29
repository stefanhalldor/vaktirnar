import 'server-only'

import { createHash } from 'node:crypto'
import {
  haversineDistanceM,
  ICELAND_ROUTING_PROFILES,
  isIcelandRoadGraphEdgeAllowed,
} from './roadGraph'
import type {
  IcelandRoadGraph,
  IcelandRoadGraphEdge,
  IcelandRoadGraphNode,
} from './roadGraphTypes'
import type { LatLon } from './types'

const MAX_CANONICAL_NODE_CANDIDATES = 64
const TRUSTED_ANCHOR_EQUIVALENCE_M = 0.5
const COST_EPSILON = 1e-9
const FRACTION_EPSILON = 1e-10

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
      routeProvenanceFingerprint: string
    }>
  | Readonly<{
      status: 'no_origin_anchor' | 'no_destination_anchor' | 'ambiguous_trusted_anchor' | 'no_route'
    }>

export type FindRouteAssessmentRoadAnchorsOptions = Readonly<{
  maxOriginSnapDistanceM: number
  maxDestinationSnapDistanceM: number
}>

type NodeCandidate = Readonly<{
  kind: 'settlement_node'
  node: IcelandRoadGraphNode
  point: LatLon
  distanceM: number
  /** Preserves nearest-road selection priority after a sub-metre edge endpoint normalizes to its node. */
  projectedRequest?: true
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
  | Readonly<{ status: 'none' | 'ambiguous' }>

type QueueEntry = Readonly<{
  nodeId: string
  projectedSnapDistanceM: number
  cost: number
  key: string
}>

type SelectedRoute = Readonly<{
  projectedSnapDistanceM: number
  cost: number
  key: string
  origin: AnchorCandidate
  destination: AnchorCandidate
  connectedRoadEdges: readonly IcelandRoadGraphEdge[]
}>

const FASTEST_CAR_PROFILE = ICELAND_ROUTING_PROFILES.fastestCar

function finitePoint(point: LatLon): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lon)
}

function validMaxDistance(value: number): boolean {
  return Number.isFinite(value) && value >= 0
}

function snapCost(distanceM: number): number {
  return (distanceM / 1_000 / 50) * 3_600
}

function edgeCost(edge: IcelandRoadGraphEdge, fraction = 1): number {
  return edge.travelTimeS * Math.max(0, Math.min(1, fraction))
}

function candidateKey(candidate: AnchorCandidate): string {
  return candidate.kind === 'settlement_node'
    ? `node:${candidate.node.id}`
    : `edge:${candidate.edge.segmentId}:${candidate.edge.id}:${candidate.fraction.toFixed(12)}`
}

function projectedPriorityDistanceM(candidate: AnchorCandidate): number {
  return candidate.kind === 'projected_road' || candidate.projectedRequest
    ? candidate.distanceM
    : 0
}

function sortedNodeCandidates(
  graph: IcelandRoadGraph,
  point: LatLon,
  maxDistanceM: number,
): NodeCandidate[] {
  if (!finitePoint(point) || !validMaxDistance(maxDistanceM)) return []
  const candidates: NodeCandidate[] = []
  for (const node of graph.nodes.values()) {
    const distanceM = haversineDistanceM(point, node.point)
    if (distanceM <= maxDistanceM) {
      candidates.push({ kind: 'settlement_node', node, point: node.point, distanceM })
    }
  }
  return candidates
    .sort((a, b) => a.distanceM - b.distanceM || a.node.id.localeCompare(b.node.id))
    .slice(0, MAX_CANONICAL_NODE_CANDIDATES)
}

function edgeGeometryDistances(edge: IcelandRoadGraphEdge): number[] | null {
  if (edge.geometry.length < 2) return null
  const cumulative = [0]
  for (let index = 1; index < edge.geometry.length; index += 1) {
    const previous = edge.geometry[index - 1]
    const current = edge.geometry[index]
    if (!finitePoint(previous) || !finitePoint(current)) return null
    cumulative.push(cumulative[index - 1] + haversineDistanceM(previous, current))
  }
  const totalDistanceM = cumulative[cumulative.length - 1] ?? 0
  return Number.isFinite(totalDistanceM) && totalDistanceM > 0 ? cumulative : null
}

function projectPointToEdge(point: LatLon, edge: IcelandRoadGraphEdge): EdgeProjection | null {
  if (!finitePoint(point)) return null
  const cumulative = edgeGeometryDistances(edge)
  if (!cumulative) return null
  const totalDistanceM = cumulative[cumulative.length - 1]
  let best: { point: LatLon; distanceM: number; distanceAlongEdgeM: number } | null = null

  for (let index = 0; index + 1 < edge.geometry.length; index += 1) {
    const a = edge.geometry[index]
    const b = edge.geometry[index + 1]
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

  return best
    ? {
        point: best.point,
        distanceM: best.distanceM,
        fraction: Math.max(0, Math.min(1, best.distanceAlongEdgeM / totalDistanceM)),
      }
    : null
}

function sortedEdgeCandidates(
  graph: IcelandRoadGraph,
  point: LatLon,
  maxDistanceM: number,
): EdgeCandidate[] {
  if (!finitePoint(point) || !validMaxDistance(maxDistanceM)) return []
  const candidates: EdgeCandidate[] = []
  for (const edge of graph.edges) {
    if (!isIcelandRoadGraphEdgeAllowed(edge, FASTEST_CAR_PROFILE)) continue
    const projection = projectPointToEdge(point, edge)
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
  return candidates.sort((a, b) => (
    a.distanceM - b.distanceM
    || a.edge.segmentId.localeCompare(b.edge.segmentId)
    || a.edge.id.localeCompare(b.edge.id)
    || a.fraction - b.fraction
  ))
}

function normalizeProjectedEndpointCandidates(
  graph: IcelandRoadGraph,
  requestPoint: LatLon,
  candidates: readonly EdgeCandidate[],
): AnchorCandidate[] {
  const normalized: AnchorCandidate[] = []
  const normalizedNodeIds = new Set<string>()
  for (const candidate of candidates) {
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
      projectedRequest: true,
    })
  }
  return normalized.sort((a, b) => (
    projectedPriorityDistanceM(a) - projectedPriorityDistanceM(b)
    || candidateKey(a).localeCompare(candidateKey(b))
  ))
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
): CandidateResolution {
  const nodes = sortedNodeCandidates(graph, point, maxDistanceM)
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

  const edges = sortedEdgeCandidates(graph, point, maxDistanceM)
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
): CandidateResolution {
  if (request.kind === 'canonical_node') {
    const candidates = sortedNodeCandidates(graph, request.point, maxDistanceM)
    return candidates.length > 0 ? { status: 'ok', candidates } : { status: 'none' }
  }
  if (request.kind === 'projected_road') {
    const candidates = normalizeProjectedEndpointCandidates(
      graph,
      request.point,
      sortedEdgeCandidates(graph, request.point, maxDistanceM),
    )
    return candidates.length > 0 ? { status: 'ok', candidates } : { status: 'none' }
  }
  return resolveTrustedCandidates(graph, request.point, maxDistanceM)
}

function pointAtGeometryFraction(
  geometry: readonly LatLon[],
  cumulative: readonly number[],
  fraction: number,
): LatLon {
  const clamped = Math.max(0, Math.min(1, fraction))
  const totalDistanceM = cumulative[cumulative.length - 1]
  const targetDistanceM = totalDistanceM * clamped
  for (let index = 0; index + 1 < cumulative.length; index += 1) {
    if (targetDistanceM > cumulative[index + 1]) continue
    const segmentDistanceM = cumulative[index + 1] - cumulative[index]
    const segmentFraction = segmentDistanceM <= 0
      ? 0
      : (targetDistanceM - cumulative[index]) / segmentDistanceM
    const a = geometry[index]
    const b = geometry[index + 1]
    return {
      lat: a.lat + segmentFraction * (b.lat - a.lat),
      lon: a.lon + segmentFraction * (b.lon - a.lon),
    }
  }
  return geometry[geometry.length - 1]
}

function sliceEdge(
  edge: IcelandRoadGraphEdge,
  rawStartFraction: number,
  rawEndFraction: number,
): IcelandRoadGraphEdge | null {
  const startFraction = Math.max(0, Math.min(1, rawStartFraction))
  const endFraction = Math.max(0, Math.min(1, rawEndFraction))
  if (endFraction - startFraction <= FRACTION_EPSILON) return null
  if (startFraction <= FRACTION_EPSILON && endFraction >= 1 - FRACTION_EPSILON) return edge

  const cumulative = edgeGeometryDistances(edge)
  if (!cumulative) return null
  const totalDistanceM = cumulative[cumulative.length - 1]
  const startDistanceM = totalDistanceM * startFraction
  const endDistanceM = totalDistanceM * endFraction
  const geometry: LatLon[] = [pointAtGeometryFraction(edge.geometry, cumulative, startFraction)]
  for (let index = 1; index + 1 < edge.geometry.length; index += 1) {
    if (cumulative[index] > startDistanceM && cumulative[index] < endDistanceM) {
      geometry.push(edge.geometry[index])
    }
  }
  const endPoint = pointAtGeometryFraction(edge.geometry, cumulative, endFraction)
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

function originStart(candidate: AnchorCandidate): {
  nodeId: string
  cost: number
  prefix: readonly IcelandRoadGraphEdge[]
} {
  if (candidate.kind === 'settlement_node') {
    return { nodeId: candidate.node.id, cost: snapCost(candidate.distanceM), prefix: [] }
  }
  const prefix = sliceEdge(candidate.edge, candidate.fraction, 1)
  return {
    nodeId: candidate.edge.toNodeId,
    cost: snapCost(candidate.distanceM) + edgeCost(candidate.edge, 1 - candidate.fraction),
    prefix: prefix ? [prefix] : [],
  }
}

function destinationEnd(candidate: AnchorCandidate): {
  nodeId: string
  cost: number
  suffix: readonly IcelandRoadGraphEdge[]
} {
  if (candidate.kind === 'settlement_node') {
    return { nodeId: candidate.node.id, cost: snapCost(candidate.distanceM), suffix: [] }
  }
  const suffix = sliceEdge(candidate.edge, 0, candidate.fraction)
  return {
    nodeId: candidate.edge.fromNodeId,
    cost: snapCost(candidate.distanceM) + edgeCost(candidate.edge, candidate.fraction),
    suffix: suffix ? [suffix] : [],
  }
}

class MinPriorityQueue {
  private readonly values: QueueEntry[] = []

  get size(): number {
    return this.values.length
  }

  private before(a: QueueEntry, b: QueueEntry): boolean {
    return a.projectedSnapDistanceM < b.projectedSnapDistanceM - COST_EPSILON
      || (
        Math.abs(a.projectedSnapDistanceM - b.projectedSnapDistanceM) <= COST_EPSILON
        && (
          a.cost < b.cost - COST_EPSILON
          || (Math.abs(a.cost - b.cost) <= COST_EPSILON && a.key < b.key)
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
    || candidate.projectedSnapDistanceM < current.projectedSnapDistanceM - COST_EPSILON
    || (
      Math.abs(candidate.projectedSnapDistanceM - current.projectedSnapDistanceM) <= COST_EPSILON
      && (
        candidate.cost < current.cost - COST_EPSILON
        || (Math.abs(candidate.cost - current.cost) <= COST_EPSILON && candidate.key < current.key)
      )
    )
}

function projectedSnapDistanceM(
  origin: AnchorCandidate,
  destination: AnchorCandidate,
): number {
  return projectedPriorityDistanceM(origin) + projectedPriorityDistanceM(destination)
}

function directProjectedRoute(
  origins: readonly AnchorCandidate[],
  destinations: readonly AnchorCandidate[],
): SelectedRoute | null {
  let selected: SelectedRoute | null = null
  for (const origin of origins) {
    if (origin.kind !== 'projected_road') continue
    for (const destination of destinations) {
      if (
        destination.kind !== 'projected_road'
        || destination.edge.id !== origin.edge.id
        || destination.fraction - origin.fraction <= FRACTION_EPSILON
      ) continue
      const partial = sliceEdge(origin.edge, origin.fraction, destination.fraction)
      if (!partial) continue
      const candidate: SelectedRoute = {
        projectedSnapDistanceM: projectedSnapDistanceM(origin, destination),
        cost: snapCost(origin.distanceM)
          + edgeCost(origin.edge, destination.fraction - origin.fraction)
          + snapCost(destination.distanceM),
        key: `${candidateKey(origin)}>${candidateKey(destination)}`,
        origin,
        destination,
        connectedRoadEdges: [partial],
      }
      if (betterRoute(candidate, selected)) selected = candidate
    }
  }
  return selected
}

function graphRoute(
  graph: IcelandRoadGraph,
  origins: readonly AnchorCandidate[],
  destinations: readonly AnchorCandidate[],
): SelectedRoute | null {
  const distanceByNode = new Map<string, number>()
  const projectedSnapByNode = new Map<string, number>()
  const keyByNode = new Map<string, string>()
  const sourceByNode = new Map<string, {
    candidate: AnchorCandidate
    startNodeId: string
    prefix: readonly IcelandRoadGraphEdge[]
  }>()
  const previousByNode = new Map<string, IcelandRoadGraphEdge>()
  const queue = new MinPriorityQueue()

  for (const candidate of origins) {
    const start = originStart(candidate)
    if (!graph.nodes.has(start.nodeId)) continue
    const key = candidateKey(candidate)
    const projectedSnap = projectedPriorityDistanceM(candidate)
    const previousProjectedSnap = projectedSnapByNode.get(start.nodeId) ?? Number.POSITIVE_INFINITY
    const previousCost = distanceByNode.get(start.nodeId) ?? Number.POSITIVE_INFINITY
    const previousKey = keyByNode.get(start.nodeId)
    if (
      projectedSnap > previousProjectedSnap + COST_EPSILON
      || (
        Math.abs(projectedSnap - previousProjectedSnap) <= COST_EPSILON
        && (
          start.cost > previousCost + COST_EPSILON
          || (
            Math.abs(start.cost - previousCost) <= COST_EPSILON
            && previousKey !== undefined
            && key >= previousKey
          )
        )
      )
    ) continue
    projectedSnapByNode.set(start.nodeId, projectedSnap)
    distanceByNode.set(start.nodeId, start.cost)
    keyByNode.set(start.nodeId, key)
    sourceByNode.set(start.nodeId, {
      candidate,
      startNodeId: start.nodeId,
      prefix: start.prefix,
    })
    previousByNode.delete(start.nodeId)
    queue.push({
      nodeId: start.nodeId,
      projectedSnapDistanceM: projectedSnap,
      cost: start.cost,
      key,
    })
  }

  const destinationByNode = new Map<string, Array<{
    candidate: AnchorCandidate
    cost: number
    suffix: readonly IcelandRoadGraphEdge[]
  }>>()
  for (const candidate of destinations) {
    const end = destinationEnd(candidate)
    if (!graph.nodes.has(end.nodeId)) continue
    const values = destinationByNode.get(end.nodeId) ?? []
    values.push({ candidate, cost: end.cost, suffix: end.suffix })
    destinationByNode.set(end.nodeId, values)
  }
  for (const values of destinationByNode.values()) {
    values.sort((a, b) => candidateKey(a.candidate).localeCompare(candidateKey(b.candidate)))
  }

  let selected: SelectedRoute | null = null
  const visited = new Set<string>()
  while (queue.size > 0) {
    const current = queue.pop()
    if (!current || visited.has(current.nodeId)) continue
    if (
      Math.abs(
        (projectedSnapByNode.get(current.nodeId) ?? Number.POSITIVE_INFINITY)
          - current.projectedSnapDistanceM,
      ) > COST_EPSILON
      ||
      Math.abs((distanceByNode.get(current.nodeId) ?? Number.POSITIVE_INFINITY) - current.cost) > COST_EPSILON
      || keyByNode.get(current.nodeId) !== current.key
    ) continue
    visited.add(current.nodeId)

    const source = sourceByNode.get(current.nodeId)
    if (!source) continue
    for (const destination of destinationByNode.get(current.nodeId) ?? []) {
      const path: IcelandRoadGraphEdge[] = []
      let pathComplete = true
      let cursor = current.nodeId
      while (cursor !== source.startNodeId) {
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
        projectedSnapDistanceM: projectedSnapDistanceM(source.candidate, destination.candidate),
        cost: current.cost + destination.cost,
        key: `${current.key}>${candidateKey(destination.candidate)}`,
        origin: source.candidate,
        destination: destination.candidate,
        connectedRoadEdges,
      }
      if (betterRoute(candidate, selected)) selected = candidate
    }

    const outgoing = [...(graph.outgoing.get(current.nodeId) ?? [])]
      .filter(edge => isIcelandRoadGraphEdgeAllowed(edge, FASTEST_CAR_PROFILE))
      .sort((a, b) => a.id.localeCompare(b.id))
    for (const edge of outgoing) {
      if (!graph.nodes.has(edge.toNodeId) || visited.has(edge.toNodeId)) continue
      const candidateCost = current.cost + edgeCost(edge)
      const candidateKeyValue = `${current.key}>${edge.id}`
      const previousProjectedSnap = projectedSnapByNode.get(edge.toNodeId) ?? Number.POSITIVE_INFINITY
      const previousCost = distanceByNode.get(edge.toNodeId) ?? Number.POSITIVE_INFINITY
      const previousKey = keyByNode.get(edge.toNodeId)
      if (
        current.projectedSnapDistanceM > previousProjectedSnap + COST_EPSILON
        || (
          Math.abs(current.projectedSnapDistanceM - previousProjectedSnap) <= COST_EPSILON
          && (
            candidateCost > previousCost + COST_EPSILON
            || (
              Math.abs(candidateCost - previousCost) <= COST_EPSILON
              && previousKey !== undefined
              && candidateKeyValue >= previousKey
            )
          )
        )
      ) continue
      projectedSnapByNode.set(edge.toNodeId, current.projectedSnapDistanceM)
      distanceByNode.set(edge.toNodeId, candidateCost)
      keyByNode.set(edge.toNodeId, candidateKeyValue)
      sourceByNode.set(edge.toNodeId, source)
      previousByNode.set(edge.toNodeId, edge)
      queue.push({
        nodeId: edge.toNodeId,
        projectedSnapDistanceM: current.projectedSnapDistanceM,
        cost: candidateCost,
        key: candidateKeyValue,
      })
    }
  }
  return selected
}

function publicAnchor(candidate: AnchorCandidate): ResolvedRouteAssessmentAnchor {
  return {
    kind: candidate.kind,
    point: candidate.point,
    snapDistanceM: Math.round(candidate.distanceM),
  }
}

function routeProvenanceFingerprint(route: SelectedRoute): string {
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
 * Resolves canonical settlement nodes and/or ephemeral navigation-road
 * projections into one direction-correct fastest-car path. Exact navigation
 * inputs are used only while projecting and are never present in the result.
 */
export function findRouteAssessmentRoadAnchors(
  graph: IcelandRoadGraph,
  originRequest: RouteAssessmentAnchorRequest,
  destinationRequest: RouteAssessmentAnchorRequest,
  options: FindRouteAssessmentRoadAnchorsOptions,
): RouteAssessmentRoadAnchorsResult {
  const originResolution = resolveCandidates(
    graph,
    originRequest,
    options.maxOriginSnapDistanceM,
  )
  if (originResolution.status === 'ambiguous') return { status: 'ambiguous_trusted_anchor' }
  if (originResolution.status !== 'ok') return { status: 'no_origin_anchor' }

  const destinationResolution = resolveCandidates(
    graph,
    destinationRequest,
    options.maxDestinationSnapDistanceM,
  )
  if (destinationResolution.status === 'ambiguous') return { status: 'ambiguous_trusted_anchor' }
  if (destinationResolution.status !== 'ok') return { status: 'no_destination_anchor' }

  const direct = directProjectedRoute(
    originResolution.candidates,
    destinationResolution.candidates,
  )
  const routed = graphRoute(
    graph,
    originResolution.candidates,
    destinationResolution.candidates,
  )
  const selected = direct && (!routed || betterRoute(direct, routed)) ? direct : routed
  if (!selected) return { status: 'no_route' }

  return {
    status: 'ok',
    origin: publicAnchor(selected.origin),
    destination: publicAnchor(selected.destination),
    connectedRoadEdges: selected.connectedRoadEdges,
    routeProvenanceFingerprint: routeProvenanceFingerprint(selected),
  }
}
