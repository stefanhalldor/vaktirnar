import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const {
  mockCheckFeatureAccess,
  mockFrom,
  mockGetAdmin,
  mockGetUserById,
  mockRpc,
} = vi.hoisted(() => ({
  mockCheckFeatureAccess: vi.fn(),
  mockFrom: vi.fn(),
  mockGetAdmin: vi.fn(),
  mockGetUserById: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mockCheckFeatureAccess }))

import {
  getExpenseDashboard,
  getExpenseMemberInvitation,
  getExpenseMemberInvitationPreview,
} from '@/lib/expenses/repository.server'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const INVITATION_ID = '50000000-0000-4000-8000-000000000001'

const rawInvitation = {
  invitation_id: INVITATION_ID,
  context_title: 'Afmælisgjöf',
  guest_display_name: 'Martine',
  inviter_display_name: 'Stebbi',
  status: 'pending' as const,
  expires_at: '2026-08-18T11:00:00.000Z',
  invited_at: '2026-08-04T11:00:00.000Z',
  // These simulate accidental future RPC additions. The repository boundary
  // must continue to curate them out of the pre-consent app contract.
  recipient_email: 'martine@example.is',
  total_minor: 85000,
  currency: 'ISK',
  note: 'private ledger note',
  payments: [{ member_id: 'private' }],
  shares: [{ member_id: 'private' }],
}

const rawPreview = {
  ...rawInvitation,
  expense_id: '40000000-0000-4000-8000-000000000001',
  expense_title: 'Afmælisgjöf fyrir mömmu',
  description: 'Blóm og kvöldverður',
  total_minor: 85000,
  currency: 'ISK',
  incurred_on: '2026-08-03',
  payers: [{ displayName: 'Stebbi', amountMinor: 85000, memberId: 'must-not-leak' }],
  participants: [{ displayName: 'Martine', amountMinor: 42500, email: 'must-not-leak@example.is' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockImplementation((table: string) => {
    if (table === 'expense_group_members') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
      }
    }
    if (table === 'expense_settlement_batches') {
      const query = {
        eq: vi.fn(),
        or: vi.fn(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: 'PGRST205',
            message: "Could not find the table 'public.expense_settlement_batches' in the schema cache",
          },
        }),
      }
      query.eq.mockReturnValue(query)
      query.or.mockReturnValue(query)
      return { select: vi.fn(() => query) }
    }
    throw new Error(`unexpected_table:${table}`)
  })
  mockRpc.mockImplementation(async (name: string) => ({
    data: [name === 'expense_get_scoped_member_invitation_preview' ? rawPreview : rawInvitation],
    error: null,
  }))
  mockGetAdmin.mockReturnValue({
    from: mockFrom,
    rpc: mockRpc,
    auth: { admin: { getUserById: mockGetUserById } },
  })
})

describe('expense member invitation repository privacy boundary', () => {
  it('keeps recipient lifecycle events out of shared group activity', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/expenses/repository.server.ts'),
      'utf8',
    )
    expect(source).toContain(
      ".filter((row) => !row.event_type.startsWith('expense_member_invitation_')",
    )
    expect(source).toContain("row.event_type !== 'expense_identity_bound'")
    expect(source).toContain("row.event_type !== 'expense_claim_disputed'")
    expect(source).toContain(".gt('expires_at', new Date().toISOString())")
    expect(source).toContain("expenseInvitationRecipientProjection({")
    expect(source).not.toContain('isEventDerivedMember')
    expect(source).not.toContain("'teskeid_event_get_expense_member_sources'")
    expect(source).not.toContain('recipientLabel: member')
  })

  it('curates inbox rows to safe context with no email or ledger details', async () => {
    const dashboard = await getExpenseDashboard(ACTOR_ID)

    expect(dashboard.memberInvitations).toEqual([{
      invitationId: INVITATION_ID,
      contextTitle: 'Afmælisgjöf',
      inviterDisplayName: 'Stebbi',
      status: 'pending',
      expiresAt: '2026-08-18T11:00:00.000Z',
      invitedAt: '2026-08-04T11:00:00.000Z',
    }])
    expect(JSON.stringify(dashboard.memberInvitations)).not.toContain('martine@example.is')
    expect(JSON.stringify(dashboard.memberInvitations)).not.toContain('Martine')
    expect(JSON.stringify(dashboard.memberInvitations)).not.toContain('85000')
    expect(JSON.stringify(dashboard.memberInvitations)).not.toContain('private ledger note')
    expect(mockGetUserById).not.toHaveBeenCalled()
    expect(mockCheckFeatureAccess).not.toHaveBeenCalled()
  })

  it('returns the same bounded shape from the invitation detail lookup', async () => {
    const invitation = await getExpenseMemberInvitation(ACTOR_ID, INVITATION_ID)

    expect(invitation).toEqual({
      invitationId: INVITATION_ID,
      contextTitle: 'Afmælisgjöf',
      inviterDisplayName: 'Stebbi',
      status: 'pending',
      expiresAt: '2026-08-18T11:00:00.000Z',
      invitedAt: '2026-08-04T11:00:00.000Z',
    })
    expect(Object.keys(invitation ?? {}).sort()).toEqual([
      'contextTitle',
      'expiresAt',
      'invitationId',
      'invitedAt',
      'inviterDisplayName',
      'status',
    ])
    expect(mockRpc).toHaveBeenCalledWith('expense_get_scoped_member_invitation', {
      p_actor_id: ACTOR_ID,
      p_invitation_id: INVITATION_ID,
    })
  })

  it('does not reveal whether a different invitation id exists', async () => {
    await expect(getExpenseMemberInvitation(
      ACTOR_ID,
      '50000000-0000-4000-8000-000000000099',
    )).resolves.toBeNull()
  })

  it('projects only the exact bounded ledger preview for the intended recipient', async () => {
    const preview = await getExpenseMemberInvitationPreview(ACTOR_ID, INVITATION_ID)

    expect(preview).toMatchObject({
      invitationId: INVITATION_ID,
      expenseId: rawPreview.expense_id,
      expenseTitle: 'Afmælisgjöf fyrir mömmu',
      description: 'Blóm og kvöldverður',
      totalMinor: 85000,
      currency: 'ISK',
      payers: [{ displayName: 'Stebbi', amountMinor: 85000 }],
      participants: [{ displayName: 'Martine', amountMinor: 42500 }],
    })
    expect(JSON.stringify(preview)).not.toContain('must-not-leak')
    expect(mockRpc).toHaveBeenCalledWith('expense_get_scoped_member_invitation_preview', {
      p_actor_id: ACTOR_ID,
      p_invitation_id: INVITATION_ID,
    })
  })
})
