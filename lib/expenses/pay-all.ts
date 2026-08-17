import type {
  ExpensePayAllBlockedContextView,
  ExpensePayAllBlockedPairContextView,
  ExpensePayAllContextView,
  ExpensePayAllContextAllocationView,
  ExpensePayAllCounterpartyView,
  ExpensePayAllPairContextView,
  ExpensePayAllPaymentDetailsView,
  ExpensePayAllPaymentView,
  ExpensePayAllSettlementPlan,
  ExpensePayAllView,
  ExpenseGroupView,
  ExpenseSettlementTransferView,
  ExpensePaymentSnapshotView,
} from './contracts'
import { failExpenseDomain } from './domain-error'
import {
  addMinorAmounts,
  assertMinorAmount,
  compareStableIds,
  normalizeCurrency,
  sumMinorAmounts,
} from './money'

interface ExpensePayAllCandidateBase {
  /** Server-only canonical identity. It is deliberately omitted from the returned view. */
  creditorKey: string
  recipientDisplayName: string
  amountMinor: number
  currency: string
  context: ExpensePayAllContextView
}

export type ExpensePayAllCandidate = ExpensePayAllCandidateBase
  & ExpensePayAllPaymentDetailsView

interface ExpensePayAllPairCandidateBase {
  counterpartyUserId: string
  counterpartyDisplayName: string
  actionable: boolean
  context: ExpensePayAllPairContextView
}

export type ExpensePayAllPairCandidate =
  | (ExpensePayAllPairCandidateBase & {
      direction: 'outgoing'
      paymentDetails: ExpensePayAllPaymentDetailsView
    })
  | (ExpensePayAllPairCandidateBase & {
      direction: 'incoming'
      paymentDetails: null
    })

interface CanonicalPairMember {
  id: string
  userId: string | null
  displayName: string
  status: 'invited' | 'active' | 'declined' | 'removed' | 'left'
}

export function expensePayAllCanonicalPairDirection(input: {
  actorUserId: string
  actorMember: CanonicalPairMember
  fromMember: CanonicalPairMember | null
  toMember: CanonicalPairMember | null
}): { direction: 'outgoing' | 'incoming'; counterpartyUserId: string; displayName: string } | null {
  if (
    input.actorMember.status !== 'active'
    || input.actorMember.userId !== input.actorUserId
  ) return null

  const exactCounterparty = (member: CanonicalPairMember | null): member is CanonicalPairMember & {
    userId: string
  } => Boolean(
    member
    && member.status === 'active'
    && typeof member.userId === 'string'
    && member.userId !== input.actorUserId,
  )
  if (input.fromMember?.id === input.actorMember.id && exactCounterparty(input.toMember)) {
    return {
      direction: 'outgoing',
      counterpartyUserId: input.toMember.userId,
      displayName: input.toMember.displayName,
    }
  }
  if (input.toMember?.id === input.actorMember.id && exactCounterparty(input.fromMember)) {
    return {
      direction: 'incoming',
      counterpartyUserId: input.fromMember.userId,
      displayName: input.fromMember.displayName,
    }
  }
  return null
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
  eventLabel: string | null = null,
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
    eventLabel,
    amountMinor: transfer.amountMinor,
    currency: transfer.currency,
    expenses,
    nettingAdjustmentMinor: addMinorAmounts(transfer.amountMinor, -linkedExpenseTotal),
    transfer,
  }
}

export function buildExpensePayAllPairContext(
  context: ExpensePayAllContextView,
): ExpensePayAllPairContextView {
  return {
    groupId: context.groupId,
    expectedFinancialVersion: context.transfer.expectedFinancialVersion,
    fromMemberId: context.transfer.fromMemberId,
    toMemberId: context.transfer.toMemberId,
    amountMinor: context.amountMinor,
    currency: context.currency,
    context,
  }
}

