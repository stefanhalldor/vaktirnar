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

import { updateRelationshipDetails, updateRelationshipTag } from '@/lib/relationships/tag-action'
// ALLOWED_TAGS is in lib/relationships/types.ts — not exported from 'use server' file

import { getRelationshipDirectory, getRelationship, getRelationshipLoanActivity, getRelationshipRecipientOptions } from '@/lib/relationships/actions'
import { createRelationshipCircle } from '@/lib/relationships/actions-v2'

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

function makeDetailsUpdate(update: ReturnType<typeof vi.fn>, error: unknown = null) {
  update.mockImplementation(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(async () => ({ error })),
    })),
  }))
  return { update }
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

function makeInSelect(rows: unknown[], error: unknown = null) {
  return {
    select: vi.fn(() => ({
      in: vi.fn(async () => ({ data: rows, error })),
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

// .select().eq().eq().maybeSingle() — for getRelationship initial fetch
function makeRelDetailSelect(row: unknown) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: row, error: null })),
        })),
      })),
    })),
  }
}

// .select().eq().maybeSingle() — for profile fetch by id
function makeProfileMaybeSingle(displayName: string | null) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: displayName !== null ? { display_name: displayName } : null,
          error: null,
        })),
      })),
    })),
  }
}

// .select().in().eq() — for accepted invitation lookup
function makeInEqSelect(rows: unknown[]) {
  return {
    select: vi.fn(() => ({
      in: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: rows, error: null })),
      })),
    })),
  }
}

// .select().in().or() — awaited directly (getRelationship loan filter)
function makeInOrSelect(rows: unknown[]) {
  return {
    select: vi.fn(() => ({
      in: vi.fn(() => ({
        or: vi.fn(async () => ({ data: rows, error: null })),
      })),
    })),
  }
}

// .select().in().or().order() — legacy helper kept for reference
function makeInOrOrderSelect(rows: unknown[]) {
  return {
    select: vi.fn(() => ({
      in: vi.fn(() => ({
        or: vi.fn(() => ({
          order: vi.fn(async () => ({ data: rows, error: null })),
        })),
      })),
    })),
  }
}

// .select().or().order() — for getRelationshipLoanActivity owner loans query
function makeOrOrderSelect(rows: unknown[], error: unknown = null) {
  return {
    select: vi.fn(() => ({
      or: vi.fn(() => ({
        order: vi.fn(async () => ({ data: rows, error })),
      })),
    })),
  }
}

// .select().eq().order() — for getRelationshipRecipientOptions initial fetch
function makeRecipientOptionsSelect(rows: unknown[], error: unknown = null) {
  const order = vi.fn(async () => ({ data: rows, error }))
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        order,
        not: vi.fn(() => ({
          order,
        })),
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

  it('returns persisted relationships in canonical Icelandic display-name order', async () => {
    const rows = [
      {
        id: 'rel-thor', private_display_name: 'Þór', email_canonical: 'thor@example.com',
        counterpart_user_id: null, created_at: '2026-06-03T00:00:00Z', relationship_tags: [],
      },
      {
        id: 'rel-anna', private_display_name: 'Anna', email_canonical: 'anna@example.com',
        counterpart_user_id: null, created_at: '2026-06-01T00:00:00Z', relationship_tags: [],
      },
      {
        id: 'rel-arni', private_display_name: 'Árni', email_canonical: 'arni@example.com',
        counterpart_user_id: null, created_at: '2026-06-02T00:00:00Z', relationship_tags: [],
      },
    ]
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makePersistedSelect(rows)
      if (callCount === 2) return makeDirectLoansSelect([])
      return makeInSelect([])
    })

    const result = await getRelationshipDirectory(OWNER_ID, OWNER_EMAIL)

    expect(result.map((item) => item.id)).toEqual(['rel-anna', 'rel-arni', 'rel-thor'])
  })
})

