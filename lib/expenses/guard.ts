import 'server-only'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { EXPENSE_FEATURE_KEY } from './contracts'

export interface ExpenseAccess {
  user: User
}

export async function guardExpenseAccess(): Promise<ExpenseAccess> {
  if (process.env.EXPENSES_ENABLED !== 'true') redirect('/')
  const { user } = await guardTeskeidSession()
  const allowed = await checkFeatureAccess(user.id, user.email!, EXPENSE_FEATURE_KEY)
  if (!allowed) redirect('/')
  return { user }
}
