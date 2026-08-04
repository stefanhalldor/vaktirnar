import type {
  ExpenseBalanceView,
  ExpenseMemberRole,
  ExpenseRepaymentView,
} from './contracts'

/** Mirrors the SQL exit rule for the server-derived UI capability. */
export function canLeaveExpenseGroup(input: {
  role: ExpenseMemberRole
  memberId: string
  selfBalances: readonly ExpenseBalanceView[]
  repayments: readonly ExpenseRepaymentView[]
}): boolean {
  return input.role !== 'owner'
    && input.selfBalances.every((entry) => entry.amountMinor === 0)
    && input.repayments.every((repayment) => (
      repayment.status !== 'reported'
      || (
        repayment.fromMemberId !== input.memberId
        && repayment.toMemberId !== input.memberId
      )
    ))
}