describe('updateRelationshipDetails — independent private fields', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates only the private display name', async () => {
    const update = vi.fn()
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      return callCount === 1 ? makeRelSelect(true) : makeDetailsUpdate(update)
    })

    const result = await updateRelationshipDetails('rel-id', {
      field: 'privateDisplayName',
      value: '  Mamma  ',
    })

    expect(result).toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({ private_display_name: 'Mamma' })
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ note: expect.anything() }))
  })

  it('updates only the private note', async () => {
    const update = vi.fn()
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      return callCount === 1 ? makeRelSelect(true) : makeDetailsUpdate(update)
    })

    const result = await updateRelationshipDetails('rel-id', {
      field: 'note',
      value: '  Hringja fyrir afmælið  ',
    })

    expect(result).toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({ note: 'Hringja fyrir afmælið' })
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ private_display_name: expect.anything() }))
  })

  it('rejects overlong values before querying relationship data', async () => {
    const result = await updateRelationshipDetails('rel-id', {
      field: 'privateDisplayName',
      value: 'x'.repeat(121),
    })

    expect(result).toEqual({ ok: false, error: 'invalid_input' })
    expect(mockFrom).not.toHaveBeenCalled()
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

  it('does not merge when both rows already have counterpart_user_id set (different users)', async () => {
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

// ── getRelationshipDirectory — Gmail dotted/canonical email dedup (step 5.6) ──

describe('getRelationshipDirectory — Gmail email-pair dedup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('merges dotted and canonical Gmail email rows into one, keeping the richer row', async () => {
    // Row created before sql/56 with dotted stored form + private name
    const dottedRow = {
      id: 'dotted-rel',
      private_display_name: 'Bob Friend',
      email_canonical: 'dotted.user@gmail.com',
      counterpart_user_id: null,
      created_at: '2026-06-01T00:00:00Z',
      relationship_tags: [{ tag: 'friends' }],
    }
    // Row created after sql/56 with canonical form, no private fields
    const canonicalRow = {
      id: 'canonical-rel',
      private_display_name: null,
      email_canonical: 'dotteduser@gmail.com',
      counterpart_user_id: null,
      created_at: '2026-06-22T00:00:00Z',
      relationship_tags: [{ tag: 'unclassified' }],
    }

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        case 1: return makePersistedSelect([dottedRow, canonicalRow])
        case 2: return makeDirectLoansSelect([])
        case 3: return makeInSelect([])
        // step 5.5: no thin rows (both have email_canonical)
        // step 5.6: normalise dottedRow email to canonical + hide canonicalRow
        case 4: return makeUpdate()  // update dottedRow email_canonical to 'dotteduser@gmail.com'
        // no profile batch (no counterpart_user_id)
        default: return makePersistedSelect([])
      }
    })

    const result = await getRelationshipDirectory(OWNER_ID, OWNER_EMAIL)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('dotted-rel')
    expect(result[0].private_display_name).toBe('Bob Friend')
    expect(result[0].tags).toContain('friends')
    expect(result[0].email_canonical).toBe('dotteduser@gmail.com') // normalised in memory
  })

  it('non-Gmail rows with similar local-parts are NOT merged', async () => {
    const row1 = {
      id: 'rel-a',
      private_display_name: null,
      email_canonical: 'dot.ted@example.com',
      counterpart_user_id: null,
      created_at: '2026-06-01T00:00:00Z',
      relationship_tags: [{ tag: 'unclassified' }],
    }
    const row2 = {
      id: 'rel-b',
      private_display_name: null,
      email_canonical: 'dotted@example.com',
      counterpart_user_id: null,
      created_at: '2026-06-02T00:00:00Z',
      relationship_tags: [{ tag: 'unclassified' }],
    }

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        case 1: return makePersistedSelect([row1, row2])
        case 2: return makeDirectLoansSelect([])
        case 3: return makeInSelect([])
        // no dedup — different canonical forms for non-Gmail
        default: return makePersistedSelect([])
      }
    })

    const result = await getRelationshipDirectory(OWNER_ID, OWNER_EMAIL)
    expect(result).toHaveLength(2)
  })
})

// ── getRelationshipLoanActivity — canonical email normalization ────────────────

