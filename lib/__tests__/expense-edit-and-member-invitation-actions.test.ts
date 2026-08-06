import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFrom,
  mockGetActiveMembers,
  mockGetEditMembers,
  mockGetAdmin,
  mockGetUserById,
  mockGuardExpenseAccess,
  mockMaybeSingle,
  mockRevalidatePath,
  mockRpc,
  mockSendInvitation,
  mockUpsertSourceRelationship,
} = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetActiveMembers: vi.fn(),
  mockGetEditMembers: vi.fn(),
  mockGetAdmin: vi.fn(),
  mockGetUserById: vi.fn(),
  mockGuardExpenseAccess: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRpc: vi.fn(),
  mockSendInvitation: vi.fn(),
  mockUpsertSourceRelationship: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))
vi.mock('@/lib/expenses/guard', () => ({
  guardExpenseAccess: mockGuardExpenseAccess,
  guardExpenseSession: mockGuardExpenseAccess,
}))
vi.mock('@/lib/expenses/participants.server', () => ({
  getExpenseActorDisplayName: vi.fn(),
  resolveExpenseMembers: vi.fn(),
}))
vi.mock('@/lib/expenses/persistence.server', () => ({
  getActiveExpenseGroupMembersForActor: mockGetActiveMembers,
  getExpenseEditMembersForActor: mockGetEditMembers,
}))
vi.mock('@/lib/expenses/email', () => ({
  sendExpenseMemberInvitationEmail: mockSendInvitation,
}))
vi.mock('@/lib/relationships/upsert-source.server', () => ({
  upsertSourceRelationship: mockUpsertSourceRelationship,
}))

import {
  cancelExpenseMemberInvitation,
  linkExpenseGuestMember,
  resendExpenseMemberInvitation,
  respondExpenseMemberInvitation,
  updateExpense,
} from '@/lib/expenses/actions'
import { UpdateExpenseSchema } from '@/lib/expenses/validation'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const OWNER_ID = '10000000-0000-4000-8000-000000000002'
const SELF_MEMBER_ID = '20000000-0000-4000-8000-000000000001'
const GUEST_MEMBER_ID = '20000000-0000-4000-8000-000000000002'
const NEW_GUEST_MEMBER_ID = '20000000-0000-4000-8000-000000000003'
const INACTIVE_MEMBER_ID = '20000000-0000-4000-8000-000000000004'
const GROUP_ID = '30000000-0000-4000-8000-000000000001'
const EXPENSE_ID = '40000000-0000-4000-8000-000000000001'
const INVITATION_ID = '50000000-0000-4000-8000-000000000001'
const REQUEST_ID = '60000000-0000-4000-8000-000000000001'

function updateInput(overrides: Record<string, unknown> = {}) {
  return {
    request_id: REQUEST_ID,
    expense_id: EXPENSE_ID,
    expected_financial_version: 7,
    title: 'Afmælisgjöf',
    total: '85000',
    currency: 'ISK',
    incurred_on: '2026-08-04',
    category: 'gifts',
    note: 'Gjöf frá systkinum',
    split_method: 'equal',
    preserve_shares: true,
    new_members: [],
    payments: [{ member_key: SELF_MEMBER_ID, amount: '85000' }],
    allocations: [],
    ...overrides,
  }
}

function setRpcResponses(
  responses: Record<string, { data: unknown; error: null | { message: string } }>,
) {
  mockRpc.mockImplementation(async (name: string) => responses[name] ?? {
    data: null,
    error: { message: `unexpected_rpc:${name}` },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGuardExpenseAccess.mockResolvedValue({ user: { id: ACTOR_ID, email: 'actor@example.is' } })
  mockMaybeSingle.mockResolvedValue({ data: { group_id: GROUP_ID }, error: null })
  mockFrom.mockImplementation((table: string) => {
    if (table === 'expenses') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: mockMaybeSingle })),
        })),
      }
    }
    if (table === 'expense_member_invitations') {
      const query = {
        eq: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { guest_display_name_snapshot: 'Martine' },
          error: null,
        }),
      }
      query.eq.mockReturnValue(query)
      return { select: vi.fn(() => query) }
    }
    throw new Error(`unexpected_table:${table}`)
  })
  mockGetActiveMembers.mockResolvedValue([
    {
      id: SELF_MEMBER_ID,
      userId: ACTOR_ID,
      displayName: 'Stebbi',
      role: 'owner',
    },
    {
      id: GUEST_MEMBER_ID,
      userId: null,
      displayName: 'Aldís',
      role: 'member',
    },
  ])
  mockGetEditMembers.mockResolvedValue([
    {
      id: SELF_MEMBER_ID,
      userId: ACTOR_ID,
      displayName: 'Stebbi',
      role: 'owner',
    },
    {
      id: GUEST_MEMBER_ID,
      userId: null,
      displayName: 'Aldís',
      role: 'member',
    },
  ])
  mockGetUserById.mockResolvedValue({ data: { user: { email: 'owner@example.is' } } })
  mockGetAdmin.mockReturnValue({
    from: mockFrom,
    rpc: mockRpc,
    auth: { admin: { getUserById: mockGetUserById } },
  })
  mockSendInvitation.mockResolvedValue('sent')
  mockUpsertSourceRelationship.mockResolvedValue(undefined)
})

