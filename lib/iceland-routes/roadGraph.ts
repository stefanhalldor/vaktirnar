import type { LatLon } from './types'
import type {
  IcelandRoadDirectionInferenceAttestationV1,
  IcelandRoadDirectionEvidenceArtifactV1,
  IcelandRoadDirectionInferencePolicyV1,
  IcelandRoadClass,
  IcelandRoadGraph,
  IcelandRoadGraphDiagnostics,
  IcelandRoadGraphEdge,
  IcelandRoadGraphNode,
  IcelandRoadGraphPoint,
  IcelandRoadGraphRoute,
  IcelandRoadGraphRouteResult,
  IcelandRoadGraphSegmentInput,
  IcelandRoadRoutingProfile,
  IcelandRoadSurface,
  IcelandRoadSurfaceBreakdown,
} from './roadGraphTypes'
import {
  resolveIcelandRoadSegmentDirection,
  validateIcelandRoadDirectionInferenceSet,
  type IcelandRoadResolvedDirection,
} from './roadGraphDirectionInference'
import type {
  RoadTopologyEndpointSide,
  SourceAttestedJunctionGapReceipt,
} from './roadGraphTopologyReconciliation'

const EARTH_RADIUS_M = 6_371_000
const DEFAULT_NODE_SNAP_TOLERANCE_M = 15
const DEFAULT_ROUTE_POINT_SNAP_MAX_M = 25_000
const ROUTE_SNAP_CANDIDATE_SLACK_M = 250
const TOPOLOGY_CONNECTOR_ROUTING_SPEED_KMH = 50
const RECEIPT_COORDINATE_EPSILON_DEG = 1e-9
const RECEIPT_ELEVATION_EPSILON_M = 1e-6
const RECEIPT_DISTANCE_EPSILON_M = 1e-6
const EXACT_INTERIOR_VERTEX_MAX_DISTANCE_M = 0.01

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
  topologyReconciliation?: IcelandRoadGraphTopologyReconciliationOptions
  directionInference?: IcelandRoadGraphDirectionInferenceOptions
  /** Vegagerðin STEFNA is retained as source metadata but may be ignored for routing. */
  routingDirectionPolicy?: 'source' | 'bidirectional'
  /**
   * Missing/NULL official direction may be traversed provisionally both ways.
   * Source truth remains `unknown_missing`; callers must opt in explicitly.
   */
  missingDirectionPolicy?: 'exclude' | 'provisional_bidirectional'
}

export interface IcelandRoadGraphDirectionInferenceOptions {
  attestations: readonly IcelandRoadDirectionInferenceAttestationV1[]
  evidenceArtifacts: readonly IcelandRoadDirectionEvidenceArtifactV1[]
  sourceProvenanceKey: string
  evaluatedAtIso: string
  policy: IcelandRoadDirectionInferencePolicyV1
  /** Both modes fail closed; `throw` also rejects the candidate graph build. */
  invalidAttestationBehavior?: 'throw' | 'ignore'
}

/**
 * Explicit adapter from a topology-level receipt to exact graph children.
 * Surface splitting can create several graph segment ids for one official
 * section, so the builder never guesses or fuzzy-matches a receipt id.
 */
export interface IcelandRoadGraphTopologyReceiptBinding {
  receipt: SourceAttestedJunctionGapReceipt
  sourceGraph: {
    segmentId: string
    sourceId: string
    endpoint: RoadTopologyEndpointSide
  }
  targetGraph: {
    segmentId: string
    sourceId: string
    edgeIndex: number
    edgeFraction: number
  }
}

export interface IcelandRoadGraphTopologyReconciliationOptions {
  bindings: readonly IcelandRoadGraphTopologyReceiptBinding[]
  /** Both modes fail closed; `throw` also rejects the candidate graph build. */
  invalidBindingBehavior: 'throw' | 'ignore'
}

interface ValidatedTopologyBinding {
  binding: IcelandRoadGraphTopologyReceiptBinding
  sourceInput: IcelandRoadGraphSegmentInput
  targetInput: IcelandRoadGraphSegmentInput
  sourcePoint: IcelandRoadGraphPoint
  targetPoint: IcelandRoadGraphPoint
  targetDistanceFromStartM: number
}

interface TopologySplitMarker {
  key: string
  targetSegmentId: string
  point: IcelandRoadGraphPoint
  distanceFromStartM: number
  bindings: ValidatedTopologyBinding[]
  node?: IcelandRoadGraphNode
}

function graphPointAtFraction(
  a: IcelandRoadGraphPoint,
  b: IcelandRoadGraphPoint,
  fraction: number,
): IcelandRoadGraphPoint {
  const elevationM = a.elevationM !== undefined && b.elevationM !== undefined
    ? a.elevationM + (b.elevationM - a.elevationM) * fraction
    : undefined
  return {
    lat: a.lat + (b.lat - a.lat) * fraction,
    lon: a.lon + (b.lon - a.lon) * fraction,
    ...(elevationM === undefined ? {} : { elevationM }),
  }
}

