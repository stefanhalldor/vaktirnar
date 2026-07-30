import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const {
  mockBuildGraph,
  mockAnalyzeGraph,
  mockReadMetadata,
  mockReadPayload,
  mockHashPayload,
  mockPayloadBytes,
  mockReconcileTopology,
} = vi.hoisted(() => ({
  mockBuildGraph: vi.fn(),
  mockAnalyzeGraph: vi.fn(),
  mockReadMetadata: vi.fn(),
  mockReadPayload: vi.fn(),
  mockHashPayload: vi.fn(),
  mockPayloadBytes: vi.fn(),
  mockReconcileTopology: vi.fn(),
}))

vi.mock('@/lib/iceland-routes/roadGraph', () => ({
  buildIcelandRoadGraph: mockBuildGraph,
  analyzeIcelandRoadGraph: mockAnalyzeGraph,
}))

vi.mock('@/lib/iceland-routes/roadGraphSnapshotStore.server', () => ({
  readActiveRoadGraphSnapshotMetadata: mockReadMetadata,
  readRoadGraphSnapshotPayload: mockReadPayload,
  hashRoadGraphSnapshotPayload: mockHashPayload,
  roadGraphSnapshotPayloadBytes: mockPayloadBytes,
}))

vi.mock('@/lib/iceland-routes/vegagerdinRoadGraphTopology', () => ({
  reconcileVegagerdinRoadGraphTopology: mockReconcileTopology,
  VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V1: 'vegagerdin-reciprocal-section-endpoints-v1',
  VEGAGERDIN_TOPOLOGY_RECONCILIATION_POLICY_ID_V2: 'vegagerdin-attested-section-junctions-v2',
}))

import {
  getIcelandRoadGraph,
  getIcelandRoadGraphCacheStatus,
  resetIcelandRoadGraphCacheForTests,
} from '@/lib/iceland-routes/roadGraphRuntime.server'
import {
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_RECIPROCAL_V1,
  type RoadGraphRuntimeBuildPolicyFingerprint,
} from '@/lib/iceland-routes/roadGraphSnapshotFormat'

const PAYLOAD = {
  schemaVersion: 1 as const,
  source: 'vegagerdin' as const,
  sourceFetchedAtIso: '2026-07-26T15:00:00.000Z',
  nodeSnapToleranceM: 20,
  segments: [{
    id: 'segment-1', source: 'vegagerdin' as const, sourceId: '1',
    geometry: [{ lat: 64, lon: -22 }, { lat: 65, lon: -21 }],
    roadClass: 'trunk' as const, surface: 'paved' as const, direction: 'both' as const,
  }],
}

const RUNTIME_DIAGNOSTICS = {
  segmentCount: 1,
  nodeCount: 2,
  edgeCount: 2,
  weakComponentCount: 1,
  largestWeakComponentNodeCount: 2,
  isolatedNodeCount: 0,
  surfaceEdgeCounts: { paved: 2, gravel: 0, mixed: 0, unknown: 0 },
  derivedSpeedEdgeCount: 2,
  topologyConnectorEdgeCount: 0,
}

function runtimeBuildContract(
  topologyReceiptIds: string[] = [],
  policyFingerprint: RoadGraphRuntimeBuildPolicyFingerprint =
    ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT,
) {
  return {
    schemaVersion: 1 as const,
    policyFingerprint,
    diagnostics: RUNTIME_DIAGNOSTICS,
    goldenRoutePassCount: 20,
    goldenRouteTotalCount: 20,
    topologyReceiptIds,
  }
}

const ENHANCED_SOURCE_ID = 'vegagerdin:layer-6:section-10:road-part-1:road-part-number-1'

