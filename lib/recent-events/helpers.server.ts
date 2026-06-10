import { getAdmin } from '@/lib/supabase/admin'
import type { RecentEventRow, RecentEventType, RecentEventPayload } from './types'

const TABLE = 'recent_events'

export interface RecordEventArgs {
  userId: string
  source: string
  eventType: RecentEventType
  entityType: string
  entityId: string | null
  eventKey: string
  payload: RecentEventPayload
  href: string
  /** When true (default), a duplicate event_key row gets updated in place,
   *  resetting ack_at and refreshing occurred_at + payload.
   *  Set false for creation events where the first write should win. */
  updateOnConflict?: boolean
  /** When true, ack_at is set immediately so the event does not appear as
   *  unread in Nýlegt. Use for the actor's own change events. */
  initiallyRead?: boolean
}

/**
 * Best-effort event recording. Never throws — a failure logs and is suppressed
 * so the main loan mutation is not blocked.
 */
export async function recordRecentEvent(args: RecordEventArgs): Promise<void> {
  if (args.href.startsWith('//')) {
    console.error('[recent-events] recordRecentEvent: rejected protocol-relative href')
    return
  }
  try {
    const admin = getAdmin()
    const occurredAt = new Date().toISOString()
    const row = {
      user_id:     args.userId,
      source:      args.source,
      event_type:  args.eventType,
      entity_type: args.entityType,
      entity_id:   args.entityId,
      event_key:   args.eventKey,
      payload:     args.payload,
      href:        args.href,
      occurred_at: occurredAt,
      ack_at:      args.initiallyRead ? occurredAt : null,
    }
    const { error } = await admin
      .from(TABLE)
      .upsert(row, {
        onConflict:       'user_id,event_key',
        ignoreDuplicates: args.updateOnConflict === false,
      })
    if (error) {
      console.error('[recent-events] recordRecentEvent failed')
    }
  } catch {
    console.error('[recent-events] recordRecentEvent failed')
  }
}

/**
 * Returns all unread events for a user, newest first.
 * Pass an explicit limit only when a hard cap is intentional.
 * Throws on DB error — caller is responsible for graceful degradation.
 */
export async function getUnreadRecentEventsForUser(
  userId: string,
  limit?: number,
): Promise<RecentEventRow[]> {
  const admin = getAdmin()
  const base = admin
    .from(TABLE)
    .select('id, user_id, source, event_type, entity_type, entity_id, event_key, payload, href, occurred_at, ack_at')
    .eq('user_id', userId)
    .is('ack_at', null)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
  const { data, error } = await (typeof limit === 'number' ? base.limit(limit) : base)
  if (error) throw error
  return (data ?? []) as RecentEventRow[]
}

/**
 * Sets ack_at on the given event IDs, but only for rows owned by userId.
 * Throws on DB error.
 */
export async function ackRecentEventsForUser(
  userId: string,
  eventIds: number[],
): Promise<void> {
  const admin = getAdmin()
  const { error } = await admin
    .from(TABLE)
    .update({ ack_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('id', eventIds)
  if (error) throw error
}
