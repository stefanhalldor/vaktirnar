import type { IcelandRoadGraphSegmentInput } from './roadGraphTypes'

export const ROAD_GRAPH_SNAPSHOT_SCHEMA_VERSION = 1
export const ROAD_GRAPH_NODE_SNAP_TOLERANCE_M = 20

export interface RoadGraphSnapshotPayloadV1 {
  schemaVersion: 1
  source: 'vegagerdin'
  sourceFetchedAtIso: string
  nodeSnapToleranceM: number
  segments: IcelandRoadGraphSegmentInput[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function optionalString(value: unknown, maxLength: number): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length > 0 && value.length <= maxLength)
}

function validSegment(value: unknown): value is IcelandRoadGraphSegmentInput {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || value.id.length === 0 || value.id.length > 300) return false
  if (value.source !== 'vegagerdin') return false
  if (typeof value.sourceId !== 'string' || value.sourceId.length === 0 || value.sourceId.length > 300) return false
  if (!['trunk', 'highland_trunk', 'connector', 'district', 'local', 'ferry', 'other'].includes(String(value.roadClass))) return false
  if (!['paved', 'gravel', 'mixed', 'unknown'].includes(String(value.surface))) return false
  if (!['both', 'forward', 'reverse'].includes(String(value.direction))) return false
  if (!optionalString(value.roadNumber, 80) || !optionalString(value.roadName, 300)) return false
  if (value.lengthM !== undefined && (typeof value.lengthM !== 'number' || !Number.isFinite(value.lengthM) || value.lengthM <= 0)) return false
  if (value.speedKmh !== undefined && (typeof value.speedKmh !== 'number' || !Number.isFinite(value.speedKmh) || value.speedKmh <= 0 || value.speedKmh > 200)) return false
  if (value.speedSource !== undefined && !['official', 'derived'].includes(String(value.speedSource))) return false
  for (const key of ['isFRoad', 'isMountainRoad', 'isSeasonal'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') return false
  }
  if (!Array.isArray(value.geometry) || value.geometry.length < 2 || value.geometry.length > 100_000) return false
  return value.geometry.every(point => (
    isRecord(point)
    && typeof point.lat === 'number'
    && Number.isFinite(point.lat)
    && point.lat >= 62
    && point.lat <= 68
    && typeof point.lon === 'number'
    && Number.isFinite(point.lon)
    && point.lon >= -26
    && point.lon <= -12
  ))
}

export function parseRoadGraphSnapshotPayload(value: unknown): RoadGraphSnapshotPayloadV1 | null {
  if (!isRecord(value)) return null
  if (value.schemaVersion !== ROAD_GRAPH_SNAPSHOT_SCHEMA_VERSION) return null
  if (value.source !== 'vegagerdin') return null
  if (typeof value.sourceFetchedAtIso !== 'string' || !Number.isFinite(Date.parse(value.sourceFetchedAtIso))) return null
  if (value.nodeSnapToleranceM !== ROAD_GRAPH_NODE_SNAP_TOLERANCE_M) return null
  if (!Array.isArray(value.segments) || value.segments.length === 0 || value.segments.length > 50_000) return null
  if (!value.segments.every(validSegment)) return null
  return value as unknown as RoadGraphSnapshotPayloadV1
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isRecord(value)) return value
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    const item = value[key]
    if (item !== undefined) result[key] = canonicalize(item)
  }
  return result
}

export function canonicalRoadGraphSnapshotValueJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

export function canonicalRoadGraphSnapshotJson(payload: RoadGraphSnapshotPayloadV1): string {
  return canonicalRoadGraphSnapshotValueJson(payload)
}
