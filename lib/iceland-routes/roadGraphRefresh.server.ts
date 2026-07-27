import 'server-only'

import { analyzeIcelandRoadGraph, buildIcelandRoadGraph } from './roadGraph'
import { auditIcelandGoldenRoutes, ICELAND_GOLDEN_ROUTES } from './goldenRoutes'
import {
  ROAD_GRAPH_NODE_SNAP_TOLERANCE_M,
  ROAD_GRAPH_SNAPSHOT_SCHEMA_VERSION,
  parseRoadGraphSnapshotPayload,
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
  hashRoadGraphSnapshotSegments,
  stageRoadGraphSnapshot,
  type RoadGraphSnapshotTrigger,
} from './roadGraphSnapshotStore.server'
import { fetchVegagerdinRoadGraphSegments } from './vegagerdinRoadGraphSource.server'
import type { IcelandRoadGraphDiagnostics } from './roadGraphTypes'

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
    }
  | { status: 'skipped'; reason: 'already_running' | 'unchanged'; activeSnapshotId?: string }
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
    const segments = [...await fetchVegagerdinRoadGraphSegments()]
      .sort((a, b) => a.id.localeCompare(b.id))
    const sourceFetchedAtIso = new Date().toISOString()
    const sourceContentSha256 = hashRoadGraphSnapshotSegments(segments)
    if (previous?.sourceContentSha256 === sourceContentSha256) {
      // Do not trust metadata alone: an unchanged source may still need a new
      // snapshot if the active immutable object is missing or corrupted.
      const activePayloadIsReadable = await readRoadGraphSnapshotPayload(previous)
        .then(payload => parseRoadGraphSnapshotPayload(payload) !== null)
        .catch(() => false)
      if (activePayloadIsReadable) {
        await completeUnchangedRoadGraphRefresh({
          id: snapshotId,
          sourceFetchedAtIso,
          sourceContentSha256,
          activeSnapshotId: previous.id,
        })
        await pruneRoadGraphSnapshotHistory().catch(() => undefined)
        return { status: 'skipped', reason: 'unchanged', activeSnapshotId: previous.id }
      }
    }
    const graph = buildIcelandRoadGraph(segments, {
      nodeSnapToleranceM: ROAD_GRAPH_NODE_SNAP_TOLERANCE_M,
    })
    const diagnostics = analyzeIcelandRoadGraph(graph)
    const goldenRoutes = auditIcelandGoldenRoutes(graph)
    const goldenRoutePassCount = goldenRoutes.filter(route => route.status === 'ok').length
    const goldenRouteTotalCount = goldenRoutes.length
    const validation = validateRoadGraphSnapshot({
      diagnostics,
      goldenRouteStatuses: goldenRoutes.map(route => route.status),
      previous,
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
      goldenRoutePassCount,
      goldenRouteTotalCount,
    }
    if (!validation.ok) throw new Error('snapshot_validation_failed')

    const payload: RoadGraphSnapshotPayloadV1 = {
      schemaVersion: ROAD_GRAPH_SNAPSHOT_SCHEMA_VERSION,
      source: 'vegagerdin',
      sourceFetchedAtIso,
      nodeSnapToleranceM: ROAD_GRAPH_NODE_SNAP_TOLERANCE_M,
      segments: [...segments],
    }
    await stageRoadGraphSnapshot({
      id: snapshotId,
      payload,
      diagnostics,
      goldenRoutes,
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
