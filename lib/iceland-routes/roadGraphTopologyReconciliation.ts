/**
 * Provider-neutral, fail-closed reconciliation for small source-attested gaps
 * in an official road artifact.
 *
 * A human endpoint label is never evidence on its own. The only accepted
 * reference is a strict `(roadNumber-sectionNumber)` token, corroborated by a
 * unique eligible target and bounded geometry. Non-zero gaps additionally
 * require a reciprocal target-endpoint reference. A policy may also accept a
 * one-sided source reference when the source endpoint is the unique, exact
 * interior vertex of the named target section. Accepted links remain
 * unassessed topology evidence: they can make topology reachable, but cannot
 * create road, surface, weather or safety truth.
 */

export type RoadTopologyEndpointSide = 'start' | 'end'
export type RoadTopologyNetworkRole = 'assessment' | 'access_connector'
export type RoadTopologyDirection = 'both' | 'forward' | 'reverse'
export type RoadTopologyLifecycle = 'active' | 'inactive' | 'unknown'

export interface RoadTopologyPoint {
  lat: number
  lon: number
  /** Optional official elevation/grade coordinate. */
  zM?: number
}

export interface OfficialRoadSectionIdentity {
  authority: string
  datasetId: string
  roadNumber: string
  sectionNumber: string
}

export interface ParsedOfficialEndpointSectionReference {
  roadNumber: string
  sectionNumber: string
}

export type OfficialEndpointSectionReferenceParseResult =
  | { status: 'ok'; reference: ParsedOfficialEndpointSectionReference }
  | { status: 'absent' | 'ambiguous' }

export interface RoadTopologySourceSegment {
  id: string
  sourceFeatureId: string
  officialSection: OfficialRoadSectionIdentity
  geometry: readonly RoadTopologyPoint[]
  endpointLabels?: Partial<Record<RoadTopologyEndpointSide, string | null>>
  networkRole: RoadTopologyNetworkRole
  roadPart: string
  direction: RoadTopologyDirection
  lifecycle: RoadTopologyLifecycle
  eligibleRoutingProfiles: readonly string[]
}

export interface RoadTopologyArtifactEvidence {
  artifactId: string
  contentSha256: string
  validationReportId: string
  /** Explains why the numeric bounds below are supported by this artifact. */
  numericCeilingRationale: string
}

export interface RoadTopologyReconciliationPolicy {
  policyId: string
  requiredRoutingProfile: string
  eligibleTargetDatasetIds: readonly string[]
  eligibleTargetRoles: readonly RoadTopologyNetworkRole[]
  eligibleTargetRoadParts: readonly string[]
  compatibleNetworkRolePairs: readonly (readonly [RoadTopologyNetworkRole, RoadTopologyNetworkRole])[]
  compatibleRoadPartPairs: readonly (readonly [string, string])[]
  maximumGapDistanceM: number
  projectionTieToleranceM: number
  endpointClearanceM: number
  maximumElevationDifferenceM: number
  minimumCrossingAngleDeg: number
  minimumGapForHeadingCheckM: number
  maximumGapApproachDifferenceDeg: number
  /** Enables strict one-sided T-junctions only at an exact target vertex. */
  allowSourceAttestedExactInteriorVertex: boolean
  /** Maximum horizontal distance for the exact-vertex rule. */
  exactVertexToleranceM: number
  artifact: RoadTopologyArtifactEvidence
}

export type RoadTopologyReconciliationRejectionReason =
  | 'invalid_source_section'
  | 'invalid_source_reference'
  | 'self_reference'
  | 'source_inactive'
  | 'source_profile_ineligible'
  | 'target_missing'
  | 'target_ineligible'
  | 'target_ambiguous'
  | 'nonreciprocal_reference'
  | 'reciprocal_reference_ambiguous'
  | 'incompatible_network_role'
  | 'incompatible_road_part'
  | 'incompatible_direction'
  | 'malformed_geometry'
  | 'projection_ambiguous'
  | 'gap_too_far'
  | 'gap_approach_misaligned'
  | 'elevation_contradiction'
  | 'grade_ambiguous'
  | 'third_party_crossing_ambiguous'

export interface RoadTopologyReconciliationCandidate {
  candidateId: string
  sourceSegmentId: string
  sourceEndpoint: RoadTopologyEndpointSide
  referencedSection?: ParsedOfficialEndpointSectionReference
  status: 'accepted' | 'rejected'
  receiptId?: string
  rejectionReason?: RoadTopologyReconciliationRejectionReason
}

export interface RoadTopologyTargetSplit {
  segmentId: string
  edgeIndex: number
  edgeFraction: number
  geometryFraction: number
  distanceFromStartM: number
  distanceToEndM: number
  point: RoadTopologyPoint
  location: 'start' | 'end' | 'vertex' | 'interior'
  /** Exact graph-ready pieces; a boundary projection can leave one singleton. */
  geometryBefore: readonly RoadTopologyPoint[]
  geometryAfter: readonly RoadTopologyPoint[]
}

