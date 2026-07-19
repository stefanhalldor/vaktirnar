import { describe, it, expect } from 'vitest'
import {
  toLngLat,
  markerStyleForStatus,
  initialSelectedIndex,
  formatKlTime,
  formatNum,
  buildPointSummary,
  isSameCoordinatePair,
  shouldShowForecastPointMarker,
  candidateToIssue,
  derivePointWeatherForCandidate,
  buildThresholdContext,
  selectNearestVedurstofanRow,
  formatLongDepartureDateTime,
  formatCompactDateTime,
  resolveRoutePointWindDisplayStatus,
} from '@/components/weather/travelAuditMap.helpers'
import type { RouteWeatherPoint, TravelIssue, TravelCandidate, ForecastDrawerRow } from '@/lib/weather/types'
import { resolveThresholds } from '@/lib/weather/thresholds'

function makeWeatherPoint(
  overrides: Partial<RouteWeatherPoint> = {},
): RouteWeatherPoint {
  return {
    id: 'rwp_0',
    routeIndex: 0,
    totalRouteWeatherPoints: 3,
    lat: 64.0,
    lon: -22.0,
    forecastLat: 64.0,
    forecastLon: -22.0,
    distanceFromOriginM: 0,
    routeFraction: 0,
    googleMapsUrl: 'https://maps.google.com/?q=64.0,-22.0',
    metnoUrl: 'https://api.met.no/?lat=64.0&lon=-22.0',
    yrnoUrl: 'https://www.yr.no/en/forecast/daily-table/64.0,-22.0',
    ...overrides,
  }
}

describe('toLngLat', () => {
  it('converts { lat, lon } to { lat, lng }', () => {
    expect(toLngLat({ lat: 64.1, lon: -22.3 })).toEqual({ lat: 64.1, lng: -22.3 })
  })

  it('preserves decimal precision', () => {
    const result = toLngLat({ lat: 65.6835, lon: -18.0878 })
    expect(result.lat).toBeCloseTo(65.6835, 4)
    expect(result.lng).toBeCloseTo(-18.0878, 4)
  })
})

describe('markerStyleForStatus', () => {
  it('returns red for rautt', () => {
    const s = markerStyleForStatus('rautt', false)
    expect(s.color).toBe('#dc2626')
    expect(s.zIndex).toBe(8)
  })

  it('returns amber for gult', () => {
    const s = markerStyleForStatus('gult', false)
    expect(s.color).toBe('#f59e0b')
    expect(s.zIndex).toBe(7)
  })

  it('returns green for graent', () => {
    const s = markerStyleForStatus('graent', false)
    expect(s.color).toBe('#2d5a27')
  })

  it('returns green for undefined status', () => {
    const s = markerStyleForStatus(undefined, false)
    expect(s.color).toBe('#2d5a27')
  })

  it('returns status-based color with higher scale and zIndex for highlighted', () => {
    const s = markerStyleForStatus('graent', true)
    expect(s.color).toBe('#2d5a27') // keeps green color, does not force red
    expect(s.scale).toBeGreaterThan(1)
    expect(s.zIndex).toBe(10)
  })

  it('highlighted preserves individual status color', () => {
    expect(markerStyleForStatus('graent', true).color).toBe('#2d5a27')
    expect(markerStyleForStatus('gult', true).color).toBe('#f59e0b')
    expect(markerStyleForStatus('rautt', true).color).toBe('#dc2626')
  })
})

describe('initialSelectedIndex', () => {
  const pt0 = makeWeatherPoint({ lat: 64.0, lon: -22.0, routeIndex: 0, isOrigin: true })
  const pt1 = makeWeatherPoint({ lat: 64.5, lon: -21.0, routeIndex: 1 })
  const pt2 = makeWeatherPoint({ lat: 65.0, lon: -19.0, routeIndex: 2, isDestinationClosest: true })

  it('returns 0 for empty array', () => {
    expect(initialSelectedIndex([])).toBe(0)
  })

  it('returns 0 when no highlighted issue and no destination', () => {
    const pts = [pt0, pt1]
    expect(initialSelectedIndex(pts)).toBe(0)
  })

  it('prefers highlighted issue point', () => {
    const issue: TravelIssue = { leg: 'outbound', metric: 'wind', lat: 64.5, lon: -21.0 }
    expect(initialSelectedIndex([pt0, pt1, pt2], issue)).toBe(1)
  })

  it('falls back to destination-closest when no highlighted issue', () => {
    expect(initialSelectedIndex([pt0, pt1, pt2])).toBe(2)
  })

  it('falls back to first point when highlighted lat/lon not found', () => {
    const issue: TravelIssue = { leg: 'outbound', metric: 'wind', lat: 99.0, lon: 99.0 }
    expect(initialSelectedIndex([pt0, pt1], issue)).toBe(0)
  })

  it('skips destination with isOrigin=true', () => {
    // A point that is both isDestinationClosest and isOrigin should not be chosen as dest fallback
    const onlyOriginDest = makeWeatherPoint({ isOrigin: true, isDestinationClosest: true })
    expect(initialSelectedIndex([onlyOriginDest])).toBe(0)
  })
})

describe('formatKlTime', () => {
  it('formats UTC ISO as HH:mm', () => {
    expect(formatKlTime('2026-07-10T17:00:00Z')).toBe('17:00')
  })

  it('pads single-digit hours and minutes', () => {
    expect(formatKlTime('2026-07-10T08:05:00Z')).toBe('08:05')
  })

  it('handles midnight', () => {
    expect(formatKlTime('2026-07-10T00:00:00Z')).toBe('00:00')
  })
})

