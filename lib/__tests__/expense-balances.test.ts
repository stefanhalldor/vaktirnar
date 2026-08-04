import { describe, expect, it } from 'vitest'
import {
  ExpenseDomainError,
  aggregateLedgerBalances,
  applySettlementTransfers,
  calculateExpenseBalances,
  simplifySettlement,
  splitByFixedAmounts,
  splitByPercentage,
  splitEqual,
  splitMixedEqualRemainder,
} from '@/lib/expenses'
import type {
  ExpenseDomainErrorCode,
} from '@/lib/expenses/domain-error'
import type {
  ExpenseFinancials,
  ExpenseLedgerEntry,
  ExpensePayment,
  ExpenseShare,
  PartyBalance,
  Repayment,
} from '@/lib/expenses/types'

function expectDomainError(run: () => unknown, code: ExpenseDomainErrorCode): void {
  try {
    run()
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(ExpenseDomainError)
    expect((error as ExpenseDomainError).code).toBe(code)
  }
}

const payment = (payerId: string, amountMinor: number, currency = 'ISK'): ExpensePayment => ({
  payerId,
  amountMinor,
  currency,
})

const share = (participantId: string, amountMinor: number, currency = 'ISK'): ExpenseShare => ({
  participantId,
  amountMinor,
  currency,
})

function financials(input: Partial<ExpenseFinancials> = {}): ExpenseFinancials {
  return {
    expenseId: 'expense-1',
    totalMinor: 30_000,
    currency: 'ISK',
    payments: [payment('stefan', 30_000)],
    shares: [share('anna', 10_000), share('jon', 10_000), share('stefan', 10_000)],
    ...input,
  }
}

describe('expense payments, shares and net balances', () => {
  it('calculates one payer who also bears a share', () => {
    expect(calculateExpenseBalances(financials())).toEqual([
      { partyId: 'anna', amountMinor: -10_000, currency: 'ISK' },
      { partyId: 'jon', amountMinor: -10_000, currency: 'ISK' },
      { partyId: 'stefan', amountMinor: 20_000, currency: 'ISK' },
    ])
  })

  it('keeps two initial payers separate from the cost participants', () => {
    expect(calculateExpenseBalances(financials({
      payments: [payment('stefan', 20_000), payment('anna', 10_000)],
    }))).toEqual([
      { partyId: 'anna', amountMinor: 0, currency: 'ISK' },
      { partyId: 'jon', amountMinor: -10_000, currency: 'ISK' },
      { partyId: 'stefan', amountMinor: 10_000, currency: 'ISK' },
    ])
  })

  it('calculates unequal payments with multiple creditors', () => {
    expect(calculateExpenseBalances(financials({
      payments: [payment('stefan', 18_000), payment('anna', 12_000)],
      shares: [
        share('stefan', 7_500),
        share('anna', 7_500),
        share('jon', 7_500),
        share('maria', 7_500),
      ],
    }))).toEqual([
      { partyId: 'anna', amountMinor: 4_500, currency: 'ISK' },
      { partyId: 'jon', amountMinor: -7_500, currency: 'ISK' },
      { partyId: 'maria', amountMinor: -7_500, currency: 'ISK' },
      { partyId: 'stefan', amountMinor: 10_500, currency: 'ISK' },
    ])
  })

  it('supports a payer who is not a participant and participants who paid nothing', () => {
    expect(calculateExpenseBalances(financials({
      totalMinor: 100,
      payments: [payment('sponsor', 100)],
      shares: [share('a', 50), share('b', 50)],
    }))).toEqual([
      { partyId: 'a', amountMinor: -50, currency: 'ISK' },
      { partyId: 'b', amountMinor: -50, currency: 'ISK' },
      { partyId: 'sponsor', amountMinor: 100, currency: 'ISK' },
    ])
  })

  it('preserves an explicit zero share', () => {
    expect(calculateExpenseBalances(financials({
      totalMinor: 100,
      payments: [payment('a', 100)],
      shares: [share('a', 100), share('b', 0)],
    }))).toEqual([
      { partyId: 'a', amountMinor: 0, currency: 'ISK' },
      { partyId: 'b', amountMinor: 0, currency: 'ISK' },
    ])
  })

  it.each([
    ['under', [payment('a', 9_999)]],
    ['over', [payment('a', 10_001)]],
  ])('rejects payments %s the expense total', (_label, payments) => {
    expectDomainError(
      () => calculateExpenseBalances(financials({
        totalMinor: 10_000,
        payments,
        shares: [share('a', 10_000)],
      })),
      'payment_total_mismatch',
    )
  })

  it('rejects duplicate, zero and negative payer amounts', () => {
    expectDomainError(
      () => calculateExpenseBalances(financials({
        payments: [payment('a', 15_000), payment('a', 15_000)],
      })),
      'duplicate_payer',
    )
    expectDomainError(
      () => calculateExpenseBalances(financials({
        payments: [payment('a', 30_000), payment('b', 0)],
      })),
      'invalid_amount',
    )
    expectDomainError(
      () => calculateExpenseBalances(financials({
        payments: [payment('a', 30_001), payment('b', -1)],
      })),
      'invalid_amount',
    )
  })

  it('rejects payment and share currencies that differ from the expense', () => {
    expectDomainError(
      () => calculateExpenseBalances(financials({
        payments: [payment('stefan', 30_000, 'EUR')],
      })),
      'payment_currency_mismatch',
    )
    expectDomainError(
      () => calculateExpenseBalances(financials({
        shares: [share('stefan', 30_000, 'EUR')],
      })),
      'share_currency_mismatch',
    )
  })

  it('rejects shares that do not add up to the expense total', () => {
    expectDomainError(
      () => calculateExpenseBalances(financials({ shares: [share('stefan', 29_999)] })),
      'share_total_mismatch',
    )
  })

  it('accepts shares produced by every split method with multiple payers', () => {
    const splitVariants = [
      splitEqual(30_000, 'ISK', ['a', 'b', 'c']),
      splitByPercentage(30_000, 'ISK', [
        { participantId: 'a', basisPoints: 5_000 },
        { participantId: 'b', basisPoints: 3_000 },
        { participantId: 'c', basisPoints: 2_000 },
      ]),
      splitByFixedAmounts(30_000, 'ISK', [
        { participantId: 'a', amountMinor: 11_000 },
        { participantId: 'b', amountMinor: 10_000 },
        { participantId: 'c', amountMinor: 9_000 },
      ]),
      splitMixedEqualRemainder(30_000, 'ISK', [
        { participantId: 'a', fixedMinor: 6_000, participatesInRemainder: false },
        { participantId: 'b', fixedMinor: 0, participatesInRemainder: true },
        { participantId: 'c', fixedMinor: 0, participatesInRemainder: true },
      ]),
    ]
    for (const shares of splitVariants) {
      const balances = calculateExpenseBalances(financials({
        payments: [payment('payer-1', 18_000), payment('payer-2', 12_000)],
        shares,
      }))
      expect(balances.reduce((sum, balance) => sum + balance.amountMinor, 0)).toBe(0)
    }
  })
})

