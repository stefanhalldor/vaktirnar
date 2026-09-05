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
  mockResolveExpenseMembers,
  mockGetActorDisplayName,
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
  mockResolveExpenseMembers: vi.fn(),
  mockGetActorDisplayName: vi.fn(),
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
  getExpenseActorDisplayName: mockGetActorDisplayName,
  resolveExpenseMembers: mockResolveExpenseMembers,
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
  addExpenseShareCollaborator,
  bindExpenseMemberEventIdentity,
  bindExpenseMemberRelationshipIdentity,
  cancelExpenseMemberInvitation,
  deleteOwnUnsettledExpense,
  discardLegacyExpenseEditDraft,
  disputeExpenseClaim,
  linkExpenseGuestMember,
  renameExpenseGuestMember,
  resendExpenseMemberInvitation,
  respondExpenseMemberInvitation,
  updateExpense,
} from '@/lib/expenses/actions'
import { BindExpenseMemberRelationshipIdentitySchema, UpdateExpenseSchema } from '@/lib/expenses/validation'

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
const EVENT_PARTICIPANT_ID = '70000000-0000-4000-8000-000000000001'
const RELATIONSHIP_ID = '71000000-0000-4000-8000-000000000001'
const DRAFT_ID = '72000000-0000-4000-8000-000000000001'

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
  responses: Record<string, { data: unknown; error: null | { message: string; code?: string } }>,
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
  mockGetActorDisplayName.mockResolvedValue('Stebbi')
  mockResolveExpenseMembers.mockResolvedValue([
    {
      id: SELF_MEMBER_ID,
      key: 'self',
      userId: ACTOR_ID,
      displayName: 'Stebbi',
      role: 'owner',
      status: 'active',
    },
    {
      id: NEW_GUEST_MEMBER_ID,
      key: 'new',
      userId: null,
      displayName: 'Mamma og pabbi',
      role: 'member',
      status: 'active',
    },
  ])
})