function receiptPointMatchesGraphPoint(
  receiptPoint: { lat: number; lon: number; zM?: number },
  graphPoint: IcelandRoadGraphPoint,
): boolean {
  if (
    Math.abs(receiptPoint.lat - graphPoint.lat) > RECEIPT_COORDINATE_EPSILON_DEG
    || Math.abs(receiptPoint.lon - graphPoint.lon) > RECEIPT_COORDINATE_EPSILON_DEG
  ) return false
  if (receiptPoint.zM === undefined && graphPoint.elevationM === undefined) return true
  return receiptPoint.zM !== undefined
    && graphPoint.elevationM !== undefined
    && Math.abs(receiptPoint.zM - graphPoint.elevationM) <= RECEIPT_ELEVATION_EPSILON_M
}

function cumulativeGeometryDistances(geometry: readonly IcelandRoadGraphPoint[]): number[] {
  const result = [0]
  for (let index = 1; index < geometry.length; index += 1) {
    result.push(result[index - 1] + haversineDistanceM(geometry[index - 1], geometry[index]))
  }
  return result
}

function resolveGraphDirectionForBuild(
  input: IcelandRoadGraphSegmentInput,
  options: BuildIcelandRoadGraphOptions,
  acceptedBySourceId: ReadonlyMap<string, IcelandRoadDirectionInferenceAttestationV1>,
): IcelandRoadResolvedDirection {
  if (options.routingDirectionPolicy === 'bidirectional') return { direction: 'both' }
  const resolved = resolveIcelandRoadSegmentDirection(input, acceptedBySourceId)
  if (
    resolved.direction === 'unknown'
    && resolved.status === 'unknown_missing'
    && options.missingDirectionPolicy === 'provisional_bidirectional'
  ) {
    return {
      direction: 'both',
      basis: 'provisional',
      status: 'unknown_missing',
    }
  }
  return resolved
}

function canArriveAtTopologyEndpoint(
  direction: IcelandRoadGraphSegmentInput['direction'],
  endpoint: RoadTopologyEndpointSide,
): boolean {
  return direction === 'both'
    || (direction === 'forward' && endpoint === 'end')
    || (direction === 'reverse' && endpoint === 'start')
}

function canDepartFromTopologyEndpoint(
  direction: IcelandRoadGraphSegmentInput['direction'],
  endpoint: RoadTopologyEndpointSide,
): boolean {
  return direction === 'both'
    || (direction === 'forward' && endpoint === 'start')
    || (direction === 'reverse' && endpoint === 'end')
}

function expectedTopologyTraversal(
  receipt: SourceAttestedJunctionGapReceipt,
  sourceInput: IcelandRoadGraphSegmentInput,
  targetInput: IcelandRoadGraphSegmentInput,
  options: BuildIcelandRoadGraphOptions,
  acceptedBySourceId: ReadonlyMap<string, IcelandRoadDirectionInferenceAttestationV1>,
): readonly ('source_to_target' | 'target_to_source')[] {
  const sourceDirection = resolveGraphDirectionForBuild(
    sourceInput,
    options,
    acceptedBySourceId,
  ).direction
  const result: ('source_to_target' | 'target_to_source')[] = []
  if (receipt.targetAttestation.kind === 'source_exact_interior_vertex') {
    if (canArriveAtTopologyEndpoint(sourceDirection, receipt.sourceEndpoint)) {
      result.push('source_to_target')
    }
    if (canDepartFromTopologyEndpoint(sourceDirection, receipt.sourceEndpoint)) {
      result.push('target_to_source')
    }
    return result
  }
  const targetDirection = resolveGraphDirectionForBuild(
    targetInput,
    options,
    acceptedBySourceId,
  ).direction
  const targetEndpoint = receipt.targetAttestation.endpoint
  if (
    canArriveAtTopologyEndpoint(sourceDirection, receipt.sourceEndpoint)
    && canDepartFromTopologyEndpoint(targetDirection, targetEndpoint)
  ) result.push('source_to_target')
  if (
    canArriveAtTopologyEndpoint(targetDirection, targetEndpoint)
    && canDepartFromTopologyEndpoint(sourceDirection, receipt.sourceEndpoint)
  ) result.push('target_to_source')
  return result
}

