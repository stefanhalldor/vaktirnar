import { describe, expect, it } from 'vitest'

import {
  FinalizeExpenseDraftSchema,
  RefreshExpenseDraftPublicationLifecycleSchema,
  ShareExpenseDraftSchema,
  UnshareExpenseDraftSchema,
  finalizeExpectedPublicationVersion,
  parseExpenseDraftPublicationLifecycle,
  parseExpenseFinalizeResult,
  parseExpenseSharedDraftDetail,
  parseExpenseShareResult,
  parseExpenseUnshareResult,
  parseVisibleSharedExpenseDrafts,
  shareExpectedPublicationVersion,
} from '@/lib/expenses/unconfirmed-publication'

const REQUEST_ID = '11111111-1111-4111-8111-111111111111'
const DRAFT_ID = '22222222-2222-4222-8222-222222222222'
const PUBLICATION_ID = '33333333-3333-4333-8333-333333333333'
const SECOND_PUBLICATION_ID = '44444444-4444-4444-8444-444444444444'
const SECOND_DRAFT_ID = '55555555-5555-4555-8555-555555555555'
const GROUP_ID = '66666666-6666-4666-8666-666666666666'
const EXPENSE_ID = '77777777-7777-4777-8777-777777777777'
const INVITATION_ID = '88888888-8888-4888-8888-888888888888'

function authorRow(overrides: Record<string, unknown> = {}) {
  return {
    lifecycle_state: 'shared_draft',
    publication_id: PUBLICATION_ID,
    publication_version: 4,
    title: 'Rúta',
    total_minor: 24_000,
    currency: 'ISK',
    incurred_on: '2026-08-25',
    allocation_state: 'balanced_unconfirmed',
    viewer_role: 'author',
    has_unshared_changes: false,
    detail_target: { kind: 'private_draft', draft_id: DRAFT_ID },
    ...overrides,
  }
}

function participantRow(overrides: Record<string, unknown> = {}) {
  return {
    lifecycle_state: 'shared_draft',
    publication_id: SECOND_PUBLICATION_ID,
    publication_version: 2,
    title: 'Gisting',
    total_minor: 12_500,
    currency: 'EUR',
    incurred_on: '2026-08-24',
    allocation_state: 'incomplete',
    viewer_role: 'participant',
    has_unshared_changes: null,
    detail_target: {
      kind: 'shared_draft',
      publication_id: SECOND_PUBLICATION_ID,
    },
    ...overrides,
  }
}

describe('SQL159 unconfirmed-publication input contracts', () => {
  it('accepts only exact share, unshare, finalize and lifecycle-refresh intent', () => {
    expect(ShareExpenseDraftSchema.safeParse({
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 3,
      expected_publication_version: null,
    }).success).toBe(true)
    expect(ShareExpenseDraftSchema.safeParse({
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 3,
      expected_publication_version: 7,
    }).success).toBe(true)
    expect(UnshareExpenseDraftSchema.safeParse({
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 3,
      expected_publication_version: 7,
    }).success).toBe(true)
    expect(FinalizeExpenseDraftSchema.safeParse({
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 3,
      expected_publication_version: null,
      split_confirmed: true,
    }).success).toBe(true)
    expect(RefreshExpenseDraftPublicationLifecycleSchema.safeParse({
      draft_id: DRAFT_ID,
    }).success).toBe(true)
  })

  it('rejects unknown keys, unsafe versions and weakened confirmation intent', () => {
    expect(ShareExpenseDraftSchema.safeParse({
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 1,
      expected_publication_version: null,
      actor_id: REQUEST_ID,
    }).success).toBe(false)
    expect(ShareExpenseDraftSchema.safeParse({
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: Number.MAX_SAFE_INTEGER + 1,
      expected_publication_version: null,
    }).success).toBe(false)
    expect(UnshareExpenseDraftSchema.safeParse({
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 1,
      expected_publication_version: null,
    }).success).toBe(false)
    expect(FinalizeExpenseDraftSchema.safeParse({
      request_id: REQUEST_ID,
      draft_id: DRAFT_ID,
      expected_draft_version: 1,
      expected_publication_version: null,
      split_confirmed: false,
    }).success).toBe(false)
    expect(RefreshExpenseDraftPublicationLifecycleSchema.safeParse({
      draft_id: DRAFT_ID,
      publication_id: PUBLICATION_ID,
    }).success).toBe(false)
  })
})