export type RoadTopologyGapTraversal = 'source_to_target' | 'target_to_source'

export interface SourceAttestedJunctionGapConnector {
  id: string
  kind: 'source_attested_junction_gap'
  networkRole: 'access_connector'
  assessmentEligible: false
  geometry: readonly [RoadTopologyPoint, RoadTopologyPoint]
  lengthM: number
  allowedTraversal: readonly RoadTopologyGapTraversal[]
  truthClaims: {
    road: false
    surface: false
    weather: false
    safety: false
  }
}

export interface SourceAttestedJunctionGapReceipt {
  id: string
  kind: 'source_attested_junction_gap'
  policyId: string
  sourceSegmentId: string
  sourceFeatureId: string
  sourceEndpoint: RoadTopologyEndpointSide
  sourceSection: OfficialRoadSectionIdentity
  targetSegmentId: string
  targetFeatureId: string
  targetAttestation:
    | { kind: 'reciprocal_endpoint'; endpoint: RoadTopologyEndpointSide }
    | { kind: 'source_exact_interior_vertex'; vertexIndex: number }
  targetSection: OfficialRoadSectionIdentity
  targetSplit: RoadTopologyTargetSplit
  connector: SourceAttestedJunctionGapConnector
  provenance: RoadTopologyArtifactEvidence
}

export interface RoadTopologyReconciliationResult {
  candidates: readonly RoadTopologyReconciliationCandidate[]
  receipts: readonly SourceAttestedJunctionGapReceipt[]
}

interface Projection {
  point: RoadTopologyPoint
  distanceM: number
  edgeIndex: number
  edgeFraction: number
  distanceFromStartM: number
  totalLengthM: number
}

const EARTH_RADIUS_M = 6_371_000
const FLOAT_EPSILON = 1e-10
const MAX_EXACT_VERTEX_TOLERANCE_M = 0.01
const STRICT_SECTION_REFERENCE = /\(([A-Za-z0-9]+)-([A-Za-z0-9]+)\)/g

function canonicalToken(value: string): string | null {
  const trimmed = value.trim()
  return /^[A-Za-z0-9]+$/.test(trimmed) ? trimmed.toUpperCase() : null
}

/**
 * Parses only the documented machine token embedded in an endpoint label.
 * Place names, arbitrary labels and labels with multiple tokens fail closed.
 */
export function parseOfficialEndpointSectionReference(
  value: unknown,
): OfficialEndpointSectionReferenceParseResult {
  if (typeof value !== 'string' || value.trim().length === 0) return { status: 'absent' }

  const matches: ParsedOfficialEndpointSectionReference[] = []
  STRICT_SECTION_REFERENCE.lastIndex = 0
  for (let match = STRICT_SECTION_REFERENCE.exec(value); match; match = STRICT_SECTION_REFERENCE.exec(value)) {
    const roadNumber = canonicalToken(match[1])
    const sectionNumber = canonicalToken(match[2])
    if (roadNumber && sectionNumber) matches.push({ roadNumber, sectionNumber })
  }
  STRICT_SECTION_REFERENCE.lastIndex = 0

  if (matches.length === 0) return { status: 'absent' }
  if (matches.length !== 1) return { status: 'ambiguous' }
  return { status: 'ok', reference: matches[0] }
}

function validFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validPoint(point: RoadTopologyPoint): boolean {
  return validFiniteNumber(point.lat)
    && validFiniteNumber(point.lon)
    && point.lat >= -90
    && point.lat <= 90
    && point.lon >= -180
    && point.lon <= 180
    && (point.zM === undefined || validFiniteNumber(point.zM))
}

function validGeometry(geometry: readonly RoadTopologyPoint[]): boolean {
  return geometry.length >= 2 && geometry.every(validPoint)
}

function canonicalSectionIdentity(
  identity: OfficialRoadSectionIdentity,
): OfficialRoadSectionIdentity | null {
  const authority = identity.authority.trim()
  const datasetId = identity.datasetId.trim()
  const roadNumber = canonicalToken(identity.roadNumber)
  const sectionNumber = canonicalToken(identity.sectionNumber)
  if (!authority || !datasetId || !roadNumber || !sectionNumber) return null
  return { authority, datasetId, roadNumber, sectionNumber }
}

function sectionReferenceKey(reference: ParsedOfficialEndpointSectionReference): string {
  return `${reference.roadNumber}\u0000${reference.sectionNumber}`
}

function sectionIdentityReference(identity: OfficialRoadSectionIdentity): ParsedOfficialEndpointSectionReference {
  return {
    roadNumber: identity.roadNumber,
    sectionNumber: identity.sectionNumber,
  }
}

