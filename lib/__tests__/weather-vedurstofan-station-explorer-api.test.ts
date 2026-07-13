import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))
const { mockCheckFeatureAccess } = vi.hoisted(() => ({ mockCheckFeatureAccess: vi.fn() }))
const { mockFetchVedurstofan } = vi.hoisted(() => ({ mockFetchVedurstofan: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/loans/guard', () => ({
  checkFeatureAccess: mockCheckFeatureAccess,
}))

vi.mock('@/lib/weather/providers/vedurstofan.server', () => ({
  readVedurstofanCacheForStations: mockFetchVedurstofan,
}))

vi.mock('@/lib/weather/providers/vedurstofanStationsRegistry', () => ({
  VEDURSTOFAN_STATIONS_REGISTRY: [
    {
      slug: 'hellh', name: 'Hellisheiði', stationType: 'Sjálfvirk veðurathugunarstöð',
      stationId: '31392', wmoNumber: '4836', abbreviation: 'hellh',
      forecastAreaName: 'Suðurland', forecastAreaCode: 'su',
      lat: 64.04, lon: -21.37, coordinatesRaw: "64°01.127', 21°20.543' (64,0188, 21,3424)",
      elevationM: 360, startYear: 1992, owner: 'Vegagerðin',
      sourceUrl: 'https://www.vedur.is/vedur/stodvar/?s=hellh',
      mappingStatus: 'source-provided',
    },
    {
      slug: 'sfoss', name: 'Selfoss', stationType: 'Sjálfvirk veðurathugunarstöð',
      stationId: '6300', wmoNumber: null, abbreviation: 'sfoss',
      forecastAreaName: 'Suðurland', forecastAreaCode: 'su',
      lat: 63.93, lon: -20.99, coordinatesRaw: null,
      elevationM: null, startYear: null, owner: 'Veðurstofa Íslands',
      sourceUrl: 'https://www.vedur.is/vedur/stodvar/?s=sfoss',
      mappingStatus: 'source-provided',
    },
  ],
}))

import { GET } from '@/app/api/teskeid/weather/vedurstofan/stations/route'

// ── Helpers ────────────────────────────────────────────────────────────────────

function authedUser() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'u1', email: 'test@example.com' } },
  })
  mockCheckFeatureAccess.mockResolvedValue(true)
}

function makePayload(stationId: string) {
  return {
    source: 'vedurstofan',
    stationId,
    atimeIso: '2026-07-12T06:00:00Z',
    fetchedAtIso: new Date().toISOString(),
    expiresAtIso: new Date(Date.now() + 90 * 60 * 1000).toISOString(),
    forecasts: [
      {
        ftimeIso: '2026-07-12T09:00:00Z',
        windSpeedMs: 10,
        windDirectionText: 'N',
        temperatureC: 5,
        precipitationMmPerHour: 0.6,
        weatherText: 'Skýjað',
      },
    ],
    parseErrors: [],
    attribution: { provider: 'Veðurstofa Íslands', downloadedAtIso: '', serviceUrl: 'https://xmlweather.vedur.is' },
  }
}

// ── Environment helpers ────────────────────────────────────────────────────────

function withEnv(vars: Record<string, string>, fn: () => void) {
  const original: Record<string, string | undefined> = {}
  for (const k of Object.keys(vars)) original[k] = process.env[k]
  Object.assign(process.env, vars)
  fn()
  for (const [k, v] of Object.entries(original)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
  process.env.WEATHER_ENABLED = 'true'
  process.env.WEATHER_ELTA_VEDRID_FLAG = 'true'
})

// ── Feature flag tests ─────────────────────────────────────────────────────────

