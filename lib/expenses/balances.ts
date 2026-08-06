import { failExpenseDomain } from './domain-error'
import {
  addMinorAmounts,
  assertMinorAmount,
  assertPartyId,
  assertSignedMinorAmount,
  assertUniquePartyIds,
  compareStableIds,
  normalizeCurrency,
  sumMinorAmounts,
} from './money'
import { calculateRepaymentProgress } from './repayments'
import type {
  DebtObligation,
  ExpenseFinancials,
  ExpenseLedgerEntry,
  PartyBalance,
  Repayment,
  SettlementTransfer,
} from './types'

const BALANCE_AFFECTING_STATUSES = new Set<ExpenseLedgerEntry['status']>([
  'active',
  'settling',
  'settled',
])

function balanceSort(left: PartyBalance, right: PartyBalance): number {
  const currencyOrder = compareStableIds(left.currency, right.currency)
  return currencyOrder !== 0 ? currencyOrder : compareStableIds(left.partyId, right.partyId)
}

function addBalance(
  balancesByCurrency: Map<string, Map<string, number>>,
  partyId: string,
  currency: string,
  deltaMinor: number,
): void {
  assertPartyId(partyId)
  const normalizedCurrency = normalizeCurrency(currency)
  assertSignedMinorAmount(deltaMinor)
  const currencyBalances = balancesByCurrency.get(normalizedCurrency) ?? new Map<string, number>()
  currencyBalances.set(
    partyId,
    addMinorAmounts(currencyBalances.get(partyId) ?? 0, deltaMinor),
  )
  balancesByCurrency.set(normalizedCurrency, currencyBalances)
}

function flattenBalances(balancesByCurrency: Map<string, Map<string, number>>): PartyBalance[] {
  const balances: PartyBalance[] = []
  for (const [currency, currencyBalances] of balancesByCurrency) {
    for (const [partyId, amountMinor] of currencyBalances) {
      balances.push({ partyId, currency, amountMinor })
    }
  }
  return balances.sort(balanceSort)
}

export function combinePartyBalances(balances: readonly PartyBalance[]): PartyBalance[] {
  const combined = new Map<string, Map<string, number>>()
  for (const balance of balances) {
    addBalance(combined, balance.partyId, balance.currency, balance.amountMinor)
  }
  return flattenBalances(combined)
}

export function assertBalancesSumToZero(balances: readonly PartyBalance[]): void {
  const combined = combinePartyBalances(balances)
  const totals = new Map<string, number>()
  for (const balance of combined) {
    totals.set(
      balance.currency,
      addMinorAmounts(totals.get(balance.currency) ?? 0, balance.amountMinor),
    )
  }
  for (const [currency, amountMinor] of totals) {
    if (amountMinor !== 0) {
      failExpenseDomain('balance_total_not_zero', { currency, amountMinor })
    }
  }
}

export function calculateExpenseBalances(expense: ExpenseFinancials): PartyBalance[] {
  if (!expense.expenseId?.trim()) {
    failExpenseDomain('invalid_expense_id')
  }
  const totalMinor = assertMinorAmount(expense.totalMinor)
  const currency = normalizeCurrency(expense.currency)

  if (expense.payments.length === 0) {
    failExpenseDomain('payment_required')
  }
  assertUniquePartyIds(
    expense.payments.map((payment) => payment.payerId),
    'duplicate_payer',
  )
  const paymentAmounts = expense.payments.map((payment) => {
    const paymentCurrency = normalizeCurrency(payment.currency)
    if (paymentCurrency !== currency) {
      failExpenseDomain('payment_currency_mismatch', {
        expectedCurrency: currency,
        actualCurrency: paymentCurrency,
      })
    }
    return assertMinorAmount(payment.amountMinor)
  })
  const paymentTotal = sumMinorAmounts(paymentAmounts)
  if (paymentTotal !== totalMinor) {
    failExpenseDomain('payment_total_mismatch', { expected: totalMinor, actual: paymentTotal })
  }

  if (expense.shares.length === 0) {
    failExpenseDomain('participant_required')
  }
  assertUniquePartyIds(
    expense.shares.map((share) => share.participantId),
    'duplicate_participant',
  )
  const shareAmounts = expense.shares.map((share) => {
    const shareCurrency = normalizeCurrency(share.currency)
    if (shareCurrency !== currency) {
      failExpenseDomain('share_currency_mismatch', {
        expectedCurrency: currency,
        actualCurrency: shareCurrency,
      })
    }
    return assertMinorAmount(share.amountMinor, true)
  })
  const shareTotal = sumMinorAmounts(shareAmounts)
  if (shareTotal !== totalMinor) {
    failExpenseDomain('share_total_mismatch', { expected: totalMinor, actual: shareTotal })
  }

  const balancesByCurrency = new Map<string, Map<string, number>>()
  for (const payment of expense.payments) {
    addBalance(balancesByCurrency, payment.payerId, currency, payment.amountMinor)
  }
  for (const share of expense.shares) {
    addBalance(balancesByCurrency, share.participantId, currency, -share.amountMinor)
  }

  const balances = flattenBalances(balancesByCurrency)
  const netTotal = sumMinorAmounts(balances.map((balance) => balance.amountMinor))
  if (netTotal !== 0) {
    failExpenseDomain('expense_balance_not_zero', { expenseId: expense.expenseId, netTotal })
  }
  return balances
}