function endpointPoint(
  segment: RoadTopologySourceSegment,
  side: RoadTopologyEndpointSide,
): RoadTopologyPoint {
  return side === 'start' ? segment.geometry[0] : segment.geometry[segment.geometry.length - 1]
}

function endpointKey(segment: RoadTopologySourceSegment, side: RoadTopologyEndpointSide): string {
  return `${segment.id}\u0000${side}`
}

function candidateId(segment: RoadTopologySourceSegment, side: RoadTopologyEndpointSide): string {
  return `topology-candidate:${encodeURIComponent(segment.id)}:${side}`
}

function reciprocalReceiptId(
  source: RoadTopologySourceSegment,
  sourceSide: RoadTopologyEndpointSide,
  target: RoadTopologySourceSegment,
  targetSide: RoadTopologyEndpointSide,
): string {
  const pair = [endpointKey(source, sourceSide), endpointKey(target, targetSide)].sort()
  return `source-attested-gap:${encodeURIComponent(pair[0])}:${encodeURIComponent(pair[1])}`
}

function exactVertexReceiptId(
  source: RoadTopologySourceSegment,
  sourceSide: RoadTopologyEndpointSide,
  target: RoadTopologySourceSegment,
  targetVertexIndex: number,
): string {
  const sourceKey = endpointKey(source, sourceSide)
  const targetKey = `${target.id}\u0000vertex-${targetVertexIndex}`
  return `source-attested-exact-vertex:${encodeURIComponent(sourceKey)}:${encodeURIComponent(targetKey)}`
}

export function roadTopologyDistanceM(a: RoadTopologyPoint, b: RoadTopologyPoint): number {
  const lat1 = a.lat * Math.PI / 180
  const lat2 = b.lat * Math.PI / 180
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLon = (b.lon - a.lon) * Math.PI / 180
  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

function interpolatePoint(a: RoadTopologyPoint, b: RoadTopologyPoint, fraction: number): RoadTopologyPoint {
  const zM = a.zM !== undefined && b.zM !== undefined
    ? a.zM + (b.zM - a.zM) * fraction
    : undefined
  return {
    lat: a.lat + (b.lat - a.lat) * fraction,
    lon: a.lon + (b.lon - a.lon) * fraction,
    ...(zM === undefined ? {} : { zM }),
  }
}

function projectOntoEdge(
  point: RoadTopologyPoint,
  a: RoadTopologyPoint,
  b: RoadTopologyPoint,
): { point: RoadTopologyPoint; fraction: number; distanceM: number } {
  const referenceLatRad = point.lat * Math.PI / 180
  const xScale = Math.cos(referenceLatRad) * Math.PI / 180 * EARTH_RADIUS_M
  const yScale = Math.PI / 180 * EARTH_RADIUS_M
  const ax = (a.lon - point.lon) * xScale
  const ay = (a.lat - point.lat) * yScale
  const bx = (b.lon - point.lon) * xScale
  const by = (b.lat - point.lat) * yScale
  const dx = bx - ax
  const dy = by - ay
  const denominator = dx * dx + dy * dy
  const fraction = denominator <= FLOAT_EPSILON
    ? 0
    : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denominator))
  const projected = interpolatePoint(a, b, fraction)
  return { point: projected, fraction, distanceM: roadTopologyDistanceM(point, projected) }
}

function sameProjectedLocation(a: Projection, b: Projection, toleranceM: number): boolean {
  return roadTopologyDistanceM(a.point, b.point) <= toleranceM
}

function projectOntoGeometry(
  point: RoadTopologyPoint,
  geometry: readonly RoadTopologyPoint[],
  tieToleranceM: number,
): { status: 'ok'; projection: Projection } | { status: 'ambiguous' } {
  const cumulative: number[] = [0]
  for (let index = 1; index < geometry.length; index += 1) {
    cumulative.push(cumulative[index - 1] + roadTopologyDistanceM(geometry[index - 1], geometry[index]))
  }
  const totalLengthM = cumulative[cumulative.length - 1]
  const projections: Projection[] = []
  for (let edgeIndex = 0; edgeIndex < geometry.length - 1; edgeIndex += 1) {
    const edge = projectOntoEdge(point, geometry[edgeIndex], geometry[edgeIndex + 1])
    const edgeLengthM = cumulative[edgeIndex + 1] - cumulative[edgeIndex]
    projections.push({
      ...edge,
      edgeIndex,
      edgeFraction: edge.fraction,
      distanceFromStartM: cumulative[edgeIndex] + edgeLengthM * edge.fraction,
      totalLengthM,
    })
  }
  projections.sort((a, b) => a.distanceM - b.distanceM || a.edgeIndex - b.edgeIndex)
  const closest = projections[0]
  const tied = projections.filter(candidate => candidate.distanceM <= closest.distanceM + tieToleranceM)
  if (tied.some(candidate => !sameProjectedLocation(candidate, closest, tieToleranceM))) {
    return { status: 'ambiguous' }
  }
  return { status: 'ok', projection: closest }
}

