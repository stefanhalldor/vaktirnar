import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// ── Hoisted mock ───────────────────────────────────────────────────────────────

const { mockRange } = vi.hoisted(() => ({ mockRange: vi.fn() }))

// Table-aware admin mock. The product-table read chain is:
//   .from('vedurstofan_forecasts_latest')
//   .select(...).in(...).order(...).order(...).range(from, to)
//
// All intermediate methods return the same chainable object; range() is the
// terminal call and is the only one we need to inspect/control.

vi.mock('@/lib/supabase/admin', () => {
  const chain: Record<string, () => unknown> = {
    range: mockRange,
  }
  for (const m of ['select', 'in', 'order']) {
    chain[m] = () => chain
  }
  return { getAdmin: () => ({ from: () => chain }) }
})

import { readVedurstofanProductForStations } from '@/lib/weather/providers/vedurstofan.server'

// ── Fixtures ───────────────────────────────────────────────────────────────────

const FUTURE = new Date(Date.now() + 3_600_000).toISOString()
const FETCHED = '2026-07-13T10:00:00Z'

type Row = {
  station_id: string
  forecast_time: string
  wind_speed_ms: number | null
  wind_direction_text: string | null
  temperature_c: number | null
  precipitation_mm_per_hour: number | null
  weather_text: string | null
  atime: string | null
  expires_at: string | null
  fetched_at: string
}

function makeRow(stationId: string, ftimeHour: number, opts?: { stale?: boolean }): Row {
  return {
    station_id: stationId,
    forecast_time: `2026-07-13T${String(ftimeHour).padStart(2, '0')}:00:00Z`,
    wind_speed_ms: 5,
    wind_direction_text: 'N',
    temperature_c: 10,
    precipitation_mm_per_hour: 0,
    weather_text: 'Clear',
    atime: '2026-07-13T06:00:00Z',
    expires_at: opts?.stale ? '2026-07-12T00:00:00Z' : FUTURE,
    fetched_at: FETCHED,
  }
}

/**
 * Generates exactly 1000 rows: 100 stations × 10 forecast rows each.
 * Used to simulate a "full page" that should trigger a second fetch.
 */
function makeFullPage(): Row[] {
  const rows: Row[] = []
  for (let s = 1; s <= 100; s++) {
    for (let h = 0; h < 10; h++) {
      rows.push(makeRow(`S${s}`, h))
    }
  }
  return rows // exactly 1000 rows
}

beforeEach(() => vi.clearAllMocks())

// ── Pagination tests ───────────────────────────────────────────────────────────

