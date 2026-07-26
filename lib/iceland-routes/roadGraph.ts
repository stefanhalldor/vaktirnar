import type { LatLon } from './types'
import type {
  IcelandRoadClass,
  IcelandRoadGraph,
  IcelandRoadGraphDiagnostics,
  IcelandRoadGraphEdge,
  IcelandRoadGraphNode,
  IcelandRoadGraphRoute,
  IcelandRoadGraphRouteResult,
  IcelandRoadGraphSegmentInput,
  IcelandRoadRoutingProfile,
  IcelandRoadSurface,
  IcelandRoadSurfaceBreakdown,
} from './roadGraphTypes'

const EARTH_RADIUS_M = 6_371_000
const DEFAULT_NODE_SNAP_TOLERANCE_M = 15
const DEFAULT_ROUTE_POINT_SNAP_MAX_M = 25_000

export const ICELAND_ROUTING_PROFILES = {
  fastestCar: {
    objective: 'fastest',
    gravelPenaltyFactor: 1.15,
    mountainPenaltyFactor: 1.1,
  },
  shortestPaved: {
    objective: 'shortest',
    requirePaved: true,
    avoidFRoads: true,
  },
  fastestPaved: {
    objective: 'fastest',
    requirePaved: true,
    avoidFRoads: true,
  },
  caravan: {
    objective: 'fastest',
    requirePaved: true,
    avoidFRoads: true,
    avoidMountainRoads: true,
  },
} as const satisfies Record<string, IcelandRoadRoutingProfile>

export function haversineDistanceM(a: LatLon, b: LatLon): number {
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const dLat = lat2 - lat1
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function geometryLengthM(geometry: readonly LatLon[]): number {
  let lengthM = 0
  for (let index = 1; index < geometry.length; index += 1) {
    lengthM += haversineDistanceM(geometry[index - 1], geometry[index])
  }
  return lengthM
}

export function derivedRoadSpeedKmh(
  roadClass: IcelandRoadClass,
  surface: IcelandRoadSurface,
  isFRoad = false,
): number {
  if (isFRoad) return 30

  const classSpeed: Record<IcelandRoadClass, number> = {
    trunk: 85,
    highland_trunk: 45,
    connector: 75,
    district: 65,
    local: 55,
    ferry: 20,
    other: 50,
  }
  const surfaceCap: Record<IcelandRoadSurface, number> = {
    paved: Number.POSITIVE_INFINITY,
    gravel: 55,
    mixed: 50,
    unknown: 45,
  }
  return Math.min(classSpeed[roadClass], surfaceCap[surface])
}

function nodeBucket(point: LatLon, toleranceM: number): { x: number; y: number } {
  const degreeStep = toleranceM / 111_320
  return {
    x: Math.round(point.lon / degreeStep),
    y: Math.round(point.lat / degreeStep),
  }
}

function reverseGeometry(geometry: readonly LatLon[]): readonly LatLon[] {
  return [...geometry].reverse()
}

export interface BuildIcelandRoadGraphOptions {
  nodeSnapToleranceM?: number
}

export function buildIcelandRoadGraph(
  inputs: readonly IcelandRoadGraphSegmentInput[],
  options: BuildIcelandRoadGraphOptions = {},
): IcelandRoadGraph {
  const toleranceM = options.nodeSnapToleranceM ?? DEFAULT_NODE_SNAP_TOLERANCE_M
  const nodes = new Map<string, IcelandRoadGraphNode>()
  const nodeIdsByBucket = new Map<string, string[]>()
  const edges: IcelandRoadGraphEdge[] = []
  let nextNodeId = 1

  function resolveNode(point: LatLon): IcelandRoadGraphNode {
    const bucket = nodeBucket(point, toleranceM)
    // Longitude degrees are shorter in Iceland than latitude degrees, so scan
    // adjacent buckets before applying the authoritative Haversine tolerance.
    for (let xOffset = -2; xOffset <= 2; xOffset += 1) {
      for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
        const candidateIds = nodeIdsByBucket.get(`${bucket.x + xOffset}:${bucket.y + yOffset}`) ?? []
        for (const candidateId of candidateIds) {
          const candidate = nodes.get(candidateId)
          if (candidate && haversineDistanceM(candidate.point, point) <= toleranceM) {
            return candidate
          }
        }
      }
    }

    const node = { id: `node-${nextNodeId++}`, point }
    nodes.set(node.id, node)
    const bucketKey = `${bucket.x}:${bucket.y}`
    nodeIdsByBucket.set(bucketKey, [...(nodeIdsByBucket.get(bucketKey) ?? []), node.id])
    return node
  }

  function addEdge(
    input: IcelandRoadGraphSegmentInput,
    fromNode: IcelandRoadGraphNode,
    toNode: IcelandRoadGraphNode,
    geometry: readonly LatLon[],
    suffix: string,
  ): void {
    const geometryLength = geometryLengthM(geometry)
    const lengthM = input.lengthM && input.lengthM > 0 ? input.lengthM : geometryLength
    const speedKmh = input.speedKmh && input.speedKmh > 0
      ? input.speedKmh
      : derivedRoadSpeedKmh(input.roadClass, input.surface, input.isFRoad)
    edges.push({
      id: `${input.id}:${suffix}`,
      segmentId: input.id,
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      geometry,
      lengthM,
      travelTimeS: (lengthM / 1000 / speedKmh) * 3600,
      speedKmh,
      // A numeric speed without explicit provenance must never be promoted to
      // an official value implicitly.
      speedSource: input.speedSource ?? 'derived',
      roadNumber: input.roadNumber,
      roadName: input.roadName,
      roadClass: input.roadClass,
      surface: input.surface,
      isFRoad: input.isFRoad ?? false,
      isMountainRoad: input.isMountainRoad ?? false,
      isSeasonal: input.isSeasonal ?? false,
    })
  }

  for (const input of inputs) {
    if (input.geometry.length < 2) continue
    const first = input.geometry[0]
    const last = input.geometry[input.geometry.length - 1]
    if (!Number.isFinite(first.lat) || !Number.isFinite(first.lon) ||
        !Number.isFinite(last.lat) || !Number.isFinite(last.lon)) continue

    const firstNode = resolveNode(first)
    const lastNode = resolveNode(last)
    if (firstNode.id === lastNode.id) continue

    if (input.direction === 'forward' || input.direction === 'both') {
      addEdge(input, firstNode, lastNode, input.geometry, 'forward')
    }
    if (input.direction === 'reverse' || input.direction === 'both') {
      addEdge(input, lastNode, firstNode, reverseGeometry(input.geometry), 'reverse')
    }
  }

  const outgoingMutable = new Map<string, IcelandRoadGraphEdge[]>()
  for (const edge of edges) {
    const existing = outgoingMutable.get(edge.fromNodeId) ?? []
    existing.push(edge)
    outgoingMutable.set(edge.fromNodeId, existing)
  }

  return { nodes, edges, outgoing: outgoingMutable }
}

