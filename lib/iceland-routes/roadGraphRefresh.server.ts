import 'server-only'

import { analyzeIcelandRoadGraph, buildIcelandRoadGraph } from './roadGraph'
import {
  auditIcelandGoldenRoutes,
  ICELAND_GOLDEN_ROUTES,
  type IcelandGoldenRouteAudit,
} from './goldenRoutes'
import {
  canonicalRoadGraphSnapshotValueJson,
  ROAD_GRAPH_NODE_SNAP_TOLERANCE_M,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_ENDPOINT_JUNCTION_V3,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_RECIPROCAL_V1,
  ROAD_GRAPH_SNAPSHOT_SCHEMA_VERSION,
  parseRoadGraphSnapshotPayload,
  parseRoadGraphSnapshotPayloadLegacyV1Compatibility,
  parseRoadGraphRuntimeBuildContractV1,
  serializeRoadGraphSnapshotSegmentsV1,
  type RoadGraphRuntimeBuildContractV1,
  type RoadGraphRuntimeBuildPolicyFingerprint,
  type RoadGraphSnapshotPayloadV1,
} from './roadGraphSnapshotFormat'
import {
  beginRoadGraphSnapshotRefresh,
  completeUnchangedRoadGraphRefresh,
  failRoadGraphSnapshot,
  promoteRoadGraphSnapshot,
  pruneRoadGraphSnapshotHistory,
  readActiveRoadGraphSnapshotMetadata,
  readRoadGraphSnapshotPayload,
  hashRoadGraphSnapshotPayload,
  hashRoadGraphSnapshotSegments,
  stageRoadGraphSnapshot,
  type RoadGraphSnapshotTrigger,
} from './roadGraphSnapshotStore.server'
import { fetchVegagerdinRoadGraphSegments } from './vegagerdinRoadGraphSource.server'
import type { IcelandRoadGraph, IcelandRoadGraphDiagnostics } from './roadGraphTypes'
import { materializeEnhancedRoadGraphSnapshotV1 } from './roadGraphRuntimeMaterialization'
import { auditExactVertexV2VidibakkiRoute } from './roadGraphExactVertexV2Regression.server'

const MIN_SEGMENTS = 1_000
const MIN_NODES = 1_000
const MIN_EDGES = 1_500
// The official Vegagerdin layer contains a long tail of small disconnected
// road stubs. The measured 20 m topology baseline is 854 / 1,363 nodes
// (62.66%), while all golden routes pass. Keep an absolute bootstrap floor and
// then guard subsequent snapshots against material drift from the active LKG.
const MIN_LARGEST_COMPONENT_SHARE = 0.60
const MIN_RELATIVE_LARGEST_COMPONENT_SHARE = 0.90
const MIN_RELATIVE_COUNT = 0.8
const MAX_RELATIVE_COUNT = 1.5
const MAX_GOLDEN_ROUTE_RELATIVE_DISTANCE_DELTA = 0.15
const MAX_GOLDEN_ROUTE_MINIMUM_DISTANCE_DELTA_KM = 5
const LEGACY_GOLDEN_ROUTE_TOTAL_BEFORE_V179 = 21
export const TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_FLAG =
  'TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED'
export const TESKEID_ROAD_GRAPH_ENDPOINT_JUNCTION_V3_FLAG =
  'TESKEID_ROAD_GRAPH_ENDPOINT_JUNCTION_V3_ENABLED'
export const TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_FLAG =
  'TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED'

function legacyV1MaterializationSegments(
  segments: readonly RoadGraphSnapshotPayloadV1['segments'][number][],
): RoadGraphSnapshotPayloadV1['segments'] {
  return segments.map(segment => {
    const legacy = { ...segment }
    delete legacy.official
    delete legacy.directionStatus
    delete legacy.networkRole
    return legacy
  })
}

function validationRuntimeBuildContract(
  validation: Record<string, unknown> | undefined,
): RoadGraphRuntimeBuildContractV1 | null {
  return parseRoadGraphRuntimeBuildContractV1(validation?.runtimeBuildContract)
}

function exactRuntimeBuildContract(
  left: RoadGraphRuntimeBuildContractV1 | null | undefined,
  right: RoadGraphRuntimeBuildContractV1 | null | undefined,
): boolean {
  return Boolean(left && right)
    && canonicalRoadGraphSnapshotValueJson(left) === canonicalRoadGraphSnapshotValueJson(right)
}