describe('getRelationshipLoanActivity — canonical email normalization', () => {
  beforeEach(() => vi.clearAllMocks())

  it('finds activity when stored invitation uses dotted Gmail but relationship stores canonical', async () => {
    // Relationship stores canonical form; old invitation stored dotted form
    const relationship = { counterpart_user_id: null, email_canonical: 'dotteduser@gmail.com' }

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        // owner loans first: .select().or().order()
        case 1: return makeOrOrderSelect([{
          id: 'loan-1',
          item_name: 'Reiknivél',
          loaned_at: '2026-06-01',
          returned_at: null,
          lender_user_id: OWNER_ID,
        }])
        // then filter invitations for those loan IDs: .select().in()
        case 2: return makeInSelect([{ loan_id: 'loan-1', recipient_email_normalized: 'dotted.user@gmail.com' }])
        default: return makeInSelect([])
      }
    })

    const result = await getRelationshipLoanActivity(OWNER_ID, relationship)
    expect(result).toHaveLength(1)
    expect(result[0].item_name).toBe('Reiknivél')
  })

  it('finds activity when stored invitation uses canonical but relationship stores dotted', async () => {
    // Relationship stores dotted form; invitation stored canonical form (post sql/56)
    const relationship = { counterpart_user_id: null, email_canonical: 'dotted.user@gmail.com' }

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        // owner loans first
        case 1: return makeOrOrderSelect([{
          id: 'loan-2',
          item_name: 'Hjól',
          loaned_at: '2026-06-10',
          returned_at: null,
          lender_user_id: OWNER_ID,
        }])
        // invitations with canonical stored form
        case 2: return makeInSelect([{ loan_id: 'loan-2', recipient_email_normalized: 'dotteduser@gmail.com' }])
        default: return makeInSelect([])
      }
    })

    const result = await getRelationshipLoanActivity(OWNER_ID, relationship)
    expect(result).toHaveLength(1)
    expect(result[0].item_name).toBe('Hjól')
  })
})

describe('getRelationshipLoanActivity — bounded lookup failures', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws a generic error when the direct counterpart query fails', async () => {
    mockFrom.mockReturnValue(makeOrOrderSelect([], { message: 'sensitive database detail' }))

    await expect(getRelationshipLoanActivity(OWNER_ID, {
      counterpart_user_id: 'counterpart-id',
      email_canonical: null,
    })).rejects.toThrow('relationship_loan_activity_lookup_failed')
  })

  it('throws a generic error when the owner loan query fails', async () => {
    mockFrom.mockReturnValue(makeOrOrderSelect([], { message: 'sensitive database detail' }))

    await expect(getRelationshipLoanActivity(OWNER_ID, {
      counterpart_user_id: null,
      email_canonical: 'friend@example.com',
    })).rejects.toThrow('relationship_loan_activity_lookup_failed')
  })

  it('throws a generic error when the invitation query fails', async () => {
    mockFrom
      .mockReturnValueOnce(makeOrOrderSelect([{
        id: 'loan-1',
        item_name: 'Bók',
        loaned_at: '2026-06-01',
        returned_at: null,
        lender_user_id: OWNER_ID,
      }]))
      .mockReturnValueOnce(makeInSelect([], { message: 'sensitive database detail' }))

    await expect(getRelationshipLoanActivity(OWNER_ID, {
      counterpart_user_id: null,
      email_canonical: 'friend@example.com',
    })).rejects.toThrow('relationship_loan_activity_lookup_failed')
  })
})