describe('buildPointSummary', () => {
  const ptNoSummary = makeWeatherPoint({
    routeIndex: 1,
    totalRouteWeatherPoints: 5,
    lat: 64.5,
    lon: -21.0,
    distanceFromOriginM: 150_000,
  })

  const ptWithSummary = makeWeatherPoint({
    routeIndex: 2,
    totalRouteWeatherPoints: 5,
    lat: 65.0,
    lon: -19.0,
    distanceFromOriginM: 300_000,
    isDestinationClosest: true,
    summaryForWindow: {
      status: 'gult',
      worstWindMs: 14.5,
      worstGustMs: 18.2,
      worstPrecipMmPerHour: 0.3,
      decisiveMetric: 'wind',
      decisiveTimeIso: '2026-07-10T16:00:00Z',
    },
  })

  it('maps routeIndex and totalPoints', () => {
    const s = buildPointSummary(ptNoSummary)
    expect(s.routeIndex).toBe(1)
    expect(s.totalPoints).toBe(5)
  })

  it('computes distanceFromOriginKm', () => {
    const s = buildPointSummary(ptNoSummary)
    expect(s.distanceFromOriginKm).toBe(150)
  })

  it('returns zero weather values when summaryForWindow is absent', () => {
    const s = buildPointSummary(ptNoSummary)
    expect(s.windMs).toBe(0)
    expect(s.gustMs).toBe(0)
    expect(s.precipMmPerHour).toBe(0)
    expect(s.status).toBeUndefined()
    expect(s.decisiveTimeFormatted).toBeUndefined()
  })

  it('extracts weather values from summaryForWindow', () => {
    const s = buildPointSummary(ptWithSummary)
    expect(s.windMs).toBeCloseTo(14.5)
    expect(s.gustMs).toBeCloseTo(18.2)
    expect(s.precipMmPerHour).toBeCloseTo(0.3)
    expect(s.status).toBe('gult')
    expect(s.decisiveTimeFormatted).toBe('16:00')
  })

  it('marks isDestination correctly', () => {
    const s = buildPointSummary(ptWithSummary)
    expect(s.isDestination).toBe(true)
    expect(s.isOrigin).toBe(false)
  })

  it('isHighlighted false when lat/lon do not match highlightedIssue', () => {
    const issue: TravelIssue = { leg: 'outbound', metric: 'wind', lat: 99.0, lon: 99.0 }
    const s = buildPointSummary(ptWithSummary, issue)
    expect(s.isHighlighted).toBe(false)
  })

  it('isHighlighted true when lat/lon match highlightedIssue', () => {
    const issue: TravelIssue = { leg: 'outbound', metric: 'wind', lat: 65.0, lon: -19.0 }
    const s = buildPointSummary(ptWithSummary, issue)
    expect(s.isHighlighted).toBe(true)
  })

  it('includes yrnoUrl, googleMapsUrl, metnoUrl', () => {
    const s = buildPointSummary(ptNoSummary)
    expect(s.yrnoUrl).toContain('yr.no')
    expect(s.googleMapsUrl).toContain('maps.google.com')
    expect(s.metnoUrl).toContain('met.no')
  })

  it('includes routeLat, routeLon, forecastLat, forecastLon', () => {
    const s = buildPointSummary(ptNoSummary)
    expect(s.routeLat).toBe(64.5)
    expect(s.routeLon).toBe(-21.0)
    expect(s.forecastLat).toBe(64.0)
    expect(s.forecastLon).toBe(-22.0)
  })

  it('hasSeparateForecastPoint false when route and forecast are same', () => {
    const pt = makeWeatherPoint({ lat: 64.5, lon: -21.0, forecastLat: 64.5, forecastLon: -21.0 })
    const s = buildPointSummary(pt)
    expect(s.hasSeparateForecastPoint).toBe(false)
  })

  it('hasSeparateForecastPoint true when forecast is far from route', () => {
    // ptNoSummary has lat:64.5,lon:-21.0 vs forecastLat:64.0,forecastLon:-22.0 — very far apart
    const s = buildPointSummary(ptNoSummary)
    expect(s.hasSeparateForecastPoint).toBe(true)
  })

  it('forecastDistanceFromRouteM is 0 when route and forecast coords are identical', () => {
    const pt = makeWeatherPoint({ lat: 64.5, lon: -21.0, forecastLat: 64.5, forecastLon: -21.0 })
    const s = buildPointSummary(pt)
    expect(s.forecastDistanceFromRouteM).toBe(0)
  })

  it('forecastDistanceFromRouteM is positive when coords differ', () => {
    // ptNoSummary: route 64.5,-21.0 vs forecast 64.0,-22.0 — clearly different grid points
    const s = buildPointSummary(ptNoSummary)
    expect(s.forecastDistanceFromRouteM).toBeGreaterThan(1000)
  })

  it('forecastDistanceFromRouteM is within expected range for a ~2km offset', () => {
    // ~0.02 deg lat ≈ 2222m, ~0.02 deg lon at 64.5 ≈ 960m → total ~2420m
    const pt = makeWeatherPoint({ lat: 64.5, lon: -21.0, forecastLat: 64.52, forecastLon: -21.02 })
    const s = buildPointSummary(pt)
    expect(s.forecastDistanceFromRouteM).toBeGreaterThan(1500)
    expect(s.forecastDistanceFromRouteM).toBeLessThan(3500)
  })
})

describe('isSameCoordinatePair', () => {
  it('returns true for identical coordinates', () => {
    expect(isSameCoordinatePair({ lat: 64.0, lng: -22.0 }, { lat: 64.0, lng: -22.0 })).toBe(true)
  })

  it('returns true when within default 150m tolerance', () => {
    // ~0.001 degree lat ≈ 111m
    expect(isSameCoordinatePair({ lat: 64.0, lng: -22.0 }, { lat: 64.001, lng: -22.0 })).toBe(true)
  })

  it('returns false when beyond default 150m tolerance', () => {
    // ~0.01 degree lat ≈ 1110m
    expect(isSameCoordinatePair({ lat: 64.0, lng: -22.0 }, { lat: 64.01, lng: -22.0 })).toBe(false)
  })

  it('respects custom tolerance', () => {
    // ~111m apart: true at 200m tolerance, false at 50m tolerance
    expect(isSameCoordinatePair({ lat: 64.0, lng: -22.0 }, { lat: 64.001, lng: -22.0 }, 200)).toBe(true)
    expect(isSameCoordinatePair({ lat: 64.0, lng: -22.0 }, { lat: 64.001, lng: -22.0 }, 50)).toBe(false)
  })
})

