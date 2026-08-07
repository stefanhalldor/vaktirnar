import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const { mockFrom, mockGetAdmin, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetAdmin: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))

import {
  getExpenseDashboard,
  getExpenseMemberInvitation,
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

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockImplementation((table: string) => {
    if (table !== 'expense_group_members') throw new Error(`unexpected_table:${table}`)
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    }
  })
  mockRpc.mockResolvedValue({ data: [rawInvitation], error: null })
  mockGetAdmin.mockReturnValue({ from: mockFrom, rpc: mockRpc })
})

describe('expense member invitation repository privacy boundary', () => {
  it('keeps recipient lifecycle events out of shared group activity', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/expenses/repository.server.ts'),
      'utf8',
    )
    expect(source).toContain(
      ".filter((row) => !row.event_type.startsWith('expense_member_invitation_'))",
    )
    expect(source).toContain(".gt('expires_at', new Date().toISOString())")
    expect(source).toContain("...(canManage ? { recipientLabel: invitation.recipient_email_canonical } : {})")
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
})
