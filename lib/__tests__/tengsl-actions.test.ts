/**
 * Unit tests for lib/relationships/tag-action.ts and lib/relationships/actions.ts
 *
 * Covers: updateRelationshipTag — tag validation, owner-scope enforcement,
 * happy-path update, and save-failure handling.
 * Also covers: getRelationshipDirectory — merging persisted + inferred contacts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))
const { mockFrom }    = vi.hoisted(() => ({ mockFrom: vi.fn() }))
const { mockRevalidatePath } = vi.hoisted(() => ({ mockRevalidatePath: vi.fn() }))

vi.mock('@/lib/auth/guard', () => ({
  guardTeskeidSession: vi.fn(async () => ({
    user: { id: 'owner-id', email: 'owner@example.com' },
  })),
}))

vi.mock('@/lib/loans/guard', () => ({
  guardFeatureAccess: vi.fn(async () => undefined),
  checkFeatureAccess: vi.fn(async () => false),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({
    from: mockFrom,
    auth: { admin: { getUserByEmail: mockGetUser } },
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

import { updateRelationshipTag } from '@/lib/relationships/tag-action'
// ALLOWED_TAGS is in lib/relationships/types.ts — not exported from 'use server' file

import { getRelationshipDirectory } from '@/lib/relationships/actions'

const OWNER_ID = 'owner-id'
const OWNER_EMAIL = 'owner@example.com'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRelSelect(found: boolean) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: found ? { id: 'rel-id' } : null, error: null })),
        })),
      })),
    })),
  }
}

function makeTagsMutations(insertError: unknown = null) {
  return {
    delete: vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    })),
    insert: vi.fn(async () => ({ error: insertError })),
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('updateRelationshipTag — tag validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns invalid_tag for an unknown tag value', async () => {
    const result = await updateRelationshipTag('rel-id', 'acquaintances')
    expect(result).toEqual({ ok: false, error: 'invalid_tag' })
  })

  it('returns invalid_tag for empty string', async () => {
    const result = await updateRelationshipTag('rel-id', '')
    expect(result).toEqual({ ok: false, error: 'invalid_tag' })
  })

  it('returns invalid_tag for SQL injection attempt', async () => {
    const result = await updateRelationshipTag('rel-id', "unclassified'; DROP TABLE relationships;--")
    expect(result).toEqual({ ok: false, error: 'invalid_tag' })
  })
})

describe('updateRelationshipTag — owner-scope enforcement', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns not_found when relationship does not belong to the authenticated user', async () => {
    mockFrom.mockReturnValue(makeRelSelect(false))
    const result = await updateRelationshipTag('other-rel-id', 'family')
    expect(result).toEqual({ ok: false, error: 'not_found' })
  })
})

describe('updateRelationshipTag — happy path', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns ok:true and revalidates paths on success', async () => {
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeRelSelect(true)
      return makeTagsMutations(null)
    })

    const result = await updateRelationshipTag('rel-id', 'family')
    expect(result).toEqual({ ok: true })
    expect(mockRevalidatePath).toHaveBeenCalledWith('/stillingar/tengsl')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/stillingar/tengsl/rel-id')
  })

  it('accepts all four allowed tag values', async () => {
    const tags = ['unclassified', 'family', 'friends', 'recipients'] as const
    for (const tag of tags) {
      vi.clearAllMocks()
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) return makeRelSelect(true)
        return makeTagsMutations(null)
      })
      const result = await updateRelationshipTag('rel-id', tag)
      expect(result).toEqual({ ok: true })
    }
  })
})

describe('updateRelationshipTag — save failure', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns save_failed when insert errors', async () => {
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeRelSelect(true)
      return makeTagsMutations({ code: '23514', message: 'check violation' })
    })

    const result = await updateRelationshipTag('rel-id', 'family')
    expect(result).toEqual({ ok: false, error: 'save_failed' })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})

// ── getRelationshipDirectory ───────────────────────────────────────────────────

// Builder helpers for sequential from() calls in getRelationshipDirectory

function makePersistedSelect(rows: unknown[]) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order: vi.fn(async () => ({ data: rows, error: null })),
      })),
    })),
  }
}

function makeDirectLoansSelect(rows: unknown[]) {
  return {
    select: vi.fn(() => ({
      or: vi.fn(async () => ({ data: rows, error: null })),
    })),
  }
}

function makeInSelect(rows: unknown[]) {
  return {
    select: vi.fn(() => ({
      in: vi.fn(async () => ({ data: rows, error: null })),
    })),
  }
}

function makeInvitationsInSelect(rows: unknown[]) {
  return makeInSelect(rows)
}

function makeInvitationsEqSelect(rows: unknown[]) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(async () => ({ data: rows, error: null })),
    })),
  }
}

function makeExistenceCheck(found: boolean) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: found ? { id: 'existing-rel' } : null })),
        })),
      })),
    })),
  }
}

function makeInsertRelationship(newId: string) {
  return {
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: { id: newId }, error: null })),
      })),
    })),
  }
}

function makeInsertTag() {
  return {
    insert: vi.fn(async () => ({ error: null })),
  }
}

describe('getRelationshipDirectory — empty state', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty array when no persisted relationships and no loan activity', async () => {
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        case 1: return makePersistedSelect([])
        case 2: return makeDirectLoansSelect([])
        default: return makeInvitationsEqSelect([]) // soft-ack check
      }
    })
    const result = await getRelationshipDirectory(OWNER_ID, OWNER_EMAIL)
    expect(result).toEqual([])
  })
})

describe('getRelationshipDirectory — persisted only', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns persisted rows directly when no new loan counterparts', async () => {
    const persistedRow = {
      id: 'rel-1',
      private_display_name: 'Jón',
      email_canonical: 'jon@example.com',
      counterpart_user_id: null,
      created_at: '2026-06-01T00:00:00Z',
      relationship_tags: [{ tag: 'family' }],
    }

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        case 1: return makePersistedSelect([persistedRow])
        case 2: return makeDirectLoansSelect([]) // no direct loans
        default: return makeInvitationsEqSelect([]) // soft-ack
      }
    })

    const result = await getRelationshipDirectory(OWNER_ID, OWNER_EMAIL)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'rel-1', tags: ['family'] })
    // No re-fetch needed: no upserts happened
    expect(callCount).toBeLessThanOrEqual(3)
  })
})

describe('getRelationshipDirectory — inferred counterpart by user_id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lazy-upserts a new relationship for a direct loan counterpart and returns it', async () => {
    const directLoan = { id: 'loan-1', lender_user_id: OWNER_ID, borrower_user_id: 'user-b' }
    const newRow = {
      id: 'new-rel',
      private_display_name: null,
      email_canonical: null,
      created_at: '2026-06-22T00:00:00Z',
      relationship_tags: [{ tag: 'unclassified' }],
    }

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        case 1: return makePersistedSelect([])
        case 2: return makeDirectLoansSelect([directLoan])
        case 3: return makeInvitationsInSelect([])      // pending invitations for owner's loans
        case 4: return makeInvitationsEqSelect([])      // soft-ack
        case 5: return makeExistenceCheck(false)        // check if user-b already persisted
        case 6: return makeInsertRelationship('new-rel')
        case 7: return makeInsertTag()
        case 8: return makePersistedSelect([newRow])    // re-fetch after upsert
        default: return makePersistedSelect([])
      }
    })

    const result = await getRelationshipDirectory(OWNER_ID, OWNER_EMAIL)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('new-rel')
    expect(result[0].tags).toEqual(['unclassified'])
  })

  it('skips upsert when counterpart_user_id already in persisted relationships', async () => {
    const persistedRow = {
      id: 'rel-existing',
      private_display_name: null,
      email_canonical: null,
      counterpart_user_id: 'user-b',
      created_at: '2026-06-01T00:00:00Z',
      relationship_tags: [{ tag: 'friends' }],
    }
    const directLoan = { id: 'loan-1', lender_user_id: OWNER_ID, borrower_user_id: 'user-b' }

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        case 1: return makePersistedSelect([persistedRow])
        case 2: return makeDirectLoansSelect([directLoan])
        case 3: return makeInvitationsInSelect([])
        default: return makeInvitationsEqSelect([])
      }
    })

    const result = await getRelationshipDirectory(OWNER_ID, OWNER_EMAIL)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('rel-existing')
    // No insert calls should happen — call count stays low
    expect(callCount).toBeLessThanOrEqual(4)
  })
})

describe('getRelationshipDirectory — inferred counterpart by email', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lazy-upserts a relationship for a pending invitation recipient', async () => {
    const directLoan = { id: 'loan-1', lender_user_id: OWNER_ID, borrower_user_id: null }
    const invitation = { recipient_email_normalized: 'bob@example.com' }
    const newRow = {
      id: 'email-rel',
      private_display_name: null,
      email_canonical: 'bob@example.com',
      created_at: '2026-06-22T00:00:00Z',
      relationship_tags: [{ tag: 'unclassified' }],
    }

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        case 1: return makePersistedSelect([])
        case 2: return makeDirectLoansSelect([directLoan])
        case 3: return makeInvitationsInSelect([invitation]) // pending invitations
        case 4: return makeInvitationsEqSelect([])           // soft-ack
        case 5: return makeExistenceCheck(false)             // check if email exists
        case 6: return makeInsertRelationship('email-rel')
        case 7: return makeInsertTag()
        case 8: return makePersistedSelect([newRow])         // re-fetch
        default: return makePersistedSelect([])
      }
    })

    const result = await getRelationshipDirectory(OWNER_ID, OWNER_EMAIL)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('email-rel')
    expect(result[0].email_canonical).toBe('bob@example.com')
  })
})

describe('getRelationshipDirectory — soft-ack reverse direction', () => {
  beforeEach(() => vi.clearAllMocks())

  it('includes lender as a counterpart when owner was invited by email', async () => {
    const softAckInv = { loan_id: 'loan-x' }
    const softAckLoan = { lender_user_id: 'lender-a' }
    const newRow = {
      id: 'soft-rel',
      private_display_name: null,
      email_canonical: null,
      created_at: '2026-06-22T00:00:00Z',
      relationship_tags: [{ tag: 'unclassified' }],
    }

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        case 1: return makePersistedSelect([])
        case 2: return makeDirectLoansSelect([])          // no direct loans as owner
        // no ownerLoanIds → no invitations.in call
        case 3: return makeInvitationsEqSelect([softAckInv]) // soft-ack lookup by owner email
        case 4: return makeInSelect([softAckLoan])           // loan_items.in(softAckLoanIds) → select lender_user_id
        case 5: return makeExistenceCheck(false)
        case 6: return makeInsertRelationship('soft-rel')
        case 7: return makeInsertTag()
        case 8: return makePersistedSelect([newRow])
        default: return makePersistedSelect([])
      }
    })

    const result = await getRelationshipDirectory(OWNER_ID, OWNER_EMAIL)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('soft-rel')
  })
})
