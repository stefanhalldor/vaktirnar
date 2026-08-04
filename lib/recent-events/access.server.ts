import 'server-only'

import type { User } from '@supabase/supabase-js'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getAdmin } from '@/lib/supabase/admin'
import type { ExpenseRecentEventRow, RecentEventSource } from './types'

const EXPENSES_PATH = '/auth-mvp/utlagt-og-endurgreitt'
const EXPENSE_ACTIVITY_KEY_PREFIX = 'expenses:activity:'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TARGET_BATCH_SIZE = 100

export interface RecentEventSourceAccess {
  loansEnabled: boolean
  expensesEnabled: boolean
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
  if (!user.email) return { loansEnabled: false, expensesEnabled: false, sources: [] }
  const [loansResult, expensesResult] = await Promise.allSettled([
    checkFeatureAccess(user.id, user.email, 'lanad-og-skilad'),
    checkFeatureAccess(user.id, user.email, 'utlagt-og-endurgreitt'),
  ])
  const loansEnabled = loansResult.status === 'fulfilled' && loansResult.value === true
  const expensesEnabled = expensesResult.status === 'fulfilled' && expensesResult.value === true
  const sources: RecentEventSource[] = []
  if (loansEnabled) sources.push('loans')
  if (expensesEnabled) sources.push('expenses')
  return { loansEnabled, expensesEnabled, sources }
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
