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
const { mockGetUserById }   = vi.hoisted(() => ({ mockGetUserById: vi.fn() }))

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
    auth: { admin: { getUserByEmail: mockGetUser, getUserById: mockGetUserById } },
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

function makeUpdate() {
  return {
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
    })),
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
        default: return makeInSelect([]) // soft-ack uses .in()
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
        default: return makeInSelect([]) // soft-ack
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
      counterpart_user_id: 'user-b',
      created_at: '2026-06-22T00:00:00Z',
      relationship_tags: [{ tag: 'unclassified' }],
    }

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        case 1: return makePersistedSelect([])
        case 2: return makeDirectLoansSelect([directLoan])
        case 3: return makeInvitationsInSelect([])   // pending invitations for owner's loans
        case 4: return makeInSelect([])              // soft-ack (.in())
        // getUserById throws (not mocked) → inner catch → normal upsert
        case 5: return makeExistenceCheck(false)
        case 6: return makeInsertRelationship('new-rel')
        case 7: return makeInsertTag()
        case 8: return makePersistedSelect([newRow]) // re-fetch after upsert
        case 9: return makeInSelect([{ id: 'user-b', display_name: null }]) // profile batch
        default: return makePersistedSelect([])
      }
    })

    const result = await getRelationshipDirectory(OWNER_ID, OWNER_EMAIL)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('new-rel')
    expect(result[0].tags).toEqual(['unclassified'])
    expect(result[0].counterpart_display_name).toBeNull()
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
        case 4: return makeInSelect([])  // soft-ack
        // no missing → profile fetch for counterpart_user_id 'user-b'
        default: return makeInSelect([{ id: 'user-b', display_name: 'Jón' }])
      }
    })

    const result = await getRelationshipDirectory(OWNER_ID, OWNER_EMAIL)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('rel-existing')
    expect(result[0].counterpart_display_name).toBe('Jón')
    // 4 pre-upsert calls + 1 profile fetch = 5 max
    expect(callCount).toBeLessThanOrEqual(5)
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
      counterpart_user_id: null,
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
        case 4: return makeInSelect([])                      // soft-ack (.in())
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
      counterpart_user_id: 'lender-a',
      created_at: '2026-06-22T00:00:00Z',
      relationship_tags: [{ tag: 'unclassified' }],
    }

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        case 1: return makePersistedSelect([])
        case 2: return makeDirectLoansSelect([])     // no direct loans
        // no ownerLoanIds → no invitations.in for loan_ids
        case 3: return makeInSelect([softAckInv])    // soft-ack .in() with data
        case 4: return makeInSelect([softAckLoan])   // loan_items.in for soft-ack loans
        // getUserById throws → inner catch → normal upsert
        case 5: return makeExistenceCheck(false)
        case 6: return makeInsertRelationship('soft-rel')
        case 7: return makeInsertTag()
        case 8: return makePersistedSelect([newRow])
        case 9: return makeInSelect([{ id: 'lender-a', display_name: null }]) // profile batch
        default: return makePersistedSelect([])
      }
    })

    const result = await getRelationshipDirectory(OWNER_ID, OWNER_EMAIL)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('soft-rel')
  })
})

// ── getRelationshipDirectory — thin-row merge ──────────────────────────────

describe('getRelationshipDirectory — thin-row merge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('merges thin user-id row into rich email row and hides the duplicate', async () => {
    // thin: created by upsertLoanRelationship after claim, no private fields
    const thinRow = {
      id: 'thin-rel',
      private_display_name: null,
      email_canonical: null,
      counterpart_user_id: 'user-b',
      created_at: '2026-06-22T01:00:00Z',
      relationship_tags: [{ tag: 'unclassified' }],
    }
    // rich: manually created email contact with private name + tag
    const richRow = {
      id: 'rich-rel',
      private_display_name: 'Bob the Builder',
      email_canonical: 'bob@example.com',
      counterpart_user_id: null,
      created_at: '2026-06-21T00:00:00Z',
      relationship_tags: [{ tag: 'friends' }],
    }

    mockGetUserById.mockResolvedValue({ data: { user: { email: 'bob@example.com' } } })

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        case 1: return makePersistedSelect([thinRow, richRow]) // persisted
        case 2: return makeDirectLoansSelect([])               // direct loans
        case 3: return makeInSelect([])                        // soft-ack
        case 4: return makeUpdate()                            // enrich rich row in DB
        case 5: return makeInSelect([{ id: 'user-b', display_name: 'Bob' }]) // profiles
        default: return makePersistedSelect([])
      }
    })

    const result = await getRelationshipDirectory(OWNER_ID, OWNER_EMAIL)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('rich-rel')
    expect(result[0].private_display_name).toBe('Bob the Builder')
    expect(result[0].tags).toContain('friends')
    expect(result[0].counterpart_display_name).toBe('Bob')
  })

  it('keeps thin row when no rich email row exists for the same person', async () => {
    const thinRow = {
      id: 'thin-rel',
      private_display_name: null,
      email_canonical: null,
      counterpart_user_id: 'user-c',
      created_at: '2026-06-22T01:00:00Z',
      relationship_tags: [{ tag: 'unclassified' }],
    }

    mockGetUserById.mockResolvedValue({ data: { user: { email: 'carol@example.com' } } })

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        case 1: return makePersistedSelect([thinRow])
        case 2: return makeDirectLoansSelect([])
        case 3: return makeInSelect([])
        // no DB update (no merge happened)
        case 4: return makeInSelect([{ id: 'user-c', display_name: 'Carol' }]) // profiles
        default: return makePersistedSelect([])
      }
    })

    const result = await getRelationshipDirectory(OWNER_ID, OWNER_EMAIL)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('thin-rel')
    expect(result[0].counterpart_display_name).toBe('Carol')
  })

  it('does not merge when rich row already has counterpart_user_id set', async () => {
    const thinRow = {
      id: 'thin-rel',
      private_display_name: null,
      email_canonical: null,
      counterpart_user_id: 'user-b',
      created_at: '2026-06-22T01:00:00Z',
      relationship_tags: [{ tag: 'unclassified' }],
    }
    // rich row already has a different counterpart_user_id → no merge
    const richRow = {
      id: 'rich-rel',
      private_display_name: 'Bob',
      email_canonical: 'bob@example.com',
      counterpart_user_id: 'some-other-user',
      created_at: '2026-06-21T00:00:00Z',
      relationship_tags: [{ tag: 'friends' }],
    }

    mockGetUserById.mockResolvedValue({ data: { user: { email: 'bob@example.com' } } })

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        case 1: return makePersistedSelect([thinRow, richRow])
        case 2: return makeDirectLoansSelect([])
        case 3: return makeInSelect([])
        // no update — rich row already has counterpart_user_id
        case 4: return makeInSelect([
          { id: 'user-b', display_name: 'Bob via B' },
          { id: 'some-other-user', display_name: 'Bob via Other' },
        ])
        default: return makePersistedSelect([])
      }
    })

    const result = await getRelationshipDirectory(OWNER_ID, OWNER_EMAIL)
    // Both rows kept — no merge possible
    expect(result).toHaveLength(2)
  })
})
