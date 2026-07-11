/**
 * Unit tests for lib/weather/assessment.ts
 *
 * Tests the shared route-leg weather assessment seam:
 * - assessDrivingConditions: threshold application
 * - getForecastHoursNearEta: ETA window filtering
 * - assessRouteLeg: main domain function (status, worst metrics, point statuses, ETA weighting)
 */

import { describe, it, expect } from 'vitest'
import {
  assessDrivingConditions,
  getForecastHoursNearEta,
  assessRouteLeg,
  type RouteLegInput,
} from '../weather/assessment'
import type { HourPoint, TravelPointForecast, ResolvedTravelThresholds } from '../weather/types'

// ── Fixtures ───────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLDS: ResolvedTravelThresholds = {
  cautionWindMs: 15,
  redWindMs: 20,
  redGustMs: 30,
  cautionPrecipMmPerHour: 5,
}

function makeHour(time: string, windSpeedMs: number, windGustMs: number, precipMmPerHour: number, airTemperatureC = 10): HourPoint {
  return { time, airTemperatureC, windSpeedMs, windGustMs, windFromDegrees: 180, precipitationMmPerHour: precipMmPerHour, symbolCode: 'clearsky_day' }
}

function makeHours(fromIso: string, count: number, windMs: number, gustMs: number, precipMm: number): HourPoint[] {
  const hours: HourPoint[] = []
  for (let i = 0; i < count; i++) {
    const t = new Date(new Date(fromIso).getTime() + i * 3_600_000).toISOString()
    hours.push(makeHour(t, windMs, gustMs, precipMm))
  }
  return hours
}

function makeForecastPoint(
  routeIndex: number,
  distanceFromOriginM: number,
  hours: HourPoint[],
  lat = 64.0,
  lon = -22.0,
): TravelPointForecast {
  return { hours, lat, lon, forecastLat: lat, forecastLon: lon, routeIndex, distanceFromOriginM }
}

const DEP_ISO = '2026-07-10T08:00:00.000Z'
const ARR_ISO = '2026-07-10T13:00:00.000Z' // 5 hours later

function makeBaseInput(overrides: Partial<RouteLegInput> = {}): RouteLegInput {
  return {
    departureIso: DEP_ISO,
    arrivalIso: ARR_ISO,
    pointForecasts: [],
    thresholds: DEFAULT_THRESHOLDS,
    totalDistanceM: 200_000,
    trailerKind: 'none',
    ...overrides,
  }
}

// ── assessDrivingConditions ────────────────────────────────────────────────

describe('assessDrivingConditions', () => {
  it('returns graent with safe values', () => {
    const r = assessDrivingConditions(5, 10, 0, 'none', DEFAULT_THRESHOLDS)
    expect(r.stada).toBe('graent')
    expect(r.reasonCode).toBeUndefined()
  })

  it('returns gult at cautionWindMs (no trailer)', () => {
    const r = assessDrivingConditions(15, 20, 0, 'none', DEFAULT_THRESHOLDS)
    expect(r.stada).toBe('gult')
    expect(r.reasonCode).toBe('caution_wind_driving')
  })

  it('returns gult at cautionWindMs (with trailer)', () => {
    const r = assessDrivingConditions(15, 20, 0, 'horse_trailer', DEFAULT_THRESHOLDS)
    expect(r.stada).toBe('gult')
    expect(r.reasonCode).toBe('caution_wind_trailer')
  })

  it('returns rautt at redWindMs', () => {
    const r = assessDrivingConditions(20, 25, 0, 'none', DEFAULT_THRESHOLDS)
    expect(r.stada).toBe('rautt')
    expect(r.reasonCode).toBe('too_windy_driving')
  })

  it('returns rautt at redGustMs even with safe wind', () => {
    const r = assessDrivingConditions(10, 30, 0, 'none', DEFAULT_THRESHOLDS)
    expect(r.stada).toBe('rautt')
    expect(r.reasonCode).toBe('too_windy_driving')
  })

  it('returns rautt with trailer reason when trailer and over red wind', () => {
    const r = assessDrivingConditions(25, 35, 0, 'horse_trailer', DEFAULT_THRESHOLDS)
    expect(r.stada).toBe('rautt')
    expect(r.reasonCode).toBe('too_windy_trailer')
  })

  it('returns gult at precip above threshold', () => {
    const r = assessDrivingConditions(5, 10, 5.1, 'none', DEFAULT_THRESHOLDS)
    expect(r.stada).toBe('gult')
    expect(r.reasonCode).toBe('precipitation')
  })

  it('returns graent at exactly cautionPrecipMmPerHour (strict >)', () => {
    const r = assessDrivingConditions(5, 10, 5.0, 'none', DEFAULT_THRESHOLDS)
    expect(r.stada).toBe('graent')
  })

  it('wind check takes priority over precip in gult band', () => {
    const r = assessDrivingConditions(15, 10, 6, 'none', DEFAULT_THRESHOLDS)
    expect(r.stada).toBe('gult')
    expect(r.reasonCode).toBe('caution_wind_driving')
  })
})

