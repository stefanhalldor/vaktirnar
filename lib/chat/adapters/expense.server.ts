import 'server-only'
import type { User } from '@supabase/supabase-js'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { EXPENSE_FEATURE_KEY, type ExpenseItemView } from '@/lib/expenses/contracts'
import { getExpenseItemView } from '@/lib/expenses/repository.server'
import type { ChatThreadTarget } from '../types'

export const EXPENSE_CHAT_DOMAIN = 'expenses' as const
export const EXPENSE_CHAT_TARGET_TYPE = 'expense_item' as const

export type ExpenseChatAccessResult =
  | { status: 'allowed'; user: User; expense: ExpenseItemView }
  | { status: 'no-session' | 'disabled' | 'forbidden' | 'not-found' }

export async function resolveExpenseChatAccess(
  user: User | null,
  expenseId: string,
): Promise<ExpenseChatAccessResult> {
  if (!user) return { status: 'no-session' }
  if (process.env.TESKEID_CHAT_ENABLED !== 'true') return { status: 'disabled' }
  if (!user.email) return { status: 'forbidden' }
  const featureAllowed = await checkFeatureAccess(
    user.id,
    user.email,
    EXPENSE_FEATURE_KEY,
  ).catch(() => false)
  if (!featureAllowed) return { status: 'forbidden' }
  const result = await getExpenseItemView(user.id, expenseId).catch(() => null)
  if (!result) return { status: 'not-found' }
  return { status: 'allowed', user, expense: result.expense }
}

export function buildExpenseChatTarget(expense: ExpenseItemView): ChatThreadTarget {
  return {
    domain: EXPENSE_CHAT_DOMAIN,
    targetType: EXPENSE_CHAT_TARGET_TYPE,
    targetId: expense.id,
    targetName: expense.title,
  }
}
