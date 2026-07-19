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
  markThreadRead,
  reportMessage,
  assertThreadScope,
  assertMessageScope,
  getFeedMessages,
  getPreviewMessages,
  getLatestConditionFeedPreviews,
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
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    lt: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
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
  it('returns message DTOs ordered oldest-first for display', async () => {
    const older = { ...MESSAGE_ROW, id: 'msg-1', created_at: '2026-07-15T17:00:00Z' }
    const newer = { ...MESSAGE_ROW, id: 'msg-2', created_at: '2026-07-15T18:00:00Z' }
    // DB returns newest-first; listMessages should reverse for display
    const chain = makeChain({ limit: vi.fn().mockResolvedValue({ data: [newer, older], error: null }) })
    mockFrom.mockReturnValue(chain)

    const msgs = await listMessages('thread-1')
    expect(msgs).toHaveLength(2)
    expect(msgs[0].id).toBe('msg-1') // older first
    expect(msgs[1].id).toBe('msg-2') // newer second
  })

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

// ── markThreadRead ────────────────────────────────────────────────────────────

describe('markThreadRead', () => {
  it('upserts with null last_read_message_id and a last_read_at timestamp', async () => {
    const upsertFn = vi.fn().mockResolvedValue({ error: null })
    const chain = makeChain({ upsert: upsertFn })
    mockFrom.mockReturnValue(chain)

    await expect(markThreadRead('thread-1', 'user-1')).resolves.toBeUndefined()

    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        thread_id: 'thread-1',
        user_id: 'user-1',
        last_read_message_id: null,
        last_read_at: expect.any(String),
      })
    )
  })

  it('throws on upsert error', async () => {
    const chain = makeChain({ upsert: vi.fn().mockResolvedValue({ error: { message: 'fail' } }) })
    mockFrom.mockReturnValue(chain)
    await expect(markThreadRead('thread-1', 'user-1')).rejects.toThrow('chat: markRead failed')
  })
})

// ── assertThreadScope ─────────────────────────────────────────────────────────

const SCOPE = { domain: 'weather', targetType: 'vedurstofan_station' }

describe('assertThreadScope', () => {
  it('resolves when thread exists and matches scope', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: { id: 'thread-1' }, error: null })
    const chain = makeChain({ maybeSingle: maybeSingleFn })
    mockFrom.mockReturnValue(chain)

    await expect(assertThreadScope('thread-1', SCOPE)).resolves.toBeUndefined()
  })

  it('throws "chat: not found" when thread does not exist', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: null, error: null })
    const chain = makeChain({ maybeSingle: maybeSingleFn })
    mockFrom.mockReturnValue(chain)

    await expect(assertThreadScope('thread-1', SCOPE)).rejects.toThrow('chat: not found')
  })

  it('throws "chat: not found" when thread is in a different domain/targetType', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: null, error: null })
    const chain = makeChain({ maybeSingle: maybeSingleFn })
    mockFrom.mockReturnValue(chain)

    await expect(assertThreadScope('thread-1', { domain: 'other', targetType: 'other_type' }))
      .rejects.toThrow('chat: not found')
  })

  it('throws "chat: scope check failed" on Supabase error', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    const chain = makeChain({ maybeSingle: maybeSingleFn })
    mockFrom.mockReturnValue(chain)

    await expect(assertThreadScope('thread-1', SCOPE)).rejects.toThrow('chat: scope check failed')
  })
})

// ── assertMessageScope ────────────────────────────────────────────────────────

