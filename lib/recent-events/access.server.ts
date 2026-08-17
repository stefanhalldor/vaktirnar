import 'server-only'

import type { User } from '@supabase/supabase-js'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { recordRecentEvent } from './helpers.server'
import type { ExpenseRecentEventRow, RecentEventSource } from './types'

const EXPENSES_PATH = '/auth-mvp/utlagt-og-endurgreitt'
const EXPENSE_ACTIVITY_KEY_PREFIX = 'expenses:activity:'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TARGET_BATCH_SIZE = 100

export interface RecentEventSourceAccess {
  loansEnabled: boolean
  expensesEnabled: boolean
  eventInvitationsEnabled: boolean
  sources: RecentEventSource[]
}

/**
 * Resolves every source from current server-side gates. A source lookup failure
 * disables only that source; callers must never accept a source list from the
 * client for reads or acknowledgements.
 */
export async function resolveRecentEventSourceAccess(
  user: Pick<User, 'id' | 'email'>,
): Promise<RecentEventSourceAccess> {
  if (!user.email) {
    return {
      loansEnabled: false,
      expensesEnabled: false,
      eventInvitationsEnabled: false,
      sources: [],
    }
  }
  const [loansResult, expensesResult, expenseMembershipResult] = await Promise.allSettled([
    checkFeatureAccess(user.id, user.email, 'lanad-og-skilad'),
    checkFeatureAccess(user.id, user.email, 'utlagt-og-endurgreitt'),
    Promise.resolve().then(() => getAdmin()
      .from('expense_group_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)),
  ])
  const loansEnabled = loansResult.status === 'fulfilled' && loansResult.value === true
  const hasExactExpenseMembership = expenseMembershipResult.status === 'fulfilled'
    && !expenseMembershipResult.value.error
    && (expenseMembershipResult.value.data?.length ?? 0) > 0
  const expensesEnabled = (
    expensesResult.status === 'fulfilled' && expensesResult.value === true
  ) || hasExactExpenseMembership
  const eventInvitationsEnabled = process.env.EVENTS_ENABLED === 'true'
  const sources: RecentEventSource[] = []
  if (loansEnabled) sources.push('loans')
  if (expensesEnabled) sources.push('expenses')
  if (eventInvitationsEnabled) sources.push('events')
  return { loansEnabled, expensesEnabled, eventInvitationsEnabled, sources }
}

const EVENT_INVITATION_PATH = '/auth-mvp/vidburdir/bod/thattaka'

interface PendingEventInvitation {
  invitationId: string
  eventName: string
  inviterDisplayName?: string
  invitedAt: string
}

export interface EventInvitationSyncResult {
  ok: boolean
  invitationIds: Set<string>
}

function eventInvitationProjectionIsUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object' || Array.isArray(error)) return false
  const code = (error as Record<string, unknown>).code
  return code === 'PGRST202' || code === '42883'
}

function parsePendingEventInvitations(value: unknown): PendingEventInvitation[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const invitations = (value as Record<string, unknown>).invitations
  if (!Array.isArray(invitations) || invitations.length > 100) return null
  const parsed: PendingEventInvitation[] = []
  for (const candidate of invitations) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
    const row = candidate as Record<string, unknown>
    if (Object.keys(row).some((key) => ![
      'invitation_id', 'event_name', 'inviter_display_name', 'invited_at',
    ].includes(key))) return null
    const invitationId = typeof row.invitation_id === 'string' ? row.invitation_id : ''
    const eventName = typeof row.event_name === 'string' ? row.event_name.trim() : ''
    const inviterDisplayName = typeof row.inviter_display_name === 'string'
      ? row.inviter_display_name.trim()
      : undefined
    const invitedAt = typeof row.invited_at === 'string' ? row.invited_at : ''
    if (
      !UUID_PATTERN.test(invitationId)
      || eventName.length < 1
      || eventName.length > 200
      || (inviterDisplayName && (inviterDisplayName.length > 120 || inviterDisplayName.includes('@')))
      || Number.isNaN(Date.parse(invitedAt))
    ) return null
    parsed.push({
      invitationId,
      eventName,
      ...(inviterDisplayName ? { inviterDisplayName } : {}),
      invitedAt,
    })
  }
  return parsed
}

/**
 * Mirrors exact-current pending Event invitations into the shared unread feed.
 * The SQL projection is session/email scoped and deliberately independent of
 * the per-user Events entitlement so a recipient is never stranded by an
 * email that contains no link.
 */
