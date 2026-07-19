import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetAdmin } = vi.hoisted(() => ({ mockGetAdmin: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: mockGetAdmin,
}))

vi.mock('server-only', () => ({}))

import {
  buildPayloadFromHistoryRows,
  readVegagerdinCurrentWithHistoryFallback,
} from '@/lib/weather/providers/vegagerdinCurrent.server'
import type { VegagerdinHistoryDbRow } from '@/lib/weather/providers/vegagerdinCurrent.server'

// ── Fixture helpers ────────────────────────────────────────────────────────────

const BATCH_FETCH_AT = '2026-07-18T10:01:00.000Z'

function makeRow(overrides: Partial<VegagerdinHistoryDbRow> = {}): VegagerdinHistoryDbRow {
  return {
    station_id: 'S1',
    measured_at: '2026-07-18T10:00:00.000Z',
    station_name: 'Station One',
    lat: 64.1,
    lon: -21.9,
    mean_wind_ms: 5.0,
    gust_last_10_min_ms: 8.0,
    wind_direction_deg: 180.0,
    wind_direction_text: 'S',
    air_temperature_c: 12.0,
    road_temperature_c: 10.0,
    data_quality: 'complete',
    fetched_at: BATCH_FETCH_AT,
    last_fetched_at: BATCH_FETCH_AT,
    ...overrides,
  }
}

// ── Supabase chain builder ─────────────────────────────────────────────────────
//
// Returns exposed mock functions so tests can assert on query contract
// (which fields are filtered, how the query is ordered, etc.).

type HistoryChain = {
  fromFn: ReturnType<typeof vi.fn>
  // First query (find newest last_fetched_at)
  selectNewestFn: ReturnType<typeof vi.fn>
  gteCutoffFn: ReturnType<typeof vi.fn>   // .gte('last_fetched_at', cutoff)
  orderFn: ReturnType<typeof vi.fn>        // .order('last_fetched_at', ...)
  limitFn: ReturnType<typeof vi.fn>
  maybeSingleFn: ReturnType<typeof vi.fn>
  // Second query (fetch exact batch)
  selectBatchFn: ReturnType<typeof vi.fn>
  eqBatchFn: ReturnType<typeof vi.fn>     // .eq('last_fetched_at', newestValue)
}

function makeHistoryChain(
  newestRow: { last_fetched_at: string } | null,
  batchRows: VegagerdinHistoryDbRow[],
): HistoryChain {
  // First query: find newest last_fetched_at
  const maybeSingleFn = vi.fn().mockResolvedValue({ data: newestRow, error: null })
  const limitFn = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn })
  const orderFn = vi.fn().mockReturnValue({ limit: limitFn })
  const gteCutoffFn = vi.fn().mockReturnValue({ order: orderFn })
  const selectNewestFn = vi.fn().mockReturnValue({ gte: gteCutoffFn })

  // Second query: exact batch fetch
  const batchResult = Promise.resolve({ data: batchRows, error: null })
  const eqBatchFn = vi.fn().mockReturnValue(batchResult)
  const selectBatchFn = vi.fn().mockReturnValue({ eq: eqBatchFn })

  let callCount = 0
  const fromFn = vi.fn().mockImplementation(() => {
    callCount++
    if (callCount === 1) return { select: selectNewestFn }
    return { select: selectBatchFn }
  })

  return { fromFn, selectNewestFn, gteCutoffFn, orderFn, limitFn, maybeSingleFn, selectBatchFn, eqBatchFn }
}

function makeCacheChain(cacheRow: unknown) {
  const maybeSingleFn = vi.fn().mockResolvedValue({ data: cacheRow })
  const eqFn = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn })
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn })
  return vi.fn().mockReturnValue({ select: selectFn })
}

// ── buildPayloadFromHistoryRows ───────────────────────────────────────────────

