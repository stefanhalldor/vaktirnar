import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockGetAdmin } = vi.hoisted(() => ({ mockGetAdmin: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: mockGetAdmin,
}))

vi.mock('server-only', () => ({}))

import { parseVegagerdinResponse, readVegagerdinCurrentFromCache, getMeasurementFreshness, buildSafeShapeInfo } from '@/lib/weather/providers/vegagerdinCurrent.server'

// ── Fixture data ───────────────────────────────────────────────────────────────
//
// Field names verified against live Vegagerðin vedur2014_1 response 2026-07-18.

const FETCHED_AT = '2026-07-17T12:00:00.000Z'

const FIXTURE_COMPLETE = {
  Nr: '1234',
  Nafn: 'Hellisheiðarvegur - HW1',
  Breidd: '64.0100',
  Lengd: '-21.3500',
  Dags: '2026-07-17 11:50:00',
  Vindhradi: 10.5,
  Vindhvida: 15.2,
  VindattAsc: 180,
  Vindatt: 'S',
  Hiti: 8.5,
  Veghiti: 6.2,
}

const FIXTURE_NULL_GUST = {
  Nr: '5678',
  Nafn: 'Öxnadalsheiði',
  Breidd: '65.5500',
  Lengd: '-18.2800',
  Dags: '2026-07-17 11:40:00',
  Vindhradi: 7.0,
  Vindhvida: null,
  VindattAsc: 270,
  Vindatt: 'W',
  Hiti: 3.0,
  Veghiti: null,
}

const FIXTURE_STRING_NUMBERS = {
  Nr: 9999,
  Nafn: 'Stykki',
  Breidd: '65.1000',
  Lengd: '-22.7300',
  Dags: '2026-07-17 11:30:00',
  Vindhradi: '12',
  Vindhvida: '18',
  VindattAsc: '90',
  Vindatt: 'E',
  Hiti: '4',
  Veghiti: '2',
}

const FIXTURE_ALL_NULLS = {
  Nr: '7777',
  Nafn: 'TestNull',
  Breidd: '64.0000',
  Lengd: '-22.0000',
  Dags: null,
  Vindhradi: null,
  Vindhvida: null,
  VindattAsc: null,
  Vindatt: null,
  Hiti: null,
  Veghiti: null,
}

function makeBody(items: unknown[]): string {
  return JSON.stringify(items)
}

// ── Parser: basic cases ────────────────────────────────────────────────────────

describe('parseVegagerdinResponse - basic parsing', () => {
  it('parses a complete station row correctly', () => {
    const measurements = parseVegagerdinResponse(makeBody([FIXTURE_COMPLETE]), FETCHED_AT)
    expect(measurements).toHaveLength(1)
    const m = measurements[0]
    expect(m.source).toBe('vegagerdin')
    expect(m.stationId).toBe('1234')
    expect(m.stationName).toBe('Hellisheiðarvegur - HW1')
    expect(m.lat).toBe(64.01)
    expect(m.lon).toBe(-21.35)
    expect(m.fetchedAtIso).toBe(FETCHED_AT)
    expect(m.dataQuality).toBe('complete')
  })

  it('returns empty array for invalid JSON', () => {
    const result = parseVegagerdinResponse('not json', FETCHED_AT)
    expect(result).toEqual([])
  })

  it('returns empty array for unexpected shape (plain object)', () => {
    const result = parseVegagerdinResponse(JSON.stringify({ foo: 'bar' }), FETCHED_AT)
    expect(result).toEqual([])
  })

  it('returns empty array for empty array response', () => {
    const result = parseVegagerdinResponse('[]', FETCHED_AT)
    expect(result).toEqual([])
  })

  it('accepts response wrapped in results key', () => {
    const body = JSON.stringify({ results: [FIXTURE_COMPLETE] })
    const result = parseVegagerdinResponse(body, FETCHED_AT)
    expect(result).toHaveLength(1)
  })

  it('accepts response wrapped in data key', () => {
    const body = JSON.stringify({ data: [FIXTURE_COMPLETE] })
    const result = parseVegagerdinResponse(body, FETCHED_AT)
    expect(result).toHaveLength(1)
  })
})

// ── Parser: Vindhradi vs Vindhvida semantics ──────────────────────────────────

