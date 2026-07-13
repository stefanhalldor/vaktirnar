import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// ── Hoisted mock fns ──────────────────────────────────────────────────────────

const {
  mockLike,
  mockDeleteEq,
  mockDeleteLt,
  mockUpsertForecasts,
  mockInsertRunSelect,
} = vi.hoisted(() => ({
  mockLike: vi.fn(),
  mockDeleteEq: vi.fn(),
  mockDeleteLt: vi.fn(),
  mockUpsertForecasts: vi.fn(),
  mockInsertRunSelect: vi.fn(),
}))

// Table-aware admin mock:
//   weather_cache                  → select().like()
//   vedurstofan_forecasts_latest   → upsert() or delete().eq().lt()
//   weather_fetch_runs             → insert().select().maybeSingle()
vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: () => ({
    from: (table: string) => {
      if (table === 'weather_cache') {
        return { select: () => ({ like: mockLike }) }
      }
      if (table === 'vedurstofan_forecasts_latest') {
        return {
          upsert: mockUpsertForecasts,
          delete: () => ({
            eq: (...args: unknown[]) => {
              mockDeleteEq(...args)
              return { lt: mockDeleteLt }
            },
          }),
        }
      }
      if (table === 'weather_fetch_runs') {
        return {
          insert: () => ({
            select: () => ({ maybeSingle: mockInsertRunSelect }),
          }),
        }
      }
      return {}
    },
  }),
}))

vi.mock('@/lib/weather/providers/vedurstofanStationsRegistry', () => ({
  VEDURSTOFAN_STATIONS_REGISTRY: [
    { stationId: '31392', name: 'Hellisheiði', slug: 'hellh', abbreviation: 'hellh',
      stationType: null, wmoNumber: null, forecastAreaName: null, forecastAreaCode: null,
      lat: 64.0, lon: -21.0, coordinatesRaw: null, elevationM: null, startYear: null,
      owner: null, sourceUrl: '', mappingStatus: 'source-provided' },
    { stationId: '6300', name: 'Selfoss', slug: 'sfoss', abbreviation: 'sfoss',
      stationType: null, wmoNumber: null, forecastAreaName: null, forecastAreaCode: null,
      lat: 63.9, lon: -20.9, coordinatesRaw: null, elevationM: null, startYear: null,
      owner: null, sourceUrl: '', mappingStatus: 'source-provided' },
  ],
}))

import { projectVedurstofanCacheToProductTables } from '@/lib/weather/providers/vedurstofan.server'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CACHE_KEY_PREFIX = 'vedurstofan:xml:forec:is:3h:F-D-T-R-W:'

function makePayload(stationId: string, forecastCount = 2) {
  return {
    source: 'vedurstofan',
    endpoint: 'xml',
    type: 'forec',
    lang: 'is',
    timeStep: '3h',
    params: ['F', 'D', 'T', 'R', 'W'],
    stationId,
    stationName: stationId === '31392' ? 'Hellisheiði' : 'Selfoss',
    atimeIso: '2026-07-13T06:00:00Z',
    fetchedAtIso: '2026-07-13T07:00:00Z',
    expiresAtIso: '2026-07-13T08:30:00Z',
    attribution: { provider: 'Veðurstofa Íslands', downloadedAtIso: '2026-07-13T07:00:00Z', serviceUrl: '' },
    forecasts: Array.from({ length: forecastCount }, (_, i) => ({
      ftimeIso: `2026-07-13T${9 + i * 3}:00:00Z`,
      windSpeedMs: 5 + i,
      windDirectionText: 'N',
      temperatureC: 10 - i,
      precipitationMmPerHour: 0,
      weatherText: 'Skýjað',
    })),
    parseErrors: [],
  }
}

function makeCacheRow(stationId: string, payload = makePayload(stationId)) {
  return {
    cache_key: `${CACHE_KEY_PREFIX}${stationId}`,
    response_body: payload,
    expires_at: payload.expiresAtIso,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLike.mockResolvedValue({ data: [], error: null })
  mockUpsertForecasts.mockResolvedValue({ error: null })
  mockDeleteLt.mockResolvedValue({ error: null })
  mockInsertRunSelect.mockResolvedValue({ data: { id: 1 }, error: null })
})

// ── Cache key prefix ──────────────────────────────────────────────────────────

