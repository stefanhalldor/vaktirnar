import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockFetch, mockReadCache, mockGetWeatherMode } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockReadCache: vi.fn(),
  mockGetWeatherMode: vi.fn(),
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/weather/providers/vegagerdinCurrent.server', () => ({
  fetchVegagerdinCurrent: mockFetch,
  readVegagerdinCurrentFromCache: mockReadCache,
  getMeasurementFreshness: vi.fn(() => 'fresh'),
}))

vi.mock('@/lib/weather/weatherBaseAccess.server', () => ({
  getWeatherEnabledMode: mockGetWeatherMode,
}))

import { GET } from '@/app/api/cron/warm-vegagerdin/route'

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeRequest(secret?: string): Request {
  const headers: Record<string, string> = {}
  if (secret) headers['authorization'] = `Bearer ${secret}`
  return new Request('http://localhost/api/cron/warm-vegagerdin', { headers })
}

const FIXED_NOW = '2026-07-18T08:00:00.000Z'

function makePayload(stationCount = 3, fetchedAtIso = FIXED_NOW) {
  return {
    source: 'vegagerdin' as const,
    endpoint: 'vedur2014_1' as const,
    fetchedAtIso,
    oldestMeasuredAtIso: fetchedAtIso,
    measurements: Array.from({ length: stationCount }, (_, i) => ({
      stationId: `S${i}`,
      stationName: `Station ${i}`,
      lat: 64.0, lon: -21.0,
      measuredAtIso: fetchedAtIso, fetchedAtIso,
      meanWindMs: 5, gustLast10MinMs: 8,
      windDirectionDeg: 180, windDirectionText: 'S',
      airTemperatureC: 10, roadTemperatureC: 8,
      dataQuality: 'complete' as const,
    })),
  }
}

function makeFetchOk(stationCount = 3) {
  return { ok: true as const, payload: makePayload(stationCount) }
}

function makeFetchError(reason = 'fetch_error', shapeInfo?: object) {
  return { ok: false as const, reason, ...(shapeInfo ? { shapeInfo } : {}) }
}

/** Wraps an existing payload as a fresh cache result — shares fetchedAtIso to avoid timestamp flakes. */
function makeCacheOk(payload = makePayload()) {
  return {
    status: 'fresh' as const,
    cacheStatus: 'fresh' as const,
    measurementFreshness: 'fresh' as const,
    payload,
  }
}

const CACHE_UNAVAILABLE = { status: 'unavailable' as const, reason: 'cache_missing' as const }

// ── Environment setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  mockGetWeatherMode.mockReturnValue('All')
  // Default: cache is unavailable (not fresh) so warm proceeds
  mockReadCache.mockResolvedValue(CACHE_UNAVAILABLE)
})

// ── Auth tests ────────────────────────────────────────────────────────────────

describe('GET /api/cron/warm-vegagerdin - auth', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 401 when Authorization header has wrong secret', async () => {
    const res = await GET(makeRequest('wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('returns 401 when CRON_SECRET env is not set', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(makeRequest('any-secret'))
    expect(res.status).toBe(401)
  })

  it('does not call fetchVegagerdinCurrent when unauthorized', async () => {
    await GET(makeRequest())
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockReadCache).not.toHaveBeenCalled()
  })
})

// ── Feature flag tests ────────────────────────────────────────────────────────