function materializedGraphMatchesRuntimeContract(
  graph: IcelandRoadGraph,
  contract: RoadGraphRuntimeBuildContractV1,
): boolean {
  return canonicalRoadGraphSnapshotValueJson(analyzeIcelandRoadGraph(graph))
      === canonicalRoadGraphSnapshotValueJson(contract.diagnostics)
    && canonicalRoadGraphSnapshotValueJson([...(graph.topologyReceiptIds ?? [])].sort())
      === canonicalRoadGraphSnapshotValueJson(contract.topologyReceiptIds)
}

function materializedGoldenAuditMatchesRuntimeContract(
  routes: readonly IcelandGoldenRouteAudit[],
  contract: RoadGraphRuntimeBuildContractV1,
): boolean {
  if (
    routes.length !== ICELAND_GOLDEN_ROUTES.length
    || contract.goldenRouteTotalCount <= 0
  ) return false
  const currentPassCount = routes.filter(route => route.status === 'ok').length
  // When the matrix version is unchanged, its derived pass count is part of
  // the immutable runtime contract. A historical 21-route contract can only
  // bootstrap the newer 23-route matrix when its own matrix was fully green;
  // the two new routes are then guarded by today's absolute bounds.
  return contract.goldenRouteTotalCount === routes.length
    ? currentPassCount === contract.goldenRoutePassCount
    : contract.goldenRouteTotalCount === LEGACY_GOLDEN_ROUTE_TOTAL_BEFORE_V179
      && contract.goldenRoutePassCount === LEGACY_GOLDEN_ROUTE_TOTAL_BEFORE_V179
}

function legacyGraphMatchesActiveMetadata(
  graph: IcelandRoadGraph,
  metadata: NonNullable<Awaited<ReturnType<typeof readActiveRoadGraphSnapshotMetadata>>>,
): boolean {
  const diagnostics = analyzeIcelandRoadGraph(graph)
  return diagnostics.segmentCount === metadata.segmentCount
    && diagnostics.nodeCount === metadata.nodeCount
    && diagnostics.edgeCount === metadata.edgeCount
    && diagnostics.weakComponentCount === metadata.weakComponentCount
    && diagnostics.largestWeakComponentNodeCount === metadata.largestWeakComponentNodeCount
    && metadata.goldenRoutePassCount === metadata.goldenRouteTotalCount
}

async function readActiveSnapshotPayloadForRefresh(
  metadata: Awaited<ReturnType<typeof readActiveRoadGraphSnapshotMetadata>>,
): Promise<RoadGraphSnapshotPayloadV1 | null> {
  if (!metadata) return null
  try {
    const payload = parseRoadGraphSnapshotPayload(
      await readRoadGraphSnapshotPayload(metadata),
    )
    if (!payload || payload.schemaVersion !== 1) {
      throw new Error('active_snapshot_payload_invalid')
    }
    if (
      metadata.payloadSha256
      && hashRoadGraphSnapshotPayload(payload) !== metadata.payloadSha256
    ) {
      throw new Error('active_snapshot_payload_invalid')
    }
    return payload
  } catch {
    throw new Error('active_snapshot_payload_invalid')
  }
}

function refreshBuildPolicyFingerprint(
  activeContract: RoadGraphRuntimeBuildContractV1 | null,
  env: {
    TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED?: string
    TESKEID_ROAD_GRAPH_ENDPOINT_JUNCTION_V3_ENABLED?: string
    TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED?: string
  } = {
    TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED:
      process.env.TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED,
    TESKEID_ROAD_GRAPH_ENDPOINT_JUNCTION_V3_ENABLED:
      process.env.TESKEID_ROAD_GRAPH_ENDPOINT_JUNCTION_V3_ENABLED,
    TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED:
      process.env.TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED,
  },
): RoadGraphRuntimeBuildPolicyFingerprint {
  // Never downgrade an already active versioned snapshot because a rollout
  // flag was later removed or misconfigured.
  if (activeContract?.policyFingerprint
    === ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4) {
    return ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4
  }
  if (env.TESKEID_ROAD_GRAPH_HUB_ENDPOINT_V4_ENABLED === 'true') {
    return ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4
  }
  if (activeContract?.policyFingerprint
    === ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_ENDPOINT_JUNCTION_V3) {
    return ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_ENDPOINT_JUNCTION_V3
  }
  if (env.TESKEID_ROAD_GRAPH_ENDPOINT_JUNCTION_V3_ENABLED === 'true') {
    return ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_ENDPOINT_JUNCTION_V3
  }
  if (activeContract?.policyFingerprint
    === ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2) {
    return ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2
  }
  return env.TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED === 'true'
    ? ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2
    : ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_RECIPROCAL_V1
}