describe('UpdateExpenseSchema', () => {
  it('allows an authoritative-share update only with an empty allocation payload', () => {
    expect(UpdateExpenseSchema.safeParse(updateInput()).success).toBe(true)
    expect(UpdateExpenseSchema.safeParse(updateInput({
      allocations: [{ member_key: SELF_MEMBER_ID }],
    })).success).toBe(false)
  })

  it('requires allocation rows when existing shares are not preserved', () => {
    expect(UpdateExpenseSchema.safeParse(updateInput({ preserve_shares: false })).success).toBe(false)
    expect(UpdateExpenseSchema.safeParse(updateInput({
      preserve_shares: false,
      allocations: [
        { member_key: SELF_MEMBER_ID },
        { member_key: GUEST_MEMBER_ID },
      ],
    })).success).toBe(true)
  })

  it('accepts only bounded name-only new members with unique durable ids', () => {
    expect(UpdateExpenseSchema.safeParse(updateInput({
      new_members: [{ id: NEW_GUEST_MEMBER_ID, display_name: 'Martine' }],
      payments: [
        { member_key: SELF_MEMBER_ID, amount: '60000' },
        { member_key: NEW_GUEST_MEMBER_ID, amount: '25000' },
      ],
    })).success).toBe(true)

    expect(UpdateExpenseSchema.safeParse(updateInput({
      new_members: [
        { id: NEW_GUEST_MEMBER_ID, display_name: 'Martine' },
        { id: NEW_GUEST_MEMBER_ID, display_name: 'Martine aftur' },
      ],
      payments: [
        { member_key: SELF_MEMBER_ID, amount: '60000' },
        { member_key: NEW_GUEST_MEMBER_ID, amount: '25000' },
      ],
    })).success).toBe(false)

    expect(UpdateExpenseSchema.safeParse(updateInput({
      new_members: [{
        id: NEW_GUEST_MEMBER_ID,
        display_name: 'Martine',
        user_id: ACTOR_ID,
      }],
      payments: [
        { member_key: SELF_MEMBER_ID, amount: '60000' },
        { member_key: NEW_GUEST_MEMBER_ID, amount: '25000' },
      ],
    })).success).toBe(false)

    expect(UpdateExpenseSchema.safeParse(updateInput({
      new_members: [{ id: NEW_GUEST_MEMBER_ID, display_name: 'Ónotaður' }],
    })).success).toBe(false)
  })
})