export function analyzeIcelandRoadGraph(graph: IcelandRoadGraph): IcelandRoadGraphDiagnostics {
  const neighbours = new Map<string, Set<string>>()
  for (const nodeId of graph.nodes.keys()) neighbours.set(nodeId, new Set())
  for (const edge of graph.edges) {
    neighbours.get(edge.fromNodeId)?.add(edge.toNodeId)
    neighbours.get(edge.toNodeId)?.add(edge.fromNodeId)
  }

  const visited = new Set<string>()
  let weakComponentCount = 0
  let largestWeakComponentNodeCount = 0
  for (const nodeId of graph.nodes.keys()) {
    if (visited.has(nodeId)) continue
    weakComponentCount += 1
    let componentSize = 0
    const pending = [nodeId]
    visited.add(nodeId)
    while (pending.length > 0) {
      const current = pending.pop()!
      componentSize += 1
      for (const neighbour of neighbours.get(current) ?? []) {
        if (visited.has(neighbour)) continue
        visited.add(neighbour)
        pending.push(neighbour)
      }
    }
    largestWeakComponentNodeCount = Math.max(largestWeakComponentNodeCount, componentSize)
  }

  const surfaceEdgeCounts = { paved: 0, gravel: 0, mixed: 0, unknown: 0 }
  let derivedSpeedEdgeCount = 0
  for (const edge of graph.edges) {
    surfaceEdgeCounts[edge.surface] += 1
    if (edge.speedSource === 'derived') derivedSpeedEdgeCount += 1
  }

  return {
    nodeCount: graph.nodes.size,
    edgeCount: graph.edges.length,
    segmentCount: new Set(graph.edges.map(edge => edge.segmentId)).size,
    weakComponentCount,
    largestWeakComponentNodeCount,
    isolatedNodeCount: [...neighbours.values()].filter(set => set.size === 0).length,
    surfaceEdgeCounts,
    derivedSpeedEdgeCount,
  }
}