describe('GET /api/teskeid/weather/vedurstofan/stations - feature flags', () => {
  it('returns 404 when AUTH_MVP_ENABLED is not true', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    const res = await GET()
    expect(res.status).toBe(404)
  })

  it('returns 404 when WEATHER_ENABLED is not true', async () => {
    process.env.WEATHER_ENABLED = 'false'
    const res = await GET()
    expect(res.status).toBe(404)
  })

  it('returns 404 when AUTH_MVP_ENABLED is missing', async () => {
    delete process.env.AUTH_MVP_ENABLED
    const res = await GET()
    expect(res.status).toBe(404)
  })

  it('returns 404 when WEATHER_ELTA_VEDRID_FLAG is not true', async () => {
    process.env.WEATHER_ELTA_VEDRID_FLAG = 'false'
    const res = await GET()
    expect(res.status).toBe(404)
  })

  it('returns 404 when WEATHER_ELTA_VEDRID_FLAG is missing', async () => {
    delete process.env.WEATHER_ELTA_VEDRID_FLAG
    const res = await GET()
    expect(res.status).toBe(404)
  })
})

// ── Auth tests ─────────────────────────────────────────────────────────────────

describe('GET /api/teskeid/weather/vedurstofan/stations - auth', () => {
  it('returns 401 when no user is authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 401 when user has no email', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: null } } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 404 when user lacks vedrid feature access', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'noaccess@example.com' } },
    })
    // vedrid=false, elta-vedrid=true => should 404
    mockCheckFeatureAccess.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const res = await GET()
    expect(res.status).toBe(404)
  })

  it('returns 404 when user lacks elta-vedrid feature access', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'noaccess@example.com' } },
    })
    // vedrid=true, elta-vedrid=false => should 404
    mockCheckFeatureAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const res = await GET()
    expect(res.status).toBe(404)
  })
})

// ── Payload tests ──────────────────────────────────────────────────────────────

describe('GET /api/teskeid/weather/vedurstofan/stations - payload', () => {
  it('returns all curated stations with ok status when data is fresh', async () => {
    authedUser()
    const results = new Map([
      ['31392', { status: 'ok' as const, payload: makePayload('31392') }],
      ['6300', { status: 'ok' as const, payload: makePayload('6300') }],
    ])
    mockFetchVedurstofan.mockResolvedValue(results)

    const res = await GET()
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.summary.total).toBe(2)
    expect(body.summary.ok).toBe(2)
    expect(body.summary.stale).toBe(0)
    expect(body.summary.unavailable).toBe(0)
    expect(body.stations).toHaveLength(2)
    expect(body.stations[0].stationId).toBe('31392')
    expect(body.stations[0].status).toBe('ok')
    expect(body.stations[0].forecasts).toHaveLength(1)
  })

  it('correctly maps ok, stale, and unavailable stations', async () => {
    authedUser()
    const results = new Map([
      ['31392', { status: 'ok' as const, payload: makePayload('31392') }],
      ['6300', { status: 'stale' as const, payload: makePayload('6300') }],
    ])
    mockFetchVedurstofan.mockResolvedValue(results)

    const res = await GET()
    const body = await res.json()

    expect(body.summary.ok).toBe(1)
    expect(body.summary.stale).toBe(1)
    expect(body.summary.unavailable).toBe(0)
    expect(body.stations.find((s: { stationId: string }) => s.stationId === '31392')?.status).toBe('ok')
    expect(body.stations.find((s: { stationId: string }) => s.stationId === '6300')?.status).toBe('stale')
  })

  it('marks stations as unavailable when missing from results map', async () => {
    authedUser()
    // Only Hellisheiði in results, Selfoss missing
    const results = new Map([
      ['31392', { status: 'ok' as const, payload: makePayload('31392') }],
    ])
    mockFetchVedurstofan.mockResolvedValue(results)

    const res = await GET()
    const body = await res.json()

    expect(body.summary.unavailable).toBe(1)
    const selfoss = body.stations.find((s: { stationId: string }) => s.stationId === '6300')
    expect(selfoss?.status).toBe('unavailable')
    expect(selfoss?.forecasts).toEqual([])
  })

  it('includes station metadata even for unavailable stations', async () => {
    authedUser()
    mockFetchVedurstofan.mockResolvedValue(new Map())

    const res = await GET()
    const body = await res.json()

    const station = body.stations[0]
    expect(station.stationId).toBe('31392')
    expect(station.stationName).toBe('Hellisheiði')
    expect(station.lat).toBe(64.04)
    expect(station.lon).toBe(-21.37)
    expect(station.status).toBe('unavailable')
  })

  it('includes attribution and generatedAtIso in response', async () => {
    authedUser()
    mockFetchVedurstofan.mockResolvedValue(new Map())

    const res = await GET()
    const body = await res.json()

    expect(body.attribution.provider).toBe('Veðurstofa Íslands')
    expect(body.attribution.serviceUrl).toContain('xmlweather.vedur.is')
    expect(body.generatedAtIso).toBeTruthy()
    expect(new Date(body.generatedAtIso).getTime()).toBeGreaterThan(0)
  })

  it('does not expose user id, email, or Supabase internals', async () => {
    authedUser()
    mockFetchVedurstofan.mockResolvedValue(new Map())

    const res = await GET()
    const body = await res.json()
    const bodyStr = JSON.stringify(body)

    expect(bodyStr).not.toContain('u1')
    expect(bodyStr).not.toContain('test@example.com')
    expect(bodyStr).not.toContain('supabase')
  })
})