describe('parseVegagerdinResponse - Vindhradi vs Vindhvida', () => {
  it('maps Vindhradi to meanWindMs (mean/sustained wind)', () => {
    const [m] = parseVegagerdinResponse(makeBody([FIXTURE_COMPLETE]), FETCHED_AT)
    expect(m.meanWindMs).toBe(10.5)
  })

  it('maps Vindhvida to gustLast10MinMs (recent gust, NOT forecast gust)', () => {
    const [m] = parseVegagerdinResponse(makeBody([FIXTURE_COMPLETE]), FETCHED_AT)
    expect(m.gustLast10MinMs).toBe(15.2)
  })

  it('Vindhvida null stays null — never becomes 0', () => {
    const [m] = parseVegagerdinResponse(makeBody([FIXTURE_NULL_GUST]), FETCHED_AT)
    expect(m.gustLast10MinMs).toBeNull()
    expect(m.gustLast10MinMs).not.toBe(0)
  })

  it('meanWindMs null stays null when Vindhradi is absent', () => {
    const item = { ...FIXTURE_COMPLETE, Vindhradi: null }
    const [m] = parseVegagerdinResponse(makeBody([item]), FETCHED_AT)
    expect(m.meanWindMs).toBeNull()
    expect(m.meanWindMs).not.toBe(0)
  })
})

// ── Parser: null handling ─────────────────────────────────────────────────────

describe('parseVegagerdinResponse - null handling', () => {
  it('null numeric fields stay null, never become 0', () => {
    const [m] = parseVegagerdinResponse(makeBody([FIXTURE_ALL_NULLS]), FETCHED_AT)
    expect(m.meanWindMs).toBeNull()
    expect(m.gustLast10MinMs).toBeNull()
    expect(m.windDirectionDeg).toBeNull()
    expect(m.airTemperatureC).toBeNull()
    expect(m.roadTemperatureC).toBeNull()
  })

  it('row with all null numeric fields is dataQuality partial', () => {
    const [m] = parseVegagerdinResponse(makeBody([FIXTURE_ALL_NULLS]), FETCHED_AT)
    expect(m.dataQuality).toBe('partial')
  })

  it('row with null gust only is partial', () => {
    const [m] = parseVegagerdinResponse(makeBody([FIXTURE_NULL_GUST]), FETCHED_AT)
    expect(m.dataQuality).toBe('partial')
  })

  it('row with all required numeric fields is complete', () => {
    const [m] = parseVegagerdinResponse(makeBody([FIXTURE_COMPLETE]), FETCHED_AT)
    expect(m.dataQuality).toBe('complete')
  })

  it('skips rows with no station ID', () => {
    const item = { ...FIXTURE_COMPLETE, Nr: null }
    const result = parseVegagerdinResponse(makeBody([item]), FETCHED_AT)
    expect(result).toHaveLength(0)
  })

  it('skips rows with no coordinates', () => {
    const item = { ...FIXTURE_COMPLETE, Breidd: null, Lengd: null }
    const result = parseVegagerdinResponse(makeBody([item]), FETCHED_AT)
    expect(result).toHaveLength(0)
  })
})

// ── Parser: string numbers ────────────────────────────────────────────────────

describe('parseVegagerdinResponse - string number coercion', () => {
  it('parses numeric strings for all wind fields', () => {
    const [m] = parseVegagerdinResponse(makeBody([FIXTURE_STRING_NUMBERS]), FETCHED_AT)
    expect(m.meanWindMs).toBe(12)
    expect(m.gustLast10MinMs).toBe(18)
    expect(m.windDirectionDeg).toBe(90)
    expect(m.airTemperatureC).toBe(4)
    expect(m.roadTemperatureC).toBe(2)
  })

  it('numeric station ID is stringified to stationId', () => {
    const [m] = parseVegagerdinResponse(makeBody([FIXTURE_STRING_NUMBERS]), FETCHED_AT)
    expect(m.stationId).toBe('9999')
  })

  it('empty string numeric fields return null', () => {
    const item = { ...FIXTURE_COMPLETE, Vindhradi: '', Vindhvida: '' }
    const [m] = parseVegagerdinResponse(makeBody([item]), FETCHED_AT)
    expect(m.meanWindMs).toBeNull()
    expect(m.gustLast10MinMs).toBeNull()
  })
})

// ── Parser: Dags / time handling ──────────────────────────────────────────────

describe('parseVegagerdinResponse - Dags time parsing', () => {
  it('parses Dags in YYYY-MM-DD HH:mm:ss format as UTC ISO', () => {
    const [m] = parseVegagerdinResponse(makeBody([FIXTURE_COMPLETE]), FETCHED_AT)
    // '2026-07-17 11:50:00' → '2026-07-17T11:50:00.000Z' (Iceland = UTC)
    expect(m.measuredAtIso).toBe('2026-07-17T11:50:00.000Z')
  })

  it('falls back to fetchedAtIso when Dags is null', () => {
    const [m] = parseVegagerdinResponse(makeBody([FIXTURE_ALL_NULLS]), FETCHED_AT)
    expect(m.measuredAtIso).toBe(FETCHED_AT)
  })

  it('falls back to fetchedAtIso when Dags is blank string', () => {
    const item = { ...FIXTURE_COMPLETE, Dags: '   ' }
    const [m] = parseVegagerdinResponse(makeBody([item]), FETCHED_AT)
    expect(m.measuredAtIso).toBe(FETCHED_AT)
  })

  it('fetchedAtIso is always preserved separately from measuredAtIso', () => {
    const [m] = parseVegagerdinResponse(makeBody([FIXTURE_COMPLETE]), FETCHED_AT)
    expect(m.fetchedAtIso).toBe(FETCHED_AT)
    expect(m.measuredAtIso).not.toBe(FETCHED_AT)
  })
})

