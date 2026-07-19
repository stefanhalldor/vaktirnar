/**
 * Tests for GET /api/teskeid/weather/vedurpuls/vegagerdin/stations/[stationId]/preview
 *
 * Covers: cache unavailable → [], unknown station → 400,
 * known station → 200 with messages, repository error → [].
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockReadCurrent } = vi.hoisted(() => ({ mockReadCurrent: vi.fn() }))
const { mockGetPreviewMessages } = vi.hoisted(() => ({ mockGetPreviewMessages: vi.fn() }))

vi.mock('@/lib/weather/providers/vegagerdinCurrent.server', () => ({
  readVegagerdinCurrentWithHistoryFallback: mockReadCurrent,
}))

vi.mock('@/lib/chat/repository.server', () => ({
  getPreviewMessages: mockGetPreviewMessages,
}))

import { GET } from '@/app/api/teskeid/weather/vedurpuls/vegagerdin/stations/[stationId]/preview/route'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STATION_ID = 'V1234'

const CACHE_PAYLOAD = {
  measurements: [
    {
      stationId: STATION_ID,
      stationName: 'Hellisheiði',
      lat: 64.03,
      lon: -21.39,
      meanWindMs: 8.2,
      gustLast10MinMs: 12.0,
      airTemperatureC: 3.1,
      roadTemperatureC: -0.5,
      measuredAtIso: '2026-07-17T12:00:00Z',
    },
  ],
}

const PREVIEW_MESSAGE = {
  id: '00000000-0000-0000-0000-000000000001',
  threadId: '00000000-0000-0000-0000-000000000002',
  body: 'Sleipar vegur',
  messageKind: 'field_report',
  createdAt: '2026-07-17T11:00:00Z',
  isDeleted: false,
  isHidden: false,
  authorName: 'Jón',
}

function makeRequest(stationId: string) {
  return new NextRequest(
    `http://localhost/api/teskeid/weather/vedurpuls/vegagerdin/stations/${stationId}/preview`,
    { method: 'GET' }
  )
}

function makeParams(stationId: string) {
  return { params: Promise.resolve({ stationId }) }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockReadCurrent.mockResolvedValue({ status: 'ok', payload: CACHE_PAYLOAD })
  mockGetPreviewMessages.mockResolvedValue([])
})

// ── Cache unavailable ─────────────────────────────────────────────────────────

describe('GET vegagerdin station preview', () => {
  it('returns [] when cache is unavailable (fail-open)', async () => {
    mockReadCurrent.mockResolvedValue({ status: 'unavailable' })
    const res = await GET(makeRequest(STATION_ID), makeParams(STATION_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  // ── Unknown station ───────────────────────────────────────────────────────

  it('returns 400 when station is not in cache', async () => {
    const res = await GET(makeRequest('UNKNOWN'), makeParams('UNKNOWN'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('station not found')
  })

  // ── Known station ─────────────────────────────────────────────────────────

  it('returns 200 with empty array when no messages exist', async () => {
    mockGetPreviewMessages.mockResolvedValue([])
    const res = await GET(makeRequest(STATION_ID), makeParams(STATION_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('returns 200 with preview messages for known station', async () => {
    mockGetPreviewMessages.mockResolvedValue([PREVIEW_MESSAGE])
    const res = await GET(makeRequest(STATION_ID), makeParams(STATION_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe(PREVIEW_MESSAGE.id)
    expect(body[0].body).toBe('Sleipar vegur')
  })

  it('calls getPreviewMessages with vegagerdin_station scope', async () => {
    await GET(makeRequest(STATION_ID), makeParams(STATION_ID))
    expect(mockGetPreviewMessages).toHaveBeenCalledWith(
      { domain: 'weather', targetType: 'vegagerdin_station', targetId: STATION_ID },
      3
    )
  })

  // ── Repository error ──────────────────────────────────────────────────────

  it('returns [] when repository throws (fail-open)', async () => {
    mockGetPreviewMessages.mockRejectedValue(new Error('DB error'))
    const res = await GET(makeRequest(STATION_ID), makeParams(STATION_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })
})
