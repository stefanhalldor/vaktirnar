import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetAdmin,
  mockReadSourceIn,
  mockReadResult,
  mockUpdateIn,
  mockUpdateResult,
} = vi.hoisted(() => {
  const mockReadResult = vi.fn()
  const mockReadLimit = vi.fn(() => mockReadResult())
  const mockReadOrder2 = vi.fn(() => {
    const terminal: Record<string, unknown> = { limit: mockReadLimit }
    terminal.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      mockReadResult().then(resolve, reject)
    return terminal
  })
  const mockReadOrder1 = vi.fn(() => ({ order: mockReadOrder2 }))
  const mockReadIs = vi.fn(() => ({ order: mockReadOrder1 }))
  const mockReadSourceIn = vi.fn(() => ({ is: mockReadIs }))
  const mockReadEq = vi.fn(() => ({ in: mockReadSourceIn }))
  const mockSelect = vi.fn(() => ({ eq: mockReadEq }))

  const mockUpdateResult = vi.fn()
  const updateChain: Record<string, unknown> = {}
  const mockUpdateIn = vi.fn(() => updateChain)
  const mockUpdateIs = vi.fn(() => mockUpdateResult())
  const mockUpdateEq = vi.fn(() => updateChain)
  updateChain.eq = mockUpdateEq
  updateChain.in = mockUpdateIn
  updateChain.is = mockUpdateIs
  updateChain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    mockUpdateResult().then(resolve, reject)
  const mockUpdate = vi.fn(() => updateChain)

  const mockFrom = vi.fn(() => ({ select: mockSelect, update: mockUpdate }))
  const mockGetAdmin = vi.fn(() => ({ from: mockFrom }))
  return { mockGetAdmin, mockReadSourceIn, mockReadResult, mockUpdateIn, mockUpdateResult }
})

vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))

import {
  ackAllUnreadRecentEventsForUser,
  ackRecentEventsForUser,
  getUnreadRecentEventsForUser,
} from '@/lib/recent-events/helpers.server'

describe('recent event source scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadResult.mockResolvedValue({ data: [], error: null })
    mockUpdateResult.mockResolvedValue({ error: null })
  })

  it('returns without a DB read when no source is currently allowed', async () => {
    await expect(getUnreadRecentEventsForUser('user-uuid', [])).resolves.toEqual([])
    expect(mockGetAdmin).not.toHaveBeenCalled()
  })

  it('filters unread reads to the explicit server-derived source list', async () => {
    await getUnreadRecentEventsForUser('user-uuid', ['loans', 'expenses'])
    expect(mockReadSourceIn).toHaveBeenCalledWith('source', ['loans', 'expenses'])
  })

  it('returns without an update when ack-all has no allowed source', async () => {
    await ackAllUnreadRecentEventsForUser('user-uuid', [])
    expect(mockGetAdmin).not.toHaveBeenCalled()
  })

  it('filters ack-all to enabled sources', async () => {
    await ackAllUnreadRecentEventsForUser('user-uuid', ['expenses'])
    expect(mockUpdateIn).toHaveBeenCalledWith('source', ['expenses'])
  })

  it('filters ID acknowledgement by both owned IDs and enabled sources', async () => {
    await ackRecentEventsForUser('user-uuid', [1, 2], ['heimilisverkin'])
    expect(mockUpdateIn).toHaveBeenNthCalledWith(1, 'id', [1, 2])
    expect(mockUpdateIn).toHaveBeenNthCalledWith(2, 'source', ['heimilisverkin'])
  })
})