// ── Parser: multi-row ─────────────────────────────────────────────────────────

describe('parseVegagerdinResponse - multiple rows', () => {
  it('parses multiple rows independently', () => {
    const result = parseVegagerdinResponse(
      makeBody([FIXTURE_COMPLETE, FIXTURE_NULL_GUST, FIXTURE_STRING_NUMBERS]),
      FETCHED_AT,
    )
    expect(result).toHaveLength(3)
    expect(result[0].stationId).toBe('1234')
    expect(result[1].stationId).toBe('5678')
    expect(result[2].stationId).toBe('9999')
  })

  it('skips invalid rows without affecting valid ones', () => {
    const items = [
      FIXTURE_COMPLETE,
      { ...FIXTURE_NULL_GUST, Nr: null }, // invalid
      FIXTURE_STRING_NUMBERS,
    ]
    const result = parseVegagerdinResponse(makeBody(items), FETCHED_AT)
    expect(result).toHaveLength(2)
    expect(result[0].stationId).toBe('1234')
    expect(result[1].stationId).toBe('9999')
  })
})

// ── readVegagerdinCurrentFromCache ─────────────────────────────────────────────

describe('readVegagerdinCurrentFromCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeAdminMock(cacheRow: unknown) {
    const maybeSingleFn = vi.fn().mockResolvedValue({ data: cacheRow })
    const eqFn = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn })
    const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
    mockGetAdmin.mockReturnValue({ from: vi.fn().mockReturnValue({ select: selectFn }) })
  }

  it('returns unavailable when no cache row exists', async () => {
    makeAdminMock(null)
    const result = await readVegagerdinCurrentFromCache()
    expect(result.status).toBe('unavailable')
  })

  it('returns fresh when cache is within 2-minute TTL', async () => {
    const now = new Date().toISOString()
    const freshPayload = {
      source: 'vegagerdin',
      endpoint: 'vedur2014_1',
      fetchedAtIso: now,
      oldestMeasuredAtIso: now,
      measurements: [],
    }
    const row = { response_body: freshPayload, fetched_at: now }
    makeAdminMock(row)
    const result = await readVegagerdinCurrentFromCache()
    expect(result.status).toBe('fresh')
    if (result.status === 'fresh') {
      expect(result.cacheStatus).toBe('fresh')
      // measurement is very recent — should be 'fresh'
      expect(result.measurementFreshness).toBe('fresh')
    }
  })

  it('returns stale when cache is 5 minutes old (within 30-minute window)', async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const stalePayload = {
      source: 'vegagerdin',
      endpoint: 'vedur2014_1',
      fetchedAtIso: fiveMinAgo,
      oldestMeasuredAtIso: null,
      measurements: [],
    }
    const row = { response_body: stalePayload, fetched_at: fiveMinAgo }
    makeAdminMock(row)
    const result = await readVegagerdinCurrentFromCache()
    expect(result.status).toBe('stale')
    if (result.status === 'stale') {
      expect(result.cacheStatus).toBe('stale')
      // no oldestMeasuredAtIso → measurementFreshness is 'unknown'
      expect(result.measurementFreshness).toBe('unknown')
    }
  })

  it('fresh cache with old measurements returns fresh cacheStatus but stale measurementFreshness', async () => {
    const now = new Date().toISOString()
    const oldMeasurement = new Date(Date.now() - 40 * 60 * 1000).toISOString()
    const payload = {
      source: 'vegagerdin',
      endpoint: 'vedur2014_1',
      fetchedAtIso: now,
      oldestMeasuredAtIso: oldMeasurement,
      measurements: [],
    }
    const row = { response_body: payload, fetched_at: now }
    makeAdminMock(row)
    const result = await readVegagerdinCurrentFromCache()
    expect(result.status).toBe('fresh')
    if (result.status === 'fresh') {
      expect(result.cacheStatus).toBe('fresh')
      // measurements are 40 min old — stations stopped reporting
      expect(result.measurementFreshness).toBe('stale')
    }
  })

  it('returns unavailable when cache is older than 30 minutes', async () => {
    const oldTime = new Date(Date.now() - 31 * 60 * 1000).toISOString()
    const oldPayload = {
      source: 'vegagerdin',
      endpoint: 'vedur2014_1',
      fetchedAtIso: oldTime,
      oldestMeasuredAtIso: null,
      measurements: [],
    }
    const row = {
      response_body: oldPayload,
      fetched_at: oldTime,
    }
    makeAdminMock(row)
    const result = await readVegagerdinCurrentFromCache()
    expect(result.status).toBe('unavailable')
  })

  it('returns unavailable when cache row has wrong source', async () => {
    const row = {
      response_body: { source: 'vedurstofan', measurements: [] },
      fetched_at: new Date().toISOString(),
    }
    makeAdminMock(row)
    const result = await readVegagerdinCurrentFromCache()
    expect(result.status).toBe('unavailable')
  })

  it('returns unavailable when getAdmin throws', async () => {
    mockGetAdmin.mockImplementation(() => { throw new Error('db down') })
    const result = await readVegagerdinCurrentFromCache()
    expect(result.status).toBe('unavailable')
  })
})

