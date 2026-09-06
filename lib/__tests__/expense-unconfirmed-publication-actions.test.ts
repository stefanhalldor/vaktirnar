import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAdmin,
  mockGetPrivateDraft,
  mockGuardExpenseAccess,
  mockRevalidatePath,
  mockRpc,
} = vi.hoisted(() => ({
  mockGetAdmin: vi.fn(),
  mockGetPrivateDraft: vi.fn(),
  mockGuardExpenseAccess: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))
vi.mock('@/lib/expenses/guard', () => ({ guardExpenseAccess: mockGuardExpenseAccess }))
vi.mock('@/lib/events/guard', () => ({ canUseEventExpenses: vi.fn() }))
vi.mock('@/lib/events/repository.server', () => ({
  getOwnedEventExpenseSource: vi.fn(),
}))
vi.mock('@/lib/expenses/repository.server', () => ({
  getExpenseDraftPublicationLifecycle: vi.fn(),
  getExpensePrivateDraft: mockGetPrivateDraft,
}))
vi.mock('@/lib/expenses/participants.server', () => ({
  getExpenseActorDisplayName: vi.fn(),
  resolveExpenseMembers: vi.fn(),
}))
vi.mock('@/lib/expenses/persistence.server', () => ({
  getActiveExpenseGroupMembersForActor: vi.fn(),
  getExpenseEditMembersForActor: vi.fn(),
}))
vi.mock('@/lib/expenses/email', () => ({ sendExpenseMemberInvitationEmail: vi.fn() }))

import {
  deleteOwnExpenseCreationDraft,
  finalizeExpenseDraft,
  shareExpenseDraft,
  unshareExpenseDraft,
} from '@/lib/expenses/actions'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const DRAFT_ID = '20000000-0000-4000-8000-000000000001'
const REQUEST_ID = '30000000-0000-4000-8000-000000000001'
const PUBLICATION_ID = '40000000-0000-4000-8000-000000000001'
const GROUP_ID = '50000000-0000-4000-8000-000000000001'
const EXPENSE_ID = '60000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.clearAllMocks()
  mockGuardExpenseAccess.mockResolvedValue({ user: { id: ACTOR_ID } })
  mockGetAdmin.mockReturnValue({ rpc: mockRpc })
  mockGetPrivateDraft.mockResolvedValue({
    id: DRAFT_ID,
    expenseId: null,
    payload: { linkToEvent: false, eventId: null },
  })
})

