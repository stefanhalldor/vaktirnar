import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFrom, mockGetAdmin, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetAdmin: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: vi.fn() }))
vi.mock('@/lib/events/repository.server', () => ({ getExpensePayAllEventLabels: vi.fn() }))

import {
  getExpenseDashboard,
  getExpenseDraftPublicationLifecycle,
  getExpenseSharedDraftDetail,
  getGroupSharedExpenseDrafts,
  getVisibleSharedExpenseDrafts,
} from '@/lib/expenses/repository.server'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const DRAFT_ID = '20000000-0000-4000-8000-000000000001'
const PUBLICATION_ID = '30000000-0000-4000-8000-000000000001'
const GROUP_ID = '40000000-0000-4000-8000-000000000001'

function privateDraftRow() {
  return {
    draft_id: DRAFT_ID,
    context_type: 'one_off',
    group_id: null,
    expense_id: null,
    current_step: 'split',
    draft_version: 4,
    saved_at: '2026-08-26T09:30:00.000Z',
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
      total: '12000',
      currency: 'ISK',
      incurredOn: '2026-08-26',
      category: '',
      note: '',
      splitMethod: 'weighted',
      payments: { self: '12000' },
      payerKeys: ['self'],
      amounts: {},
      percentages: {},
      weights: { self: '1' },
      preserveShares: false,
    },
  }
}

function sharedList(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: 1,
    status: 'ready',
    rows: [{
      lifecycle_state: 'shared_draft',
      publication_id: PUBLICATION_ID,
      publication_version: 2,
      title: 'Kvöldmatur',
      total_minor: 12000,
      currency: 'ISK',
      incurred_on: '2026-08-26',
      allocation_state: 'balanced_unconfirmed',
      viewer_role: 'author',
      has_unshared_changes: false,
      detail_target: { kind: 'private_draft', draft_id: DRAFT_ID },
      ...overrides,
    }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFrom.mockImplementation((table: string) => {
    if (table === 'expense_group_members') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) })),
        })),
      }
    }
    if (table === 'expense_settlement_batches') {
      const query = {
        eq: vi.fn(),
        or: vi.fn(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST205', message: 'expense_settlement_batches does not exist' },
        }),
      }
      query.eq.mockReturnValue(query)
      query.or.mockReturnValue(query)
      return { select: vi.fn(() => query) }
    }
    throw new Error(`unexpected_table:${table}`)
  })
  mockGetAdmin.mockReturnValue({ from: mockFrom, rpc: mockRpc })
})

