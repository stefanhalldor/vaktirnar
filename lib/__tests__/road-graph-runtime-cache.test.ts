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
} = vi.hoisted(() => ({
  mockBuildGraph: vi.fn(),
  mockAnalyzeGraph: vi.fn(),
  mockReadMetadata: vi.fn(),
  mockReadPayload: vi.fn(),
  mockHashPayload: vi.fn(),
  mockPayloadBytes: vi.fn(),
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

import {
  getIcelandRoadGraph,
  resetIcelandRoadGraphCacheForTests,
} from '@/lib/iceland-routes/roadGraphRuntime.server'

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

function metadata(id = 'snapshot-1') {
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
    promotedAtIso: '2026-07-26T15:01:00.000Z',
  }
}

describe('road graph last-known-good runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetIcelandRoadGraphCacheForTests()
    mockBuildGraph.mockReturnValue({ graph: true })
    mockAnalyzeGraph.mockReturnValue({
      segmentCount: 1, nodeCount: 2, edgeCount: 2, weakComponentCount: 1,
      largestWeakComponentNodeCount: 2,
    })
    mockHashPayload.mockReturnValue('hash')
    mockPayloadBytes.mockReturnValue(123)
    mockReadPayload.mockResolvedValue(PAYLOAD)
    mockReadMetadata.mockResolvedValue(metadata())
  })

  it('shares one snapshot materialisation across concurrent cold requests', async () => {
    const first = getIcelandRoadGraph()
    const second = getIcelandRoadGraph()

    await expect(first).resolves.toEqual({ graph: true })
    await expect(second).resolves.toEqual({ graph: true })
    expect(mockReadPayload).toHaveBeenCalledOnce()
    expect(mockBuildGraph).toHaveBeenCalledOnce()
  })

  it('reuses the verified in-process graph without another database read', async () => {
    await getIcelandRoadGraph()
    await getIcelandRoadGraph()

    expect(mockReadPayload).toHaveBeenCalledOnce()
    expect(mockReadMetadata).toHaveBeenCalledOnce()
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
