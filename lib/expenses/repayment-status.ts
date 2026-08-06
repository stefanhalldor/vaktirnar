import type { ExpenseRepaymentView } from './contracts'
import { addMinorAmounts } from './money'

export interface ExpenseMemberRepaymentStatus {
  reportedAmountMinor: number
  confirmedAmountMinor: number
  latestReportedAt: string | null
  latestConfirmedReportAt: string | null
}

function latestInstant(current: string | null, candidate: string): string {
  return current === null || candidate > current ? candidate : current
}

/**
 * Summarises financially active repayments by the member who made them.
 * Rejected and cancelled reports are history only and must not look paid.
 * `createdAt` is the report time; the current read model does not expose a
 * separate confirmation timestamp.
 */
export function summarizeExpenseRepaymentsByPayer(
  repayments: readonly ExpenseRepaymentView[],
  currency: string,
): Map<string, ExpenseMemberRepaymentStatus> {
  const result = new Map<string, ExpenseMemberRepaymentStatus>()

  for (const repayment of repayments) {
    if (
      repayment.currency !== currency
      || (repayment.status !== 'reported' && repayment.status !== 'confirmed')
    ) {
      continue
    }

    const current = result.get(repayment.fromMemberId) ?? {
      reportedAmountMinor: 0,
      confirmedAmountMinor: 0,
      latestReportedAt: null,
      latestConfirmedReportAt: null,
    }

    if (repayment.status === 'reported') {
      current.reportedAmountMinor = addMinorAmounts(
        current.reportedAmountMinor,
        repayment.amountMinor,
      )
      current.latestReportedAt = latestInstant(current.latestReportedAt, repayment.createdAt)
    } else {
      current.confirmedAmountMinor = addMinorAmounts(
        current.confirmedAmountMinor,
        repayment.amountMinor,
      )
      current.latestConfirmedReportAt = latestInstant(
        current.latestConfirmedReportAt,
        repayment.createdAt,
      )
    }

    result.set(repayment.fromMemberId, current)
  }

  return result
}
