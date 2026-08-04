import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAdmin,
  mockGuardExpenseAccess,
  mockResolveExpenseMembers,
  mockGetExpenseActorDisplayName,
  mockRpc,
} = vi.hoisted(() => ({
  mockGetAdmin: vi.fn(),
  mockGuardExpenseAccess: vi.fn(),
  mockResolveExpenseMembers: vi.fn(),
  mockGetExpenseActorDisplayName: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))
vi.mock('@/lib/expenses/guard', () => ({ guardExpenseAccess: mockGuardExpenseAccess }))
vi.mock('@/lib/expenses/participants.server', () => ({
  getExpenseActorDisplayName: mockGetExpenseActorDisplayName,
  resolveExpenseMembers: mockResolveExpenseMembers,
}))
vi.mock('@/lib/expenses/persistence.server', () => ({
  getActiveExpenseGroupMembersForActor: vi.fn(),
  getExpenseEditMembersForActor: vi.fn(),
}))

import { createExpense } from '@/lib/expenses/actions'

const actorId = '10000000-0000-4000-8000-000000000001'
const selfMemberId = '20000000-0000-4000-8000-000000000001'
const guestMemberId = '20000000-0000-4000-8000-000000000002'
const persistedGroupId = '30000000-0000-4000-8000-000000000001'
const persistedExpenseId = '40000000-0000-4000-8000-000000000001'

describe('createExpense RPC contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGuardExpenseAccess.mockResolvedValue({ user: { id: actorId } })
    mockGetExpenseActorDisplayName.mockResolvedValue('Stebbi')
    mockResolveExpenseMembers.mockResolvedValue([
      {
        id: selfMemberId,
        key: 'self',
        userId: actorId,
        displayName: 'Stebbi',
        role: 'owner',
        status: 'active',
      },
      {
        id: guestMemberId,
        key: 'guest',
        userId: null,
        displayName: 'Gestur',
        role: 'member',
        status: 'active',
      },
    ])
    mockRpc.mockResolvedValue({
      data: { group_id: persistedGroupId, expense_id: persistedExpenseId },
      error: null,
    })
    mockGetAdmin.mockReturnValue({ rpc: mockRpc })
  })

  it('sends the exact bounded obligation shape accepted by SQL96', async () => {
    const result = await createExpense({
      request_id: '50000000-0000-4000-8000-000000000001',
      group_id: null,
      title: 'Kvöldmatur',
      total: '100',
      currency: 'ISK',
      incurred_on: '2026-08-04',
      category: 'food',
      note: null,
      split_method: 'equal',
      members: [
        { type: 'self', key: 'self' },
        { type: 'guest', key: 'guest', display_name: 'Gestur' },
      ],
      payments: [{ member_key: 'self', amount: '100' }],
      allocations: [{ member_key: 'self' }, { member_key: 'guest' }],
    })

    expect(result).toEqual({
      ok: true,
      data: { groupId: persistedGroupId, expenseId: persistedExpenseId },
    })
    const [, payload] = mockRpc.mock.calls[0]
    expect(payload.p_obligations).toEqual([
      {
        from_member_id: guestMemberId,
        to_member_id: selfMemberId,
        amount_minor: 50,
        currency: 'ISK',
      },
    ])
    expect(payload.p_obligations[0]).not.toHaveProperty('id')
  })
})
