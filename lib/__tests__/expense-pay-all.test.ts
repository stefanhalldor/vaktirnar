import { describe, expect, it } from 'vitest'
import type {
  ExpensePayAllBlockedContextView,
  ExpensePayAllContextView,
  ExpensePaymentSnapshotView,
} from '@/lib/expenses/contracts'
import {
  buildExpensePayAllView,
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
    expenses: [{ id: 'expense-1', title: 'Matur', incurredOn: '2026-08-08' }],
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
          expenses: [{ id: 'expense-2', title: 'Gisting', incurredOn: '2026-08-07' }],
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
})
