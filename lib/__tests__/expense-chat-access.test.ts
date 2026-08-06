import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { mockCheckFeatureAccess, mockGetExpenseItemView } = vi.hoisted(() => ({
  mockCheckFeatureAccess: vi.fn(),
  mockGetExpenseItemView: vi.fn(),
}))

vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mockCheckFeatureAccess }))
vi.mock('@/lib/expenses/repository.server', () => ({ getExpenseItemView: mockGetExpenseItemView }))

import { buildExpenseChatTarget, resolveExpenseChatAccess } from '@/lib/chat/adapters/expense.server'

const user = { id: 'user-1', email: 'stefan@example.com' } as any
const expense = { id: '00000000-0000-4000-8000-000000000001', title: 'Kvöldmatur' } as any

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('TESKEID_CHAT_ENABLED', 'true')
  mockCheckFeatureAccess.mockResolvedValue(true)
  mockGetExpenseItemView.mockResolvedValue({ expense })
})

describe('expense chat access adapter', () => {
  it('requires the expense feature and current item membership', async () => {
    expect(await resolveExpenseChatAccess(user, expense.id)).toEqual({
      status: 'allowed',
      user,
      expense,
    })
    expect(mockCheckFeatureAccess).toHaveBeenCalledWith(
      user.id,
      user.email,
      'utlagt-og-endurgreitt',
    )
    expect(mockGetExpenseItemView).toHaveBeenCalledWith(user.id, expense.id)
  })

  it('fails closed when the feature is denied or the member cannot read the item', async () => {
    mockCheckFeatureAccess.mockResolvedValueOnce(false)
    expect(await resolveExpenseChatAccess(user, expense.id)).toEqual({ status: 'forbidden' })

    mockGetExpenseItemView.mockResolvedValueOnce(null)
    expect(await resolveExpenseChatAccess(user, expense.id)).toEqual({ status: 'not-found' })
  })

  it('builds a generic, exact expense thread target', () => {
    expect(buildExpenseChatTarget(expense)).toEqual({
      domain: 'expenses',
      targetType: 'expense_item',
      targetId: expense.id,
      targetName: expense.title,
    })
  })
})
