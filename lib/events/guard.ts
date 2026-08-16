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

export async function guardEventAccess(): Promise<EventAccess> {
  if (process.env.EVENTS_ENABLED !== 'true') redirect('/')
  const { user } = await guardTeskeidSession()
  if (!user.email || !await checkFeatureAccess(user.id, user.email, EVENT_FEATURE_KEY)) redirect('/')
  return { user }
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
