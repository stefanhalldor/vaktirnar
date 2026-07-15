import 'server-only'
import { getAdmin } from '@/lib/supabase/admin'
import type {
  ChatThreadTarget,
  ThreadDto,
  MessageDto,
  ThreadSummaryDto,
  CreateMessageInput,
  ReportMessageInput,
} from './types'

// ── Row → DTO helpers ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toMessageDto(row: any): MessageDto {
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
 * Lists messages for a thread, oldest first.
 * Deleted and hidden messages are included but body is redacted in the DTO.
 */
export async function listMessages(
  threadId: string,
  opts?: { limit?: number; before?: string }
): Promise<MessageDto[]> {
  const admin = getAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = admin
    .from('teskeid_chat_messages')
    .select('id, thread_id, body, message_kind, created_at, deleted_at, hidden_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(opts?.limit ?? 50)
  if (opts?.before) {
    query = query.lt('created_at', opts.before)
  }
  const { data, error } = await query
  if (error) throw new Error('chat: listMessages failed')
  return (data ?? []).map(toMessageDto)
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
    .select('id, thread_id, body, message_kind, created_at, deleted_at, hidden_at')
    .single()
  if (error || !data) throw new Error('chat: postMessage failed')
  return toMessageDto(data)
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