describe('createRelationshipCircle — creation freeze', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects creation after auth guards without touching Supabase', async () => {
    const result = await createRelationshipCircle({
      name: 'Nýr hópur',
      description: '',
      request_id: '3ac06e6f-cdd1-437c-8d42-17a0f8e6748d',
    })

    expect(result).toEqual({ ok: false, error: 'not_allowed' })
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

// ── getRelationship — email-only counterpart confirmation ─────────────────────

describe('getRelationship — email-only counterpart confirmation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the current auth email only after an owner-scoped linked counterpart is found', async () => {
    const relRow = {
      id: 'rel-linked',
      counterpart_user_id: 'user-b',
      private_display_name: 'Bob',
      email_canonical: 'old-address@example.com',
      note: null,
      created_at: '2026-06-01T00:00:00Z',
      relationship_tags: [{ tag: 'friends' }],
      relationship_sources: [],
    }
    mockFrom
      .mockReturnValueOnce(makeRelDetailSelect(relRow))
      .mockReturnValueOnce(makeProfileMaybeSingle('Bob Jonsson'))
    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'current-address@example.com' } },
      error: null,
    })

    const result = await getRelationship(OWNER_ID, 'rel-linked')

    expect(result?.counterpart_email).toBe('current-address@example.com')
    expect(mockGetUserById).toHaveBeenCalledWith('user-b')
  })

  it('returns counterpart_display_name via accepted claim when email-only row has no counterpart_user_id', async () => {
    const relRow = {
      id: 'rel-email',
      counterpart_user_id: null,
      private_display_name: 'Bob',
      email_canonical: 'dotted.user@gmail.com',
      note: null,
      created_at: '2026-06-01T00:00:00Z',
      relationship_tags: [{ tag: 'friends' }],
      relationship_sources: [],
    }

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        case 1: return makeRelDetailSelect(relRow)   // initial select
        case 2: return makeDirectLoansSelect([{      // owner loans first: .select().or()
          id: 'loan-1', lender_user_id: OWNER_ID, borrower_user_id: 'user-b',
        }])
        case 3: return makeInEqSelect([{             // accepted invitations for those loan IDs
          loan_id: 'loan-1', recipient_role: 'borrower', recipient_email_normalized: 'dotteduser@gmail.com',
        }])
        case 4: return makeProfileMaybeSingle('Bob Jonsson') // profile
        case 5: return makeUpdate()                          // lazy DB enrichment
        default: return makeRelDetailSelect(null)
      }
    })
    mockGetUserById.mockResolvedValue({
      data: { user: { email: 'bob.current@example.com' } },
      error: null,
    })

    const result = await getRelationship(OWNER_ID, 'rel-email')
    expect(result).not.toBeNull()
    expect(result!.counterpart_display_name).toBe('Bob Jonsson')
    expect(result!.counterpart_email).toBe('bob.current@example.com')
    expect(result!.private_display_name).toBe('Bob')
    expect(result!.tags).toContain('friends')
  })

  it('returns no counterpart_display_name for email-only row with no accepted claims', async () => {
    const relRow = {
      id: 'rel-pending',
      counterpart_user_id: null,
      private_display_name: null,
      email_canonical: 'pending@example.com',
      note: null,
      created_at: '2026-06-01T00:00:00Z',
      relationship_tags: [{ tag: 'unclassified' }],
      relationship_sources: [],
    }

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        case 1: return makeRelDetailSelect(relRow)   // initial select
        case 2: return makeDirectLoansSelect([])     // no owner loans → no invitations query
        default: return makeRelDetailSelect(null)
      }
    })

    const result = await getRelationship(OWNER_ID, 'rel-pending')
    expect(result).not.toBeNull()
    expect(result!.counterpart_display_name).toBeNull()
    expect(result!.counterpart_email).toBeNull()
    expect(mockGetUserById).not.toHaveBeenCalled()
    // Only 2 DB calls — no profile lookup for unconfirmed email-only contact
    expect(callCount).toBe(2)
  })
})

// ── getRelationshipRecipientOptions — Gmail canonical dedup ───────────────────

