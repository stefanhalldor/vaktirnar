import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  classifyObservationWindDisplayStatus,
  classifyNowAnchoredForecastWindDisplayStatus,
  classifyForecastWindDisplayStatusAt,
  selectForecastRowAt,
  DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES,
} from '@/lib/weather/windDisplayStatus'
import type { ResolvedTravelThresholds } from '@/lib/weather/types'

// Wide thresholds used in observation tests — not the production driving defaults (10/15).
const wideThresholds: ResolvedTravelThresholds = {
  cautionWindMs: 15,
  redWindMs: 25,
  redGustMs: 35,
  cautionPrecipMmPerHour: 5,
}

// Use the new 10/15 defaults that match the production configuration.
const tightThresholds: ResolvedTravelThresholds = {
  cautionWindMs: 10,
  redWindMs: 15,
  redGustMs: 35,
  cautionPrecipMmPerHour: 5,
}

describe('classifyObservationWindDisplayStatus', () => {
  it('returns no_data when both meanWindMs and gustLast10MinMs are null', () => {
    expect(classifyObservationWindDisplayStatus({ meanWindMs: null }, wideThresholds)).toBe('no_data')
  })

  it('returns innan-marka for calm wind well below caution', () => {
    expect(classifyObservationWindDisplayStatus({ meanWindMs: 5 }, wideThresholds)).toBe('innan-marka')
  })

  it('returns nalgast-othaegindi for wind within 2 m/s below caution (14 m/s with caution=15)', () => {
    expect(classifyObservationWindDisplayStatus({ meanWindMs: 14 }, wideThresholds)).toBe('nalgast-othaegindi')
  })

  it('returns othaegilegt for wind at caution threshold', () => {
    expect(classifyObservationWindDisplayStatus({ meanWindMs: 15 }, wideThresholds)).toBe('othaegilegt')
  })

  it('returns othaegilegt for wind between caution and near-danger', () => {
    expect(classifyObservationWindDisplayStatus({ meanWindMs: 18 }, wideThresholds)).toBe('othaegilegt')
  })

  it('returns nalgast-haettumork for wind within 2 m/s below danger (24 m/s with red=25)', () => {
    expect(classifyObservationWindDisplayStatus({ meanWindMs: 24 }, wideThresholds)).toBe('nalgast-haettumork')
  })

  it('returns haettulegt for wind at danger threshold', () => {
    expect(classifyObservationWindDisplayStatus({ meanWindMs: 25 }, wideThresholds)).toBe('haettulegt')
  })

  it('returns haettulegt for wind above danger threshold', () => {
    expect(classifyObservationWindDisplayStatus({ meanWindMs: 40 }, wideThresholds)).toBe('haettulegt')
  })

  it('prefers current-observation gusts over calm mean wind when gust data exists', () => {
    expect(
      classifyObservationWindDisplayStatus(
        { meanWindMs: 5, gustLast10MinMs: 25 },
        wideThresholds,
      ),
    ).toBe('haettulegt')
  })

  it('uses current-observation gusts even when mean wind is absent', () => {
    expect(
      classifyObservationWindDisplayStatus(
        { meanWindMs: null, gustLast10MinMs: 18 },
        wideThresholds,
      ),
    ).toBe('othaegilegt')
  })

  it('falls back to mean wind when current-observation gust data is absent', () => {
    expect(
      classifyObservationWindDisplayStatus(
        { meanWindMs: 24, gustLast10MinMs: null },
        wideThresholds,
      ),
    ).toBe('nalgast-haettumork')
  })

  it('stale measurements with wind data still classify correctly - not no_data', () => {
    // Regression guard: measurementFreshness='stale' must NOT make the marker grey.
    // classifyObservationWindDisplayStatus only takes wind measurement values - freshness is not an input.
    expect(classifyObservationWindDisplayStatus({ meanWindMs: 12 }, wideThresholds)).toBe('innan-marka')
    expect(classifyObservationWindDisplayStatus({ meanWindMs: 20 }, wideThresholds)).toBe('othaegilegt')
  })

  it('respects custom thresholds', () => {
    const tight: ResolvedTravelThresholds = {
      cautionWindMs: 10,
      redWindMs: 15,
      redGustMs: 18,
      cautionPrecipMmPerHour: 5,
    }
    expect(classifyObservationWindDisplayStatus({ meanWindMs: 12 }, tight)).toBe('othaegilegt')
    expect(classifyObservationWindDisplayStatus({ meanWindMs: 15 }, tight)).toBe('haettulegt')
    expect(classifyObservationWindDisplayStatus({ meanWindMs: 5 }, tight)).toBe('innan-marka')
  })
})

// ── classifyNowAnchoredForecastWindDisplayStatus ────────────────────────────

