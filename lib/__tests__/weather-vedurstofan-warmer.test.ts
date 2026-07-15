import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

// ── Registry mock: 2 valid stations + 1 null (must be filtered) ────────────────

vi.mock('@/lib/weather/providers/vedurstofanStationsRegistry', () => ({
  VEDURSTOFAN_STATIONS_REGISTRY: [
    {
      slug: 's1', name: 'Station S1', stationType: null, stationId: 'S1',
      wmoNumber: null, abbreviation: 'S1', forecastAreaName: null, forecastAreaCode: null,
      lat: 64.0, lon: -22.0, coordinatesRaw: null, elevationM: 10, startYear: null, owner: null,
      sourceUrl: 'https://www.vedur.is', mappingStatus: 'verified',
    },
    {
      slug: 's2', name: 'Station S2', stationType: null, stationId: 'S2',
      wmoNumber: null, abbreviation: 'S2', forecastAreaName: null, forecastAreaCode: null,
      lat: 65.0, lon: -19.0, coordinatesRaw: null, elevationM: 20, startYear: null, owner: null,
      sourceUrl: 'https://www.vedur.is', mappingStatus: 'verified',
    },
    {
      // stationId: null — must be filtered out by warmer
      slug: 'no-id', name: 'No ID Station', stationType: null, stationId: null,
      wmoNumber: null, abbreviation: 'XX', forecastAreaName: null, forecastAreaCode: null,
      lat: 63.0, lon: -21.0, coordinatesRaw: null, elevationM: 5, startYear: null, owner: null,
      sourceUrl: 'https://www.vedur.is', mappingStatus: 'missing-coordinates',
    },
  ],
}))

// ── Hoisted mock fns ───────────────────────────────────────────────────────────

const {
  mockGetFromCache,
  mockLike,
  mockCacheUpsert,
  mockForecastUpsert,
  mockDeleteLt,
  mockRunInsert,
  mockHttpFetch,
} = vi.hoisted(() => ({
  mockGetFromCache: vi.fn(),
  mockLike: vi.fn(),
  mockCacheUpsert: vi.fn(),
  mockForecastUpsert: vi.fn(),
  mockDeleteLt: vi.fn(),
  mockRunInsert: vi.fn(),
  mockHttpFetch: vi.fn(),
}))

// ── Admin mock — table-aware ───────────────────────────────────────────────────
//
// weather_cache:
//   .select('response_body, expires_at').eq(...).maybeSingle() → mockGetFromCache  (getFromCache)
//   .select('cache_key, response_body, expires_at').like(...)   → mockLike          (projector scan)
//   .upsert(...)                                                → mockCacheUpsert   (saveToCache)
// vedurstofan_forecasts_latest:
//   .upsert(...)                                                → mockForecastUpsert
//   .delete().eq().lt()                                         → mockDeleteLt
// weather_fetch_runs:
//   .insert().select().maybeSingle()                            → mockRunInsert

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: () => ({
    from: (table: string) => {
      if (table === 'weather_cache') {
        return {
          select: (cols: string) => {
            if (cols === 'response_body, expires_at') {
              return { eq: (_c: string, _v: string) => ({ maybeSingle: mockGetFromCache }) }
            }
            // projector scan: 'cache_key, response_body, expires_at'
            return { like: mockLike }
          },
          upsert: mockCacheUpsert,
        }
      }
      if (table === 'vedurstofan_forecasts_latest') {
        return {
          upsert: mockForecastUpsert,
          delete: () => ({ eq: () => ({ lt: mockDeleteLt }) }),
        }
      }
      if (table === 'vedurstofan_forecasts_history') {
        // History writes are best-effort — stub as always-succeed.
        return {
          upsert: () => Promise.resolve({ error: null }),
          delete: () => ({ lt: () => Promise.resolve({}) }),
        }
      }
      if (table === 'weather_fetch_runs') {
        return {
          insert: () => ({ select: () => ({ maybeSingle: mockRunInsert }) }),
        }
      }
    },
  }),
}))

vi.stubGlobal('fetch', mockHttpFetch)