describe('SQL159 publication lifecycle contract', () => {
  it('preserves the retained withdrawn generation for reshare but not finalization', () => {
    const withdrawn = parseExpenseDraftPublicationLifecycle({
      contract_version: 1,
      status: 'ready',
      draft_id: DRAFT_ID,
      draft_version: 8,
      sharing_state: 'withdrawn',
      expected_publication_version: 5,
    })

    expect(withdrawn).toEqual({
      status: 'ready',
      draftId: DRAFT_ID,
      draftVersion: 8,
      sharingState: 'withdrawn',
      expectedPublicationVersion: 5,
      hasUnsharedChanges: null,
    })
    if (withdrawn.status !== 'ready') throw new Error('expected ready lifecycle')
    expect(shareExpectedPublicationVersion(withdrawn)).toBe(5)
    expect(finalizeExpectedPublicationVersion(withdrawn)).toBeNull()
  })

  it('maps never-shared and live-shared null/integer semantics exactly', () => {
    const neverShared = parseExpenseDraftPublicationLifecycle({
      contract_version: 1,
      status: 'ready',
      draft_id: DRAFT_ID,
      draft_version: 1,
      sharing_state: 'never_shared',
      expected_publication_version: null,
    })
    const shared = parseExpenseDraftPublicationLifecycle({
      contract_version: 1,
      status: 'ready',
      draft_id: DRAFT_ID,
      draft_version: 4,
      sharing_state: 'shared',
      expected_publication_version: 3,
    })

    expect(neverShared.status).toBe('ready')
    expect(shared.status).toBe('ready')
    if (neverShared.status !== 'ready' || shared.status !== 'ready') {
      throw new Error('expected ready lifecycle')
    }
    expect(shareExpectedPublicationVersion(neverShared)).toBeNull()
    expect(finalizeExpectedPublicationVersion(neverShared)).toBeNull()
    expect(shareExpectedPublicationVersion(shared)).toBe(3)
    expect(finalizeExpectedPublicationVersion(shared)).toBe(3)
  })

  it.each([
    ['not-found is non-enumerating', { contract_version: 1, status: 'not_found' }],
    ['array-wrapped root', [{ contract_version: 1, status: 'not_found' }]],
    ['extra root key', {
      contract_version: 1,
      status: 'not_found',
      draft_id: DRAFT_ID,
    }],
    ['never-shared with integer generation', {
      contract_version: 1,
      status: 'ready',
      draft_id: DRAFT_ID,
      draft_version: 1,
      sharing_state: 'never_shared',
      expected_publication_version: 1,
    }],
    ['withdrawn with null generation', {
      contract_version: 1,
      status: 'ready',
      draft_id: DRAFT_ID,
      draft_version: 1,
      sharing_state: 'withdrawn',
      expected_publication_version: null,
    }],
    ['unsafe draft generation', {
      contract_version: 1,
      status: 'ready',
      draft_id: DRAFT_ID,
      draft_version: Number.MAX_SAFE_INTEGER + 1,
      sharing_state: 'shared',
      expected_publication_version: 1,
    }],
  ])('fails lifecycle closed: %s', (_label, payload) => {
    expect(parseExpenseDraftPublicationLifecycle(payload)).toEqual({ status: 'unavailable' })
  })
})

describe('SQL159 mutation result contracts', () => {
  it('maps exact share, unshare and finalization results', () => {
    expect(parseExpenseShareResult({
      contract_version: 1,
      state: 'shared_draft',
      draft_id: DRAFT_ID,
      draft_version: 4,
      publication_id: PUBLICATION_ID,
      publication_version: 2,
      allocation_state: 'incomplete',
      shareable_fingerprint: '0123456789abcdef0123456789abcdef',
    })).toEqual({
      state: 'shared_draft',
      draftId: DRAFT_ID,
      draftVersion: 4,
      publicationId: PUBLICATION_ID,
      publicationVersion: 2,
      allocationState: 'incomplete',
      shareableFingerprint: '0123456789abcdef0123456789abcdef',
    })
    expect(parseExpenseUnshareResult({
      contract_version: 1,
      state: 'private_draft',
      draft_id: DRAFT_ID,
      draft_version: 4,
      publication_id: PUBLICATION_ID,
      publication_version: 3,
    })).toEqual({
      state: 'private_draft',
      draftId: DRAFT_ID,
      draftVersion: 4,
      publicationId: PUBLICATION_ID,
      publicationVersion: 3,
    })
    expect(parseExpenseFinalizeResult({
      contract_version: 1,
      state: 'confirmed',
      draft_id: DRAFT_ID,
      group_id: GROUP_ID,
      expense_id: EXPENSE_ID,
      invitation_ids: [INVITATION_ID],
    })).toEqual({
      state: 'confirmed',
      draftId: DRAFT_ID,
      groupId: GROUP_ID,
      expenseId: EXPENSE_ID,
      invitationIds: [INVITATION_ID],
    })
  })

  it('rejects array normalization, extra keys and malformed security-sensitive fields', () => {
    const validShare = {
      contract_version: 1,
      state: 'shared_draft',
      draft_id: DRAFT_ID,
      draft_version: 4,
      publication_id: PUBLICATION_ID,
      publication_version: 2,
      allocation_state: 'balanced_unconfirmed',
      shareable_fingerprint: '0123456789abcdef0123456789abcdef',
    }
    expect(parseExpenseShareResult([validShare])).toBeNull()
    expect(parseExpenseShareResult({ ...validShare, href: '/private' })).toBeNull()
    expect(parseExpenseShareResult({
      ...validShare,
      shareable_fingerprint: '0123456789ABCDEF0123456789ABCDEF',
    })).toBeNull()
    expect(parseExpenseUnshareResult({
      contract_version: 1,
      state: 'private_draft',
      draft_id: DRAFT_ID,
      draft_version: 4,
      publication_id: PUBLICATION_ID,
      publication_version: 0,
    })).toBeNull()
    expect(parseExpenseFinalizeResult({
      contract_version: 1,
      state: 'confirmed',
      draft_id: DRAFT_ID,
      group_id: GROUP_ID,
      expense_id: EXPENSE_ID,
      invitation_ids: [INVITATION_ID, INVITATION_ID],
    })).toBeNull()
  })
})