describe('ledger aggregation and confirmed repayments', () => {
  const activeExpense = (input: Partial<ExpenseLedgerEntry>): ExpenseLedgerEntry => ({
    ...financials(),
    status: 'active',
    ...input,
  })

  it('aggregates several expenses by party and excludes drafts and cancelled expenses', () => {
    const result = aggregateLedgerBalances([
      activeExpense({
        expenseId: 'one', totalMinor: 100,
        payments: [payment('a', 100)], shares: [share('a', 50), share('b', 50)],
      }),
      activeExpense({
        expenseId: 'two', totalMinor: 40,
        payments: [payment('b', 40)], shares: [share('a', 20), share('b', 20)],
      }),
      activeExpense({
        expenseId: 'cancelled', status: 'cancelled', totalMinor: 999,
        payments: [], shares: [],
      }),
      activeExpense({
        expenseId: 'draft', status: 'draft', totalMinor: 999,
        payments: [], shares: [],
      }),
    ])
    expect(result).toEqual([
      { partyId: 'a', amountMinor: 30, currency: 'ISK' },
      { partyId: 'b', amountMinor: -30, currency: 'ISK' },
    ])
  })

  it('rejects duplicate expense IDs before they can double-count a join or retry', () => {
    const duplicate = activeExpense({
      expenseId: 'same', totalMinor: 100,
      payments: [payment('a', 100)], shares: [share('b', 100)],
    })
    expectDomainError(
      () => aggregateLedgerBalances([duplicate, { ...duplicate }]),
      'duplicate_expense',
    )
  })

  it('keeps currencies in independent balances', () => {
    const result = aggregateLedgerBalances([
      activeExpense({
        expenseId: 'isk', totalMinor: 100,
        payments: [payment('a', 100)], shares: [share('b', 100)],
      }),
      activeExpense({
        expenseId: 'eur', totalMinor: 50, currency: 'EUR',
        payments: [payment('b', 50, 'EUR')], shares: [share('a', 50, 'EUR')],
      }),
    ])
    expect(result).toEqual([
      { partyId: 'a', amountMinor: -50, currency: 'EUR' },
      { partyId: 'b', amountMinor: 50, currency: 'EUR' },
      { partyId: 'a', amountMinor: 100, currency: 'ISK' },
      { partyId: 'b', amountMinor: -100, currency: 'ISK' },
    ])
  })

  it('applies only confirmed repayments exactly once', () => {
    const expense = activeExpense({
      totalMinor: 100,
      payments: [payment('a', 100)],
      shares: [share('b', 100)],
    })
    const repayments: Repayment[] = [
      { repaymentId: 'confirmed', obligationId: 'debt-1', fromPartyId: 'b', toPartyId: 'a', amountMinor: 40, currency: 'ISK', status: 'confirmed' },
      { repaymentId: 'reported', obligationId: 'debt-1', fromPartyId: 'b', toPartyId: 'a', amountMinor: 20, currency: 'ISK', status: 'reported' },
      { repaymentId: 'rejected', obligationId: 'debt-1', fromPartyId: 'b', toPartyId: 'a', amountMinor: 10, currency: 'ISK', status: 'rejected' },
      { repaymentId: 'cancelled', obligationId: 'debt-1', fromPartyId: 'b', toPartyId: 'a', amountMinor: 10, currency: 'ISK', status: 'cancelled' },
    ]
    const obligations = [{
      obligationId: 'debt-1', fromPartyId: 'b', toPartyId: 'a', amountMinor: 100, currency: 'ISK',
    }]
    expect(aggregateLedgerBalances([expense], repayments, obligations)).toEqual([
      { partyId: 'a', amountMinor: 60, currency: 'ISK' },
      { partyId: 'b', amountMinor: -60, currency: 'ISK' },
    ])
    expectDomainError(
      () => aggregateLedgerBalances([expense], [repayments[0]!, repayments[0]!], obligations),
      'duplicate_repayment',
    )
  })

  it('can settle original obligations through an intermediary even when netting crosses zero', () => {
    const expenses = [
      activeExpense({
        expenseId: 'anna-owes-stefan', totalMinor: 5_000,
        payments: [payment('stefan', 5_000)], shares: [share('anna', 5_000)],
      }),
      activeExpense({
        expenseId: 'stefan-owes-jon', totalMinor: 4_000,
        payments: [payment('jon', 4_000)], shares: [share('stefan', 4_000)],
      }),
    ]
    const repayments: Repayment[] = [
      {
        repaymentId: 'anna-to-stefan', obligationId: 'original-debt-1',
        fromPartyId: 'anna', toPartyId: 'stefan', amountMinor: 5_000,
        currency: 'ISK', status: 'confirmed',
      },
      {
        repaymentId: 'stefan-to-jon', obligationId: 'original-debt-2',
        fromPartyId: 'stefan', toPartyId: 'jon', amountMinor: 4_000,
        currency: 'ISK', status: 'confirmed',
      },
    ]
    const obligations = [
      {
        obligationId: 'original-debt-1', fromPartyId: 'anna', toPartyId: 'stefan',
        amountMinor: 5_000, currency: 'ISK',
      },
      {
        obligationId: 'original-debt-2', fromPartyId: 'stefan', toPartyId: 'jon',
        amountMinor: 4_000, currency: 'ISK',
      },
    ]
    expect(aggregateLedgerBalances(expenses, repayments, obligations)).toEqual([
      { partyId: 'anna', amountMinor: 0, currency: 'ISK' },
      { partyId: 'jon', amountMinor: 0, currency: 'ISK' },
      { partyId: 'stefan', amountMinor: 0, currency: 'ISK' },
    ])
  })

  it('rejects ledger aggregation when a repayment bypasses its obligation invariant', () => {
    const expense = activeExpense({
      totalMinor: 100,
      payments: [payment('a', 100)],
      shares: [share('b', 100)],
    })
    const overpayment: Repayment = {
      repaymentId: 'too-much', obligationId: 'debt-1',
      fromPartyId: 'b', toPartyId: 'a', amountMinor: 101,
      currency: 'ISK', status: 'confirmed',
    }
    expectDomainError(
      () => aggregateLedgerBalances([expense], [overpayment], [{
        obligationId: 'debt-1', fromPartyId: 'b', toPartyId: 'a', amountMinor: 100, currency: 'ISK',
      }]),
      'repayment_exceeds_debt',
    )
    expectDomainError(
      () => aggregateLedgerBalances([expense], [{ ...overpayment, amountMinor: 50 }]),
      'repayment_obligation_mismatch',
    )
  })
})