describe('shouldShowForecastPointMarker', () => {
  it('returns false when route and forecast coords are essentially the same', () => {
    const pt = makeWeatherPoint({ lat: 64.5, lon: -21.0, forecastLat: 64.5, forecastLon: -21.0 })
    expect(shouldShowForecastPointMarker(pt)).toBe(false)
  })

  it('returns true when forecast is on a different grid point (typical met.no rounding)', () => {
    // lat:64.5,lon:-21.0 vs forecastLat:64.0,forecastLon:-22.0 — clearly different
    const pt = makeWeatherPoint({ lat: 64.5, lon: -21.0, forecastLat: 64.0, forecastLon: -22.0 })
    expect(shouldShowForecastPointMarker(pt)).toBe(true)
  })
})

describe('initialSelectedIndex with activeCandidate.displayPoint', () => {
  const pts = [
    makeWeatherPoint({ routeIndex: 0, isOrigin: true }),
    makeWeatherPoint({ routeIndex: 1, lat: 64.5, lon: -21.0 }),
    makeWeatherPoint({ routeIndex: 2, isDestinationClosest: true }),
  ]

  it('prefers displayPoint.routeIndex over worstWind when activeCandidate has displayPoint', () => {
    const candidate: TravelCandidate = {
      departureIso: '2026-07-10T09:00:00Z',
      arrivalIso: '2026-07-10T14:00:00Z',
      status: 'graent',
      displayPoint: {
        routeIndex: 1,
        forecastTimeIso: '2026-07-10T11:00:00Z',
        windMs: 6,
        gustMs: 8,
        precipMmPerHour: 0,
        airTemperatureC: 7,
        metric: 'wind',
        distanceFromOriginM: 100_000,
        routeFraction: 0.5,
      },
      worstWind: { value: 6, timeIso: '2026-07-10T11:00:00Z', routeIndex: 2 },
    }
    expect(initialSelectedIndex(pts, undefined, candidate)).toBe(1)
  })

  it('falls back to worstWind when displayPoint is absent', () => {
    const candidate: TravelCandidate = {
      departureIso: '2026-07-10T09:00:00Z',
      arrivalIso: '2026-07-10T14:00:00Z',
      status: 'graent',
      worstWind: { value: 6, timeIso: '2026-07-10T11:00:00Z', routeIndex: 2 },
    }
    expect(initialSelectedIndex(pts, undefined, candidate)).toBe(2)
  })
})

describe('buildPointSummary with activeCandidate displayPoint', () => {
  const ptDisplay = makeWeatherPoint({
    routeIndex: 2,
    totalRouteWeatherPoints: 5,
    lat: 64.5,
    lon: -21.0,
    summaryForWindow: {
      status: 'gult',
      worstWindMs: 14.5,
      worstGustMs: 18.2,
      worstPrecipMmPerHour: 0.3,
      decisiveTimeIso: '2026-07-10T08:00:00Z',
    },
  })

  const candidate: TravelCandidate = {
    departureIso: '2026-07-10T09:00:00Z',
    arrivalIso: '2026-07-10T14:00:00Z',
    status: 'graent',
    displayPoint: {
      routeIndex: 2,
      forecastTimeIso: '2026-07-10T11:00:00Z',
      windMs: 6.2,
      gustMs: 8.1,
      precipMmPerHour: 0.1,
      airTemperatureC: 7.5,
      metric: 'wind',
      distanceFromOriginM: 300_000,
      routeFraction: 0.75,
    },
  }

  it('uses displayPoint values when routeIndex matches', () => {
    const s = buildPointSummary(ptDisplay, undefined, candidate, 'outbound')
    expect(s.windMs).toBeCloseTo(6.2)
    expect(s.gustMs).toBeCloseTo(8.1)
    expect(s.precipMmPerHour).toBeCloseTo(0.1)
    expect(s.decisiveTempC).toBeCloseTo(7.5)
    expect(s.decisiveTimeFormatted).toBe('11:00')
  })

  it('does not use stale summaryForWindow metrics when displayPoint matches', () => {
    const s = buildPointSummary(ptDisplay, undefined, candidate, 'outbound')
    expect(s.windMs).not.toBeCloseTo(14.5)
    expect(s.gustMs).not.toBeCloseTo(18.2)
    expect(s.decisiveTimeFormatted).not.toBe('08:00')
  })

  it('uses nearest forecastRows ETA values for a non-displayPoint active-candidate point', () => {
    const forecastRows: ForecastDrawerRow[] = [
      {
        timeIso: '2026-07-10T10:00:00Z', // ETA = 09:00 + 0.2*5h = 10:00 → this row wins
        status: 'graent',
        wind: { value: 9.5, direction: 'steady', tone: 'neutral' },
        gust: { value: 12.0, severity: 'none', direction: 'steady', tone: 'neutral' },
        precipitation: { value: 0.2, direction: 'steady', tone: 'neutral' },
        temperature: { value: 6.0, direction: 'steady', tone: 'neutral' },
      },
      {
        timeIso: '2026-07-10T11:00:00Z',
        status: 'graent',
        wind: { value: 11.0, direction: 'steady', tone: 'neutral' },
        gust: { value: 14.0, severity: 'none', direction: 'steady', tone: 'neutral' },
        precipitation: { value: 0.5, direction: 'steady', tone: 'neutral' },
        temperature: { value: 5.5, direction: 'steady', tone: 'neutral' },
      },
    ]
    // routeIndex 3, not the displayPoint (routeIndex 2)
    // candidate: dep 09:00, arr 14:00, 5h outbound, routeFraction 0.2 → ETA = 09:00 + 0.2*5h = 10:00
    const otherPt = makeWeatherPoint({
      routeIndex: 3,
      totalRouteWeatherPoints: 5,
      routeFraction: 0.2,
      summaryForWindow: {
        status: 'gult',
        worstWindMs: 14.5,
        worstGustMs: 18.2,
        worstPrecipMmPerHour: 0.3,
        decisiveTimeIso: '2026-07-10T08:00:00Z',
      },
      forecastRows,
    })
    const s = buildPointSummary(otherPt, undefined, candidate, 'outbound')
    // Should use the 10:00 forecast row (nearest to ETA 10:00), not stale summaryForWindow
    expect(s.windMs).toBeCloseTo(9.5)
    expect(s.gustMs).toBeCloseTo(12.0)
    expect(s.precipMmPerHour).toBeCloseTo(0.2)
    expect(s.decisiveTempC).toBeCloseTo(6.0)
    expect(s.forecastTimeIso).toBe('2026-07-10T10:00:00Z')
    expect(s.decisiveTimeFormatted).toBe('10:00')
    // Must not use stale summaryForWindow values
    expect(s.windMs).not.toBeCloseTo(14.5)
    expect(s.decisiveTimeFormatted).not.toBe('08:00')
  })

  it('returns zero metrics for a non-displayPoint active-candidate point with no forecastRows', () => {
    const otherPt = makeWeatherPoint({
      routeIndex: 3,
      totalRouteWeatherPoints: 5,
      summaryForWindow: {
        status: 'gult',
        worstWindMs: 14.5,
        worstGustMs: 18.2,
        worstPrecipMmPerHour: 0.3,
        decisiveTimeIso: '2026-07-10T08:00:00Z',
      },
      // no forecastRows
    })
    const s = buildPointSummary(otherPt, undefined, candidate, 'outbound')
    // No forecastRows → derived is null → falls back to summaryForWindow=absent → 0
    expect(s.windMs).toBe(0)
    expect(s.gustMs).toBe(0)
    expect(s.forecastTimeIso).toBeUndefined()
  })

  it('uses displayPoint values even when point is also highlighted (worst point)', () => {
    const issue: TravelIssue = { leg: 'outbound', metric: 'wind', lat: 64.5, lon: -21.0 }
    // Highlighted point is also the displayPoint — displayPoint should win so the map panel
    // shows the full active-slot weather line, not just a single summaryForWindow metric.
    const s = buildPointSummary(ptDisplay, issue, candidate, 'outbound')
    expect(s.isHighlighted).toBe(true)
    expect(s.windMs).toBeCloseTo(6.2) // displayPoint, not summaryForWindow
    expect(s.decisiveTimeFormatted).toBe('11:00') // displayPoint forecast time
  })
})

