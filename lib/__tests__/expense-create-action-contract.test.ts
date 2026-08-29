import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const {
  mockGetAdmin,
  mockGuardExpenseAccess,
  mockCanUseEventExpenses,
  mockResolveExpenseMembers,
  mockGetExpenseActorDisplayName,
  mockGetOwnedEventExpenseSource,
  mockSetExpenseDraftEventRelation,
  mockSendInvitationEmail,
  mockRpc,
} = vi.hoisted(() => ({
  mockGetAdmin: vi.fn(),
  mockGuardExpenseAccess: vi.fn(),
  mockCanUseEventExpenses: vi.fn(),
  mockResolveExpenseMembers: vi.fn(),
  mockGetExpenseActorDisplayName: vi.fn(),
  mockGetOwnedEventExpenseSource: vi.fn(),
  mockSetExpenseDraftEventRelation: vi.fn(),
  mockSendInvitationEmail: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))
vi.mock('@/lib/expenses/guard', () => ({ guardExpenseAccess: mockGuardExpenseAccess }))
vi.mock('@/lib/events/guard', () => ({ canUseEventExpenses: mockCanUseEventExpenses }))
vi.mock('@/lib/events/repository.server', () => ({
  getOwnedEventExpenseSource: mockGetOwnedEventExpenseSource,
}))
vi.mock('@/lib/expenses/repository.server', () => ({
  getExpenseDraftPublicationLifecycle: vi.fn(),
  getExpensePrivateDraft: vi.fn(),
  setExpenseDraftEventRelationV1: mockSetExpenseDraftEventRelation,
}))
vi.mock('@/lib/expenses/email', () => ({
  sendExpenseMemberInvitationEmail: mockSendInvitationEmail,
}))
vi.mock('@/lib/expenses/participants.server', () => ({
  getExpenseActorDisplayName: mockGetExpenseActorDisplayName,
  resolveExpenseMembers: mockResolveExpenseMembers,
}))
vi.mock('@/lib/expenses/persistence.server', () => ({
  getActiveExpenseGroupMembersForActor: vi.fn(),
  getExpenseEditMembersForActor: vi.fn(),
}))

import {
  attachExpenseToEvent,
  createExpense,
  detachExpenseFromEvent,
  saveExpenseDraft,
  setExpenseEventVisibility,
} from '@/lib/expenses/actions'

const actorId = '10000000-0000-4000-8000-000000000001'
const selfMemberId = '20000000-0000-4000-8000-000000000001'
const guestMemberId = '20000000-0000-4000-8000-000000000002'
const persistedGroupId = '30000000-0000-4000-8000-000000000001'
const persistedExpenseId = '40000000-0000-4000-8000-000000000001'
const eventId = '80000000-0000-4000-8000-000000000001'
const eventGuestId = '90000000-0000-4000-8000-000000000001'

function expectedTaggedMemberId(requestId: string, memberKey: string): string {
  const hex = createHash('sha256')
    .update(JSON.stringify(['teskeid-event-expense-member-v1', actorId, requestId, memberKey]))
    .digest('hex')
    .slice(0, 32)
    .split('')
  hex[12] = '4'
  hex[16] = '8'
  const value = hex.join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

describe('createExpense RPC contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGuardExpenseAccess.mockResolvedValue({ user: { id: actorId } })
    mockCanUseEventExpenses.mockResolvedValue(true)
    mockSendInvitationEmail.mockResolvedValue('sent')
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
    mockSetExpenseDraftEventRelation.mockResolvedValue({
      draftId: '53000000-0000-4000-8000-000000000001',
      draftVersion: 2,
      publicationId: null,
      publicationVersion: null,
      previousDraftVersion: 1,
      previousPublicationVersion: null,
      eventId,
      eventRosterRevision: 4,
      visibility: 'participants_only',
      privacyFailClosed: false,
    })
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
    const [rpcName, payload] = mockRpc.mock.calls[0]
    expect(rpcName).toBe('expense_create_expense_with_participants')
    expect(payload.p_participant_invitations).toEqual([])
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

  it('keeps a known relationship anonymous until the scoped invitation is accepted', async () => {
    const relationshipId = '60000000-0000-4000-8000-000000000001'
    const counterpartId = '70000000-0000-4000-8000-000000000001'
    mockResolveExpenseMembers.mockResolvedValueOnce([
      { id: selfMemberId, key: 'self', userId: actorId, displayName: 'Stebbi', role: 'owner', status: 'active' },
      { id: guestMemberId, key: 'berglind', userId: counterpartId, displayName: 'Berglind', role: 'member', status: 'invited', relationshipId },
    ])

    const result = await createExpense({
      request_id: '50000000-0000-4000-8000-000000000002', group_id: null,
      title: 'Kvöldmatur', total: '100', currency: 'ISK', incurred_on: '2026-08-04',
      category: null, note: null, split_method: 'weighted',
      members: [{ type: 'self', key: 'self' }, { type: 'relationship', key: 'berglind', relationship_id: relationshipId }],
      payments: [{ member_key: 'self', amount: '100' }],
      allocations: [{ member_key: 'self', weight: '1' }, { member_key: 'berglind', weight: '1' }],
    })

    expect(result.ok).toBe(true)
    const [rpcName, payload] = mockRpc.mock.calls[0]
    expect(rpcName).toBe('expense_create_expense_with_participants')
    expect(payload.p_one_off_members[1]).toMatchObject({ id: guestMemberId, user_id: null, status: 'active' })
    expect(payload.p_participant_invitations).toEqual([{ member_id: guestMemberId, relationship_id: relationshipId }])
  })

  it('delegates tagged creation atomically with the exact compact SQL132 contract', async () => {
    const requestId = '50000000-0000-4000-8000-000000000003'
    const taggedSelfMemberId = expectedTaggedMemberId(requestId, 'self')
    const taggedGuestMemberId = expectedTaggedMemberId(requestId, `event:${eventGuestId}`)
    const eventSource = {
      id: eventId,
      name: 'Sumarferð',
      rosterRevision: 4,
      viewerRole: 'owner' as const,
      guests: [{
        id: eventGuestId,
        displayName: 'Anna',
        sourceKind: 'manual_name' as const,
      }],
    }
    mockGetOwnedEventExpenseSource.mockResolvedValueOnce(eventSource)
    mockResolveExpenseMembers.mockResolvedValueOnce([
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
        key: `event:${eventGuestId}`,
        userId: null,
        displayName: 'Anna',
        role: 'member',
        status: 'active',
        eventGuestId,
      },
    ])

    const taggedInput = {
      request_id: requestId,
      draft_id: '51000000-0000-4000-8000-000000000003',
      group_id: null,
      circle_id: null,
      event_id: eventId,
      expected_event_roster_revision: 4,
      link_to_event: true,
      event_visibility: 'all_event' as const,
      title: 'Kvöldmatur',
      total: '100',
      currency: 'ISK',
      incurred_on: '2026-08-16',
      category: null,
      note: null,
      split_method: 'equal',
      members: [
        { type: 'self', key: 'self' },
        { type: 'event_guest', key: `event:${eventGuestId}`, event_guest_id: eventGuestId },
      ],
      payments: [{ member_key: 'self', amount: '100' }],
      allocations: [
        { member_key: 'self' },
        { member_key: `event:${eventGuestId}` },
      ],
    }
    const result = await createExpense(taggedInput)

    expect(result).toEqual({
      ok: true,
      data: { groupId: persistedGroupId, expenseId: persistedExpenseId },
    })
    expect(mockGetOwnedEventExpenseSource).toHaveBeenCalledWith(actorId, eventId)
    expect(mockResolveExpenseMembers).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: actorId,
      eventSource,
      allowUnresolvedRelationshipReceiptReplay: true,
      members: expect.arrayContaining([
        expect.objectContaining({ type: 'event_guest', event_guest_id: eventGuestId }),
      ]),
    }))
    expect(mockRpc.mock.calls.map(([name]) => name)).toEqual([
      'teskeid_event_create_expense_from_event_for_actor',
      'expense_delete_private_draft',
    ])
    const [rpcName, rpcInput] = mockRpc.mock.calls[0]
    expect(rpcName).toBe('teskeid_event_create_expense_from_event_for_actor')
    expect(Object.keys(rpcInput).sort()).toEqual([
      'p_actor_id',
      'p_event_id',
      'p_expected_roster_revision',
      'p_link_to_event',
      'p_payload',
      'p_request_id',
    ])
    expect(rpcInput).toMatchObject({
      p_actor_id: actorId,
      p_request_id: requestId,
      p_event_id: eventId,
      p_expected_roster_revision: 4,
      p_link_to_event: true,
    })
    expect(Object.keys(rpcInput.p_payload).sort()).toEqual([
      'category',
      'currency',
      'event_guest_members',
      'event_organizer_members',
      'event_visibility',
      'incurred_on',
      'note',
      'obligations',
      'one_off_members',
      'participant_invitations',
      'payments',
      'shares',
      'split_method',
      'title',
      'total_minor',
    ])
    expect(rpcInput.p_payload).toEqual({
      title: 'Kvöldmatur',
      total_minor: 100,
      currency: 'ISK',
      incurred_on: '2026-08-16',
      category: null,
      note: null,
      event_visibility: 'all_event',
      split_method: 'equal',
      one_off_members: [
        {
          id: taggedSelfMemberId,
          user_id: actorId,
          display_name: 'Stebbi',
          role: 'owner',
          status: 'active',
        },
        {
          id: taggedGuestMemberId,
          user_id: null,
          display_name: 'Event guest',
          role: 'member',
          status: 'active',
        },
      ],
      payments: [{ member_id: taggedSelfMemberId, amount_minor: 100 }],
      shares: [
        { member_id: taggedGuestMemberId, amount_minor: 50 },
        { member_id: taggedSelfMemberId, amount_minor: 50 },
      ],
      obligations: [{
        from_member_id: taggedGuestMemberId,
        to_member_id: taggedSelfMemberId,
        amount_minor: 50,
        currency: 'ISK',
      }],
      participant_invitations: [],
      event_guest_members: [{ event_guest_id: eventGuestId, member_id: taggedGuestMemberId }],
      event_organizer_members: [],
    })
    expect(rpcInput).not.toHaveProperty('p_expense_id')
    expect(rpcInput).not.toHaveProperty('p_group_id')
    expect(rpcInput.p_payload).not.toHaveProperty('draft_id')

    mockGetOwnedEventExpenseSource.mockResolvedValue(eventSource)
    mockResolveExpenseMembers.mockResolvedValue([
      {
        id: '21000000-0000-4000-8000-000000000001',
        key: 'self',
        userId: actorId,
        displayName: 'Stebbi',
        role: 'owner',
        status: 'active',
      },
      {
        id: '21000000-0000-4000-8000-000000000002',
        key: `event:${eventGuestId}`,
        userId: null,
        displayName: 'Nýr roster-snapshot',
        role: 'member',
        status: 'active',
        eventGuestId,
      },
    ])
    await expect(createExpense(taggedInput)).resolves.toEqual(result)
    const taggedCalls = mockRpc.mock.calls.filter(([name]) => (
      name === 'teskeid_event_create_expense_from_event_for_actor'
    ))
    expect(taggedCalls).toHaveLength(2)
    expect(taggedCalls[1]![1]).toEqual(taggedCalls[0]![1])

    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'teskeid_event_roster_conflict' },
    })
    await expect(createExpense({
      ...taggedInput,
      request_id: '50000000-0000-4000-8000-000000000004',
    })).resolves.toEqual({ ok: false, error: 'event_roster_changed' })

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: '42703',
        message: 'column "invitation.delivery_state" does not exist private@example.is',
      },
    })
    await expect(createExpense({
      ...taggedInput,
      request_id: '50000000-0000-4000-8000-000000000014',
    })).resolves.toEqual({ ok: false, error: 'save_failed' })
    expect(consoleError).toHaveBeenLastCalledWith(
      '[expenses] create expense failed',
      { sqlState: '42703', reason: 'unknown', identifier: 'invitation.delivery_state' },
    )
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain('private@example.is')
    consoleError.mockRestore()
  })

  it('uses the independent Event-import wrapper for an explicit attendee source', async () => {
    const requestId = '50000000-0000-4000-8000-000000000013'
    mockGetOwnedEventExpenseSource.mockResolvedValueOnce({
      id: eventId,
      name: 'Sumarferð',
      rosterRevision: 4,
      viewerRole: 'attendee',
      guests: [{
        id: eventGuestId,
        displayName: 'Anna',
        sourceKind: 'manual_name',
      }],
    })
    mockResolveExpenseMembers.mockResolvedValueOnce([
      {
        id: selfMemberId, key: 'self', userId: actorId, displayName: 'Stebbi',
        role: 'owner', status: 'active',
      },
      {
        id: guestMemberId, key: `event:${eventGuestId}`, userId: null,
        displayName: 'Anna', role: 'member', status: 'active', eventGuestId,
      },
    ])

    await expect(createExpense({
      request_id: requestId,
      group_id: null,
      circle_id: null,
      event_id: eventId,
      expected_event_roster_revision: 4,
      title: 'Kvöldmatur', total: '100', currency: 'ISK', incurred_on: '2026-08-16',
      category: null, note: null, split_method: 'equal',
      members: [
        { type: 'self', key: 'self' },
        { type: 'event_guest', key: `event:${eventGuestId}`, event_guest_id: eventGuestId },
      ],
      payments: [{ member_key: 'self', amount: '100' }],
      allocations: [{ member_key: 'self' }, { member_key: `event:${eventGuestId}` }],
    })).resolves.toEqual({
      ok: true,
      data: { groupId: persistedGroupId, expenseId: persistedExpenseId },
    })

    expect(mockRpc.mock.calls[0]![0]).toBe('teskeid_event_create_expense_from_event_for_actor')
    expect(mockRpc.mock.calls[0]![1].p_link_to_event).toBe(false)
  })

  it('reaches the tagged SQL receipt when a non-event relationship disappears after a lost response', async () => {
    const requestId = '50000000-0000-4000-8000-000000000007'
    const relationshipId = '60000000-0000-4000-8000-000000000007'
    const counterpartId = '70000000-0000-4000-8000-000000000007'
    const memberKey = 'relationship:bjarni'
    const taggedRelationshipMemberId = expectedTaggedMemberId(requestId, memberKey)
    const eventSource = {
      id: eventId,
      name: 'Sumarferð',
      rosterRevision: 4,
      guests: [],
    }
    mockGetOwnedEventExpenseSource.mockResolvedValue(eventSource)
    mockResolveExpenseMembers
      .mockResolvedValueOnce([
        {
          id: selfMemberId, key: 'self', userId: actorId, displayName: 'Stebbi',
          role: 'owner', status: 'active',
        },
        {
          id: guestMemberId, key: memberKey, userId: counterpartId, displayName: 'Bjarni',
          role: 'member', status: 'invited', relationshipId,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: selfMemberId, key: 'self', userId: actorId, displayName: 'Stebbi',
          role: 'owner', status: 'active',
        },
        {
          id: guestMemberId, key: memberKey, userId: null,
          displayName: 'Teskeiðarnotandi', role: 'member', status: 'invited', relationshipId,
        },
      ])
    mockRpc
      .mockRejectedValueOnce(new Error('network response lost'))
      .mockResolvedValue({
        data: { group_id: persistedGroupId, expense_id: persistedExpenseId },
        error: null,
      })
    const input = {
      request_id: requestId,
      group_id: null,
      circle_id: null,
      event_id: eventId,
      expected_event_roster_revision: 4,
      title: 'Kvöldmatur', total: '100', currency: 'ISK', incurred_on: '2026-08-16',
      category: null, note: null, split_method: 'equal',
      members: [
        { type: 'self', key: 'self' },
        { type: 'relationship', key: memberKey, relationship_id: relationshipId },
      ],
      payments: [{ member_key: 'self', amount: '100' }],
      allocations: [{ member_key: 'self' }, { member_key: memberKey }],
    }

    await expect(createExpense(input)).resolves.toEqual({ ok: false, error: 'save_failed' })
    await expect(createExpense(input)).resolves.toEqual({
      ok: true,
      data: { groupId: persistedGroupId, expenseId: persistedExpenseId },
    })

    const taggedCalls = mockRpc.mock.calls.filter(([name]) => (
      name === 'teskeid_event_create_expense_from_event_for_actor'
    ))
    expect(taggedCalls).toHaveLength(2)
    for (const [, rpcInput] of taggedCalls) {
      expect(rpcInput.p_payload.one_off_members[1]).toMatchObject({
        id: taggedRelationshipMemberId,
        user_id: null,
        role: 'member',
        status: 'active',
      })
      expect(rpcInput.p_payload.participant_invitations).toEqual([{
        member_id: taggedRelationshipMemberId,
        relationship_id: relationshipId,
      }])
    }
    expect(taggedCalls[0]![1].p_payload.one_off_members[1].display_name).toBe('Bjarni')
    expect(taggedCalls[1]![1].p_payload.one_off_members[1].display_name)
      .toBe('Teskeiðarnotandi')
    expect(mockResolveExpenseMembers).toHaveBeenNthCalledWith(2, expect.objectContaining({
      allowUnresolvedRelationshipReceiptReplay: true,
    }))
  })

  it('fails closed before event reads or writes when either global event gate is unavailable', async () => {
    mockCanUseEventExpenses.mockResolvedValueOnce(false)

    const result = await createExpense({
      request_id: '50000000-0000-4000-8000-000000000005',
      group_id: null,
      circle_id: null,
      event_id: eventId,
      expected_event_roster_revision: 4,
      title: 'Kvöldmatur',
      total: '100',
      currency: 'ISK',
      incurred_on: '2026-08-16',
      category: null,
      note: null,
      split_method: 'equal',
      members: [
        { type: 'self', key: 'self' },
        { type: 'guest', key: 'guest', display_name: 'Gestur' },
      ],
      payments: [{ member_key: 'self', amount: '100' }],
      allocations: [{ member_key: 'self' }, { member_key: 'guest' }],
    })

    expect(result).toEqual({ ok: false, error: 'feature_disabled' })
    expect(mockGetOwnedEventExpenseSource).not.toHaveBeenCalled()
    expect(mockResolveExpenseMembers).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('saves a recoverable no-Event draft, binds it, then stores only opaque Event provenance', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        draft_id: '53000000-0000-4000-8000-000000000001',
        draft_version: 1,
        saved_at: '2026-08-16T11:00:00.000Z',
      },
      error: null,
    }).mockResolvedValueOnce({
      data: {
        draft_id: '53000000-0000-4000-8000-000000000001',
        draft_version: 3,
        saved_at: '2026-08-16T11:00:01.000Z',
      },
      error: null,
    })

    const result = await saveExpenseDraft({
      draft_id: '53000000-0000-4000-8000-000000000001',
      expected_version: null,
      context_type: 'one_off',
      group_id: null,
      expense_id: null,
      current_step: 'split',
      payload: {
        circleId: null,
        eventId,
        eventRosterRevision: 4,
        linkToEvent: true,
        eventVisibility: 'participants_only',
        members: [
          { key: 'self', label: 'Stebbi', input: { type: 'self', key: 'self' }, isSelf: true },
          {
            key: `event:${eventGuestId}`,
            label: 'anna@example.com',
            input: { type: 'event_guest', key: `event:${eventGuestId}`, event_guest_id: eventGuestId },
            newGuest: {
              id: '54000000-0000-4000-8000-000000000001',
              display_name: 'Anna',
              recipient_email: 'anna@example.com',
            },
            isSelf: false,
          },
        ],
        removedMemberIds: [],
        included: { self: true, [`event:${eventGuestId}`]: false },
        title: 'Kvöldmatur',
        total: '100',
        currency: 'ISK',
        incurredOn: '2026-08-16',
        category: '',
        note: '',
        splitMethod: 'weighted',
        payments: { self: '100', [`event:${eventGuestId}`]: '' },
        payerKeys: ['self'],
        amounts: { self: '0', [`event:${eventGuestId}`]: '0' },
        percentages: { self: '100', [`event:${eventGuestId}`]: '' },
        weights: { self: '1', [`event:${eventGuestId}`]: '1' },
        preserveShares: false,
      },
    })

    expect(result.ok).toBe(true)
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({ version: 3, relationStatus: 'bound', eventId }),
    }))
    expect(mockRpc).toHaveBeenCalledTimes(2)
    const [firstName, firstInput] = mockRpc.mock.calls[0]
    expect(firstName).toBe('expense_save_private_draft')
    expect(firstInput.p_payload).toMatchObject({
      eventId: null,
      eventRosterRevision: null,
      linkToEvent: false,
      members: [expect.objectContaining({ key: 'self' })],
    })
    expect(JSON.stringify(firstInput.p_payload)).not.toContain('anna@example.com')
    expect(mockSetExpenseDraftEventRelation).toHaveBeenCalledWith(actorId, expect.objectContaining({
      draftId: '53000000-0000-4000-8000-000000000001',
      expectedDraftVersion: 1,
      expectedEventId: null,
      eventId,
      eventRosterRevision: 4,
    }))
    const [secondName, secondInput] = mockRpc.mock.calls[1]
    expect(secondName).toBe('expense_save_private_draft')
    expect(secondInput.p_expected_version).toBe(2)
    expect(secondInput.p_payload.members[1]).toEqual({
      key: `event:${eventGuestId}`,
      label: 'Event participant',
      input: { type: 'event_guest', key: `event:${eventGuestId}`, event_guest_id: eventGuestId },
      isSelf: false,
    })
    expect(JSON.stringify(secondInput.p_payload)).not.toContain('anna@example.com')
  })

  it('adopts the server-canonical edit draft identity and retries the payload with CAS', async () => {
    const proposedDraftId = '53000000-0000-4000-8000-000000000010'
    const canonicalDraftId = '53000000-0000-4000-8000-000000000011'
    mockRpc.mockResolvedValueOnce({
      data: {
        draft_id: canonicalDraftId,
        draft_version: 4,
        saved_at: '2026-08-28T08:00:00.000Z',
      },
      error: null,
    }).mockResolvedValueOnce({
      data: {
        draft_id: canonicalDraftId,
        draft_version: 5,
        saved_at: '2026-08-28T08:00:01.000Z',
      },
      error: null,
    })

    const result = await saveExpenseDraft({
      draft_id: proposedDraftId,
      expected_version: null,
      context_type: 'edit',
      group_id: persistedGroupId,
      expense_id: persistedExpenseId,
      current_step: 'split',
      payload: {
        circleId: null,
        eventId: null,
        eventRosterRevision: null,
        linkToEvent: false,
        eventVisibility: 'participants_only',
        members: [{ key: 'self', label: 'Stebbi', input: { type: 'self', key: 'self' }, isSelf: true }],
        removedMemberIds: [],
        included: { self: true },
        title: 'Kvöldmatur',
        total: '100',
        currency: 'ISK',
        incurredOn: '2026-08-28',
        category: '',
        note: '',
        splitMethod: 'percentage',
        payments: { self: '100' },
        payerKeys: ['self'],
        amounts: { self: '100' },
        percentages: { self: '100' },
        weights: { self: '1' },
        preserveShares: true,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      data: expect.objectContaining({ draftId: canonicalDraftId, version: 5 }),
    }))
    expect(mockRpc).toHaveBeenCalledTimes(2)
    expect(mockRpc.mock.calls[0]?.[1]).toMatchObject({
      p_draft_id: proposedDraftId,
      p_expected_version: null,
    })
    expect(mockRpc.mock.calls[1]?.[1]).toMatchObject({
      p_draft_id: canonicalDraftId,
      p_expected_version: 4,
    })
    expect(mockRpc.mock.calls[1]?.[1].p_payload).toEqual(mockRpc.mock.calls[0]?.[1].p_payload)
  })

  it('delivers only invitation IDs returned by the atomic tagged wrapper', async () => {
    const requestId = '50000000-0000-4000-8000-000000000006'
    const invitationId = '55000000-0000-4000-8000-000000000001'
    const taggedSelfMemberId = expectedTaggedMemberId(requestId, 'self')
    const taggedGuestMemberId = expectedTaggedMemberId(requestId, `event:${eventGuestId}`)
    const relationshipSource = {
      id: eventId,
      name: 'Sumarferð',
      rosterRevision: 4,
      guests: [{ id: eventGuestId, displayName: 'Anna', sourceKind: 'relationship' as const }],
    }
    mockGetOwnedEventExpenseSource.mockResolvedValueOnce(relationshipSource)
    mockResolveExpenseMembers.mockResolvedValueOnce([
      {
        id: selfMemberId, key: 'self', userId: actorId, displayName: 'Stebbi',
        role: 'owner', status: 'active',
      },
      {
        id: guestMemberId, key: `event:${eventGuestId}`, userId: null, displayName: 'Anna',
        role: 'member', status: 'active', eventGuestId,
      },
    ])
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'teskeid_event_create_expense_from_event_for_actor') {
        return {
          data: {
            group_id: persistedGroupId,
            expense_id: persistedExpenseId,
            invitation_ids: [invitationId],
          },
          error: null,
        }
      }
      if (name === 'expense_reserve_scoped_member_invitation_send') {
        return {
          data: {
            can_send: true,
            reason: 'reserved',
            attempt_number: 1,
            recipient_email: 'anna@example.com',
            email_template_version: 'v3',
            context_title: 'Kvöldmatur',
            inviter_display_name: 'Stebbi',
          },
          error: null,
        }
      }
      if (name === 'expense_update_member_invitation_delivery') {
        return { data: 'ok', error: null }
      }
      return { data: null, error: { message: 'unexpected_rpc' } }
    })

    await expect(createExpense({
      request_id: requestId,
      group_id: null,
      circle_id: null,
      event_id: eventId,
      expected_event_roster_revision: 4,
      title: 'Kvöldmatur', total: '100', currency: 'ISK', incurred_on: '2026-08-16',
      category: null, note: null, split_method: 'equal',
      members: [
        { type: 'self', key: 'self' },
        { type: 'event_guest', key: `event:${eventGuestId}`, event_guest_id: eventGuestId },
      ],
      payments: [{ member_key: 'self', amount: '100' }],
      allocations: [{ member_key: 'self' }, { member_key: `event:${eventGuestId}` }],
    })).resolves.toEqual({
      ok: true,
      data: { groupId: persistedGroupId, expenseId: persistedExpenseId },
    })

    expect(mockRpc.mock.calls.map(([name]) => name)).toEqual([
      'teskeid_event_create_expense_from_event_for_actor',
      'expense_reserve_scoped_member_invitation_send',
      'expense_update_member_invitation_delivery',
    ])
    expect(mockSendInvitationEmail).toHaveBeenCalledWith(
      'anna@example.com',
      invitationId,
      1,
      expect.objectContaining({ templateVersion: 'v3', contextTitle: 'Kvöldmatur' }),
    )
    const taggedPayload = mockRpc.mock.calls[0]![1].p_payload
    expect(taggedPayload.event_guest_members).toEqual([
      { event_guest_id: eventGuestId, member_id: taggedGuestMemberId },
    ])
    expect(taggedPayload.one_off_members[0].id).toBe(taggedSelfMemberId)
    expect(JSON.stringify(taggedPayload)).not.toContain('anna@example.com')
  })
})