function validateTopologyBindings(
  inputs: readonly IcelandRoadGraphSegmentInput[],
  buildOptions: BuildIcelandRoadGraphOptions,
  acceptedBySourceId: ReadonlyMap<string, IcelandRoadDirectionInferenceAttestationV1>,
): ValidatedTopologyBinding[] {
  const options = buildOptions.topologyReconciliation
  if (!options) return []
  const inputsById = new Map<string, IcelandRoadGraphSegmentInput[]>()
  for (const input of inputs) {
    const existing = inputsById.get(input.id) ?? []
    existing.push(input)
    inputsById.set(input.id, existing)
  }
  const result: ValidatedTopologyBinding[] = []
  const acceptedReceiptIds = new Set<string>()

  function invalid(code: string): false {
    if (options?.invalidBindingBehavior === 'throw') {
      throw new Error(`invalid_road_graph_topology_binding:${code}`)
    }
    return false
  }

  for (const binding of [...options.bindings].sort((a, b) => a.receipt.id.localeCompare(b.receipt.id))) {
    const { receipt } = binding
    if (acceptedReceiptIds.has(receipt.id)) {
      invalid('duplicate_receipt')
      continue
    }
    const sourceMatches = inputsById.get(binding.sourceGraph.segmentId) ?? []
    const targetMatches = inputsById.get(binding.targetGraph.segmentId) ?? []
    if (sourceMatches.length !== 1) {
      invalid(sourceMatches.length === 0 ? 'source_segment_missing' : 'source_segment_ambiguous')
      continue
    }
    if (targetMatches.length !== 1) {
      invalid(targetMatches.length === 0 ? 'target_segment_missing' : 'target_segment_ambiguous')
      continue
    }
    const sourceInput = sourceMatches[0]
    const targetInput = targetMatches[0]
    if (
      sourceInput.sourceId !== binding.sourceGraph.sourceId
      || targetInput.sourceId !== binding.targetGraph.sourceId
      || receipt.sourceFeatureId !== binding.sourceGraph.sourceId
      || receipt.targetFeatureId !== binding.targetGraph.sourceId
      || receipt.sourceEndpoint !== binding.sourceGraph.endpoint
    ) {
      invalid('source_identity_mismatch')
      continue
    }
    // Access-only source geometry stays outside the internal routing graph. A
    // topology receipt may repair only the assessed public network itself.
    if (
      sourceInput.networkRole !== 'assessment_public'
      || targetInput.networkRole !== 'assessment_public'
    ) {
      invalid('non_public_source_role')
      continue
    }
    if (
      receipt.kind !== 'source_attested_junction_gap'
      || receipt.connector.kind !== 'source_attested_junction_gap'
      || receipt.connector.networkRole !== 'access_connector'
      || receipt.connector.assessmentEligible !== false
      || receipt.connector.truthClaims.road !== false
      || receipt.connector.truthClaims.surface !== false
      || receipt.connector.truthClaims.weather !== false
      || receipt.connector.truthClaims.safety !== false
      || receipt.targetSplit.segmentId !== receipt.targetSegmentId
    ) {
      invalid('receipt_truth_contract')
      continue
    }
    const targetAttestation = receipt.targetAttestation
    if (
      !targetAttestation
      || (targetAttestation.kind === 'reciprocal_endpoint'
        && targetAttestation.endpoint !== 'start'
        && targetAttestation.endpoint !== 'end')
      || (targetAttestation.kind === 'source_exact_interior_vertex'
        && (!Number.isInteger(targetAttestation.vertexIndex) || targetAttestation.vertexIndex <= 0))
      || (targetAttestation.kind !== 'reciprocal_endpoint'
        && targetAttestation.kind !== 'source_exact_interior_vertex')
    ) {
      invalid('target_attestation')
      continue
    }
    const traversal = receipt.connector.allowedTraversal
    const expectedTraversal = expectedTopologyTraversal(
      receipt,
      sourceInput,
      targetInput,
      buildOptions,
      acceptedBySourceId,
    )
    if (
      traversal.length === 0
      || traversal.some(value => value !== 'source_to_target' && value !== 'target_to_source')
      || new Set(traversal).size !== traversal.length
      || traversal.length !== expectedTraversal.length
      || traversal.some(value => !expectedTraversal.includes(value))
    ) {
      invalid('direction_attestation')
      continue
    }
    if (sourceInput.geometry.length < 2 || targetInput.geometry.length < 2) {
      invalid('malformed_geometry')
      continue
    }
    const sourcePoint = binding.sourceGraph.endpoint === 'start'
      ? sourceInput.geometry[0]
      : sourceInput.geometry[sourceInput.geometry.length - 1]
    const edgeIndex = binding.targetGraph.edgeIndex
    const edgeFraction = binding.targetGraph.edgeFraction
    if (
      !Number.isInteger(edgeIndex)
      || edgeIndex < 0
      || edgeIndex + 1 >= targetInput.geometry.length
      || !Number.isFinite(edgeFraction)
      || edgeFraction < 0
      || edgeFraction > 1
    ) {
      invalid('target_projection_range')
      continue
    }
    const targetPoint = graphPointAtFraction(
      targetInput.geometry[edgeIndex],
      targetInput.geometry[edgeIndex + 1],
      edgeFraction,
    )
    const connectorStart = receipt.connector.geometry[0]
    const connectorEnd = receipt.connector.geometry[1]
    if (
      !receiptPointMatchesGraphPoint(connectorStart, sourcePoint)
      || !receiptPointMatchesGraphPoint(connectorEnd, targetPoint)
      || !receiptPointMatchesGraphPoint(receipt.targetSplit.point, targetPoint)
    ) {
      invalid('projection_geometry_mismatch')
      continue
    }
    if (targetAttestation.kind === 'source_exact_interior_vertex') {
      const connectorGeometryLengthM = geometryLengthM([connectorStart, connectorEnd])
      if (
        receipt.targetSplit.location !== 'vertex'
        || receipt.targetSplit.edgeIndex + 1 !== targetAttestation.vertexIndex
        || Math.abs(1 - receipt.targetSplit.edgeFraction) > RECEIPT_DISTANCE_EPSILON_M
        || Math.abs(1 - edgeFraction) > RECEIPT_DISTANCE_EPSILON_M
        || connectorGeometryLengthM > EXACT_INTERIOR_VERTEX_MAX_DISTANCE_M
        || Math.abs(receipt.connector.lengthM - connectorGeometryLengthM)
          > RECEIPT_DISTANCE_EPSILON_M
      ) {
        invalid('exact_vertex_attestation')
        continue
      }
    }
    const cumulative = cumulativeGeometryDistances(targetInput.geometry)
    const edgeLengthM = cumulative[edgeIndex + 1] - cumulative[edgeIndex]
    const distanceFromStartM = cumulative[edgeIndex] + edgeLengthM * edgeFraction
    const totalLengthM = cumulative[cumulative.length - 1]
    if (totalLengthM <= RECEIPT_DISTANCE_EPSILON_M) {
      invalid('malformed_geometry')
      continue
    }
    result.push({
      binding,
      sourceInput,
      targetInput,
      sourcePoint,
      targetPoint,
      targetDistanceFromStartM: distanceFromStartM,
    })
    acceptedReceiptIds.add(receipt.id)
  }
  return result
}

