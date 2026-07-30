import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gzipSync } from 'node:zlib'

const { mockGetAdmin } = vi.hoisted(() => ({ mockGetAdmin: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))

import {
  hashRoadGraphSnapshotPayload,
  readRoadGraphSnapshotPayload,
  ROAD_GRAPH_SNAPSHOT_BUCKET,
} from '@/lib/iceland-routes/roadGraphSnapshotStore.server'
import { canonicalRoadGraphSnapshotJson, type RoadGraphSnapshotPayloadV1 } from '@/lib/iceland-routes/roadGraphSnapshotFormat'

const PAYLOAD: RoadGraphSnapshotPayloadV1 = {
  schemaVersion: 1,
  source: 'vegagerdin',
  sourceFetchedAtIso: '2026-07-26T15:00:00.000Z',
  nodeSnapToleranceM: 20,
  segments: [{
    id: '1', source: 'vegagerdin', sourceId: '1',
    geometry: [{ lat: 64, lon: -22 }, { lat: 65, lon: -21 }],
    roadClass: 'trunk', surface: 'paved', direction: 'both',
  }],
}

function metadata(compressed: Buffer) {
  const json = Buffer.from(canonicalRoadGraphSnapshotJson(PAYLOAD), 'utf8')
  return {
    id: 'snapshot-1', schemaVersion: 1,
    payloadSha256: hashRoadGraphSnapshotPayload(PAYLOAD),
    sourceContentSha256: 'a'.repeat(64),
    storageBucket: ROAD_GRAPH_SNAPSHOT_BUCKET,
    storagePath: 'v1/snapshot-1.json.gz',
    payloadBytes: json.byteLength,
    compressedBytes: compressed.byteLength,
    sourceFetchedAtIso: PAYLOAD.sourceFetchedAtIso,
    segmentCount: 1, nodeCount: 2, edgeCount: 2, weakComponentCount: 1,
    largestWeakComponentNodeCount: 2,
    goldenRoutePassCount: 20, goldenRouteTotalCount: 20,
    validation: {},
    promotedAtIso: '2026-07-26T15:01:00.000Z',
  }
}

describe('road graph snapshot Storage reader', () => {
  let compressed: Buffer
  let download: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    compressed = gzipSync(Buffer.from(canonicalRoadGraphSnapshotJson(PAYLOAD), 'utf8'))
    download = vi.fn().mockResolvedValue({
      data: new Blob([Uint8Array.from(compressed)], { type: 'application/gzip' }),
      error: null,
    })
    mockGetAdmin.mockReturnValue({
      storage: { from: vi.fn(() => ({ download })) },
    })
  })

  it('downloads, bounds, decompresses and hashes the private immutable object', async () => {
    await expect(readRoadGraphSnapshotPayload(metadata(compressed))).resolves.toEqual(PAYLOAD)
    expect(download).toHaveBeenCalledWith('v1/snapshot-1.json.gz')
  })

  it('rejects an unexpected bucket before making a Storage request', async () => {
    await expect(readRoadGraphSnapshotPayload({
      ...metadata(compressed), storageBucket: 'public-files',
    })).rejects.toThrow('snapshot_storage_pointer_invalid')
    expect(mockGetAdmin).not.toHaveBeenCalled()
  })

  it('rejects compressed-size and payload-hash mismatches', async () => {
    await expect(readRoadGraphSnapshotPayload({
      ...metadata(compressed), compressedBytes: compressed.byteLength + 1,
    })).rejects.toThrow('snapshot_compressed_size_mismatch')

    await expect(readRoadGraphSnapshotPayload({
      ...metadata(compressed), payloadSha256: '0'.repeat(64),
    })).rejects.toThrow('snapshot_hash_mismatch')
  })
})