// ── hasData ───────────────────────────────────────────────────────────────────

describe('buildPointSummary — hasData', () => {
  it('is false when summaryForWindow is absent and no activeCandidate', () => {
    const pt = makeWeatherPoint({ routeIndex: 1, totalRouteWeatherPoints: 3 })
    const s = buildPointSummary(pt)
    expect(s.hasData).toBe(false)
  })

  it('is true when summaryForWindow is present and no activeCandidate', () => {
    const pt = makeWeatherPoint({
      routeIndex: 1,
      totalRouteWeatherPoints: 3,
      summaryForWindow: { status: 'gult', worstWindMs: 14, worstGustMs: 18, worstPrecipMmPerHour: 0 },
    })
    const s = buildPointSummary(pt)
    expect(s.hasData).toBe(true)
  })

  it('is true for the displayPoint in active-candidate mode even though status is undefined', () => {
    const pt = makeWeatherPoint({
      routeIndex: 2,
      totalRouteWeatherPoints: 5,
      summaryForWindow: { status: 'gult', worstWindMs: 14, worstGustMs: 18, worstPrecipMmPerHour: 0 },
    })
    const candidate: TravelCandidate = {
      departureIso: '2026-07-10T09:00:00Z',
      arrivalIso: '2026-07-10T14:00:00Z',
      status: 'graent',
      displayPoint: {
        routeIndex: 2,
        forecastTimeIso: '2026-07-10T11:00:00Z',
        windMs: 12.0,
        gustMs: 15.0,
        precipMmPerHour: 0,
        airTemperatureC: 5,
        metric: 'wind',
        distanceFromOriginM: 200_000,
        routeFraction: 0.5,
      },
    }
    const s = buildPointSummary(pt, undefined, candidate, 'outbound')
    expect(s.status).toBeUndefined() // intentionally undefined in active-candidate mode
    expect(s.windMs).toBeCloseTo(12.0)
    expect(s.hasData).toBe(true) // must be true so chip shows correct status, not no_data
  })

  it('is true for a non-displayPoint with forecastRows in active-candidate mode', () => {
    const forecastRows: ForecastDrawerRow[] = [{
      timeIso: '2026-07-10T10:00:00Z',
      status: 'graent',
      wind: { value: 9.5, direction: 'steady', tone: 'neutral' },
      gust: { value: 12.0, severity: 'none', direction: 'steady', tone: 'neutral' },
      precipitation: { value: 0, direction: 'steady', tone: 'neutral' },
      temperature: { value: 6.0, direction: 'steady', tone: 'neutral' },
    }]
    const pt = makeWeatherPoint({
      routeIndex: 3, totalRouteWeatherPoints: 5, routeFraction: 0.2, forecastRows,
    })
    const candidate: TravelCandidate = {
      departureIso: '2026-07-10T09:00:00Z',
      arrivalIso: '2026-07-10T14:00:00Z',
      status: 'graent',
      displayPoint: { routeIndex: 2, forecastTimeIso: '2026-07-10T11:00:00Z', windMs: 6, gustMs: 8, precipMmPerHour: 0, airTemperatureC: 5, metric: 'wind', distanceFromOriginM: 100_000, routeFraction: 0.25 },
    }
    const s = buildPointSummary(pt, undefined, candidate, 'outbound')
    expect(s.status).toBeUndefined()
    expect(s.hasData).toBe(true)
  })

  it('is false for a non-displayPoint with no forecastRows in active-candidate mode', () => {
    const pt = makeWeatherPoint({
      routeIndex: 3, totalRouteWeatherPoints: 5,
      summaryForWindow: { status: 'gult', worstWindMs: 14, worstGustMs: 18, worstPrecipMmPerHour: 0 },
      // no forecastRows
    })
    const candidate: TravelCandidate = {
      departureIso: '2026-07-10T09:00:00Z',
      arrivalIso: '2026-07-10T14:00:00Z',
      status: 'graent',
      displayPoint: { routeIndex: 2, forecastTimeIso: '2026-07-10T11:00:00Z', windMs: 6, gustMs: 8, precipMmPerHour: 0, airTemperatureC: 5, metric: 'wind', distanceFromOriginM: 100_000, routeFraction: 0.25 },
    }
    const s = buildPointSummary(pt, undefined, candidate, 'outbound')
    expect(s.windMs).toBe(0)
    expect(s.hasData).toBe(false)
  })
})

