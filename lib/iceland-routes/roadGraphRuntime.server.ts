import 'server-only'

import { analyzeIcelandRoadGraph, buildIcelandRoadGraph } from './roadGraph'
import type { IcelandRoadGraph } from './roadGraphTypes'
import {
  canonicalRoadGraphSnapshotValueJson,
  parseRoadGraphSnapshotPayload,
  parseRoadGraphRuntimeBuildContractV1,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT,
  ROAD_GRAPH_SNAPSHOT_SCHEMA_VERSION,
} from './roadGraphSnapshotFormat'
import {
  hashRoadGraphSnapshotPayload,
  readActiveRoadGraphSnapshotMetadata,
  readRoadGraphSnapshotPayload,
  type ActiveRoadGraphSnapshotMetadata,
} from './roadGraphSnapshotStore.server'
import { materializeEnhancedRoadGraphSnapshotV1 } from './roadGraphRuntimeMaterialization'

const ACTIVE_VERSION_RECHECK_MS = 5 * 60 * 1000

type CachedRoadGraph = {
  graph: IcelandRoadGraph
  snapshotId: string
  lastVersionCheckAt: number
}

type RoadGraphRuntimeState = {
  policyFingerprint: string
  cached: CachedRoadGraph | null
  pending: Promise<IcelandRoadGraph> | null
}

// Next.js can evaluate the same server module in separate route bundles and
// replaces modules during Fast Refresh. A global state keeps the verified graph
// shared across those boundaries for the lifetime of the Node.js isolate.
const RUNTIME_STATE_KEY = '__teskeidRoadGraphRuntimeV2__' as const

function runtimeState(): RoadGraphRuntimeState {
  const runtime = globalThis as typeof globalThis & {
    [RUNTIME_STATE_KEY]?: RoadGraphRuntimeState
  }
  if (runtime[RUNTIME_STATE_KEY]?.policyFingerprint !== ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT) {
    runtime[RUNTIME_STATE_KEY] = {
      policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT,
      cached: null,
      pending: null,
    }
  }
  return runtime[RUNTIME_STATE_KEY]
}

function verifySnapshotGraph(input: {
  graph: IcelandRoadGraph
  metadata: ActiveRoadGraphSnapshotMetadata
}): void {
  const diagnostics = analyzeIcelandRoadGraph(input.graph)
  const { metadata } = input
  if (
    diagnostics.segmentCount !== metadata.segmentCount
    || diagnostics.nodeCount !== metadata.nodeCount
    || diagnostics.edgeCount !== metadata.edgeCount
    || diagnostics.weakComponentCount !== metadata.weakComponentCount
    || diagnostics.largestWeakComponentNodeCount !== metadata.largestWeakComponentNodeCount
    || metadata.goldenRoutePassCount !== metadata.goldenRouteTotalCount
  ) {
    throw new Error('road_graph_snapshot_diagnostics_mismatch')
  }
}

function verifyEnhancedSnapshotGraph(input: {
  graph: IcelandRoadGraph
  metadata: ActiveRoadGraphSnapshotMetadata
  payloadContract: NonNullable<ReturnType<typeof parseRoadGraphRuntimeBuildContractV1>>
}): void {
  const metadataContract = parseRoadGraphRuntimeBuildContractV1(
    input.metadata.validation.runtimeBuildContract,
  )
  if (
    !metadataContract
    || canonicalRoadGraphSnapshotValueJson(metadataContract)
      !== canonicalRoadGraphSnapshotValueJson(input.payloadContract)
  ) {
    throw new Error('road_graph_snapshot_runtime_contract_mismatch')
  }
  const diagnostics = analyzeIcelandRoadGraph(input.graph)
  if (
    canonicalRoadGraphSnapshotValueJson(diagnostics)
      !== canonicalRoadGraphSnapshotValueJson(input.payloadContract.diagnostics)
    || canonicalRoadGraphSnapshotValueJson([...(input.graph.topologyReceiptIds ?? [])].sort())
      !== canonicalRoadGraphSnapshotValueJson(input.payloadContract.topologyReceiptIds)
  ) {
    throw new Error('road_graph_snapshot_enhanced_diagnostics_mismatch')
  }
}

