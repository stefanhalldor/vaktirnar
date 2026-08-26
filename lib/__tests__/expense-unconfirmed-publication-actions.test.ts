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
    })).resolves.toEqual({ ok: false, error: 'save_failed' })
    await expect(shareExpenseDraft({
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 7,
      expected_publication_version: 3,
    })).resolves.toEqual({ ok: false, error: 'conflict' })
  })
})