type ValidationResult = {
  ok: boolean
  checks: Record<string, boolean>
  previousSnapshotId: string | null
  largestComponentShare: number
  previousLargestComponentShare: number | null
}

type PreviousGoldenRouteDistance = Pick<
  IcelandGoldenRouteAudit,
  'id' | 'status' | 'distanceKm'
> & { reverseDistanceKm?: number | null }

function previousGoldenRouteDistances(
  validation: Record<string, unknown> | undefined,
): PreviousGoldenRouteDistance[] {
  if (!Array.isArray(validation?.goldenRoutes)) return []
  return validation.goldenRoutes.flatMap(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const route = value as Record<string, unknown>
    if (
      typeof route.id !== 'string'
      || typeof route.status !== 'string'
      || (route.distanceKm !== null
        && (typeof route.distanceKm !== 'number' || !Number.isFinite(route.distanceKm)))
      || (route.reverseDistanceKm !== undefined
        && route.reverseDistanceKm !== null
        && (typeof route.reverseDistanceKm !== 'number'
          || !Number.isFinite(route.reverseDistanceKm)))
    ) return []
    return [{
      id: route.id,
      status: route.status as IcelandGoldenRouteAudit['status'],
      distanceKm: route.distanceKm as number | null,
      ...(route.reverseDistanceKm === undefined
        ? {}
        : { reverseDistanceKm: route.reverseDistanceKm as number | null }),
    }]
  })
}

function completeGoldenRouteBaseline(
  routes: readonly PreviousGoldenRouteDistance[],
): boolean {
  if (routes.length !== ICELAND_GOLDEN_ROUTES.length) return false
  const ids = new Set(routes.map(route => route.id))
  return ids.size === routes.length
    && ICELAND_GOLDEN_ROUTES.every(route => ids.has(route.id))
    && routes.every(route => (
      route.status === 'ok'
      && route.distanceKm !== null
      && Number.isFinite(route.distanceKm)
      && route.reverseDistanceKm !== undefined
      && route.reverseDistanceKm !== null
      && Number.isFinite(route.reverseDistanceKm)
    ))
}

function goldenRouteDistancesStable(
  current: readonly IcelandGoldenRouteAudit[] | undefined,
  previous: readonly PreviousGoldenRouteDistance[] | undefined,
): boolean {
  if (!current || !previous || previous.length === 0) return true
  const previousById = new Map(previous.map(route => [route.id, route]))
  const definitionsById = new Map(ICELAND_GOLDEN_ROUTES.map(route => [route.id, route]))
  return current.every(route => {
    const baseline = previousById.get(route.id)
    const definition = definitionsById.get(route.id)
    if (!baseline || !definition) return true
    if (
      route.status !== 'ok'
      || route.distanceKm === null
      || route.reverseDistanceKm === null
    ) return false
    // A route that was not numeric/routable in an authenticated legacy graph
    // has no distance delta baseline. The candidate must still pass today's
    // absolute distance, reverse, snap and stretch gates above.
    if (baseline.distanceKm === null) return true
    const baselineOutsideCurrentBounds = baseline.distanceKm < definition.minKm
      || baseline.distanceKm > definition.maxKm
      || (baseline.reverseDistanceKm !== undefined
        && baseline.reverseDistanceKm !== null
        && (baseline.reverseDistanceKm < definition.minKm
          || baseline.reverseDistanceKm > definition.maxKm))
    if (baselineOutsideCurrentBounds) return true
    const forwardToleranceKm = Math.max(
      MAX_GOLDEN_ROUTE_MINIMUM_DISTANCE_DELTA_KM,
      baseline.distanceKm * MAX_GOLDEN_ROUTE_RELATIVE_DISTANCE_DELTA,
    )
    if (Math.abs(route.distanceKm - baseline.distanceKm) > forwardToleranceKm) return false
    if (baseline.reverseDistanceKm === undefined || baseline.reverseDistanceKm === null) return true
    const reverseToleranceKm = Math.max(
      MAX_GOLDEN_ROUTE_MINIMUM_DISTANCE_DELTA_KM,
      baseline.reverseDistanceKm * MAX_GOLDEN_ROUTE_RELATIVE_DISTANCE_DELTA,
    )
    return Math.abs(route.reverseDistanceKm - baseline.reverseDistanceKm) <= reverseToleranceKm
  })
}

