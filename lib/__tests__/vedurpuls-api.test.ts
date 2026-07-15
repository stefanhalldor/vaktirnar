/**
 * Tests for Veðurpúls Phase 2 API routes.
 *
 * Covers auth enforcement (401/403/503), UUID validation (400),
 * input validation (400), repository error handling (500),
 * and happy-path responses for all four routes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockCheckChatAccess } = vi.hoisted(() => ({ mockCheckChatAccess: vi.fn() }))
const { mockBuildTarget } = vi.hoisted(() => ({ mockBuildTarget: vi.fn() }))
const { mockGetOrCreate } = vi.hoisted(() => ({ mockGetOrCreate: vi.fn() }))
const { mockListMessages } = vi.hoisted(() => ({ mockListMessages: vi.fn() }))
const { mockPostMessage } = vi.hoisted(() => ({ mockPostMessage: vi.fn() }))
const { mockMarkThreadRead } = vi.hoisted(() => ({ mockMarkThreadRead: vi.fn() }))
const { mockReportMessage } = vi.hoisted(() => ({ mockReportMessage: vi.fn() }))
const { mockAssertThreadScope } = vi.hoisted(() => ({ mockAssertThreadScope: vi.fn() }))
const { mockAssertMessageScope } = vi.hoisted(() => ({ mockAssertMessageScope: vi.fn() }))
const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/chat/access.server', () => ({
  checkChatAccess: mockCheckChatAccess,
}))

vi.mock('@/lib/chat/adapters/weather.server', () => ({
  buildWeatherStationTarget: mockBuildTarget,
}))

vi.mock('@/lib/chat/repository.server', () => ({
  getOrCreateThread: mockGetOrCreate,
  listMessages: mockListMessages,
  postMessage: mockPostMessage,
  markThreadRead: mockMarkThreadRead,
  reportMessage: mockReportMessage,
  assertThreadScope: mockAssertThreadScope,
  assertMessageScope: mockAssertMessageScope,
}))

import { POST as threadPost } from '@/app/api/auth-mvp/vedurpuls/thread/route'
import { GET as messagesGet, POST as messagesPost } from '@/app/api/auth-mvp/vedurpuls/messages/route'
import { POST as readPost } from '@/app/api/auth-mvp/vedurpuls/read/route'
import { POST as reportPost } from '@/app/api/auth-mvp/vedurpuls/report/route'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_UUID = '00000000-0000-0000-0000-000000000001'
const VALID_UUID_2 = '00000000-0000-0000-0000-000000000002'

const THREAD_DTO = {
  id: VALID_UUID,
  domain: 'weather',
  targetType: 'vedurstofan_station',
  targetId: '31392',
  targetName: 'Hellisheiði',
  lat: 64.0,
  lon: -21.4,
  lastMessageAt: null,
  messageCount: 0,
}

const MESSAGE_DTO = {
  id: VALID_UUID_2,
  threadId: VALID_UUID,
  body: 'Kalt og vindasamt',
  messageKind: 'chat',
  createdAt: '2026-07-15T20:00:00Z',
  isDeleted: false,
  isHidden: false,
}

const STATION_TARGET = {
  domain: 'weather' as const,
  targetType: 'vedurstofan_station' as const,
  targetId: '31392',
  targetName: 'Hellisheiði',
  provider: 'vedurstofan',
  lat: 64.0,
  lon: -21.4,
}

function makeRequest(body: unknown, method = 'POST', url = 'http://localhost/api/auth-mvp/vedurpuls/thread') {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeGetRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/auth-mvp/vedurpuls/messages')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url.toString(), { method: 'GET' })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'uid-1', email: 'test@example.com' } } })
  mockCheckChatAccess.mockResolvedValue('allowed')
  mockAssertThreadScope.mockResolvedValue(undefined)
  mockAssertMessageScope.mockResolvedValue(undefined)
})

// ── thread POST ───────────────────────────────────────────────────────────────

describe('POST /api/auth-mvp/vedurpuls/thread', () => {
  it('returns 401 when no session', async () => {
    mockCheckChatAccess.mockResolvedValue('no-session')
    const res = await threadPost(makeRequest({ targetId: '31392' }))
    expect(res.status).toBe(401)
  })

  it('returns 503 when chat disabled', async () => {
    mockCheckChatAccess.mockResolvedValue('chat-disabled')
    const res = await threadPost(makeRequest({ targetId: '31392' }))
    expect(res.status).toBe(503)
  })

  it('returns 403 when no vedurstofan access', async () => {
    mockCheckChatAccess.mockResolvedValue('no-vedurstofan')
    const res = await threadPost(makeRequest({ targetId: '31392' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when targetId missing', async () => {
    const res = await threadPost(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 for unknown station', async () => {
    mockBuildTarget.mockReturnValue(null)
    const res = await threadPost(makeRequest({ targetId: 'notastation' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('unknown station')
  })

  it('returns 200 with ThreadDto for known station', async () => {
    mockBuildTarget.mockReturnValue(STATION_TARGET)
    mockGetOrCreate.mockResolvedValue(THREAD_DTO)
    const res = await threadPost(makeRequest({ targetId: '31392' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(VALID_UUID)
    expect(body.targetId).toBe('31392')
  })

  it('returns 500 when repository throws', async () => {
    mockBuildTarget.mockReturnValue(STATION_TARGET)
    mockGetOrCreate.mockRejectedValue(new Error('chat: getOrCreateThread failed'))
    const res = await threadPost(makeRequest({ targetId: '31392' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('thread unavailable')
  })
})

// ── messages GET ──────────────────────────────────────────────────────────────

describe('GET /api/auth-mvp/vedurpuls/messages', () => {
  it('returns 401 when no session', async () => {
    mockCheckChatAccess.mockResolvedValue('no-session')
    const res = await messagesGet(makeGetRequest({ threadId: VALID_UUID }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when threadId missing', async () => {
    const res = await messagesGet(makeGetRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when threadId is not a UUID', async () => {
    const res = await messagesGet(makeGetRequest({ threadId: 'not-a-uuid' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('UUID')
  })

  it('returns 400 when before is not a valid timestamp', async () => {
    const res = await messagesGet(makeGetRequest({ threadId: VALID_UUID, before: 'notadate' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('timestamp')
  })

  it('accepts valid ISO before cursor', async () => {
    mockListMessages.mockResolvedValue([])
    const res = await messagesGet(makeGetRequest({ threadId: VALID_UUID, before: '2026-07-15T20:00:00Z' }))
    expect(res.status).toBe(200)
  })

  it('returns 200 with message list', async () => {
    mockListMessages.mockResolvedValue([MESSAGE_DTO])
    const res = await messagesGet(makeGetRequest({ threadId: VALID_UUID }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe(VALID_UUID_2)
  })

  it('clamps limit to 100', async () => {
    mockListMessages.mockResolvedValue([])
    await messagesGet(makeGetRequest({ threadId: VALID_UUID, limit: '9999' }))
    expect(mockListMessages).toHaveBeenCalledWith(VALID_UUID, expect.objectContaining({ limit: 100 }))
  })

  it('returns 404 when threadId is out of scope', async () => {
    mockAssertThreadScope.mockRejectedValue(new Error('chat: not found'))
    const res = await messagesGet(makeGetRequest({ threadId: VALID_UUID }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('not found')
  })

  it('returns 500 when scope check fails with a DB error', async () => {
    mockAssertThreadScope.mockRejectedValue(new Error('chat: scope check failed'))
    const res = await messagesGet(makeGetRequest({ threadId: VALID_UUID }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('messages unavailable')
  })

  it('returns 500 when repository throws', async () => {
    mockListMessages.mockRejectedValue(new Error('chat: listMessages failed'))
    const res = await messagesGet(makeGetRequest({ threadId: VALID_UUID }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('messages unavailable')
  })
})

// ── messages POST ─────────────────────────────────────────────────────────────

describe('POST /api/auth-mvp/vedurpuls/messages', () => {
  const url = 'http://localhost/api/auth-mvp/vedurpuls/messages'

  it('returns 401 when no session', async () => {
    mockCheckChatAccess.mockResolvedValue('no-session')
    const res = await messagesPost(makeRequest({ threadId: VALID_UUID, body: 'hi' }, 'POST', url))
    expect(res.status).toBe(401)
  })

  it('returns 400 when threadId is not a UUID', async () => {
    const res = await messagesPost(makeRequest({ threadId: 'not-a-uuid', body: 'hi' }, 'POST', url))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('UUID')
  })

  it('returns 400 when body is empty', async () => {
    const res = await messagesPost(makeRequest({ threadId: VALID_UUID, body: '   ' }, 'POST', url))
    expect(res.status).toBe(400)
  })

  it('returns 400 when body exceeds 1000 chars', async () => {
    const res = await messagesPost(makeRequest({ threadId: VALID_UUID, body: 'x'.repeat(1001) }, 'POST', url))
    expect(res.status).toBe(400)
  })

  it('returns 201 with MessageDto on success', async () => {
    mockPostMessage.mockResolvedValue(MESSAGE_DTO)
    const res = await messagesPost(makeRequest({ threadId: VALID_UUID, body: 'Kalt og vindasamt' }, 'POST', url))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe(VALID_UUID_2)
  })

  it('defaults messageKind to chat when omitted', async () => {
    mockPostMessage.mockResolvedValue(MESSAGE_DTO)
    await messagesPost(makeRequest({ threadId: VALID_UUID, body: 'test' }, 'POST', url))
    expect(mockPostMessage).toHaveBeenCalledWith(VALID_UUID, 'uid-1', expect.objectContaining({ messageKind: 'chat' }))
  })

  it('accepts field_report kind', async () => {
    mockPostMessage.mockResolvedValue({ ...MESSAGE_DTO, messageKind: 'field_report' })
    const res = await messagesPost(makeRequest({ threadId: VALID_UUID, body: 'test', messageKind: 'field_report' }, 'POST', url))
    expect(res.status).toBe(201)
    expect(mockPostMessage).toHaveBeenCalledWith(VALID_UUID, 'uid-1', expect.objectContaining({ messageKind: 'field_report' }))
  })

  it('returns 400 for system kind — not allowed from client', async () => {
    const res = await messagesPost(makeRequest({ threadId: VALID_UUID, body: 'test', messageKind: 'system' }, 'POST', url))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid messageKind')
  })

  it('returns 400 for unknown messageKind string', async () => {
    const res = await messagesPost(makeRequest({ threadId: VALID_UUID, body: 'test', messageKind: 'hack' }, 'POST', url))
    expect(res.status).toBe(400)
  })

  it('returns 404 when threadId is out of scope', async () => {
    mockAssertThreadScope.mockRejectedValue(new Error('chat: not found'))
    const res = await messagesPost(makeRequest({ threadId: VALID_UUID, body: 'test' }, 'POST', url))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('not found')
  })

  it('returns 500 when repository throws', async () => {
    mockPostMessage.mockRejectedValue(new Error('chat: postMessage failed'))
    const res = await messagesPost(makeRequest({ threadId: VALID_UUID, body: 'test' }, 'POST', url))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('message send failed')
  })
})

// ── read POST ─────────────────────────────────────────────────────────────────

describe('POST /api/auth-mvp/vedurpuls/read', () => {
  const url = 'http://localhost/api/auth-mvp/vedurpuls/read'

  it('returns 401 when no session', async () => {
    mockCheckChatAccess.mockResolvedValue('no-session')
    const res = await readPost(makeRequest({ threadId: VALID_UUID }, 'POST', url))
    expect(res.status).toBe(401)
  })

  it('returns 400 when threadId missing', async () => {
    const res = await readPost(makeRequest({}, 'POST', url))
    expect(res.status).toBe(400)
  })

  it('returns 400 when threadId is not a UUID', async () => {
    const res = await readPost(makeRequest({ threadId: 'not-a-uuid' }, 'POST', url))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('UUID')
  })

  it('returns 200 on success (threadId only — no message ID needed)', async () => {
    mockMarkThreadRead.mockResolvedValue(undefined)
    const res = await readPost(makeRequest({ threadId: VALID_UUID }, 'POST', url))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(mockMarkThreadRead).toHaveBeenCalledWith(VALID_UUID, 'uid-1')
  })

  it('returns 404 when threadId is out of scope', async () => {
    mockAssertThreadScope.mockRejectedValue(new Error('chat: not found'))
    const res = await readPost(makeRequest({ threadId: VALID_UUID }, 'POST', url))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('not found')
  })

  it('returns 500 when repository throws', async () => {
    mockMarkThreadRead.mockRejectedValue(new Error('chat: markRead failed'))
    const res = await readPost(makeRequest({ threadId: VALID_UUID }, 'POST', url))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('mark read failed')
  })
})

// ── report POST ───────────────────────────────────────────────────────────────

describe('POST /api/auth-mvp/vedurpuls/report', () => {
  const url = 'http://localhost/api/auth-mvp/vedurpuls/report'

  it('returns 401 when no session', async () => {
    mockCheckChatAccess.mockResolvedValue('no-session')
    const res = await reportPost(makeRequest({ messageId: VALID_UUID, reason: 'spam' }, 'POST', url))
    expect(res.status).toBe(401)
  })

  it('returns 400 when messageId missing', async () => {
    const res = await reportPost(makeRequest({ reason: 'spam' }, 'POST', url))
    expect(res.status).toBe(400)
  })

  it('returns 400 when messageId is not a UUID', async () => {
    const res = await reportPost(makeRequest({ messageId: 'not-a-uuid', reason: 'spam' }, 'POST', url))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('UUID')
  })

  it('returns 400 when reason is empty', async () => {
    const res = await reportPost(makeRequest({ messageId: VALID_UUID, reason: '  ' }, 'POST', url))
    expect(res.status).toBe(400)
  })

  it('returns 400 when reason exceeds 100 chars', async () => {
    const res = await reportPost(makeRequest({ messageId: VALID_UUID, reason: 'x'.repeat(101) }, 'POST', url))
    expect(res.status).toBe(400)
  })

  it('returns 400 when body exceeds 1000 chars', async () => {
    const res = await reportPost(makeRequest({ messageId: VALID_UUID, reason: 'spam', body: 'x'.repeat(1001) }, 'POST', url))
    expect(res.status).toBe(400)
  })

  it('returns 404 when messageId is out of scope', async () => {
    mockAssertMessageScope.mockRejectedValue(new Error('chat: not found'))
    const res = await reportPost(makeRequest({ messageId: VALID_UUID, reason: 'spam' }, 'POST', url))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('not found')
  })

  it('returns 201 on successful report', async () => {
    mockReportMessage.mockResolvedValue(undefined)
    const res = await reportPost(makeRequest({ messageId: VALID_UUID, reason: 'spam' }, 'POST', url))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('trims reason before passing to repository', async () => {
    mockReportMessage.mockResolvedValue(undefined)
    await reportPost(makeRequest({ messageId: VALID_UUID, reason: '  spam  ' }, 'POST', url))
    expect(mockReportMessage).toHaveBeenCalledWith(VALID_UUID, 'uid-1', expect.objectContaining({ reason: 'spam' }))
  })

  it('returns 200 with alreadyReported when duplicate', async () => {
    mockReportMessage.mockRejectedValue(new Error('chat: already reported'))
    const res = await reportPost(makeRequest({ messageId: VALID_UUID, reason: 'spam' }, 'POST', url))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.alreadyReported).toBe(true)
  })

  it('returns 500 on unexpected repository error', async () => {
    mockReportMessage.mockRejectedValue(new Error('DB error'))
    const res = await reportPost(makeRequest({ messageId: VALID_UUID, reason: 'spam' }, 'POST', url))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('report failed')
  })
})