import { warmVedurstofanForecastCache } from '@/lib/weather/providers/vedurstofan.server'

// ── Shared test fixtures ───────────────────────────────────────────────────────

const FUTURE = new Date(Date.now() + 3_600_000).toISOString()
const NOW = new Date().toISOString()

function makeCachePayload(stationId: string) {
  return {
    source: 'vedurstofan',
    endpoint: 'xml',
    type: 'forec',
    lang: 'is',
    timeStep: '3h',
    params: ['F', 'D', 'T', 'R', 'W'],
    stationId,
    stationName: `Station ${stationId}`,
    atimeIso: NOW,
    fetchedAtIso: NOW,
    expiresAtIso: FUTURE,
    attribution: {
      provider: 'Veðurstofa Íslands',
      downloadedAtIso: NOW,
      serviceUrl: 'https://xmlweather.vedur.is',
    },
    forecasts: [
      {
        ftimeIso: '2026-07-13T12:00:00Z',
        windSpeedMs: 5,
        windDirectionText: 'N',
        temperatureC: 10,
        precipitationMmPerHour: 0,
        weatherText: 'Clear',
      },
    ],
    parseErrors: [],
  }
}

function makeCacheRow(stationId: string) {
  return {
    cache_key: `vedurstofan:xml:forec:is:3h:F-D-T-R-W:${stationId}`,
    response_body: makeCachePayload(stationId),
    expires_at: FUTURE,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  // Defaults that keep projector happy
  mockForecastUpsert.mockResolvedValue({ error: null })
  mockDeleteLt.mockResolvedValue({ error: null })
  mockRunInsert.mockResolvedValue({ data: { id: 42 } })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('warmVedurstofanForecastCache — result shape', () => {
  it('returns all 7 expected fields', async () => {
    mockGetFromCache.mockResolvedValue({ data: { response_body: makeCachePayload('S1'), expires_at: FUTURE } })
    mockLike.mockResolvedValue({ data: [makeCacheRow('S1'), makeCacheRow('S2')], error: null })

    const result = await warmVedurstofanForecastCache()

    expect(result).toHaveProperty('fresh')
    expect(result).toHaveProperty('stale')
    expect(result).toHaveProperty('unavailable')
    expect(result).toHaveProperty('projected')
    expect(result).toHaveProperty('skipped')
    expect(result).toHaveProperty('errors')
    expect(result).toHaveProperty('projectionRunId')
  })
})

describe('warmVedurstofanForecastCache — station counts', () => {
  it('filters out null-stationId registry entries and uses only 2 IDs', async () => {
    // All from cache → no HTTP calls
    mockGetFromCache.mockResolvedValue({ data: { response_body: makeCachePayload('S1'), expires_at: FUTURE } })
    mockLike.mockResolvedValue({ data: [makeCacheRow('S1'), makeCacheRow('S2')], error: null })

    const result = await warmVedurstofanForecastCache()

    // Registry has 2 valid (S1, S2) + 1 null — null must not cause unavailable
    expect(result.fresh + result.stale + result.unavailable).toBe(2)
    expect(mockHttpFetch).not.toHaveBeenCalled()
  })

  it('returns fresh=2, stale=0, unavailable=0 when both stations have fresh cache', async () => {
    mockGetFromCache.mockResolvedValue({ data: { response_body: makeCachePayload('S1'), expires_at: FUTURE } })
    mockLike.mockResolvedValue({ data: [makeCacheRow('S1'), makeCacheRow('S2')], error: null })

    const result = await warmVedurstofanForecastCache()

    expect(result.fresh).toBe(2)
    expect(result.stale).toBe(0)
    expect(result.unavailable).toBe(0)
  })

  it('returns unavailable=2 when cache is empty and HTTP fetch fails', async () => {
    mockGetFromCache.mockResolvedValue({ data: null })
    mockHttpFetch.mockRejectedValue(new Error('network error'))
    mockLike.mockResolvedValue({ data: [], error: null })

    const result = await warmVedurstofanForecastCache()

    expect(result.unavailable).toBe(2)
    expect(result.fresh).toBe(0)
    expect(result.stale).toBe(0)
  })
})

describe('warmVedurstofanForecastCache — projection results', () => {
  it('returns projected count from projector', async () => {
    mockGetFromCache.mockResolvedValue({ data: { response_body: makeCachePayload('S1'), expires_at: FUTURE } })
    mockLike.mockResolvedValue({ data: [makeCacheRow('S1'), makeCacheRow('S2')], error: null })

    const result = await warmVedurstofanForecastCache()

    expect(result.projected).toBe(2)
    expect(result.projectionRunId).toBe(42)
  })

  it('surfaces projection errors in result', async () => {
    mockGetFromCache.mockResolvedValue({ data: { response_body: makeCachePayload('S1'), expires_at: FUTURE } })
    mockLike.mockResolvedValue({ data: [makeCacheRow('S1'), makeCacheRow('S2')], error: null })
    // Upsert fails for all stations
    mockForecastUpsert.mockResolvedValue({ error: { message: 'db error' } })

    const result = await warmVedurstofanForecastCache()

    expect(result.errors).toBeGreaterThan(0)
    expect(result.projected).toBe(0)
  })

  it('surfaces skipped count when cache row has no valid forecasts', async () => {
    mockGetFromCache.mockResolvedValue({ data: { response_body: makeCachePayload('S1'), expires_at: FUTURE } })
    // Cache rows with empty forecasts — projector skips these
    const emptyForecastPayload = { ...makeCachePayload('S1'), forecasts: [], stationId: 'S1' }
    const emptyForecastPayload2 = { ...makeCachePayload('S2'), forecasts: [], stationId: 'S2' }
    mockLike.mockResolvedValue({
      data: [
        { cache_key: 'vedurstofan:xml:forec:is:3h:F-D-T-R-W:S1', response_body: emptyForecastPayload, expires_at: FUTURE },
        { cache_key: 'vedurstofan:xml:forec:is:3h:F-D-T-R-W:S2', response_body: emptyForecastPayload2, expires_at: FUTURE },
      ],
      error: null,
    })

    const result = await warmVedurstofanForecastCache()

    expect(result.skipped).toBe(2)
    expect(result.projected).toBe(0)
  })
})

describe('warmVedurstofanForecastCache — never throws', () => {
  it('does not throw when fetcher throws', async () => {
    mockGetFromCache.mockRejectedValue(new Error('supabase crash'))
    mockHttpFetch.mockRejectedValue(new Error('network crash'))
    mockLike.mockResolvedValue({ data: [], error: null })

    await expect(warmVedurstofanForecastCache()).resolves.toBeDefined()
  })

  it('does not throw when projector scan fails', async () => {
    mockGetFromCache.mockResolvedValue({ data: { response_body: makeCachePayload('S1'), expires_at: FUTURE } })
    mockLike.mockResolvedValue({ data: null, error: { message: 'scan failed' } })

    await expect(warmVedurstofanForecastCache()).resolves.toBeDefined()
  })

  it('does not throw when projector throws entirely', async () => {
    mockGetFromCache.mockResolvedValue({ data: { response_body: makeCachePayload('S1'), expires_at: FUTURE } })
    mockLike.mockRejectedValue(new Error('projector crash'))

    await expect(warmVedurstofanForecastCache()).resolves.toBeDefined()
  })

  it('returns projected=0 and projectionRunId=null when projector scan and run-record both fail', async () => {
    // mockLike rejects → projector catch block runs → tries writeRunRecord
    // mockRunInsert also rejects → writeRunRecord catches and returns null
    // Projector returns { projected: 0, errors: 1, runId: null }
    mockGetFromCache.mockResolvedValue({ data: { response_body: makeCachePayload('S1'), expires_at: FUTURE } })
    mockLike.mockRejectedValue(new Error('projector crash'))
    mockRunInsert.mockRejectedValue(new Error('db crash'))

    const result = await warmVedurstofanForecastCache()

    expect(result.projected).toBe(0)
    expect(result.projectionRunId).toBeNull()
  })
})