function enhancedPayload(
  topologyReceiptIds: string[] = [],
  policyFingerprint: RoadGraphRuntimeBuildPolicyFingerprint =
    ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT,
) {
  return {
    ...PAYLOAD,
    runtimeBuildContract: runtimeBuildContract(topologyReceiptIds, policyFingerprint),
    segments: [{
      ...PAYLOAD.segments[0],
      id: `${ENHANCED_SOURCE_ID}:geometry-0`,
      sourceId: ENHANCED_SOURCE_ID,
      directionStatus: 'authoritative_both' as const,
      networkRole: 'assessment_public' as const,
      official: {
        provider: 'vegagerdin' as const,
        sourceLayerId: 6 as const,
        sourceObjectId: 1,
        sectionId: 10,
        sectionNumber: '01',
        sectionStartLabel: 'A',
        sectionEndLabel: 'B',
        roadPartCode: 1,
        roadPartNumber: '1',
        ownerCode: 0,
        roadClassCode: 1,
        directionCode: 2,
        directionFieldState: 'integer' as const,
        inUseFromEpochMs: 0,
        outOfUseAtEpochMs: Date.parse('9999-12-31T00:00:00.000Z'),
      },
    }],
  }
}

function metadata(id = 'snapshot-1', validation: Record<string, unknown> = {}) {
  return {
    id,
    schemaVersion: 1,
    payloadSha256: 'hash',
    sourceContentSha256: 'source-hash',
    storageBucket: 'teskeid-road-graph-snapshots',
    storagePath: `v1/${id}.json.gz`,
    payloadBytes: 123,
    compressedBytes: 80,
    sourceFetchedAtIso: PAYLOAD.sourceFetchedAtIso,
    segmentCount: 1,
    nodeCount: 2,
    edgeCount: 2,
    weakComponentCount: 1,
    largestWeakComponentNodeCount: 2,
    goldenRoutePassCount: 20,
    goldenRouteTotalCount: 20,
    validation,
    promotedAtIso: '2026-07-26T15:01:00.000Z',
  }
}

