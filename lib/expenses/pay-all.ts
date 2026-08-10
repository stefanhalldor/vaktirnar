import type {
  ExpensePayAllBlockedContextView,
  ExpensePayAllContextView,
  ExpensePayAllPaymentView,
  ExpensePayAllView,
  ExpenseGroupView,
  ExpenseSettlementTransferView,
  ExpensePaymentSnapshotView,
} from './contracts'
import { addMinorAmounts, compareStableIds, sumMinorAmounts } from './money'

export interface ExpensePayAllCandidate {
  /** Server-only canonical identity. It is deliberately omitted from the returned view. */
  creditorKey: string
  recipientDisplayName: string
  amountMinor: number
  currency: string
  paymentInstruction: ExpensePaymentSnapshotView | null
  context: ExpensePayAllContextView
}

export function expensePayAllSelfMemberIds(
  group: Pick<ExpenseGroupView, 'balances'>,
): Set<string> {
  return new Set(
    group.balances.filter((balance) => balance.isSelf).map((balance) => balance.memberId),
  )
}

/**
 * Builds a ledger-backed explanation for one simplified settlement transfer.
 * Only expenses that add debt for this exact debtor are linked. Credits,
 * confirmed/reported payments and cross-member netting are represented by one
 * signed adjustment, making the rows reconcile exactly without pretending
 * that the simplified creditor route is an original expense obligation.
 */
export function buildExpensePayAllContext(
  group: ExpenseGroupView,
  transfer: ExpenseSettlementTransferView,
): ExpensePayAllContextView {
  const expenses = group.expenses
    .filter((expense) => expense.status === 'active' && expense.currency === transfer.currency)
    .flatMap((expense) => {
      const paidMinor = sumMinorAmounts(
        expense.payments
          .filter((payment) => payment.memberId === transfer.fromMemberId)
          .map((payment) => payment.amountMinor),
      )
      const shareMinor = sumMinorAmounts(
        expense.shares
          .filter((share) => share.memberId === transfer.fromMemberId)
          .map((share) => share.amountMinor),
      )
      const debtContributionMinor = addMinorAmounts(shareMinor, -paidMinor)
      return debtContributionMinor > 0 ? [{
        id: expense.id,
        title: expense.title,
        incurredOn: expense.incurredOn,
        amountMinor: debtContributionMinor,
      }] : []
    })
  const linkedExpenseTotal = sumMinorAmounts(expenses.map((expense) => expense.amountMinor))

  return {
    groupId: group.id,
    groupKind: group.kind,
    groupName: group.name,
    emoji: group.emoji,
    amountMinor: transfer.amountMinor,
    currency: transfer.currency,
    expenses,
    nettingAdjustmentMinor: addMinorAmounts(transfer.amountMinor, -linkedExpenseTotal),
    transfer,
  }
}

function paymentInstructionSignature(snapshot: ExpensePaymentSnapshotView | null): string {
  if (!snapshot) return 'hidden'
  return JSON.stringify([
    snapshot.title,
    snapshot.kind,
    snapshot.currency,
    snapshot.visibility,
    Object.entries(snapshot.details).sort(([left], [right]) => compareStableIds(left, right)),
  ])
}

function compareContexts(left: ExpensePayAllContextView, right: ExpensePayAllContextView): number {
  return left.groupName.localeCompare(right.groupName, 'is')
    || compareStableIds(left.groupId, right.groupId)
}

export function buildExpensePayAllView(
  candidates: readonly ExpensePayAllCandidate[],
  blockedContexts: readonly ExpensePayAllBlockedContextView[],
): ExpensePayAllView {
  const groups = new Map<string, Omit<ExpensePayAllPaymentView, 'id'>>()

  for (const candidate of candidates) {
    const key = JSON.stringify([
      candidate.creditorKey,
      candidate.currency,
      paymentInstructionSignature(candidate.paymentInstruction),
    ])
    const current = groups.get(key)
    if (current) {
      current.amountMinor = addMinorAmounts(current.amountMinor, candidate.amountMinor)
      current.contexts.push(candidate.context)
      continue
    }
    groups.set(key, {
      recipientDisplayName: candidate.recipientDisplayName,
      amountMinor: candidate.amountMinor,
      currency: candidate.currency,
      paymentInstruction: candidate.paymentInstruction,
      contexts: [candidate.context],
    })
  }

  const payments = [...groups.values()]
    .map((payment) => ({
      ...payment,
      contexts: [...payment.contexts].sort(compareContexts),
    }))
    .sort((left, right) => (
      left.recipientDisplayName.localeCompare(right.recipientDisplayName, 'is')
      || compareStableIds(left.currency, right.currency)
      || compareStableIds(left.contexts[0]?.groupId ?? '', right.contexts[0]?.groupId ?? '')
    ))
    .map((payment, index) => ({ ...payment, id: `payment-${index + 1}` }))

  return {
    payments,
    blockedContexts: [...blockedContexts].sort((left, right) => (
      left.recipientDisplayName.localeCompare(right.recipientDisplayName, 'is')
      || compareContexts(left, right)
    )),
  }
}