describe('candidateToIssue', () => {
  function makeCandidate(overrides: Partial<TravelCandidate>): TravelCandidate {
    return {
      departureIso: '2026-07-10T08:00:00Z',
      arrivalIso: '2026-07-10T13:00:00Z',
      status: 'gult',
      reasonCode: 'caution_wind_driving',
      worstWind: { value: 12, lat: 64.5, lon: -21.0, forecastLat: 64.5, forecastLon: -21.0, distanceFromOriginM: 100_000, routeIndex: 1, timeIso: '2026-07-10T10:00:00Z' },
      worstGust: { value: 14, lat: 64.5, lon: -21.0, forecastLat: 64.5, forecastLon: -21.0, distanceFromOriginM: 100_000, routeIndex: 1, timeIso: '2026-07-10T10:00:00Z' },
      worstPrecip: undefined,
      pointStatuses: undefined,
      ...overrides,
    }
  }

  it('returns undefined for green candidate', () => {
    const c = makeCandidate({ status: 'graent', reasonCode: 'graent' })
    expect(candidateToIssue(c)).toBeUndefined()
  })

  it('uses default driving thresholds when no thresholdsUsed', () => {
    const c = makeCandidate({ worstWind: { value: 12, lat: 64.5, lon: -21.0, forecastLat: 64.5, forecastLon: -21.0, distanceFromOriginM: 100_000, routeIndex: 1, timeIso: '2026-07-10T10:00:00Z' } })
    const issue = candidateToIssue(c)
    expect(issue?.metric).toBe('wind')
    expect(issue?.thresholdValue).toBe(10) // default cautionWindMs for driving
  })

  it('uses custom cautionWindMs from thresholdsUsed', () => {
    const c = makeCandidate({ reasonCode: 'caution_wind_driving' })
    const thresholdsUsed = resolveThresholds('none', { cautionWindMs: 10 })
    const issue = candidateToIssue(c, 'outbound', { thresholdsUsed })
    expect(issue?.metric).toBe('wind')
    expect(issue?.thresholdValue).toBe(10) // custom value, not default 15
  })

  it('uses custom redGustMs from thresholdsUsed for gust decisiveness', () => {
    // gust=14 is below default driving redGustMs=28 but above custom redGustMs=12
    const c = makeCandidate({
      status: 'rautt',
      reasonCode: 'too_windy_driving',
      worstGust: { value: 14, lat: 64.5, lon: -21.0, forecastLat: 64.5, forecastLon: -21.0, distanceFromOriginM: 100_000, routeIndex: 1, timeIso: '2026-07-10T10:00:00Z' },
    })
    const thresholdsUsed = resolveThresholds('none', { redGustMs: 12 })
    const issue = candidateToIssue(c, 'outbound', { thresholdsUsed })
    expect(issue?.metric).toBe('gust') // gust is decisive because 14 >= custom 12
    expect(issue?.thresholdValue).toBe(12)
  })

  it('without custom thresholdsUsed gust=14 is NOT decisive (below default 28)', () => {
    const c = makeCandidate({
      status: 'rautt',
      reasonCode: 'too_windy_driving',
      worstGust: { value: 14, lat: 64.5, lon: -21.0, forecastLat: 64.5, forecastLon: -21.0, distanceFromOriginM: 100_000, routeIndex: 1, timeIso: '2026-07-10T10:00:00Z' },
    })
    const issue = candidateToIssue(c)
    expect(issue?.metric).toBe('wind') // gust 14 < 28 → falls back to wind
  })

  it('uses trailer thresholds when reasonCode includes trailer and no thresholdsUsed', () => {
    const c = makeCandidate({
      status: 'rautt',
      reasonCode: 'too_windy_trailer',
      worstGust: { value: 25, lat: 64.5, lon: -21.0, forecastLat: 64.5, forecastLon: -21.0, distanceFromOriginM: 100_000, routeIndex: 1, timeIso: '2026-07-10T10:00:00Z' },
    })
    const issue = candidateToIssue(c)
    expect(issue?.metric).toBe('gust') // 25 >= caravan redGustMs=25
    expect(issue?.thresholdValue).toBe(25)
  })

  it('overrides trailer default with explicit thresholdsUsed', () => {
    const c = makeCandidate({
      status: 'rautt',
      reasonCode: 'too_windy_trailer',
      worstGust: { value: 20, lat: 64.5, lon: -21.0, forecastLat: 64.5, forecastLon: -21.0, distanceFromOriginM: 100_000, routeIndex: 1, timeIso: '2026-07-10T10:00:00Z' },
    })
    const thresholdsUsed = resolveThresholds('caravan', { redGustMs: 18 })
    const issue = candidateToIssue(c, 'outbound', { thresholdsUsed })
    expect(issue?.metric).toBe('gust') // 20 >= custom 18
    expect(issue?.thresholdValue).toBe(18)
  })
})

