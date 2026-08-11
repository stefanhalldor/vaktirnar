import 'server-only'

import { getRelationshipLoanActivity, type LoanActivityItem, type RelationshipDetail } from '@/lib/relationships/actions'
import { getRelationshipExpenseContexts } from '@/lib/expenses/relationship-contexts.server'
import type { RelationshipExpenseContextSummary } from '@/lib/expenses/relationship-contexts.server'

export interface RelationshipSharedOverview {
  expenseContexts: RelationshipExpenseContextSummary[]
  loanActivity: LoanActivityItem[]
  /** True if at least one lookup settled with an error (partial data). */
  hasPartialError: boolean
}

/**
 * Aggregates shared UL expense contexts and loan activity for a relationship detail page.
 * Uses Promise.allSettled so a single provider failure does not block the other.
 * Feature access checks must be done by the caller before invoking this function.
 */
export async function getRelationshipSharedOverview(
  ownerUserId: string,
  relationship: Pick<RelationshipDetail, 'counterpart_user_id' | 'email_canonical'>,
  options: {
    includeExpenses: boolean
    includeLoans: boolean
  },
): Promise<RelationshipSharedOverview> {
  const [expenseResult, loanResult] = await Promise.allSettled([
    options.includeExpenses && relationship.counterpart_user_id
      ? getRelationshipExpenseContexts(ownerUserId, relationship.counterpart_user_id)
      : Promise.resolve([] as RelationshipExpenseContextSummary[]),
    options.includeLoans
      ? getRelationshipLoanActivity(ownerUserId, relationship)
      : Promise.resolve([] as LoanActivityItem[]),
  ])

  return {
    expenseContexts: expenseResult.status === 'fulfilled' ? expenseResult.value : [],
    loanActivity: loanResult.status === 'fulfilled' ? loanResult.value : [],
    hasPartialError: expenseResult.status === 'rejected' || loanResult.status === 'rejected',
  }
}
