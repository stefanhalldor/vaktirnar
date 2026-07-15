import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// ── Admin mock ────────────────────────────────────────────────────────────────

const mockFrom = vi.fn()
const mockAdmin = { from: mockFrom }

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: () => mockAdmin,
}))

import {
  getOrCreateThread,
  listMessages,
  postMessage,
  markRead,
  reportMessage,
} from '@/lib/chat/repository.server'
import type { CreateMessageInput, ReportMessageInput } from '@/lib/chat/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    upsert: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    lt: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    then: vi.fn().mockReturnThis(),
    catch: vi.fn().mockResolvedValue({}),
    ...overrides,
  }
  return chain
}

const THREAD_ROW = {
  id: 'thread-1',
  domain: 'weather',
  target_type: 'vedurstofan_station',
  target_id: '31392',
  target_name: 'Hellisheiði',
  lat: 64.0,
  lon: -21.4,
  last_message_at: null,
  message_count: 0,
}

const MESSAGE_ROW = {
  id: 'msg-1',
  thread_id: 'thread-1',
  body: 'Vindur er sterkur hér',
  message_kind: 'chat',
  created_at: '2026-07-15T18:00:00Z',
  deleted_at: null,
  hidden_at: null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── getOrCreateThread ─────────────────────────────────────────────────────────

const TARGET = {
  domain: 'weather' as const,
  targetType: 'vedurstofan_station' as const,
  targetId: '31392',
  targetName: 'Hellisheiði',
}

describe('getOrCreateThread', () => {
  it('returns existing ThreadDto when thread already exists (maybeSingle select-first path)', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: THREAD_ROW, error: null })
    const chain = makeChain({ maybeSingle: maybeSingleFn })
    mockFrom.mockReturnValue(chain)

    const dto = await getOrCreateThread({ ...TARGET, provider: 'vedurstofan', lat: 64.0, lon: -21.4 })

    expect(dto.id).toBe('thread-1')
    expect(dto.targetId).toBe('31392')
    expect(dto.messageCount).toBe(0)
    // Only the initial maybeSingle select was needed — no insert
    expect(maybeSingleFn).toHaveBeenCalledTimes(1)
  })

  it('inserts and returns new ThreadDto when maybeSingle returns not-found (null, null)', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: null, error: null })  // not found
    const singleFn = vi.fn().mockResolvedValue({ data: THREAD_ROW, error: null }) // insert success
    const chain = makeChain({ maybeSingle: maybeSingleFn, single: singleFn })
    mockFrom.mockReturnValue(chain)

    const dto = await getOrCreateThread(TARGET)

    expect(dto.id).toBe('thread-1')
    expect(maybeSingleFn).toHaveBeenCalledTimes(1)
    expect(singleFn).toHaveBeenCalledTimes(1)
  })

  it('handles race condition (23505 unique conflict) by re-selecting with maybeSingle', async () => {
    const maybeSingleFn = vi.fn()
      .mockResolvedValueOnce({ data: null, error: null })           // first select: not found
      .mockResolvedValueOnce({ data: THREAD_ROW, error: null })     // re-select after conflict: found
    const singleFn = vi.fn()
      .mockResolvedValue({ data: null, error: { code: '23505', message: 'unique' } })  // insert: conflict
    const chain = makeChain({ maybeSingle: maybeSingleFn, single: singleFn })
    mockFrom.mockReturnValue(chain)

    const dto = await getOrCreateThread(TARGET)

    expect(dto.id).toBe('thread-1')
    expect(maybeSingleFn).toHaveBeenCalledTimes(2)
    expect(singleFn).toHaveBeenCalledTimes(1)
  })

  it('does not reset message_count — existing thread preserves its count', async () => {
    const threadWithMessages = { ...THREAD_ROW, message_count: 5 }
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: threadWithMessages, error: null })
    const chain = makeChain({ maybeSingle: maybeSingleFn })
    mockFrom.mockReturnValue(chain)

    const dto = await getOrCreateThread(TARGET)

    expect(dto.messageCount).toBe(5)
    expect(maybeSingleFn).toHaveBeenCalledTimes(1)
  })

  it('throws when first select returns a genuine DB error (not a no-row condition)', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    const chain = makeChain({ maybeSingle: maybeSingleFn })
    mockFrom.mockReturnValue(chain)
    await expect(getOrCreateThread(TARGET)).rejects.toThrow('chat: getOrCreateThread failed')
  })

  it('throws when insert fails with non-23505 error', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: null, error: null })
    const singleFn = vi.fn().mockResolvedValue({ data: null, error: { code: '42000', message: 'DB error' } })
    const chain = makeChain({ maybeSingle: maybeSingleFn, single: singleFn })
    mockFrom.mockReturnValue(chain)
    await expect(getOrCreateThread(TARGET)).rejects.toThrow('chat: getOrCreateThread failed')
  })
})