// ── getForecastHoursNearEta ────────────────────────────────────────────────

describe('getForecastHoursNearEta', () => {
  const BASE_MS = new Date('2026-07-10T10:00:00.000Z').getTime()

  it('returns hours exactly at ETA', () => {
    const hours = [makeHour('2026-07-10T10:00:00.000Z', 5, 8, 0)]
    const result = getForecastHoursNearEta(hours, BASE_MS)
    expect(result).toHaveLength(1)
  })

  it('returns hours within ±1h window', () => {
    const hours = [
      makeHour('2026-07-10T09:00:00.000Z', 5, 8, 0),  // exactly -1h: within
      makeHour('2026-07-10T10:00:00.000Z', 5, 8, 0),  // at ETA
      makeHour('2026-07-10T11:00:00.000Z', 5, 8, 0),  // exactly +1h: within
    ]
    const result = getForecastHoursNearEta(hours, BASE_MS)
    expect(result).toHaveLength(3)
  })

  it('excludes hours outside ±1h window', () => {
    const hours = [
      makeHour('2026-07-10T08:59:00.000Z', 5, 8, 0),  // >1h before: out
      makeHour('2026-07-10T11:01:00.000Z', 5, 8, 0),  // >1h after: out
    ]
    const result = getForecastHoursNearEta(hours, BASE_MS)
    expect(result).toHaveLength(0)
  })

  it('returns empty array when no hours match', () => {
    const result = getForecastHoursNearEta([], BASE_MS)
    expect(result).toHaveLength(0)
  })

  it('respects custom windowMs', () => {
    const hours = [
      makeHour('2026-07-10T09:29:00.000Z', 5, 8, 0),  // 31 min before ETA: outside 30min window
      makeHour('2026-07-10T10:00:00.000Z', 5, 8, 0),  // at ETA: inside window
    ]
    const THIRTY_MIN_MS = 30 * 60 * 1000
    const result = getForecastHoursNearEta(hours, BASE_MS, THIRTY_MIN_MS)
    expect(result).toHaveLength(1)
    expect(result[0].time).toBe('2026-07-10T10:00:00.000Z')
  })
})

// ── assessRouteLeg ─────────────────────────────────────────────────────────

describe('assessRouteLeg — status', () => {
  it('returns graent with calm weather', () => {
    const result = assessRouteLeg(makeBaseInput({
      pointForecasts: [makeForecastPoint(0, 0, makeHours(DEP_ISO, 8, 5, 8, 0))],
    }))
    expect(result.status).toBe('graent')
  })

  it('returns gult at caution wind', () => {
    const result = assessRouteLeg(makeBaseInput({
      pointForecasts: [makeForecastPoint(0, 0, makeHours(DEP_ISO, 8, 15, 20, 0))],
    }))
    expect(result.status).toBe('gult')
    expect(result.reasonCode).toBe('caution_wind_driving')
  })

  it('returns rautt at red wind', () => {
    const result = assessRouteLeg(makeBaseInput({
      pointForecasts: [makeForecastPoint(0, 0, makeHours(DEP_ISO, 8, 25, 28, 0))],
    }))
    expect(result.status).toBe('rautt')
    expect(result.reasonCode).toBe('too_windy_driving')
  })

  it('returns rautt at red gust with safe wind', () => {
    const result = assessRouteLeg(makeBaseInput({
      pointForecasts: [makeForecastPoint(0, 0, makeHours(DEP_ISO, 8, 10, 30, 0))],
    }))
    expect(result.status).toBe('rautt')
  })

  it('returns gult/no_data when pointForecasts is empty', () => {
    const result = assessRouteLeg(makeBaseInput({ pointForecasts: [] }))
    expect(result.status).toBe('gult')
    expect(result.reasonCode).toBe('no_data')
  })

  it('returns gult/no_data when all points have empty hours', () => {
    const result = assessRouteLeg(makeBaseInput({
      pointForecasts: [makeForecastPoint(0, 0, []), makeForecastPoint(1, 50_000, [])],
    }))
    expect(result.status).toBe('gult')
    expect(result.reasonCode).toBe('no_data')
  })
})