describe('updateExpense RPC mapping', () => {
  it('passes preserve-shares and name-only member data without client-supplied shares', async () => {
    setRpcResponses({
      expense_update_expense_with_participants: {
        data: { group_id: GROUP_ID, expense_id: EXPENSE_ID, financial_version: 8 },
        error: null,
      },
    })

    const result = await updateExpense(updateInput({
      new_members: [{ id: NEW_GUEST_MEMBER_ID, display_name: ' Martine ' }],
      payments: [
        { member_key: SELF_MEMBER_ID, amount: '60000' },
        { member_key: NEW_GUEST_MEMBER_ID, amount: '25000' },
      ],
    }))

    expect(result).toEqual({
      ok: true,
      data: { groupId: GROUP_ID, expenseId: EXPENSE_ID, financialVersion: 8 },
    })
    expect(mockRpc).toHaveBeenCalledWith('expense_update_expense_with_participants', {
      p_actor_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_expense_id: EXPENSE_ID,
      p_expected_financial_version: 7,
      p_title: 'Afmælisgjöf',
      p_total_minor: 85000,
      p_currency: 'ISK',
      p_incurred_on: '2026-08-04',
      p_category: 'gifts',
      p_note: 'Gjöf frá systkinum',
      p_split_method: 'equal',
      p_preserve_shares: true,
      p_new_guest_members: [{ id: NEW_GUEST_MEMBER_ID, display_name: 'Martine' }],
      p_new_participant_invitations: [],
      p_removed_member_ids: [],
      p_payments: [
        { member_id: SELF_MEMBER_ID, amount_minor: 60000 },
        { member_id: NEW_GUEST_MEMBER_ID, amount_minor: 25000 },
      ],
      p_shares: [],
    })
  })

  it('derives replacement shares from validated allocation rows', async () => {
    setRpcResponses({
      expense_update_expense_with_participants: {
        data: { group_id: GROUP_ID, expense_id: EXPENSE_ID, financial_version: 9 },
        error: null,
      },
    })

    await updateExpense(updateInput({
      total: '100',
      note: null,
      preserve_shares: false,
      allocations: [
        { member_key: SELF_MEMBER_ID },
        { member_key: GUEST_MEMBER_ID },
      ],
      payments: [{ member_key: SELF_MEMBER_ID, amount: '100' }],
    }))

    const updateCall = mockRpc.mock.calls.find(([name]) => name === 'expense_update_expense_with_participants')
    expect(updateCall?.[1].p_shares).toEqual([
      { member_id: SELF_MEMBER_ID, amount_minor: 50 },
      { member_id: GUEST_MEMBER_ID, amount_minor: 50 },
    ])
  })

  it('round-trips an unchanged historical payment for an inactive member', async () => {
    mockGetEditMembers.mockResolvedValueOnce([
      {
        id: SELF_MEMBER_ID,
        userId: ACTOR_ID,
        displayName: 'Stebbi',
        role: 'owner',
      },
      {
        id: INACTIVE_MEMBER_ID,
        userId: null,
        displayName: 'Fyrrverandi aðili',
        role: 'member',
      },
    ])
    setRpcResponses({
      expense_update_expense_with_participants: {
        data: { group_id: GROUP_ID, expense_id: EXPENSE_ID, financial_version: 8 },
        error: null,
      },
    })

    const result = await updateExpense(updateInput({
      payments: [{ member_key: INACTIVE_MEMBER_ID, amount: '85000' }],
    }))

    expect(result.ok).toBe(true)
    expect(mockGetEditMembers).toHaveBeenCalledWith(ACTOR_ID, GROUP_ID, EXPENSE_ID)
    expect(mockRpc).toHaveBeenCalledWith('expense_update_expense_with_participants', expect.objectContaining({
      p_payments: [{ member_id: INACTIVE_MEMBER_ID, amount_minor: 85000 }],
      p_preserve_shares: true,
    }))
  })

  it('passes a non-paying participant removal to the audited SQL110 wrapper', async () => {
    setRpcResponses({
      expense_update_expense_with_participants: {
        data: { group_id: GROUP_ID, expense_id: EXPENSE_ID, financial_version: 10 },
        error: null,
      },
    })

    const result = await updateExpense(updateInput({
      total: '100',
      preserve_shares: false,
      removed_member_ids: [GUEST_MEMBER_ID],
      payments: [{ member_key: SELF_MEMBER_ID, amount: '100' }],
      allocations: [{ member_key: SELF_MEMBER_ID }],
    }))

    expect(result.ok).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith(
      'expense_update_expense_with_participants',
      expect.objectContaining({ p_removed_member_ids: [GUEST_MEMBER_ID] }),
    )
  })
})

