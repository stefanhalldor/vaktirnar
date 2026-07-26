import { describe, expect, it } from 'vitest'
import {
  canonicalRoadGraphSnapshotJson,
  canonicalRoadGraphSnapshotValueJson,
  parseRoadGraphSnapshotPayload,
  type RoadGraphSnapshotPayloadV1,
} from '@/lib/iceland-routes/roadGraphSnapshotFormat'

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

describe('road graph snapshot payload', () => {
  it('accepts a bounded schema-v1 Vegagerðin payload', () => {
    expect(parseRoadGraphSnapshotPayload(PAYLOAD)).toEqual(PAYLOAD)
  })

  it('rejects unsupported schema versions and coordinates outside Iceland', () => {
    expect(parseRoadGraphSnapshotPayload({ ...PAYLOAD, schemaVersion: 2 })).toBeNull()
    expect(parseRoadGraphSnapshotPayload({
      ...PAYLOAD,
      segments: [{ ...PAYLOAD.segments[0], geometry: [{ lat: 40, lon: -22 }, { lat: 65, lon: -21 }] }],
    })).toBeNull()
  })

  it('canonicalizes object key order without changing array order', () => {
    const reordered = {
      segments: PAYLOAD.segments,
      nodeSnapToleranceM: 20,
      sourceFetchedAtIso: PAYLOAD.sourceFetchedAtIso,
      source: 'vegagerdin',
      schemaVersion: 1,
    } as RoadGraphSnapshotPayloadV1
    expect(canonicalRoadGraphSnapshotJson(reordered)).toBe(canonicalRoadGraphSnapshotJson(PAYLOAD))
    expect(canonicalRoadGraphSnapshotValueJson([{ b: 2, a: 1 }]))
      .toBe(canonicalRoadGraphSnapshotValueJson([{ a: 1, b: 2 }]))
  })
})