// ── Fail-open tests ────────────────────────────────────────────────────────────

describe('GET /api/teskeid/weather/vedurstofan/stations - fail-open', () => {
  it('returns all stations as unavailable when cache read throws', async () => {
    authedUser()
    mockFetchVedurstofan.mockRejectedValue(new Error('network error'))

    const res = await GET()
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.summary.total).toBe(2)
    expect(body.summary.unavailable).toBe(2)
    expect(body.summary.ok).toBe(0)
    expect(body.summary.stale).toBe(0)
  })

  it('still returns station metadata when cache read throws', async () => {
    authedUser()
    mockFetchVedurstofan.mockRejectedValue(new Error('timeout'))

    const res = await GET()
    const body = await res.json()

    expect(body.stations[0].stationName).toBe('Hellisheiði')
    expect(body.stations[1].stationName).toBe('Selfoss')
  })
})

// ── Cache-only behavior ────────────────────────────────────────────────────────

describe('GET /api/teskeid/weather/vedurstofan/stations - cache-only (no live fetch)', () => {
  it('uses readVedurstofanCacheForStations, not the live fetch function', async () => {
    authedUser()
    mockFetchVedurstofan.mockResolvedValue(new Map())

    await GET()

    // The mock is wired to readVedurstofanCacheForStations — if the route
    // called the live fetch function it would not be intercepted here
    expect(mockFetchVedurstofan).toHaveBeenCalledTimes(1)
  })

  it('returns all station records even when cache is fully empty', async () => {
    authedUser()
    mockFetchVedurstofan.mockResolvedValue(new Map())

    const res = await GET()
    const body = await res.json()

    expect(body.summary.total).toBe(2)
    expect(body.summary.unavailable).toBe(2)
    expect(body.stations).toHaveLength(2)
  })
})

// ── Full registry metadata in response ────────────────────────────────────────

describe('GET /api/teskeid/weather/vedurstofan/stations - registry metadata', () => {
  it('Hellisheiði response includes wmoNumber, abbreviation, elevation, startYear, sourceUrl', async () => {
    authedUser()
    mockFetchVedurstofan.mockResolvedValue(new Map())

    const res = await GET()
    const body = await res.json()

    const h = body.stations.find((s: { stationId: string }) => s.stationId === '31392')
    expect(h).toBeDefined()
    expect(h.wmoNumber).toBe('4836')
    expect(h.abbreviation).toBe('hellh')
    expect(h.elevationM).toBe(360)
    expect(h.startYear).toBe(1992)
    expect(h.owner).toBe('Vegagerðin')
    expect(h.forecastAreaName).toBe('Suðurland')
    expect(h.sourceUrl).toBe('https://www.vedur.is/vedur/stodvar/?s=hellh')
    expect(h.mappingStatus).toBe('source-provided')
  })

  it('stationName is mapped from registry name field', async () => {
    authedUser()
    mockFetchVedurstofan.mockResolvedValue(new Map())

    const res = await GET()
    const body = await res.json()

    expect(body.stations[0].stationName).toBe('Hellisheiði')
    expect(body.stations[1].stationName).toBe('Selfoss')
  })
})