describe('derivePointWeatherForCandidate', () => {
  const baseCandidate: TravelCandidate = {
    departureIso: '2026-07-10T09:00:00Z',
    arrivalIso: '2026-07-10T14:00:00Z',
    status: 'graent',
  }

  function makeRow(timeIso: string, windMs: number, gustMs: number, precipMm: number, tempC: number): ForecastDrawerRow {
    return {
      timeIso,
      status: 'graent',
      wind: { value: windMs, direction: 'steady', tone: 'neutral' },
      gust: { value: gustMs, severity: 'none', direction: 'steady', tone: 'neutral' },
      precipitation: { value: precipMm, direction: 'steady', tone: 'neutral' },
      temperature: { value: tempC, direction: 'steady', tone: 'neutral' },
    }
  }

  it('returns null when no forecastRows', () => {
    const pt = makeWeatherPoint({ routeFraction: 0.5 })
    expect(derivePointWeatherForCandidate(pt, baseCandidate)).toBeNull()
  })

  it('returns null when forecastRows is empty', () => {
    const pt = makeWeatherPoint({ routeFraction: 0.5, forecastRows: [] })
    expect(derivePointWeatherForCandidate(pt, baseCandidate)).toBeNull()
  })

  it('returns values from the nearest forecast row to the ETA', () => {
    // routeFraction=0.5, dep=09:00, arr=14:00 → ETA = 09:00 + 0.5*5h = 11:30
    const pt = makeWeatherPoint({
      routeFraction: 0.5,
      forecastRows: [
        makeRow('2026-07-10T10:00:00Z', 8.0, 10.0, 0.1, 7.0),
        makeRow('2026-07-10T11:00:00Z', 9.5, 12.0, 0.2, 6.5), // nearest to 11:30
        makeRow('2026-07-10T12:00:00Z', 11.0, 14.0, 0.3, 6.0),
      ],
    })
    const result = derivePointWeatherForCandidate(pt, baseCandidate)
    expect(result).not.toBeNull()
    expect(result!.windMs).toBeCloseTo(9.5)
    expect(result!.gustMs).toBeCloseTo(12.0)
    expect(result!.precipMmPerHour).toBeCloseTo(0.2)
    expect(result!.airTemperatureC).toBeCloseTo(6.5)
    expect(result!.forecastTimeIso).toBe('2026-07-10T11:00:00Z')
  })

  it('returns etaIso computed from candidate and routeFraction', () => {
    const pt = makeWeatherPoint({
      routeFraction: 0.5,
      forecastRows: [makeRow('2026-07-10T11:00:00Z', 8, 10, 0, 5)],
    })
    const result = derivePointWeatherForCandidate(pt, baseCandidate)
    // ETA = 09:00 + 0.5 * 5h = 11:30 → etaIso should be around 11:30
    expect(result!.etaIso).toBe('2026-07-10T11:30:00.000Z')
  })

  it('uses return leg fraction correctly', () => {
    const pt = makeWeatherPoint({
      routeFraction: 0.3,
      forecastRows: [makeRow('2026-07-10T12:00:00Z', 8, 10, 0, 5)],
    })
    // return leg: etaFraction = 1 - 0.3 = 0.7, ETA = 09:00 + 0.7*5h = 12:30
    const result = derivePointWeatherForCandidate(pt, baseCandidate, 'return')
    expect(result!.etaIso).toBe('2026-07-10T12:30:00.000Z')
  })
})

describe('formatNum', () => {
  it('returns integer as string with no decimal when value is whole', () => {
    expect(formatNum(5, 'en')).toBe('5')
    expect(formatNum(0, 'en')).toBe('0')
    expect(formatNum(14, 'en')).toBe('14')
  })

  it('returns one decimal place when value has fractional part', () => {
    expect(formatNum(5.3, 'en')).toBe('5.3')
    expect(formatNum(0.3, 'en')).toBe('0.3')
    expect(formatNum(14.5, 'en')).toBe('14.5')
  })

  it('uses comma decimal separator for Icelandic locale', () => {
    expect(formatNum(5.3, 'is')).toBe('5,3')
    expect(formatNum(14.5, 'is')).toBe('14,5')
    expect(formatNum(0.3, 'is')).toBe('0,3')
  })

  it('trims trailing ,0 for Icelandic whole numbers', () => {
    expect(formatNum(5, 'is')).toBe('5')
    expect(formatNum(12, 'is')).toBe('12')
  })

  it('accepts is-IS locale variant', () => {
    expect(formatNum(12.5, 'is-IS')).toBe('12,5')
  })

  it('rounds to one decimal place', () => {
    expect(formatNum(14.55, 'en')).toBe('14.6')
    expect(formatNum(14.54, 'en')).toBe('14.5')
  })
})

describe('buildThresholdContext', () => {
  const th10_15 = resolveThresholds('none', { cautionWindMs: 10, redWindMs: 15 })

  // 1. Worst/highlighted point uses server-computed issue values
  it('highlighted point with issue: uses issue value/threshold and computes excess', () => {
    const summary = { isHighlighted: true, windMs: 13.3 }
    const issue: TravelIssue = {
      leg: 'outbound',
      metric: 'wind',
      value: 13.3,
      unit: 'm/s',
      thresholdValue: 10,
      thresholdUnit: 'm/s',
      lat: 64.0,
      lon: -22.0,
    }
    const ctx = buildThresholdContext(summary, th10_15, issue)
    expect(ctx).not.toBeNull()
    expect(ctx!.metricLabelKey).toBe('metricWind')
    expect(ctx!.thresholdValue).toBe(10)
    expect(ctx!.excess).toBeCloseTo(3.3)
  })

  // 2. Non-highlighted point above red threshold: compares against redWindMs
  it('non-highlighted point with windMs above red threshold: uses red threshold', () => {
    const summary = { isHighlighted: false, windMs: 16.0 }
    const ctx = buildThresholdContext(summary, th10_15)
    expect(ctx).not.toBeNull()
    expect(ctx!.thresholdValue).toBe(15)
    expect(ctx!.excess).toBeCloseTo(1.0)
  })

  // 3. Non-highlighted point above caution but below red: compares against cautionWindMs
  it('non-highlighted point with windMs above caution but below red: uses caution threshold', () => {
    const summary = { isHighlighted: false, windMs: 13.3 }
    const ctx = buildThresholdContext(summary, th10_15)
    expect(ctx).not.toBeNull()
    expect(ctx!.thresholdValue).toBe(10)
    expect(ctx!.excess).toBeCloseTo(3.3)
  })

  // 4. Point below all thresholds: returns null
  it('point below all thresholds returns null', () => {
    const summary = { isHighlighted: false, windMs: 8.0 }
    const ctx = buildThresholdContext(summary, th10_15)
    expect(ctx).toBeNull()
  })

  // 5. Selected and list point built from same data produce identical threshold context
  it('selected and list point with same windMs and thresholds produce identical context', () => {
    const summarySelected = { isHighlighted: false, windMs: 13.3 }
    const summaryList = { isHighlighted: false, windMs: 13.3 }
    const ctxSelected = buildThresholdContext(summarySelected, th10_15)
    const ctxList = buildThresholdContext(summaryList, th10_15)
    expect(ctxSelected).toEqual(ctxList)
  })
})

