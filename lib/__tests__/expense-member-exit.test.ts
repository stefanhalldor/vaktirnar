import { describe, expect, it } from 'vitest'
import { canLeaveExpenseGroup } from '@/lib/expenses/member-exit'
import type { ExpenseRepaymentView } from '@/lib/expenses/contracts'

function repayment(overrides: Partial<ExpenseRepaymentView>): ExpenseRepaymentView {
  return {
    id: 'repayment-1',
    obligationId: 'obligation-1',
    groupId: 'group-1',
    fromMemberId: 'member-a',
    fromDisplayName: 'A',
    toMemberId: 'member-b',
    toDisplayName: 'B',
    amountMinor: 100,
    currency: 'ISK',
    occurredOn: '2026-08-04',
    note: null,
    status: 'reported',
    createdAt: '2026-08-04T12:00:00.000Z',
    canConfirm: false,
    canReject: false,
    canCancel: false,
    paymentSnapshot: null,
    ...overrides,
  }
}

const zeroBalance = [{
  memberId: 'member-self',
  displayName: 'Ég',
  currency: 'ISK',
  amountMinor: 0,
  isSelf: true,
}]

describe('expense group exit capability', () => {
  it('does not block a zero-balance member for someone else’s reported repayment', () => {
    expect(canLeaveExpenseGroup({
      role: 'member',
      memberId: 'member-self',
      selfBalances: zeroBalance,
      repayments: [repayment({ fromMemberId: 'member-a', toMemberId: 'member-b' })],
    })).toBe(true)
  })

  it('blocks the member when a reported repayment involves them', () => {
    expect(canLeaveExpenseGroup({
      role: 'member',
      memberId: 'member-self',
      selfBalances: zeroBalance,
      repayments: [repayment({ fromMemberId: 'member-self' })],
    })).toBe(false)
  })

  it('also blocks owners and non-zero balances', () => {
    expect(canLeaveExpenseGroup({
      role: 'owner', memberId: 'member-self', selfBalances: zeroBalance, repayments: [],
    })).toBe(false)
    expect(canLeaveExpenseGroup({
      role: 'member',
      memberId: 'member-self',
      selfBalances: [{ ...zeroBalance[0]!, amountMinor: -100 }],
      repayments: [],
    })).toBe(false)
  })
})