function edgeAllowed(edge: IcelandRoadGraphEdge, profile: IcelandRoadRoutingProfile, excludedSegmentIds?: ReadonlySet<string>): boolean {
  if (excludedSegmentIds?.has(edge.segmentId)) return false
  if (profile.requirePaved && edge.surface !== 'paved') return false
  if (profile.avoidFRoads && edge.isFRoad) return false
  if (profile.avoidMountainRoads && edge.isMountainRoad) return false
  if (edge.isSeasonal) return false
  return true
}

function edgeCost(edge: IcelandRoadGraphEdge, profile: IcelandRoadRoutingProfile): number {
  let cost = profile.objective === 'fastest' ? edge.travelTimeS : edge.lengthM
  if (edge.surface === 'gravel') cost *= profile.gravelPenaltyFactor ?? 1
  if (edge.isMountainRoad) cost *= profile.mountainPenaltyFactor ?? 1
  return cost
}

function nearbyNodes(
  graph: IcelandRoadGraph,
  point: LatLon,
  maxDistanceM: number,
  limit = 64,
): { node: IcelandRoadGraphNode; distanceM: number }[] {
  const matches: { node: IcelandRoadGraphNode; distanceM: number }[] = []
  for (const node of graph.nodes.values()) {
    const distanceM = haversineDistanceM(point, node.point)
    if (distanceM <= maxDistanceM) matches.push({ node, distanceM })
  }
  return matches.sort((a, b) => a.distanceM - b.distanceM).slice(0, limit)
}

function weakComponentIds(graph: IcelandRoadGraph): ReadonlyMap<string, number> {
  const neighbours = new Map<string, Set<string>>()
  for (const nodeId of graph.nodes.keys()) neighbours.set(nodeId, new Set())
  for (const edge of graph.edges) {
    neighbours.get(edge.fromNodeId)?.add(edge.toNodeId)
    neighbours.get(edge.toNodeId)?.add(edge.fromNodeId)
  }

  const result = new Map<string, number>()
  let componentId = 0
  for (const nodeId of graph.nodes.keys()) {
    if (result.has(nodeId)) continue
    componentId += 1
    const pending = [nodeId]
    result.set(nodeId, componentId)
    while (pending.length > 0) {
      const current = pending.pop()!
      for (const neighbour of neighbours.get(current) ?? []) {
        if (result.has(neighbour)) continue
        result.set(neighbour, componentId)
        pending.push(neighbour)
      }
    }
  }
  return result
}

function nearestMatchPerComponent(
  matches: readonly { node: IcelandRoadGraphNode; distanceM: number }[],
  componentIds: ReadonlyMap<string, number>,
): ReadonlyMap<number, { node: IcelandRoadGraphNode; distanceM: number }> {
  const result = new Map<number, { node: IcelandRoadGraphNode; distanceM: number }>()
  for (const match of matches) {
    const componentId = componentIds.get(match.node.id)
    if (componentId === undefined) continue
    const current = result.get(componentId)
    if (!current || match.distanceM < current.distanceM) result.set(componentId, match)
  }
  return result
}

function appendGeometry(target: LatLon[], geometry: readonly LatLon[]): void {
  for (const point of geometry) {
    const previous = target[target.length - 1]
    if (!previous || previous.lat !== point.lat || previous.lon !== point.lon) {
      target.push(point)
    }
  }
}

function emptySurfaceBreakdown(): IcelandRoadSurfaceBreakdown {
  return { pavedM: 0, gravelM: 0, mixedM: 0, unknownM: 0 }
}