export function expensePayAllSafeFirstName(displayLabel: string): string | null {
  const normalized = displayLabel.trim().replace(/\s+/g, ' ')
  if (!normalized || normalized.includes('@')) return null
  const firstName = normalized.split(' ')[0] ?? ''
  return /^[\p{L}\p{M}][\p{L}\p{M}.'’-]*$/u.test(firstName) ? firstName : null
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

function paymentDetailsSignature(details: ExpensePayAllPaymentDetailsView): string {
  return details.paymentDetailsState === 'available'
    ? `available:${paymentInstructionSignature(details.paymentInstruction)}:${JSON.stringify(
        details.expectedPaymentProfile,
      )}`
    : details.paymentDetailsState
}

export function combineExpensePayAllPaymentDetails(
  details: readonly ExpensePayAllPaymentDetailsView[],
): ExpensePayAllPaymentDetailsView | null {
  if (details.length === 0) return null
  if (details.some((entry) => entry.paymentDetailsState === 'unavailable')) {
    return {
      paymentDetailsState: 'unavailable',
      paymentInstruction: null,
      expectedPaymentProfile: null,
    }
  }

  const available = details.filter((entry): entry is Extract<
    ExpensePayAllPaymentDetailsView,
    { paymentDetailsState: 'available' }
  > => entry.paymentDetailsState === 'available')
  if (available.length === 0) {
    return {
      paymentDetailsState: 'not_configured',
      paymentInstruction: null,
      expectedPaymentProfile: null,
    }
  }
  if (available.length !== details.length) {
    return {
      paymentDetailsState: 'unavailable',
      paymentInstruction: null,
      expectedPaymentProfile: null,
    }
  }

  const signature = paymentDetailsSignature(available[0])
  return available.every((entry) => paymentDetailsSignature(entry) === signature)
    ? available[0]
    : {
        paymentDetailsState: 'unavailable',
        paymentInstruction: null,
        expectedPaymentProfile: null,
      }
}

function compareContexts(left: ExpensePayAllContextView, right: ExpensePayAllContextView): number {
  return left.groupName.localeCompare(right.groupName, 'is')
    || compareStableIds(left.groupId, right.groupId)
}

export function buildExpensePayAllView(
  candidates: readonly ExpensePayAllCandidate[],
  blockedContexts: readonly ExpensePayAllBlockedContextView[],
  pairCandidates: readonly ExpensePayAllPairCandidate[] = [],
): ExpensePayAllView {
  interface PaymentAccumulator {
    recipientDisplayName: string
    amountMinor: number
    currency: string
    paymentDetails: ExpensePayAllPaymentDetailsView
    contexts: ExpensePayAllContextView[]
  }
  const groups = new Map<string, PaymentAccumulator>()

  for (const candidate of candidates) {
    const paymentDetails: ExpensePayAllPaymentDetailsView = candidate.paymentDetailsState === 'available'
      ? {
          paymentDetailsState: 'available',
          paymentInstruction: candidate.paymentInstruction,
          expectedPaymentProfile: candidate.expectedPaymentProfile,
        }
      : {
          paymentDetailsState: candidate.paymentDetailsState,
          paymentInstruction: null,
          expectedPaymentProfile: null,
        }
    const key = JSON.stringify([
      candidate.creditorKey,
      candidate.currency,
      paymentDetailsSignature(paymentDetails),
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
      paymentDetails,
      contexts: [candidate.context],
    })
  }

  const payments: ExpensePayAllPaymentView[] = [...groups.values()]
    .map((payment) => ({
      recipientDisplayName: payment.recipientDisplayName,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      ...payment.paymentDetails,
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
    counterpartyViews: buildExpensePayAllCounterpartyViews(pairCandidates),
    pendingBatches: [],
    settlementBatchReady: false,
    blockedContexts: [...blockedContexts].sort((left, right) => (
      left.recipientDisplayName.localeCompare(right.recipientDisplayName, 'is')
      || compareContexts(left, right)
    )),
  }
}

function comparePairContexts(
  left: ExpensePayAllPairContextView,
  right: ExpensePayAllPairContextView,
): number {
  if (left.amountMinor !== right.amountMinor) return left.amountMinor > right.amountMinor ? -1 : 1
  return comparePairContextIds(left, right)
}

function comparePairContextIds(
  left: ExpensePayAllPairContextView,
  right: ExpensePayAllPairContextView,
): number {
  return compareStableIds(left.groupId, right.groupId)
    || compareStableIds(left.fromMemberId, right.fromMemberId)
    || compareStableIds(left.toMemberId, right.toMemberId)
}

function comparePairCandidates(
  left: ExpensePayAllPairCandidate,
  right: ExpensePayAllPairCandidate,
): number {
  return compareStableIds(left.counterpartyUserId, right.counterpartyUserId)
    || compareStableIds(left.context.currency, right.context.currency)
    || compareStableIds(left.context.groupId, right.context.groupId)
    || compareStableIds(left.context.fromMemberId, right.context.fromMemberId)
    || compareStableIds(left.context.toMemberId, right.context.toMemberId)
}

export function buildExpensePayAllCounterpartyViews(
  candidates: readonly ExpensePayAllPairCandidate[],
): ExpensePayAllCounterpartyView[] {
  interface PairAccumulator {
    counterpartyUserId: string
    counterpartyDisplayName: string
    currency: string
    outgoingContexts: ExpensePayAllPairContextView[]
    incomingContexts: ExpensePayAllPairContextView[]
    blockedContexts: ExpensePayAllBlockedPairContextView[]
    paymentDetails: ExpensePayAllPaymentDetailsView[]
  }
  const pairs = new Map<string, PairAccumulator>()

  for (const candidate of [...candidates].sort(comparePairCandidates)) {
    const key = JSON.stringify([candidate.counterpartyUserId, candidate.context.currency])
    let pair = pairs.get(key)
    if (!pair) {
      pair = {
        counterpartyUserId: candidate.counterpartyUserId,
        counterpartyDisplayName: candidate.counterpartyDisplayName,
        currency: candidate.context.currency,
        outgoingContexts: [],
        incomingContexts: [],
        blockedContexts: [],
        paymentDetails: [],
      }
      pairs.set(key, pair)
    }

    if (!candidate.actionable) {
      pair.blockedContexts.push({ ...candidate.context, direction: candidate.direction })
    } else if (candidate.direction === 'outgoing') {
      pair.outgoingContexts.push(candidate.context)
      pair.paymentDetails.push(candidate.paymentDetails)
    } else {
      pair.incomingContexts.push(candidate.context)
    }
  }

  return [...pairs.values()].map((pair) => {
    const outgoingContexts = [...pair.outgoingContexts].sort(comparePairContexts)
    const incomingContexts = [...pair.incomingContexts].sort(comparePairContexts)
    const grossPayableMinor = sumMinorAmounts(outgoingContexts.map((context) => context.amountMinor))
    const grossReceivableMinor = sumMinorAmounts(incomingContexts.map((context) => context.amountMinor))
    const offsetMinor = Math.min(grossPayableMinor, grossReceivableMinor)
    return {
      counterpartyUserId: pair.counterpartyUserId,
      counterpartyDisplayName: pair.counterpartyDisplayName,
      counterpartyFirstName: expensePayAllSafeFirstName(pair.counterpartyDisplayName),
      currency: pair.currency,
      grossPayableMinor,
      grossReceivableMinor,
      offsetMinor,
      netPayableMinor: addMinorAmounts(grossPayableMinor, -offsetMinor),
      netReceivableMinor: addMinorAmounts(grossReceivableMinor, -offsetMinor),
      outgoingContexts,
      incomingContexts,
      blockedContexts: [...pair.blockedContexts].sort((left, right) => (
        comparePairContexts(left, right) || compareStableIds(left.direction, right.direction)
      )),
      counterpartyCanSettle: true,
      paymentDetails: combineExpensePayAllPaymentDetails(pair.paymentDetails),
    }
  }).sort((left, right) => (
    left.counterpartyDisplayName.localeCompare(right.counterpartyDisplayName, 'is')
    || compareStableIds(left.counterpartyUserId, right.counterpartyUserId)
    || compareStableIds(left.currency, right.currency)
  ))
}

function assertPlanContexts(contexts: readonly ExpensePayAllPairContextView[]): void {
  const seen = new Set<string>()
  let currency: string | null = null
  for (const context of contexts) {
    assertMinorAmount(context.amountMinor)
    const normalizedCurrency = normalizeCurrency(context.currency)
    if (currency !== null && normalizedCurrency !== currency) failExpenseDomain('invalid_transfer')
    currency = normalizedCurrency
    if (
      !context.groupId.trim()
      || !context.fromMemberId.trim()
      || !context.toMemberId.trim()
      || context.fromMemberId === context.toMemberId
      || !Number.isSafeInteger(context.expectedFinancialVersion)
      || context.expectedFinancialVersion < 0
      || context.context.groupId !== context.groupId
      || context.context.amountMinor !== context.amountMinor
      || context.context.currency !== context.currency
      || context.context.transfer.expectedFinancialVersion !== context.expectedFinancialVersion
      || context.context.transfer.fromMemberId !== context.fromMemberId
      || context.context.transfer.toMemberId !== context.toMemberId
    ) failExpenseDomain('invalid_transfer')
    const key = JSON.stringify([
      context.groupId,
      context.fromMemberId,
      context.toMemberId,
      context.currency,
    ])
    if (seen.has(key)) failExpenseDomain('invalid_transfer')
    seen.add(key)
  }
}

function allocationView(
  context: ExpensePayAllPairContextView,
  allocatedMinor: number,
): ExpensePayAllContextAllocationView {
  return {
    groupId: context.groupId,
    expectedFinancialVersion: context.expectedFinancialVersion,
    fromMemberId: context.fromMemberId,
    toMemberId: context.toMemberId,
    contextAmountMinor: context.amountMinor,
    allocatedMinor,
  }
}

function allocateHighestFirst(
  contexts: readonly ExpensePayAllPairContextView[],
  requestedMinor: number,
  availableByContext?: ReadonlyMap<ExpensePayAllPairContextView, number>,
): {
  allocations: ExpensePayAllContextAllocationView[]
  remainingByContext: Map<ExpensePayAllPairContextView, number>
} {
  assertMinorAmount(requestedMinor, true)
  const remainingByContext = new Map(contexts.map((context) => [
    context,
    availableByContext?.get(context) ?? context.amountMinor,
  ]))
  const ordered = [...contexts].sort((left, right) => {
    const leftAmount = remainingByContext.get(left) ?? 0
    const rightAmount = remainingByContext.get(right) ?? 0
    if (leftAmount !== rightAmount) return leftAmount > rightAmount ? -1 : 1
    return comparePairContextIds(left, right)
  })
  const allocations: ExpensePayAllContextAllocationView[] = []
  let unallocatedMinor = requestedMinor
  for (const context of ordered) {
    if (unallocatedMinor === 0) break
    const availableMinor = remainingByContext.get(context) ?? 0
    const allocatedMinor = Math.min(availableMinor, unallocatedMinor)
    if (allocatedMinor === 0) continue
    allocations.push(allocationView(context, allocatedMinor))
    remainingByContext.set(context, addMinorAmounts(availableMinor, -allocatedMinor))
    unallocatedMinor = addMinorAmounts(unallocatedMinor, -allocatedMinor)
  }
  if (unallocatedMinor !== 0) failExpenseDomain('repayment_exceeds_debt')
  return { allocations, remainingByContext }
}

export function planExpensePayAllSettlement(
  outgoingContexts: readonly ExpensePayAllPairContextView[],
  incomingContexts: readonly ExpensePayAllPairContextView[],
  intent: { cashMinor: number; applyFullOffset: boolean },
): ExpensePayAllSettlementPlan {
  assertPlanContexts(outgoingContexts)
  assertPlanContexts(incomingContexts)
  const allContextKeys = new Set<string>()
  for (const context of [...outgoingContexts, ...incomingContexts]) {
    const key = JSON.stringify([
      context.groupId,
      context.fromMemberId,
      context.toMemberId,
      context.currency,
    ])
    if (allContextKeys.has(key)) failExpenseDomain('invalid_transfer')
    allContextKeys.add(key)
  }
  const currencies = new Set([
    ...outgoingContexts.map((context) => normalizeCurrency(context.currency)),
    ...incomingContexts.map((context) => normalizeCurrency(context.currency)),
  ])
  if (currencies.size > 1) failExpenseDomain('invalid_transfer')
  assertMinorAmount(intent.cashMinor, true)

  const grossPayableMinor = sumMinorAmounts(outgoingContexts.map((context) => context.amountMinor))
  const grossReceivableMinor = sumMinorAmounts(incomingContexts.map((context) => context.amountMinor))
  const fullOffsetMinor = Math.min(grossPayableMinor, grossReceivableMinor)
  const appliedOffsetMinor = intent.applyFullOffset ? fullOffsetMinor : 0
  const maxCashMinor = addMinorAmounts(grossPayableMinor, -appliedOffsetMinor)
  if (intent.cashMinor > maxCashMinor) {
    return {
      valid: false,
      error: 'cash_exceeds_payable',
      requestedCashMinor: intent.cashMinor,
      appliedOffsetMinor,
      maxCashMinor,
    }
  }
  if (intent.cashMinor === 0 && appliedOffsetMinor === 0) {
    return {
      valid: false,
      error: 'settlement_amount_required',
      requestedCashMinor: 0,
      appliedOffsetMinor,
      maxCashMinor,
    }
  }

  const outgoingOffset = allocateHighestFirst(outgoingContexts, appliedOffsetMinor)
  const incomingOffset = allocateHighestFirst(incomingContexts, appliedOffsetMinor)
  const cash = allocateHighestFirst(
    outgoingContexts,
    intent.cashMinor,
    outgoingOffset.remainingByContext,
  )
  const totalSettledMinor = addMinorAmounts(intent.cashMinor, appliedOffsetMinor)
  return {
    valid: true,
    error: null,
    cashMinor: intent.cashMinor,
    offsetMinor: appliedOffsetMinor,
    totalSettledMinor,
    remainingPayableMinor: addMinorAmounts(grossPayableMinor, -totalSettledMinor),
    remainingReceivableMinor: addMinorAmounts(grossReceivableMinor, -appliedOffsetMinor),
    outgoingOffsetAllocations: outgoingOffset.allocations,
    incomingOffsetAllocations: incomingOffset.allocations,
    cashAllocations: cash.allocations,
  }
}
