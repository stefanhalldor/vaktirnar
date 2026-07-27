import 'server-only'

import { analyzeIcelandRoadGraph, buildIcelandRoadGraph } from './roadGraph'
import type { IcelandRoadGraph } from './roadGraphTypes'
import {
  parseRoadGraphSnapshotPayload,
  ROAD_GRAPH_SNAPSHOT_SCHEMA_VERSION,
} from './roadGraphSnapshotFormat'
import {
  hashRoadGraphSnapshotPayload,
  readActiveRoadGraphSnapshotMetadata,
  readRoadGraphSnapshotPayload,
  type ActiveRoadGraphSnapshotMetadata,
} from './roadGraphSnapshotStore.server'

const ACTIVE_VERSION_RECHECK_MS = 5 * 60 * 1000

type CachedRoadGraph = {
  graph: IcelandRoadGraph
  snapshotId: string
  lastVersionCheckAt: number
}

type RoadGraphRuntimeState = {
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
  if (!runtime[RUNTIME_STATE_KEY]) {
    runtime[RUNTIME_STATE_KEY] = { cached: null, pending: null }
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
  const graph = buildIcelandRoadGraph(payload.segments, {
    nodeSnapToleranceM: payload.nodeSnapToleranceM,
  })
  verifySnapshotGraph({ graph, metadata })
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
  const state = runtimeState()
  state.cached = null
  state.pending = null
}