export function buildIcelandRoadGraph(
  inputs: readonly IcelandRoadGraphSegmentInput[],
  options: BuildIcelandRoadGraphOptions = {},
): IcelandRoadGraph {
  const toleranceM = options.nodeSnapToleranceM ?? DEFAULT_NODE_SNAP_TOLERANCE_M
  const directionValidation = options.directionInference
    ? validateIcelandRoadDirectionInferenceSet(
        inputs,
        options.directionInference.attestations,
        {
          sourceProvenanceKey: options.directionInference.sourceProvenanceKey,
          evaluatedAtIso: options.directionInference.evaluatedAtIso,
          policy: options.directionInference.policy,
          evidenceArtifacts: options.directionInference.evidenceArtifacts,
        },
      )
    : { acceptedBySourceId: new Map(), failures: [] }
  if (
    directionValidation.failures.length > 0
    && options.directionInference?.invalidAttestationBehavior !== 'ignore'
  ) {
    const failure = directionValidation.failures[0]
    throw new Error(`invalid_road_graph_direction_attestation:${failure.reason}`)
  }
  const topologyBindings = validateTopologyBindings(
    inputs,
    options,
    directionValidation.acceptedBySourceId,
  )
  const nodes = new Map<string, IcelandRoadGraphNode>()
  const nodeIdsByBucket = new Map<string, string[]>()
  const edges: IcelandRoadGraphEdge[] = []
  let nextNodeId = 1

  const splitMarkersByTargetId = new Map<string, TopologySplitMarker[]>()
  const splitMarkerByReceiptId = new Map<string, TopologySplitMarker>()
  for (const validated of topologyBindings) {
    const receiptId = validated.binding.receipt.id
    const targetId = validated.targetInput.id
    const existing = splitMarkersByTargetId.get(targetId) ?? []
    const shared = existing.find(marker => (
      Math.abs(marker.distanceFromStartM - validated.targetDistanceFromStartM) <= 1e-6
      && Math.abs(marker.point.lat - validated.targetPoint.lat) <= RECEIPT_COORDINATE_EPSILON_DEG
      && Math.abs(marker.point.lon - validated.targetPoint.lon) <= RECEIPT_COORDINATE_EPSILON_DEG
    ))
    if (shared) {
      shared.bindings.push(validated)
      splitMarkerByReceiptId.set(receiptId, shared)
      continue
    }
    const marker: TopologySplitMarker = {
      key: `topology-split:${encodeURIComponent(targetId)}:${encodeURIComponent(receiptId)}`,
      targetSegmentId: targetId,
      point: validated.targetPoint,
      distanceFromStartM: validated.targetDistanceFromStartM,
      bindings: [validated],
    }
    existing.push(marker)
    existing.sort((a, b) => a.distanceFromStartM - b.distanceFromStartM || a.key.localeCompare(b.key))
    splitMarkersByTargetId.set(targetId, existing)
    splitMarkerByReceiptId.set(receiptId, marker)
  }

  function createNode(point: LatLon, registerForOrdinarySnap: boolean): IcelandRoadGraphNode {
    const node = { id: `node-${nextNodeId++}`, point }
    nodes.set(node.id, node)
    if (registerForOrdinarySnap) {
      const bucket = nodeBucket(point, toleranceM)
      const bucketKey = `${bucket.x}:${bucket.y}`
      nodeIdsByBucket.set(bucketKey, [...(nodeIdsByBucket.get(bucketKey) ?? []), node.id])
    }
    return node
  }

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

    return createNode(point, true)
  }

  function resolveSplitNode(marker: TopologySplitMarker): IcelandRoadGraphNode {
    if (!marker.node) marker.node = createNode(marker.point, false)
    return marker.node
  }

  function addSourceEdge(
    input: IcelandRoadGraphSegmentInput,
    resolvedDirection: IcelandRoadResolvedDirection,
    fromNode: IcelandRoadGraphNode,
    toNode: IcelandRoadGraphNode,
    geometry: readonly LatLon[],
    suffix: string,
    explicitLengthM?: number,
  ): void {
    const geometryLength = geometryLengthM(geometry)
    const lengthM = explicitLengthM ?? (
      input.lengthM && input.lengthM > 0 ? input.lengthM : geometryLength
    )
    const speedKmh = input.speedKmh && input.speedKmh > 0
      ? input.speedKmh
      : derivedRoadSpeedKmh(input.roadClass, input.surface, input.isFRoad)
    const directionEvidenceArtifact = resolvedDirection.attestation
      ? options.directionInference?.evidenceArtifacts.find(
          artifact => artifact.artifactId === resolvedDirection.attestation!.evidenceArtifactId,
        )
      : undefined
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
      graphRole: 'source_segment',
      sourceNetworkRole: input.networkRole,
      networkRole: input.networkRole,
      official: input.official,
      ...(resolvedDirection.basis ? { directionBasis: resolvedDirection.basis } : {}),
      ...(resolvedDirection.status ? { directionStatus: resolvedDirection.status } : {}),
      ...(resolvedDirection.attestation
        ? { directionInference: resolvedDirection.attestation }
        : {}),
      ...(resolvedDirection.attestation && options.directionInference
        ? { directionInferencePolicy: options.directionInference.policy }
        : {}),
      ...(directionEvidenceArtifact ? { directionEvidenceArtifact } : {}),
      assessmentEligible: input.networkRole !== 'access_connector',
    })
  }

  function sameGraphPoint(a: LatLon, b: LatLon): boolean {
    return Math.abs(a.lat - b.lat) <= RECEIPT_COORDINATE_EPSILON_DEG
      && Math.abs(a.lon - b.lon) <= RECEIPT_COORDINATE_EPSILON_DEG
  }

  function geometryBetween(
    geometry: readonly IcelandRoadGraphPoint[],
    cumulative: readonly number[],
    startDistanceM: number,
    endDistanceM: number,
    startPoint: IcelandRoadGraphPoint,
    endPoint: IcelandRoadGraphPoint,
  ): IcelandRoadGraphPoint[] {
    const result: IcelandRoadGraphPoint[] = [startPoint]
    for (let index = 1; index + 1 < geometry.length; index += 1) {
      if (cumulative[index] > startDistanceM + 1e-6 && cumulative[index] < endDistanceM - 1e-6) {
        result.push(geometry[index])
      }
    }
    if (!sameGraphPoint(result[result.length - 1], endPoint)) result.push(endPoint)
    return result
  }

  const endpointNodes = new Map<string, IcelandRoadGraphNode>()

  for (const input of inputs) {
    if (input.geometry.length < 2) continue
    const first = input.geometry[0]
    const last = input.geometry[input.geometry.length - 1]
    if (!Number.isFinite(first.lat) || !Number.isFinite(first.lon) ||
        !Number.isFinite(last.lat) || !Number.isFinite(last.lon)) continue

    const firstNode = resolveNode(first)
    const lastNode = resolveNode(last)
    endpointNodes.set(`${input.id}:start`, firstNode)
    endpointNodes.set(`${input.id}:end`, lastNode)
    if (firstNode.id === lastNode.id) continue
    const resolvedDirection = resolveGraphDirectionForBuild(
      input,
      options,
      directionValidation.acceptedBySourceId,
    )

    const markers = splitMarkersByTargetId.get(input.id) ?? []
    if (markers.length === 0) {
      if (resolvedDirection.direction === 'forward' || resolvedDirection.direction === 'both') {
        addSourceEdge(input, resolvedDirection, firstNode, lastNode, input.geometry, 'forward')
      }
      if (resolvedDirection.direction === 'reverse' || resolvedDirection.direction === 'both') {
        addSourceEdge(input, resolvedDirection, lastNode, firstNode, reverseGeometry(input.geometry), 'reverse')
      }
      continue
    }

    const cumulative = cumulativeGeometryDistances(input.geometry)
    const totalGeometryLengthM = cumulative[cumulative.length - 1]
    if (totalGeometryLengthM <= 0) continue
    const boundaries = [
      { distanceM: 0, point: first, node: firstNode },
      ...markers.map(marker => {
        const node = marker.distanceFromStartM <= RECEIPT_DISTANCE_EPSILON_M
          ? firstNode
          : totalGeometryLengthM - marker.distanceFromStartM <= RECEIPT_DISTANCE_EPSILON_M
            ? lastNode
            : resolveSplitNode(marker)
        marker.node = node
        return {
          distanceM: marker.distanceFromStartM,
          point: marker.point,
          node,
        }
      }),
      { distanceM: totalGeometryLengthM, point: last, node: lastNode },
    ]
    for (let index = 0; index + 1 < boundaries.length; index += 1) {
      const from = boundaries[index]
      const to = boundaries[index + 1]
      if (to.distanceM - from.distanceM <= 1e-6 || from.node.id === to.node.id) continue
      const geometry = geometryBetween(
        input.geometry,
        cumulative,
        from.distanceM,
        to.distanceM,
        from.point,
        to.point,
      )
      if (geometry.length < 2) continue
      const sourceLengthM = input.lengthM && input.lengthM > 0
        ? input.lengthM
        : totalGeometryLengthM
      const fragmentLengthM = sourceLengthM * (to.distanceM - from.distanceM) / totalGeometryLengthM
      const part = `part-${index + 1}`
      if (resolvedDirection.direction === 'forward' || resolvedDirection.direction === 'both') {
        addSourceEdge(input, resolvedDirection, from.node, to.node, geometry, `${part}:forward`, fragmentLengthM)
      }
      if (resolvedDirection.direction === 'reverse' || resolvedDirection.direction === 'both') {
        addSourceEdge(input, resolvedDirection, to.node, from.node, reverseGeometry(geometry), `${part}:reverse`, fragmentLengthM)
      }
    }
  }

  function addTopologyConnectorEdge(
    validated: ValidatedTopologyBinding,
    fromNode: IcelandRoadGraphNode,
    toNode: IcelandRoadGraphNode,
    geometry: readonly LatLon[],
    suffix: string,
  ): void {
    const receipt = validated.binding.receipt
    const lengthM = geometryLengthM(geometry)
    const topologyProvenanceKey = [
      receipt.policyId,
      receipt.provenance.artifactId,
      receipt.provenance.contentSha256,
      receipt.provenance.validationReportId,
    ].join(':')
    edges.push({
      id: `${receipt.connector.id}:${encodeURIComponent(topologyProvenanceKey)}:${suffix}`,
      segmentId: receipt.connector.id,
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      geometry,
      lengthM,
      travelTimeS: (lengthM / 1_000 / TOPOLOGY_CONNECTOR_ROUTING_SPEED_KMH) * 3_600,
      speedKmh: TOPOLOGY_CONNECTOR_ROUTING_SPEED_KMH,
      speedSource: 'derived',
      roadClass: 'other',
      surface: 'unknown',
      isFRoad: false,
      isMountainRoad: false,
      isSeasonal: false,
      graphRole: 'topology_connector',
      assessmentEligible: false,
      topologyReceiptId: receipt.id,
      topologyDirectionAttested: true,
      topologyProvenanceKey,
    })
  }

  for (const validated of topologyBindings) {
    const { binding } = validated
    const sourceNode = endpointNodes.get(`${binding.sourceGraph.segmentId}:${binding.sourceGraph.endpoint}`)
    const targetNode = splitMarkerByReceiptId.get(binding.receipt.id)?.node
    if (!sourceNode || !targetNode) {
      if (options.topologyReconciliation?.invalidBindingBehavior === 'throw') {
        throw new Error('invalid_road_graph_topology_binding:unresolved_graph_node')
      }
      continue
    }
    const forwardGeometry: readonly LatLon[] = [validated.sourcePoint, validated.targetPoint]
    if (binding.receipt.connector.allowedTraversal.includes('source_to_target')) {
      addTopologyConnectorEdge(validated, sourceNode, targetNode, forwardGeometry, 'source-to-target')
    }
    if (binding.receipt.connector.allowedTraversal.includes('target_to_source')) {
      addTopologyConnectorEdge(validated, targetNode, sourceNode, reverseGeometry(forwardGeometry), 'target-to-source')
    }
  }

  const outgoingMutable = new Map<string, IcelandRoadGraphEdge[]>()
  for (const edge of edges) {
    const existing = outgoingMutable.get(edge.fromNodeId) ?? []
    existing.push(edge)
    outgoingMutable.set(edge.fromNodeId, existing)
  }

  return {
    nodes,
    edges,
    outgoing: outgoingMutable,
    ...(options.topologyReconciliation
      ? { topologyReceiptIds: topologyBindings.map(binding => binding.binding.receipt.id) }
      : {}),
    ...(options.directionInference
      ? {
          directionAttestationIds: [...directionValidation.acceptedBySourceId.values()]
            .map(attestation => attestation.attestationId)
            .sort(),
        }
      : {}),
  }
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
  let topologyConnectorEdgeCount = 0
  for (const edge of graph.edges) {
    if (edge.graphRole === 'topology_connector') {
      topologyConnectorEdgeCount += 1
      continue
    }
    surfaceEdgeCounts[edge.surface] += 1
    if (edge.speedSource === 'derived') derivedSpeedEdgeCount += 1
  }

  return {
    nodeCount: graph.nodes.size,
    edgeCount: graph.edges.length,
    segmentCount: new Set(graph.edges
      .filter(edge => edge.graphRole !== 'topology_connector')
      .map(edge => edge.segmentId)).size,
    weakComponentCount,
    largestWeakComponentNodeCount,
    isolatedNodeCount: [...neighbours.values()].filter(set => set.size === 0).length,
    surfaceEdgeCounts,
    derivedSpeedEdgeCount,
    topologyConnectorEdgeCount,
  }
}