// ── listMessages ──────────────────────────────────────────────────────────────

describe('listMessages', () => {
  it('returns message DTOs', async () => {
    const chain = makeChain({ limit: vi.fn().mockResolvedValue({ data: [MESSAGE_ROW], error: null }) })
    mockFrom.mockReturnValue(chain)

    const msgs = await listMessages('thread-1')
    expect(msgs).toHaveLength(1)
    expect(msgs[0].body).toBe('Vindur er sterkur hér')
    expect(msgs[0].isDeleted).toBe(false)
    expect(msgs[0].isHidden).toBe(false)
  })

  it('redacts body of deleted message', async () => {
    const deleted = { ...MESSAGE_ROW, deleted_at: '2026-07-15T19:00:00Z' }
    const chain = makeChain({ limit: vi.fn().mockResolvedValue({ data: [deleted], error: null }) })
    mockFrom.mockReturnValue(chain)

    const msgs = await listMessages('thread-1')
    expect(msgs[0].body).toBe('')
    expect(msgs[0].isDeleted).toBe(true)
  })

  it('redacts body of hidden message', async () => {
    const hidden = { ...MESSAGE_ROW, hidden_at: '2026-07-15T19:00:00Z' }
    const chain = makeChain({ limit: vi.fn().mockResolvedValue({ data: [hidden], error: null }) })
    mockFrom.mockReturnValue(chain)

    const msgs = await listMessages('thread-1')
    expect(msgs[0].body).toBe('')
    expect(msgs[0].isHidden).toBe(true)
  })

  it('returns empty array on no messages', async () => {
    const chain = makeChain({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })
    mockFrom.mockReturnValue(chain)
    expect(await listMessages('thread-1')).toEqual([])
  })
})

// ── postMessage ───────────────────────────────────────────────────────────────

describe('postMessage', () => {
  it('returns message DTO on success', async () => {
    const chain = makeChain({ single: vi.fn().mockResolvedValue({ data: MESSAGE_ROW, error: null }) })
    mockFrom.mockReturnValue(chain)

    const input: CreateMessageInput = { body: 'Vindur er sterkur hér', messageKind: 'chat' }
    const dto = await postMessage('thread-1', 'user-1', input)
    expect(dto.id).toBe('msg-1')
    expect(dto.body).toBe('Vindur er sterkur hér')
  })

  it('throws on insert error', async () => {
    const chain = makeChain({ single: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }) })
    mockFrom.mockReturnValue(chain)
    await expect(postMessage('thread-1', 'user-1', { body: 'test', messageKind: 'chat' }))
      .rejects.toThrow('chat: postMessage failed')
  })
})

// ── markRead ──────────────────────────────────────────────────────────────────

describe('markRead', () => {
  it('resolves without error on success', async () => {
    const chain = makeChain({ upsert: vi.fn().mockResolvedValue({ error: null }) })
    mockFrom.mockReturnValue(chain)
    await expect(markRead('thread-1', 'user-1', 'msg-1')).resolves.toBeUndefined()
  })

  it('throws on upsert error', async () => {
    const chain = makeChain({ upsert: vi.fn().mockResolvedValue({ error: { message: 'fail' } }) })
    mockFrom.mockReturnValue(chain)
    await expect(markRead('thread-1', 'user-1', 'msg-1')).rejects.toThrow('chat: markRead failed')
  })
})

// ── reportMessage ─────────────────────────────────────────────────────────────

describe('reportMessage', () => {
  it('resolves without error on success', async () => {
    const chain = makeChain({ insert: vi.fn().mockResolvedValue({ error: null }) })
    mockFrom.mockReturnValue(chain)
    const input: ReportMessageInput = { reason: 'spam' }
    await expect(reportMessage('msg-1', 'user-1', input)).resolves.toBeUndefined()
  })

  it('throws "already reported" on unique constraint violation', async () => {
    const chain = makeChain({ insert: vi.fn().mockResolvedValue({ error: { code: '23505', message: 'unique' } }) })
    mockFrom.mockReturnValue(chain)
    await expect(reportMessage('msg-1', 'user-1', { reason: 'spam' }))
      .rejects.toThrow('chat: already reported')
  })

  it('throws generic error on other DB failure', async () => {
    const chain = makeChain({ insert: vi.fn().mockResolvedValue({ error: { code: '42000', message: 'fail' } }) })
    mockFrom.mockReturnValue(chain)
    await expect(reportMessage('msg-1', 'user-1', { reason: 'spam' }))
      .rejects.toThrow('chat: reportMessage failed')
  })
})
