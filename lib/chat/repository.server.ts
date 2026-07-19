import 'server-only'
import { getAdmin } from '@/lib/supabase/admin'
import type {
  ChatTargetType,
  ChatThreadTarget,
  ThreadDto,
  MessageDto,
  FeedMessageDto,
  ThreadSummaryDto,
  ConditionFeedPreviewItemDto,
  CreateMessageInput,
  ReportMessageInput,
} from './types'

// ── Row → DTO helpers ─────────────────────────────────────────────────────────

function toThreadDto(row: any): ThreadDto {
  return {
    id: row.id,
    domain: row.domain,
    targetType: row.target_type,
    targetId: row.target_id,
    targetName: row.target_name,
    lat: row.lat ?? null,
    lon: row.lon ?? null,
    lastMessageAt: row.last_message_at ?? null,
    messageCount: row.message_count,
  }
}

function toPublicFirstName(displayName: string | null): string | null {
  if (!displayName) return null
  const first = displayName.trim().split(/\s+/)[0]
  return first || null
}

function toMessageDto(row: any, profileMap: Map<string, string | null> = new Map()): MessageDto {
  const isDeleted = !!row.deleted_at
  const isHidden = !!row.hidden_at
  return {
    id: row.id,
    threadId: row.thread_id,
    // Never expose body text if deleted or hidden — replace with empty string.
    body: isDeleted || isHidden ? '' : (row.body as string),
    messageKind: row.message_kind,
    createdAt: row.created_at,
    isDeleted,
    isHidden,
    authorName: row.user_id ? toPublicFirstName(profileMap.get(row.user_id) ?? null) : null,
  }
}

/**
 * Fetches display_name for a set of user IDs from the profiles table.
 * Returns an empty map (and never throws) so callers degrade gracefully to authorName: null.
 */
async function fetchProfileMap(userIds: string[]): Promise<Map<string, string | null>> {
  if (userIds.length === 0) return new Map()
  try {
    const admin = getAdmin()
    const { data } = await admin
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds)
    if (!data) return new Map()
    return new Map((data as any[]).map((p: any) => [p.id, p.display_name ?? null]))
  } catch {
    return new Map()
  }
}

// ── Repository ────────────────────────────────────────────────────────────────

const THREAD_SELECT = 'id, domain, target_type, target_id, target_name, lat, lon, last_message_at, message_count'

/**
 * Finds or creates a chat thread for the given stable target.
 * Safe to call on every page load — uses select-first to avoid ignoreDuplicates+single() data loss.
 *
 * Pattern: select → insert (if missing) → re-select on unique conflict (race condition).
 * Message count is never reset — only incremented by the DB trigger.
 */
export async function getOrCreateThread(target: ChatThreadTarget): Promise<ThreadDto> {
  const admin = getAdmin()

  // maybeSingle() returns { data: null, error: null } when no row is found.
  // Genuine DB errors return a non-null error and must throw, not silently fall through to insert.
  const byTarget = () =>
    admin
      .from('teskeid_chat_threads')
      .select(THREAD_SELECT)
      .eq('domain', target.domain)
      .eq('target_type', target.targetType)
      .eq('target_id', target.targetId)
      .maybeSingle()

  // 1. Try to find existing thread
  const { data: existing, error: selectError } = await byTarget()
  if (selectError) throw new Error('chat: getOrCreateThread failed')
  if (existing) return toThreadDto(existing)

  // 2. Try to insert
  const { data: inserted, error: insertError } = await admin
    .from('teskeid_chat_threads')
    .insert({
      domain: target.domain,
      target_type: target.targetType,
      target_id: target.targetId,
      provider: target.provider ?? null,
      target_name: target.targetName,
      lat: target.lat ?? null,
      lon: target.lon ?? null,
    })
    .select(THREAD_SELECT)
    .single()

  if (inserted) return toThreadDto(inserted)

  // 3. Unique conflict: another request created the thread between our select and insert.
  //    Re-select to return the existing thread.
  if (insertError?.code === '23505') {
    const { data: raceWinner, error: reSelectError } = await byTarget()
    if (reSelectError) throw new Error('chat: getOrCreateThread failed')
    if (raceWinner) return toThreadDto(raceWinner)
  }

  throw new Error('chat: getOrCreateThread failed')
}

