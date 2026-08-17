import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAdmin, mockFrom, mockIn } = vi.hoisted(() => ({
  mockGetAdmin: vi.fn(),
  mockFrom: vi.fn(),
  mockIn: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))
vi.mock('@/lib/relationships/repository-v2.server', () => ({
  getRelationshipLabelState: vi.fn(),
}))

import { resolveExpenseMembers } from '@/lib/expenses/participants.server'

const actorUserId = '10000000-0000-4000-8000-000000000001'
const relationshipId = '20000000-0000-4000-8000-000000000001'

const members = [
  { type: 'self' as const, key: 'self' },
  {
    type: 'relationship' as const,
    key: 'relationship:guest',
    relationship_id: relationshipId,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockIn.mockResolvedValue({ data: [], error: null })
  mockFrom.mockReturnValue({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ in: mockIn })),
    })),
  })
  mockGetAdmin.mockReturnValue({ from: mockFrom })
})

describe('tagged expense relationship receipt replay', () => {
  it('keeps the authoritative Event organizer as an unlinked one-off member', async () => {
    const organizerId = '30000000-0000-4000-8000-000000000002'
    const resolved = await resolveExpenseMembers({
      actorUserId,
      actorDisplayName: 'Stebbi',
      members: [
        { type: 'self', key: 'self' },
        { type: 'event_guest', key: `event:${organizerId}`, event_guest_id: organizerId },
      ],
      eventSource: {
        id: '30000000-0000-4000-8000-000000000001',
        name: 'Viðburður',
        rosterRevision: 2,
        viewerRole: 'attendee',
        guests: [{
          id: organizerId,
          displayName: 'Skipuleggjandi',
          sourceKind: 'manual_name',
          participantKind: 'organizer',
        }],
      },
    })

    expect(resolved[1]).toMatchObject({
      displayName: 'Skipuleggjandi',
      userId: null,
      role: 'member',
      status: 'active',
    })
    expect(resolved[1]).not.toHaveProperty('eventGuestId')
  })

  it('keeps the ordinary first-attempt resolver fail-closed for a missing relationship', async () => {
    await expect(resolveExpenseMembers({
      actorUserId,
      actorDisplayName: 'Stebbi',
      members,
    })).rejects.toThrow('expense_relationship_not_available')
  })

  it('retains only the opaque relationship reference for SQL receipt-first validation', async () => {
    const resolved = await resolveExpenseMembers({
      actorUserId,
      actorDisplayName: 'Stebbi',
      members,
      eventSource: {
        id: '30000000-0000-4000-8000-000000000001',
        name: 'Viðburður',
        rosterRevision: 2,
        guests: [],
      },
      allowUnresolvedRelationshipReceiptReplay: true,
    })

    expect(resolved[1]).toMatchObject({
      key: 'relationship:guest',
      userId: null,
      displayName: 'Teskeiðarnotandi',
      role: 'member',
      status: 'invited',
      relationshipId,
    })
    expect(resolved[1]?.id).toMatch(/^[0-9a-f-]{36}$/)
  })
})