export function isIcelandRoadGraphEdgeAllowed(
  edge: IcelandRoadGraphEdge,
  profile: IcelandRoadRoutingProfile,
  excludedSegmentIds?: ReadonlySet<string>,
): boolean {
  if (excludedSegmentIds?.has(edge.segmentId)) return false
  if (edge.graphRole === 'topology_connector') {
    return edge.assessmentEligible === false
      && edge.topologyDirectionAttested === true
      && typeof edge.topologyReceiptId === 'string'
      && edge.topologyReceiptId.length > 0
  }
  // Access-only geometry may establish an endpoint access relationship, but
  // it must never become an internal shortcut or assessment-road evidence.
  if ((edge.sourceNetworkRole ?? edge.networkRole) === 'access_connector') return false
  if (profile.requirePaved && edge.surface !== 'paved') return false
  if (profile.avoidFRoads && edge.isFRoad) return false
  if (profile.avoidMountainRoads && edge.isMountainRoad) return false
  if (edge.isSeasonal) return false
  return true
}

/**
 * Stronger than traversal eligibility: graph-only gaps and access geometry can
 * participate in bounded connectivity, but can never identify an assessment
 * endpoint or supply public-road truth.
 */
export function isIcelandRoadGraphEdgeAssessmentEligible(
  edge: IcelandRoadGraphEdge,
): boolean {
  return edge.graphRole !== 'topology_connector'
    && edge.assessmentEligible !== false
    && (edge.sourceNetworkRole ?? edge.networkRole) !== 'access_connector'
}

