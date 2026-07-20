import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetLatest } = vi.hoisted(() => ({ mockGetLatest: vi.fn() }))
const { mockGetWeatherEnabledMode } = vi.hoisted(() => ({ mockGetWeatherEnabledMode: vi.fn() }))
const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/chat/repository.server', () => ({
  getLatestConditionFeedPreviews: mockGetLatest,
}))

vi.mock('@/lib/weather/weatherBaseAccess.server', () => ({
  getWeatherEnabledMode: mockGetWeatherEnabledMode,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

import { GET } from '@/app/api/teskeid/weather/vedurpuls/feed-preview/route'

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeMessage(id: string, createdAt: string) {
  return {
    id,
    threadId: 'thread-1',
    body: `Report ${id}`,
    messageKind: 'field_report' as const,
    createdAt,
    isDeleted: false,
    isHidden: false,
    authorName: 'Jón',
  }
}

function makeStation(stationId: string, createdAt: string) {
  return {
    targetId: stationId,
    targetName: `Station ${stationId}`,
    targetType: 'vedurstofan_station' as const,
    provider: 'vedurstofan',
    latestMessage: makeMessage(`msg-${stationId}`, createdAt),
    latestAt: createdAt,
  }
}

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/teskeid/weather/vedurpuls/feed-preview')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new Request(url.toString()) as any
}

// ── Environment setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
  mockGetWeatherEnabledMode.mockReturnValue('all')
  mockGetLatest.mockResolvedValue([])
  // Default: anonymous user (no session)
  mockGetUser.mockResolvedValue({ data: { user: null } })
})

// ── Feature flags ─────────────────────────────────────────────────────────────

describe('GET /api/teskeid/weather/vedurpuls/feed-preview - feature flags', () => {
  it('returns 404 when AUTH_MVP_ENABLED is not true', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    const res = await GET(makeRequest())
    expect(res.status).toBe(404)
  })

  it('returns 404 when AUTH_MVP_ENABLED is missing', async () => {
    delete process.env.AUTH_MVP_ENABLED
    const res = await GET(makeRequest())
    expect(res.status).toBe(404)
  })

  it('returns 404 when WEATHER_ENABLED is off', async () => {
    mockGetWeatherEnabledMode.mockReturnValue('off')
    const res = await GET(makeRequest())
    expect(res.status).toBe(404)
  })

  it('returns 200 when mode=all — anonymous access allowed', async () => {
    mockGetWeatherEnabledMode.mockReturnValue('all')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    // Server controls allowed target types; client cannot pass arbitrary types
    expect(mockGetLatest).toHaveBeenCalledWith(10, ['vegagerdin_station', 'vedurstofan_station'])
  })

  it('returns 401 when mode=authenticated and no session', async () => {
    mockGetWeatherEnabledMode.mockReturnValue('authenticated')
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    expect(mockGetLatest).not.toHaveBeenCalled()
  })

  it('returns 200 when mode=authenticated and user is signed in', async () => {
    mockGetWeatherEnabledMode.mockReturnValue('authenticated')
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    expect(mockGetLatest).toHaveBeenCalledWith(10, ['vegagerdin_station', 'vedurstofan_station'])
  })
})

// ── Public access ─────────────────────────────────────────────────────────────

describe('GET /api/teskeid/weather/vedurpuls/feed-preview - public access', () => {
  it('returns 200 with no auth for signed-out user', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
  })

  it('returns empty items array when no threads exist', async () => {
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.items).toEqual([])
  })

  it('returns item previews newest-first when data exists', async () => {
    mockGetLatest.mockResolvedValue([
      makeStation('1111', '2026-07-17T10:00:00Z'),
      makeStation('2222', '2026-07-17T09:00:00Z'),
    ])
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.items).toHaveLength(2)
    expect(body.items[0].targetId).toBe('1111')
    expect(body.items[1].targetId).toBe('2222')
  })

  it('uses default limit of 10 when no limitItems param', async () => {
    await GET(makeRequest())
    expect(mockGetLatest).toHaveBeenCalledWith(10, ['vegagerdin_station', 'vedurstofan_station'])
  })

  it('passes limitItems param to repository', async () => {
    await GET(makeRequest({ limitItems: '5' }))
    expect(mockGetLatest).toHaveBeenCalledWith(5, ['vegagerdin_station', 'vedurstofan_station'])
  })

  it('clamps limitItems to MAX_LIMIT (25)', async () => {
    await GET(makeRequest({ limitItems: '100' }))
    expect(mockGetLatest).toHaveBeenCalledWith(25, ['vegagerdin_station', 'vedurstofan_station'])
  })

  it('falls back to default limit when limitItems is invalid', async () => {
    await GET(makeRequest({ limitItems: 'abc' }))
    expect(mockGetLatest).toHaveBeenCalledWith(10, ['vegagerdin_station', 'vedurstofan_station'])
  })
})

// ── DTO shape ─────────────────────────────────────────────────────────────────

describe('GET /api/teskeid/weather/vedurpuls/feed-preview - DTO shape', () => {
  it('returns expected ConditionFeedPreviewItemDto fields', async () => {
    mockGetLatest.mockResolvedValue([makeStation('1111', '2026-07-17T10:00:00Z')])
    const res = await GET(makeRequest())
    const body = await res.json()
    const item = body.items[0]
    expect(item).toHaveProperty('targetId', '1111')
    expect(item).toHaveProperty('targetName', 'Station 1111')
    expect(item).toHaveProperty('targetType', 'vedurstofan_station')
    expect(item).toHaveProperty('provider', 'vedurstofan')
    expect(item).toHaveProperty('latestAt', '2026-07-17T10:00:00Z')
    expect(item).toHaveProperty('latestMessage')
    expect(item.latestMessage).not.toHaveProperty('userId')
    expect(item.latestMessage).not.toHaveProperty('userEmail')
  })

  it('does not expose private user metadata in latestMessage', async () => {
    mockGetLatest.mockResolvedValue([makeStation('1111', '2026-07-17T10:00:00Z')])
    const res = await GET(makeRequest())
    const body = await res.json()
    const msg = body.items[0].latestMessage
    expect(msg).not.toHaveProperty('userId')
    expect(msg).not.toHaveProperty('userEmail')
    expect(msg).toHaveProperty('authorName', 'Jón')
  })

  it('returns 200 with empty items when repository throws', async () => {
    mockGetLatest.mockRejectedValue(new Error('DB error'))
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toEqual([])
  })
})
