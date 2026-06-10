/**
 * Direct unit tests for lib/recent-events/helpers.server.ts
 *
 * Verifies that recordRecentEvent writes the correct ack_at value:
 * - initiallyRead: true  → ack_at is set to occurred_at (non-null)
 * - initiallyRead absent → ack_at is null
 * - initiallyRead: false → ack_at is null
 *
 * Also covers: protocol-relative href rejection, upsert error logging,
 * and upsert options (onConflict, ignoreDuplicates).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockUpsert } = vi.hoisted(() => ({ mockUpsert: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: mockUpsert,
    })),
  })),
}))

import { recordRecentEvent } from '@/lib/recent-events/helpers.server'

// ── Base args ────────────────────────────────────────────────────────────────

const BASE_ARGS = {
  userId:     'user-uuid-1',
  source:     'loans',
  eventType:  'loan_updated' as const,
  entityType: 'loan',
  entityId:   'loan-uuid-1',
  eventKey:   'loans:loan:loan-uuid-1:updated:2026-06-10T12:00:00.000Z',
  payload:    { itemName: 'Bók' },
  href:       '/auth-mvp/lanad-og-skilad',
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('recordRecentEvent — ack_at behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsert.mockResolvedValue({ error: null })
  })

  it('writes ack_at: null when initiallyRead is omitted', async () => {
    await recordRecentEvent(BASE_ARGS)

    expect(mockUpsert).toHaveBeenCalledOnce()
    const row = mockUpsert.mock.calls[0][0]
    expect(row.ack_at).toBeNull()
  })

  it('writes ack_at: null when initiallyRead is false', async () => {
    await recordRecentEvent({ ...BASE_ARGS, initiallyRead: false })

    expect(mockUpsert).toHaveBeenCalledOnce()
    const row = mockUpsert.mock.calls[0][0]
    expect(row.ack_at).toBeNull()
  })

  it('writes ack_at equal to occurred_at when initiallyRead is true', async () => {
    await recordRecentEvent({ ...BASE_ARGS, initiallyRead: true })

    expect(mockUpsert).toHaveBeenCalledOnce()
    const row = mockUpsert.mock.calls[0][0]
    expect(row.ack_at).not.toBeNull()
    expect(row.ack_at).toBe(row.occurred_at)
  })

  it('writes occurred_at as a valid ISO string', async () => {
    await recordRecentEvent(BASE_ARGS)

    const row = mockUpsert.mock.calls[0][0]
    expect(() => new Date(row.occurred_at)).not.toThrow()
    expect(new Date(row.occurred_at).toISOString()).toBe(row.occurred_at)
  })
})

describe('recordRecentEvent — upsert payload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsert.mockResolvedValue({ error: null })
  })

  it('passes correct user_id, event_type, entity_id, href, payload', async () => {
    await recordRecentEvent(BASE_ARGS)

    const row = mockUpsert.mock.calls[0][0]
    expect(row.user_id).toBe('user-uuid-1')
    expect(row.event_type).toBe('loan_updated')
    expect(row.entity_id).toBe('loan-uuid-1')
    expect(row.href).toBe('/auth-mvp/lanad-og-skilad')
    expect(row.payload).toEqual({ itemName: 'Bók' })
  })

  it('uses onConflict: user_id,event_key by default (updateOnConflict omitted)', async () => {
    await recordRecentEvent(BASE_ARGS)

    const opts = mockUpsert.mock.calls[0][1]
    expect(opts.onConflict).toBe('user_id,event_key')
    expect(opts.ignoreDuplicates).toBe(false)
  })

  it('sets ignoreDuplicates: true when updateOnConflict is false', async () => {
    await recordRecentEvent({ ...BASE_ARGS, updateOnConflict: false })

    const opts = mockUpsert.mock.calls[0][1]
    expect(opts.ignoreDuplicates).toBe(true)
  })
})

describe('recordRecentEvent — error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not throw when upsert resolves with an error', async () => {
    mockUpsert.mockResolvedValue({ error: { code: 'PGRST301', message: 'DB error' } })

    await expect(recordRecentEvent(BASE_ARGS)).resolves.toBeUndefined()
  })

  it('does not throw when upsert rejects', async () => {
    mockUpsert.mockRejectedValue(new Error('network failure'))

    await expect(recordRecentEvent(BASE_ARGS)).resolves.toBeUndefined()
  })

  it('rejects protocol-relative href without calling upsert', async () => {
    await recordRecentEvent({ ...BASE_ARGS, href: '//example.com/path' })

    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