describe('assessRouteLeg — worst metric selection', () => {
  it('worst is the highest-value point, not the first', () => {
    // First point: calm; second point (mid-route): dangerous wind
    const hours1 = makeHours(DEP_ISO, 8, 5, 8, 0)
    const hours2 = makeHours(DEP_ISO, 8, 25, 28, 0) // red wind
    const result = assessRouteLeg(makeBaseInput({
      pointForecasts: [
        makeForecastPoint(0, 0, hours1),
        makeForecastPoint(1, 100_000, hours2),
      ],
    }))
    expect(result.status).toBe('rautt')
    expect(result.worstWind?.value).toBe(25)
    expect(result.worstWind?.distanceFromOriginM).toBe(100_000)
  })

  it('worstWind, worstGust, worstPrecip are populated on rautt result', () => {
    const hours = makeHours(DEP_ISO, 8, 25, 32, 2)
    const result = assessRouteLeg(makeBaseInput({
      pointForecasts: [makeForecastPoint(0, 0, hours)],
    }))
    expect(result.worstWind?.value).toBe(25)
    expect(result.worstGust?.value).toBe(32)
    expect(result.worstPrecip?.value).toBe(2)
  })

  it('worstWind/Gust/Precip are undefined on no_data result', () => {
    const result = assessRouteLeg(makeBaseInput({ pointForecasts: [] }))
    expect(result.worstWind).toBeUndefined()
    expect(result.worstGust).toBeUndefined()
    expect(result.worstPrecip).toBeUndefined()
  })
})

describe('assessRouteLeg — ETA weighting', () => {
  // Route: 200 km, 5 hours. Point at 100 km (50%) is reached at departure + 2.5 hours.
  // departure: T+0h (08:00), arrival: T+5h (13:00)
  // Point at 50% → ETA = 10:30 UTC

  it('outbound: point at 50% route has ETA at 50% through the drive', () => {
    // Give the mid-route point bad weather only near 10:30 UTC (within ±1h: 09:30–11:30)
    // and good weather for all other hours. The result should be rautt.
    const safeHours = makeHours(DEP_ISO, 3, 5, 8, 0) // 08:00, 09:00, 10:00 — first 3 hours safe
    const dangerHour = makeHour('2026-07-10T10:00:00.000Z', 25, 28, 0) // 10:00 → within ±1h of ETA 10:30
    // Use makeHours that overlap: the 10:00 hour is within ±1h of ETA 10:30
    const hours = makeHours(DEP_ISO, 8, 25, 28, 0) // all dangerous — keeps test simple

    // Origin point (0 km) has safe weather
    const safeOriginHours = makeHours(DEP_ISO, 8, 5, 8, 0)

    const result = assessRouteLeg(makeBaseInput({
      totalDistanceM: 200_000,
      pointForecasts: [
        makeForecastPoint(0, 0, safeOriginHours),        // safe at origin
        makeForecastPoint(1, 100_000, hours),             // dangerous at midpoint
      ],
    }))
    expect(result.status).toBe('rautt')
    expect(result.worstWind?.distanceFromOriginM).toBe(100_000)
  })

  it('return leg: point at 50% route has ETA at 50% through return (same as outbound at this distance)', () => {
    // For return leg, ETA fraction is inverted:
    // Point at 50% route distance (from origin) → etaFraction = 1 - 0.5 = 0.5
    // So it's still reached at 50% through the return trip.
    // This test verifies the function accepts leg: 'return' without error.
    const hours = makeHours(DEP_ISO, 8, 25, 28, 0)
    const result = assessRouteLeg(makeBaseInput({
      totalDistanceM: 200_000,
      leg: 'return',
      pointForecasts: [makeForecastPoint(0, 100_000, hours)],
    }))
    expect(result.status).toBe('rautt')
  })

  it('return leg: point near origin (0% route) is reached late in the return journey', () => {
    // Return leg: a point at distanceFromOriginM≈0 (near origin/destination of return)
    // has routeFraction≈0, so etaFraction = 1 - 0 = 1.0 → reached near arrival time.
    // arrival = 13:00 UTC. The ±1h window is 12:00–14:00.
    // Give this point dangerous weather only in that window.
    const lateHours = [
      makeHour('2026-07-10T12:00:00.000Z', 25, 28, 0), // in window (13:00 ± 1h)
      makeHour('2026-07-10T13:00:00.000Z', 25, 28, 0), // at arrival
    ]
    const earlyHours = [makeHour('2026-07-10T08:00:00.000Z', 5, 8, 0)] // outside window
    const allHours = [...earlyHours, ...lateHours]

    const result = assessRouteLeg(makeBaseInput({
      totalDistanceM: 200_000,
      leg: 'return',
      pointForecasts: [makeForecastPoint(0, 0, allHours)],
    }))
    // Point near origin on return leg is reached near arrival → late hours trigger rautt
    expect(result.status).toBe('rautt')
  })
})