describe('deterministic simplified settlement', () => {
  it('settles a two-person balance', () => {
    const balances: PartyBalance[] = [
      { partyId: 'a', currency: 'ISK', amountMinor: 5_000 },
      { partyId: 'b', currency: 'ISK', amountMinor: -5_000 },
    ]
    expect(simplifySettlement(balances)).toEqual([
      { fromPartyId: 'b', toPartyId: 'a', amountMinor: 5_000, currency: 'ISK' },
    ])
  })

  it('simplifies a three-person debt chain without changing net positions', () => {
    const balances: PartyBalance[] = [
      { partyId: 'anna', currency: 'ISK', amountMinor: -5_000 },
      { partyId: 'stefan', currency: 'ISK', amountMinor: 1_000 },
      { partyId: 'jon', currency: 'ISK', amountMinor: 4_000 },
    ]
    const transfers = simplifySettlement(balances)
    expect(transfers).toEqual([
      { fromPartyId: 'anna', toPartyId: 'jon', amountMinor: 4_000, currency: 'ISK' },
      { fromPartyId: 'anna', toPartyId: 'stefan', amountMinor: 1_000, currency: 'ISK' },
    ])
    expect(applySettlementTransfers(balances, transfers).every((balance) => balance.amountMinor === 0)).toBe(true)
  })

  it('handles multiple creditors deterministically regardless of input order', () => {
    const balances: PartyBalance[] = [
      { partyId: 'maria', currency: 'ISK', amountMinor: -7_500 },
      { partyId: 'anna', currency: 'ISK', amountMinor: 4_500 },
      { partyId: 'stefan', currency: 'ISK', amountMinor: 10_500 },
      { partyId: 'jon', currency: 'ISK', amountMinor: -7_500 },
    ]
    const transfers = simplifySettlement(balances)
    expect(transfers).toEqual([
      { fromPartyId: 'jon', toPartyId: 'stefan', amountMinor: 7_500, currency: 'ISK' },
      { fromPartyId: 'maria', toPartyId: 'stefan', amountMinor: 3_000, currency: 'ISK' },
      { fromPartyId: 'maria', toPartyId: 'anna', amountMinor: 4_500, currency: 'ISK' },
    ])
    expect(simplifySettlement([...balances].reverse())).toEqual(transfers)
  })

  it('settles each currency independently and returns no transfers for all-zero balances', () => {
    expect(simplifySettlement([
      { partyId: 'a', currency: 'ISK', amountMinor: 0 },
      { partyId: 'b', currency: 'EUR', amountMinor: 0 },
    ])).toEqual([])

    expect(simplifySettlement([
      { partyId: 'a', currency: 'ISK', amountMinor: 100 },
      { partyId: 'b', currency: 'ISK', amountMinor: -100 },
      { partyId: 'a', currency: 'EUR', amountMinor: -50 },
      { partyId: 'b', currency: 'EUR', amountMinor: 50 },
    ])).toEqual([
      { fromPartyId: 'a', toPartyId: 'b', amountMinor: 50, currency: 'EUR' },
      { fromPartyId: 'b', toPartyId: 'a', amountMinor: 100, currency: 'ISK' },
    ])
  })

  it('rejects a currency balance that does not sum to zero', () => {
    expectDomainError(
      () => simplifySettlement([{ partyId: 'a', currency: 'ISK', amountMinor: 1 }]),
      'balance_total_not_zero',
    )
  })

  it('preserves and settles generated zero-sum balances deterministically', () => {
    let seed = 23
    const next = () => {
      seed = (seed * 48_271) % 2_147_483_647
      return seed
    }
    for (let caseIndex = 0; caseIndex < 100; caseIndex += 1) {
      const amounts = Array.from({ length: 5 }, () => (next() % 20_001) - 10_000)
      amounts.push(-amounts.reduce((sum, amount) => sum + amount, 0))
      const balances = amounts.map((amountMinor, index) => ({
        partyId: `party-${index}`,
        currency: 'ISK',
        amountMinor,
      }))
      const transfers = simplifySettlement(balances)
      expect(simplifySettlement([...balances].reverse())).toEqual(transfers)
      expect(applySettlementTransfers(balances, transfers).every((balance) => balance.amountMinor === 0)).toBe(true)
    }
  })
})