describe('buildPayloadFromHistoryRows', () => {
  it('returns null for empty rows', () => {
    expect(buildPayloadFromHistoryRows([])).toBeNull()
  })

  it('maps a single row to a valid payload', () => {
    const row = makeRow()
    const payload = buildPayloadFromHistoryRows([row])

    expect(payload).not.toBeNull()
    expect(payload!.source).toBe('vegagerdin')
    expect(payload!.endpoint).toBe('vedur2014_1')
    expect(payload!.measurements).toHaveLength(1)

    const m = payload!.measurements[0]
    expect(m.stationId).toBe('S1')
    expect(m.stationName).toBe('Station One')
    expect(m.lat).toBe(64.1)
    expect(m.lon).toBe(-21.9)
    expect(m.measuredAtIso).toBe('2026-07-18T10:00:00.000Z')
    expect(m.fetchedAtIso).toBe(BATCH_FETCH_AT)
    expect(m.meanWindMs).toBe(5.0)
    expect(m.gustLast10MinMs).toBe(8.0)
    expect(m.windDirectionDeg).toBe(180.0)
    expect(m.windDirectionText).toBe('S')
    expect(m.airTemperatureC).toBe(12.0)
    expect(m.roadTemperatureC).toBe(10.0)
    expect(m.dataQuality).toBe('complete')
    expect(m.source).toBe('vegagerdin')
  })

  it('preserves null wind and temperature fields (does not coerce to 0)', () => {
    const row = makeRow({
      mean_wind_ms: null,
      gust_last_10_min_ms: null,
      wind_direction_deg: null,
      wind_direction_text: null,
      air_temperature_c: null,
      road_temperature_c: null,
      data_quality: 'partial',
    })
    const payload = buildPayloadFromHistoryRows([row])
    const m = payload!.measurements[0]

    expect(m.meanWindMs).toBeNull()
    expect(m.gustLast10MinMs).toBeNull()
    expect(m.windDirectionDeg).toBeNull()
    expect(m.windDirectionText).toBeNull()
    expect(m.airTemperatureC).toBeNull()
    expect(m.roadTemperatureC).toBeNull()
    expect(m.dataQuality).toBe('partial')
  })

  it('deduplicates by station_id keeping the row with the newest measured_at', () => {
    const older = makeRow({ station_id: 'S1', measured_at: '2026-07-18T09:00:00.000Z', mean_wind_ms: 3.0 })
    const newer = makeRow({ station_id: 'S1', measured_at: '2026-07-18T10:00:00.000Z', mean_wind_ms: 7.0 })
    const payload = buildPayloadFromHistoryRows([older, newer])

    expect(payload!.measurements).toHaveLength(1)
    expect(payload!.measurements[0].measuredAtIso).toBe('2026-07-18T10:00:00.000Z')
    expect(payload!.measurements[0].meanWindMs).toBe(7.0)
  })

  it('keeps distinct stations when station_ids differ', () => {
    const a = makeRow({ station_id: 'S1', measured_at: '2026-07-18T10:00:00.000Z' })
    const b = makeRow({ station_id: 'S2', measured_at: '2026-07-18T10:00:00.000Z', station_name: 'Station Two' })
    const payload = buildPayloadFromHistoryRows([a, b])

    expect(payload!.measurements).toHaveLength(2)
    const ids = payload!.measurements.map(m => m.stationId).sort()
    expect(ids).toEqual(['S1', 'S2'])
  })

  it('sets oldestMeasuredAtIso to the oldest measured_at across stations', () => {
    const s1 = makeRow({ station_id: 'S1', measured_at: '2026-07-18T10:00:00.000Z' })
    const s2 = makeRow({ station_id: 'S2', measured_at: '2026-07-18T09:30:00.000Z' })
    const payload = buildPayloadFromHistoryRows([s1, s2])

    expect(payload!.oldestMeasuredAtIso).toBe('2026-07-18T09:30:00.000Z')
  })

  it('sets payload fetchedAtIso to the newest last_fetched_at across rows', () => {
    const batchFetchAt = '2026-07-18T10:01:00.000Z'
    const laterFetch = '2026-07-18T10:03:00.000Z'
    const s1 = makeRow({ station_id: 'S1', last_fetched_at: batchFetchAt })
    const s2 = makeRow({ station_id: 'S2', last_fetched_at: laterFetch })
    const payload = buildPayloadFromHistoryRows([s1, s2])

    expect(payload!.fetchedAtIso).toBe(laterFetch)
  })

  it('maps partial dataQuality correctly', () => {
    const row = makeRow({ data_quality: 'partial', mean_wind_ms: null })
    const payload = buildPayloadFromHistoryRows([row])

    expect(payload!.measurements[0].dataQuality).toBe('partial')
  })

  // Key regression: stations with older measured_at but same last_fetched_at batch must be preserved.
  it('preserves all stations from the same batch even when measured_at differs widely', () => {
    const recentMeasurement = makeRow({
      station_id: 'S1',
      measured_at: '2026-07-18T10:00:00.000Z',
      last_fetched_at: BATCH_FETCH_AT,
    })
    // Station S2 hasn't reported a new measurement in 40 minutes but was in the same fetch
    const staleMeasurement = makeRow({
      station_id: 'S2',
      measured_at: '2026-07-18T09:20:00.000Z',  // 40 min older than S1
      last_fetched_at: BATCH_FETCH_AT,            // same batch
    })
    const payload = buildPayloadFromHistoryRows([recentMeasurement, staleMeasurement])

    expect(payload!.measurements).toHaveLength(2)
    const ids = payload!.measurements.map(m => m.stationId).sort()
    expect(ids).toEqual(['S1', 'S2'])
    expect(payload!.oldestMeasuredAtIso).toBe('2026-07-18T09:20:00.000Z')
    expect(payload!.fetchedAtIso).toBe(BATCH_FETCH_AT)
  })
})

// ── readVegagerdinCurrentWithHistoryFallback ──────────────────────────────────