function pointEquals(a: RoadTopologyPoint, b: RoadTopologyPoint): boolean {
  return Math.abs(a.lat - b.lat) <= FLOAT_EPSILON
    && Math.abs(a.lon - b.lon) <= FLOAT_EPSILON
    && (a.zM === undefined || b.zM === undefined || Math.abs(a.zM - b.zM) <= FLOAT_EPSILON)
}

function targetSplit(
  segment: RoadTopologySourceSegment,
  projection: Projection,
  endpointClearanceM: number,
): RoadTopologyTargetSplit {
  const before = segment.geometry.slice(0, projection.edgeIndex + 1)
  const after = segment.geometry.slice(projection.edgeIndex + 1)
  if (!pointEquals(before[before.length - 1], projection.point)) before.push(projection.point)
  if (!pointEquals(after[0], projection.point)) after.unshift(projection.point)

  const distanceToEndM = Math.max(0, projection.totalLengthM - projection.distanceFromStartM)
  let location: RoadTopologyTargetSplit['location'] = 'interior'
  if (projection.distanceFromStartM <= endpointClearanceM) location = 'start'
  else if (distanceToEndM <= endpointClearanceM) location = 'end'
  else if (projection.edgeFraction <= FLOAT_EPSILON || projection.edgeFraction >= 1 - FLOAT_EPSILON) {
    location = 'vertex'
  }

  return {
    segmentId: segment.id,
    edgeIndex: projection.edgeIndex,
    edgeFraction: projection.edgeFraction,
    geometryFraction: projection.totalLengthM <= FLOAT_EPSILON
      ? 0
      : projection.distanceFromStartM / projection.totalLengthM,
    distanceFromStartM: projection.distanceFromStartM,
    distanceToEndM,
    point: projection.point,
    location,
    geometryBefore: before,
    geometryAfter: after,
  }
}

interface ExactInteriorVertexProjection {
  projection: Projection
  vertexIndex: number
}

function exactInteriorVertexProjection(
  sourcePoint: RoadTopologyPoint,
  target: RoadTopologySourceSegment,
  toleranceM: number,
  endpointClearanceM: number,
): ExactInteriorVertexProjection | null {
  const matchingVertexIndexes: number[] = []
  for (let index = 1; index + 1 < target.geometry.length; index += 1) {
    if (roadTopologyDistanceM(sourcePoint, target.geometry[index]) <= toleranceM) {
      matchingVertexIndexes.push(index)
    }
  }
  // Repeated/folded geometry at the same coordinate is not unique topology
  // evidence. Endpoint matches remain governed by normal graph node snapping.
  if (matchingVertexIndexes.length !== 1) return null

  const vertexIndex = matchingVertexIndexes[0]
  const cumulative: number[] = [0]
  for (let index = 1; index < target.geometry.length; index += 1) {
    cumulative.push(
      cumulative[index - 1]
      + roadTopologyDistanceM(target.geometry[index - 1], target.geometry[index]),
    )
  }
  const point = target.geometry[vertexIndex]
  const distanceFromStartM = cumulative[vertexIndex]
  const totalLengthM = cumulative[cumulative.length - 1]
  if (
    distanceFromStartM <= endpointClearanceM
    || totalLengthM - distanceFromStartM <= endpointClearanceM
  ) return null
  return {
    vertexIndex,
    projection: {
      point,
      distanceM: roadTopologyDistanceM(sourcePoint, point),
      edgeIndex: vertexIndex - 1,
      edgeFraction: 1,
      distanceFromStartM,
      totalLengthM,
    },
  }
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('\u0000')
}

function allowedPair<T extends string>(
  a: T,
  b: T,
  pairs: readonly (readonly [T, T])[],
): boolean {
  if (a === b) return true
  const expected = pairKey(a, b)
  return pairs.some(pair => pairKey(pair[0], pair[1]) === expected)
}

function canArriveAt(direction: RoadTopologyDirection, side: RoadTopologyEndpointSide): boolean {
  return direction === 'both'
    || (direction === 'forward' && side === 'end')
    || (direction === 'reverse' && side === 'start')
}

function canDepartFrom(direction: RoadTopologyDirection, side: RoadTopologyEndpointSide): boolean {
  return direction === 'both'
    || (direction === 'forward' && side === 'start')
    || (direction === 'reverse' && side === 'end')
}

