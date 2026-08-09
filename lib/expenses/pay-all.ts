import type {
  ExpensePayAllBlockedContextView,
  ExpensePayAllContextView,
  ExpensePayAllPaymentView,
  ExpensePayAllView,
  ExpensePaymentSnapshotView,
} from './contracts'
import { addMinorAmounts, compareStableIds } from './money'

export interface ExpensePayAllCandidate {
  /** Server-only canonical identity. It is deliberately omitted from the returned view. */
  creditorKey: string
  recipientDisplayName: string
  amountMinor: number
  currency: string
  paymentInstruction: ExpensePaymentSnapshotView | null
  context: ExpensePayAllContextView
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
