import { describe, expect, it } from 'vitest'
import type {
  ExpensePayAllBlockedContextView,
  ExpensePayAllContextView,
  ExpensePaymentSnapshotView,
} from '@/lib/expenses/contracts'
import {
  buildExpensePayAllView,
  buildExpensePayAllContext,
  expensePayAllSelfMemberIds,
  type ExpensePayAllCandidate,
} from '@/lib/expenses/pay-all'

function context(overrides: Partial<ExpensePayAllContextView> = {}): ExpensePayAllContextView {
  return {
    groupId: 'group-1',
    groupKind: 'group',
    groupName: 'Bústaðarferð',
    emoji: '🏡',
    amountMinor: 5_000,
    currency: 'ISK',
    expenses: [{ id: 'expense-1', title: 'Matur', incurredOn: '2026-08-08', amountMinor: 5_000 }],
    nettingAdjustmentMinor: 0,
    transfer: {
      fromMemberId: 'self', fromDisplayName: 'Ég', toMemberId: 'creditor', toDisplayName: 'Anna',
      amountMinor: 5_000, currency: 'ISK', expectedFinancialVersion: 1, canReport: true,
      paymentInstruction: null,
    },
    ...overrides,
  }
}

function instruction(overrides: Partial<ExpensePaymentSnapshotView> = {}): ExpensePaymentSnapshotView {
  return {
    title: 'payment_profile_v2',
    kind: 'bank_account',
    currency: 'ISK',
    details: { accountNumber: '0159-26-123456', nationalId: '010180-9999' },
    visibility: 'debt_context',
    capturedAt: '2026-08-09T12:00:00.000Z',
    ...overrides,
  }
}

function candidate(overrides: Partial<ExpensePayAllCandidate> = {}): ExpensePayAllCandidate {
  return {
    creditorKey: 'user:creditor-a',
    recipientDisplayName: 'Anna',
    amountMinor: 5_000,
    currency: 'ISK',
    paymentInstruction: instruction(),
    context: context(),
    ...overrides,
  }
}

