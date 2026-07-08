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
} from '@/components/weather/travelAuditMap.helpers'
import type { RouteWeatherPoint, TravelIssue, TravelCandidate } from '@/lib/weather/types'
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

  it('hides summaryForWindow metrics for a non-matching point when activeCandidate present', () => {
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
    })
    const s = buildPointSummary(otherPt, undefined, candidate, 'outbound')
    expect(s.windMs).toBe(0)
    expect(s.gustMs).toBe(0)
    expect(s.precipMmPerHour).toBe(0)
    expect(s.decisiveTempC).toBeUndefined()
    expect(s.decisiveTimeFormatted).toBeUndefined()
  })

  it('still shows summaryForWindow for isHighlighted point even with activeCandidate', () => {
    const issue: TravelIssue = { leg: 'outbound', metric: 'wind', lat: 64.5, lon: -21.0 }
    // Make the highlighted point the same as the displayPoint to test priority
    const s = buildPointSummary(ptDisplay, issue, candidate, 'outbound')
    expect(s.isHighlighted).toBe(true)
    expect(s.windMs).toBeCloseTo(14.5) // summaryForWindow, not displayPoint
    expect(s.decisiveTimeFormatted).toBe('08:00')
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
    expect(issue?.thresholdValue).toBe(15) // default cautionWindMs for driving
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