/**
 * Lists the latest messages for a thread, returned oldest-first for display.
 * Fetches newest-first from the DB (so the limit captures current messages,
 * not historical ones) then reverses before returning.
 * Deleted and hidden messages are included but body is redacted in the DTO.
 */
export async function listMessages(
  threadId: string,
  opts?: { limit?: number; before?: string }
): Promise<MessageDto[]> {
  const admin = getAdmin()
  let query: any = admin
    .from('teskeid_chat_messages')
    .select('id, thread_id, user_id, body, message_kind, created_at, deleted_at, hidden_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 10)
  if (opts?.before) {
    query = query.lt('created_at', opts.before)
  }
  const { data, error } = await query
  if (error) throw new Error('chat: listMessages failed')
  // Reverse so the panel displays oldest-at-top within the fetched window.
  const rows = (data ?? []).reverse()
  const userIds = [...new Set<string>(rows.map((r: any) => r.user_id).filter(Boolean))]
  const profileMap = await fetchProfileMap(userIds)
  return rows.map((r: any) => toMessageDto(r, profileMap))
}

/**
 * Posts a message to a thread.
 * The DB trigger on teskeid_chat_messages handles message_count and
 * last_message_at on teskeid_chat_threads atomically.
 * Message body is never logged.
 */
export async function postMessage(
  threadId: string,
  userId: string,
  input: CreateMessageInput
): Promise<MessageDto> {
  const admin = getAdmin()
  const { data, error } = await admin
    .from('teskeid_chat_messages')
    .insert({
      thread_id: threadId,
      user_id: userId,
      body: input.body.trim(),
      message_kind: input.messageKind,
    })
    .select('id, thread_id, user_id, body, message_kind, created_at, deleted_at, hidden_at')
    .single()
  if (error || !data) throw new Error('chat: postMessage failed')
  const profileMap = await fetchProfileMap([userId])
  return toMessageDto(data, profileMap)
}

/**
 * Marks a thread as read up to a given message for a user.
 * Used for unread counts and "new pulse" affordances.
 */
export async function markRead(
  threadId: string,
  userId: string,
  lastReadMessageId: string
): Promise<void> {
  const admin = getAdmin()
  const { error } = await admin
    .from('teskeid_chat_read_cursors')
    .upsert({
      thread_id: threadId,
      user_id: userId,
      last_read_message_id: lastReadMessageId,
      last_read_at: new Date().toISOString(),
    })
  if (error) throw new Error('chat: markRead failed')
}

/**
 * Asserts that a thread exists and belongs to the expected domain/targetType scope.
 * Throws 'chat: not found' if the thread is absent or out of scope.
 * Callers should map this to 404 — same error for missing and out-of-scope
 * so we do not reveal whether a foreign thread exists.
 *
 * targetType accepts a single string or an array. Pass an array to allow
 * multiple target types (e.g. both vedurstofan_station and vegagerdin_station).
 */
export async function assertThreadScope(
  threadId: string,
  scope: { domain: string; targetType: string | string[] }
): Promise<void> {
  const admin = getAdmin()
  const types = Array.isArray(scope.targetType) ? scope.targetType : [scope.targetType]
  let query = admin
    .from('teskeid_chat_threads')
    .select('id')
    .eq('id', threadId)
    .eq('domain', scope.domain)
  const q = types.length === 1
    ? query.eq('target_type', types[0])
    : query.in('target_type', types)
  const { data, error } = await q.maybeSingle()
  if (error) throw new Error('chat: scope check failed')
  if (!data) throw new Error('chat: not found')
}

/**
 * Asserts that a message exists and its thread belongs to the expected scope.
 * Throws 'chat: not found' if the message is absent or out of scope.
 *
 * targetType accepts a single string or an array (same semantics as assertThreadScope).
 */
export async function assertMessageScope(
  messageId: string,
  scope: { domain: string; targetType: string | string[] }
): Promise<void> {
  const admin = getAdmin()
  const { data: msg, error: msgError } = await admin
    .from('teskeid_chat_messages')
    .select('thread_id')
    .eq('id', messageId)
    .maybeSingle()
  if (msgError) throw new Error('chat: scope check failed')
  if (!msg) throw new Error('chat: not found')
  const types = Array.isArray(scope.targetType) ? scope.targetType : [scope.targetType]
  let query = admin
    .from('teskeid_chat_threads')
    .select('id')
    .eq('id', msg.thread_id)
    .eq('domain', scope.domain)
  const q = types.length === 1
    ? query.eq('target_type', types[0])
    : query.in('target_type', types)
  const { data: thread, error: threadError } = await q.maybeSingle()
  if (threadError) throw new Error('chat: scope check failed')
  if (!thread) throw new Error('chat: not found')
}

/**
 * Marks an entire thread as read for a user at the current time.
 * Simpler than markRead — no message ID required from client.
 * The cursor timestamp is used for unread count calculation.
 */
export async function markThreadRead(threadId: string, userId: string): Promise<void> {
  const admin = getAdmin()
  const { error } = await admin
    .from('teskeid_chat_read_cursors')
    .upsert({
      thread_id: threadId,
      user_id: userId,
      last_read_message_id: null,
      last_read_at: new Date().toISOString(),
    })
  if (error) throw new Error('chat: markRead failed')
}

/**
 * Reports a message for moderation.
 * Throws 'chat: already reported' if the user has already reported this message.
 */
export async function reportMessage(
  messageId: string,
  reporterUserId: string,
  input: ReportMessageInput
): Promise<void> {
  const admin = getAdmin()
  const { error } = await admin
    .from('teskeid_chat_message_reports')
    .insert({
      message_id: messageId,
      reporter_user_id: reporterUserId,
      reason: input.reason,
      body: input.body ?? null,
    })
  if (error) {
    if (error.code === '23505') throw new Error('chat: already reported')
    throw new Error('chat: reportMessage failed')
  }
}

/**
 * Returns the latest messages across all threads matching the given domain + targetTypes,
 * ordered newest-first. Use the `before` cursor (ISO timestamp) to page older messages.
 * Includes target metadata (name, type, id) from the thread row so the UI
 * can display source labels without a second request.
 */
export async function getFeedMessages(
  scope: { domain: string; targetTypes: string[] },
  opts?: { limit?: number; before?: string }
): Promise<FeedMessageDto[]> {
  const admin = getAdmin()
  const limit = opts?.limit ?? 50

  // Step 1: Fetch threads matching scope to build a target metadata map.
  const { data: threads, error: threadsError } = await admin
    .from('teskeid_chat_threads')
    .select('id, domain, target_type, target_id, target_name, provider')
    .eq('domain', scope.domain)
    .in('target_type', scope.targetTypes)

  if (threadsError) throw new Error('chat: getFeedMessages failed')
  if (!threads || threads.length === 0) return []

  const threadMap = new Map<string, any>(threads.map((t: any) => [t.id, t]))
  const threadIds = threads.map((t: any) => t.id as string)

  // Step 2: Fetch messages from those threads, newest first.
  let query: any = admin
    .from('teskeid_chat_messages')
    .select('id, thread_id, user_id, body, message_kind, created_at, deleted_at, hidden_at')
    .in('thread_id', threadIds)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (opts?.before) {
    // `before` is an ISO timestamp — returns messages older than the cursor.
    query = query.lt('created_at', opts.before)
  }

  const { data: messages, error: messagesError } = await query
  if (messagesError) throw new Error('chat: getFeedMessages failed')

  const rows = messages ?? []
  const userIds = [...new Set<string>(rows.map((r: any) => r.user_id).filter(Boolean))]
  const profileMap = await fetchProfileMap(userIds)

  return rows.map((row: any): FeedMessageDto => {
    const thread = threadMap.get(row.thread_id)
    const isDeleted = !!row.deleted_at
    const isHidden = !!row.hidden_at
    return {
      id: row.id,
      threadId: row.thread_id,
      body: isDeleted || isHidden ? '' : (row.body as string),
      messageKind: row.message_kind,
      createdAt: row.created_at,
      isDeleted,
      isHidden,
      authorName: row.user_id ? toPublicFirstName(profileMap.get(row.user_id) ?? null) : null,
      target: {
        domain: thread.domain,
        targetType: thread.target_type,
        targetId: thread.target_id,
        targetName: thread.target_name,
        provider: thread.provider ?? null,
      },
    }
  })
}

/**
 * Returns a lightweight summary for a thread — for station card counts and route summaries.
 * If userId is provided, includes unread count relative to the user's read cursor.
 * Returns null if the thread does not exist yet.
 */
export async function getThreadSummary(
  threadId: string,
  userId?: string
): Promise<ThreadSummaryDto | null> {
  const admin = getAdmin()
  const { data: thread, error } = await admin
    .from('teskeid_chat_threads')
    .select('id, target_id, message_count, last_message_at')
    .eq('id', threadId)
    .single()
  if (error || !thread) return null

  let unreadCount = 0
  if (userId && thread.last_message_at) {
    const { data: cursor } = await admin
      .from('teskeid_chat_read_cursors')
      .select('last_read_at')
      .eq('thread_id', threadId)
      .eq('user_id', userId)
      .single()

    if (!cursor) {
      // Never read — all messages are unread
      unreadCount = thread.message_count
    } else if (cursor.last_read_at < thread.last_message_at) {
      const { count } = await admin
        .from('teskeid_chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('thread_id', threadId)
        .is('deleted_at', null)
        .is('hidden_at', null)
        .gt('created_at', cursor.last_read_at)
      unreadCount = count ?? 0
    }
  }

  return {
    threadId: thread.id,
    targetId: thread.target_id,
    messageCount: thread.message_count,
    lastMessageAt: thread.last_message_at ?? null,
    unreadCount,
    hasUnread: unreadCount > 0,
  }
}

/**
 * Resolves the access provider for a thread, scoped to the expected domain and target types.
 * Returns null if the thread does not exist OR if it falls outside the allowed scope
 * (wrong domain, wrong target_type). This ensures out-of-scope thread IDs return 404
 * before any access response — callers must check domain+targetTypes match.
 */
export async function getThreadProvider(
  threadId: string,
  scope: { domain: string; targetTypes: string[] }
): Promise<'vedurstofan' | 'vegagerdin' | null> {
  const admin = getAdmin()
  const { data } = await admin
    .from('teskeid_chat_threads')
    .select('target_type')
    .eq('id', threadId)
    .eq('domain', scope.domain)
    .in('target_type', scope.targetTypes)
    .maybeSingle()
  if (!data) return null
  return data.target_type === 'vegagerdin_station' ? 'vegagerdin' : 'vedurstofan'
}

/**
 * Resolves the access provider for a message (via its thread), scoped to domain + target types.
 * Returns null if the message, its thread, or its scope cannot be validated.
 */
export async function getMessageProvider(
  messageId: string,
  scope: { domain: string; targetTypes: string[] }
): Promise<'vedurstofan' | 'vegagerdin' | null> {
  const admin = getAdmin()
  const { data: msg } = await admin
    .from('teskeid_chat_messages')
    .select('thread_id')
    .eq('id', messageId)
    .maybeSingle()
  if (!msg) return null
  return getThreadProvider(msg.thread_id, scope)
}

/**
 * Returns the latest N visible messages per station for a batch of station IDs,
 * keyed by stationId. Stations with no thread or no messages return [].
 * Intended for the route-scoped Safnpúls — public read-only, no thread creation.
 */
export async function getPreviewMessagesForStations(
  stationIds: string[],
  limitPerStation: number,
): Promise<Map<string, MessageDto[]>> {
  const admin = getAdmin()
  const result = new Map<string, MessageDto[]>(stationIds.map(id => [id, []]))

  if (stationIds.length === 0) return result

  // Fetch all threads for these stations in one query
  const { data: threads, error: threadsError } = await admin
    .from('teskeid_chat_threads')
    .select('id, target_id')
    .eq('domain', 'weather')
    .eq('target_type', 'vedurstofan_station')
    .in('target_id', stationIds)

  if (threadsError || !threads || threads.length === 0) return result

  // Fetch messages for each thread in parallel
  const perThread = await Promise.all(
    (threads as any[]).map(async (t: any) => {
      const messages = await getThreadPreviewMessages(t.id as string, limitPerStation)
      return { stationId: t.target_id as string, messages }
    })
  )

  for (const { stationId, messages } of perThread) {
    result.set(stationId, messages)
  }

  return result
}

/**
 * Returns the latest visible message per target (weather domain),
 * ordered newest-first. Targets with no visible messages are excluded.
 * Intended for the public conditions feed — no auth required, no write side.
 * Fetches up to limitItems*3 (min 20) thread candidates to account for threads where
 * all messages are deleted/hidden.
 *
 * allowedTargetTypes is server-controlled — the caller (API route) decides which
 * providers are included. Clients must not pass arbitrary target types.
 *
 * NOTE: DB migration 78 (sql/78_teskeid_chat_core.sql) currently constrains
 * target_type IN ('vedurstofan_station'). Before creating vegagerdin_station threads
 * or messages, a new migration must extend the CHECK constraint.
 */
export async function getLatestConditionFeedPreviews(
  limitItems: number,
  allowedTargetTypes: ChatTargetType[] = ['vedurstofan_station']
): Promise<ConditionFeedPreviewItemDto[]> {
  const admin = getAdmin()
  // Fetch more candidates than needed: some threads may have all messages deleted/hidden.
  // 3x with a minimum of 20 gives reasonable coverage without over-querying.
  const candidateLimit = Math.max(limitItems * 3, 20)

  const { data: threads, error: threadsError } = await admin
    .from('teskeid_chat_threads')
    .select('id, target_id, target_name, target_type, provider')
    .eq('domain', 'weather')
    .in('target_type', allowedTargetTypes)
    .not('last_message_at', 'is', null)
    .order('last_message_at', { ascending: false })
    .limit(candidateLimit)

  if (threadsError || !threads || threads.length === 0) return []

  const candidates = await Promise.all(
    (threads as any[]).map(async (t: any) => {
      const messages = await getThreadPreviewMessages(t.id as string, 1)
      if (messages.length === 0) return null
      const msg = messages[0]
      return {
        targetId: t.target_id as string,
        targetName: t.target_name as string,
        targetType: t.target_type as ChatTargetType,
        provider: (t.provider as string | null) ?? null,
        latestMessage: msg,
        latestAt: msg.createdAt,
      }
    })
  )

  return candidates
    .filter((c): c is ConditionFeedPreviewItemDto => c !== null)
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt))
    .slice(0, limitItems)
}

