import 'server-only'

import { createHash } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import { getAdmin } from '@/lib/supabase/admin'
import type { IcelandRoadGraphDiagnostics } from './roadGraphTypes'
import type { IcelandGoldenRouteAudit } from './goldenRoutes'
import {
  canonicalRoadGraphSnapshotJson,
  canonicalRoadGraphSnapshotValueJson,
  type RoadGraphSnapshotPayloadV1,
} from './roadGraphSnapshotFormat'

const TABLE = 'teskeid_road_graph_snapshots'
export const ROAD_GRAPH_SNAPSHOT_BUCKET = 'teskeid-road-graph-snapshots'
const MAX_UNCOMPRESSED_PAYLOAD_BYTES = 100 * 1024 * 1024

export type RoadGraphSnapshotTrigger = 'cron' | 'admin'

export interface ActiveRoadGraphSnapshotMetadata {
  id: string
  schemaVersion: number
  payloadSha256: string
  sourceContentSha256: string
  storageBucket: string
  storagePath: string
  payloadBytes: number
  compressedBytes: number
  sourceFetchedAtIso: string
  segmentCount: number
  nodeCount: number
  edgeCount: number
  weakComponentCount: number
  largestWeakComponentNodeCount: number
  goldenRoutePassCount: number
  goldenRouteTotalCount: number
  validation: Record<string, unknown>
  promotedAtIso: string
}

type SnapshotRow = {
  id: string
  schema_version: number
  storage_bucket: string
  storage_path: string
  payload_sha256: string
  source_content_sha256: string
  payload_bytes: number
  compressed_bytes: number
  source_fetched_at: string
  segment_count: number
  node_count: number
  edge_count: number
  weak_component_count: number
  largest_weak_component_node_count: number
  golden_route_pass_count: number
  golden_route_total_count: number
  validation: Record<string, unknown>
  promoted_at: string
}

function toMetadata(row: SnapshotRow): ActiveRoadGraphSnapshotMetadata {
  return {
    id: row.id,
    schemaVersion: row.schema_version,
    payloadSha256: row.payload_sha256,
    sourceContentSha256: row.source_content_sha256,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    payloadBytes: row.payload_bytes,
    compressedBytes: row.compressed_bytes,
    sourceFetchedAtIso: row.source_fetched_at,
    segmentCount: row.segment_count,
    nodeCount: row.node_count,
    edgeCount: row.edge_count,
    weakComponentCount: row.weak_component_count,
    largestWeakComponentNodeCount: row.largest_weak_component_node_count,
    goldenRoutePassCount: row.golden_route_pass_count,
    goldenRouteTotalCount: row.golden_route_total_count,
    validation: row.validation,
    promotedAtIso: row.promoted_at,
  }
}

const METADATA_COLUMNS = [
  'id', 'schema_version', 'storage_bucket', 'storage_path', 'payload_sha256',
  'source_content_sha256', 'payload_bytes', 'compressed_bytes', 'source_fetched_at',
  'segment_count', 'node_count', 'edge_count', 'weak_component_count',
  'largest_weak_component_node_count', 'golden_route_pass_count',
  'golden_route_total_count', 'validation', 'promoted_at',
].join(', ')

export function hashRoadGraphSnapshotPayload(payload: RoadGraphSnapshotPayloadV1): string {
  return createHash('sha256').update(canonicalRoadGraphSnapshotJson(payload)).digest('hex')
}

export function roadGraphSnapshotPayloadBytes(payload: RoadGraphSnapshotPayloadV1): number {
  return Buffer.byteLength(canonicalRoadGraphSnapshotJson(payload), 'utf8')
}

export function hashRoadGraphSnapshotSegments(segments: RoadGraphSnapshotPayloadV1['segments']): string {
  return createHash('sha256').update(canonicalRoadGraphSnapshotValueJson(segments)).digest('hex')
}

export async function beginRoadGraphSnapshotRefresh(triggeredBy: RoadGraphSnapshotTrigger): Promise<string | null> {
  const { data, error } = await getAdmin().rpc('begin_teskeid_road_graph_refresh', {
    p_triggered_by: triggeredBy,
  })
  if (error) throw new Error('snapshot_refresh_claim_failed')
  return typeof data === 'string' && data.length > 0 ? data : null
}