describe('expense guest-member invitations', () => {
  it('sends from the private reservation but returns only curated delivery state', async () => {
    setRpcResponses({
      expense_invite_existing_participant: {
        data: { invitation_id: INVITATION_ID, recipient_email: 'must-not-leak@example.is' },
        error: null,
      },
      expense_reserve_scoped_member_invitation_send: {
        data: [{
          can_send: true,
          reason: 'reserved',
          attempt_number: 2,
          recipient_email: 'martine@example.is',
          email_template_version: 'v1',
          context_title: 'Afmælisgjöf',
          inviter_display_name: 'Stebbi',
          total_minor: 85000,
          note: 'must not be sent',
        }],
        error: null,
      },
      expense_update_member_invitation_delivery: { data: 'ok', error: null },
    })

    const result = await linkExpenseGuestMember({
      group_id: GROUP_ID,
      member_id: GUEST_MEMBER_ID,
      recipient_email: 'martine@example.is',
      request_id: REQUEST_ID,
    })

    expect(mockSendInvitation).toHaveBeenCalledWith(
      'martine@example.is',
      INVITATION_ID,
      2,
      {
        templateVersion: 'v1',
        contextTitle: 'Afmælisgjöf',
        inviterDisplayName: 'Stebbi',
      },
    )
    expect(result).toEqual({
      ok: true,
      data: { invitationId: INVITATION_ID, delivery: 'sent' },
    })
  })

  it('fails closed as uncertain when a send reservation has an invalid safe snapshot', async () => {
    setRpcResponses({
      expense_invite_existing_participant: {
        data: { invitation_id: INVITATION_ID },
        error: null,
      },
      expense_reserve_scoped_member_invitation_send: {
        data: [{
          can_send: true,
          reason: 'reserved',
          attempt_number: 1,
          recipient_email: 'martine@example.is',
          email_template_version: 'v1',
          // Missing the required context title.
          inviter_display_name: 'Stebbi',
        }],
        error: null,
      },
    })

    await expect(linkExpenseGuestMember({
      group_id: GROUP_ID,
      member_id: GUEST_MEMBER_ID,
      recipient_email: 'martine@example.is',
      request_id: REQUEST_ID,
    })).resolves.toEqual({
      ok: true,
      data: { invitationId: INVITATION_ID, delivery: 'uncertain' },
    })
    expect(mockSendInvitation).not.toHaveBeenCalled()
  })

  it('keeps an accepted durable link successful when optional Tengsl enrichment fails', async () => {
    setRpcResponses({
      expense_respond_scoped_member_invitation: {
        data: {
          status: 'accepted',
          group_id: GROUP_ID,
          invited_by: OWNER_ID,
          member_id: GUEST_MEMBER_ID,
          counterpart_user_id: ACTOR_ID,
          counterpart_email_canonical: 'rpc-value-must-not-be-used@example.is',
          guest_display_name: 'RPC value must not be used',
          recipient_email: 'must-not-leak@example.is',
          total_minor: 85000,
          note: 'must-not-leak',
        },
        error: null,
      },
    })
    mockUpsertSourceRelationship.mockRejectedValueOnce(new Error('temporary_tengsl_failure'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = await respondExpenseMemberInvitation({
      invitation_id: INVITATION_ID,
      action: 'accept',
      request_id: REQUEST_ID,
    })

    expect(mockUpsertSourceRelationship).toHaveBeenCalledWith({
      ownerUserId: OWNER_ID,
      ownerEmail: 'owner@example.is',
      counterpart: {
        mode: 'verified-counterpart',
        userId: ACTOR_ID,
        emailCanonical: 'actor@example.is',
        privateDisplayName: 'Martine',
      },
      sourceType: 'expenses',
      sourceId: GUEST_MEMBER_ID,
    })
    expect(result).toEqual({
      ok: true,
      data: { status: 'accepted', groupId: GROUP_ID },
    })
  })

  it('does not perform relationship lookup for a declined invitation', async () => {
    setRpcResponses({
      expense_respond_scoped_member_invitation: {
        data: {
          status: 'declined',
          group_id: GROUP_ID,
          invited_by: OWNER_ID,
          member_id: GUEST_MEMBER_ID,
          counterpart_user_id: ACTOR_ID,
        },
        error: null,
      },
    })

    await expect(respondExpenseMemberInvitation({
      invitation_id: INVITATION_ID,
      action: 'decline',
      request_id: REQUEST_ID,
    })).resolves.toEqual({
      ok: true,
      data: { status: 'declined', groupId: GROUP_ID },
    })
    expect(mockGetUserById).not.toHaveBeenCalled()
    expect(mockUpsertSourceRelationship).not.toHaveBeenCalled()
  })

  it.each([
    ['updateExpense', updateExpense],
    ['linkExpenseGuestMember', linkExpenseGuestMember],
    ['resendExpenseMemberInvitation', resendExpenseMemberInvitation],
    ['respondExpenseMemberInvitation', respondExpenseMemberInvitation],
    ['cancelExpenseMemberInvitation', cancelExpenseMemberInvitation],
  ])('%s leaves redirect control flow outside its error boundary', async (_name, action) => {
    mockGuardExpenseAccess.mockRejectedValueOnce(new Error('NEXT_REDIRECT:/'))
    await expect(action({})).rejects.toThrow('NEXT_REDIRECT:/')
  })
})
