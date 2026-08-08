import 'server-only'
import { getAdmin } from '@/lib/supabase/admin'
import { getOrCreateThread, postMessage } from '@/lib/chat/repository.server'
import type {
  CreateMapNoteInput,
  MapNoteDto,
  MapNoteSourceContext,
  PrivateTeskeidFeedbackDto,
} from './contracts'

const MAP_DOMAIN = 'map' as const
const COMMUNITY_TARGET = {
  domain: MAP_DOMAIN,
  targetType: 'map_community' as const,
  targetId: 'iceland-community-v1',
  targetName: 'Samfélagsathugasemdir á Íslandi',
}
const FEEDBACK_TARGET = {
  domain: MAP_DOMAIN,
  targetType: 'teskeid_feedback' as const,
  targetId: 'iceland-feedback-v1',
  targetName: 'Einkarábendingar til Teskeiðar',
}

type MapMessageRow = {
  id: string
  user_id: string
  body: string
  created_at: string
  deleted_at: string | null
  hidden_at: string | null
  metadata: Record<string, unknown> | null
  anchor_lat: number | null
  anchor_lon: number | null
}

function firstName(value: string | null | undefined): string | null {
  const cleaned = value?.trim()
  return cleaned ? cleaned.split(/\s+/)[0] : null
}

async function profileNames(userIds: string[]): Promise<Map<string, string | null>> {
  if (userIds.length === 0) return new Map()
  const { data } = await getAdmin().from('profiles').select('id, display_name').in('id', userIds)
  return new Map((data ?? []).map((row: any) => [row.id, row.display_name ?? null]))
}

function sourceContext(metadata: Record<string, unknown> | null): MapNoteSourceContext {
  return metadata?.sourceContext === 'route_choice' || metadata?.sourceContext === 'free_drive'
    ? metadata.sourceContext
    : 'map'
}

function toCommunityDto(row: MapMessageRow, names: Map<string, string | null>): MapNoteDto | null {
  if (row.deleted_at || row.hidden_at) return null
  const locationMode = row.metadata?.locationMode === 'general' ? 'general' : 'anchored'
  if (locationMode === 'anchored' && (row.anchor_lat === null || row.anchor_lon === null)) return null
  const anchorLabel = typeof row.metadata?.anchorLabel === 'string' ? row.metadata.anchorLabel : undefined
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    latestAt: row.created_at,
    authorName: firstName(names.get(row.user_id)),
    anchor: row.anchor_lat !== null && row.anchor_lon !== null ? {
      lat: row.anchor_lat,
      lon: row.anchor_lon,
      ...(anchorLabel ? { label: anchorLabel } : {}),
    } : null,
    locationMode,
    sourceContext: sourceContext(row.metadata),
  }
}

async function findThreadId(targetType: 'map_community' | 'teskeid_feedback'): Promise<string | null> {
  const { data, error } = await getAdmin()
    .from('teskeid_chat_threads')
    .select('id')
    .eq('domain', MAP_DOMAIN)
    .eq('target_type', targetType)
    .eq('target_id', targetType === 'map_community' ? COMMUNITY_TARGET.targetId : FEEDBACK_TARGET.targetId)
    .maybeSingle()
  if (error) throw new Error('map-notes: thread lookup failed')
  return data?.id ?? null
}

export async function listCommunityMapNotes(options: {
  search: string
  sinceHours: number
  limit?: number
}): Promise<MapNoteDto[]> {
  const threadId = await findThreadId('map_community')
  if (!threadId) return []
  const since = new Date(Date.now() - options.sinceHours * 60 * 60 * 1000).toISOString()
  const { data, error } = await getAdmin()
    .from('teskeid_chat_messages')
    .select('id, user_id, body, created_at, deleted_at, hidden_at, metadata, anchor_lat, anchor_lon')
    .eq('thread_id', threadId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 150))
  if (error) throw new Error('map-notes: community list failed')
  const rows = (data ?? []) as MapMessageRow[]
  const names = await profileNames([...new Set(rows.map(row => row.user_id))])
  const needle = options.search.toLocaleLowerCase('is')
  return rows
    .map(row => toCommunityDto(row, names))
    .filter((row): row is MapNoteDto => row !== null)
    .filter(row => !needle || `${row.body} ${row.anchor?.label ?? ''}`.toLocaleLowerCase('is').includes(needle))
}

export async function listOwnTeskeidFeedback(userId: string, limit = 50): Promise<PrivateTeskeidFeedbackDto[]> {
  const threadId = await findThreadId('teskeid_feedback')
  if (!threadId) return []
  const { data, error } = await getAdmin()
    .from('teskeid_chat_messages')
    .select('id, user_id, body, created_at, deleted_at, hidden_at, metadata, anchor_lat, anchor_lon')
    .eq('thread_id', threadId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100))
  if (error) throw new Error('map-notes: feedback list failed')
  const rows = (data ?? []) as MapMessageRow[]
  const names = await profileNames([userId])
  return rows.filter(row => !row.deleted_at && !row.hidden_at).map(row => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    latestAt: row.created_at,
    authorName: firstName(names.get(userId)),
    anchor: row.anchor_lat !== null && row.anchor_lon !== null
      ? {
          lat: row.anchor_lat,
          lon: row.anchor_lon,
          ...(typeof row.metadata?.anchorLabel === 'string' ? { label: row.metadata.anchorLabel } : {}),
        }
      : null,
    locationMode: row.anchor_lat !== null ? 'anchored' : 'general',
    sourceContext: sourceContext(row.metadata),
    routeContext: row.metadata?.routeContext && typeof row.metadata.routeContext === 'object'
      ? row.metadata.routeContext as PrivateTeskeidFeedbackDto['routeContext']
      : null,
  }))
}

export async function createMapNote(userId: string, input: CreateMapNoteInput): Promise<MapNoteDto> {
  const target = input.kind === 'community' ? COMMUNITY_TARGET : FEEDBACK_TARGET
  const thread = await getOrCreateThread(target)
  const metadata = {
    schemaVersion: 1,
    sourceContext: input.sourceContext,
    locationMode: input.locationMode,
    ...(input.anchor?.label ? { anchorLabel: input.anchor.label } : {}),
    ...(input.kind === 'teskeid_feedback' && input.routeContext
      ? { routeContext: input.routeContext }
      : {}),
  }
  const message = await postMessage(
    thread.id,
    userId,
    {
      body: input.body,
      messageKind: input.kind === 'community' ? 'map_note' : 'teskeid_feedback',
      metadata,
      anchorLat: input.anchor?.lat ?? null,
      anchorLon: input.anchor?.lon ?? null,
    },
    {
      clientMessageId: input.clientMessageId,
      idempotencyKey: input.idempotencyKey,
      authorNameMode: input.kind === 'community' ? 'first' : 'full',
    },
  )
  return {
    ...message,
    latestAt: message.createdAt,
    anchor: input.anchor,
    locationMode: input.locationMode,
    sourceContext: input.sourceContext,
  }
}