export async function readActiveRoadGraphSnapshotMetadata(): Promise<ActiveRoadGraphSnapshotMetadata | null> {
  const { data, error } = await getAdmin()
    .from(TABLE)
    .select(METADATA_COLUMNS)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw new Error('snapshot_metadata_read_failed')
  return data ? toMetadata(data as unknown as SnapshotRow) : null
}

export async function readRoadGraphSnapshotPayload(
  metadata: ActiveRoadGraphSnapshotMetadata,
): Promise<unknown> {
  if (metadata.storageBucket !== ROAD_GRAPH_SNAPSHOT_BUCKET || !metadata.storagePath) {
    throw new Error('snapshot_storage_pointer_invalid')
  }
  const { data, error } = await getAdmin()
    .storage
    .from(metadata.storageBucket)
    .download(metadata.storagePath)
  if (error || !data) throw new Error('snapshot_storage_download_failed')
  const compressed = Buffer.from(await data.arrayBuffer())
  if (compressed.byteLength !== metadata.compressedBytes) {
    throw new Error('snapshot_compressed_size_mismatch')
  }
  let json: Buffer
  try {
    json = gunzipSync(compressed, { maxOutputLength: MAX_UNCOMPRESSED_PAYLOAD_BYTES })
  } catch {
    throw new Error('snapshot_decompression_failed')
  }
  if (json.byteLength !== metadata.payloadBytes) throw new Error('snapshot_size_mismatch')
  if (createHash('sha256').update(json).digest('hex') !== metadata.payloadSha256) {
    throw new Error('snapshot_hash_mismatch')
  }
  try {
    return JSON.parse(json.toString('utf8')) as unknown
  } catch {
    throw new Error('snapshot_json_invalid')
  }
}