describe('assertMessageScope', () => {
  it('resolves when message exists and its thread matches scope', async () => {
    const maybeSingleFn = vi.fn()
      .mockResolvedValueOnce({ data: { thread_id: 'thread-1' }, error: null }) // message lookup
      .mockResolvedValueOnce({ data: { id: 'thread-1' }, error: null })         // thread scope check
    const chain = makeChain({ maybeSingle: maybeSingleFn })
    mockFrom.mockReturnValue(chain)

    await expect(assertMessageScope('msg-1', SCOPE)).resolves.toBeUndefined()
  })

  it('throws "chat: not found" when message does not exist', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: null, error: null })
    const chain = makeChain({ maybeSingle: maybeSingleFn })
    mockFrom.mockReturnValue(chain)

    await expect(assertMessageScope('msg-1', SCOPE)).rejects.toThrow('chat: not found')
  })

  it('throws "chat: not found" when message thread is out of scope', async () => {
    const maybeSingleFn = vi.fn()
      .mockResolvedValueOnce({ data: { thread_id: 'thread-1' }, error: null }) // message found
      .mockResolvedValueOnce({ data: null, error: null })                       // thread scope mismatch
    const chain = makeChain({ maybeSingle: maybeSingleFn })
    mockFrom.mockReturnValue(chain)

    await expect(assertMessageScope('msg-1', SCOPE)).rejects.toThrow('chat: not found')
  })

  it('throws "chat: scope check failed" on Supabase error during message lookup', async () => {
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    const chain = makeChain({ maybeSingle: maybeSingleFn })
    mockFrom.mockReturnValue(chain)

    await expect(assertMessageScope('msg-1', SCOPE)).rejects.toThrow('chat: scope check failed')
  })

  it('throws "chat: scope check failed" on Supabase error during thread lookup', async () => {
    const maybeSingleFn = vi.fn()
      .mockResolvedValueOnce({ data: { thread_id: 'thread-1' }, error: null })                     // message found
      .mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied' } }) // thread lookup error
    const chain = makeChain({ maybeSingle: maybeSingleFn })
    mockFrom.mockReturnValue(chain)

    await expect(assertMessageScope('msg-1', SCOPE)).rejects.toThrow('chat: scope check failed')
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

// ── getFeedMessages ───────────────────────────────────────────────────────────

const THREAD_ROW_FEED = {
  id: 'thread-1',
  domain: 'weather',
  target_type: 'vedurstofan_station',
  target_id: '31392',
  target_name: 'Hellisheiði',
  provider: 'vedurstofan',
}

const MESSAGE_ROW_FEED = {
  id: 'msg-1',
  thread_id: 'thread-1',
  body: 'Hvass vindur',
  message_kind: 'chat',
  created_at: '2026-07-15T21:00:00Z',
  deleted_at: null,
  hidden_at: null,
}

describe('getFeedMessages', () => {
  it('returns FeedMessageDto with target metadata', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({
        // threads query: select().eq().in() resolves directly
        in: vi.fn().mockResolvedValue({ data: [THREAD_ROW_FEED], error: null }),
      }))
      .mockReturnValueOnce(makeChain({
        // messages query: select().in().order().limit() resolves
        limit: vi.fn().mockResolvedValue({ data: [MESSAGE_ROW_FEED], error: null }),
      }))

    const results = await getFeedMessages({ domain: 'weather', targetTypes: ['vedurstofan_station'] })

    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('msg-1')
    expect(results[0].body).toBe('Hvass vindur')
    expect(results[0].target.targetName).toBe('Hellisheiði')
    expect(results[0].target.targetId).toBe('31392')
    expect(results[0].target.domain).toBe('weather')
  })

  it('returns empty array when no threads match scope', async () => {
    mockFrom.mockReturnValueOnce(makeChain({
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    }))

    const results = await getFeedMessages({ domain: 'weather', targetTypes: ['vedurstofan_station'] })
    expect(results).toEqual([])
  })

  it('redacts body of deleted message', async () => {
    const deleted = { ...MESSAGE_ROW_FEED, deleted_at: '2026-07-15T22:00:00Z' }
    mockFrom
      .mockReturnValueOnce(makeChain({
        in: vi.fn().mockResolvedValue({ data: [THREAD_ROW_FEED], error: null }),
      }))
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [deleted], error: null }),
      }))

    const results = await getFeedMessages({ domain: 'weather', targetTypes: ['vedurstofan_station'] })
    expect(results[0].body).toBe('')
    expect(results[0].isDeleted).toBe(true)
  })

  it('throws when thread query fails', async () => {
    mockFrom.mockReturnValueOnce(makeChain({
      in: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    }))

    await expect(getFeedMessages({ domain: 'weather', targetTypes: ['vedurstofan_station'] }))
      .rejects.toThrow('chat: getFeedMessages failed')
  })

  it('orders messages newest-first (ascending: false)', async () => {
    const orderFn = vi.fn().mockReturnThis()
    mockFrom
      .mockReturnValueOnce(makeChain({
        in: vi.fn().mockResolvedValue({ data: [THREAD_ROW_FEED], error: null }),
      }))
      .mockReturnValueOnce(makeChain({
        order: orderFn,
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }))

    await getFeedMessages({ domain: 'weather', targetTypes: ['vedurstofan_station'] })

    expect(orderFn).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('throws when messages query fails', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({
        in: vi.fn().mockResolvedValue({ data: [THREAD_ROW_FEED], error: null }),
      }))
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      }))

    await expect(getFeedMessages({ domain: 'weather', targetTypes: ['vedurstofan_station'] }))
      .rejects.toThrow('chat: getFeedMessages failed')
  })

  it('returns first-name-only authorName (regression: full display_name must not leak)', async () => {
    const msgWithUser = { ...MESSAGE_ROW_FEED, user_id: 'user-1' }
    mockFrom
      .mockReturnValueOnce(makeChain({
        in: vi.fn().mockResolvedValue({ data: [THREAD_ROW_FEED], error: null }),
      }))
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [msgWithUser], error: null }),
      }))
      .mockReturnValueOnce(makeChain({
        in: vi.fn().mockResolvedValue({
          data: [{ id: 'user-1', display_name: 'Stefan Halldor Jonsson' }],
          error: null,
        }),
      }))

    const results = await getFeedMessages({ domain: 'weather', targetTypes: ['vedurstofan_station'] })
    expect(results[0].authorName).toBe('Stefan')
  })
})