function validateRepayment(repayment: Repayment): void {
  if (!repayment.repaymentId?.trim()) {
    failExpenseDomain('invalid_repayment_id')
  }
  if (!repayment.obligationId?.trim()) {
    failExpenseDomain('repayment_obligation_mismatch')
  }
  assertPartyId(repayment.fromPartyId)
  assertPartyId(repayment.toPartyId)
  if (repayment.fromPartyId === repayment.toPartyId) {
    failExpenseDomain('invalid_transfer')
  }
  assertMinorAmount(repayment.amountMinor)
  normalizeCurrency(repayment.currency)
  if (!['reported', 'confirmed', 'rejected', 'cancelled'].includes(repayment.status)) {
    failExpenseDomain('repayment_status_invalid')
  }
}

export function aggregateLedgerBalances(
  expenses: readonly ExpenseLedgerEntry[],
  repayments: readonly Repayment[] = [],
  obligations: readonly DebtObligation[] = [],
): PartyBalance[] {
  const combined = new Map<string, Map<string, number>>()
  const expenseIds = new Set<string>()
  for (const expense of expenses) {
    if (!expense.expenseId?.trim()) {
      failExpenseDomain('invalid_expense_id')
    }
    if (expenseIds.has(expense.expenseId)) {
      failExpenseDomain('duplicate_expense', { expenseId: expense.expenseId })
    }
    expenseIds.add(expense.expenseId)
    if (!BALANCE_AFFECTING_STATUSES.has(expense.status)) continue
    for (const balance of calculateExpenseBalances(expense)) {
      addBalance(combined, balance.partyId, balance.currency, balance.amountMinor)
    }
  }

  const obligationsById = new Map<string, DebtObligation>()
  for (const obligation of obligations) {
    if (!obligation.obligationId?.trim() || obligationsById.has(obligation.obligationId)) {
      failExpenseDomain('repayment_obligation_mismatch')
    }
    obligationsById.set(obligation.obligationId, obligation)
  }

  const repaymentIds = new Set<string>()
  const repaymentsByObligation = new Map<string, Repayment[]>()
  const validatedRepayments = repayments.map((repayment) => {
    validateRepayment(repayment)
    if (repaymentIds.has(repayment.repaymentId)) {
      failExpenseDomain('duplicate_repayment', { repaymentId: repayment.repaymentId })
    }
    repaymentIds.add(repayment.repaymentId)
    const obligationRepayments = repaymentsByObligation.get(repayment.obligationId) ?? []
    obligationRepayments.push(repayment)
    repaymentsByObligation.set(repayment.obligationId, obligationRepayments)
    return repayment
  })
  for (const [obligationId, obligationRepayments] of repaymentsByObligation) {
    const obligation = obligationsById.get(obligationId)
    if (!obligation) {
      failExpenseDomain('repayment_obligation_mismatch', { obligationId })
    }
    calculateRepaymentProgress(obligation, obligationRepayments)
  }
  validatedRepayments.sort((left, right) => compareStableIds(left.repaymentId, right.repaymentId))

  for (const repayment of validatedRepayments) {
    if (repayment.status !== 'confirmed') continue

    const currency = normalizeCurrency(repayment.currency)
    // Paying a debt moves both parties towards zero: the debtor's negative
    // balance increases and the recipient's positive balance decreases.
    // Overpayment is validated against the repayment's immutable obligation,
    // not against current net signs: original debt chains can legitimately
    // make an intermediary cross zero before all confirmed payments are applied.
    addBalance(combined, repayment.fromPartyId, currency, repayment.amountMinor)
    addBalance(combined, repayment.toPartyId, currency, -repayment.amountMinor)
  }

  const balances = flattenBalances(combined)
  assertBalancesSumToZero(balances)
  return balances
}

