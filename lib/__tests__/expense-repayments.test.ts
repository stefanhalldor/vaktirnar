import { describe, expect, it } from 'vitest'
import {
  ExpenseDomainError,
  assertFinancialEditAllowed,
  calculateRepaymentProgress,
  getFinancialEditDecision,
  transitionRepaymentStatus,
  validateNewRepayment,
} from '@/lib/expenses'
import type { ExpenseDomainErrorCode } from '@/lib/expenses/domain-error'
import type { DebtObligation, Repayment } from '@/lib/expenses/types'

function expectDomainError(run: () => unknown, code: ExpenseDomainErrorCode): void {
  try {
    run()
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(ExpenseDomainError)
    expect((error as ExpenseDomainError).code).toBe(code)
  }
}

const debt: DebtObligation = {
  obligationId: 'debt-1',
  fromPartyId: 'debtor',
  toPartyId: 'creditor',
  amountMinor: 10_000,
  currency: 'ISK',
}

function repayment(
  repaymentId: string,
  amountMinor: number,
  status: Repayment['status'] = 'reported',
): Repayment {
  return {
    repaymentId,
    obligationId: 'debt-1',
    fromPartyId: 'debtor',
    toPartyId: 'creditor',
    amountMinor,
    currency: 'ISK',
    status,
  }
}

describe('repayment progress and validation', () => {
  it('supports a full confirmed repayment', () => {
    expect(calculateRepaymentProgress(debt, [repayment('one', 10_000, 'confirmed')])).toEqual({
      confirmedMinor: 10_000,
      reportedMinor: 0,
      activeMinor: 10_000,
      remainingAfterConfirmationMinor: 0,
      availableToReportMinor: 0,
    })
  })

  it('supports partial and multiple partial repayments', () => {
    expect(calculateRepaymentProgress(debt, [
      repayment('one', 4_000, 'confirmed'),
      repayment('two', 2_000, 'confirmed'),
      repayment('three', 1_000, 'reported'),
    ])).toEqual({
      confirmedMinor: 6_000,
      reportedMinor: 1_000,
      activeMinor: 7_000,
      remainingAfterConfirmationMinor: 4_000,
      availableToReportMinor: 3_000,
    })
  })

  it('does not let rejected or cancelled repayments reduce the debt', () => {
    expect(calculateRepaymentProgress(debt, [
      repayment('rejected', 8_000, 'rejected'),
      repayment('cancelled', 9_000, 'cancelled'),
    ])).toEqual({
      confirmedMinor: 0,
      reportedMinor: 0,
      activeMinor: 0,
      remainingAfterConfirmationMinor: 10_000,
      availableToReportMinor: 10_000,
    })
  })

  it('reserves reported amounts so concurrent reports cannot exceed the debt', () => {
    expectDomainError(
      () => validateNewRepayment(debt, repayment('new', 4_001), [
        repayment('confirmed', 4_000, 'confirmed'),
        repayment('pending', 2_000, 'reported'),
      ]),
      'repayment_exceeds_debt',
    )
    expect(validateNewRepayment(debt, repayment('new', 4_000), [
      repayment('confirmed', 4_000, 'confirmed'),
      repayment('pending', 2_000, 'reported'),
    ]).availableToReportMinor).toBe(0)
  })

  it('rejects an overpayment, a wrong currency and reversed parties', () => {
    expectDomainError(
      () => validateNewRepayment(debt, repayment('over', 10_001), []),
      'repayment_exceeds_debt',
    )
    expectDomainError(
      () => validateNewRepayment(debt, { ...repayment('eur', 1_000), currency: 'EUR' }, []),
      'repayment_currency_mismatch',
    )
    expectDomainError(
      () => validateNewRepayment(debt, {
        ...repayment('reverse', 1_000),
        fromPartyId: 'creditor',
        toPartyId: 'debtor',
      }, []),
      'repayment_parties_mismatch',
    )
  })

  it('rejects a repayment linked to a different immutable obligation', () => {
    expectDomainError(
      () => validateNewRepayment(debt, { ...repayment('wrong-debt', 1_000), obligationId: 'debt-2' }, []),
      'repayment_obligation_mismatch',
    )
  })

  it('rejects duplicate repayment IDs and non-reported new records', () => {
    expectDomainError(
      () => calculateRepaymentProgress(debt, [
        repayment('same', 1_000, 'confirmed'),
        repayment('same', 1_000, 'reported'),
      ]),
      'duplicate_repayment',
    )
    expectDomainError(
      () => validateNewRepayment(debt, repayment('new', 1_000, 'confirmed'), []),
      'repayment_status_invalid',
    )
  })
})

describe('repayment state machine', () => {
  it('allows confirmation, rejection or cancellation only from a reported record', () => {
    const reported = repayment('one', 1_000)
    expect(transitionRepaymentStatus(reported, 'confirmed').status).toBe('confirmed')
    expect(transitionRepaymentStatus(reported, 'rejected').status).toBe('rejected')
    expect(transitionRepaymentStatus(reported, 'cancelled').status).toBe('cancelled')
  })

  it('rejects double confirmation and terminal-state resurrection', () => {
    expectDomainError(
      () => transitionRepaymentStatus(repayment('one', 1_000, 'confirmed'), 'confirmed'),
      'repayment_transition_invalid',
    )
    expectDomainError(
      () => transitionRepaymentStatus(repayment('one', 1_000, 'rejected'), 'confirmed'),
      'repayment_transition_invalid',
    )
    expectDomainError(
      () => transitionRepaymentStatus(repayment('one', 1_000, 'cancelled'), 'reported'),
      'repayment_transition_invalid',
    )
  })

  it('allows an explicit cancellation of a confirmed payment for audited correction', () => {
    expect(transitionRepaymentStatus(repayment('one', 1_000, 'confirmed'), 'cancelled')).toEqual(
      repayment('one', 1_000, 'cancelled'),
    )
  })
})

describe('financial edit safety', () => {
  it('allows payment distribution changes before settlement starts', () => {
    expect(getFinancialEditDecision({ expenseStatus: 'draft', hasConfirmedRepayments: false })).toEqual({ allowed: true })
    expect(getFinancialEditDecision({ expenseStatus: 'active', hasConfirmedRepayments: false })).toEqual({ allowed: true })
  })

  it('blocks silent edits after a confirmed repayment', () => {
    expect(getFinancialEditDecision({ expenseStatus: 'active', hasConfirmedRepayments: true })).toEqual({
      allowed: false,
      reason: 'confirmed_repayment_exists',
    })
    expectDomainError(
      () => assertFinancialEditAllowed({ expenseStatus: 'active', hasConfirmedRepayments: true }),
      'financial_edit_blocked',
    )
  })

  it('blocks edits once settlement starts or an expense is cancelled', () => {
    expect(getFinancialEditDecision({ expenseStatus: 'settling', hasConfirmedRepayments: false })).toEqual({
      allowed: false,
      reason: 'settlement_started',
    })
    expect(getFinancialEditDecision({ expenseStatus: 'settled', hasConfirmedRepayments: false })).toEqual({
      allowed: false,
      reason: 'settlement_started',
    })
    expect(getFinancialEditDecision({ expenseStatus: 'cancelled', hasConfirmedRepayments: false })).toEqual({
      allowed: false,
      reason: 'expense_cancelled',
    })
  })
})
