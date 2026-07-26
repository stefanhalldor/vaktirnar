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

let cached: CachedRoadGraph | null = null
let pending: Promise<IcelandRoadGraph> | null = null

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
  const now = Date.now()
  if (cached && !forceVersionCheck && now - cached.lastVersionCheckAt < ACTIVE_VERSION_RECHECK_MS) {
    return cached.graph
  }

  let activeMetadata: ActiveRoadGraphSnapshotMetadata | null = null
  if (cached) {
    activeMetadata = await readActiveRoadGraphSnapshotMetadata()
    if (!activeMetadata) throw new Error('road_graph_snapshot_missing')
    if (activeMetadata.id === cached.snapshotId) {
      cached.lastVersionCheckAt = now
      return cached.graph
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
  cached = {
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
  if (pending) return pending
  pending = loadActiveSnapshotGraph(options.forceRefresh === true)
    .catch(error => {
      if (cached) {
        // Keep serving the verified LKG graph and avoid retrying a broken new
        // pointer/object on every user request. The normal version interval
        // will try again, while forceRefresh can still retry immediately.
        cached.lastVersionCheckAt = Date.now()
        return cached.graph
      }
      throw error
    })
    .finally(() => { pending = null })
  return pending
}

export function resetIcelandRoadGraphCacheForTests(): void {
  cached = null
  pending = null
}