function buildRoute(edges: readonly IcelandRoadGraphEdge[]): IcelandRoadGraphRoute {
  const geometry: LatLon[] = []
  const nodeIds: string[] = []
  const surface = emptySurfaceBreakdown()
  let distanceM = 0
  let durationS = 0
  let derivedSpeedDistanceM = 0

  for (const edge of edges) {
    if (nodeIds.length === 0) nodeIds.push(edge.fromNodeId)
    nodeIds.push(edge.toNodeId)
    appendGeometry(geometry, edge.geometry)
    distanceM += edge.lengthM
    durationS += edge.travelTimeS
    if (edge.speedSource === 'derived') derivedSpeedDistanceM += edge.lengthM
    if (edge.surface === 'paved') surface.pavedM += edge.lengthM
    else if (edge.surface === 'gravel') surface.gravelM += edge.lengthM
    else if (edge.surface === 'mixed') surface.mixedM += edge.lengthM
    else surface.unknownM += edge.lengthM
  }

  return {
    nodeIds,
    edgeIds: edges.map(edge => edge.id),
    segmentIds: edges.map(edge => edge.segmentId),
    geometry,
    distanceM: Math.round(distanceM),
    durationS: Math.round(durationS),
    surface: {
      pavedM: Math.round(surface.pavedM),
      gravelM: Math.round(surface.gravelM),
      mixedM: Math.round(surface.mixedM),
      unknownM: Math.round(surface.unknownM),
    },
    derivedSpeedDistanceM: Math.round(derivedSpeedDistanceM),
  }
}

interface QueueEntry {
  nodeId: string
  cost: number
}

class MinPriorityQueue {
  private readonly values: QueueEntry[] = []

  get size(): number {
    return this.values.length
  }

  push(value: QueueEntry): void {
    this.values.push(value)
    let index = this.values.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (this.values[parent].cost <= value.cost) break
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
      const smaller = right < this.values.length && this.values[right].cost < this.values[left].cost
        ? right
        : left
      if (this.values[smaller].cost >= last.cost) break
      this.values[index] = this.values[smaller]
      index = smaller
    }
    this.values[index] = last
    return first
  }
}

export interface FindIcelandRoadGraphRouteOptions {
  profile: IcelandRoadRoutingProfile
  maxSnapDistanceM?: number
  excludedSegmentIds?: ReadonlySet<string>
}

export function findIcelandRoadGraphRoute(
  graph: IcelandRoadGraph,
  origin: LatLon,
  destination: LatLon,
  options: FindIcelandRoadGraphRouteOptions,
): IcelandRoadGraphRouteResult {
  const maxSnapDistanceM = options.maxSnapDistanceM ?? DEFAULT_ROUTE_POINT_SNAP_MAX_M
  const originMatches = nearbyNodes(graph, origin, maxSnapDistanceM)
  const destinationMatches = nearbyNodes(graph, destination, maxSnapDistanceM)
  if (originMatches.length === 0 || destinationMatches.length === 0) return { status: 'no_nearby_node' }

  const componentIds = weakComponentIds(graph)
  const originByComponent = nearestMatchPerComponent(originMatches, componentIds)
  const destinationByComponent = nearestMatchPerComponent(destinationMatches, componentIds)
  const sharedComponentIds = [...originByComponent.keys()]
    .filter(componentId => destinationByComponent.has(componentId))
  if (sharedComponentIds.length === 0) return { status: 'no_route' }

  const compatibleOriginMatches = sharedComponentIds.map(componentId => originByComponent.get(componentId)!)
  const compatibleDestinationMatches = sharedComponentIds.map(componentId => destinationByComponent.get(componentId)!)

  const snapCost = (distanceM: number) => options.profile.objective === 'fastest'
    ? (distanceM / 1000 / 50) * 3600
    : distanceM
  const destinationByNodeId = new Map(compatibleDestinationMatches.map(match => [match.node.id, match]))
  const distances = new Map<string, number>()
  const sourceByNodeId = new Map<string, { node: IcelandRoadGraphNode; distanceM: number }>()
  const previous = new Map<string, IcelandRoadGraphEdge>()
  const visited = new Set<string>()
  const queue = new MinPriorityQueue()
  for (const match of compatibleOriginMatches) {
    const cost = snapCost(match.distanceM)
    if (cost >= (distances.get(match.node.id) ?? Number.POSITIVE_INFINITY)) continue
    distances.set(match.node.id, cost)
    sourceByNodeId.set(match.node.id, match)
    queue.push({ nodeId: match.node.id, cost })
  }

  let selectedDestination: { node: IcelandRoadGraphNode; distanceM: number } | null = null
  let selectedDestinationCost = Number.POSITIVE_INFINITY

  while (queue.size > 0) {
    const current = queue.pop()
    if (!current || visited.has(current.nodeId)) continue
    const currentId = current.nodeId
    const currentDistance = current.cost
    if (currentDistance > selectedDestinationCost) break
    visited.add(currentId)

    const destinationMatch = destinationByNodeId.get(currentId)
    if (destinationMatch) {
      const totalCost = currentDistance + snapCost(destinationMatch.distanceM)
      if (totalCost < selectedDestinationCost) {
        selectedDestination = destinationMatch
        selectedDestinationCost = totalCost
      }
    }

    for (const edge of graph.outgoing.get(currentId) ?? []) {
      if (visited.has(edge.toNodeId) || !edgeAllowed(edge, options.profile, options.excludedSegmentIds)) continue
      const candidate = currentDistance + edgeCost(edge, options.profile)
      if (candidate < (distances.get(edge.toNodeId) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.toNodeId, candidate)
        previous.set(edge.toNodeId, edge)
        const source = sourceByNodeId.get(currentId)
        if (source) sourceByNodeId.set(edge.toNodeId, source)
        queue.push({ nodeId: edge.toNodeId, cost: candidate })
      }
    }
  }

  if (!selectedDestination) return { status: 'no_route' }

  const destinationId = selectedDestination.node.id
  const originMatch = sourceByNodeId.get(destinationId)
  if (!originMatch) return { status: 'no_route' }
  const startId = originMatch.node.id

  const routeEdges: IcelandRoadGraphEdge[] = []
  let cursor = destinationId
  while (cursor !== startId) {
    const edge = previous.get(cursor)
    if (!edge) return { status: 'no_route' }
    routeEdges.push(edge)
    cursor = edge.fromNodeId
  }
  routeEdges.reverse()

  return {
    status: 'ok',
    route: buildRoute(routeEdges),
    snappedOriginNodeId: startId,
    snappedDestinationNodeId: destinationId,
    originSnapDistanceM: Math.round(originMatch.distanceM),
    destinationSnapDistanceM: Math.round(selectedDestination.distanceM),
  }
}

