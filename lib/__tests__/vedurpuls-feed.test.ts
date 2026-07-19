/**
 * Tests for GET /api/auth-mvp/vedurpuls/feed
 *
 * Covers: auth enforcement, cursor validation, limit clamping,
 * happy-path FeedMessageDto shape, repository error → 500,
 * and no user/email leakage in the response.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockCheckChatAccess } = vi.hoisted(() => ({ mockCheckChatAccess: vi.fn() }))
const { mockGetFeedMessages } = vi.hoisted(() => ({ mockGetFeedMessages: vi.fn() }))
const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/chat/access.server', () => ({
  checkChatAccess: mockCheckChatAccess,
}))

vi.mock('@/lib/chat/repository.server', () => ({
  getFeedMessages: mockGetFeedMessages,
}))

import { GET as feedGet } from '@/app/api/auth-mvp/vedurpuls/feed/route'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FEED_MESSAGE = {
  id: '00000000-0000-0000-0000-000000000001',
  threadId: '00000000-0000-0000-0000-000000000002',
  body: 'Hvass vindur hér',
  messageKind: 'chat',
  createdAt: '2026-07-15T21:00:00Z',
  isDeleted: false,
  isHidden: false,
  authorName: null,
  target: {
    domain: 'weather',
    targetType: 'vedurstofan_station',
    targetId: '31392',
    targetName: 'Hellisheiði',
    provider: 'vedurstofan',
  },
}

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/auth-mvp/vedurpuls/feed')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url.toString(), { method: 'GET' })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'uid-1', email: 'test@example.com' } } })
  mockCheckChatAccess.mockResolvedValue('allowed')
  mockGetFeedMessages.mockResolvedValue([])
})

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('GET /api/auth-mvp/vedurpuls/feed', () => {
  it('returns 401 when no session', async () => {
    mockCheckChatAccess.mockResolvedValue('no-session')
    const res = await feedGet(makeGetRequest())
    expect(res.status).toBe(401)
  })

  it('returns 503 when chat disabled', async () => {
    mockCheckChatAccess.mockResolvedValue('chat-disabled')
    const res = await feedGet(makeGetRequest())
    expect(res.status).toBe(503)
  })

  it('returns 403 when no pulse access', async () => {
    mockCheckChatAccess.mockResolvedValue('no-pulse')
    const res = await feedGet(makeGetRequest())
    expect(res.status).toBe(403)
  })

  // ── Input validation ────────────────────────────────────────────────────────

  it('returns 400 when before is not a valid timestamp', async () => {
    const res = await feedGet(makeGetRequest({ before: 'notadate' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('timestamp')
  })

  it('accepts valid ISO before cursor', async () => {
    const res = await feedGet(makeGetRequest({ before: '2026-07-15T21:00:00Z' }))
    expect(res.status).toBe(200)
    expect(mockGetFeedMessages).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ before: '2026-07-15T21:00:00Z' })
    )
  })

  it('clamps limit to 100', async () => {
    await feedGet(makeGetRequest({ limit: '9999' }))
    expect(mockGetFeedMessages).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ limit: 100 })
    )
  })

  it('clamps limit to minimum 1', async () => {
    await feedGet(makeGetRequest({ limit: '0' }))
    expect(mockGetFeedMessages).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ limit: 1 })
    )
  })

  // ── Scope ──────────────────────────────────────────────────────────────────

  it('passes weather + vegagerdin_station scope to repository', async () => {
    await feedGet(makeGetRequest())
    expect(mockGetFeedMessages).toHaveBeenCalledWith(
      { domain: 'weather', targetTypes: ['vegagerdin_station'] },
      expect.any(Object)
    )
  })

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('returns 200 with FeedMessageDto array', async () => {
    mockGetFeedMessages.mockResolvedValue([FEED_MESSAGE])
    const res = await feedGet(makeGetRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe(FEED_MESSAGE.id)
    expect(body[0].target.targetName).toBe('Hellisheiði')
    expect(body[0].target.targetId).toBe('31392')
  })

  it('returns 200 with empty array when no messages', async () => {
    mockGetFeedMessages.mockResolvedValue([])
    const res = await feedGet(makeGetRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('does not expose user_id or email in feed response', async () => {
    mockGetFeedMessages.mockResolvedValue([FEED_MESSAGE])
    const res = await feedGet(makeGetRequest())
    const body = await res.json()
    const json = JSON.stringify(body)
    expect(json).not.toContain('user_id')
    expect(json).not.toContain('uid-1')
    expect(json).not.toContain('test@example.com')
  })

  // ── Error handling ─────────────────────────────────────────────────────────

  it('returns 500 when repository throws', async () => {
    mockGetFeedMessages.mockRejectedValue(new Error('chat: getFeedMessages failed'))
    const res = await feedGet(makeGetRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('feed unavailable')
  })
})