// ── getMeasurementFreshness ────────────────────────────────────────────────────

describe('getMeasurementFreshness - measurement staleness from oldest observation', () => {
  it('returns unknown when oldestMeasuredAtIso is null', () => {
    expect(getMeasurementFreshness(null)).toBe('unknown')
  })

  it('returns unknown when oldestMeasuredAtIso is an unparseable string', () => {
    expect(getMeasurementFreshness('not-a-date')).toBe('unknown')
  })

  it('returns fresh when oldest measurement is under 15 minutes ago', () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    expect(getMeasurementFreshness(tenMinAgo)).toBe('fresh')
  })

  it('returns aging when oldest measurement is 15-30 minutes ago', () => {
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    expect(getMeasurementFreshness(twentyMinAgo)).toBe('aging')
  })

  it('returns stale when oldest measurement is over 30 minutes ago', () => {
    const fortyMinAgo = new Date(Date.now() - 40 * 60 * 1000).toISOString()
    expect(getMeasurementFreshness(fortyMinAgo)).toBe('stale')
  })

  it('is distinct from cache freshness — fresh cache can have stale measurements', () => {
    // Cache freshness is based on fetch time (2-minute TTL).
    // Measurement freshness is based on station observation time (15-minute threshold).
    // If stations stopped reporting but we just fetched, cache is fresh, measurements are stale.
    const staleMeasurementTime = new Date(Date.now() - 45 * 60 * 1000).toISOString()
    expect(getMeasurementFreshness(staleMeasurementTime)).toBe('stale')
  })
})

// ── buildSafeShapeInfo ────────────────────────────────────────────────────────

describe('buildSafeShapeInfo', () => {
  it('returns array kind with itemCount and firstItemKeys for a top-level array', () => {
    const raw = [{ Maelir_nr: '1', Nafn: 'A', Lat: '64', Lon: '-21' }]
    const info = buildSafeShapeInfo(raw)
    expect(info.topLevelKind).toBe('array')
    expect(info.itemCount).toBe(1)
    expect(info.firstItemKeys).toContain('Maelir_nr')
    expect(info.firstItemKeys).toContain('Nafn')
  })

  it('returns array kind with itemCount 0 and no firstItemKeys for empty array', () => {
    const info = buildSafeShapeInfo([])
    expect(info.topLevelKind).toBe('array')
    expect(info.itemCount).toBe(0)
    expect(info.firstItemKeys).toBeUndefined()
  })

  it('returns object kind with topLevelKeys for a plain object', () => {
    const raw = { status: 'ok', count: 5 }
    const info = buildSafeShapeInfo(raw)
    expect(info.topLevelKind).toBe('object')
    expect(info.topLevelKeys).toEqual(['status', 'count'])
    expect(info.firstItemKeys).toBeUndefined()
  })

  it('returns object kind with firstItemKeys when object wraps an array', () => {
    const raw = { results: [{ Maelir_nr: '1', Dags: '2026-07-18' }] }
    const info = buildSafeShapeInfo(raw)
    expect(info.topLevelKind).toBe('object')
    expect(info.topLevelKeys).toContain('results')
    expect(info.itemCount).toBe(1)
    expect(info.firstItemKeys).toContain('Maelir_nr')
    expect(info.firstItemKeys).toContain('Dags')
  })

  it('returns object kind with firstItemKeys when wrapper key is "data"', () => {
    const raw = { data: [{ Id: 1, Value: 2 }], meta: {} }
    const info = buildSafeShapeInfo(raw)
    expect(info.topLevelKind).toBe('object')
    expect(info.itemCount).toBe(1)
    expect(info.firstItemKeys).toContain('Id')
  })

  it('returns other kind for primitives', () => {
    expect(buildSafeShapeInfo('string').topLevelKind).toBe('other')
    expect(buildSafeShapeInfo(42).topLevelKind).toBe('other')
    expect(buildSafeShapeInfo(null).topLevelKind).toBe('other')
  })
})