describe('projectVedurstofanCacheToProductTables — cache key prefix', () => {
  it('scans weather_cache with the correct key prefix', async () => {
    await projectVedurstofanCacheToProductTables()
    expect(mockLike).toHaveBeenCalledWith('cache_key', `${CACHE_KEY_PREFIX}%`)
  })

  it('does not call fetch() — no live HTTP requests', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    mockLike.mockResolvedValue({ data: [makeCacheRow('31392')], error: null })
    await projectVedurstofanCacheToProductTables()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ── Validation / skip ─────────────────────────────────────────────────────────

describe('projectVedurstofanCacheToProductTables — validation', () => {
  it('skips rows with null response_body', async () => {
    mockLike.mockResolvedValue({
      data: [{ cache_key: `${CACHE_KEY_PREFIX}31392`, response_body: null, expires_at: '' }],
      error: null,
    })
    const result = await projectVedurstofanCacheToProductTables()
    expect(result.skipped).toBe(1)
    expect(result.projected).toBe(0)
    expect(mockUpsertForecasts).not.toHaveBeenCalled()
  })

  it('skips rows where source is not vedurstofan', async () => {
    const bad = { ...makePayload('31392'), source: 'metno' }
    mockLike.mockResolvedValue({ data: [makeCacheRow('31392', bad as never)], error: null })
    const result = await projectVedurstofanCacheToProductTables()
    expect(result.skipped).toBe(1)
    expect(mockUpsertForecasts).not.toHaveBeenCalled()
  })

  it('skips rows where type is not forec', async () => {
    const bad = { ...makePayload('31392'), type: 'obs' }
    mockLike.mockResolvedValue({ data: [makeCacheRow('31392', bad as never)], error: null })
    const result = await projectVedurstofanCacheToProductTables()
    expect(result.skipped).toBe(1)
    expect(mockUpsertForecasts).not.toHaveBeenCalled()
  })

  it('skips rows where forecasts array is empty', async () => {
    mockLike.mockResolvedValue({ data: [makeCacheRow('31392', makePayload('31392', 0))], error: null })
    const result = await projectVedurstofanCacheToProductTables()
    expect(result.skipped).toBe(1)
    expect(mockUpsertForecasts).not.toHaveBeenCalled()
  })

  it('skips rows where cache key station id does not match payload stationId', async () => {
    const payload = makePayload('31392')
    // Cache key says 6300, payload says 31392
    const row = { cache_key: `${CACHE_KEY_PREFIX}6300`, response_body: payload, expires_at: '' }
    mockLike.mockResolvedValue({ data: [row], error: null })
    const result = await projectVedurstofanCacheToProductTables()
    expect(result.skipped).toBe(1)
    expect(mockUpsertForecasts).not.toHaveBeenCalled()
  })

  it('skips when all forecasts have empty ftimeIso', async () => {
    const payload = makePayload('31392')
    payload.forecasts = [{ ...payload.forecasts[0], ftimeIso: '' }]
    mockLike.mockResolvedValue({ data: [makeCacheRow('31392', payload)], error: null })
    const result = await projectVedurstofanCacheToProductTables()
    expect(result.skipped).toBe(1)
    expect(mockUpsertForecasts).not.toHaveBeenCalled()
  })

  it('does not touch product tables when validation fails', async () => {
    const bad = { ...makePayload('31392'), source: 'wrong' }
    mockLike.mockResolvedValue({ data: [makeCacheRow('31392', bad as never)], error: null })
    await projectVedurstofanCacheToProductTables()
    expect(mockUpsertForecasts).not.toHaveBeenCalled()
    expect(mockDeleteLt).not.toHaveBeenCalled()
  })
})

// ── Projection ────────────────────────────────────────────────────────────────

describe('projectVedurstofanCacheToProductTables — projection', () => {
  it('projects valid stations and returns correct counts', async () => {
    mockLike.mockResolvedValue({
      data: [makeCacheRow('31392'), makeCacheRow('6300')],
      error: null,
    })
    const result = await projectVedurstofanCacheToProductTables()
    expect(result.projected).toBe(2)
    expect(result.skipped).toBe(0)
    expect(result.errors).toBe(0)
  })

  it('upserts new rows before deleting stale ones', async () => {
    mockLike.mockResolvedValue({ data: [makeCacheRow('31392')], error: null })
    let upsertCalledAt = 0
    let deleteCalledAt = 0
    let callOrder = 0
    mockUpsertForecasts.mockImplementation(() => { upsertCalledAt = ++callOrder; return Promise.resolve({ error: null }) })
    mockDeleteLt.mockImplementation(() => { deleteCalledAt = ++callOrder; return Promise.resolve({ error: null }) })
    await projectVedurstofanCacheToProductTables()
    expect(upsertCalledAt).toBeLessThan(deleteCalledAt)
  })

  it('deletes stale rows using station_id and fetched_at filter', async () => {
    mockLike.mockResolvedValue({ data: [makeCacheRow('31392')], error: null })
    await projectVedurstofanCacheToProductTables()
    expect(mockDeleteEq).toHaveBeenCalledWith('station_id', '31392')
    expect(mockDeleteLt).toHaveBeenCalledWith('fetched_at', '2026-07-13T07:00:00Z')
  })

  it('sets atime, expires_at, fetched_at on forecast rows from payload', async () => {
    mockLike.mockResolvedValue({ data: [makeCacheRow('31392')], error: null })
    await projectVedurstofanCacheToProductTables()
    const insertedRows = mockUpsertForecasts.mock.calls[0][0] as Record<string, unknown>[]
    expect(insertedRows[0].atime).toBe('2026-07-13T06:00:00Z')
    expect(insertedRows[0].expires_at).toBe('2026-07-13T08:30:00Z')
    expect(insertedRows[0].fetched_at).toBe('2026-07-13T07:00:00Z')
  })

  it('maps all forecast fields correctly', async () => {
    mockLike.mockResolvedValue({ data: [makeCacheRow('31392', makePayload('31392', 1))], error: null })
    await projectVedurstofanCacheToProductTables()
    const row = (mockUpsertForecasts.mock.calls[0][0] as Record<string, unknown>[])[0]
    expect(row.station_id).toBe('31392')
    expect(row.wind_speed_ms).toBe(5)
    expect(row.wind_direction_text).toBe('N')
    expect(row.temperature_c).toBe(10)
    expect(row.weather_text).toBe('Skýjað')
  })

  it('filters out individual forecasts with empty ftimeIso but projects the rest', async () => {
    const payload = makePayload('31392', 2)
    payload.forecasts[0] = { ...payload.forecasts[0], ftimeIso: '' }
    mockLike.mockResolvedValue({ data: [makeCacheRow('31392', payload)], error: null })
    await projectVedurstofanCacheToProductTables()
    const rows = mockUpsertForecasts.mock.calls[0][0] as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows).toHaveLength(1)
  })
})

// ── Error handling ────────────────────────────────────────────────────────────

describe('projectVedurstofanCacheToProductTables — error handling', () => {
  it('cache scan failure returns errors:1, not errors:0', async () => {
    mockLike.mockResolvedValue({ data: null, error: { message: 'db error' } })
    const result = await projectVedurstofanCacheToProductTables()
    expect(result.errors).toBe(1)
    expect(result.projected).toBe(0)
  })

  it('cache scan exception returns errors:1', async () => {
    mockLike.mockRejectedValue(new Error('network failure'))
    const result = await projectVedurstofanCacheToProductTables()
    expect(result.errors).toBe(1)
  })

  it('upsert failure counts as error and does NOT delete existing rows', async () => {
    mockLike.mockResolvedValue({ data: [makeCacheRow('31392')], error: null })
    mockUpsertForecasts.mockResolvedValue({ error: { message: 'upsert failed' } })
    const result = await projectVedurstofanCacheToProductTables()
    expect(result.errors).toBe(1)
    expect(result.projected).toBe(0)
    // Delete must NOT be called — existing rows are preserved
    expect(mockDeleteLt).not.toHaveBeenCalled()
  })

  it('stale row delete failure does not count as error — upsert already succeeded', async () => {
    mockLike.mockResolvedValue({ data: [makeCacheRow('31392')], error: null })
    mockDeleteLt.mockResolvedValue({ error: { message: 'delete failed' } })
    const result = await projectVedurstofanCacheToProductTables()
    expect(result.errors).toBe(0)
    expect(result.projected).toBe(1)
  })

  it('is fail-open: one station error does not prevent others from projecting', async () => {
    mockLike.mockResolvedValue({
      data: [makeCacheRow('31392'), makeCacheRow('6300')],
      error: null,
    })
    mockUpsertForecasts
      .mockResolvedValueOnce({ error: { message: 'upsert failed' } })
      .mockResolvedValueOnce({ error: null })
    const result = await projectVedurstofanCacheToProductTables()
    expect(result.errors).toBe(1)
    expect(result.projected).toBe(1)
  })
})

// ── weather_fetch_runs ────────────────────────────────────────────────────────

describe('projectVedurstofanCacheToProductTables — weather_fetch_runs', () => {
  it('writes a fetch run record after projection', async () => {
    mockLike.mockResolvedValue({ data: [makeCacheRow('31392')], error: null })
    await projectVedurstofanCacheToProductTables()
    expect(mockInsertRunSelect).toHaveBeenCalledTimes(1)
  })

  it('returns runId from the inserted fetch run row', async () => {
    mockLike.mockResolvedValue({ data: [makeCacheRow('31392')], error: null })
    mockInsertRunSelect.mockResolvedValue({ data: { id: 42 }, error: null })
    const result = await projectVedurstofanCacheToProductTables()
    expect(result.runId).toBe(42)
  })

  it('returns runId even when cache scan fails', async () => {
    mockLike.mockResolvedValue({ data: null, error: { message: 'db error' } })
    mockInsertRunSelect.mockResolvedValue({ data: { id: 99 }, error: null })
    const result = await projectVedurstofanCacheToProductTables()
    expect(result.runId).toBe(99)
  })

  it('returns null runId if fetch run insert fails', async () => {
    mockLike.mockResolvedValue({ data: [makeCacheRow('31392')], error: null })
    mockInsertRunSelect.mockResolvedValue({ data: null, error: { message: 'insert failed' } })
    const result = await projectVedurstofanCacheToProductTables()
    expect(result.runId).toBeNull()
  })

  it('still returns projection results even if fetch run insert fails', async () => {
    mockLike.mockResolvedValue({ data: [makeCacheRow('31392')], error: null })
    mockInsertRunSelect.mockResolvedValue({ data: null, error: null })
    const result = await projectVedurstofanCacheToProductTables()
    expect(result.projected).toBe(1)
  })
})