function withinRelativeBoundary(current: number, previous: number | undefined): boolean {
  if (!previous || previous <= 0) return true
  return current >= previous * MIN_RELATIVE_COUNT && current <= previous * MAX_RELATIVE_COUNT
}

export function validateRoadGraphSnapshot(input: {
  diagnostics: IcelandRoadGraphDiagnostics
  goldenRouteStatuses: readonly string[]
  goldenRoutes?: readonly IcelandGoldenRouteAudit[]
  exactVertexV2RegressionStatus?: string
  previous?: {
    id: string
    segmentCount: number
    nodeCount: number
    edgeCount: number
    largestWeakComponentNodeCount: number
    goldenRoutes?: readonly PreviousGoldenRouteDistance[]
  } | null
}): ValidationResult {
  const { diagnostics, previous } = input
  const largestComponentShare = diagnostics.nodeCount > 0
    ? diagnostics.largestWeakComponentNodeCount / diagnostics.nodeCount
    : 0
  const previousLargestComponentShare = previous && previous.nodeCount > 0
    ? previous.largestWeakComponentNodeCount / previous.nodeCount
    : null
  const checks = {
    minimumSegments: diagnostics.segmentCount >= MIN_SEGMENTS,
    minimumNodes: diagnostics.nodeCount >= MIN_NODES,
    minimumEdges: diagnostics.edgeCount >= MIN_EDGES,
    largestComponentShare: largestComponentShare >= MIN_LARGEST_COMPONENT_SHARE,
    largestComponentShareStable: previousLargestComponentShare === null
      || largestComponentShare >= previousLargestComponentShare * MIN_RELATIVE_LARGEST_COMPONENT_SHARE,
    allGoldenRoutesPass: input.goldenRouteStatuses.length === ICELAND_GOLDEN_ROUTES.length
      && input.goldenRouteStatuses.every(status => status === 'ok'),
    goldenRouteDistancesStable: goldenRouteDistancesStable(
      input.goldenRoutes,
      previous?.goldenRoutes,
    ),
    exactVertexV2Regression: input.exactVertexV2RegressionStatus === undefined
      || input.exactVertexV2RegressionStatus === 'ok',
    officialSurfaceCoverage: diagnostics.surfaceEdgeCounts.mixed === 0
      && diagnostics.surfaceEdgeCounts.unknown === 0,
    segmentCountStable: withinRelativeBoundary(diagnostics.segmentCount, previous?.segmentCount),
    nodeCountStable: withinRelativeBoundary(diagnostics.nodeCount, previous?.nodeCount),
    edgeCountStable: withinRelativeBoundary(diagnostics.edgeCount, previous?.edgeCount),
  }
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    previousSnapshotId: previous?.id ?? null,
    largestComponentShare,
    previousLargestComponentShare,
  }
}

export type RoadGraphRefreshResult =
  | {
      status: 'ok'
      snapshotId: string
      segmentCount: number
      nodeCount: number
      edgeCount: number
      goldenRoutePassCount: number
      goldenRouteTotalCount: number
      policyFingerprint: RoadGraphRuntimeBuildPolicyFingerprint
    }
  | {
      status: 'skipped'
      reason: 'already_running' | 'unchanged'
      activeSnapshotId?: string
      policyFingerprint?: RoadGraphRuntimeBuildPolicyFingerprint
    }
  | { status: 'error'; reason: string }

function safeReason(error: unknown): string {
  if (error instanceof Error && /^[a-z0-9_]{1,120}$/i.test(error.message)) return error.message
  return 'refresh_failed'
}