describe('getRelationshipRecipientOptions — Gmail dedup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('can surface a bounded load failure to picker pages while legacy callers keep an empty fallback', async () => {
    mockFrom.mockImplementation(() => makeRecipientOptionsSelect([], { message: 'db unavailable' }))

    await expect(getRelationshipRecipientOptions(OWNER_ID, { throwOnError: true }))
      .rejects.toThrow('relationship_recipient_options_unavailable')
    await expect(getRelationshipRecipientOptions(OWNER_ID)).resolves.toEqual([])
  })

  it('returns one option when dotted and canonical Gmail rows both exist, keeping the richer row', async () => {
    const dottedRow = {
      id: 'rel-dotted',
      email_canonical: 'dotted.user@gmail.com',
      counterpart_user_id: null,
      private_display_name: 'Bob Friend',
      note: 'Skóvin',
      created_at: '2026-06-01T00:00:00Z',
      relationship_tags: [{ tag: 'friends' }],
    }
    const canonicalRow = {
      id: 'rel-canonical',
      email_canonical: 'dotteduser@gmail.com',
      counterpart_user_id: null,
      private_display_name: null,
      note: null,
      created_at: '2026-06-22T00:00:00Z',
      relationship_tags: [{ tag: 'unclassified' }],
    }

    mockFrom.mockImplementation(() => makeRecipientOptionsSelect([dottedRow, canonicalRow]))

    const result = await getRelationshipRecipientOptions(OWNER_ID)
    expect(result).toHaveLength(1)
    expect(result[0].email).toBe('dotteduser@gmail.com') // canonical output
    expect(result[0].privateDisplayName).toBe('Bob Friend')
    expect(result[0].note).toBe('Skóvin')
  })

  it('does not merge non-Gmail rows with similar local-parts', async () => {
    const rowA = {
      id: 'rel-a',
      email_canonical: 'dot.ted@example.com',
      counterpart_user_id: null,
      private_display_name: null,
      note: null,
      created_at: '2026-06-01T00:00:00Z',
      relationship_tags: [{ tag: 'unclassified' }],
    }
    const rowB = {
      id: 'rel-b',
      email_canonical: 'dotted@example.com',
      counterpart_user_id: null,
      private_display_name: null,
      note: null,
      created_at: '2026-06-02T00:00:00Z',
      relationship_tags: [{ tag: 'unclassified' }],
    }

    mockFrom.mockImplementation(() => makeRecipientOptionsSelect([rowA, rowB]))

    const result = await getRelationshipRecipientOptions(OWNER_ID)
    expect(result).toHaveLength(2)
  })

  it('fetches selfDisplayName from profile when counterpart_user_id is set', async () => {
    const row = {
      id: 'rel-1',
      email_canonical: 'alice@example.com',
      counterpart_user_id: 'user-a',
      private_display_name: null,
      note: null,
      created_at: '2026-06-01T00:00:00Z',
      relationship_tags: [{ tag: 'unclassified' }],
    }

    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      switch (callCount) {
        case 1: return makeRecipientOptionsSelect([row])
        case 2: return makeInSelect([{ id: 'user-a', display_name: 'Alice Smith' }])
        default: return makeRecipientOptionsSelect([])
      }
    })

    const result = await getRelationshipRecipientOptions(OWNER_ID)
    expect(result).toHaveLength(1)
    expect(result[0].selfDisplayName).toBe('Alice Smith')
  })

  it('keeps an owner-private name-only Relationship available without inventing an email', async () => {
    const row = {
      id: 'rel-name-only', email_canonical: null, counterpart_user_id: null,
      private_display_name: 'Palli pípari', note: 'Eigandanóta',
      created_at: '2026-06-01T00:00:00Z', relationship_tags: [{ tag: 'services' }],
    }
    mockFrom.mockImplementation(() => makeRecipientOptionsSelect([row]))

    const result = await getRelationshipRecipientOptions(OWNER_ID)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'rel-name-only', email: null, privateDisplayName: 'Palli pípari', note: 'Eigandanóta',
    })
  })

  it('returns loan recipient options in the same canonical display-name order', async () => {
    const rows = [
      {
        id: 'rel-thor', email_canonical: 'thor@example.com', counterpart_user_id: null,
        private_display_name: 'Þór', note: null, created_at: '2026-06-03T00:00:00Z', relationship_tags: [],
      },
      {
        id: 'rel-anna', email_canonical: 'anna@example.com', counterpart_user_id: null,
        private_display_name: 'Anna', note: null, created_at: '2026-06-01T00:00:00Z', relationship_tags: [],
      },
      {
        id: 'rel-arni', email_canonical: 'arni@example.com', counterpart_user_id: null,
        private_display_name: 'Árni', note: null, created_at: '2026-06-02T00:00:00Z', relationship_tags: [],
      },
    ]
    mockFrom.mockImplementation(() => makeRecipientOptionsSelect(rows))

    const result = await getRelationshipRecipientOptions(OWNER_ID)

    expect(result.map((option) => option.id)).toEqual(['rel-anna', 'rel-arni', 'rel-thor'])
  })
})