describe('SQL159 mutation actions', () => {
  it('derives the actor from the guard and maps the exact share contract', async () => {
    mockRpc.mockResolvedValue({
      data: {
        contract_version: 1,
        state: 'shared_draft',
        draft_id: DRAFT_ID,
        draft_version: 7,
        publication_id: PUBLICATION_ID,
        publication_version: 3,
        allocation_state: 'incomplete',
        shareable_fingerprint: 'a'.repeat(32),
      },
      error: null,
    })

    await expect(shareExpenseDraft({
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 7,
      expected_publication_version: 2,
    })).resolves.toEqual({
      ok: true,
      data: {
        draftId: DRAFT_ID,
        draftVersion: 7,
        publicationVersion: 3,
        allocationState: 'incomplete',
      },
    })
    expect(mockRpc).toHaveBeenCalledWith('expense_share_private_draft', {
      p_actor_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_draft_id: DRAFT_ID,
      p_expected_draft_version: 7,
      p_expected_publication_version: 2,
    })
  })

  it('does not report a committed share as failed when cache revalidation throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({
      data: {
        contract_version: 1,
        state: 'shared_draft',
        draft_id: DRAFT_ID,
        draft_version: 7,
        publication_id: PUBLICATION_ID,
        publication_version: 1,
        allocation_state: 'balanced_unconfirmed',
        shareable_fingerprint: 'a'.repeat(32),
      },
      error: null,
    })
    mockRevalidatePath.mockImplementationOnce(() => {
      throw new Error('cache unavailable')
    })

    await expect(shareExpenseDraft({
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 7,
      expected_publication_version: null,
    })).resolves.toEqual({
      ok: true,
      data: {
        draftId: DRAFT_ID,
        draftVersion: 7,
        publicationVersion: 1,
        allocationState: 'balanced_unconfirmed',
      },
    })
    expect(consoleError).toHaveBeenCalledWith(
      '[expenses] post-mutation cache revalidation failed',
      { sqlState: 'unknown', reason: 'unknown' },
    )
    consoleError.mockRestore()
  })

  it('keeps the retained publication CAS on unshare and rejects extra client authority', async () => {
    await expect(unshareExpenseDraft({
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 7,
      expected_publication_version: 3,
      actor_id: ACTOR_ID,
    })).resolves.toEqual({ ok: false, error: 'invalid_input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('finalizes only a strict result and never returns invitation identifiers', async () => {
    mockRpc.mockResolvedValue({
      data: {
        contract_version: 1,
        state: 'confirmed',
        draft_id: DRAFT_ID,
        group_id: GROUP_ID,
        expense_id: EXPENSE_ID,
        invitation_ids: [],
      },
      error: null,
    })

    await expect(finalizeExpenseDraft({
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 7,
      expected_publication_version: null,
      split_confirmed: true,
    })).resolves.toEqual({ ok: true, data: { groupId: GROUP_ID, expenseId: EXPENSE_ID } })
    expect(mockRpc).toHaveBeenCalledWith('expense_finalize_private_draft', {
      p_actor_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_draft_id: DRAFT_ID,
      p_expected_draft_version: 7,
      p_expected_publication_version: null,
      p_split_confirmed: true,
    })
  })

  it('does not report a committed finalization as failed when invitation follow-up throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc
      .mockResolvedValueOnce({
        data: {
          contract_version: 1,
          state: 'confirmed',
          draft_id: DRAFT_ID,
          group_id: GROUP_ID,
          expense_id: EXPENSE_ID,
          invitation_ids: [PUBLICATION_ID],
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'XX000', message: 'mail transport failed' },
      })

    await expect(finalizeExpenseDraft({
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 7,
      expected_publication_version: null,
      split_confirmed: true,
    })).resolves.toEqual({ ok: true, data: { groupId: GROUP_ID, expenseId: EXPENSE_ID } })
    expect(consoleError).toHaveBeenCalledWith(
      '[expenses] finalized expense invitation delivery failed',
      { sqlState: 'XX000', reason: 'unknown' },
    )
    consoleError.mockRestore()
  })

  it('lets the SQL finalizer replay an exact lost-response request after the draft is consumed', async () => {
    mockGetPrivateDraft.mockResolvedValue(null)
    mockRpc.mockResolvedValue({
      data: {
        contract_version: 1,
        state: 'confirmed',
        draft_id: DRAFT_ID,
        group_id: GROUP_ID,
        expense_id: EXPENSE_ID,
        invitation_ids: [],
      },
      error: null,
    })

    await expect(finalizeExpenseDraft({
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 7,
      expected_publication_version: null,
      split_confirmed: true,
    })).resolves.toEqual({ ok: true, data: { groupId: GROUP_ID, expenseId: EXPENSE_ID } })

    expect(mockRpc).toHaveBeenCalledWith('expense_finalize_private_draft', expect.objectContaining({
      p_actor_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_draft_id: DRAFT_ID,
    }))
  })

  it('maps strict normalizer failures to actionable bounded errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetPrivateDraft.mockResolvedValue({
      id: DRAFT_ID,
      contextType: 'one_off',
      expenseId: null,
      payload: { linkToEvent: true, eventId: '70000000-0000-4000-8000-000000000001' },
    })
    const input = {
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 7,
      expected_publication_version: null,
    }
    const cases = [
      ['expense_unconfirmed_invalid_draft', 'invalid_input'],
      ['expense_unconfirmed_source_changed', 'participant_source_changed'],
      ['expense_unconfirmed_event_unavailable', 'event_roster_changed'],
      ['expense_unconfirmed_duplicate_identity', 'duplicate_participant'],
      ['expense_unconfirmed_author_required', 'author_required'],
    ] as const
    for (const [reason, expected] of cases) {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { code: 'P0001', message: reason },
      })
      await expect(shareExpenseDraft(input)).resolves.toEqual({ ok: false, error: expected })
    }

    mockGetPrivateDraft.mockResolvedValue({
      id: DRAFT_ID,
      contextType: 'one_off',
      expenseId: null,
      payload: { linkToEvent: false, eventId: null },
    })
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0001', message: 'expense_unconfirmed_source_changed' },
    })
    await expect(shareExpenseDraft(input)).resolves.toEqual({
      ok: false,
      error: 'participant_source_changed',
    })
    consoleError.mockRestore()
  })

  it('fails closed on a malformed finalizer payload and maps stale writes to conflict', async () => {
    mockRpc
      .mockResolvedValueOnce({
        data: {
          contract_version: 1,
          state: 'confirmed',
          draft_id: DRAFT_ID,
          group_id: GROUP_ID,
          expense_id: EXPENSE_ID,
          invitation_ids: [],
          unexpected: true,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'P0001', message: 'expense_unconfirmed_shared_snapshot_stale' },
      })

    await expect(finalizeExpenseDraft({
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 7,
      expected_publication_version: null,
      split_confirmed: true,
    })).resolves.toEqual({ ok: false, error: 'save_outcome_unknown' })
    await expect(shareExpenseDraft({
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 7,
      expected_publication_version: 3,
    })).resolves.toEqual({ ok: false, error: 'conflict' })
  })
})