async function loadActiveSnapshotGraph(forceVersionCheck: boolean): Promise<IcelandRoadGraph> {
  const state = runtimeState()
  const now = Date.now()
  if (state.cached && !forceVersionCheck && now - state.cached.lastVersionCheckAt < ACTIVE_VERSION_RECHECK_MS) {
    return state.cached.graph
  }

  let activeMetadata: ActiveRoadGraphSnapshotMetadata | null = null
  if (state.cached) {
    activeMetadata = await readActiveRoadGraphSnapshotMetadata()
    if (!activeMetadata) throw new Error('road_graph_snapshot_missing')
    if (activeMetadata.id === state.cached.snapshotId) {
      state.cached.lastVersionCheckAt = now
      return state.cached.graph
    }
  }

  const metadata = activeMetadata ?? await readActiveRoadGraphSnapshotMetadata()
  if (!metadata) throw new Error('road_graph_snapshot_missing')
  if (metadata.schemaVersion !== ROAD_GRAPH_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error('road_graph_snapshot_schema_unsupported')
  }
  const payload = parseRoadGraphSnapshotPayload(await readRoadGraphSnapshotPayload(metadata))
  if (!payload) throw new Error('road_graph_snapshot_payload_invalid')
  if (hashRoadGraphSnapshotPayload(payload) !== metadata.payloadSha256) {
    throw new Error('road_graph_snapshot_hash_mismatch')
  }
  let graph: IcelandRoadGraph
  if (payload.runtimeBuildContract) {
    // Reconciliation is derived deterministically from structured official
    // section metadata already inside the verified snapshot. No live source,
    // publication flag or place-specific exception participates at runtime.
    graph = materializeEnhancedRoadGraphSnapshotV1({
      segments: payload.segments,
      nodeSnapToleranceM: payload.nodeSnapToleranceM,
      sourceContentSha256: metadata.sourceContentSha256,
      policyFingerprint: payload.runtimeBuildContract.policyFingerprint,
    }).graph
    verifyEnhancedSnapshotGraph({
      graph,
      metadata,
      payloadContract: payload.runtimeBuildContract,
    })
  } else {
    // Exact legacy path: do not reinterpret an already active v1 snapshot with
    // topology or provisional-direction semantics it was never validated for.
    graph = buildIcelandRoadGraph(payload.segments, {
      nodeSnapToleranceM: payload.nodeSnapToleranceM,
    })
    verifySnapshotGraph({ graph, metadata })
  }
  state.cached = {
    graph,
    snapshotId: metadata.id,
    lastVersionCheckAt: now,
  }
  return graph
}

/**
 * User-facing road graph reader. It never contacts Vegagerðin: only the active,
 * fully validated Supabase snapshot is eligible. If metadata refresh fails in
 * a warm process, the already verified last-known-good graph remains available.
 */
export async function getIcelandRoadGraph(
  options: { forceRefresh?: boolean } = {},
): Promise<IcelandRoadGraph> {
  const state = runtimeState()
  if (state.pending) return state.pending
  state.pending = loadActiveSnapshotGraph(options.forceRefresh === true)
    .catch(error => {
      if (state.cached) {
        // Keep serving the verified LKG graph and avoid retrying a broken new
        // pointer/object on every user request. The normal version interval
        // will try again, while forceRefresh can still retry immediately.
        state.cached.lastVersionCheckAt = Date.now()
        return state.cached.graph
      }
      throw error
    })
    .finally(() => { state.pending = null })
  return state.pending
}

export function getIcelandRoadGraphCacheStatus(): 'cold' | 'loading' | 'warm' {
  const state = runtimeState()
  if (state.cached) return 'warm'
  return state.pending ? 'loading' : 'cold'
}

export function resetIcelandRoadGraphCacheForTests(): void {
  const runtime = globalThis as typeof globalThis & {
    [RUNTIME_STATE_KEY]?: RoadGraphRuntimeState
  }
  runtime[RUNTIME_STATE_KEY] = {
    policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT,
    cached: null,
    pending: null,
  }
}