// ── formatLongDepartureDateTime ───────────────────────────────────────────────

describe('formatLongDepartureDateTime', () => {
  it('returns full Icelandic Friday in accusative', () => {
    // 2026-07-17T04:00:00Z is a Friday (UTC)
    expect(formatLongDepartureDateTime('2026-07-17T04:00:00Z', 'is')).toBe('föstudaginn 17. júlí kl. 04:00')
  })

  it('returns full Icelandic Saturday in accusative', () => {
    // 2026-07-18T04:00:00Z is a Saturday (UTC)
    expect(formatLongDepartureDateTime('2026-07-18T04:00:00Z', 'is')).toBe('laugardaginn 18. júlí kl. 04:00')
  })

  it('pads single-digit hours and minutes', () => {
    expect(formatLongDepartureDateTime('2026-07-17T08:05:00Z', 'is')).toBe('föstudaginn 17. júlí kl. 08:05')
  })

  it('returns English long weekday for en locale', () => {
    const result = formatLongDepartureDateTime('2026-07-17T04:00:00Z', 'en')
    expect(result).toContain('Friday')
    expect(result).toContain('04:00')
  })
})

// ── formatCompactDateTime ─────────────────────────────────────────────────────

describe('formatCompactDateTime', () => {
  it('returns correct Icelandic compact label with full month name', () => {
    // 2026-07-17T05:28:00Z — Friday 17 July 05:28 UTC (= Reykjavik)
    expect(formatCompactDateTime('2026-07-17T05:28:00Z', 'is')).toBe('fös. 17. júlí kl. 05:28')
  })

  it('uses correct full month names for each month', () => {
    const months = ['jan.', 'feb.', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'sep.', 'okt.', 'nóv.', 'des.']
    // 2026-01-01 through 2026-12-01, all at 12:00 UTC on a Thursday/Friday etc.
    const isos = [
      '2026-01-01T12:00:00Z',
      '2026-02-01T12:00:00Z',
      '2026-03-01T12:00:00Z',
      '2026-04-01T12:00:00Z',
      '2026-05-01T12:00:00Z',
      '2026-06-01T12:00:00Z',
      '2026-07-01T12:00:00Z',
      '2026-08-01T12:00:00Z',
      '2026-09-01T12:00:00Z',
      '2026-10-01T12:00:00Z',
      '2026-11-01T12:00:00Z',
      '2026-12-01T12:00:00Z',
    ]
    isos.forEach((iso, i) => {
      expect(formatCompactDateTime(iso, 'is')).toContain(months[i])
    })
  })

  it('does not throw for English locale', () => {
    expect(() => formatCompactDateTime('2026-07-17T05:28:00Z', 'en')).not.toThrow()
  })
})

// ── selectNearestVedurstofanRow ───────────────────────────────────────────────

const ROW_09 = { ftimeIso: '2026-07-10T09:00:00Z', windSpeedMs: 10, windDirectionText: 'N', temperatureC: 5, precipitationMmPerHour: 0, weatherText: 'Skýjað' }
const ROW_12 = { ftimeIso: '2026-07-10T12:00:00Z', windSpeedMs: 7, windDirectionText: 'NV', temperatureC: 7, precipitationMmPerHour: 0.2, weatherText: 'Hlýtt' }
const ROW_15 = { ftimeIso: '2026-07-10T15:00:00Z', windSpeedMs: 4, windDirectionText: 'V', temperatureC: 9, precipitationMmPerHour: 0, weatherText: 'Sólskin' }

describe('selectNearestVedurstofanRow', () => {
  it('returns undefined for an empty array', () => {
    expect(selectNearestVedurstofanRow([], '2026-07-10T10:00:00Z')).toBeUndefined()
  })

  it('returns undefined when etaIso is undefined and array is empty', () => {
    expect(selectNearestVedurstofanRow([], undefined)).toBeUndefined()
  })

  it('returns first row when etaIso is undefined', () => {
    const result = selectNearestVedurstofanRow([ROW_09, ROW_12, ROW_15], undefined)
    expect(result?.ftimeIso).toBe(ROW_09.ftimeIso)
  })

  it('selects the row nearest to etaIso — exact match', () => {
    const result = selectNearestVedurstofanRow([ROW_09, ROW_12, ROW_15], '2026-07-10T12:00:00Z')
    expect(result?.ftimeIso).toBe(ROW_12.ftimeIso)
    expect(result?.windSpeedMs).toBe(7)
  })

  it('selects the row nearest to etaIso — between rows', () => {
    // 10:30 is closer to 09:00 (90 min away) than 12:00 (90 min away) — ties go to first
    // 10:31 is closer to 12:00
    const result = selectNearestVedurstofanRow([ROW_09, ROW_12], '2026-07-10T11:00:00Z')
    // 11:00 is 2h from 09:00 and 1h from 12:00 — should pick 12:00
    expect(result?.ftimeIso).toBe(ROW_12.ftimeIso)
  })

  it('selects different rows for different ETAs — Leið A regression', () => {
    const rows = [ROW_09, ROW_12, ROW_15]
    // ETA near 09:00 → ROW_09
    const earlyResult = selectNearestVedurstofanRow(rows, '2026-07-10T09:30:00Z')
    // ETA near 15:00 → ROW_15
    const lateResult = selectNearestVedurstofanRow(rows, '2026-07-10T14:30:00Z')
    expect(earlyResult?.ftimeIso).toBe(ROW_09.ftimeIso)
    expect(lateResult?.ftimeIso).toBe(ROW_15.ftimeIso)
    expect(earlyResult?.windSpeedMs).not.toBe(lateResult?.windSpeedMs)
  })

  it('returns the only row when array has one element', () => {
    const result = selectNearestVedurstofanRow([ROW_12], '2026-07-10T06:00:00Z')
    expect(result?.ftimeIso).toBe(ROW_12.ftimeIso)
  })
})

