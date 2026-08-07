import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom, mockGetAdmin } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetAdmin: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))

import { getExpenseEditMembersForActor } from '@/lib/expenses/persistence.server'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const GROUP_ID = '20000000-0000-4000-8000-000000000001'
const EXPENSE_ID = '30000000-0000-4000-8000-000000000001'

function twoEqResult(data: unknown[]) {
  const query = { eq: vi.fn() }
  query.eq
    .mockReturnValueOnce(query)
    .mockResolvedValueOnce({ data, error: null })
  return { select: vi.fn(() => query) }
}

describe('getExpenseEditMembersForActor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    let memberQueryCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'expense_group_members') {
        memberQueryCount += 1
        if (memberQueryCount === 1) {
          const actorQuery = {
            eq: vi.fn(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'member-self' }, error: null }),
          }
          actorQuery.eq.mockReturnValue(actorQuery)
          return { select: vi.fn(() => actorQuery) }
        }

        const memberQuery = {
          eq: vi.fn(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'member-self',
                user_id: ACTOR_ID,
                display_name: 'Stebbi',
                role: 'owner',
                status: 'active',
              },
              {
                id: 'member-historical',
                user_id: null,
                display_name: 'Fyrrverandi aðili',
                role: 'member',
                status: 'removed',
              },
              {
                id: 'member-unrelated',
                user_id: null,
                display_name: 'Ótengdur fyrrverandi aðili',
                role: 'member',
                status: 'removed',
              },
              {
                id: 'member-collaborator',
                user_id: '40000000-0000-4000-8000-000000000001',
                display_name: 'Samstarfsaðili á hlut',
                role: 'member',
                status: 'active',
              },
            ],
            error: null,
          }),
        }
        memberQuery.eq.mockReturnValue(memberQuery)
        return { select: vi.fn(() => memberQuery) }
      }
      if (table === 'expense_payments') {
        return twoEqResult([{ member_id: 'member-historical' }])
      }
      if (table === 'expense_shares') {
        return twoEqResult([{ member_id: 'member-self' }])
      }
      if (table === 'expense_share_collaborators') {
        return twoEqResult([{ collaborator_member_id: 'member-collaborator' }])
      }
      throw new Error(`unexpected table: ${table}`)
    })
    mockGetAdmin.mockReturnValue({ from: mockFrom })
  })

  it('returns active members and only inactive members referenced by this expense', async () => {
    await expect(getExpenseEditMembersForActor(ACTOR_ID, GROUP_ID, EXPENSE_ID)).resolves.toEqual([
      {
        id: 'member-self',
        userId: ACTOR_ID,
        displayName: 'Stebbi',
        role: 'owner',
      },
      {
        id: 'member-historical',
        userId: null,
        displayName: 'Fyrrverandi aðili',
        role: 'member',
      },
    ])
  })
})
