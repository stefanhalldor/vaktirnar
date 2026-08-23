import 'server-only'

import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { EXPENSE_FEATURE_KEY } from '@/lib/expenses/contracts'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { EVENT_FEATURE_KEY } from './contracts'

export interface EventAccess {
  user: User
}

/**
 * Global Events gate plus a verified Teskeið session. Scoped invitation
 * routes use this guard so an exact-email recipient can consent without an
 * Events per-user entitlement. It does not grant access to any Event data.
 */
export async function guardEventSession(): Promise<EventAccess> {
  if (process.env.EVENTS_ENABLED !== 'true') redirect('/')
  const { user } = await guardTeskeidSession()
  return { user }
}

export async function guardEventAccess(): Promise<EventAccess> {
  const { user } = await guardEventSession()
  if (!await hasEventFeatureAccess(user)) redirect('/')
  return { user }
}

export async function hasEventFeatureAccess(user: User): Promise<boolean> {
  if (!user.email) return false
  try {
    return await checkFeatureAccess(user.id, user.email, EVENT_FEATURE_KEY)
  } catch {
    return false
  }
}

/**
 * Non-redirecting capability check for the optional Events -> Expenses seam.
 * Event CRUD remains usable without Expenses, while every financial surface
 * requires both exact global switches and both per-user entitlements.
 */
export async function canUseEventExpenses(user: User): Promise<boolean> {
  if (
    process.env.EVENTS_ENABLED !== 'true'
    || process.env.EXPENSES_ENABLED !== 'true'
    || !user.email
  ) return false

  try {
    const [eventsAccess, expensesAccess] = await Promise.all([
      checkFeatureAccess(user.id, user.email, EVENT_FEATURE_KEY),
      checkFeatureAccess(user.id, user.email, EXPENSE_FEATURE_KEY),
    ])
    return eventsAccess && expensesAccess
  } catch {
    return false
  }
}