describe('independent Expense event-link actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGuardExpenseAccess.mockResolvedValue({ user: { id: actorId } })
    mockCanUseEventExpenses.mockResolvedValue(true)
    mockGetAdmin.mockReturnValue({ rpc: mockRpc })
  })

  it('binds attach to both stale-state versions and the stable request id', async () => {
    const requestId = '50000000-0000-4000-8000-000000000020'
    mockRpc.mockResolvedValueOnce({
      data: {
        expense_id: persistedExpenseId,
        event_id: eventId,
        visibility: 'participants_only',
        link_revision: '1',
      },
      error: null,
    })
    await expect(attachExpenseToEvent({
      expense_id: persistedExpenseId,
      event_id: eventId,
      expected_financial_version: 7,
      expected_event_roster_revision: 4,
      visibility: 'participants_only',
      request_id: requestId,
    })).resolves.toEqual({
      ok: true,
      data: {
        expenseId: persistedExpenseId,
        eventId,
        visibility: 'participants_only',
        linkRevision: 1,
      },
    })
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_attach_expense_v2', {
      p_actor_id: actorId,
      p_request_id: requestId,
      p_expense_id: persistedExpenseId,
      p_event_id: eventId,
      p_expected_financial_version: 7,
      p_expected_roster_revision: 4,
      p_visibility: 'participants_only',
    })
  })

  it('rejects a missing V2 attach visibility instead of applying a hidden default', async () => {
    await expect(attachExpenseToEvent({
      expense_id: persistedExpenseId,
      event_id: eventId,
      expected_financial_version: 7,
      expected_event_roster_revision: 4,
      request_id: '50000000-0000-4000-8000-000000000025',
    })).resolves.toEqual({ ok: false, error: 'invalid_input' })

    expect(mockCanUseEventExpenses).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects an attach response that does not represent a fresh revision-one link', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        expense_id: persistedExpenseId,
        event_id: eventId,
        visibility: 'participants_only',
        link_revision: '2',
      },
      error: null,
    })

    await expect(attachExpenseToEvent({
      expense_id: persistedExpenseId,
      event_id: eventId,
      expected_financial_version: 7,
      expected_event_roster_revision: 4,
      visibility: 'participants_only',
      request_id: '50000000-0000-4000-8000-000000000026',
    })).resolves.toEqual({ ok: false, error: 'invalid_input' })
  })

  it('sets visibility against the exact persisted event and link revision', async () => {
    const requestId = '50000000-0000-4000-8000-000000000023'
    mockRpc.mockResolvedValueOnce({
      data: {
        expense_id: persistedExpenseId,
        event_id: eventId,
        previous_visibility: 'participants_only',
        visibility: 'all_event',
        previous_link_revision: '3',
        link_revision: '4',
      },
      error: null,
    })

    await expect(setExpenseEventVisibility({
      expense_id: persistedExpenseId,
      expected_event_id: eventId,
      expected_link_revision: 3,
      visibility: 'all_event',
      request_id: requestId,
    })).resolves.toEqual({
      ok: true,
      data: {
        expenseId: persistedExpenseId,
        eventId,
        previousVisibility: 'participants_only',
        visibility: 'all_event',
        previousLinkRevision: 3,
        linkRevision: 4,
      },
    })
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_set_expense_visibility', {
      p_actor_id: actorId,
      p_request_id: requestId,
      p_expense_id: persistedExpenseId,
      p_expected_event_id: eventId,
      p_expected_link_revision: 3,
      p_visibility: 'all_event',
    })
  })

  it('accepts a strict same-mode visibility no-op without incrementing the link revision', async () => {
    const requestId = '50000000-0000-4000-8000-000000000024'
    mockRpc.mockResolvedValueOnce({
      data: {
        expense_id: persistedExpenseId,
        event_id: eventId,
        previous_visibility: 'participants_only',
        visibility: 'participants_only',
        previous_link_revision: '3',
        link_revision: '3',
      },
      error: null,
    })

    await expect(setExpenseEventVisibility({
      expense_id: persistedExpenseId,
      expected_event_id: eventId,
      expected_link_revision: 3,
      visibility: 'participants_only',
      request_id: requestId,
    })).resolves.toEqual({
      ok: true,
      data: {
        expenseId: persistedExpenseId,
        eventId,
        previousVisibility: 'participants_only',
        visibility: 'participants_only',
        previousLinkRevision: 3,
        linkRevision: 3,
      },
    })
  })

  it('detaches only the expected link and fails before SQL without both gates', async () => {
    const requestId = '50000000-0000-4000-8000-000000000021'
    mockRpc.mockResolvedValueOnce({
      data: { expense_id: persistedExpenseId, event_id: eventId },
      error: null,
    })
    await expect(detachExpenseFromEvent({
      expense_id: persistedExpenseId,
      expected_event_id: eventId,
      expected_financial_version: 7,
      request_id: requestId,
    })).resolves.toEqual({
      ok: true,
      data: { expenseId: persistedExpenseId, eventId },
    })
    expect(mockRpc).toHaveBeenCalledWith('teskeid_event_detach_expense', {
      p_actor_id: actorId,
      p_request_id: requestId,
      p_expense_id: persistedExpenseId,
      p_expected_event_id: eventId,
      p_expected_financial_version: 7,
    })

    mockCanUseEventExpenses.mockResolvedValueOnce(false)
    mockRpc.mockClear()
    await expect(attachExpenseToEvent({
      expense_id: persistedExpenseId,
      event_id: eventId,
      expected_financial_version: 7,
      expected_event_roster_revision: 4,
      visibility: 'participants_only',
      request_id: '50000000-0000-4000-8000-000000000022',
    })).resolves.toEqual({ ok: false, error: 'feature_disabled' })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