export function icelandRoadGraphEdgeCost(
  edge: IcelandRoadGraphEdge,
  profile: IcelandRoadRoutingProfile,
  fraction = 1,
): number {
  let cost = profile.objective === 'fastest' ? edge.travelTimeS : edge.lengthM
  if (edge.surface === 'gravel') cost *= profile.gravelPenaltyFactor ?? 1
  if (edge.isMountainRoad) cost *= profile.mountainPenaltyFactor ?? 1
  return cost * Math.max(0, Math.min(1, fraction))
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

/** Builds the canonical route aggregate from an already direction-ordered edge path. */
export function buildIcelandRoadGraphRouteFromEdges(
  edges: readonly IcelandRoadGraphEdge[],
): IcelandRoadGraphRoute {
  const geometry: LatLon[] = []
  const nodeIds: string[] = []
  const surface = emptySurfaceBreakdown()
  let distanceM = 0
  let durationS = 0
  let derivedSpeedDistanceM = 0
  let fRoadDistanceM = 0
  let unassessedConnectorDistanceM = 0
  let authoritativeDirectionDistanceM = 0
  let inferredDirectionDistanceM = 0
  let legacyDirectionDistanceM = 0
  const fRoadNumbers = new Set<string>()
  const sourceEdgeIds: string[] = []
  const sourceSegmentIds: string[] = []
  const topologyConnectorIds: string[] = []
  const directionAttestationIds: string[] = []
  const gravelPortions: IcelandRoadGraphRoute['gravelPortions'][number][] = []
  const inferredDirectionPortions: IcelandRoadGraphRoute['inferredDirectionPortions'][number][] = []

  for (const edge of edges) {
    const startDistanceM = distanceM
    if (nodeIds.length === 0) nodeIds.push(edge.fromNodeId)
    nodeIds.push(edge.toNodeId)
    appendGeometry(geometry, edge.geometry)
    distanceM += edge.lengthM
    const endDistanceM = distanceM
    durationS += edge.travelTimeS
    if (!isIcelandRoadGraphEdgeAssessmentEligible(edge)) {
      unassessedConnectorDistanceM += edge.lengthM
      if (
        edge.graphRole === 'topology_connector'
        && edge.topologyReceiptId
        && !topologyConnectorIds.includes(edge.topologyReceiptId)
      ) {
        topologyConnectorIds.push(edge.topologyReceiptId)
      }
      continue
    }
    sourceEdgeIds.push(edge.id)
    if (sourceSegmentIds[sourceSegmentIds.length - 1] !== edge.segmentId) {
      sourceSegmentIds.push(edge.segmentId)
    }
    if (edge.directionBasis === 'authoritative') {
      authoritativeDirectionDistanceM += edge.lengthM
    } else if (edge.directionBasis === 'inferred' && edge.directionInference) {
      inferredDirectionDistanceM += edge.lengthM
      if (!directionAttestationIds.includes(edge.directionInference.attestationId)) {
        directionAttestationIds.push(edge.directionInference.attestationId)
      }
      inferredDirectionPortions.push({
        edgeId: edge.id,
        segmentId: edge.segmentId,
        attestationId: edge.directionInference.attestationId,
        startDistanceM,
        endDistanceM,
        distanceM: edge.lengthM,
        geometry: edge.geometry,
        ...(edge.roadNumber ? { roadNumber: edge.roadNumber } : {}),
        ...(edge.roadName ? { roadName: edge.roadName } : {}),
      })
    } else {
      legacyDirectionDistanceM += edge.lengthM
    }
    if (edge.speedSource === 'derived') derivedSpeedDistanceM += edge.lengthM
    if (edge.isFRoad) {
      fRoadDistanceM += edge.lengthM
      if (edge.roadNumber) fRoadNumbers.add(edge.roadNumber)
    }
    if (edge.surface === 'paved') surface.pavedM += edge.lengthM
    else if (edge.surface === 'gravel') {
      surface.gravelM += edge.lengthM
      gravelPortions.push({
        edgeId: edge.id,
        segmentId: edge.segmentId,
        surface: 'gravel',
        startDistanceM,
        endDistanceM,
        distanceM: edge.lengthM,
        geometry: edge.geometry,
        ...(edge.roadNumber ? { roadNumber: edge.roadNumber } : {}),
        ...(edge.roadName ? { roadName: edge.roadName } : {}),
      })
    }
    else if (edge.surface === 'mixed') surface.mixedM += edge.lengthM
    else surface.unknownM += edge.lengthM
  }

  return {
    nodeIds,
    edgeIds: sourceEdgeIds,
    segmentIds: sourceSegmentIds,
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
    fRoadDistanceM: Math.round(fRoadDistanceM),
    fRoadNumbers: [...fRoadNumbers].sort(),
    topologyConnectorIds,
    // Allocate integer rounding to the assessed remainder so the two public
    // integer buckets always reconcile exactly with the rounded route total.
    assessedDistanceM: Math.round(distanceM) - Math.round(unassessedConnectorDistanceM),
    unassessedConnectorDistanceM: Math.round(unassessedConnectorDistanceM),
    authoritativeDirectionDistanceM: Math.round(authoritativeDirectionDistanceM),
    inferredDirectionDistanceM: Math.round(inferredDirectionDistanceM),
    legacyDirectionDistanceM: Math.round(legacyDirectionDistanceM),
    directionAttestationIds,
    gravelPortions,
    inferredDirectionPortions,
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
  const nearestOriginByComponent = nearestMatchPerComponent(originMatches, componentIds)
  const nearestDestinationByComponent = nearestMatchPerComponent(destinationMatches, componentIds)
  const sharedComponentIds = new Set([...nearestOriginByComponent.keys()]
    .filter(componentId => nearestDestinationByComponent.has(componentId)))
  if (sharedComponentIds.size === 0) return { status: 'no_route' }

  // Keep every bounded snap candidate in a shared component. Topology repair
  // can legitimately merge components whose individually-nearest endpoints
  // form a very long route; reducing each component to one endpoint before
  // routing can then hide a much shorter route through slightly farther snap
  // candidates. The multi-source/multi-destination search below already
  // accounts for snap cost and selects the best complete route.
  const compatibleOriginMatches = originMatches.filter(match => {
    const componentId = componentIds.get(match.node.id)
    const nearest = componentId === undefined ? undefined : nearestOriginByComponent.get(componentId)
    return componentId !== undefined
      && sharedComponentIds.has(componentId)
      && nearest !== undefined
      && match.distanceM <= nearest.distanceM + ROUTE_SNAP_CANDIDATE_SLACK_M
  })
  const compatibleDestinationMatches = destinationMatches.filter(match => {
    const componentId = componentIds.get(match.node.id)
    const nearest = componentId === undefined ? undefined : nearestDestinationByComponent.get(componentId)
    return componentId !== undefined
      && sharedComponentIds.has(componentId)
      && nearest !== undefined
      && match.distanceM <= nearest.distanceM + ROUTE_SNAP_CANDIDATE_SLACK_M
  })

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
      if (
        visited.has(edge.toNodeId)
        || !isIcelandRoadGraphEdgeAllowed(edge, options.profile, options.excludedSegmentIds)
      ) continue
      const candidate = currentDistance + icelandRoadGraphEdgeCost(edge, options.profile)
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
    route: buildIcelandRoadGraphRouteFromEdges(routeEdges),
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