export async function syncEventAttendanceInvitationEvents(
  actorUserId: string,
): Promise<EventInvitationSyncResult> {
  try {
    const { data, error } = await getAdmin().rpc(
      'teskeid_event_list_my_pending_invitations',
      { p_actor_id: actorUserId },
    )
    if (error) {
      // SQL134 is additive and may intentionally lag the app during DB-first
      // localhost/release windows. Missing projection means no Event feed; it
      // must not turn a best-effort home sync into a Next.js error overlay.
      if (!eventInvitationProjectionIsUnavailable(error)) {
        console.warn('[recent-events] event invitation sync unavailable')
      }
      return { ok: false, invitationIds: new Set() }
    }
    const invitations = parsePendingEventInvitations(data)
    if (!invitations) throw new Error('event_invitation_projection_invalid')
    await Promise.all(invitations.map((invitation) => recordRecentEvent({
      userId: actorUserId,
      source: 'events',
      eventType: 'event_attendance_invitation_received',
      entityType: 'attendance_invitation',
      entityId: invitation.invitationId,
      eventKey: `events:attendance-invitation:${invitation.invitationId}:received`,
      payload: {
        eventName: invitation.eventName,
        ...(invitation.inviterDisplayName
          ? { inviterDisplayName: invitation.inviterDisplayName }
          : {}),
      },
      href: `${EVENT_INVITATION_PATH}/${invitation.invitationId}`,
      occurredAt: invitation.invitedAt,
      updateOnConflict: false,
    })))
    return {
      ok: true,
      invitationIds: new Set(invitations.map((invitation) => invitation.invitationId)),
    }
  } catch {
    console.warn('[recent-events] event invitation sync unavailable')
    return { ok: false, invitationIds: new Set() }
  }
}

export function expenseActivityIdFromEventKey(eventKey: string): string | null {
  if (!eventKey.startsWith(EXPENSE_ACTIVITY_KEY_PREFIX)) return null
  const activityId = eventKey.slice(EXPENSE_ACTIVITY_KEY_PREFIX.length)
  return UUID_PATTERN.test(activityId) ? activityId : null
}

/**
 * Best-effort guarantor for email invitations created before the recipient
 * had a Teskeið account. The RPC is email-matched, idempotent and projects no
 * ledger fields; failure must not make the rest of the home feed unavailable.
 */
export async function syncExpenseMemberInvitationEvents(actorUserId: string): Promise<boolean> {
  try {
    const { error } = await getAdmin().rpc('expense_sync_my_member_invitation_events', {
      p_actor_id: actorUserId,
    })
    if (error) {
      console.error('[recent-events] expense invitation sync failed')
      return false
    }
    return true
  } catch {
    console.error('[recent-events] expense invitation sync failed')
    return false
  }
}

interface ExpenseRecentTargetRow {
  activity_id: string
  href: string
}

function safeExpenseHref(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  try {
    const parsed = new URL(value, 'https://teskeid.invalid')
    if (parsed.origin !== 'https://teskeid.invalid' || parsed.hash) return null
    if (parsed.pathname !== EXPENSES_PATH && !parsed.pathname.startsWith(`${EXPENSES_PATH}/`)) {
      return null
    }
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return null
  }
}

/**
 * Resolves current-authorized expense destinations in one or more bounded
 * service-role RPC calls. Event snapshots remain renderable when access was
 * revoked, but a missing/error/unsafe target never becomes a client link.
 */
export async function resolveExpenseRecentEventTargets(
  actorUserId: string,
  events: readonly ExpenseRecentEventRow[],
): Promise<Map<string, string>> {
  const activityIds = [...new Set(events.flatMap((event) => {
    const activityId = expenseActivityIdFromEventKey(event.event_key)
    return activityId ? [activityId] : []
  }))]
  if (activityIds.length === 0) return new Map()

  try {
    const admin = getAdmin()
    const targets = new Map<string, string>()
    for (let start = 0; start < activityIds.length; start += TARGET_BATCH_SIZE) {
      const batch = activityIds.slice(start, start + TARGET_BATCH_SIZE)
      const { data, error } = await admin.rpc('expense_resolve_recent_targets', {
        p_actor_id: actorUserId,
        p_activity_ids: batch,
      })
      if (error) {
        console.error('[recent-events] expense target resolution failed')
        return new Map()
      }
      for (const row of (data ?? []) as ExpenseRecentTargetRow[]) {
        if (!batch.includes(row.activity_id)) continue
        const href = safeExpenseHref(row.href)
        if (href) targets.set(row.activity_id, href)
      }
    }
    return targets
  } catch {
    console.error('[recent-events] expense target resolution failed')
    return new Map()
  }
}
