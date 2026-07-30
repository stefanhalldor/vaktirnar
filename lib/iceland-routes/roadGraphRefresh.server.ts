import 'server-only'

import { analyzeIcelandRoadGraph, buildIcelandRoadGraph } from './roadGraph'
import { auditIcelandGoldenRoutes, ICELAND_GOLDEN_ROUTES } from './goldenRoutes'
import {
  canonicalRoadGraphSnapshotValueJson,
  ROAD_GRAPH_NODE_SNAP_TOLERANCE_M,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2,
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
import type { IcelandRoadGraphDiagnostics } from './roadGraphTypes'
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
export const TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_FLAG =
  'TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED'

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
  env: { TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED?: string } = {
    TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED:
      process.env.TESKEID_ROAD_GRAPH_EXACT_VERTEX_V2_ENABLED,
  },
): RoadGraphRuntimeBuildPolicyFingerprint {
  // Never downgrade an already active v2 snapshot because a rollout flag was
  // later removed or misconfigured.
  if (
    activeContract?.policyFingerprint
      === ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2
  ) return ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2
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

function withinRelativeBoundary(current: number, previous: number | undefined): boolean {
  if (!previous || previous <= 0) return true
  return current >= previous * MIN_RELATIVE_COUNT && current <= previous * MAX_RELATIVE_COUNT
}

export function validateRoadGraphSnapshot(input: {
  diagnostics: IcelandRoadGraphDiagnostics
  goldenRouteStatuses: readonly string[]
  exactVertexV2RegressionStatus?: string
  previous?: {
    id: string
    segmentCount: number
    nodeCount: number
    edgeCount: number
    largestWeakComponentNodeCount: number
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
      === ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2
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
          }
        : null,
    })
    validationDetails = {
      ...validation,
      thresholds: {
        minSegments: MIN_SEGMENTS,
        minNodes: MIN_NODES,
        minEdges: MIN_EDGES,
        minLargestComponentShare: MIN_LARGEST_COMPONENT_SHARE,
        minRelativeLargestComponentShare: MIN_RELATIVE_LARGEST_COMPONENT_SHARE,
        minRelativeCount: MIN_RELATIVE_COUNT,
        maxRelativeCount: MAX_RELATIVE_COUNT,
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

    // Existing metadata columns deliberately describe the graph an original
    // v1 runtime will materialize. That keeps a cold code rollback readable.
    // The enhanced graph is bound separately by runtimeBuildContract above.
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
    validationDetails = {
      ...validationDetails,
      legacyRuntimeCompatible,
      legacyRuntimeDiagnostics: legacyDiagnostics,
      legacyRuntimeGoldenRoutePassCount: legacyGoldenRoutePassCount,
      legacyRuntimeGoldenRouteTotalCount: legacyGoldenRoutes.length,
    }
    if (!legacyRuntimeCompatible) throw new Error('snapshot_legacy_runtime_incompatible')

    await stageRoadGraphSnapshot({
      id: snapshotId,
      payload: parsedPayload,
      diagnostics: legacyDiagnostics,
      goldenRoutes: legacyGoldenRoutes,
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