describe('creator hard-delete action', () => {
  const input = {
    expense_id: EXPENSE_ID,
    expected_financial_version: 7,
    request_id: REQUEST_ID,
  }

  it('passes only the guarded actor and sealed identifiers/version to the runtime RPC', async () => {
    setRpcResponses({
      expense_delete_own_unsettled_expense: {
        data: { deleted: true, group_id: GROUP_ID, financial_version: 8 },
        error: null,
      },
    })

    await expect(deleteOwnUnsettledExpense(input)).resolves.toEqual({ ok: true })
    expect(mockRpc).toHaveBeenCalledWith('expense_delete_own_unsettled_expense', {
      p_actor_id: ACTOR_ID,
      p_expense_id: EXPENSE_ID,
      p_expected_financial_version: 7,
      p_request_id: REQUEST_ID,
    })
    expect(JSON.stringify(mockRpc.mock.calls)).not.toMatch(/title|amount|participant|email|payload/i)
    expect(mockRevalidatePath).toHaveBeenCalledWith('/auth-mvp/vidburdir/[eventId]', 'page')
  })

  it('accepts the last safe successor at MAX_SAFE_INTEGER', async () => {
    const boundaryInput = {
      ...input,
      expected_financial_version: Number.MAX_SAFE_INTEGER - 1,
    }
    setRpcResponses({
      expense_delete_own_unsettled_expense: {
        data: {
          deleted: true,
          group_id: GROUP_ID,
          financial_version: Number.MAX_SAFE_INTEGER,
        },
        error: null,
      },
    })

    await expect(deleteOwnUnsettledExpense(boundaryInput)).resolves.toEqual({ ok: true })
  })

  it.each([
    ['expense_delete_open_revision', 'delete_open_revision'],
    ['expense_delete_settlement_history', 'delete_settlement_history'],
    ['expense_financial_version_conflict', 'conflict'],
    ['expense_delete_not_allowed', 'not_allowed'],
  ] as const)('maps %s to the bounded %s result', async (message, expected) => {
    setRpcResponses({
      expense_delete_own_unsettled_expense: {
        data: null,
        error: { message },
      },
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(deleteOwnUnsettledExpense(input)).resolves.toEqual({ ok: false, error: expected })
  })

  it.each([
    {
      label: 'extra key',
      data: { deleted: true, group_id: GROUP_ID, financial_version: 8, title: 'must not escape' },
    },
    {
      label: 'array wrapper',
      data: [{ deleted: true, group_id: GROUP_ID, financial_version: 8 }],
    },
    {
      label: 'null version',
      data: { deleted: true, group_id: GROUP_ID, financial_version: null },
    },
    {
      label: 'string version',
      data: { deleted: true, group_id: GROUP_ID, financial_version: '8' },
    },
    {
      label: 'boolean version',
      data: { deleted: true, group_id: GROUP_ID, financial_version: true },
    },
    {
      label: 'wrong successor',
      data: { deleted: true, group_id: GROUP_ID, financial_version: 9 },
    },
    {
      label: 'empty group id',
      data: { deleted: true, group_id: '', financial_version: 8 },
    },
    {
      label: 'invalid group id',
      data: { deleted: true, group_id: 'not-a-uuid', financial_version: 8 },
    },
  ])('fails closed on malformed success: $label', async ({ data }) => {
    setRpcResponses({
      expense_delete_own_unsettled_expense: {
        data,
        error: null,
      },
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(deleteOwnUnsettledExpense(input)).resolves.toEqual({
      ok: false,
      error: 'delete_outcome_unknown',
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/auth-mvp/vidburdir/[eventId]', 'page')
  })

  it('classifies a rejected RPC transport as an uncertain destructive outcome', async () => {
    mockRpc.mockRejectedValueOnce(new Error('network reset after request'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(deleteOwnUnsettledExpense(input)).resolves.toEqual({
      ok: false,
      error: 'delete_outcome_unknown',
    })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/auth-mvp/vidburdir/[eventId]', 'page')
  })

  it.each([
    { ...input, unexpected: true },
    { ...input, expected_financial_version: Number.MAX_SAFE_INTEGER },
    { ...input, expected_financial_version: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects unsafe or non-exact delete input before the RPC: %#', async (invalidInput) => {
    await expect(deleteOwnUnsettledExpense(invalidInput)).resolves.toEqual({
      ok: false,
      error: 'invalid_input',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('canonical identity and claim actions', () => {
  it('uses the guarded actor and accepts only the exact Relationship binding result', async () => {
    setRpcResponses({ expense_bind_member_relationship_identity_v1: { data: {
      expense_id: EXPENSE_ID, group_id: GROUP_ID, member_id: GUEST_MEMBER_ID, financial_version: 8,
    }, error: null } })
    await expect(bindExpenseMemberRelationshipIdentity({ expense_id: EXPENSE_ID, member_id: GUEST_MEMBER_ID,
      relationship_id: RELATIONSHIP_ID, expected_financial_version: 7, request_id: REQUEST_ID,
    })).resolves.toEqual({ ok: true, data: { expenseId: EXPENSE_ID, memberId: GUEST_MEMBER_ID, financialVersion: 8 } })
    expect(mockRpc).toHaveBeenCalledWith('expense_bind_member_relationship_identity_v1', {
      p_actor_id: ACTOR_ID, p_request_id: REQUEST_ID, p_expense_id: EXPENSE_ID,
      p_member_id: GUEST_MEMBER_ID, p_relationship_id: RELATIONSHIP_ID, p_expected_financial_version: 7,
    })
  })

  it.each([
    { expense_id: EXPENSE_ID, group_id: GROUP_ID, member_id: GUEST_MEMBER_ID, financial_version: 8, extra: true },
    { expense_id: EXPENSE_ID, member_id: GUEST_MEMBER_ID, financial_version: 8 },
    { expense_id: EXPENSE_ID, group_id: 'bad', member_id: GUEST_MEMBER_ID, financial_version: 8 },
  ])('fails closed on malformed Relationship binding result %#', async (data) => {
    setRpcResponses({ expense_bind_member_relationship_identity_v1: { data, error: null } })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const input = { expense_id: EXPENSE_ID, member_id: GUEST_MEMBER_ID,
      relationship_id: RELATIONSHIP_ID, expected_financial_version: 7, request_id: REQUEST_ID,
    }
    expect(BindExpenseMemberRelationshipIdentitySchema.safeParse(input).success).toBe(true)
    await expect(bindExpenseMemberRelationshipIdentity(input)).resolves.toEqual({ ok: false, error: 'invalid_input' })
  })
  it('passes only opaque Event candidate identity to the authoritative repair RPC', async () => {
    setRpcResponses({
      expense_bind_member_event_identity: {
        data: {
          group_id: GROUP_ID,
          expense_id: EXPENSE_ID,
          event_id: '80000000-0000-4000-8000-000000000001',
          member_id: GUEST_MEMBER_ID,
          financial_version: 8,
        },
        error: null,
      },
    })

    await expect(bindExpenseMemberEventIdentity({
      expense_id: EXPENSE_ID,
      member_id: GUEST_MEMBER_ID,
      event_participant_id: EVENT_PARTICIPANT_ID,
      expected_financial_version: 7,
      request_id: REQUEST_ID,
    })).resolves.toEqual({
      ok: true,
      data: { expenseId: EXPENSE_ID, memberId: GUEST_MEMBER_ID, financialVersion: 8 },
    })
    expect(mockRpc).toHaveBeenCalledWith('expense_bind_member_event_identity', {
      p_actor_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_expense_id: EXPENSE_ID,
      p_member_id: GUEST_MEMBER_ID,
      p_event_participant_id: EVENT_PARTICIPANT_ID,
      p_expected_financial_version: 7,
    })
    expect(JSON.stringify(mockRpc.mock.calls)).not.toMatch(/email|display_name|user_id/i)
  })

  it('uses session-only exact claim input and accepts only disputed output', async () => {
    setRpcResponses({
      expense_dispute_claim: {
        data: {
          group_id: GROUP_ID,
          expense_id: EXPENSE_ID,
          member_id: GUEST_MEMBER_ID,
          status: 'disputed',
          financial_version: 8,
        },
        error: null,
      },
    })

    await expect(disputeExpenseClaim({
      expense_id: EXPENSE_ID,
      member_id: GUEST_MEMBER_ID,
      expected_financial_version: 7,
      request_id: REQUEST_ID,
    })).resolves.toEqual({
      ok: true,
      data: {
        expenseId: EXPENSE_ID,
        memberId: GUEST_MEMBER_ID,
        status: 'disputed',
        financialVersion: 8,
      },
    })
    expect(mockRpc).toHaveBeenCalledWith('expense_dispute_claim', {
      p_actor_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_expense_id: EXPENSE_ID,
      p_member_id: GUEST_MEMBER_ID,
      p_expected_financial_version: 7,
    })
    expect(mockSendInvitation).not.toHaveBeenCalled()
  })
})

describe('shared expense share collaborators', () => {
  it('adds identity access without sending any financial amount to the RPC', async () => {
    setRpcResponses({
      expense_add_share_collaborator: {
        data: { group_id: GROUP_ID, expense_id: EXPENSE_ID, member_id: NEW_GUEST_MEMBER_ID },
        error: null,
      },
    })

    const result = await addExpenseShareCollaborator({
      group_id: GROUP_ID,
      expense_id: EXPENSE_ID,
      share_member_id: GUEST_MEMBER_ID,
      request_id: REQUEST_ID,
      member: { type: 'guest', display_name: 'Mamma og pabbi' },
    })

    expect(result).toEqual({ ok: true, data: { memberId: NEW_GUEST_MEMBER_ID } })
    expect(mockRpc).toHaveBeenCalledWith('expense_add_share_collaborator', {
      p_actor_id: ACTOR_ID,
      p_group_id: GROUP_ID,
      p_expense_id: EXPENSE_ID,
      p_share_member_id: GUEST_MEMBER_ID,
      p_request_id: REQUEST_ID,
      p_member: { id: NEW_GUEST_MEMBER_ID, display_name: 'Mamma og pabbi' },
      p_recipient_email: null,
      p_relationship_id: null,
    })
    expect(JSON.stringify(mockRpc.mock.calls)).not.toContain('amount_minor')
  })

  it('uses the existing scoped invitation delivery for an emailed collaborator', async () => {
    mockResolveExpenseMembers.mockResolvedValueOnce([
      {
        id: SELF_MEMBER_ID,
        key: 'self',
        userId: ACTOR_ID,
        displayName: 'Stebbi',
        role: 'owner',
        status: 'active',
      },
      {
        id: NEW_GUEST_MEMBER_ID,
        key: 'new',
        userId: null,
        displayName: 'Jón',
        role: 'member',
        status: 'active',
        recipientEmail: 'jon@example.is',
      },
    ])
    setRpcResponses({
      expense_add_share_collaborator: {
        data: {
          group_id: GROUP_ID,
          expense_id: EXPENSE_ID,
          member_id: NEW_GUEST_MEMBER_ID,
          invitation_id: INVITATION_ID,
        },
        error: null,
      },
      expense_reserve_scoped_member_invitation_send: {
        data: [{
          can_send: true,
          reason: 'reserved',
          attempt_number: 1,
          recipient_email: 'jon@example.is',
          email_template_version: 'v3',
          context_title: 'Afmælisgjöf 🔴',
          inviter_display_name: 'Stebbi',
        }],
        error: null,
      },
      expense_update_member_invitation_delivery: { data: 'ok', error: null },
    })

    const result = await addExpenseShareCollaborator({
      group_id: GROUP_ID,
      expense_id: EXPENSE_ID,
      share_member_id: GUEST_MEMBER_ID,
      request_id: REQUEST_ID,
      member: {
        type: 'email',
        display_name: 'Jón',
        recipient_email: 'jon@example.is',
      },
    })

    expect(result).toEqual({
      ok: true,
      data: {
        memberId: NEW_GUEST_MEMBER_ID,
        invitationId: INVITATION_ID,
        delivery: 'sent',
      },
    })
    expect(mockSendInvitation).toHaveBeenCalledWith(
      'jon@example.is',
      INVITATION_ID,
      1,
      {
        templateVersion: 'v3',
        contextTitle: 'Afmælisgjöf 🔴',
        inviterDisplayName: 'Stebbi',
      },
    )
    expect(mockRpc).toHaveBeenCalledWith('expense_add_share_collaborator', expect.objectContaining({
      p_recipient_email: 'jon@example.is',
      p_relationship_id: null,
    }))
  })
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

  it.each([
    {
      label: 'durably referenced participant removal',
      message: `expense_share_has_durable_reference ${EXPENSE_ID} actor@example.is`,
      code: 'P0001',
      expectedError: 'referenced_participant',
      expectedDiagnostic: { sqlState: 'P0001', reason: 'expense_share_has_durable_reference' },
    },
    {
      label: 'financial version conflict',
      message: `expense_financial_version_conflict ${EXPENSE_ID} actor@example.is`,
      code: 'P0001',
      expectedError: 'conflict',
      expectedDiagnostic: { sqlState: 'P0001', reason: 'expense_financial_version_conflict' },
    },
    {
      label: 'invalid split',
      message: `expense_split_total_mismatch ${EXPENSE_ID} actor@example.is`,
      code: 'P0001',
      expectedError: 'invalid_input',
      expectedDiagnostic: { sqlState: 'P0001', reason: 'expense_split_total_mismatch' },
    },
    {
      label: 'not allowed',
      message: `expense_update_not_allowed ${EXPENSE_ID} actor@example.is`,
      code: 'P0001',
      expectedError: 'not_allowed',
      expectedDiagnostic: { sqlState: 'P0001', reason: 'expense_update_not_allowed' },
    },
    {
      label: 'not found',
      message: `expense_not_found ${EXPENSE_ID} actor@example.is`,
      code: 'P0001',
      expectedError: 'not_found',
      expectedDiagnostic: { sqlState: 'P0001', reason: 'expense_not_found' },
    },
    {
      label: 'catalog error',
      message: `column "expense.private_payload" does not exist for ${EXPENSE_ID} actor@example.is`,
      code: '42703',
      expectedError: 'save_failed',
      expectedDiagnostic: { sqlState: '42703', reason: 'unknown', identifier: 'expense.private_payload' },
    },
    {
      label: 'unknown outcome',
      message: `transport ended for ${EXPENSE_ID} actor@example.is Private Person`,
      code: undefined,
      expectedError: 'save_outcome_unknown',
      expectedDiagnostic: { sqlState: 'unknown', reason: 'unknown' },
    },
  ])('maps and logs a bounded safe diagnostic for $label', async ({
    message, code, expectedError, expectedDiagnostic,
  }) => {
    setRpcResponses({
      expense_update_expense_with_participants: {
        data: null,
        error: { message, ...(code ? { code } : {}) },
      },
    })
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(updateExpense(updateInput())).resolves.toEqual({ ok: false, error: expectedError })
    expect(errorLog).toHaveBeenCalledWith('[expenses] update expense failed', expectedDiagnostic)
    const logged = JSON.stringify(errorLog.mock.calls)
    expect(logged).not.toContain(EXPENSE_ID)
    expect(logged).not.toContain(ACTOR_ID)
    expect(logged).not.toMatch(/actor@example\.is|Private Person|transport ended/i)
  })

  it('keeps a committed financial update successful when invitation delivery fails', async () => {
    setRpcResponses({
      expense_update_expense_with_participants: {
        data: {
          group_id: GROUP_ID,
          expense_id: EXPENSE_ID,
          financial_version: 8,
          invitation_ids: [INVITATION_ID],
        },
        error: null,
      },
      expense_reserve_scoped_member_invitation_send: {
        data: null,
        error: {
          message: `expense_delivery_unavailable ${INVITATION_ID} owner@example.is`,
          code: 'P0001',
        },
      },
    })
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(updateExpense(updateInput())).resolves.toEqual({
      ok: true,
      data: { groupId: GROUP_ID, expenseId: EXPENSE_ID, financialVersion: 8 },
    })
    expect(errorLog).toHaveBeenCalledWith(
      '[expenses] update invitation delivery follow-up failed',
      { sqlState: 'P0001', reason: 'expense_delivery_unavailable' },
    )
    expect(JSON.stringify(errorLog.mock.calls)).not.toMatch(new RegExp(`${INVITATION_ID}|owner@example\\.is`, 'i'))
  })

  it('keeps a committed financial update successful and logs bounded draft cleanup failure', async () => {
    setRpcResponses({
      expense_update_expense_with_participants: {
        data: { group_id: GROUP_ID, expense_id: EXPENSE_ID, financial_version: 8 },
        error: null,
      },
      expense_delete_private_draft: {
        data: null,
        error: {
          message: `expense_draft_conflict ${EXPENSE_ID} actor@example.is`,
          code: 'P0001',
        },
      },
    })
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(updateExpense(updateInput({ draft_id: REQUEST_ID }))).resolves.toEqual({
      ok: true,
      data: { groupId: GROUP_ID, expenseId: EXPENSE_ID, financialVersion: 8 },
    })
    expect(errorLog).toHaveBeenCalledWith(
      '[expenses] saved expense but draft cleanup failed',
      { sqlState: 'P0001', reason: 'expense_draft_conflict' },
    )
    expect(JSON.stringify(errorLog.mock.calls)).not.toMatch(new RegExp(`${EXPENSE_ID}|actor@example\\.is`, 'i'))
  })
})

describe('expense guest-member invitations', () => {
  it('renames a guest through the bounded idempotent RPC without financial input', async () => {
    setRpcResponses({
      expense_rename_guest_member: {
        data: {
          group_id: GROUP_ID,
          expense_id: EXPENSE_ID,
          member_id: GUEST_MEMBER_ID,
          display_name: 'Mamma',
        },
        error: null,
      },
    })

    await expect(renameExpenseGuestMember({
      group_id: GROUP_ID,
      member_id: GUEST_MEMBER_ID,
      display_name: '  Mamma  ',
      request_id: REQUEST_ID,
    })).resolves.toEqual({ ok: true, data: { displayName: 'Mamma' } })

    expect(mockRpc).toHaveBeenCalledWith('expense_rename_guest_member', {
      p_actor_id: ACTOR_ID,
      p_group_id: GROUP_ID,
      p_member_id: GUEST_MEMBER_ID,
      p_display_name: 'Mamma',
      p_request_id: REQUEST_ID,
    })
    expect(JSON.stringify(mockRpc.mock.calls)).not.toContain('amount_minor')
  })

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
          email_template_version: 'v3',
          context_title: 'Afmælisgjöf 🔴',
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
        templateVersion: 'v3',
        contextTitle: 'Afmælisgjöf 🔴',
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
      expense_get_scoped_member_invitation_preview: {
        data: [{ expense_id: EXPENSE_ID }],
        error: null,
      },
      expense_respond_scoped_member_invitation: {
        data: {
          status: 'accepted',
          group_id: GROUP_ID,
          expense_id: EXPENSE_ID,
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
      expected_expense_id: EXPENSE_ID,
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
      sourceGroupId: GROUP_ID,
    })
    expect(result).toEqual({
      ok: true,
      data: { status: 'accepted', groupId: GROUP_ID, expenseId: EXPENSE_ID },
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

  it('fails closed when an accepted response does not bind the expected exact expense', async () => {
    setRpcResponses({
      expense_get_scoped_member_invitation_preview: {
        data: [{ expense_id: EXPENSE_ID }],
        error: null,
      },
      expense_respond_scoped_member_invitation: {
        data: { status: 'accepted', group_id: GROUP_ID, expense_id: '40000000-0000-4000-8000-000000000099' },
        error: null,
      },
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(respondExpenseMemberInvitation({
      invitation_id: INVITATION_ID,
      action: 'accept',
      expected_expense_id: EXPENSE_ID,
      request_id: REQUEST_ID,
    })).resolves.toEqual({ ok: false, error: 'save_failed' })
    expect(mockUpsertSourceRelationship).not.toHaveBeenCalled()
  })

  it('does not mutate an invitation when the client supplies the wrong expected expense', async () => {
    setRpcResponses({
      expense_get_scoped_member_invitation_preview: {
        data: [{ expense_id: EXPENSE_ID }],
        error: null,
      },
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(respondExpenseMemberInvitation({
      invitation_id: INVITATION_ID,
      action: 'accept',
      expected_expense_id: '40000000-0000-4000-8000-000000000099',
      request_id: REQUEST_ID,
    })).resolves.toEqual({ ok: false, error: 'save_failed' })
    expect(mockRpc).not.toHaveBeenCalledWith(
      'expense_respond_scoped_member_invitation',
      expect.anything(),
    )
  })

  it('discards only the exact legacy edit draft through the dedicated RPC', async () => {
    setRpcResponses({
      expense_discard_legacy_edit_draft_v1: {
        data: {
          contract_version: 1,
          state: 'legacy_discarded',
          expense_id: EXPENSE_ID,
          group_id: GROUP_ID,
        },
        error: null,
      },
    })

    await expect(discardLegacyExpenseEditDraft({
      request_id: REQUEST_ID,
      expense_id: EXPENSE_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 2,
    })).resolves.toEqual({ ok: true, data: { expenseId: EXPENSE_ID } })
    expect(mockRpc).toHaveBeenCalledWith('expense_discard_legacy_edit_draft_v1', {
      p_actor_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_expense_id: EXPENSE_ID,
      p_draft_id: DRAFT_ID,
      p_expected_draft_version: 2,
    })
  })

  it('returns one bounded result when a second tab already removed the legacy draft', async () => {
    setRpcResponses({
      expense_discard_legacy_edit_draft_v1: {
        data: null,
        error: { code: 'P0001', message: 'expense_legacy_edit_draft_unbound' },
      },
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(discardLegacyExpenseEditDraft({
      request_id: REQUEST_ID,
      expense_id: EXPENSE_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 2,
    })).resolves.toEqual({ ok: false, error: 'legacy_edit_draft_unbound' })
  })

  it.each([
    ['updateExpense', updateExpense],
    ['linkExpenseGuestMember', linkExpenseGuestMember],
    ['renameExpenseGuestMember', renameExpenseGuestMember],
    ['resendExpenseMemberInvitation', resendExpenseMemberInvitation],
    ['respondExpenseMemberInvitation', respondExpenseMemberInvitation],
    ['cancelExpenseMemberInvitation', cancelExpenseMemberInvitation],
    ['discardLegacyExpenseEditDraft', discardLegacyExpenseEditDraft],
  ])('%s leaves redirect control flow outside its error boundary', async (_name, action) => {
    mockGuardExpenseAccess.mockRejectedValueOnce(new Error('NEXT_REDIRECT:/'))
    await expect(action({})).rejects.toThrow('NEXT_REDIRECT:/')
  })
})
