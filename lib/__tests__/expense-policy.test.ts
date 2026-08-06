import { describe, expect, it } from 'vitest'
import {
  canActAsExpenseMember,
  canEditExpense,
  canLinkExpenseGuest,
  canManageExpenseMemberOnBehalf,
} from '@/lib/expenses/policy'

describe('canEditExpense', () => {
  it.each(['active', 'settling', 'settled'] as const)(
    'allows an authorized actor to edit an active expense in %s',
    (groupStatus) => {
      expect(canEditExpense({
        expenseStatus: 'active', groupStatus, createdBySelf: true, canManage: false,
      })).toBe(true)
    },
  )

  it('fails closed for cancelled expenses, closed groups and unauthorized actors', () => {
    expect(canEditExpense({
      expenseStatus: 'cancelled', groupStatus: 'active', createdBySelf: true, canManage: true,
    })).toBe(false)
    expect(canEditExpense({
      expenseStatus: 'active', groupStatus: 'closed', createdBySelf: true, canManage: true,
    })).toBe(false)
    expect(canEditExpense({
      expenseStatus: 'active', groupStatus: 'settling', createdBySelf: false, canManage: false,
    })).toBe(false)
  })
})

describe('expense member consent boundaries', () => {
  it('allows direct actions only for the actor\'s active linked member', () => {
    expect(canActAsExpenseMember({
      actorUserId: 'actor', memberStatus: 'active', memberUserId: 'actor',
    })).toBe(true)
    expect(canActAsExpenseMember({
      actorUserId: 'actor', memberStatus: 'invited', memberUserId: 'actor',
    })).toBe(false)
    expect(canActAsExpenseMember({
      actorUserId: 'actor', memberStatus: 'active', memberUserId: 'other',
    })).toBe(false)
  })

  it.each([
    ['active guest', 'active', null, true],
    ['invited registered party', 'invited', 'other', true],
    ['active registered party', 'active', 'other', false],
    ['declined party', 'declined', null, false],
    ['removed party', 'removed', null, false],
    ['left party', 'left', null, false],
  ] as const)('keeps manager proxy authority narrow for %s', (
    _label,
    memberStatus,
    memberUserId,
    expected,
  ) => {
    expect(canManageExpenseMemberOnBehalf({
      canManage: true, memberStatus, memberUserId,
    })).toBe(expected)
    expect(canManageExpenseMemberOnBehalf({
      canManage: false, memberStatus, memberUserId,
    })).toBe(false)
  })

  it.each(['active', 'settling', 'settled'] as const)(
    'allows a manager to link an unclaimed guest while the group is %s',
    (groupStatus) => {
      expect(canLinkExpenseGuest({ groupStatus, canManage: true })).toBe(true)
    },
  )

  it('blocks guest linking for closed groups and non-managers', () => {
    expect(canLinkExpenseGuest({ groupStatus: 'closed', canManage: true })).toBe(false)
    expect(canLinkExpenseGuest({ groupStatus: 'active', canManage: false })).toBe(false)
  })
})