describe('readVedurstofanProductForStations — pagination', () => {
  it('fetches a second page when first page has exactly 1000 rows', async () => {
    const page1 = makeFullPage() // 1000 rows → signals more data
    const page2 = [makeRow('S101', 0), makeRow('S101', 3)] // 2 rows → last page

    mockRange
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null })

    const stationIds = Array.from({ length: 101 }, (_, i) => `S${i + 1}`)
    const result = await readVedurstofanProductForStations(stationIds)

    expect(mockRange).toHaveBeenCalledTimes(2)
    // All 101 stations should be in the result
    expect(result.size).toBe(101)
  })

  it('rows from page 2 appear in the result map', async () => {
    const page1 = makeFullPage()
    const page2 = [makeRow('S101', 0), makeRow('S101', 3)]

    mockRange
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null })

    const stationIds = Array.from({ length: 101 }, (_, i) => `S${i + 1}`)
    const result = await readVedurstofanProductForStations(stationIds)

    const s101 = result.get('S101')
    expect(s101?.status).not.toBe('unavailable')
    if (s101?.status !== 'unavailable') {
      expect(s101?.payload.forecasts).toHaveLength(2)
    }
  })

  it('rows from page 1 are also present when second page exists', async () => {
    const page1 = makeFullPage()
    const page2 = [makeRow('S101', 0)]

    mockRange
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null })

    const stationIds = Array.from({ length: 101 }, (_, i) => `S${i + 1}`)
    const result = await readVedurstofanProductForStations(stationIds)

    const s1 = result.get('S1')
    expect(s1?.status).not.toBe('unavailable')
    if (s1?.status !== 'unavailable') {
      expect(s1?.payload.forecasts).toHaveLength(10) // 10 rows from page 1
    }
  })

  it('stops after a single page when it has fewer than 1000 rows', async () => {
    mockRange.mockResolvedValueOnce({
      data: [makeRow('S1', 0), makeRow('S1', 3)],
      error: null,
    })

    await readVedurstofanProductForStations(['S1', 'S2'])

    expect(mockRange).toHaveBeenCalledTimes(1)
  })

  it('returns partial map when a mid-pagination error occurs', async () => {
    const page1 = makeFullPage() // 1000 rows, stations S1-S100
    mockRange
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'db error' } })

    const stationIds = Array.from({ length: 101 }, (_, i) => `S${i + 1}`)
    const result = await readVedurstofanProductForStations(stationIds)

    // Stations from page 1 should still be mapped
    expect(result.get('S1')?.status).not.toBe('unavailable')
    // S101 had no rows fetched before the error
    expect(result.get('S101')?.status).toBe('unavailable')
  })

  it('never throws when all pages error', async () => {
    mockRange.mockResolvedValue({ data: null, error: { message: 'db down' } })

    await expect(
      readVedurstofanProductForStations(['S1', 'S2']),
    ).resolves.toBeDefined()
  })
})

// ── Status and field mapping ───────────────────────────────────────────────────

describe('readVedurstofanProductForStations — status and fields', () => {
  it('marks station as ok when expires_at is in the future', async () => {
    mockRange.mockResolvedValue({ data: [makeRow('S1', 0)], error: null })

    const result = await readVedurstofanProductForStations(['S1'])

    expect(result.get('S1')?.status).toBe('ok')
  })

  it('marks station as stale when expires_at is in the past', async () => {
    mockRange.mockResolvedValue({
      data: [makeRow('S1', 0, { stale: true })],
      error: null,
    })

    const result = await readVedurstofanProductForStations(['S1'])

    expect(result.get('S1')?.status).toBe('stale')
  })

  it('marks station as unavailable when it has no rows', async () => {
    mockRange.mockResolvedValue({ data: [makeRow('S1', 0)], error: null })

    const result = await readVedurstofanProductForStations(['S1', 'S2'])

    expect(result.get('S2')?.status).toBe('unavailable')
  })

  it('maps forecast fields correctly from product table columns', async () => {
    mockRange.mockResolvedValue({
      data: [{
        station_id: 'S1',
        forecast_time: '2026-07-13T12:00:00Z',
        wind_speed_ms: 7.5,
        wind_direction_text: 'SA',
        temperature_c: 14,
        precipitation_mm_per_hour: 0.2,
        weather_text: 'Skýjað',
        atime: '2026-07-13T06:00:00Z',
        expires_at: FUTURE,
        fetched_at: FETCHED,
      }],
      error: null,
    })

    const result = await readVedurstofanProductForStations(['S1'])
    const s1 = result.get('S1')

    if (!s1 || s1.status === 'unavailable') throw new Error('expected ok/stale')
    const f = s1.payload.forecasts[0]
    expect(f.ftimeIso).toBe('2026-07-13T12:00:00Z')
    expect(f.windSpeedMs).toBe(7.5)
    expect(f.windDirectionText).toBe('SA')
    expect(f.temperatureC).toBe(14)
    expect(f.precipitationMmPerHour).toBe(0.2)
    expect(f.weatherText).toBe('Skýjað')
    expect(s1.payload.atimeIso).toBe('2026-07-13T06:00:00Z')
    expect(s1.payload.fetchedAtIso).toBe(FETCHED)
  })

  it('returns empty map for empty stationIds list', async () => {
    const result = await readVedurstofanProductForStations([])
    expect(result.size).toBe(0)
    expect(mockRange).not.toHaveBeenCalled()
  })
})