describe('SQL159 repository boundaries', () => {
  it('loads exact group shared drafts with only the server actor and group target', async () => {
    mockRpc.mockResolvedValue({
      data: {
        contract_version: 1,
        status: 'ready',
        rows: [{
          lifecycle_state: 'shared_draft',
          publication_id: PUBLICATION_ID,
          publication_version: 2,
          title: 'Kvöldmatur',
          total_minor: 12_000,
          currency: 'ISK',
          incurred_on: '2026-08-26',
          allocation_state: 'balanced_unconfirmed',
          viewer_role: 'participant',
          detail_target: { kind: 'shared_draft', publication_id: PUBLICATION_ID },
        }],
      },
      error: null,
    })

    await expect(getGroupSharedExpenseDrafts(ACTOR_ID, GROUP_ID)).resolves.toMatchObject({
      status: 'ready',
      items: [{
        lifecycleState: 'shared_draft',
        detailHref: `/auth-mvp/utlagt-og-endurgreitt/drog/${PUBLICATION_ID}`,
      }],
    })
    expect(mockRpc).toHaveBeenCalledWith('expense_list_group_shared_drafts', {
      p_actor_id: ACTOR_ID,
      p_group_id: GROUP_ID,
    })
  })

  it('fails malformed, transport-failed and invalid group sources closed', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { contract_version: 1, status: 'ready', rows: [{ private_payload: true }] },
      error: null,
    })
    await expect(getGroupSharedExpenseDrafts(ACTOR_ID, GROUP_ID)).resolves.toEqual({
      status: 'unavailable', items: [],
    })

    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'transport' } })
    await expect(getGroupSharedExpenseDrafts(ACTOR_ID, GROUP_ID)).resolves.toEqual({
      status: 'unavailable', items: [],
    })

    await expect(getGroupSharedExpenseDrafts(ACTOR_ID, 'not-a-uuid')).resolves.toEqual({
      status: 'unavailable', items: [],
    })
  })

  it('loads shared detail with only the server actor and exact publication target', async () => {
    mockRpc.mockResolvedValue({
      data: {
        contract_version: 1,
        status: 'ready',
        draft: {
          lifecycle_state: 'shared_draft',
          publication_id: PUBLICATION_ID,
          publication_version: 2,
          title: 'Kvöldmatur',
          total_minor: 12_000,
          currency: 'ISK',
          incurred_on: '2026-08-26',
          allocation_state: 'incomplete',
          viewer_role: 'participant',
          parties: [{
            display_name: 'Stebbi',
            is_author: true,
            is_payer: true,
            is_participant: true,
            proposed_paid_minor: null,
            proposed_share_minor: null,
          }],
        },
      },
      error: null,
    })

    await expect(getExpenseSharedDraftDetail(ACTOR_ID, PUBLICATION_ID)).resolves.toMatchObject({
      status: 'ready',
      publicationId: PUBLICATION_ID,
      viewerRole: 'participant',
    })
    expect(mockRpc).toHaveBeenCalledWith('expense_get_shared_draft_detail', {
      p_actor_id: ACTOR_ID,
      p_publication_id: PUBLICATION_ID,
    })
  })

  it('fails malformed, mismatched and transport-failed shared detail closed', async () => {
    mockRpc.mockResolvedValueOnce({
      data: { contract_version: 1, status: 'ready', draft: { publication_id: PUBLICATION_ID } },
      error: null,
    })
    await expect(getExpenseSharedDraftDetail(ACTOR_ID, PUBLICATION_ID)).resolves.toEqual({
      status: 'unavailable',
    })

    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'transport' } })
    await expect(getExpenseSharedDraftDetail(ACTOR_ID, PUBLICATION_ID)).resolves.toEqual({
      status: 'unavailable',
    })

    await expect(getExpenseSharedDraftDetail(ACTOR_ID, 'not-a-uuid')).resolves.toEqual({
      status: 'not_found',
    })
  })

  it('joins exact lifecycle and author-list evidence for normalized stale state', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'expense_get_private_draft_publication_lifecycle') {
        return {
          data: {
            contract_version: 1,
            status: 'ready',
            draft_id: DRAFT_ID,
            draft_version: 4,
            sharing_state: 'shared',
            expected_publication_version: 2,
          },
          error: null,
        }
      }
      if (name === 'expense_list_visible_shared_drafts') {
        return { data: sharedList({ has_unshared_changes: true }), error: null }
      }
      throw new Error(`unexpected_rpc:${name}`)
    })

    await expect(getExpenseDraftPublicationLifecycle(ACTOR_ID, DRAFT_ID)).resolves.toEqual({
      status: 'ready',
      draftId: DRAFT_ID,
      draftVersion: 4,
      sharingState: 'shared',
      expectedPublicationVersion: 2,
      hasUnsharedChanges: true,
    })
  })

  it('fails the whole shared source closed when one target drifts', async () => {
    mockRpc.mockResolvedValue({
      data: sharedList({ detail_target: { kind: 'private_draft', draft_id: 'not-a-uuid' } }),
      error: null,
    })
    await expect(getVisibleSharedExpenseDrafts(ACTOR_ID)).resolves.toEqual({
      status: 'unavailable',
      items: [],
    })
  })

  it('deduplicates an author live snapshot out of private drafts without touching active fields', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'expense_get_my_member_invitations') return { data: [], error: null }
      if (name === 'expense_list_my_private_drafts') return { data: [privateDraftRow()], error: null }
      if (name === 'expense_list_visible_shared_drafts') return { data: sharedList(), error: null }
      throw new Error(`unexpected_rpc:${name}`)
    })

    const dashboard = await getExpenseDashboard(ACTOR_ID)
    expect(dashboard.privateDrafts).toEqual({ status: 'ready', items: [] })
    expect(dashboard.sharedDrafts.status).toBe('ready')
    if (dashboard.sharedDrafts.status === 'ready') {
      expect(dashboard.sharedDrafts.items).toHaveLength(1)
      expect(dashboard.sharedDrafts.items[0]?.authorDraft).toEqual({
        contextType: 'one_off',
        groupId: null,
        expenseId: null,
      })
    }
    expect(dashboard.groups).toEqual([])
    expect(dashboard.oneOffs).toEqual([])
    expect(dashboard.totals).toEqual([])
  })

  it('keeps active data available while malformed shared data marks proposal sources unavailable', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'expense_get_my_member_invitations') return { data: [], error: null }
      if (name === 'expense_list_my_private_drafts') return { data: [privateDraftRow()], error: null }
      if (name === 'expense_list_visible_shared_drafts') {
        return { data: sharedList({ unexpected: true }), error: null }
      }
      throw new Error(`unexpected_rpc:${name}`)
    })

    const dashboard = await getExpenseDashboard(ACTOR_ID)
    expect(dashboard.privateDrafts).toEqual({ status: 'unavailable', items: [] })
    expect(dashboard.sharedDrafts).toEqual({ status: 'unavailable', items: [] })
    expect(dashboard.groups).toEqual([])
    expect(dashboard.oneOffs).toEqual([])
  })
})