function allowedTraversal(
  source: RoadTopologySourceSegment,
  sourceSide: RoadTopologyEndpointSide,
  target: RoadTopologySourceSegment,
  targetSide: RoadTopologyEndpointSide,
): readonly RoadTopologyGapTraversal[] {
  const result: RoadTopologyGapTraversal[] = []
  if (canArriveAt(source.direction, sourceSide) && canDepartFrom(target.direction, targetSide)) {
    result.push('source_to_target')
  }
  if (canArriveAt(target.direction, targetSide) && canDepartFrom(source.direction, sourceSide)) {
    result.push('target_to_source')
  }
  return result
}

function allowedTraversalAtTargetInterior(
  source: RoadTopologySourceSegment,
  sourceSide: RoadTopologyEndpointSide,
): readonly RoadTopologyGapTraversal[] {
  const result: RoadTopologyGapTraversal[] = []
  // A genuine interior split retains an incoming and outgoing target edge for
  // either directed orientation. Only the source endpoint constrains whether
  // the join may be entered or exited.
  if (canArriveAt(source.direction, sourceSide)) result.push('source_to_target')
  if (canDepartFrom(source.direction, sourceSide)) result.push('target_to_source')
  return result
}

function reliableElevationM(
  segment: RoadTopologySourceSegment,
  point: RoadTopologyPoint,
): number | undefined {
  if (point.zM === undefined) return undefined
  const knownElevations = segment.geometry
    .map(candidate => candidate.zM)
    .filter((value): value is number => value !== undefined)
  // Vegagerðin sections whose entire available Z series is zero use zero as
  // a missing-data sentinel. Do not turn that sentinel into false grade truth.
  if (
    knownElevations.length > 0
    && knownElevations.every(value => Math.abs(value) <= FLOAT_EPSILON)
  ) return undefined
  return point.zM
}