describe('readVegagerdinCurrentWithHistoryFallback - history fallback path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('queries history by last_fetched_at (not measured_at) for newest batch anchor', async () => {
    const cacheFromFn = makeCacheChain(null)
    const historyRow = makeRow({ station_id: 'S1', last_fetched_at: BATCH_FETCH_AT })
    const { fromFn, gteCutoffFn, orderFn, eqBatchFn } = makeHistoryChain(
      { last_fetched_at: BATCH_FETCH_AT },
      [historyRow],
    )

    let callCount = 0
    mockGetAdmin.mockImplementation(() => {
      callCount++
      if (callCount === 1) return { from: cacheFromFn }
      return { from: fromFn }
    })

    await readVegagerdinCurrentWithHistoryFallback()

    // First history query: must filter by last_fetched_at (not measured_at)
    expect(gteCutoffFn).toHaveBeenCalledWith('last_fetched_at', expect.any(String))
    // First history query: must order by last_fetched_at descending
    expect(orderFn).toHaveBeenCalledWith('last_fetched_at', { ascending: false })
    // Second history query: must use exact batch match, not a window
    expect(eqBatchFn).toHaveBeenCalledWith('last_fetched_at', BATCH_FETCH_AT)
  })

  it('returns history_fallback when cache is missing and history has a recent batch', async () => {
    const cacheFromFn = makeCacheChain(null)
    const historyRow = makeRow({ station_id: 'S1', last_fetched_at: BATCH_FETCH_AT })
    const { fromFn } = makeHistoryChain({ last_fetched_at: BATCH_FETCH_AT }, [historyRow])

    let callCount = 0
    mockGetAdmin.mockImplementation(() => {
      callCount++
      if (callCount === 1) return { from: cacheFromFn }
      return { from: fromFn }
    })

    const result = await readVegagerdinCurrentWithHistoryFallback()

    expect(result.status).toBe('stale')
    if (result.status === 'stale') {
      expect(result.cacheStatus).toBe('history_fallback')
      expect(result.payload.measurements).toHaveLength(1)
      expect(result.payload.measurements[0].stationId).toBe('S1')
    }
  })

  it('returns unavailable when cache is missing and history is also empty', async () => {
    const cacheFromFn = makeCacheChain(null)
    const { fromFn } = makeHistoryChain(null, [])

    let callCount = 0
    mockGetAdmin.mockImplementation(() => {
      callCount++
      if (callCount === 1) return { from: cacheFromFn }
      return { from: fromFn }
    })

    const result = await readVegagerdinCurrentWithHistoryFallback()

    expect(result.status).toBe('unavailable')
  })

  it('returns fresh cache result without touching history when cache is fresh', async () => {
    const now = new Date().toISOString()
    const validPayload = {
      source: 'vegagerdin',
      endpoint: 'vedur2014_1',
      fetchedAtIso: now,
      oldestMeasuredAtIso: now,
      measurements: [
        {
          source: 'vegagerdin', stationId: 'S99', stationName: 'Fresh', lat: 64, lon: -21,
          measuredAtIso: now, fetchedAtIso: now, meanWindMs: 5, gustLast10MinMs: 8,
          windDirectionDeg: 180, windDirectionText: 'S', airTemperatureC: 10, roadTemperatureC: 8,
          dataQuality: 'complete',
        },
      ],
    }
    const cacheFromFn = makeCacheChain({ response_body: validPayload, fetched_at: now })

    mockGetAdmin.mockReturnValue({ from: cacheFromFn })

    const result = await readVegagerdinCurrentWithHistoryFallback()

    expect(result.status).toBe('fresh')
    if (result.status === 'fresh') {
      expect(result.cacheStatus).toBe('fresh')
    }
    // History must not have been touched — exactly one DB call (cache read)
    expect(mockGetAdmin).toHaveBeenCalledTimes(1)
  })

  // Regression: exact batch match prevents mixing rows from different cron runs.
  // If the second query used .gte (window) instead of .eq (exact), an older batch's
  // stations could appear alongside the newest batch when cron runs frequently.
  it('uses exact last_fetched_at match so older cron batches are not mixed in', async () => {
    const cacheFromFn = makeCacheChain(null)
    // Only S1 is in the newest batch; S2 is from an older batch 5 min earlier.
    // With exact .eq, only S1 should be returned (the mock returns only the rows we give it).
    const newestBatchRow = makeRow({ station_id: 'S1', last_fetched_at: BATCH_FETCH_AT })
    const { fromFn, eqBatchFn } = makeHistoryChain(
      { last_fetched_at: BATCH_FETCH_AT },
      [newestBatchRow],  // only newest batch rows returned by exact query
    )

    let callCount = 0
    mockGetAdmin.mockImplementation(() => {
      callCount++
      if (callCount === 1) return { from: cacheFromFn }
      return { from: fromFn }
    })

    const result = await readVegagerdinCurrentWithHistoryFallback()

    // Second query must be exact match, not a window
    expect(eqBatchFn).toHaveBeenCalledWith('last_fetched_at', BATCH_FETCH_AT)
    // Only newest batch stations returned
    if (result.status === 'stale') {
      expect(result.payload.measurements).toHaveLength(1)
      expect(result.payload.measurements[0].stationId).toBe('S1')
    }
  })
})
