/**
 * Tests for POST /api/teskeid/weather/vedurpuls/route-preview
 *
 * Covers: AUTH_MVP_ENABLED flag, WEATHER_ENABLED mode access (off/all/authenticated),
 * anonymous vs signed-in access, station validation, count cap, and happy-path response.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetPreviewMessages } = vi.hoisted(() => ({ mockGetPreviewMessages: vi.fn() }))
const { mockGetWeatherEnabledMode } = vi.hoisted(() => ({ mockGetWeatherEnabledMode: vi.fn() }))
const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/chat/repository.server', () => ({
  getPreviewMessagesForStations: mockGetPreviewMessages,
}))

vi.mock('@/lib/weather/weatherBaseAccess.server', () => ({
  getWeatherEnabledMode: mockGetWeatherEnabledMode,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

// Registry mock: expose two known station IDs for validation tests
vi.mock('@/lib/weather/providers/vedurstofanStationsRegistry', () => ({
  VEDURSTOFAN_STATIONS_REGISTRY: [
    { stationId: '31392' },
    { stationId: '1395' },
    { stationId: null }, // null entries are filtered out
  ],
}))

import { POST } from '@/app/api/teskeid/weather/vedurpuls/route-preview/route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/teskeid/weather/vedurpuls/route-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_BODY = { stationIds: ['31392', '1395'], limitPerStation: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
  mockGetWeatherEnabledMode.mockReturnValue('all')
  mockGetUser.mockResolvedValue({ data: { user: null } })
  mockGetPreviewMessages.mockResolvedValue(new Map())
})

// ── Feature flags ──────────────────────────────────────────────────────────────

describe('POST /api/teskeid/weather/vedurpuls/route-preview - feature flags', () => {
  it('returns 404 when AUTH_MVP_ENABLED is not true', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(404)
  })

  it('returns 404 when AUTH_MVP_ENABLED is missing', async () => {
    delete process.env.AUTH_MVP_ENABLED
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(404)
  })

  it('returns 404 when WEATHER_ENABLED is off', async () => {
    mockGetWeatherEnabledMode.mockReturnValue('off')
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(404)
  })
})

// ── Access control ─────────────────────────────────────────────────────────────

describe('POST /api/teskeid/weather/vedurpuls/route-preview - access control', () => {
  it('mode=all + anonymous → 200', async () => {
    mockGetWeatherEnabledMode.mockReturnValue('all')
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(200)
  })

  it('mode=authenticated + no session → 401', async () => {
    mockGetWeatherEnabledMode.mockReturnValue('authenticated')
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(401)
    expect(mockGetPreviewMessages).not.toHaveBeenCalled()
  })

  it('mode=authenticated + signed-in → 200', async () => {
    mockGetWeatherEnabledMode.mockReturnValue('authenticated')
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(200)
    expect(mockGetPreviewMessages).toHaveBeenCalled()
  })
})

// ── Input validation ───────────────────────────────────────────────────────────

describe('POST /api/teskeid/weather/vedurpuls/route-preview - input validation', () => {
  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/teskeid/weather/vedurpuls/route-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when stationIds is missing', async () => {
    const res = await POST(makeReq({ limitPerStation: 1 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when stationIds is empty', async () => {
    const res = await POST(makeReq({ stationIds: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when stationIds contains non-strings', async () => {
    const res = await POST(makeReq({ stationIds: [31392] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for unknown station IDs', async () => {
    const res = await POST(makeReq({ stationIds: ['unknown-999'] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.unknownIds).toContain('unknown-999')
  })

  it('returns 400 when stationIds exceeds MAX_STATION_IDS (40)', async () => {
    // 41 copies of a known stationId
    const stationIds = Array(41).fill('31392')
    const res = await POST(makeReq({ stationIds }))
    expect(res.status).toBe(400)
  })
})

// ── Happy path ────────────────────────────────────────────────────────────────

describe('POST /api/teskeid/weather/vedurpuls/route-preview - happy path', () => {
  it('returns stations array with messages from repository', async () => {
    const msg = {
      id: 'msg-1', threadId: 't1', body: 'Ice on road', messageKind: 'field_report',
      createdAt: '2026-07-17T10:00:00Z', isDeleted: false, isHidden: false, authorName: null,
    }
    mockGetPreviewMessages.mockResolvedValue(new Map([['31392', [msg]]]))

    const res = await POST(makeReq({ stationIds: ['31392'], limitPerStation: 1 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stations).toHaveLength(1)
    expect(body.stations[0].stationId).toBe('31392')
    expect(body.stations[0].messages).toHaveLength(1)
    expect(body.stations[0].messages[0].body).toBe('Ice on road')
  })

  it('returns empty messages for stations with no reports', async () => {
    mockGetPreviewMessages.mockResolvedValue(new Map())
    const res = await POST(makeReq({ stationIds: ['31392'] }))
    const body = await res.json()
    expect(body.stations[0].messages).toEqual([])
  })
})