describe('GET /api/cron/warm-vegagerdin - feature flags', () => {
  it('skips when weather is disabled', async () => {
    mockGetWeatherMode.mockReturnValue('off')
    const res = await GET(makeRequest('test-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe('weather disabled')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

// ── Anti-stampede tests ───────────────────────────────────────────────────────

describe('GET /api/cron/warm-vegagerdin - anti-stampede', () => {
  it('skips when cache is already fresh', async () => {
    mockReadCache.mockResolvedValue(makeCacheOk(makePayload(42)))
    const res = await GET(makeRequest('test-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe('alreadyFresh')
    expect(body.stationCount).toBe(42)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('proceeds when cache is stale (not fresh)', async () => {
    const fetchResult = makeFetchOk(5)
    mockReadCache
      .mockResolvedValueOnce({ status: 'stale', cacheStatus: 'stale', measurementFreshness: 'stale', payload: makePayload(5) })
      .mockResolvedValueOnce(makeCacheOk(fetchResult.payload))
    mockFetch.mockResolvedValue(fetchResult)
    const res = await GET(makeRequest('test-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('proceeds when cache is unavailable', async () => {
    const fetchResult = makeFetchOk(3)
    mockReadCache
      .mockResolvedValueOnce(CACHE_UNAVAILABLE)
      .mockResolvedValueOnce(makeCacheOk(fetchResult.payload))
    mockFetch.mockResolvedValue(fetchResult)
    const res = await GET(makeRequest('test-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

// ── Success tests ─────────────────────────────────────────────────────────────

describe('GET /api/cron/warm-vegagerdin - success', () => {
  it('returns ok with safe metadata when fetch succeeds', async () => {
    const fetchResult = makeFetchOk(42)
    mockReadCache
      .mockResolvedValueOnce(CACHE_UNAVAILABLE)
      .mockResolvedValueOnce(makeCacheOk(fetchResult.payload))
    mockFetch.mockResolvedValue(fetchResult)
    const res = await GET(makeRequest('test-secret'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.stationCount).toBe(42)
    expect(body.fetchedAtIso).toBeTruthy()
    expect(body.oldestMeasuredAtIso).toBeTruthy()
    expect(body.measurementFreshness).toBe('fresh')
  })

  it('calls readVegagerdinCurrentFromCache twice: freshness check + verify', async () => {
    const fetchResult = makeFetchOk(3)
    mockReadCache
      .mockResolvedValueOnce(CACHE_UNAVAILABLE)
      .mockResolvedValueOnce(makeCacheOk(fetchResult.payload))
    mockFetch.mockResolvedValue(fetchResult)
    await GET(makeRequest('test-secret'))
    expect(mockReadCache).toHaveBeenCalledTimes(2)
  })

  it('does not return raw measurements array in response', async () => {
    const fetchResult = makeFetchOk(3)
    mockReadCache
      .mockResolvedValueOnce(CACHE_UNAVAILABLE)
      .mockResolvedValueOnce(makeCacheOk(fetchResult.payload))
    mockFetch.mockResolvedValue(fetchResult)
    const res = await GET(makeRequest('test-secret'))
    const body = await res.json()
    expect(body).not.toHaveProperty('measurements')
    expect(body).not.toHaveProperty('payload')
  })

  it('does not return upstream secrets or raw body in response', async () => {
    const fetchResult = makeFetchOk(3)
    mockReadCache
      .mockResolvedValueOnce(CACHE_UNAVAILABLE)
      .mockResolvedValueOnce(makeCacheOk(fetchResult.payload))
    mockFetch.mockResolvedValue(fetchResult)
    const res = await GET(makeRequest('test-secret'))
    const body = await res.json()
    expect(body).not.toHaveProperty('source')
    expect(body).not.toHaveProperty('endpoint')
  })
})

// ── Failure tests ─────────────────────────────────────────────────────────────

describe('GET /api/cron/warm-vegagerdin - failures', () => {
  it('returns 500 with http_error reason on HTTP failure', async () => {
    mockFetch.mockResolvedValue(makeFetchError('http_error'))
    const res = await GET(makeRequest('test-secret'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.status).toBe('error')
    expect(body.reason).toBe('http_error')
    expect(body.stationCount).toBe(0)
  })

  it('returns 500 with fetch_error reason on network failure', async () => {
    mockFetch.mockResolvedValue(makeFetchError('fetch_error'))
    const res = await GET(makeRequest('test-secret'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.reason).toBe('fetch_error')
  })

  it('returns 500 with parse_zero reason and shapeInfo when parser yields 0 measurements', async () => {
    const shapeInfo = { topLevelKind: 'object', topLevelKeys: ['error', 'message'] }
    mockFetch.mockResolvedValue(makeFetchError('parse_zero', shapeInfo))
    const res = await GET(makeRequest('test-secret'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.reason).toBe('parse_zero')
    expect(body.shapeInfo).toEqual(shapeInfo)
  })

  it('returns 500 with write_failed reason when cache write fails', async () => {
    mockFetch.mockResolvedValue(makeFetchError('write_failed'))
    const res = await GET(makeRequest('test-secret'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.reason).toBe('write_failed')
  })

  it('returns 500 cache_verify_failed when fetch ok but read path still sees unavailable', async () => {
    // First call (freshness check): unavailable. Second call (verify): still unavailable.
    mockReadCache
      .mockResolvedValueOnce(CACHE_UNAVAILABLE)
      .mockResolvedValueOnce(CACHE_UNAVAILABLE)
    mockFetch.mockResolvedValue(makeFetchOk(10))
    const res = await GET(makeRequest('test-secret'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.status).toBe('error')
    expect(body.reason).toBe('cache_verify_failed')
  })

  it('returns 500 cache_verify_mismatch when verify reads stale payload with different fetchedAtIso', async () => {
    const newPayload = makePayload(10)
    const stalePayload = makePayload(10)
    // Give stale payload a different (older) fetchedAtIso
    stalePayload.fetchedAtIso = '2026-01-01T00:00:00.000Z'
    mockReadCache
      .mockResolvedValueOnce(CACHE_UNAVAILABLE)
      .mockResolvedValueOnce({
        status: 'stale' as const,
        cacheStatus: 'stale' as const,
        measurementFreshness: 'stale' as const,
        payload: stalePayload,
      })
    mockFetch.mockResolvedValue({ ok: true as const, payload: newPayload })
    const res = await GET(makeRequest('test-secret'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.status).toBe('error')
    expect(body.reason).toBe('cache_verify_mismatch')
  })

  it('returns 500 on unexpected exception', async () => {
    mockFetch.mockRejectedValue(new Error('unexpected'))
    const res = await GET(makeRequest('test-secret'))
    expect(res.status).toBe(500)
  })
})