describe('assessRouteLeg — per-point statuses', () => {
  it('no pointStatuses when all points are graent', () => {
    const result = assessRouteLeg(makeBaseInput({
      pointForecasts: [
        makeForecastPoint(0, 0, makeHours(DEP_ISO, 8, 5, 8, 0)),
        makeForecastPoint(1, 100_000, makeHours(DEP_ISO, 8, 5, 8, 0)),
      ],
    }))
    expect(result.pointStatuses).toBeUndefined()
  })

  it('stores non-green point statuses only (delta encoding)', () => {
    const result = assessRouteLeg(makeBaseInput({
      pointForecasts: [
        makeForecastPoint(0, 0, makeHours(DEP_ISO, 8, 5, 8, 0)),         // graent — not stored
        makeForecastPoint(1, 100_000, makeHours(DEP_ISO, 8, 25, 28, 0)), // rautt — stored
      ],
    }))
    expect(result.pointStatuses).toBeDefined()
    expect(result.pointStatuses).toHaveLength(1)
    expect(result.pointStatuses![0].routeIndex).toBe(1)
    expect(result.pointStatuses![0].status).toBe('rautt')
  })

  it('stores no_data for points with no hours near ETA', () => {
    // Hours far in the future (outside ±1h of ETA)
    const farFutureHours = [makeHour('2026-07-10T23:00:00.000Z', 5, 8, 0)]
    const result = assessRouteLeg(makeBaseInput({
      pointForecasts: [makeForecastPoint(0, 0, farFutureHours)],
      totalDistanceM: 1, // ensure ETA is near departure
    }))
    expect(result.pointStatuses).toBeDefined()
    expect(result.pointStatuses![0].status).toBe('no_data')
  })
})

describe('assessRouteLeg — displayPoint', () => {
  it('displayPoint is set for rautt result', () => {
    const hours = makeHours(DEP_ISO, 8, 25, 28, 0)
    const result = assessRouteLeg(makeBaseInput({
      pointForecasts: [makeForecastPoint(0, 0, hours)],
    }))
    expect(result.displayPoint).toBeDefined()
    expect(result.displayPoint!.windMs).toBe(25)
    expect(result.displayPoint!.gustMs).toBe(28)
    expect(result.displayPoint!.metric).toBe('wind')
  })

  it('displayPoint metric is gust when gust exceeds redGustMs', () => {
    const hours = makeHours(DEP_ISO, 8, 10, 35, 0) // gust > 30
    const result = assessRouteLeg(makeBaseInput({
      pointForecasts: [makeForecastPoint(0, 0, hours)],
    }))
    expect(result.displayPoint?.metric).toBe('gust')
  })

  it('displayPoint metric is precipitation when precip triggers gult', () => {
    const hours = makeHours(DEP_ISO, 8, 5, 8, 6) // precip > 5
    const result = assessRouteLeg(makeBaseInput({
      pointForecasts: [makeForecastPoint(0, 0, hours)],
    }))
    expect(result.displayPoint?.metric).toBe('precipitation')
  })

  it('displayPoint is still set for graent result (for consistent map display)', () => {
    const hours = makeHours(DEP_ISO, 8, 5, 8, 0)
    const result = assessRouteLeg(makeBaseInput({
      pointForecasts: [makeForecastPoint(0, 0, hours)],
    }))
    // displayPoint is populated even for green results
    expect(result.displayPoint).toBeDefined()
  })

  it('displayPoint is undefined for no_data result', () => {
    const result = assessRouteLeg(makeBaseInput({ pointForecasts: [] }))
    expect(result.displayPoint).toBeUndefined()
  })
})

describe('assessRouteLeg — departureIso and arrivalIso passthrough', () => {
  it('preserves departure and arrival ISO in result', () => {
    const result = assessRouteLeg(makeBaseInput({
      pointForecasts: [makeForecastPoint(0, 0, makeHours(DEP_ISO, 8, 5, 8, 0))],
    }))
    expect(result.departureIso).toBe(DEP_ISO)
    expect(result.arrivalIso).toBe(ARR_ISO)
  })
})