export function applySettlementTransfers(
  balances: readonly PartyBalance[],
  transfers: readonly SettlementTransfer[],
): PartyBalance[] {
  const combined = new Map<string, Map<string, number>>()
  for (const balance of combinePartyBalances(balances)) {
    addBalance(combined, balance.partyId, balance.currency, balance.amountMinor)
  }
  for (const transfer of transfers) {
    assertPartyId(transfer.fromPartyId)
    assertPartyId(transfer.toPartyId)
    if (transfer.fromPartyId === transfer.toPartyId) {
      failExpenseDomain('invalid_transfer')
    }
    assertMinorAmount(transfer.amountMinor)
    const currency = normalizeCurrency(transfer.currency)
    addBalance(combined, transfer.fromPartyId, currency, transfer.amountMinor)
    addBalance(combined, transfer.toPartyId, currency, -transfer.amountMinor)
  }
  return flattenBalances(combined)
}

export function simplifySettlement(balances: readonly PartyBalance[]): SettlementTransfer[] {
  const combined = combinePartyBalances(balances)
  assertBalancesSumToZero(combined)
  const currencies = [...new Set(combined.map((balance) => balance.currency))].sort(compareStableIds)
  const transfers: SettlementTransfer[] = []

  for (const currency of currencies) {
    const currencyBalances = combined.filter((balance) => balance.currency === currency)
    const creditors = currencyBalances
      .filter((balance) => balance.amountMinor > 0)
      .map((balance) => ({ partyId: balance.partyId, remainingMinor: balance.amountMinor }))
      .sort((left, right) =>
        right.remainingMinor - left.remainingMinor || compareStableIds(left.partyId, right.partyId),
      )
    const debtors = currencyBalances
      .filter((balance) => balance.amountMinor < 0)
      .map((balance) => ({ partyId: balance.partyId, remainingMinor: -balance.amountMinor }))
      .sort((left, right) =>
        right.remainingMinor - left.remainingMinor || compareStableIds(left.partyId, right.partyId),
      )

    let creditorIndex = 0
    let debtorIndex = 0
    while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
      const creditor = creditors[creditorIndex]!
      const debtor = debtors[debtorIndex]!
      const amountMinor = Math.min(creditor.remainingMinor, debtor.remainingMinor)
      transfers.push({
        fromPartyId: debtor.partyId,
        toPartyId: creditor.partyId,
        amountMinor,
        currency,
      })
      creditor.remainingMinor -= amountMinor
      debtor.remainingMinor -= amountMinor
      if (creditor.remainingMinor === 0) creditorIndex += 1
      if (debtor.remainingMinor === 0) debtorIndex += 1
    }

    if (creditorIndex !== creditors.length || debtorIndex !== debtors.length) {
      failExpenseDomain('balance_total_not_zero', { currency })
    }
  }

  const settled = applySettlementTransfers(combined, transfers)
  if (settled.some((balance) => balance.amountMinor !== 0)) {
    failExpenseDomain('balance_total_not_zero')
  }
  return transfers
}

function transferKey(transfer: Pick<SettlementTransfer, 'fromPartyId' | 'toPartyId' | 'currency'>): string {
  return `${transfer.currency}:${transfer.fromPartyId}:${transfer.toPartyId}`
}

/**
 * Reported repayments are pending cash claims, not mutable ledger rows. After
 * an expense edit, a pending claim may no longer fit the confirmed-only
 * settlement direction or amount. Keep the claim, but require review before
 * another repayment can be reported for the group.
 */
export function reportedRepaymentsNeedingReview(
  confirmedOnlyBalances: readonly PartyBalance[],
  reportedRepayments: readonly SettlementTransfer[],
): Set<string> {
  const reportedByTransfer = new Map<string, number>()
  for (const repayment of reportedRepayments) {
    assertPartyId(repayment.fromPartyId)
    assertPartyId(repayment.toPartyId)
    if (repayment.fromPartyId === repayment.toPartyId) failExpenseDomain('invalid_transfer')
    assertMinorAmount(repayment.amountMinor)
    const key = transferKey({ ...repayment, currency: normalizeCurrency(repayment.currency) })
    reportedByTransfer.set(key, addMinorAmounts(reportedByTransfer.get(key) ?? 0, repayment.amountMinor))
  }

  const currentByTransfer = new Map(
    simplifySettlement(confirmedOnlyBalances).map((transfer) => [transferKey(transfer), transfer.amountMinor]),
  )
  return new Set(
    [...reportedByTransfer.entries()]
      .filter(([key, amountMinor]) => amountMinor > (currentByTransfer.get(key) ?? 0))
      .map(([key]) => key),
  )
}

export function settlementTransferReviewKey(
  transfer: Pick<SettlementTransfer, 'fromPartyId' | 'toPartyId' | 'currency'>,
): string {
  return transferKey({ ...transfer, currency: normalizeCurrency(transfer.currency) })
}
