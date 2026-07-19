import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))
const { mockCheckFeatureAccess } = vi.hoisted(() => ({ mockCheckFeatureAccess: vi.fn() }))
const { mockReadCurrent } = vi.hoisted(() => ({ mockReadCurrent: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/loans/guard', () => ({
  checkFeatureAccess: mockCheckFeatureAccess,
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/weather/providers/vegagerdinCurrent.server', () => ({
  readVegagerdinCurrentWithHistoryFallback: mockReadCurrent,
}))

import { GET } from '@/app/api/teskeid/weather/vegagerdin/current/route'

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeMeasurement(stationId: string) {
  return {
    stationId,
    stationName: `Station ${stationId}`,
    lat: 64.0,
    lon: -21.5,
    measuredAtIso: new Date().toISOString(),
    fetchedAtIso: new Date().toISOString(),
    meanWindMs: 5.0,
    gustLast10MinMs: 8.0,
    windDirectionDeg: 180,
    windDirectionText: 'S',
    airTemperatureC: 10.0,
    roadTemperatureC: 8.0,
    dataQuality: 'complete' as const,
  }
}

function makeFreshCacheResult() {
  const now = new Date().toISOString()
  return {
    status: 'fresh' as const,
    cacheStatus: 'fresh' as const,
    measurementFreshness: 'fresh' as const,
    payload: {
      source: 'vegagerdin' as const,
      endpoint: 'vedur2014_1' as const,
      fetchedAtIso: now,
      oldestMeasuredAtIso: now,
      measurements: [makeMeasurement('1234'), makeMeasurement('5678')],
    },
  }
}

// ── Environment setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
  process.env.WEATHER_ENABLED = 'true'
  delete process.env.WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED
  // Default: cache is unavailable unless test overrides
  mockReadCurrent.mockResolvedValue({ status: 'unavailable', reason: 'cache_missing' })
})

// ── Feature flag tests ────────────────────────────────────────────────────────

describe('GET /api/teskeid/weather/vegagerdin/current - feature flags', () => {
  it('returns 404 when AUTH_MVP_ENABLED is not true', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    const res = await GET()
    expect(res.status).toBe(404)
  })

  it('returns 404 when AUTH_MVP_ENABLED is missing', async () => {
    delete process.env.AUTH_MVP_ENABLED
    const res = await GET()
    expect(res.status).toBe(404)
  })

  it('returns 404 when WEATHER_ENABLED is off', async () => {
    process.env.WEATHER_ENABLED = 'false'
    const res = await GET()
    expect(res.status).toBe(404)
  })

  it('returns 404 when WEATHER_ENABLED is missing', async () => {
    delete process.env.WEATHER_ENABLED
    const res = await GET()
    expect(res.status).toBe(404)
  })
})

// ── Open/graduated mode (no WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED) ─────

describe('GET /api/teskeid/weather/vegagerdin/current - open/graduated mode', () => {
  it('returns 200 for signed-out user when provider access is not required', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
  })

  it('does not call createClient or checkFeatureAccess in open mode', async () => {
    await GET()
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(mockCheckFeatureAccess).not.toHaveBeenCalled()
  })

  it('returns unavailable status when no cache data exists', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('unavailable')
    expect(body.reason).toBe('cache_missing')
    expect(body.stations).toHaveLength(0)
  })

  it('passes through cache_expired reason when cache is too old', async () => {
    mockReadCurrent.mockResolvedValue({ status: 'unavailable', reason: 'cache_expired' })
    const res = await GET()
    const body = await res.json()
    expect(body.status).toBe('unavailable')
    expect(body.reason).toBe('cache_expired')
  })

  it('passes through cache_invalid reason when cache payload is invalid', async () => {
    mockReadCurrent.mockResolvedValue({ status: 'unavailable', reason: 'cache_invalid' })
    const res = await GET()
    const body = await res.json()
    expect(body.status).toBe('unavailable')
    expect(body.reason).toBe('cache_invalid')
  })

  it('returns ok status with stations when cache data exists', async () => {
    mockReadCurrent.mockResolvedValue(makeFreshCacheResult())
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.stations).toHaveLength(2)
    expect(body.stations[0].stationId).toBe('1234')
  })

  it('WEATHER_ENABLED=All with no access required — returns 200 for signed-out', async () => {
    process.env.WEATHER_ENABLED = 'All'
    const res = await GET()
    expect(res.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled()
  })
})

// ── Restricted mode (WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED=true) ───────