export async function stageRoadGraphSnapshot(input: {
  id: string
  payload: RoadGraphSnapshotPayloadV1
  diagnostics: IcelandRoadGraphDiagnostics
  goldenRoutes: readonly IcelandGoldenRouteAudit[]
  validation: Record<string, unknown>
  sourceContentSha256: string
}): Promise<void> {
  const passed = input.goldenRoutes.filter(route => route.status === 'ok').length
  const payloadSha256 = hashRoadGraphSnapshotPayload(input.payload)
  const canonicalJson = canonicalRoadGraphSnapshotJson(input.payload)
  const payloadBytes = Buffer.byteLength(canonicalJson, 'utf8')
  const compressed = gzipSync(Buffer.from(canonicalJson, 'utf8'), { level: 9 })
  const storagePath = `v${input.payload.schemaVersion}/${input.id}.json.gz`
  const admin = getAdmin()
  const { data: registered, error: registerError } = await admin
    .from(TABLE)
    .update({
      storage_bucket: ROAD_GRAPH_SNAPSHOT_BUCKET,
      storage_path: storagePath,
    })
    .eq('id', input.id)
    .eq('status', 'building')
    .select('id')
    .maybeSingle()
  if (registerError || !registered) throw new Error('snapshot_storage_register_failed')
  const { error: uploadError } = await admin.storage
    .from(ROAD_GRAPH_SNAPSHOT_BUCKET)
    .upload(storagePath, compressed, {
      contentType: 'application/gzip',
      upsert: false,
      cacheControl: '31536000',
    })
  if (uploadError) throw new Error('snapshot_storage_upload_failed')
  const { data, error } = await admin
    .from(TABLE)
    .update({
      status: 'ready',
      schema_version: input.payload.schemaVersion,
      storage_bucket: ROAD_GRAPH_SNAPSHOT_BUCKET,
      storage_path: storagePath,
      payload_sha256: payloadSha256,
      source_content_sha256: input.sourceContentSha256,
      payload_bytes: payloadBytes,
      compressed_bytes: compressed.byteLength,
      source_fetched_at: input.payload.sourceFetchedAtIso,
      segment_count: input.diagnostics.segmentCount,
      node_count: input.diagnostics.nodeCount,
      edge_count: input.diagnostics.edgeCount,
      weak_component_count: input.diagnostics.weakComponentCount,
      largest_weak_component_node_count: input.diagnostics.largestWeakComponentNodeCount,
      golden_route_pass_count: passed,
      golden_route_total_count: input.goldenRoutes.length,
      validation: input.validation,
      failure_code: null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', input.id)
    .eq('status', 'building')
    .select('id')
    .maybeSingle()
  if (error || !data) {
    await admin.storage.from(ROAD_GRAPH_SNAPSHOT_BUCKET).remove([storagePath]).catch(() => undefined)
    throw new Error('snapshot_stage_failed')
  }
}

export async function completeUnchangedRoadGraphRefresh(input: {
  id: string
  sourceFetchedAtIso: string
  sourceContentSha256: string
  activeSnapshotId: string
}): Promise<void> {
  const { data, error } = await getAdmin()
    .from(TABLE)
    .update({
      status: 'unchanged',
      source_fetched_at: input.sourceFetchedAtIso,
      source_content_sha256: input.sourceContentSha256,
      failure_code: 'source_unchanged',
      validation: { activeSnapshotId: input.activeSnapshotId },
      finished_at: new Date().toISOString(),
    })
    .eq('id', input.id)
    .eq('status', 'building')
    .select('id')
    .maybeSingle()
  if (error || !data) throw new Error('snapshot_unchanged_write_failed')
}

export async function promoteRoadGraphSnapshot(id: string): Promise<void> {
  const { data, error } = await getAdmin().rpc('promote_teskeid_road_graph_snapshot', {
    p_snapshot_id: id,
  })
  if (error || data !== true) throw new Error('snapshot_promote_failed')
}

export async function failRoadGraphSnapshot(
  id: string,
  failureCode: string,
  validation: Record<string, unknown> = {},
): Promise<void> {
  const safeFailureCode = failureCode.replace(/[^a-z0-9_]/gi, '_').slice(0, 120) || 'refresh_failed'
  const admin = getAdmin()
  const { data: row } = await admin
    .from(TABLE)
    .select('storage_bucket, storage_path')
    .eq('id', id)
    .maybeSingle()
  await admin
    .from(TABLE)
    .update({
      status: 'failed',
      failure_code: safeFailureCode,
      validation,
      finished_at: new Date().toISOString(),
    })
    .eq('id', id)
    .in('status', ['building', 'ready'])
  const storageRow = row as { storage_bucket?: string; storage_path?: string } | null
  if (storageRow?.storage_bucket === ROAD_GRAPH_SNAPSHOT_BUCKET && storageRow.storage_path) {
    await admin.storage.from(ROAD_GRAPH_SNAPSHOT_BUCKET).remove([storageRow.storage_path]).catch(() => undefined)
  }
}

export async function pruneRoadGraphSnapshotHistory(retiredToKeep = 2): Promise<void> {
  const admin = getAdmin()
  const { data: retired } = await admin
    .from(TABLE)
    .select('id, storage_bucket, storage_path')
    .eq('status', 'retired')
    .order('promoted_at', { ascending: false })
  const expiredRetired = Array.isArray(retired) ? retired.slice(retiredToKeep) : []
  const retiredIds = expiredRetired.map(row => String(row.id))
  const storagePaths = expiredRetired
    .filter(row => row.storage_bucket === ROAD_GRAPH_SNAPSHOT_BUCKET && typeof row.storage_path === 'string')
    .map(row => String(row.storage_path))
  if (storagePaths.length > 0) {
    const { error } = await admin.storage.from(ROAD_GRAPH_SNAPSHOT_BUCKET).remove(storagePaths)
    if (error) return
  }
  if (retiredIds.length > 0) await admin.from(TABLE).delete().in('id', retiredIds)

  const historyCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  for (const status of ['failed', 'unchanged'] as const) {
    const { data: expired } = await admin
      .from(TABLE)
      .select('id, storage_bucket, storage_path')
      .eq('status', status)
      .lt('finished_at', historyCutoff)
    const rows = Array.isArray(expired) ? expired : []
    const paths = rows
      .filter(row => row.storage_bucket === ROAD_GRAPH_SNAPSHOT_BUCKET && typeof row.storage_path === 'string')
      .map(row => String(row.storage_path))
    if (paths.length > 0) {
      const { error } = await admin.storage.from(ROAD_GRAPH_SNAPSHOT_BUCKET).remove(paths)
      if (error) continue
    }
    const ids = rows.map(row => String(row.id))
    if (ids.length > 0) await admin.from(TABLE).delete().in('id', ids)
  }
}