describe('buildExpensePayAllView', () => {
  it('recognizes direct and canonical linked self balances regardless of debt count', () => {
    const ids = expensePayAllSelfMemberIds({
      balances: [
        { memberId: 'direct-self', displayName: 'Ég', currency: 'ISK', amountMinor: 0, isSelf: true },
        { memberId: 'linked-self', displayName: 'Pabbi', currency: 'ISK', amountMinor: -25_000, isSelf: true },
        { memberId: 'guest', displayName: 'Gestur', currency: 'ISK', amountMinor: -5_000, isSelf: false },
      ],
    })

    expect([...ids].sort()).toEqual(['direct-self', 'linked-self'])
  })

  it('combines the same creditor, currency and payment destination across contexts', () => {
    const view = buildExpensePayAllView([
      candidate(),
      candidate({
        amountMinor: 7_500,
        paymentInstruction: instruction({ capturedAt: '2026-08-09T12:00:01.000Z' }),
        context: context({
          groupId: 'group-2',
          groupName: 'Skíðaferð',
          amountMinor: 7_500,
          expenses: [{ id: 'expense-2', title: 'Gisting', incurredOn: '2026-08-07', amountMinor: 7_500 }],
        }),
      }),
    ], [])

    expect(view.payments).toHaveLength(1)
    expect(view.payments[0]).toMatchObject({
      id: 'payment-1',
      recipientDisplayName: 'Anna',
      amountMinor: 12_500,
      currency: 'ISK',
    })
    expect(view.payments[0]?.contexts.map((entry) => entry.groupName)).toEqual([
      'Bústaðarferð',
      'Skíðaferð',
    ])
  })

  it('never combines different creditors, currencies or payment destinations', () => {
    const view = buildExpensePayAllView([
      candidate(),
      candidate({ creditorKey: 'user:creditor-b', context: context({ groupId: 'group-2' }) }),
      candidate({
        currency: 'EUR',
        paymentInstruction: instruction({ currency: 'EUR' }),
        context: context({ groupId: 'group-3', currency: 'EUR' }),
      }),
      candidate({
        paymentInstruction: instruction({ details: { accountNumber: '0301-26-654321' } }),
        context: context({ groupId: 'group-4' }),
      }),
    ], [])

    expect(view.payments).toHaveLength(4)
  })

  it('keeps canonical creditor identities server-only and preserves blocked review contexts', () => {
    const blocked: ExpensePayAllBlockedContextView = {
      ...context({ groupId: 'review-group', groupName: 'Yfirferð' }),
      recipientDisplayName: 'Bjarni',
    }
    const view = buildExpensePayAllView([candidate()], [blocked])

    expect(JSON.stringify(view)).not.toContain('user:creditor-a')
    expect(view.blockedContexts).toEqual([blocked])
  })

  it('explains an exact transfer with only debt-causing entries and a reconciling adjustment', () => {
    const transfer = context().transfer
    const result = buildExpensePayAllContext({
      id: 'group-1', kind: 'group', name: 'Bústaðarferð', description: null, emoji: '🏡',
      defaultCurrency: 'ISK', defaultIncludeCreator: true, financialVersion: 1,
      status: 'active', role: 'member', canManage: false, canLeave: true,
      canCreateExpense: false, createdAt: '2026-08-01T00:00:00.000Z', members: [],
      expenses: [{
        id: 'expense-1', groupId: 'group-1', title: 'Matur', totalMinor: 10_000,
        currency: 'ISK', incurredOn: '2026-08-08', category: null, note: null,
        status: 'active', splitMethod: 'fixed', createdBySelf: false,
        createdAt: '2026-08-08T00:00:00.000Z', revisions: [],
        payments: [{ memberId: 'creditor', displayName: 'Anna', amountMinor: 10_000 }],
        shares: [
          { memberId: 'self', displayName: 'Ég', amountMinor: 8_000 },
          { memberId: 'creditor', displayName: 'Anna', amountMinor: 2_000 },
        ],
      }, {
        id: 'expense-2', groupId: 'group-1', title: 'Bensín', totalMinor: 5_000,
        currency: 'ISK', incurredOn: '2026-08-07', category: null, note: null,
        status: 'active', splitMethod: 'fixed', createdBySelf: true,
        createdAt: '2026-08-07T00:00:00.000Z', revisions: [],
        payments: [{ memberId: 'self', displayName: 'Ég', amountMinor: 5_000 }],
        shares: [
          { memberId: 'self', displayName: 'Ég', amountMinor: 2_000 },
          { memberId: 'creditor', displayName: 'Anna', amountMinor: 3_000 },
        ],
      }, {
        id: 'cancelled', groupId: 'group-1', title: 'Fellt niður', totalMinor: 2_000,
        currency: 'ISK', incurredOn: '2026-08-06', category: null, note: null,
        status: 'cancelled', splitMethod: 'fixed', createdBySelf: false,
        createdAt: '2026-08-06T00:00:00.000Z', revisions: [], payments: [],
        shares: [{ memberId: 'self', displayName: 'Ég', amountMinor: 2_000 }],
      }],
      balances: [], settlementTransfers: [transfer], settlementRequiresReview: false,
      repayments: [], activity: [],
    }, transfer)

    expect(result.expenses).toEqual([{
      id: 'expense-1', title: 'Matur', incurredOn: '2026-08-08', amountMinor: 8_000,
    }])
    expect(result.nettingAdjustmentMinor).toBe(-3_000)
    expect(result.expenses.reduce((sum, expense) => sum + expense.amountMinor, 0)
      + result.nettingAdjustmentMinor).toBe(result.amountMinor)
  })

  it('shows two exact debt entries when their amounts make up the whole transfer', () => {
    const transfer = {
      ...context().transfer,
      amountMinor: 25_000,
    }
    const baseExpense = {
      groupId: 'group-1', currency: 'ISK', category: null, note: null,
      status: 'active' as const, splitMethod: 'fixed' as const,
      createdBySelf: false, revisions: [],
    }
    const result = buildExpensePayAllContext({
      id: 'group-1', kind: 'group', name: 'Fjölskyldan', description: null, emoji: null,
      defaultCurrency: 'ISK', defaultIncludeCreator: true, financialVersion: 1,
      status: 'active', role: 'member', canManage: false, canLeave: true,
      canCreateExpense: false, createdAt: '2026-08-01T00:00:00.000Z', members: [],
      expenses: [{
        ...baseExpense, id: 'expense-1', title: 'Færsla A', totalMinor: 10_000,
        incurredOn: '2026-08-08', createdAt: '2026-08-08T00:00:00.000Z',
        payments: [{ memberId: 'creditor', displayName: 'Anna', amountMinor: 10_000 }],
        shares: [{ memberId: 'self', displayName: 'Ég', amountMinor: 10_000 }],
      }, {
        ...baseExpense, id: 'expense-2', title: 'Færsla B', totalMinor: 15_000,
        incurredOn: '2026-08-09', createdAt: '2026-08-09T00:00:00.000Z',
        payments: [{ memberId: 'creditor', displayName: 'Anna', amountMinor: 15_000 }],
        shares: [{ memberId: 'self', displayName: 'Ég', amountMinor: 15_000 }],
      }],
      balances: [], settlementTransfers: [transfer], settlementRequiresReview: false,
      repayments: [], activity: [],
    }, transfer)

    expect(result.expenses.map((expense) => [expense.title, expense.amountMinor])).toEqual([
      ['Færsla A', 10_000],
      ['Færsla B', 15_000],
    ])
    expect(result.nettingAdjustmentMinor).toBe(0)
  })
})