describe('classifyNowAnchoredForecastWindDisplayStatus', () => {
  const NOW_ISO = '2026-07-18T13:00:00.000Z'
  const NOW_MS = new Date(NOW_ISO).getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW_MS)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns no_data when forecasts array is empty', () => {
    expect(
      classifyNowAnchoredForecastWindDisplayStatus([], wideThresholds),
    ).toBe('no_data')
  })

  it('returns no_data when the closest row has null wind', () => {
    const forecasts = [
      { ftimeIso: NOW_ISO, windSpeedMs: null },
      { ftimeIso: '2026-07-18T15:00:00.000Z', windSpeedMs: 5 },
    ]
    expect(
      classifyNowAnchoredForecastWindDisplayStatus(forecasts, wideThresholds),
    ).toBe('no_data')
  })

  it('uses at-or-before semantics: picks the latest past slot, not the closest future', () => {
    // NOW is 13:00. At-or-before picks 10:00 (the latest slot ≤ now).
    // The 13:01 slot is 1 min in the future and is NOT selected (it's after now).
    const forecasts = [
      { ftimeIso: '2026-07-18T10:00:00.000Z', windSpeedMs: 30 }, // latest at-or-before → selected
      { ftimeIso: '2026-07-18T13:01:00.000Z', windSpeedMs: 5 },  // future — not selected
    ]
    // 30 m/s with wideThresholds (red=25) → haettulegt
    expect(
      classifyNowAnchoredForecastWindDisplayStatus(forecasts, wideThresholds),
    ).toBe('haettulegt')
  })

  it('picks the past row when a future row also exists', () => {
    // NOW is 13:00. Row at 12:59 is at-or-before; row at 15:00 is future.
    const forecasts = [
      { ftimeIso: '2026-07-18T12:59:00.000Z', windSpeedMs: 5 },  // at-or-before → selected
      { ftimeIso: '2026-07-18T15:00:00.000Z', windSpeedMs: 30 }, // future — not selected
    ]
    expect(
      classifyNowAnchoredForecastWindDisplayStatus(forecasts, wideThresholds),
    ).toBe('innan-marka')
  })

  it('handles a single forecast row', () => {
    const forecasts = [{ ftimeIso: NOW_ISO, windSpeedMs: 20 }]
    // 20 m/s with wideThresholds (caution=15, red=25) → othaegilegt
    expect(
      classifyNowAnchoredForecastWindDisplayStatus(forecasts, wideThresholds),
    ).toBe('othaegilegt')
  })

  it('classifies caution boundary the same as other status surfaces (10/15 thresholds)', () => {
    // cautionWindMs=10: wind at exactly 10 → othaegilegt
    const at10 = [{ ftimeIso: NOW_ISO, windSpeedMs: 10 }]
    expect(
      classifyNowAnchoredForecastWindDisplayStatus(at10, tightThresholds),
    ).toBe('othaegilegt')
  })

  it('classifies danger boundary the same as other status surfaces (10/15 thresholds)', () => {
    // redWindMs=15: wind at exactly 15 → haettulegt
    const at15 = [{ ftimeIso: NOW_ISO, windSpeedMs: 15 }]
    expect(
      classifyNowAnchoredForecastWindDisplayStatus(at15, tightThresholds),
    ).toBe('haettulegt')
  })

  it('classifies calm wind as innan-marka', () => {
    const forecasts = [{ ftimeIso: NOW_ISO, windSpeedMs: 3 }]
    expect(
      classifyNowAnchoredForecastWindDisplayStatus(forecasts, tightThresholds),
    ).toBe('innan-marka')
  })

  it('returns no_data when the single row has null wind even with a past timestamp', () => {
    const forecasts = [{ ftimeIso: '2026-07-18T10:00:00.000Z', windSpeedMs: null }]
    expect(
      classifyNowAnchoredForecastWindDisplayStatus(forecasts, wideThresholds),
    ).toBe('no_data')
  })

  it('produces same result as classifyForecastWindDisplayStatusAt with Date.now() anchor (wrapper parity)', () => {
    const forecasts = [
      { ftimeIso: '2026-07-18T12:00:00.000Z', windSpeedMs: 20 }, // at-or-before now=13:00
      { ftimeIso: '2026-07-18T15:00:00.000Z', windSpeedMs: 5 },  // future
    ]
    const viaWrapper = classifyNowAnchoredForecastWindDisplayStatus(forecasts, wideThresholds)
    const viaExplicit = classifyForecastWindDisplayStatusAt(forecasts, wideThresholds, NOW_MS)
    expect(viaWrapper).toBe(viaExplicit)
  })
})

// ── classifyForecastWindDisplayStatusAt ─────────────────────────────────────

