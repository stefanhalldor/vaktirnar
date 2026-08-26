import { describe, expect, it, vi } from 'vitest'

const { mockGuardExpenseAccess } = vi.hoisted(() => ({
  mockGuardExpenseAccess: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({ rpc: vi.fn() })),
}))
vi.mock('@/lib/expenses/guard', () => ({ guardExpenseAccess: mockGuardExpenseAccess }))
vi.mock('@/lib/expenses/participants.server', () => ({
  getExpenseActorDisplayName: vi.fn(),
  resolveExpenseMembers: vi.fn(),
}))
vi.mock('@/lib/expenses/persistence.server', () => ({
  getActiveExpenseGroupMembersForActor: vi.fn(),
  getExpenseEditMembersForActor: vi.fn(),
}))

import {
  addExpenseGroupMember,
  cancelExpense,
  createExpense,
  createExpenseGroup,
  deactivateExpensePaymentPreference,
  finalizeExpenseDraft,
  leaveExpenseGroup,
  proposeExpenseSettlementBatch,
  refreshExpenseDraftPublicationLifecycle,
  removeExpenseGroupMember,
  reportExpenseRepayment,
  respondExpenseGroupInvitation,
  shareExpenseDraft,
  saveExpensePaymentPreference,
  setExpenseGroupStatus,
  transitionExpenseRepayment,
  transitionExpenseSettlementBatch,
  unshareExpenseDraft,
} from '@/lib/expenses/actions'

describe('expense server-action guard placement', () => {
  it.each([
    ['createExpenseGroup', createExpenseGroup],
    ['createExpense', createExpense],
    ['shareExpenseDraft', shareExpenseDraft],
    ['unshareExpenseDraft', unshareExpenseDraft],
    ['finalizeExpenseDraft', finalizeExpenseDraft],
    ['refreshExpenseDraftPublicationLifecycle', refreshExpenseDraftPublicationLifecycle],
    ['addExpenseGroupMember', addExpenseGroupMember],
    ['respondExpenseGroupInvitation', respondExpenseGroupInvitation],
    ['leaveExpenseGroup', leaveExpenseGroup],
    ['removeExpenseGroupMember', removeExpenseGroupMember],
    ['cancelExpense', cancelExpense],
    ['setExpenseGroupStatus', setExpenseGroupStatus],
    ['reportExpenseRepayment', reportExpenseRepayment],
    ['transitionExpenseRepayment', transitionExpenseRepayment],
    ['proposeExpenseSettlementBatch', proposeExpenseSettlementBatch],
    ['transitionExpenseSettlementBatch', transitionExpenseSettlementBatch],
    ['saveExpensePaymentPreference', saveExpensePaymentPreference],
    ['deactivateExpensePaymentPreference', deactivateExpensePaymentPreference],
  ])('%s does not swallow Next redirect control flow', async (_name, action) => {
    mockGuardExpenseAccess.mockRejectedValueOnce(new Error('NEXT_REDIRECT:/'))
    await expect(action({})).rejects.toThrow('NEXT_REDIRECT:/')
  })
})