/** Private helper: returns the latest N visible messages for a known thread ID. */
async function getThreadPreviewMessages(threadId: string, limit: number): Promise<MessageDto[]> {
  const admin = getAdmin()
  const { data, error } = await admin
    .from('teskeid_chat_messages')
    .select('id, thread_id, user_id, body, message_kind, created_at, deleted_at, hidden_at')
    .eq('thread_id', threadId)
    .is('deleted_at', null)
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  const rows = (data ?? []).reverse()
  const userIds = [...new Set<string>(rows.map((r: any) => r.user_id).filter(Boolean))]
  const profileMap = await fetchProfileMap(userIds)
  return rows.map((r: any) => toMessageDto(r, profileMap))
}

/**
 * Returns the latest N visible (non-deleted, non-hidden) messages for a thread
 * identified by domain/targetType/targetId, without creating the thread.
 * Returns [] if no thread exists yet.
 * Intended for public read-only previews — no user session required.
 */
export async function getPreviewMessages(
  target: { domain: string; targetType: string; targetId: string },
  limit: number
): Promise<MessageDto[]> {
  const admin = getAdmin()

  const { data: thread, error: threadError } = await admin
    .from('teskeid_chat_threads')
    .select('id')
    .eq('domain', target.domain)
    .eq('target_type', target.targetType)
    .eq('target_id', target.targetId)
    .maybeSingle()

  if (threadError) throw new Error('chat: getPreviewMessages failed')
  if (!thread) return []

  const { data, error } = await admin
    .from('teskeid_chat_messages')
    .select('id, thread_id, user_id, body, message_kind, created_at, deleted_at, hidden_at')
    .eq('thread_id', thread.id)
    .is('deleted_at', null)
    .is('hidden_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error('chat: getPreviewMessages failed')
  const rows = (data ?? []).reverse()
  const userIds = [...new Set<string>(rows.map((r: any) => r.user_id).filter(Boolean))]
  const profileMap = await fetchProfileMap(userIds)
  return rows.map((r: any) => toMessageDto(r, profileMap))
}