describe('classifyForecastWindDisplayStatusAt', () => {
  const ANCHOR_ISO = '2026-07-18T13:00:00.000Z'
  const ANCHOR_MS = new Date(ANCHOR_ISO).getTime()

  it('returns no_data for empty forecasts', () => {
    expect(classifyForecastWindDisplayStatusAt([], wideThresholds, ANCHOR_MS)).toBe('no_data')
  })

  it('returns no_data when the selected row has null wind', () => {
    const forecasts = [
      { ftimeIso: '2026-07-18T12:00:00.000Z', windSpeedMs: null },
    ]
    expect(classifyForecastWindDisplayStatusAt(forecasts, wideThresholds, ANCHOR_MS)).toBe('no_data')
  })

  it('selects the slot exactly at anchor (at-or-before = equal counts)', () => {
    const forecasts = [
      { ftimeIso: ANCHOR_ISO, windSpeedMs: 5 },
      { ftimeIso: '2026-07-18T16:00:00.000Z', windSpeedMs: 30 },
    ]
    expect(classifyForecastWindDisplayStatusAt(forecasts, wideThresholds, ANCHOR_MS)).toBe('innan-marka')
  })

  it('selects the latest slot at-or-before anchor, not the first', () => {
    // Anchor 13:00; slots 09:00 (haettulegt) and 12:00 (calm) → picks 12:00 (newest ≤ anchor)
    const forecasts = [
      { ftimeIso: '2026-07-18T09:00:00.000Z', windSpeedMs: 30 },
      { ftimeIso: '2026-07-18T12:00:00.000Z', windSpeedMs: 5 },
    ]
    expect(classifyForecastWindDisplayStatusAt(forecasts, wideThresholds, ANCHOR_MS)).toBe('innan-marka')
  })

  it('falls back to the first future slot when no at-or-before slot exists', () => {
    // Anchor 06:00; all slots are in the future
    const anchorMs = new Date('2026-07-18T06:00:00.000Z').getTime()
    const forecasts = [
      { ftimeIso: '2026-07-18T09:00:00.000Z', windSpeedMs: 5 },  // first future
      { ftimeIso: '2026-07-18T12:00:00.000Z', windSpeedMs: 30 }, // later future
    ]
    expect(classifyForecastWindDisplayStatusAt(forecasts, wideThresholds, anchorMs)).toBe('innan-marka')
  })

  it('returns no_data when fallback future slot has null wind', () => {
    const anchorMs = new Date('2026-07-18T06:00:00.000Z').getTime()
    const forecasts = [{ ftimeIso: '2026-07-18T09:00:00.000Z', windSpeedMs: null }]
    expect(classifyForecastWindDisplayStatusAt(forecasts, wideThresholds, anchorMs)).toBe('no_data')
  })

  it('classifies correctly using provided thresholds (tight 10/15)', () => {
    const forecasts = [{ ftimeIso: ANCHOR_ISO, windSpeedMs: 12 }]
    // 12 m/s with tightThresholds (caution=10, red=15) → othaegilegt
    expect(classifyForecastWindDisplayStatusAt(forecasts, tightThresholds, ANCHOR_MS)).toBe('othaegilegt')
  })

  it('handles a single past slot correctly (no future fallback needed)', () => {
    const forecasts = [{ ftimeIso: '2026-07-18T12:00:00.000Z', windSpeedMs: 20 }]
    // 20 m/s with wideThresholds (caution=15, red=25) → othaegilegt
    expect(classifyForecastWindDisplayStatusAt(forecasts, wideThresholds, ANCHOR_MS)).toBe('othaegilegt')
  })
})

// ── selectForecastRowAt ──────────────────────────────────────────────────────

describe('selectForecastRowAt', () => {
  const ANCHOR_ISO = '2026-07-18T13:00:00.000Z'
  const ANCHOR_MS = new Date(ANCHOR_ISO).getTime()

  it('returns null for empty array', () => {
    expect(selectForecastRowAt([], ANCHOR_MS)).toBeNull()
  })

  it('returns 0 for a single slot at anchor', () => {
    expect(selectForecastRowAt([{ ftimeIso: ANCHOR_ISO }], ANCHOR_MS)).toBe(0)
  })

  it('returns the index of the latest slot at-or-before anchor', () => {
    const forecasts = [
      { ftimeIso: '2026-07-18T09:00:00.000Z' }, // idx 0 — past
      { ftimeIso: '2026-07-18T12:00:00.000Z' }, // idx 1 — latest at-or-before
      { ftimeIso: '2026-07-18T15:00:00.000Z' }, // idx 2 — future
    ]
    expect(selectForecastRowAt(forecasts, ANCHOR_MS)).toBe(1)
  })

  it('falls back to the first future slot index when no at-or-before slot exists', () => {
    const anchorMs = new Date('2026-07-18T06:00:00.000Z').getTime()
    const forecasts = [
      { ftimeIso: '2026-07-18T09:00:00.000Z' }, // idx 0 — first future
      { ftimeIso: '2026-07-18T12:00:00.000Z' }, // idx 1 — later future
    ]
    expect(selectForecastRowAt(forecasts, anchorMs)).toBe(0)
  })

  it('returns null when array is empty regardless of anchor', () => {
    expect(selectForecastRowAt([], 0)).toBeNull()
    expect(selectForecastRowAt([], Infinity)).toBeNull()
  })
})

// ── DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES ───────────────────────────────────

describe('DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES', () => {
  it('includes all four actionable statuses', () => {
    expect(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES.has('nalgast-othaegindi')).toBe(true)
    expect(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES.has('othaegilegt')).toBe(true)
    expect(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES.has('nalgast-haettumork')).toBe(true)
    expect(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES.has('haettulegt')).toBe(true)
  })

  it('excludes low-signal statuses hidden by default', () => {
    expect(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES.has('innan-marka')).toBe(false)
    expect(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES.has('no_data')).toBe(false)
    expect(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES.has('no_wind_data')).toBe(false)
  })
})
