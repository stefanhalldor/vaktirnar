/**
 * Unit tests for lib/weather/metno.server.ts — fetchForecast()
 *
 * Tests cache hit/miss, HTTP status handling (304, 403, 429, non-ok),
 * and that cache failures never propagate to the caller.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

vi.mock('server-only', () => ({}))

const { mockGetFromCache, mockSaveToCache, mockTouchCache } = vi.hoisted(() => ({
  mockGetFromCache: vi.fn(),
  mockSaveToCache:  vi.fn(),
  mockTouchCache:   vi.fn(),
}))

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockGetFromCache,
        })),
      })),
      upsert: vi.fn(() => mockSaveToCache()),
      update: vi.fn(() => ({
        eq: vi.fn(() => mockTouchCache()),
      })),
    })),
  })),
}))

vi.mock('@/lib/weather/forecast', () => ({
  parseMetnoForecast: vi.fn((body: unknown) =>
    Array.isArray(body) ? body : [{ time: '2026-07-03T18:00:00Z', airTemperatureC: 15, windSpeedMs: 3, windGustMs: 5, windFromDegrees: 90, precipitationMmPerHour: 0, symbolCode: 'clearsky_day' }]
  ),
}))

vi.stubGlobal('fetch', mockFetch)

import { fetchForecast } from '@/lib/weather/metno.server'

// ── Helpers ───────────────────────────────────────────────────────────────────

const FORECAST_BODY = { properties: { timeseries: [] } }

function makeResponse(status: number, body: unknown = FORECAST_BODY, headers: Record<string, string> = {}): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    headers: {
      get: (k: string) => headers[k] ?? null,
    },
  } as unknown as Response
}

function makeCacheRow(overrides: Partial<{ expires_at: string; last_modified: string | null }> = {}) {
  return {
    response_body: FORECAST_BODY,
    expires_at: overrides.expires_at ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    last_modified: overrides.last_modified ?? 'Thu, 03 Jul 2026 00:00:00 GMT',
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('fetchForecast — cache hit (not expired)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetFromCache.mockResolvedValue({ data: makeCacheRow(), error: null })
  })

  it('returns cached forecast without calling fetch', async () => {
    await fetchForecast(64.135, -21.895)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns HourPoint array from cache', async () => {
    const result = await fetchForecast(64.135, -21.895)
    expect(Array.isArray(result)).toBe(true)
  })
})

describe('fetchForecast — cache miss (no row)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetFromCache.mockResolvedValue({ data: null, error: null })
    mockSaveToCache.mockResolvedValue({ error: null })
  })

  it('calls fetch when no cache row exists', async () => {
    mockFetch.mockResolvedValue(makeResponse(200))
    await fetchForecast(64.135, -21.895)
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('uses the correct met.no URL with rounded coordinates', async () => {
    mockFetch.mockResolvedValue(makeResponse(200))
    await fetchForecast(64.135, -21.895)
    const url: string = mockFetch.mock.calls[0][0]
    expect(url).toContain('lat=64.135')
    expect(url).toContain('lon=-21.895')
    expect(url).toContain('locationforecast/2.0/compact')
  })

  it('sets User-Agent header', async () => {
    mockFetch.mockResolvedValue(makeResponse(200))
    await fetchForecast(64.135, -21.895)
    const opts = mockFetch.mock.calls[0][1] as RequestInit & { headers: Record<string, string> }
    expect(opts.headers['User-Agent']).toBeDefined()
  })
})

describe('fetchForecast — cache miss (expired row)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetFromCache.mockResolvedValue({
      data: makeCacheRow({ expires_at: new Date(Date.now() - 60 * 1000).toISOString() }),
      error: null,
    })
    mockSaveToCache.mockResolvedValue({ error: null })
  })

  it('sends If-Modified-Since when stale cache exists', async () => {
    mockFetch.mockResolvedValue(makeResponse(200))
    await fetchForecast(64.135, -21.895)
    const opts = mockFetch.mock.calls[0][1] as RequestInit & { headers: Record<string, string> }
    expect(opts.headers['If-Modified-Since']).toBeDefined()
  })

  it('fetches and returns forecast on cache miss with expired row', async () => {
    mockFetch.mockResolvedValue(makeResponse(200))
    const result = await fetchForecast(64.135, -21.895)
    expect(mockFetch).toHaveBeenCalledOnce()
    expect(Array.isArray(result)).toBe(true)
  })
})

describe('fetchForecast — HTTP 304 Not Modified', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetFromCache.mockResolvedValue({
      data: makeCacheRow({ expires_at: new Date(Date.now() - 60 * 1000).toISOString() }),
      error: null,
    })
    mockTouchCache.mockResolvedValue({ error: null })
    mockFetch.mockResolvedValue(makeResponse(304))
  })

  it('returns stale cache body on 304', async () => {
    const result = await fetchForecast(64.135, -21.895)
    expect(Array.isArray(result)).toBe(true)
  })

  it('does not throw on 304', async () => {
    await expect(fetchForecast(64.135, -21.895)).resolves.toBeDefined()
  })
})

describe('fetchForecast — HTTP 403 Forbidden', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue(makeResponse(403))
  })

  it('falls back to stale cache on 403', async () => {
    mockGetFromCache.mockResolvedValue({
      data: makeCacheRow({ expires_at: new Date(Date.now() - 60 * 1000).toISOString() }),
      error: null,
    })
    const result = await fetchForecast(64.135, -21.895)
    expect(Array.isArray(result)).toBe(true)
  })

  it('throws when 403 and no cache', async () => {
    mockGetFromCache.mockResolvedValue({ data: null, error: null })
    await expect(fetchForecast(64.135, -21.895)).rejects.toThrow()
  })
})

describe('fetchForecast — HTTP 429 Too Many Requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue(makeResponse(429))
  })

  it('falls back to stale cache on 429', async () => {
    mockGetFromCache.mockResolvedValue({
      data: makeCacheRow({ expires_at: new Date(Date.now() - 60 * 1000).toISOString() }),
      error: null,
    })
    const result = await fetchForecast(64.135, -21.895)
    expect(Array.isArray(result)).toBe(true)
  })

  it('throws when 429 and no cache', async () => {
    mockGetFromCache.mockResolvedValue({ data: null, error: null })
    await expect(fetchForecast(64.135, -21.895)).rejects.toThrow()
  })
})

describe('fetchForecast — network error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockRejectedValue(new Error('network timeout'))
  })

  it('falls back to stale cache on network error', async () => {
    mockGetFromCache.mockResolvedValue({
      data: makeCacheRow({ expires_at: new Date(Date.now() - 60 * 1000).toISOString() }),
      error: null,
    })
    const result = await fetchForecast(64.135, -21.895)
    expect(Array.isArray(result)).toBe(true)
  })

  it('throws when network fails and no cache', async () => {
    mockGetFromCache.mockResolvedValue({ data: null, error: null })
    await expect(fetchForecast(64.135, -21.895)).rejects.toThrow()
  })
})

describe('fetchForecast — cache write failure is non-fatal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetFromCache.mockResolvedValue({ data: null, error: null })
    mockSaveToCache.mockRejectedValue(new Error('DB write failed'))
    mockFetch.mockResolvedValue(makeResponse(200))
  })

  it('returns forecast even when cache write throws', async () => {
    const result = await fetchForecast(64.135, -21.895)
    expect(Array.isArray(result)).toBe(true)
  })
})
