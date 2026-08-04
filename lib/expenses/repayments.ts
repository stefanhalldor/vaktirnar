import { failExpenseDomain } from './domain-error'
import {
  addMinorAmounts,
  assertMinorAmount,
  assertPartyId,
  normalizeCurrency,
} from './money'
import type {
  DebtObligation,
  ExpenseStatus,
  Repayment,
  RepaymentStatus,
} from './types'

export interface RepaymentProgress {
  confirmedMinor: number
  reportedMinor: number
  activeMinor: number
  remainingAfterConfirmationMinor: number
  availableToReportMinor: number
}

function validateDebt(debt: DebtObligation): DebtObligation {
  if (!debt.obligationId?.trim()) {
    failExpenseDomain('repayment_obligation_mismatch')
  }
  assertPartyId(debt.fromPartyId)
  assertPartyId(debt.toPartyId)
  if (debt.fromPartyId === debt.toPartyId) {
    failExpenseDomain('invalid_transfer')
  }
  return {
    ...debt,
    amountMinor: assertMinorAmount(debt.amountMinor),
    currency: normalizeCurrency(debt.currency),
  }
}

function validateRepaymentForDebt(
  debt: DebtObligation,
  repayment: Repayment,
): Repayment {
  if (!repayment.repaymentId?.trim()) {
    failExpenseDomain('invalid_repayment_id')
  }
  if (repayment.obligationId !== debt.obligationId) {
    failExpenseDomain('repayment_obligation_mismatch')
  }
  assertPartyId(repayment.fromPartyId)
  assertPartyId(repayment.toPartyId)
  if (
    repayment.fromPartyId !== debt.fromPartyId ||
    repayment.toPartyId !== debt.toPartyId
  ) {
    failExpenseDomain('repayment_parties_mismatch')
  }
  const currency = normalizeCurrency(repayment.currency)
  if (currency !== debt.currency) {
    failExpenseDomain('repayment_currency_mismatch', {
      expectedCurrency: debt.currency,
      actualCurrency: currency,
    })
  }
  if (!['reported', 'confirmed', 'rejected', 'cancelled'].includes(repayment.status)) {
    failExpenseDomain('repayment_status_invalid')
  }
  return {
    ...repayment,
    amountMinor: assertMinorAmount(repayment.amountMinor),
    currency,
  }
}

export function calculateRepaymentProgress(
  rawDebt: DebtObligation,
  rawRepayments: readonly Repayment[],
): RepaymentProgress {
  const debt = validateDebt(rawDebt)
  const seenIds = new Set<string>()
  let confirmedMinor = 0
  let reportedMinor = 0

  for (const rawRepayment of rawRepayments) {
    const repayment = validateRepaymentForDebt(debt, rawRepayment)
    if (seenIds.has(repayment.repaymentId)) {
      failExpenseDomain('duplicate_repayment', { repaymentId: repayment.repaymentId })
    }
    seenIds.add(repayment.repaymentId)
    if (repayment.status === 'confirmed') {
      confirmedMinor = addMinorAmounts(confirmedMinor, repayment.amountMinor)
    } else if (repayment.status === 'reported') {
      reportedMinor = addMinorAmounts(reportedMinor, repayment.amountMinor)
    }
  }

  const activeMinor = addMinorAmounts(confirmedMinor, reportedMinor)
  if (confirmedMinor > debt.amountMinor || activeMinor > debt.amountMinor) {
    failExpenseDomain('repayment_exceeds_debt', {
      debtMinor: debt.amountMinor,
      confirmedMinor,
      activeMinor,
    })
  }
  return {
    confirmedMinor,
    reportedMinor,
    activeMinor,
    remainingAfterConfirmationMinor: debt.amountMinor - confirmedMinor,
    availableToReportMinor: debt.amountMinor - activeMinor,
  }
}

export function validateNewRepayment(
  rawDebt: DebtObligation,
  rawCandidate: Repayment,
  existingRepayments: readonly Repayment[],
): RepaymentProgress {
  const debt = validateDebt(rawDebt)
  const candidate = validateRepaymentForDebt(debt, rawCandidate)
  if (candidate.status !== 'reported') {
    failExpenseDomain('repayment_status_invalid', { status: candidate.status })
  }
  if (existingRepayments.some((repayment) => repayment.repaymentId === candidate.repaymentId)) {
    failExpenseDomain('duplicate_repayment', { repaymentId: candidate.repaymentId })
  }
  return calculateRepaymentProgress(debt, [...existingRepayments, candidate])
}

const ALLOWED_REPAYMENT_TRANSITIONS: Readonly<Record<RepaymentStatus, readonly RepaymentStatus[]>> = {
  reported: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['cancelled'],
  rejected: [],
  cancelled: [],
}

export function transitionRepaymentStatus(
  repayment: Repayment,
  nextStatus: RepaymentStatus,
): Repayment {
  const allowed = ALLOWED_REPAYMENT_TRANSITIONS[repayment.status]
  if (!allowed || !['reported', 'confirmed', 'rejected', 'cancelled'].includes(nextStatus) || !allowed.includes(nextStatus)) {
    failExpenseDomain('repayment_transition_invalid', {
      fromStatus: repayment.status,
      toStatus: nextStatus,
    })
  }
  return { ...repayment, status: nextStatus }
}

export type FinancialEditBlockReason =
  | 'confirmed_repayment_exists'
  | 'settlement_started'
  | 'expense_cancelled'

export type FinancialEditDecision =
  | { allowed: true }
  | { allowed: false; reason: FinancialEditBlockReason }

export function getFinancialEditDecision(input: {
  expenseStatus: ExpenseStatus
  hasConfirmedRepayments: boolean
}): FinancialEditDecision {
  if (input.hasConfirmedRepayments) {
    return { allowed: false, reason: 'confirmed_repayment_exists' }
  }
  if (input.expenseStatus === 'settling' || input.expenseStatus === 'settled') {
    return { allowed: false, reason: 'settlement_started' }
  }
  if (input.expenseStatus === 'cancelled') {
    return { allowed: false, reason: 'expense_cancelled' }
  }
  return { allowed: true }
}

export function assertFinancialEditAllowed(input: {
  expenseStatus: ExpenseStatus
  hasConfirmedRepayments: boolean
}): void {
  const decision = getFinancialEditDecision(input)
  if (!decision.allowed) {
    failExpenseDomain('financial_edit_blocked', { reason: decision.reason })
  }
}