describe('SQL159 visible shared-draft list contract', () => {
  it('maps exact author and participant rows without widening their targets', () => {
    expect(parseVisibleSharedExpenseDrafts({
      contract_version: 1,
      status: 'ready',
      rows: [authorRow(), participantRow()],
    })).toEqual({
      status: 'ready',
      items: [
        {
          lifecycleState: 'shared_draft',
          publicationId: PUBLICATION_ID,
          publicationVersion: 4,
          title: 'Rúta',
          totalMinor: 24_000,
          currency: 'ISK',
          incurredOn: '2026-08-25',
          allocationState: 'balanced_unconfirmed',
          viewerRole: 'author',
          hasUnsharedChanges: false,
          detailTarget: { kind: 'private_draft', draftId: DRAFT_ID },
        },
        {
          lifecycleState: 'shared_draft',
          publicationId: SECOND_PUBLICATION_ID,
          publicationVersion: 2,
          title: 'Gisting',
          totalMinor: 12_500,
          currency: 'EUR',
          incurredOn: '2026-08-24',
          allocationState: 'incomplete',
          viewerRole: 'participant',
          hasUnsharedChanges: null,
          detailTarget: {
            kind: 'shared_draft',
            publicationId: SECOND_PUBLICATION_ID,
          },
        },
      ],
    })
  })

  it('normalizes wire none to ready-empty and preserves unavailable', () => {
    expect(parseVisibleSharedExpenseDrafts({
      contract_version: 1,
      status: 'none',
      rows: [],
    })).toEqual({ status: 'ready', items: [] })
    expect(parseVisibleSharedExpenseDrafts({
      contract_version: 1,
      status: 'unavailable',
      rows: [],
    })).toEqual({ status: 'unavailable', items: [] })
  })

  it.each([
    ['scalar root', 'private-root'],
    ['array-wrapped root', [{ contract_version: 1, status: 'none', rows: [] }]],
    ['extra root key', {
      contract_version: 1, status: 'ready', rows: [authorRow()], count: 1,
    }],
    ['ready with no rows', { contract_version: 1, status: 'ready', rows: [] }],
    ['none with a row', { contract_version: 1, status: 'none', rows: [authorRow()] }],
    ['extra row key', {
      contract_version: 1,
      status: 'ready',
      rows: [authorRow({ private_note: 'leak' })],
    }],
    ['extra target key', {
      contract_version: 1,
      status: 'ready',
      rows: [authorRow({
        detail_target: { kind: 'private_draft', draft_id: DRAFT_ID, href: '/private' },
      })],
    }],
    ['participant target bound to another publication', {
      contract_version: 1,
      status: 'ready',
      rows: [participantRow({
        detail_target: { kind: 'shared_draft', publication_id: PUBLICATION_ID },
      })],
    }],
    ['author with participant target', {
      contract_version: 1,
      status: 'ready',
      rows: [authorRow({
        detail_target: { kind: 'shared_draft', publication_id: PUBLICATION_ID },
      })],
    }],
    ['participant with author-only stale signal', {
      contract_version: 1,
      status: 'ready',
      rows: [participantRow({ has_unshared_changes: false })],
    }],
    ['duplicate publication rows', {
      contract_version: 1,
      status: 'ready',
      rows: [authorRow(), authorRow({ detail_target: {
        kind: 'private_draft', draft_id: SECOND_DRAFT_ID,
      } })],
    }],
    ['invalid calendar date', {
      contract_version: 1,
      status: 'ready',
      rows: [authorRow({ incurred_on: '2026-02-30' })],
    }],
    ['unsafe amount', {
      contract_version: 1,
      status: 'ready',
      rows: [authorRow({ total_minor: Number.MAX_SAFE_INTEGER + 1 })],
    }],
    ['one malformed row poisons the whole payload', {
      contract_version: 1,
      status: 'ready',
      rows: [authorRow(), participantRow({ detail_target: {
        kind: 'shared_draft', publication_id: 'not-a-uuid',
      } })],
    }],
  ])('fails the whole visible payload closed: %s', (_label, payload) => {
    expect(parseVisibleSharedExpenseDrafts(payload)).toEqual({
      status: 'unavailable',
      items: [],
    })
  })

  it('fails the whole payload closed above the SQL159 100-row bound', () => {
    const rows = Array.from({ length: 101 }, (_, index) => authorRow({
      publication_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      detail_target: {
        kind: 'private_draft',
        draft_id: `00000000-0000-4001-8000-${String(index).padStart(12, '0')}`,
      },
    }))

    expect(parseVisibleSharedExpenseDrafts({
      contract_version: 1,
      status: 'ready',
      rows,
    })).toEqual({ status: 'unavailable', items: [] })
  })
})