describe('road graph last-known-good runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetIcelandRoadGraphCacheForTests()
    mockBuildGraph.mockReturnValue({ graph: true })
    mockAnalyzeGraph.mockReturnValue(RUNTIME_DIAGNOSTICS)
    mockHashPayload.mockReturnValue('hash')
    mockPayloadBytes.mockReturnValue(123)
    mockReconcileTopology.mockReturnValue({
      policyId: 'vegagerdin-attested-section-junctions-v2',
      candidates: [], receipts: [], bindings: [], topologySegmentCount: 0,
    })
    mockReadPayload.mockResolvedValue(PAYLOAD)
    mockReadMetadata.mockResolvedValue(metadata())
  })

  it('shares one snapshot materialisation across concurrent cold requests', async () => {
    expect(getIcelandRoadGraphCacheStatus()).toBe('cold')
    const first = getIcelandRoadGraph()
    expect(getIcelandRoadGraphCacheStatus()).toBe('loading')
    const second = getIcelandRoadGraph()

    await expect(first).resolves.toEqual({ graph: true })
    await expect(second).resolves.toEqual({ graph: true })
    expect(mockReadPayload).toHaveBeenCalledOnce()
    expect(mockBuildGraph).toHaveBeenCalledOnce()
    expect(getIcelandRoadGraphCacheStatus()).toBe('warm')
  })

  it('derives official topology receipts inside the active runtime build', async () => {
    const binding = { receipt: { id: 'receipt-1' } }
    mockReconcileTopology.mockReturnValue({
      policyId: 'vegagerdin-attested-section-junctions-v2',
      candidates: [], receipts: [binding.receipt], bindings: [binding], topologySegmentCount: 2,
    })
    const payload = enhancedPayload(['receipt-1'])
    mockReadPayload.mockResolvedValue(payload)
    mockReadMetadata.mockResolvedValue(metadata('snapshot-enhanced', {
      runtimeBuildContract: payload.runtimeBuildContract,
    }))
    mockBuildGraph.mockReturnValue({ graph: true, topologyReceiptIds: ['receipt-1'] })

    await getIcelandRoadGraph()

    expect(mockReconcileTopology).toHaveBeenCalledWith(expect.objectContaining({
      segments: payload.segments,
      nodeSnapToleranceM: 20,
      policyId: 'vegagerdin-attested-section-junctions-v2',
      artifact: expect.objectContaining({ contentSha256: 'source-hash' }),
    }))
    expect(mockBuildGraph).toHaveBeenCalledWith(payload.segments, expect.objectContaining({
      nodeSnapToleranceM: 20,
      missingDirectionPolicy: 'provisional_bidirectional',
      topologyReconciliation: {
        bindings: [binding],
        invalidBindingBehavior: 'throw',
      },
    }))
  })

  it('cold-loads a retained reciprocal-v1 snapshot with its original topology policy', async () => {
    const payload = enhancedPayload([], ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_RECIPROCAL_V1)
    mockReadPayload.mockResolvedValue(payload)
    mockReadMetadata.mockResolvedValue(metadata('snapshot-reciprocal-v1', {
      runtimeBuildContract: payload.runtimeBuildContract,
    }))

    await getIcelandRoadGraph()

    expect(mockReconcileTopology).toHaveBeenCalledWith(expect.objectContaining({
      policyId: 'vegagerdin-reciprocal-section-endpoints-v1',
    }))
  })

  it('reuses the verified in-process graph without another database read', async () => {
    await getIcelandRoadGraph()
    await getIcelandRoadGraph()

    expect(mockReadPayload).toHaveBeenCalledOnce()
    expect(mockReadMetadata).toHaveBeenCalledOnce()
  })

  it('discards a graph retained by Fast Refresh under an older materializer policy', async () => {
    const runtime = globalThis as typeof globalThis & {
      __teskeidRoadGraphRuntimeV2__?: unknown
    }
    runtime.__teskeidRoadGraphRuntimeV2__ = {
      policyFingerprint: 'stale-materializer-policy',
      cached: {
        graph: { stale: true },
        snapshotId: 'snapshot-stale',
        lastVersionCheckAt: Date.now(),
      },
      pending: null,
    }

    expect(getIcelandRoadGraphCacheStatus()).toBe('cold')
    await expect(getIcelandRoadGraph()).resolves.toEqual({ graph: true })
    expect(mockReadPayload).toHaveBeenCalledOnce()
    expect(mockBuildGraph).toHaveBeenCalledOnce()
  })

  it('checks only metadata on a forced version check when active ID is unchanged', async () => {
    await getIcelandRoadGraph()
    await getIcelandRoadGraph({ forceRefresh: true })

    expect(mockReadMetadata).toHaveBeenCalledTimes(2)
    expect(mockReadPayload).toHaveBeenCalledOnce()
    expect(mockBuildGraph).toHaveBeenCalledOnce()
  })

  it('loads and verifies a newly promoted snapshot', async () => {
    await getIcelandRoadGraph()
    mockReadMetadata.mockResolvedValue(metadata('snapshot-2'))

    await getIcelandRoadGraph({ forceRefresh: true })

    expect(mockReadPayload).toHaveBeenCalledTimes(2)
    expect(mockBuildGraph).toHaveBeenCalledTimes(2)
  })

  it('fails closed on a cold process when no active snapshot exists', async () => {
    mockReadMetadata.mockResolvedValue(null)
    await expect(getIcelandRoadGraph()).rejects.toThrow('road_graph_snapshot_missing')
  })

  it('keeps the already verified LKG graph when metadata lookup later fails', async () => {
    await getIcelandRoadGraph()
    mockReadMetadata.mockRejectedValue(new Error('database down'))
    await expect(getIcelandRoadGraph({ forceRefresh: true })).resolves.toEqual({ graph: true })
    await expect(getIcelandRoadGraph()).resolves.toEqual({ graph: true })
    expect(mockReadMetadata).toHaveBeenCalledTimes(2)
  })

  it('contains no live Vegagerðin source import in the user-facing runtime', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/iceland-routes/roadGraphRuntime.server.ts'),
      'utf8',
    )
    expect(source).not.toContain('vegagerdinRoadGraphSource.server')
    expect(source).not.toContain('fetchVegagerdinRoadGraphSegments')
  })
})
