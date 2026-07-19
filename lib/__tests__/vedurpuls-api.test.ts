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
const { mockGetThreadProvider } = vi.hoisted(() => ({ mockGetThreadProvider: vi.fn() }))
const { mockGetMessageProvider } = vi.hoisted(() => ({ mockGetMessageProvider: vi.fn() }))
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
  buildWeatherPulseTarget: mockBuildTarget,
}))

vi.mock('@/lib/chat/repository.server', () => ({
  getOrCreateThread: mockGetOrCreate,
  listMessages: mockListMessages,
  postMessage: mockPostMessage,
  markThreadRead: mockMarkThreadRead,
  reportMessage: mockReportMessage,
  // assertThreadScope and assertMessageScope are no longer called in messages/read/report routes;
  // kept in mock so tests that reference them don't import-error.
  assertThreadScope: mockAssertThreadScope,
  assertMessageScope: mockAssertMessageScope,
  getThreadProvider: mockGetThreadProvider,
  getMessageProvider: mockGetMessageProvider,
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
  // Default: treat threads as vedurstofan_station (preserves existing test behavior).
  mockGetThreadProvider.mockResolvedValue('vedurstofan')
  mockGetMessageProvider.mockResolvedValue('vedurstofan')
})

// ── thread POST ───────────────────────────────────────────────────────────────

describe('POST /api/auth-mvp/vedurpuls/thread', () => {
  it('returns 401 when no session', async () => {
    mockCheckChatAccess.mockResolvedValue('no-session')
    const res = await threadPost(makeRequest({ targetId: '31392', provider: 'vedurstofan' }))
    expect(res.status).toBe(401)
  })

  it('returns 503 when chat disabled', async () => {
    mockCheckChatAccess.mockResolvedValue('chat-disabled')
    const res = await threadPost(makeRequest({ targetId: '31392', provider: 'vedurstofan' }))
    expect(res.status).toBe(503)
  })

  it('returns 403 when no vedurstofan access', async () => {
    mockCheckChatAccess.mockResolvedValue('no-vedurstofan')
    const res = await threadPost(makeRequest({ targetId: '31392', provider: 'vedurstofan' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when targetId missing', async () => {
    const res = await threadPost(makeRequest({ provider: 'vedurstofan' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when provider is omitted', async () => {
    const res = await threadPost(makeRequest({ targetId: '31392' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('provider')
  })

  it('returns 400 when provider is an unknown value', async () => {
    const res = await threadPost(makeRequest({ targetId: '31392', provider: 'unknown' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('provider')
  })

  it('returns 400 for unknown station', async () => {
    mockBuildTarget.mockResolvedValue(null)
    const res = await threadPost(makeRequest({ targetId: 'notastation', provider: 'vedurstofan' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('unknown station')
  })

  it('returns 200 with ThreadDto for known vedurstofan station', async () => {
    mockBuildTarget.mockResolvedValue(STATION_TARGET)
    mockGetOrCreate.mockResolvedValue(THREAD_DTO)
    const res = await threadPost(makeRequest({ targetId: '31392', provider: 'vedurstofan' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(VALID_UUID)
    expect(body.targetId).toBe('31392')
  })

  it('passes vedurstofan provider when specified', async () => {
    mockBuildTarget.mockResolvedValue(STATION_TARGET)
    mockGetOrCreate.mockResolvedValue(THREAD_DTO)
    await threadPost(makeRequest({ targetId: '31392', provider: 'vedurstofan' }))
    expect(mockBuildTarget).toHaveBeenCalledWith('vedurstofan', '31392')
  })

  it('passes vegagerdin provider when specified', async () => {
    const vegTarget = { ...STATION_TARGET, targetType: 'vegagerdin_station' as const, provider: 'vegagerdin' }
    mockBuildTarget.mockResolvedValue(vegTarget)
    mockGetOrCreate.mockResolvedValue({ ...THREAD_DTO, targetType: 'vegagerdin_station' })
    await threadPost(makeRequest({ targetId: 'V1234', provider: 'vegagerdin' }))
    expect(mockBuildTarget).toHaveBeenCalledWith('vegagerdin', 'V1234')
  })

  it('returns 500 when repository throws', async () => {
    mockBuildTarget.mockResolvedValue(STATION_TARGET)
    mockGetOrCreate.mockRejectedValue(new Error('chat: getOrCreateThread failed'))
    const res = await threadPost(makeRequest({ targetId: '31392', provider: 'vedurstofan' }))
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

  it('returns 404 when thread is not in weather pulse scope', async () => {
    mockGetThreadProvider.mockResolvedValue(null)
    const res = await messagesGet(makeGetRequest({ threadId: VALID_UUID }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('not found')
  })

  it('returns 404 before access check for out-of-scope thread (scope-first ordering)', async () => {
    // Even if checkChatAccess would allow, out-of-scope returns 404 first
    mockGetThreadProvider.mockResolvedValue(null)
    mockCheckChatAccess.mockResolvedValue('allowed')
    const res = await messagesGet(makeGetRequest({ threadId: VALID_UUID }))
    expect(res.status).toBe(404)
    expect(mockCheckChatAccess).not.toHaveBeenCalled()
  })

  it('returns 500 when provider lookup fails with a DB error', async () => {
    mockGetThreadProvider.mockRejectedValue(new Error('DB error'))
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

  it('returns 404 when thread is not in weather pulse scope', async () => {
    mockGetThreadProvider.mockResolvedValue(null)
    const res = await messagesPost(makeRequest({ threadId: VALID_UUID, body: 'test' }, 'POST', url))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('not found')
  })

  it('returns 404 when posting to a vedurstofan_station thread (write-scope is primary-only)', async () => {
    // POST scope uses PRIMARY_TARGET_TYPES (vegagerdin only); vedurstofan threads return null
    mockGetThreadProvider.mockResolvedValue(null)
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

  it('returns 404 when thread is not in weather pulse scope', async () => {
    mockGetThreadProvider.mockResolvedValue(null)
    const res = await readPost(makeRequest({ threadId: VALID_UUID }, 'POST', url))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('not found')
  })

  it('returns 404 before access check for out-of-scope thread', async () => {
    mockGetThreadProvider.mockResolvedValue(null)
    mockCheckChatAccess.mockResolvedValue('allowed')
    const res = await readPost(makeRequest({ threadId: VALID_UUID }, 'POST', url))
    expect(res.status).toBe(404)
    expect(mockCheckChatAccess).not.toHaveBeenCalled()
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

  it('returns 404 when message is not in weather pulse scope', async () => {
    mockGetMessageProvider.mockResolvedValue(null)
    const res = await reportPost(makeRequest({ messageId: VALID_UUID, reason: 'spam' }, 'POST', url))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('not found')
  })

  it('returns 404 before access check for out-of-scope message', async () => {
    mockGetMessageProvider.mockResolvedValue(null)
    mockCheckChatAccess.mockResolvedValue('allowed')
    const res = await reportPost(makeRequest({ messageId: VALID_UUID, reason: 'spam' }, 'POST', url))
    expect(res.status).toBe(404)
    expect(mockCheckChatAccess).not.toHaveBeenCalled()
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

// ── provider-aware access: messages GET ───────────────────────────────────────

describe('GET /api/auth-mvp/vedurpuls/messages — provider-aware access', () => {
  it('calls checkChatAccess with vegagerdin provider for vegagerdin_station thread', async () => {
    mockGetThreadProvider.mockResolvedValue('vegagerdin')
    mockListMessages.mockResolvedValue([])
    await messagesGet(makeGetRequest({ threadId: VALID_UUID }))
    expect(mockCheckChatAccess).toHaveBeenCalledWith(expect.anything(), { provider: 'vegagerdin' })
  })

  it('succeeds for vegagerdin thread when vedurstofan access is denied', async () => {
    mockGetThreadProvider.mockResolvedValue('vegagerdin')
    mockCheckChatAccess.mockImplementation(async (_user, opts) =>
      opts?.provider === 'vegagerdin' ? 'allowed' : 'no-vedurstofan'
    )
    mockListMessages.mockResolvedValue([MESSAGE_DTO])
    const res = await messagesGet(makeGetRequest({ threadId: VALID_UUID }))
    expect(res.status).toBe(200)
  })

  it('returns 403 for vedurstofan thread when vedurstofan access is denied', async () => {
    mockGetThreadProvider.mockResolvedValue('vedurstofan')
    mockCheckChatAccess.mockResolvedValue('no-vedurstofan')
    const res = await messagesGet(makeGetRequest({ threadId: VALID_UUID }))
    expect(res.status).toBe(403)
  })

  it('returns 404 when thread does not exist (provider not resolvable)', async () => {
    mockGetThreadProvider.mockResolvedValue(null)
    const res = await messagesGet(makeGetRequest({ threadId: VALID_UUID }))
    expect(res.status).toBe(404)
  })
})

// ── provider-aware access: read POST ──────────────────────────────────────────

describe('POST /api/auth-mvp/vedurpuls/read — provider-aware access', () => {
  const url = 'http://localhost/api/auth-mvp/vedurpuls/read'

  it('calls checkChatAccess with vegagerdin provider for vegagerdin_station thread', async () => {
    mockGetThreadProvider.mockResolvedValue('vegagerdin')
    mockMarkThreadRead.mockResolvedValue(undefined)
    await readPost(makeRequest({ threadId: VALID_UUID }, 'POST', url))
    expect(mockCheckChatAccess).toHaveBeenCalledWith(expect.anything(), { provider: 'vegagerdin' })
  })

  it('succeeds for vegagerdin thread when vedurstofan access is denied', async () => {
    mockGetThreadProvider.mockResolvedValue('vegagerdin')
    mockCheckChatAccess.mockImplementation(async (_user, opts) =>
      opts?.provider === 'vegagerdin' ? 'allowed' : 'no-vedurstofan'
    )
    mockMarkThreadRead.mockResolvedValue(undefined)
    const res = await readPost(makeRequest({ threadId: VALID_UUID }, 'POST', url))
    expect(res.status).toBe(200)
  })

  it('returns 404 when thread does not exist (provider not resolvable)', async () => {
    mockGetThreadProvider.mockResolvedValue(null)
    const res = await readPost(makeRequest({ threadId: VALID_UUID }, 'POST', url))
    expect(res.status).toBe(404)
  })
})

// ── provider-aware access: report POST ────────────────────────────────────────

describe('POST /api/auth-mvp/vedurpuls/report — provider-aware access', () => {
  const url = 'http://localhost/api/auth-mvp/vedurpuls/report'

  it('calls checkChatAccess with vegagerdin provider for message in vegagerdin_station thread', async () => {
    mockGetMessageProvider.mockResolvedValue('vegagerdin')
    mockReportMessage.mockResolvedValue(undefined)
    await reportPost(makeRequest({ messageId: VALID_UUID, reason: 'spam' }, 'POST', url))
    expect(mockCheckChatAccess).toHaveBeenCalledWith(expect.anything(), { provider: 'vegagerdin' })
  })

  it('succeeds for vegagerdin message when vedurstofan access is denied', async () => {
    mockGetMessageProvider.mockResolvedValue('vegagerdin')
    mockCheckChatAccess.mockImplementation(async (_user, opts) =>
      opts?.provider === 'vegagerdin' ? 'allowed' : 'no-vedurstofan'
    )
    mockReportMessage.mockResolvedValue(undefined)
    const res = await reportPost(makeRequest({ messageId: VALID_UUID, reason: 'spam' }, 'POST', url))
    expect(res.status).toBe(201)
  })

  it('returns 404 when message does not exist (provider not resolvable)', async () => {
    mockGetMessageProvider.mockResolvedValue(null)
    const res = await reportPost(makeRequest({ messageId: VALID_UUID, reason: 'spam' }, 'POST', url))
    expect(res.status).toBe(404)
  })
})
