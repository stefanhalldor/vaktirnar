/**
 * Unit tests for app/auth-mvp/heim/actions.ts ackRecentEvents
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockUpdate, mockAdminIn, mockAdminEq, mockAdminFrom } = vi.hoisted(() => {
  const mockUpdate = vi.fn()
  const mockAdminIn = vi.fn()
  const mockAdminEq = vi.fn(() => ({ in: mockAdminIn }))
  const mockAdminFrom = vi.fn(() => ({
    update: mockUpdate,
    select: vi.fn(() => ({ eq: mockAdminEq })),
  }))
  return { mockUpdate, mockAdminIn, mockAdminEq, mockAdminFrom }
})

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/auth/guard', () => ({
  guardTeskeidSession: vi.fn().mockResolvedValue({ user: { id: 'actor-uuid', email: 'actor@test.com' } }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({ from: mockAdminFrom })),
}))

// Mock the helpers directly so we can test the actions in isolation
const { mockAckHelper, mockAckAllHelper } = vi.hoisted(() => ({
  mockAckHelper:    vi.fn(),
  mockAckAllHelper: vi.fn(),
}))
vi.mock('@/lib/recent-events/helpers.server', () => ({
  ackRecentEventsForUser:           mockAckHelper,
  ackAllUnreadRecentEventsForUser:  mockAckAllHelper,
}))

import { ackRecentEvents, ackAllRecentEvents } from '@/app/auth-mvp/heim/actions'
import { revalidatePath } from 'next/cache'
import { guardTeskeidSession } from '@/lib/auth/guard'

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ackRecentEvents — input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAckHelper.mockResolvedValue(undefined)
  })

  it('returns invalid_input for null input', async () => {
    expect(await ackRecentEvents(null)).toEqual({ ok: false, error: 'invalid_input' })
  })

  it('returns invalid_input for missing event_ids', async () => {
    expect(await ackRecentEvents({ other: 'field' })).toEqual({ ok: false, error: 'invalid_input' })
  })

  it('returns invalid_input when event_ids is not an array', async () => {
    expect(await ackRecentEvents({ event_ids: 'not-array' })).toEqual({ ok: false, error: 'invalid_input' })
  })

  it('returns ok for empty array (nothing to do)', async () => {
    expect(await ackRecentEvents({ event_ids: [] })).toEqual({ ok: true })
    expect(mockAckHelper).not.toHaveBeenCalled()
  })

  it('returns ok when exactly 10 IDs provided', async () => {
    mockAckHelper.mockResolvedValue(undefined)
    const ids = Array.from({ length: 10 }, (_, i) => i + 1)
    expect(await ackRecentEvents({ event_ids: ids })).toEqual({ ok: true })
  })

  it('returns invalid_input when more than 10 IDs provided', async () => {
    const ids = Array.from({ length: 11 }, (_, i) => i + 1)
    expect(await ackRecentEvents({ event_ids: ids })).toEqual({ ok: false, error: 'invalid_input' })
  })

  it('filters out non-integer IDs', async () => {
    mockAckHelper.mockResolvedValue(undefined)
    const result = await ackRecentEvents({ event_ids: [1, 'bad', 2.5, -1, 0] })
    // Only id=1 passes (positive integer)
    expect(result.ok).toBe(true)
    expect(mockAckHelper).toHaveBeenCalledWith('actor-uuid', [1])
  })

  it('returns ok (no-op) when all entries are invalid', async () => {
    const result = await ackRecentEvents({ event_ids: ['bad', -1, 0] })
    expect(result).toEqual({ ok: true })
    expect(mockAckHelper).not.toHaveBeenCalled()
  })
})

describe('ackRecentEvents — ownership and security', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAckHelper.mockResolvedValue(undefined)
  })

  it('passes actor user_id from session to ackRecentEventsForUser', async () => {
    await ackRecentEvents({ event_ids: [1, 2] })
    expect(mockAckHelper).toHaveBeenCalledWith('actor-uuid', [1, 2])
  })

  it('throws redirect when guard redirects (auth required)', async () => {
    vi.mocked(guardTeskeidSession).mockRejectedValueOnce(new Error('NEXT_REDIRECT:/'))
    await expect(ackRecentEvents({ event_ids: [1] })).rejects.toThrow('NEXT_REDIRECT:/')
  })
})

describe('ackRecentEvents — revalidation and error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('revalidates /auth-mvp/heim on success', async () => {
    mockAckHelper.mockResolvedValue(undefined)
    await ackRecentEvents({ event_ids: [1] })
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/auth-mvp/heim')
  })

  it('returns save_failed when ackRecentEventsForUser throws', async () => {
    mockAckHelper.mockRejectedValue(new Error('DB error'))
    const result = await ackRecentEvents({ event_ids: [1] })
    expect(result).toEqual({ ok: false, error: 'save_failed' })
  })

  it('does not revalidate when ack fails', async () => {
    mockAckHelper.mockRejectedValue(new Error('DB error'))
    await ackRecentEvents({ event_ids: [1] })
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled()
  })
})

describe('ackAllRecentEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAckAllHelper.mockResolvedValue(undefined)
  })

  it('calls ackAllUnreadRecentEventsForUser with actor user_id', async () => {
    await ackAllRecentEvents()
    expect(mockAckAllHelper).toHaveBeenCalledWith('actor-uuid')
  })

  it('revalidates /auth-mvp/heim on success', async () => {
    await ackAllRecentEvents()
    expect(vi.mocked(revalidatePath)).toHaveBeenCalledWith('/auth-mvp/heim')
  })

  it('returns save_failed when helper throws', async () => {
    mockAckAllHelper.mockRejectedValue(new Error('DB error'))
    const result = await ackAllRecentEvents()
    expect(result).toEqual({ ok: false, error: 'save_failed' })
  })

  it('does not revalidate when helper fails', async () => {
    mockAckAllHelper.mockRejectedValue(new Error('DB error'))
    await ackAllRecentEvents()
    expect(vi.mocked(revalidatePath)).not.toHaveBeenCalled()
  })

  it('throws redirect when guard redirects (auth required)', async () => {
    vi.mocked(guardTeskeidSession).mockRejectedValueOnce(new Error('NEXT_REDIRECT:/'))
    await expect(ackAllRecentEvents()).rejects.toThrow('NEXT_REDIRECT:/')
  })
})
