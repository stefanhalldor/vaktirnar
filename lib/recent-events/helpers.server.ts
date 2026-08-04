import { getAdmin } from '@/lib/supabase/admin'
import {
  isExpenseRecentEventType,
  isLoanRecentEventType,
  isRecentEventSource,
  sanitizeRecentEventPayload,
} from './display'
import type {
  ExpenseRecentEventPayload,
  ExpenseRecentEventType,
} from '@/lib/expenses/events'
import type {
  LoanRecentEventPayload,
  LoanRecentEventType,
  RecentEventRow,
  RecentEventSource,
} from './types'

const TABLE = 'recent_events'

interface RecordEventBase {
  userId: string
  entityType: string
  entityId: string | null
  eventKey: string
  href: string
  /** When true (default), a duplicate event_key row gets updated in place,
   *  resetting ack_at and refreshing occurred_at + payload.
   *  Set false for creation events where the first write should win. */
  updateOnConflict?: boolean
  /** When true, ack_at is set immediately so the event does not appear as
   *  unread in Nýlegt. Use for the actor's own change events. */
  initiallyRead?: boolean
  /** The user ID of the person who performed the action. Merged into payload
   *  as actorUserId so history can display "Done by {name}". */
  actorUserId?: string
  /** Authoritative event time. Omitted by existing loan callers, which retain
   *  write-time behavior; durable expense activity projections should pass it. */
  occurredAt?: string
}

export type RecordEventArgs = RecordEventBase & (
  | {
    source: 'loans'
    eventType: LoanRecentEventType
    payload: Readonly<LoanRecentEventPayload>
  }
  | {
    source: 'expenses'
    eventType: ExpenseRecentEventType
    payload: Readonly<ExpenseRecentEventPayload>
  }
)

/**
 * Best-effort event recording. Never throws — a failure logs and is suppressed
 * so the main loan mutation is not blocked.
 */
export async function recordRecentEvent(args: RecordEventArgs): Promise<void> {
  if (typeof args.href !== 'string' || !args.href.startsWith('/') || args.href.startsWith('//')) {
    console.error('[recent-events] recordRecentEvent: rejected non-local href')
    return
  }
  if (
    (args.source === 'loans' && !isLoanRecentEventType(args.eventType))
    || (args.source === 'expenses' && !isExpenseRecentEventType(args.eventType))
  ) {
    console.error('[recent-events] recordRecentEvent: rejected source/event pair')
    return
  }
  const occurredAt = args.occurredAt ?? new Date().toISOString()
  if (typeof occurredAt !== 'string' || Number.isNaN(Date.parse(occurredAt))) {
    console.error('[recent-events] recordRecentEvent: rejected occurred_at')
    return
  }
  try {
    const admin = getAdmin()
    const inputPayload = args.actorUserId
      ? { ...args.payload, actorUserId: args.actorUserId }
      : args.payload
    const mergedPayload = args.source === 'loans'
      ? sanitizeRecentEventPayload('loans', args.eventType, inputPayload)
      : sanitizeRecentEventPayload('expenses', args.eventType, inputPayload)
    if (!mergedPayload) {
      console.error('[recent-events] recordRecentEvent: rejected payload')
      return
    }
    const row = {
      user_id:     args.userId,
      source:      args.source,
      event_type:  args.eventType,
      entity_type: args.entityType,
      entity_id:   args.entityId,
      event_key:   args.eventKey,
      payload:     mergedPayload,
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
  sources: readonly RecentEventSource[],
  limit?: number,
): Promise<RecentEventRow[]> {
  const allowedSources = normalizeSources(sources)
  if (allowedSources.length === 0) return []
  const admin = getAdmin()
  const base = admin
    .from(TABLE)
    .select('id, user_id, source, event_type, entity_type, entity_id, event_key, payload, href, occurred_at, ack_at')
    .eq('user_id', userId)
    .in('source', allowedSources)
    .is('ack_at', null)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
  const { data, error } = await (typeof limit === 'number' ? base.limit(limit) : base)
  if (error) throw error
  return (data ?? []) as RecentEventRow[]
}

/**
 * Best-effort: ack the event matching (userId, eventKey).
 * Never throws — failure is logged and suppressed.
 */
export async function ackRecentEventByKey(userId: string, eventKey: string): Promise<void> {
  try {
    const admin = getAdmin()
    const { error } = await admin
      .from(TABLE)
      .update({ ack_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('event_key', eventKey)
    if (error) {
      console.error('[recent-events] ackRecentEventByKey failed')
    }
  } catch {
    console.error('[recent-events] ackRecentEventByKey failed')
  }
}

/**
 * Sets ack_at on all unread events for userId.
 * Throws on DB error.
 */
export async function ackAllUnreadRecentEventsForUser(
  userId: string,
  sources: readonly RecentEventSource[],
): Promise<void> {
  const allowedSources = normalizeSources(sources)
  if (allowedSources.length === 0) return
  const admin = getAdmin()
  const { error } = await admin
    .from(TABLE)
    .update({ ack_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('source', allowedSources)
    .is('ack_at', null)
  if (error) throw error
}

/**
 * Sets ack_at on the given event IDs, but only for rows owned by userId.
 * Throws on DB error.
 */
export async function ackRecentEventsForUser(
  userId: string,
  eventIds: number[],
  sources: readonly RecentEventSource[],
): Promise<void> {
  const allowedSources = normalizeSources(sources)
  if (allowedSources.length === 0 || eventIds.length === 0) return
  const admin = getAdmin()
  const { error } = await admin
    .from(TABLE)
    .update({ ack_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('id', eventIds)
    .in('source', allowedSources)
  if (error) throw error
}

function normalizeSources(sources: readonly RecentEventSource[]): RecentEventSource[] {
  return [...new Set(sources.filter((source) => isRecentEventSource(source)))]
}