// ── getPreviewMessages ────────────────────────────────────────────────────────

const PREVIEW_TARGET = {
  domain: 'weather',
  targetType: 'vedurstofan_station',
  targetId: '31392',
}

describe('getPreviewMessages', () => {
  it('returns [] when no thread exists', async () => {
    mockFrom.mockReturnValueOnce(makeChain({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }))
    const results = await getPreviewMessages(PREVIEW_TARGET, 3)
    expect(results).toEqual([])
  })

  it('returns visible messages when thread exists', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'thread-1' }, error: null }),
      }))
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [MESSAGE_ROW], error: null }),
      }))
    const results = await getPreviewMessages(PREVIEW_TARGET, 3)
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('msg-1')
    expect(results[0].body).toBe('Vindur er sterkur hér')
  })

  it('returns first-name-only authorName', async () => {
    const msgWithUser = { ...MESSAGE_ROW, user_id: 'user-1' }
    mockFrom
      .mockReturnValueOnce(makeChain({
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'thread-1' }, error: null }),
      }))
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [msgWithUser], error: null }),
      }))
      .mockReturnValueOnce(makeChain({
        in: vi.fn().mockResolvedValue({
          data: [{ id: 'user-1', display_name: 'Jón Sigurðsson' }],
          error: null,
        }),
      }))
    const results = await getPreviewMessages(PREVIEW_TARGET, 3)
    expect(results[0].authorName).toBe('Jón')
  })

  it('throws when thread query fails', async () => {
    mockFrom.mockReturnValueOnce(makeChain({
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    }))
    await expect(getPreviewMessages(PREVIEW_TARGET, 3)).rejects.toThrow('chat: getPreviewMessages failed')
  })
})

// ── getLatestConditionFeedPreviews ─────────────────────────────────────────

const THREAD_A = { id: 'thread-a', target_id: '1111', target_name: 'Hellisheiði', target_type: 'vedurstofan_station', provider: 'vedurstofan' }
const THREAD_B = { id: 'thread-b', target_id: '2222', target_name: 'Akureyri', target_type: 'vedurstofan_station', provider: null }
const MSG_A = { ...MESSAGE_ROW, id: 'msg-a', thread_id: 'thread-a', created_at: '2026-07-17T10:00:00Z' }
const MSG_B = { ...MESSAGE_ROW, id: 'msg-b', thread_id: 'thread-b', created_at: '2026-07-17T09:00:00Z' }

