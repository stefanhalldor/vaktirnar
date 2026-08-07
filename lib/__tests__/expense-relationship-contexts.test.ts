import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdmin } = vi.hoisted(() => ({
  mockGetAdmin: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))

import { getRelationshipExpenseContexts } from '@/lib/expenses/relationship-contexts.server'

function membershipQuery(result: { data: unknown[] | null; error: unknown }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValueOnce(query).mockResolvedValueOnce(result)
  return query
}

function groupQuery(result: { data: unknown[] | null; error: unknown }) {
  const query = {
    select: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  }
  query.select.mockReturnValue(query)
  query.in.mockReturnValue(query)
  query.order.mockReturnValue(query)
  query.limit.mockResolvedValue(result)
  return query
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getRelationshipExpenseContexts', () => {
  it('returns only groups where owner and confirmed counterpart are both active members', async () => {
    const owner = membershipQuery({
      data: [{ group_id: 'owner-only' }, { group_id: 'shared' }],
      error: null,
    })
    const counterpart = membershipQuery({
      data: [{ group_id: 'shared' }, { group_id: 'counterpart-only' }],
      error: null,
    })
    const groups = groupQuery({
      data: [{ id: 'shared', kind: 'group', name: 'Ferð', emoji: '🚗' }],
      error: null,
    })
    const from = vi.fn()
      .mockReturnValueOnce(owner)
      .mockReturnValueOnce(counterpart)
      .mockReturnValueOnce(groups)
    mockGetAdmin.mockReturnValue({ from })

    await expect(getRelationshipExpenseContexts('owner', 'counterpart')).resolves.toEqual([
      { id: 'shared', kind: 'group', name: 'Ferð', emoji: '🚗' },
    ])
    expect(groups.in).toHaveBeenCalledWith('id', ['shared'])
    expect(owner.eq).toHaveBeenNthCalledWith(1, 'user_id', 'owner')
    expect(owner.eq).toHaveBeenNthCalledWith(2, 'status', 'active')
    expect(counterpart.eq).toHaveBeenNthCalledWith(1, 'user_id', 'counterpart')
    expect(counterpart.eq).toHaveBeenNthCalledWith(2, 'status', 'active')
  })

  it('does not query group metadata when active memberships do not intersect', async () => {
    const from = vi.fn()
      .mockReturnValueOnce(membershipQuery({ data: [{ group_id: 'owner-only' }], error: null }))
      .mockReturnValueOnce(membershipQuery({ data: [{ group_id: 'other' }], error: null }))
    mockGetAdmin.mockReturnValue({ from })

    await expect(getRelationshipExpenseContexts('owner', 'counterpart')).resolves.toEqual([])
    expect(from).toHaveBeenCalledTimes(2)
  })

  it('fails closed when either membership lookup fails', async () => {
    const from = vi.fn()
      .mockReturnValueOnce(membershipQuery({ data: null, error: { message: 'denied' } }))
      .mockReturnValueOnce(membershipQuery({ data: [], error: null }))
    mockGetAdmin.mockReturnValue({ from })

    await expect(getRelationshipExpenseContexts('owner', 'counterpart'))
      .rejects.toThrow('relationship_expense_membership_lookup_failed')
  })

  it('never queries memberships without two distinct confirmed user ids', async () => {
    mockGetAdmin.mockReturnValue({ from: vi.fn() })

    await expect(getRelationshipExpenseContexts('owner', 'owner')).resolves.toEqual([])
    expect(mockGetAdmin).not.toHaveBeenCalled()
  })
})
