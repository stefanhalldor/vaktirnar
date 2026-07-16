/**
 * Tests for GET /api/teskeid/weather/vedurpuls/stations/[stationId]/preview
 *
 * Covers: unknown station → 400, known station → 200,
 * no thread → [], repository error → [], correct target passed to repository.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockGetPreviewMessages } = vi.hoisted(() => ({ mockGetPreviewMessages: vi.fn() }))

vi.mock('@/lib/chat/repository.server', () => ({
  getPreviewMessages: mockGetPreviewMessages,
}))

vi.mock('@/lib/weather/providers/vedurstofanStationsRegistry', () => ({
  VEDURSTOFAN_STATIONS_REGISTRY: [
    { stationId: '31392', name: 'Hellisheiði' },
    { stationId: '2655', name: 'Æðey' },
  ],
}))

import { GET } from '@/app/api/teskeid/weather/vedurpuls/stations/[stationId]/preview/route'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PREVIEW_MESSAGE = {
  id: 'msg-1',
  threadId: 'thread-1',
  body: 'Vindur er sterkur á Hellisheiði',
  messageKind: 'chat',
  createdAt: '2026-07-15T22:00:00Z',
  isDeleted: false,
  isHidden: false,
  authorName: 'Jón',
}

function makeRequest(stationId: string) {
  const url = `http://localhost/api/teskeid/weather/vedurpuls/stations/${stationId}/preview`
  return new NextRequest(url)
}

function makeCtx(stationId: string) {
  return { params: Promise.resolve({ stationId }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetPreviewMessages.mockResolvedValue([])
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/teskeid/weather/vedurpuls/stations/[stationId]/preview', () => {
  it('returns 400 for unknown stationId', async () => {
    const res = await GET(makeRequest('99999'), makeCtx('99999'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('station not found')
  })

  it('does not call repository for unknown stationId', async () => {
    await GET(makeRequest('99999'), makeCtx('99999'))
    expect(mockGetPreviewMessages).not.toHaveBeenCalled()
  })

  it('returns 200 with empty array when no thread exists', async () => {
    mockGetPreviewMessages.mockResolvedValue([])
    const res = await GET(makeRequest('31392'), makeCtx('31392'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('returns 200 with preview messages for known station', async () => {
    mockGetPreviewMessages.mockResolvedValue([PREVIEW_MESSAGE])
    const res = await GET(makeRequest('31392'), makeCtx('31392'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('msg-1')
    expect(body[0].body).toBe('Vindur er sterkur á Hellisheiði')
    expect(body[0].authorName).toBe('Jón')
  })

  it('calls getPreviewMessages with correct weather/vedurstofan_station target', async () => {
    await GET(makeRequest('31392'), makeCtx('31392'))
    expect(mockGetPreviewMessages).toHaveBeenCalledWith(
      { domain: 'weather', targetType: 'vedurstofan_station', targetId: '31392' },
      3
    )
  })

  it('returns 200 with [] when repository throws', async () => {
    mockGetPreviewMessages.mockRejectedValue(new Error('db error'))
    const res = await GET(makeRequest('31392'), makeCtx('31392'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('does not expose user_id or email in preview response', async () => {
    mockGetPreviewMessages.mockResolvedValue([PREVIEW_MESSAGE])
    const res = await GET(makeRequest('31392'), makeCtx('31392'))
    const json = JSON.stringify(await res.json())
    expect(json).not.toContain('user_id')
    expect(json).not.toContain('@')
  })
})
