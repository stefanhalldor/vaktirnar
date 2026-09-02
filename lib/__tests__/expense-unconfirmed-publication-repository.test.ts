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
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: vi.fn() }))
vi.mock('@/lib/events/repository.server', () => ({ getExpensePayAllEventLabels: vi.fn() }))

import {
  getCanonicalExpenseEditDraft,
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
const EXPENSE_ID = '50000000-0000-4000-8000-000000000001'

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

function dashboardProjection() {
  return {
    contract_version: 1,
    status: 'ready',
    rows: [{
      presentation_key: '11111111111111111111111111111111',
      presentation_state: 'private_draft',
      title: 'Kvöldmatur',
      total_minor: 12000,
      currency: 'ISK',
      href: `/auth-mvp/utlagt-og-endurgreitt/nytt?draft=${DRAFT_ID}`,
      order: {
        basis: 'visible_updated_at',
        primary: '2026-08-26T09:30:00.000Z',
        secondary: '2026-08-26T09:30:00.000Z',
        tie_breaker: '11111111111111111111111111111111',
      },
      person_facets: [],
      circle_facets: [],
    }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRpc.mockReset()
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
  it('uses SQL170 as the sole directory projection rather than composing lifecycle rows in the repository', () => {
    const source = readFileSync(join(process.cwd(), 'lib/expenses/repository.server.ts'), 'utf8')
    expect(source).toContain("rpc('expense_list_dashboard_presentations_v1'")
    expect(source).toContain('classifyExpenseDashboardPresentationResponse')
    expect(source).not.toContain('deriveExpenseConfirmedPresentations')
    expect(source).not.toContain('formatExpenseDashboardPresentationDiagnostic')
    expect(source).not.toContain('[expenses] dashboard presentation diagnostic')
  })

  it('resolves only an exact actor-owned bound edit draft', async () => {
    const editRow = {
      ...privateDraftRow(),
      context_type: 'edit',
      group_id: GROUP_ID,
      expense_id: EXPENSE_ID,
    }
    mockRpc.mockResolvedValueOnce({
      data: {
        status: 'open',
        mode: 'private',
        owned_by_actor: true,
        draft_id: DRAFT_ID,
        draft_version: 4,
        publication_version: null,
      },
      error: null,
    })
      .mockResolvedValueOnce({ data: editRow, error: null })

    await expect(getCanonicalExpenseEditDraft(ACTOR_ID, GROUP_ID, EXPENSE_ID)).resolves.toEqual({
      status: 'single',
      draft: expect.objectContaining({ id: DRAFT_ID, groupId: GROUP_ID, expenseId: EXPENSE_ID }),
    })
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'expense_get_edit_revision_state_v1', {
      p_actor_id: ACTOR_ID,
      p_expense_id: EXPENSE_ID,
    })
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'expense_get_private_draft', {
      p_actor_id: ACTOR_ID,
      p_draft_id: DRAFT_ID,
    })

    mockRpc.mockReset()
    mockRpc.mockResolvedValueOnce({
      data: {
        status: 'open',
        mode: 'private',
        owned_by_actor: true,
        draft_id: DRAFT_ID,
        draft_version: 4,
        publication_version: null,
      },
      error: null,
    }).mockResolvedValueOnce({
      data: { ...editRow, expense_id: '50000000-0000-4000-8000-000000000002' },
      error: null,
    })
    await expect(getCanonicalExpenseEditDraft(ACTOR_ID, GROUP_ID, EXPENSE_ID)).resolves.toEqual({
      status: 'unavailable',
    })
    expect(mockRpc).toHaveBeenCalledTimes(2)
  })

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
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'transport' } })
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

  it('loads one authoritative dashboard projection while totals and invitations remain separate', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'expense_get_my_member_invitations') return { data: [], error: null }
      if (name === 'expense_list_dashboard_presentations_v1') return { data: dashboardProjection(), error: null }
      throw new Error(`unexpected_rpc:${name}`)
    })

    const dashboard = await getExpenseDashboard(ACTOR_ID)
    expect(dashboard.dashboardPresentations).toMatchObject({ status: 'ready' })
    if (dashboard.dashboardPresentations.status === 'ready') {
      expect(dashboard.dashboardPresentations.rows).toHaveLength(1)
      expect(dashboard.dashboardPresentations.rows[0]?.presentationState).toBe('private_draft')
    }
    expect(dashboard.privateDrafts).toEqual({ status: 'ready', items: [] })
    expect(dashboard.sharedDrafts).toEqual({ status: 'ready', items: [] })
    expect(dashboard.groups).toEqual([])
    expect(dashboard.oneOffs).toEqual([])
    expect(dashboard.totals).toEqual([])
    expect(mockRpc).not.toHaveBeenCalledWith('expense_list_my_private_drafts', expect.anything())
    expect(mockRpc).not.toHaveBeenCalledWith('expense_list_visible_shared_drafts', expect.anything())
    expect(mockRpc).not.toHaveBeenCalledWith('expense_list_visible_edit_revisions_v1', expect.anything())
  })

  it('fails the dashboard directory closed when the SQL170 call fails', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === 'expense_get_my_member_invitations') return { data: [], error: null }
      if (name === 'expense_list_dashboard_presentations_v1') {
        return { data: null, error: { code: 'PGRST202' } }
      }
      throw new Error(`unexpected_rpc:${name}`)
    })

    const dashboard = await getExpenseDashboard(ACTOR_ID)
    expect(dashboard.dashboardPresentations).toEqual({ status: 'unavailable', rows: [] })
    expect(dashboard.privateDrafts).toEqual({ status: 'ready', items: [] })
    expect(dashboard.sharedDrafts).toEqual({ status: 'ready', items: [] })
    expect(dashboard.groups).toEqual([])
    expect(dashboard.oneOffs).toEqual([])
  })
})
