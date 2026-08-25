import 'server-only'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { EXPENSE_FEATURE_KEY } from './contracts'

export interface ExpenseAccess {
  user: User
}

export async function guardExpenseSession(): Promise<ExpenseAccess> {
  if (process.env.EXPENSES_ENABLED !== 'true') redirect('/')
  const { user } = await guardTeskeidSession()
  return { user }
}

export async function guardExpenseAccess(): Promise<ExpenseAccess> {
  const { user } = await guardExpenseSession()
  const allowed = await checkFeatureAccess(user.id, user.email!, EXPENSE_FEATURE_KEY)
  if (!allowed) redirect('/')
  return { user }
}

/** Non-redirecting capability for links into the canonical Expenses destination. */
export async function canUseExpenseDestination(user: User): Promise<boolean> {
  if (process.env.EXPENSES_ENABLED !== 'true' || !user.email) return false
  try {
    return await checkFeatureAccess(user.id, user.email, EXPENSE_FEATURE_KEY)
  } catch {
    return false
  }
}