export async function refreshRoadGraphSnapshot(
  triggeredBy: RoadGraphSnapshotTrigger,
): Promise<RoadGraphRefreshResult> {
  let snapshotId: string | null = null
  let validationDetails: Record<string, unknown> = {}
  try {
    snapshotId = await beginRoadGraphSnapshotRefresh(triggeredBy)
    if (!snapshotId) return { status: 'skipped', reason: 'already_running' }

    const previous = await readActiveRoadGraphSnapshotMetadata()
    const previousPayload = await readActiveSnapshotPayloadForRefresh(previous)
    const metadataRuntimeContract = previous
      ? validationRuntimeBuildContract(previous.validation)
      : null
    const payloadRuntimeContract = previousPayload?.runtimeBuildContract ?? null
    if (
      previous
      && (Boolean(metadataRuntimeContract) !== Boolean(payloadRuntimeContract)
        || (metadataRuntimeContract
          && payloadRuntimeContract
          && !exactRuntimeBuildContract(metadataRuntimeContract, payloadRuntimeContract)))
    ) {
      throw new Error('active_snapshot_runtime_contract_mismatch')
    }
    const previousRuntimeContract = metadataRuntimeContract ?? payloadRuntimeContract
    const storedPreviousGoldenRoutes = previousGoldenRouteDistances(previous?.validation)
    let previousGoldenRoutes = completeGoldenRouteBaseline(storedPreviousGoldenRoutes)
      ? storedPreviousGoldenRoutes
      : []
    let previousGoldenRouteBaselineSource: 'stored_validation' | 'active_payload' | 'none' =
      previousGoldenRoutes.length > 0 ? 'stored_validation' : 'none'
    const buildPolicyFingerprint = refreshBuildPolicyFingerprint(previousRuntimeContract)
    const segments = [...await fetchVegagerdinRoadGraphSegments()]
      .sort((a, b) => a.id.localeCompare(b.id))
    const sourceFetchedAtIso = new Date().toISOString()
    const sourceContentSha256 = hashRoadGraphSnapshotSegments(segments)
    if (previous?.sourceContentSha256 === sourceContentSha256) {
      // Source equality is insufficient when graph-build semantics change.
      // The old active snapshot has no fingerprint, so the first topology
      // release always rebuilds even when the official rows are unchanged.
      const activePayloadMatchesBuildPolicy =
        payloadRuntimeContract?.policyFingerprint === buildPolicyFingerprint
        && exactRuntimeBuildContract(payloadRuntimeContract, metadataRuntimeContract)
      if (activePayloadMatchesBuildPolicy) {
        await completeUnchangedRoadGraphRefresh({
          id: snapshotId,
          sourceFetchedAtIso,
          sourceContentSha256,
          activeSnapshotId: previous.id,
        })
        await pruneRoadGraphSnapshotHistory().catch(() => undefined)
        return {
          status: 'skipped',
          reason: 'unchanged',
          activeSnapshotId: previous.id,
          policyFingerprint: buildPolicyFingerprint,
        }
      }
    }
    if (
      previous
      && previousPayload
      && previousRuntimeContract
      && previousGoldenRoutes.length === 0
    ) {
      // Pre-v179 rows did not persist per-route distances. Rebuild their LKG
      // baseline deterministically with the snapshot's own immutable policy;
      // never evaluate old bytes under the candidate writer policy.
      const previousMaterialized = materializeEnhancedRoadGraphSnapshotV1({
        segments: previousPayload.segments,
        nodeSnapToleranceM: previousPayload.nodeSnapToleranceM,
        sourceContentSha256: previous.sourceContentSha256,
        policyFingerprint: previousRuntimeContract.policyFingerprint,
      })
      if (!materializedGraphMatchesRuntimeContract(
        previousMaterialized.graph,
        previousRuntimeContract,
      )) {
        throw new Error('active_snapshot_enhanced_diagnostics_mismatch')
      }
      const rematerializedGoldenRoutes = auditIcelandGoldenRoutes(previousMaterialized.graph)
      if (!materializedGoldenAuditMatchesRuntimeContract(
        rematerializedGoldenRoutes,
        previousRuntimeContract,
      )) {
        throw new Error('active_snapshot_enhanced_golden_mismatch')
      }
      previousGoldenRoutes = rematerializedGoldenRoutes
      previousGoldenRouteBaselineSource = 'active_payload'
    } else if (
      previous
      && previousPayload
      && !previousRuntimeContract
      && previousGoldenRoutes.length === 0
    ) {
      // A genuine versionless v1 snapshot has no topology fingerprint. Mirror
      // the legacy runtime exactly and authenticate it against the immutable
      // metadata before using it as the first distance baseline.
      const previousLegacyGraph = buildIcelandRoadGraph(previousPayload.segments, {
        nodeSnapToleranceM: previousPayload.nodeSnapToleranceM,
      })
      if (!legacyGraphMatchesActiveMetadata(previousLegacyGraph, previous)) {
        throw new Error('active_snapshot_diagnostics_mismatch')
      }
      previousGoldenRoutes = auditIcelandGoldenRoutes(previousLegacyGraph)
      previousGoldenRouteBaselineSource = 'active_payload'
    }
    const serializedSegments = serializeRoadGraphSnapshotSegmentsV1(segments)
    const materialized = materializeEnhancedRoadGraphSnapshotV1({
      segments: serializedSegments,
      nodeSnapToleranceM: ROAD_GRAPH_NODE_SNAP_TOLERANCE_M,
      sourceContentSha256,
      policyFingerprint: buildPolicyFingerprint,
    })
    const { graph, topology } = materialized
    const diagnostics = analyzeIcelandRoadGraph(graph)
    const goldenRoutes = auditIcelandGoldenRoutes(graph)
    const exactVertexV2Regression = buildPolicyFingerprint
      !== ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_RECIPROCAL_V1
      ? auditExactVertexV2VidibakkiRoute({ graph, receipts: topology.receipts })
      : null
    const goldenRoutePassCount = goldenRoutes.filter(route => route.status === 'ok').length
    const goldenRouteTotalCount = goldenRoutes.length
    const runtimeBuildContract: RoadGraphRuntimeBuildContractV1 = {
      schemaVersion: 1,
      policyFingerprint: buildPolicyFingerprint,
      diagnostics,
      goldenRoutePassCount,
      goldenRouteTotalCount,
      topologyReceiptIds: [...(graph.topologyReceiptIds ?? [])].sort(),
    }
    const validation = validateRoadGraphSnapshot({
      diagnostics,
      goldenRouteStatuses: goldenRoutes.map(route => route.status),
      goldenRoutes,
      exactVertexV2RegressionStatus: exactVertexV2Regression?.status,
      previous: previous
        ? {
            id: previous.id,
            segmentCount: previousRuntimeContract?.diagnostics.segmentCount ?? previous.segmentCount,
            nodeCount: previousRuntimeContract?.diagnostics.nodeCount ?? previous.nodeCount,
            edgeCount: previousRuntimeContract?.diagnostics.edgeCount ?? previous.edgeCount,
            largestWeakComponentNodeCount:
              previousRuntimeContract?.diagnostics.largestWeakComponentNodeCount
              ?? previous.largestWeakComponentNodeCount,
            goldenRoutes: previousGoldenRoutes,
          }
        : null,
    })
    validationDetails = {
      ...validation,
      previousGoldenRouteBaselineSource,
      thresholds: {
        minSegments: MIN_SEGMENTS,
        minNodes: MIN_NODES,
        minEdges: MIN_EDGES,
        minLargestComponentShare: MIN_LARGEST_COMPONENT_SHARE,
        minRelativeLargestComponentShare: MIN_RELATIVE_LARGEST_COMPONENT_SHARE,
        minRelativeCount: MIN_RELATIVE_COUNT,
        maxRelativeCount: MAX_RELATIVE_COUNT,
        maxGoldenRouteRelativeDistanceDelta: MAX_GOLDEN_ROUTE_RELATIVE_DISTANCE_DELTA,
        maxGoldenRouteMinimumDistanceDeltaKm: MAX_GOLDEN_ROUTE_MINIMUM_DISTANCE_DELTA_KM,
      },
      failedGoldenRouteIds: goldenRoutes
        .filter(route => route.status !== 'ok')
        .map(route => route.id),
      diagnostics,
      topology: {
        policyId: topology.policyId,
        sourceSegmentCount: topology.topologySegmentCount,
        receiptCount: topology.receipts.length,
        appliedBindingCount: topology.bindings.length,
        rejectedCandidateCount: topology.candidates.filter(candidate => candidate.status === 'rejected').length,
      },
      goldenRoutePassCount,
      goldenRouteTotalCount,
      goldenRoutes,
      exactVertexV2Regression,
      runtimeBuildContract,
    }
    if (!validation.ok) throw new Error('snapshot_validation_failed')

    const payload: RoadGraphSnapshotPayloadV1 = {
      schemaVersion: ROAD_GRAPH_SNAPSHOT_SCHEMA_VERSION,
      source: 'vegagerdin',
      sourceFetchedAtIso,
      nodeSnapToleranceM: ROAD_GRAPH_NODE_SNAP_TOLERANCE_M,
      runtimeBuildContract,
      segments: serializedSegments,
    }
    // Parse the exact canonical publication shape before any storage write or
    // promotion. This is the boundary that rejects unknown-domain drift while
    // accepting only the legacy-compatible unknown-missing serialization.
    const parsedPayload = parseRoadGraphSnapshotPayload(payload)
    const legacyParsedPayload = parseRoadGraphSnapshotPayloadLegacyV1Compatibility(payload)
    if (!parsedPayload?.runtimeBuildContract || !legacyParsedPayload) {
      throw new Error('snapshot_publish_payload_invalid')
    }

    // V1/V2 keep their original cold-code rollback contract: the metadata
    // columns describe the graph an original v1 runtime will materialize. V3+
    // are reader-first and fingerprint-gated, and their repaired topology is
    // intentionally allowed to invalidate a legacy route bound. An old reader
    // cannot parse the V3 fingerprint, so V3 records the legacy audit for
    // diagnosis without using it as promotion truth.
    const legacyGraph = buildIcelandRoadGraph(
      legacyV1MaterializationSegments(legacyParsedPayload.segments),
      { nodeSnapToleranceM: legacyParsedPayload.nodeSnapToleranceM },
    )
    const legacyDiagnostics = analyzeIcelandRoadGraph(legacyGraph)
    const legacyGoldenRoutes = auditIcelandGoldenRoutes(legacyGraph)
    const legacyGoldenRoutePassCount = legacyGoldenRoutes
      .filter(route => route.status === 'ok').length
    const legacyRuntimeCompatible = legacyGoldenRoutes.length === ICELAND_GOLDEN_ROUTES.length
      && legacyGoldenRoutes.every(route => route.status === 'ok')
    const legacyRuntimeCompatibilityRequired = buildPolicyFingerprint
      !== ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_ENDPOINT_JUNCTION_V3
      && buildPolicyFingerprint !== ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4
    const publicationRuntimeCompatible = legacyRuntimeCompatibilityRequired
      ? legacyRuntimeCompatible
      : validation.ok
    validationDetails = {
      ...validationDetails,
      legacyRuntimeCompatible,
      legacyRuntimeCompatibilityRequired,
      publicationRuntimeCompatible,
      publicationRuntimePolicyFingerprint: buildPolicyFingerprint,
      legacyRuntimeDiagnostics: legacyDiagnostics,
      legacyRuntimeGoldenRoutePassCount: legacyGoldenRoutePassCount,
      legacyRuntimeGoldenRouteTotalCount: legacyGoldenRoutes.length,
    }
    if (!publicationRuntimeCompatible) throw new Error('snapshot_legacy_runtime_incompatible')

    const publicationDiagnostics = legacyRuntimeCompatibilityRequired
      ? legacyDiagnostics
      : diagnostics
    const publicationGoldenRoutes = legacyRuntimeCompatibilityRequired
      ? legacyGoldenRoutes
      : goldenRoutes

    await stageRoadGraphSnapshot({
      id: snapshotId,
      payload: parsedPayload,
      diagnostics: publicationDiagnostics,
      goldenRoutes: publicationGoldenRoutes,
      validation: validationDetails,
      sourceContentSha256,
    })
    await promoteRoadGraphSnapshot(snapshotId)
    const active = await readActiveRoadGraphSnapshotMetadata()
    if (active?.id !== snapshotId) throw new Error('snapshot_verify_failed')
    await pruneRoadGraphSnapshotHistory().catch(() => undefined)

    return {
      status: 'ok',
      snapshotId,
      segmentCount: diagnostics.segmentCount,
      nodeCount: diagnostics.nodeCount,
      edgeCount: diagnostics.edgeCount,
      goldenRoutePassCount,
      goldenRouteTotalCount,
      policyFingerprint: buildPolicyFingerprint,
    }
  } catch (error) {
    const reason = safeReason(error)
    if (snapshotId) {
      await failRoadGraphSnapshot(snapshotId, reason, validationDetails).catch(() => undefined)
    }
    console.error('[road-graph-refresh] refresh failed:', reason)
    return { status: 'error', reason }
  }
}