describe('SQL175 creation-draft delete action', () => {
  const input = {
    request_id: REQUEST_ID,
    draft_id: DRAFT_ID,
    expected_draft_version: 7,
    expected_publication_version: 3,
  }

  it('derives actor authority and accepts only the exact strict RPC result', async () => {
    mockRpc.mockResolvedValue({
      data: {
        contract_version: 1,
        state: 'deleted',
        deleted: true,
        draft_id: DRAFT_ID,
        subject: 'shared_draft',
        group_id: GROUP_ID,
        event_id: null,
      },
      error: null,
    })

    await expect(deleteOwnExpenseCreationDraft(input)).resolves.toEqual({
      ok: true,
      data: {
        draftId: DRAFT_ID,
        subject: 'shared_draft',
        groupId: GROUP_ID,
        eventId: null,
      },
    })
    expect(mockRpc).toHaveBeenCalledWith('expense_delete_own_creation_draft_v1', {
      p_actor_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_draft_id: DRAFT_ID,
      p_expected_draft_version: 7,
      p_expected_publication_version: 3,
    })
  })

  it('rejects extra client authority before invoking the RPC', async () => {
    await expect(deleteOwnExpenseCreationDraft({
      ...input,
      actor_id: ACTOR_ID,
    })).resolves.toEqual({ ok: false, error: 'invalid_input' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('fails closed as unknown for a malformed success payload', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({
      data: {
        contract_version: 1,
        state: 'deleted',
        deleted: true,
        draft_id: DRAFT_ID,
        subject: 'private_draft',
        group_id: null,
        event_id: null,
        unexpected: true,
      },
      error: null,
    })

    await expect(deleteOwnExpenseCreationDraft(input)).resolves.toEqual({
      ok: false,
      error: 'delete_outcome_unknown',
    })
    consoleError.mockRestore()
  })

  it('fails closed when a delete result claims both group and Event context', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({
      data: {
        contract_version: 1,
        state: 'deleted',
        deleted: true,
        draft_id: DRAFT_ID,
        subject: 'shared_draft',
        group_id: GROUP_ID,
        event_id: EXPENSE_ID,
      },
      error: null,
    })

    await expect(deleteOwnExpenseCreationDraft(input)).resolves.toEqual({
      ok: false,
      error: 'delete_outcome_unknown',
    })
    consoleError.mockRestore()
  })

  it('maps a reviewed conflict but treats invalid replay and unrelated helper failures as ambiguous', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'P0001', message: 'expense_creation_draft_delete_conflict' },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'P0001', message: 'expense_creation_draft_delete_replay_invalid' },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'P0001', message: 'teskeid_event_unavailable' },
      })

    await expect(deleteOwnExpenseCreationDraft(input)).resolves.toEqual({
      ok: false,
      error: 'conflict',
    })
    await expect(deleteOwnExpenseCreationDraft(input)).resolves.toEqual({
      ok: false,
      error: 'delete_outcome_unknown',
    })
    await expect(deleteOwnExpenseCreationDraft(input)).resolves.toEqual({
      ok: false,
      error: 'delete_outcome_unknown',
    })
    consoleError.mockRestore()
  })

  it('never reports committed deletion as failed when cache invalidation throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockRpc.mockResolvedValue({
      data: {
        contract_version: 1,
        state: 'deleted',
        deleted: true,
        draft_id: DRAFT_ID,
        subject: 'shared_draft',
        group_id: null,
        event_id: EXPENSE_ID,
      },
      error: null,
    })
    mockRevalidatePath.mockImplementation(() => {
      throw new Error('cache unavailable')
    })

    await expect(deleteOwnExpenseCreationDraft(input)).resolves.toMatchObject({ ok: true })
    expect(consoleError).toHaveBeenCalledWith(
      '[expenses] post-mutation cache revalidation failed',
      { sqlState: 'unknown', reason: 'unknown' },
    )
    expect(consoleError).toHaveBeenCalledWith(
      '[expenses] post-mutation event cache revalidation failed',
      { sqlState: 'unknown', reason: 'unknown' },
    )
    consoleError.mockRestore()
  })
})