function bearingDegrees(a: RoadTopologyPoint, b: RoadTopologyPoint): number {
  const lat1 = a.lat * Math.PI / 180
  const lat2 = b.lat * Math.PI / 180
  const dLon = (b.lon - a.lon) * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function angularDifferenceDegrees(a: number, b: number): number {
  const difference = Math.abs(a - b) % 360
  return Math.min(difference, 360 - difference)
}

function undirectedAngularDifferenceDegrees(a: number, b: number): number {
  const difference = angularDifferenceDegrees(a, b)
  return Math.min(difference, 180 - difference)
}

function sourceApproachBearing(
  segment: RoadTopologySourceSegment,
  side: RoadTopologyEndpointSide,
): number {
  if (side === 'end') {
    return bearingDegrees(segment.geometry[segment.geometry.length - 2], segment.geometry[segment.geometry.length - 1])
  }
  return bearingDegrees(segment.geometry[1], segment.geometry[0])
}

function targetTangentBearing(segment: RoadTopologySourceSegment, edgeIndex: number): number {
  return bearingDegrees(segment.geometry[edgeIndex], segment.geometry[edgeIndex + 1])
}

interface XYPoint { x: number; y: number }

function localXY(point: RoadTopologyPoint, origin: RoadTopologyPoint): XYPoint {
  const latRad = origin.lat * Math.PI / 180
  return {
    x: (point.lon - origin.lon) * Math.cos(latRad) * Math.PI / 180 * EARTH_RADIUS_M,
    y: (point.lat - origin.lat) * Math.PI / 180 * EARTH_RADIUS_M,
  }
}

function orientation(a: XYPoint, b: XYPoint, c: XYPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

function properIntersection(a: XYPoint, b: XYPoint, c: XYPoint, d: XYPoint): boolean {
  const abC = orientation(a, b, c)
  const abD = orientation(a, b, d)
  const cdA = orientation(c, d, a)
  const cdB = orientation(c, d, b)
  return abC * abD < -FLOAT_EPSILON && cdA * cdB < -FLOAT_EPSILON
}

function connectorCrossesThirdParty(
  sourcePoint: RoadTopologyPoint,
  targetPoint: RoadTopologyPoint,
  source: RoadTopologySourceSegment,
  target: RoadTopologySourceSegment,
  segments: readonly RoadTopologySourceSegment[],
  maximumElevationDifferenceM: number,
): boolean {
  if (roadTopologyDistanceM(sourcePoint, targetPoint) <= FLOAT_EPSILON) return false
  const a = localXY(sourcePoint, sourcePoint)
  const b = localXY(targetPoint, sourcePoint)
  for (const segment of segments) {
    if (segment.id === source.id || segment.id === target.id || !validGeometry(segment.geometry)) continue
    for (let index = 0; index < segment.geometry.length - 1; index += 1) {
      const c = localXY(segment.geometry[index], sourcePoint)
      const d = localXY(segment.geometry[index + 1], sourcePoint)
      if (!properIntersection(a, b, c, d)) continue

      const thirdZKnown = segment.geometry[index].zM !== undefined && segment.geometry[index + 1].zM !== undefined
      const connectorZKnown = sourcePoint.zM !== undefined && targetPoint.zM !== undefined
      if (thirdZKnown && connectorZKnown) {
        const thirdZ = (segment.geometry[index].zM! + segment.geometry[index + 1].zM!) / 2
        const connectorZ = (sourcePoint.zM! + targetPoint.zM!) / 2
        if (Math.abs(thirdZ - connectorZ) > maximumElevationDifferenceM) continue
      }
      return true
    }
  }
  return false
}

function validatePolicy(policy: RoadTopologyReconciliationPolicy): void {
  const positive = [
    policy.maximumGapDistanceM,
    policy.projectionTieToleranceM,
    policy.endpointClearanceM,
    policy.maximumElevationDifferenceM,
    policy.minimumGapForHeadingCheckM,
    policy.exactVertexToleranceM,
  ]
  const angles = [policy.minimumCrossingAngleDeg, policy.maximumGapApproachDifferenceDeg]
  const hashIsSha256 = /^[a-f0-9]{64}$/i.test(policy.artifact.contentSha256)
  if (
    !policy.policyId.trim()
    || !policy.requiredRoutingProfile.trim()
    || policy.eligibleTargetDatasetIds.length === 0
    || policy.eligibleTargetRoles.length === 0
    || policy.eligibleTargetRoadParts.length === 0
    || positive.some(value => !validFiniteNumber(value) || value <= 0)
    || angles.some(value => !validFiniteNumber(value) || value <= 0 || value > 180)
    || typeof policy.allowSourceAttestedExactInteriorVertex !== 'boolean'
    || policy.exactVertexToleranceM > MAX_EXACT_VERTEX_TOLERANCE_M
    || !policy.artifact.artifactId.trim()
    || !hashIsSha256
    || !policy.artifact.validationReportId.trim()
    || !policy.artifact.numericCeilingRationale.trim()
  ) {
    throw new Error('invalid_road_topology_reconciliation_policy')
  }
}

function sourceEligibilityRejection(
  segment: RoadTopologySourceSegment,
  policy: RoadTopologyReconciliationPolicy,
): RoadTopologyReconciliationRejectionReason | null {
  if (segment.lifecycle !== 'active') return 'source_inactive'
  if (!segment.eligibleRoutingProfiles.includes(policy.requiredRoutingProfile)) {
    return 'source_profile_ineligible'
  }
  return null
}

function targetEligible(
  segment: RoadTopologySourceSegment,
  policy: RoadTopologyReconciliationPolicy,
): boolean {
  return segment.lifecycle === 'active'
    && segment.eligibleRoutingProfiles.includes(policy.requiredRoutingProfile)
    && policy.eligibleTargetDatasetIds.includes(segment.officialSection.datasetId)
    && policy.eligibleTargetRoles.includes(segment.networkRole)
    && policy.eligibleTargetRoadParts.includes(segment.roadPart)
}

function reciprocalEndpoints(
  target: RoadTopologySourceSegment,
  sourceIdentity: OfficialRoadSectionIdentity,
): readonly RoadTopologyEndpointSide[] {
  const expected = sectionReferenceKey(sectionIdentityReference(sourceIdentity))
  return (['start', 'end'] as const).filter(side => {
    const parsed = parseOfficialEndpointSectionReference(target.endpointLabels?.[side])
    return parsed.status === 'ok' && sectionReferenceKey(parsed.reference) === expected
  })
}

function sortedCandidates(
  candidates: readonly RoadTopologyReconciliationCandidate[],
): RoadTopologyReconciliationCandidate[] {
  return [...candidates].sort((a, b) => (
    a.candidateId.localeCompare(b.candidateId)
    || (a.rejectionReason ?? '').localeCompare(b.rejectionReason ?? '')
  ))
}

/**
 * Produces deterministic graph-ready split coordinates and explicit gap
 * connectors. It never mutates or silently snaps the supplied road segments.
 */
export function reconcileSourceAttestedJunctionGaps(
  inputSegments: readonly RoadTopologySourceSegment[],
  policy: RoadTopologyReconciliationPolicy,
): RoadTopologyReconciliationResult {
  validatePolicy(policy)
  const segments = [...inputSegments].sort((a, b) => a.id.localeCompare(b.id))
  const candidates: RoadTopologyReconciliationCandidate[] = []
  const receipts: SourceAttestedJunctionGapReceipt[] = []
  const acceptedEndpointPairs = new Set<string>()

  const canonicalIdentityById = new Map<string, OfficialRoadSectionIdentity | null>()
  const byReference = new Map<string, RoadTopologySourceSegment[]>()
  for (const segment of segments) {
    const identity = canonicalSectionIdentity(segment.officialSection)
    canonicalIdentityById.set(segment.id, identity)
    if (!identity) continue
    const key = sectionReferenceKey(sectionIdentityReference(identity))
    const existing = byReference.get(key) ?? []
    existing.push(segment)
    byReference.set(key, existing)
  }

  function reject(
    source: RoadTopologySourceSegment,
    sourceEndpoint: RoadTopologyEndpointSide,
    rejectionReason: RoadTopologyReconciliationRejectionReason,
    referencedSection?: ParsedOfficialEndpointSectionReference,
  ): void {
    candidates.push({
      candidateId: candidateId(source, sourceEndpoint),
      sourceSegmentId: source.id,
      sourceEndpoint,
      ...(referencedSection ? { referencedSection } : {}),
      status: 'rejected',
      rejectionReason,
    })
  }

  for (const source of segments) {
    for (const sourceEndpoint of ['start', 'end'] as const) {
      const rawReference = source.endpointLabels?.[sourceEndpoint]
      if (rawReference === undefined || rawReference === null || rawReference.trim() === '') continue
      const parsed = parseOfficialEndpointSectionReference(rawReference)
      if (parsed.status !== 'ok') {
        reject(source, sourceEndpoint, 'invalid_source_reference')
        continue
      }

      const sourceIdentity = canonicalIdentityById.get(source.id)
      if (!sourceIdentity) {
        reject(source, sourceEndpoint, 'invalid_source_section', parsed.reference)
        continue
      }
      if (sectionReferenceKey(parsed.reference) === sectionReferenceKey(sectionIdentityReference(sourceIdentity))) {
        reject(source, sourceEndpoint, 'self_reference', parsed.reference)
        continue
      }
      const sourceIneligible = sourceEligibilityRejection(source, policy)
      if (sourceIneligible) {
        reject(source, sourceEndpoint, sourceIneligible, parsed.reference)
        continue
      }
      if (!validGeometry(source.geometry)) {
        reject(source, sourceEndpoint, 'malformed_geometry', parsed.reference)
        continue
      }

      const matchingTargets = (byReference.get(sectionReferenceKey(parsed.reference)) ?? [])
        .filter(target => target.id !== source.id)
      if (matchingTargets.length === 0) {
        reject(source, sourceEndpoint, 'target_missing', parsed.reference)
        continue
      }
      const eligibleTargets = matchingTargets.filter(target => targetEligible(target, policy))
      if (eligibleTargets.length === 0) {
        reject(source, sourceEndpoint, 'target_ineligible', parsed.reference)
        continue
      }
      if (eligibleTargets.length !== 1) {
        reject(source, sourceEndpoint, 'target_ambiguous', parsed.reference)
        continue
      }
      const target = eligibleTargets[0]
      const targetIdentity = canonicalIdentityById.get(target.id)
      if (!targetIdentity || !validGeometry(target.geometry)) {
        reject(source, sourceEndpoint, 'malformed_geometry', parsed.reference)
        continue
      }

      const sourcePoint = endpointPoint(source, sourceEndpoint)
      const reciprocal = reciprocalEndpoints(target, sourceIdentity)
      if (reciprocal.length > 1) {
        reject(source, sourceEndpoint, 'reciprocal_reference_ambiguous', parsed.reference)
        continue
      }
      let projection: Projection
      let targetAttestation: SourceAttestedJunctionGapReceipt['targetAttestation']
      let canonicalPair: string
      let traversal: readonly RoadTopologyGapTraversal[]
      if (reciprocal.length === 1) {
        const targetEndpoint = reciprocal[0]
        const projected = projectOntoGeometry(
          sourcePoint,
          target.geometry,
          policy.projectionTieToleranceM,
        )
        if (projected.status === 'ambiguous') {
          reject(source, sourceEndpoint, 'projection_ambiguous', parsed.reference)
          continue
        }
        projection = projected.projection
        targetAttestation = { kind: 'reciprocal_endpoint', endpoint: targetEndpoint }
        canonicalPair = [
          endpointKey(source, sourceEndpoint),
          endpointKey(target, targetEndpoint),
        ].sort().join('|')
        traversal = allowedTraversal(source, sourceEndpoint, target, targetEndpoint)
      } else {
        const exactVertex = policy.allowSourceAttestedExactInteriorVertex
          ? exactInteriorVertexProjection(
              sourcePoint,
              target,
              policy.exactVertexToleranceM,
              policy.endpointClearanceM,
            )
          : null
        if (!exactVertex) {
          reject(source, sourceEndpoint, 'nonreciprocal_reference', parsed.reference)
          continue
        }
        projection = exactVertex.projection
        targetAttestation = {
          kind: 'source_exact_interior_vertex',
          vertexIndex: exactVertex.vertexIndex,
        }
        canonicalPair = [
          endpointKey(source, sourceEndpoint),
          `${target.id}\u0000vertex-${exactVertex.vertexIndex}`,
        ].sort().join('|')
        traversal = allowedTraversalAtTargetInterior(source, sourceEndpoint)
      }
      if (acceptedEndpointPairs.has(canonicalPair)) continue

      if (!allowedPair(source.networkRole, target.networkRole, policy.compatibleNetworkRolePairs)) {
        reject(source, sourceEndpoint, 'incompatible_network_role', parsed.reference)
        continue
      }
      if (!allowedPair(source.roadPart, target.roadPart, policy.compatibleRoadPartPairs)) {
        reject(source, sourceEndpoint, 'incompatible_road_part', parsed.reference)
        continue
      }
      if (traversal.length === 0) {
        reject(source, sourceEndpoint, 'incompatible_direction', parsed.reference)
        continue
      }

      if (projection.distanceM > policy.maximumGapDistanceM) {
        reject(source, sourceEndpoint, 'gap_too_far', parsed.reference)
        continue
      }

      if (projection.distanceM >= policy.minimumGapForHeadingCheckM) {
        const gapBearing = bearingDegrees(sourcePoint, projection.point)
        const approachDifference = angularDifferenceDegrees(
          sourceApproachBearing(source, sourceEndpoint),
          gapBearing,
        )
        if (approachDifference > policy.maximumGapApproachDifferenceDeg) {
          reject(source, sourceEndpoint, 'gap_approach_misaligned', parsed.reference)
          continue
        }
      }

      const exactVertexAttested = targetAttestation.kind === 'source_exact_interior_vertex'
      const sourceZ = exactVertexAttested
        ? reliableElevationM(source, sourcePoint)
        : sourcePoint.zM
      const targetZ = exactVertexAttested
        ? reliableElevationM(target, projection.point)
        : projection.point.zM
      if (sourceZ !== undefined && targetZ !== undefined) {
        if (Math.abs(sourceZ - targetZ) > policy.maximumElevationDifferenceM) {
          reject(source, sourceEndpoint, 'elevation_contradiction', parsed.reference)
          continue
        }
      } else if (!exactVertexAttested) {
        const distanceToEndM = projection.totalLengthM - projection.distanceFromStartM
        const isInterior = projection.distanceFromStartM > policy.endpointClearanceM
          && distanceToEndM > policy.endpointClearanceM
        const crossingAngle = undirectedAngularDifferenceDegrees(
          sourceApproachBearing(source, sourceEndpoint),
          targetTangentBearing(target, projection.edgeIndex),
        )
        if (isInterior && crossingAngle >= policy.minimumCrossingAngleDeg) {
          reject(source, sourceEndpoint, 'grade_ambiguous', parsed.reference)
          continue
        }
      }

      if (connectorCrossesThirdParty(
        sourcePoint,
        projection.point,
        source,
        target,
        segments,
        policy.maximumElevationDifferenceM,
      )) {
        reject(source, sourceEndpoint, 'third_party_crossing_ambiguous', parsed.reference)
        continue
      }

      const id = targetAttestation.kind === 'reciprocal_endpoint'
        ? reciprocalReceiptId(
            source,
            sourceEndpoint,
            target,
            targetAttestation.endpoint,
          )
        : exactVertexReceiptId(
            source,
            sourceEndpoint,
            target,
            targetAttestation.vertexIndex,
          )
      const split = targetSplit(target, projection, policy.endpointClearanceM)
      const connector: SourceAttestedJunctionGapConnector = {
        id: `${id}:connector`,
        kind: 'source_attested_junction_gap',
        networkRole: 'access_connector',
        assessmentEligible: false,
        geometry: [sourcePoint, split.point],
        lengthM: projection.distanceM,
        allowedTraversal: traversal,
        truthClaims: { road: false, surface: false, weather: false, safety: false },
      }
      receipts.push({
        id,
        kind: 'source_attested_junction_gap',
        policyId: policy.policyId,
        sourceSegmentId: source.id,
        sourceFeatureId: source.sourceFeatureId,
        sourceEndpoint,
        sourceSection: sourceIdentity,
        targetSegmentId: target.id,
        targetFeatureId: target.sourceFeatureId,
        targetAttestation,
        targetSection: targetIdentity,
        targetSplit: split,
        connector,
        provenance: policy.artifact,
      })
      candidates.push({
        candidateId: candidateId(source, sourceEndpoint),
        sourceSegmentId: source.id,
        sourceEndpoint,
        referencedSection: parsed.reference,
        status: 'accepted',
        receiptId: id,
      })
      acceptedEndpointPairs.add(canonicalPair)
    }
  }

  return {
    candidates: sortedCandidates(candidates),
    receipts: receipts.sort((a, b) => a.id.localeCompare(b.id)),
  }
}