export interface IcelandRoadGraphAlternative {
  route: IcelandRoadGraphRoute
  originSnapDistanceM: number
  destinationSnapDistanceM: number
  overlapWithPrimary: number
}

/**
 * Produces meaningfully different candidates by removing one primary segment at
 * a time and retaining the cheapest unique alternatives. This is deliberately
 * bounded: it is an audit/preview primitive, not yet a production K-shortest
 * paths promise.
 */
export function findIcelandRoadGraphAlternatives(
  graph: IcelandRoadGraph,
  origin: LatLon,
  destination: LatLon,
  options: FindIcelandRoadGraphRouteOptions & { maxAlternatives?: number; maxOverlap?: number },
): IcelandRoadGraphAlternative[] {
  const primary = findIcelandRoadGraphRoute(graph, origin, destination, options)
  if (primary.status !== 'ok') return []
  const primaryIds = new Set(primary.route.segmentIds)
  const candidates = new Map<string, IcelandRoadGraphAlternative>()
  const stride = Math.max(1, Math.floor(primary.route.segmentIds.length / 40))
  for (let index = 0; index < primary.route.segmentIds.length; index += stride) {
    const result = findIcelandRoadGraphRoute(graph, origin, destination, {
      ...options,
      excludedSegmentIds: new Set([primary.route.segmentIds[index]]),
    })
    if (result.status !== 'ok') continue
    const key = result.route.segmentIds.join('|')
    if (candidates.has(key)) continue
    const shared = result.route.segmentIds.filter(id => primaryIds.has(id)).length
    const overlap = shared / Math.max(primaryIds.size, result.route.segmentIds.length, 1)
    if (overlap > (options.maxOverlap ?? 0.92)) continue
    candidates.set(key, {
      route: result.route,
      originSnapDistanceM: result.originSnapDistanceM,
      destinationSnapDistanceM: result.destinationSnapDistanceM,
      overlapWithPrimary: overlap,
    })
  }
  return [...candidates.values()]
    .sort((a, b) => a.route.durationS - b.route.durationS)
    .slice(0, options.maxAlternatives ?? 2)
}