// ── resolveRoutePointWindDisplayStatus ────────────────────────────────────────

describe('resolveRoutePointWindDisplayStatus', () => {
  // cautionWindMs=10, redWindMs=15
  // nalgast-haettumork: redWindMs - wind < 2, i.e. wind in [13, 15)
  const th = resolveThresholds('none', { cautionWindMs: 10, redWindMs: 15 })

  function makeRow(timeIso: string, windMs: number): ForecastDrawerRow {
    return {
      timeIso,
      status: 'graent',
      wind: { value: windMs, direction: 'steady', tone: 'neutral' },
      gust: { value: windMs + 2, severity: 'none', direction: 'steady', tone: 'neutral' },
      precipitation: { value: 0, direction: 'steady', tone: 'neutral' },
      temperature: { value: 5, direction: 'steady', tone: 'neutral' },
    }
  }

  // 1. displayPoint path → nalgast-haettumork (the screenshot scenario)
  it('displayPoint windMs within 2 of redWindMs resolves to nalgast-haettumork', () => {
    // 15 - 13.1 = 1.9 < 2 → nalgast-haettumork
    const pt = makeWeatherPoint({
      routeIndex: 1,
      summaryForWindow: { status: 'graent', worstWindMs: 5, worstGustMs: 7, worstPrecipMmPerHour: 0 },
    })
    const candidate: TravelCandidate = {
      departureIso: '2026-07-10T09:00:00Z',
      arrivalIso: '2026-07-10T14:00:00Z',
      status: 'gult',
      displayPoint: {
        routeIndex: 1,
        forecastTimeIso: '2026-07-10T11:00:00Z',
        windMs: 13.1,
        gustMs: 15.0,
        precipMmPerHour: 0,
        airTemperatureC: 4,
        metric: 'wind',
        distanceFromOriginM: 50_000,
        routeFraction: 0.4,
      },
    }
    const result = resolveRoutePointWindDisplayStatus({ point: pt, activeCandidate: candidate, thresholds: th })
    expect(result.status).toBe('nalgast-haettumork')
    expect(result.windMs).toBeCloseTo(13.1)
    expect(result.hasData).toBe(true)
  })

  // 2. Same point without activeCandidate falls back to summaryForWindow
  it('without activeCandidate falls back to summaryForWindow (innan-marka)', () => {
    const pt = makeWeatherPoint({
      routeIndex: 1,
      summaryForWindow: { status: 'graent', worstWindMs: 5, worstGustMs: 7, worstPrecipMmPerHour: 0 },
    })
    const result = resolveRoutePointWindDisplayStatus({ point: pt, thresholds: th })
    expect(result.status).toBe('innan-marka')
    expect(result.windMs).toBe(5)
    expect(result.hasData).toBe(true)
  })

  // 3. Non-displayPoint active candidate uses nearest forecast row to ETA
  it('non-displayPoint with forecastRows uses nearest row to ETA', () => {
    // routeFraction=0.4, dep=09:00, arr=14:00 → ETA = 09:00 + 0.4*5h = 11:00
    const pt = makeWeatherPoint({
      routeIndex: 2,
      routeFraction: 0.4,
      forecastRows: [
        makeRow('2026-07-10T10:00:00Z', 6.0),
        makeRow('2026-07-10T11:00:00Z', 13.5), // nearest to ETA 11:00 → nalgast-haettumork
        makeRow('2026-07-10T12:00:00Z', 4.0),
      ],
      summaryForWindow: { status: 'graent', worstWindMs: 3, worstGustMs: 5, worstPrecipMmPerHour: 0 },
    })
    const candidate: TravelCandidate = {
      departureIso: '2026-07-10T09:00:00Z',
      arrivalIso: '2026-07-10T14:00:00Z',
      status: 'gult',
      displayPoint: {
        routeIndex: 1, // different routeIndex — pt is not the displayPoint
        forecastTimeIso: '2026-07-10T11:00:00Z',
        windMs: 13.1,
        gustMs: 15.0,
        precipMmPerHour: 0,
        airTemperatureC: 4,
        metric: 'wind',
        distanceFromOriginM: 30_000,
        routeFraction: 0.2,
      },
    }
    const result = resolveRoutePointWindDisplayStatus({ point: pt, activeCandidate: candidate, thresholds: th })
    expect(result.status).toBe('nalgast-haettumork') // 15 - 13.5 = 1.5 < 2
    expect(result.windMs).toBeCloseTo(13.5)
    expect(result.hasData).toBe(true)
  })

  // 4. Non-displayPoint with no forecastRows under activeCandidate → no_data
  it('non-displayPoint with no forecastRows under activeCandidate resolves to no_data', () => {
    const pt = makeWeatherPoint({
      routeIndex: 2,
      summaryForWindow: { status: 'gult', worstWindMs: 14, worstGustMs: 18, worstPrecipMmPerHour: 0 },
      // no forecastRows
    })
    const candidate: TravelCandidate = {
      departureIso: '2026-07-10T09:00:00Z',
      arrivalIso: '2026-07-10T14:00:00Z',
      status: 'gult',
      displayPoint: {
        routeIndex: 1,
        forecastTimeIso: '2026-07-10T11:00:00Z',
        windMs: 13.1,
        gustMs: 15.0,
        precipMmPerHour: 0,
        airTemperatureC: 4,
        metric: 'wind',
        distanceFromOriginM: 30_000,
        routeFraction: 0.2,
      },
    }
    const result = resolveRoutePointWindDisplayStatus({ point: pt, activeCandidate: candidate, thresholds: th })
    expect(result.status).toBe('no_data')
    expect(result.hasData).toBe(false)
  })

  // 5. No summaryForWindow and no activeCandidate → no_data
  it('point with no summaryForWindow and no activeCandidate resolves to no_data', () => {
    const pt = makeWeatherPoint({ routeIndex: 0 }) // no summaryForWindow
    const result = resolveRoutePointWindDisplayStatus({ point: pt, thresholds: th })
    expect(result.status).toBe('no_data')
    expect(result.hasData).toBe(false)
  })
})