describe('GET /api/teskeid/weather/vegagerdin/current - restricted mode', () => {
  beforeEach(() => {
    process.env.WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED = 'true'
  })

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

  it('returns 403 when user lacks weather-provider-vegagerdin feature access', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'user@example.com' } } })
    mockCheckFeatureAccess.mockResolvedValue(false)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns 200 when user has weather-provider-vegagerdin access (no vedrid row required)', async () => {
    // Key finding from v439: the provider gate must NOT require a separate vedrid row.
    // A user with only weather-provider-vegagerdin should be granted access.
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'user@example.com' } } })
    mockCheckFeatureAccess.mockResolvedValue(true) // weather-provider-vegagerdin = true
    mockReadCurrent.mockResolvedValue(makeFreshCacheResult())
    const res = await GET()
    expect(res.status).toBe(200)
    // Must only check weather-provider-vegagerdin, not vedrid
    expect(mockCheckFeatureAccess).toHaveBeenCalledTimes(1)
    expect(mockCheckFeatureAccess).toHaveBeenCalledWith('u1', 'user@example.com', 'weather-provider-vegagerdin')
    expect(mockCheckFeatureAccess).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), 'vedrid')
  })

  it('returns 200 with unavailable body when user has access but cache is empty', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'user@example.com' } } })
    mockCheckFeatureAccess.mockResolvedValue(true)
    mockReadCurrent.mockResolvedValue({ status: 'unavailable', reason: 'cache_missing' })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('unavailable')
    expect(body.stations).toHaveLength(0)
  })

  it('WEATHER_ENABLED=All, restricted, signed-out — returns 401', async () => {
    process.env.WEATHER_ENABLED = 'All'
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })
})

// ── DTO shape ─────────────────────────────────────────────────────────────────

describe('GET /api/teskeid/weather/vegagerdin/current - DTO shape', () => {
  it('returns explicit DTO fields, not raw internal measurement shape', async () => {
    mockReadCurrent.mockResolvedValue(makeFreshCacheResult())
    const res = await GET()
    const body = await res.json()
    const station = body.stations[0]

    // Expected DTO fields
    expect(station).toHaveProperty('stationId')
    expect(station).toHaveProperty('stationName')
    expect(station).toHaveProperty('lat')
    expect(station).toHaveProperty('lon')
    expect(station).toHaveProperty('measuredAtIso')
    expect(station).toHaveProperty('fetchedAtIso')
    expect(station).toHaveProperty('meanWindMs')
    expect(station).toHaveProperty('gustLast10MinMs')
    expect(station).toHaveProperty('windDirectionDeg')
    expect(station).toHaveProperty('windDirectionText')
    expect(station).toHaveProperty('airTemperatureC')
    expect(station).toHaveProperty('roadTemperatureC')
    expect(station).toHaveProperty('dataQuality')

    // Must NOT expose internal server-only field 'source'
    expect(station).not.toHaveProperty('source')
  })

  it('returns cacheStatus and measurementFreshness in ok response', async () => {
    mockReadCurrent.mockResolvedValue(makeFreshCacheResult())
    const res = await GET()
    const body = await res.json()
    expect(body.cacheStatus).toBe('fresh')
    expect(body.measurementFreshness).toBe('fresh')
    expect(body.fetchedAtIso).toBeTruthy()
  })

  it('returns stale cacheStatus when cache is stale', async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    mockReadCurrent.mockResolvedValue({
      status: 'stale',
      cacheStatus: 'stale',
      measurementFreshness: 'unknown',
      payload: {
        source: 'vegagerdin',
        endpoint: 'vedur2014_1',
        fetchedAtIso: fiveMinAgo,
        oldestMeasuredAtIso: null,
        measurements: [makeMeasurement('9999')],
      },
    })
    const res = await GET()
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.cacheStatus).toBe('stale')
    expect(body.measurementFreshness).toBe('unknown')
  })

  it('returns history_fallback cacheStatus when served from history table', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    mockReadCurrent.mockResolvedValue({
      status: 'stale',
      cacheStatus: 'history_fallback',
      measurementFreshness: 'stale',
      payload: {
        source: 'vegagerdin',
        endpoint: 'vedur2014_1',
        fetchedAtIso: twoHoursAgo,
        oldestMeasuredAtIso: twoHoursAgo,
        measurements: [makeMeasurement('1111')],
      },
    })
    const res = await GET()
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.cacheStatus).toBe('history_fallback')
    expect(body.measurementFreshness).toBe('stale')
    expect(body.stations).toHaveLength(1)
    expect(body.stations[0].stationId).toBe('1111')
  })
})
