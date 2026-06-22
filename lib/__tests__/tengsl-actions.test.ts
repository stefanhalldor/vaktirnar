/**
 * Unit tests for lib/relationships/tag-action.ts
 *
 * Covers: updateRelationshipTag — tag validation, owner-scope enforcement,
 * happy-path update, and save-failure handling.
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