describe('SQL159 shared-draft detail contract', () => {
  function detail(overrides: Record<string, unknown> = {}) {
    return {
      contract_version: 1,
      status: 'ready',
      draft: {
        lifecycle_state: 'shared_draft',
        publication_id: PUBLICATION_ID,
        publication_version: 3,
        title: 'Rúta',
        total_minor: 24_000,
        currency: 'ISK',
        incurred_on: '2026-08-25',
        allocation_state: 'balanced_unconfirmed',
        viewer_role: 'participant',
        parties: [{
          display_name: 'Stebbi',
          is_author: true,
          is_payer: true,
          is_participant: true,
          proposed_paid_minor: 24_000,
          proposed_share_minor: 12_000,
        }, {
          display_name: 'Anna',
          is_author: false,
          is_payer: false,
          is_participant: true,
          proposed_paid_minor: 0,
          proposed_share_minor: 12_000,
        }],
        ...overrides,
      },
    }
  }

  it('maps only the bounded safe snapshot returned for an exact audience member', () => {
    expect(parseExpenseSharedDraftDetail(detail())).toEqual({
      status: 'ready',
      lifecycleState: 'shared_draft',
      publicationId: PUBLICATION_ID,
      publicationVersion: 3,
      title: 'Rúta',
      totalMinor: 24_000,
      currency: 'ISK',
      incurredOn: '2026-08-25',
      allocationState: 'balanced_unconfirmed',
      viewerRole: 'participant',
      parties: [{
        displayName: 'Stebbi',
        isAuthor: true,
        isPayer: true,
        isParticipant: true,
        proposedPaidMinor: 24_000,
        proposedShareMinor: 12_000,
      }, {
        displayName: 'Anna',
        isAuthor: false,
        isPayer: false,
        isParticipant: true,
        proposedPaidMinor: 0,
        proposedShareMinor: 12_000,
      }],
    })
    expect(parseExpenseSharedDraftDetail({
      contract_version: 1,
      status: 'not_found',
    })).toEqual({ status: 'not_found' })
  })

  it.each([
    ['extra private field', detail({ private_note: 'leak' })],
    ['email-shaped safe label', detail({ parties: [{
      display_name: 'private@example.com', is_author: true, is_payer: true,
      is_participant: true, proposed_paid_minor: 24_000, proposed_share_minor: 24_000,
    }] })],
    ['missing exact author', detail({ parties: [{
      display_name: 'Anna', is_author: false, is_payer: true,
      is_participant: true, proposed_paid_minor: 24_000, proposed_share_minor: 24_000,
    }] })],
    ['unbalanced detail totals', detail({ parties: [{
      display_name: 'Stebbi', is_author: true, is_payer: true,
      is_participant: true, proposed_paid_minor: 23_999, proposed_share_minor: 24_000,
    }] })],
    ['incomplete amount leakage', detail({
      allocation_state: 'incomplete',
      parties: [{
        display_name: 'Stebbi', is_author: true, is_payer: true,
        is_participant: true, proposed_paid_minor: 24_000, proposed_share_minor: null,
      }],
    })],
  ])('fails the whole detail payload closed: %s', (_label, payload) => {
    expect(parseExpenseSharedDraftDetail(payload)).toEqual({ status: 'unavailable' })
  })
})