describe('getLatestConditionFeedPreviews', () => {
  it('returns [] when no threads exist', async () => {
    mockFrom.mockReturnValueOnce(makeChain({
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }))
    const result = await getLatestConditionFeedPreviews(10)
    expect(result).toEqual([])
  })

  it('returns [] when threads query errors', async () => {
    mockFrom.mockReturnValueOnce(makeChain({
      limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    }))
    const result = await getLatestConditionFeedPreviews(10)
    expect(result).toEqual([])
  })

  it('returns one preview per station with newest station first', async () => {
    // threads query returns two threads ordered newest-first.
    // MSG_A and MSG_B have no user_id, so fetchProfileMap([]) exits early — no 'profiles' mock needed.
    mockFrom
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [THREAD_A, THREAD_B], error: null }),
      }))
      // getThreadPreviewMessages for thread-a (MSG_A is newer)
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [MSG_A], error: null }),
      }))
      // getThreadPreviewMessages for thread-b
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [MSG_B], error: null }),
      }))

    const result = await getLatestConditionFeedPreviews(10)
    expect(result).toHaveLength(2)
    // newest station (A) first
    expect(result[0].targetId).toBe('1111')
    expect(result[0].targetName).toBe('Hellisheiði')
    expect(result[0].targetType).toBe('vedurstofan_station')
    expect(result[0].provider).toBe('vedurstofan')
    expect(result[0].latestMessage.id).toBe('msg-a')
    expect(result[0].latestAt).toBe('2026-07-17T10:00:00Z')
    expect(result[1].targetId).toBe('2222')
    expect(result[1].provider).toBeNull()
  })

  it('skips stations where all messages are deleted/hidden (no visible message)', async () => {
    // thread-a has no visible messages; thread-b has one.
    // MSG_B has no user_id, so no profiles mock needed.
    mockFrom
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [THREAD_A, THREAD_B], error: null }),
      }))
      // thread-a: no visible messages
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      }))
      // thread-b: one visible message
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [MSG_B], error: null }),
      }))

    const result = await getLatestConditionFeedPreviews(10)
    expect(result).toHaveLength(1)
    expect(result[0].targetId).toBe('2222')
  })

  it('respects limitItems cap', async () => {
    // Three threads, but limit is 2.
    // None of the messages have user_id, so no profiles mocks needed.
    const THREAD_C = { id: 'thread-c', target_id: '3333', target_name: 'Ísafjörður' }
    const MSG_C = { ...MESSAGE_ROW, id: 'msg-c', thread_id: 'thread-c', created_at: '2026-07-17T08:00:00Z' }
    mockFrom
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [THREAD_A, THREAD_B, THREAD_C], error: null }),
      }))
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [MSG_A], error: null }),
      }))
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [MSG_B], error: null }),
      }))
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [MSG_C], error: null }),
      }))

    const result = await getLatestConditionFeedPreviews(2)
    expect(result).toHaveLength(2)
    // Should be the two newest
    expect(result[0].targetId).toBe('1111')
    expect(result[1].targetId).toBe('2222')
  })

  it('does not expose user_id — latestMessage has no userId field', async () => {
    const msgWithUser = { ...MSG_A, user_id: 'u-secret' }
    mockFrom
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [THREAD_A], error: null }),
      }))
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [msgWithUser], error: null }),
      }))
      .mockReturnValueOnce(makeChain({
        in: vi.fn().mockResolvedValue({
          data: [{ id: 'u-secret', display_name: 'Jón Gunnar' }],
          error: null,
        }),
      }))

    const result = await getLatestConditionFeedPreviews(10)
    expect(result).toHaveLength(1)
    expect(result[0].latestMessage).not.toHaveProperty('userId')
    // authorName is first-name only
    expect(result[0].latestMessage.authorName).toBe('Jón')
  })

  it('passes allowedTargetTypes to the query and returns empty when no matching threads', async () => {
    // Query returns no threads (simulating no vegagerdin_station rows yet).
    // Capture chain to assert .in() was called with the correct target types.
    const chain = makeChain({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })
    mockFrom.mockReturnValueOnce(chain)
    const result = await getLatestConditionFeedPreviews(10, ['vegagerdin_station'])
    expect(result).toEqual([])
    expect(chain.in).toHaveBeenCalledWith('target_type', ['vegagerdin_station'])
  })

  it('returns results for multiple allowed target types and passes them to the query', async () => {
    const THREAD_VG = { id: 'thread-vg', target_id: 'vg-001', target_name: 'Vegagerðin A', target_type: 'vegagerdin_station', provider: 'vegagerdin' }
    const MSG_VG = { ...MESSAGE_ROW, id: 'msg-vg', thread_id: 'thread-vg', created_at: '2026-07-17T11:00:00Z' }
    const chain = makeChain({ limit: vi.fn().mockResolvedValue({ data: [THREAD_VG, THREAD_A], error: null }) })
    mockFrom
      .mockReturnValueOnce(chain)
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [MSG_VG], error: null }),
      }))
      .mockReturnValueOnce(makeChain({
        limit: vi.fn().mockResolvedValue({ data: [MSG_A], error: null }),
      }))

    const result = await getLatestConditionFeedPreviews(10, ['vedurstofan_station', 'vegagerdin_station'])
    // Assert the query used the correct target types
    expect(chain.in).toHaveBeenCalledWith('target_type', ['vedurstofan_station', 'vegagerdin_station'])
    expect(result).toHaveLength(2)
    // vegagerdin station is newer
    expect(result[0].targetId).toBe('vg-001')
    expect(result[0].targetType).toBe('vegagerdin_station')
    expect(result[0].provider).toBe('vegagerdin')
    expect(result[1].targetId).toBe('1111')
    expect(result[1].targetType).toBe('vedurstofan_station')
  })
})
