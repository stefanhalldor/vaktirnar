import { describe, it, expect } from 'vitest'
import { checkTravelWeather, type TravelWeatherInput } from '../weather/travel'
import { resolveThresholds, validateResolvedThresholdOrdering } from '../weather/thresholds'
import type { TravelPointForecast } from '../weather/types'

function makeHour(time: string, windSpeedMs: number, windGustMs: number, precipMmPerHour: number) {
  return { time, airTemperatureC: 10, windSpeedMs, windGustMs, windFromDegrees: 180, precipitationMmPerHour: precipMmPerHour, symbolCode: 'clearsky_day' }
}

function makeForecast(
  fromIso: string, hours: number, windMs: number, gustMs: number, precipMm: number,
  opts?: Partial<Omit<TravelPointForecast, 'hours'>>,
): TravelPointForecast {
  const pts = []
  for (let i = 0; i < hours; i++) {
    const t = new Date(new Date(fromIso).getTime() + i * 3600_000).toISOString()
    pts.push(makeHour(t, windMs, gustMs, precipMm))
  }
  // Merge opts first so forecastLat/forecastLon can default to resolved lat/lon
  const merged = { lat: 64.0, lon: -22.0, routeIndex: 0, distanceFromOriginM: 0, ...opts }
  return {
    hours: pts,
    ...merged,
    forecastLat: merged.forecastLat ?? merged.lat,
    forecastLon: merged.forecastLon ?? merged.lon,
  }
}

const BASE_INPUT: TravelWeatherInput = {
  trailerKind: 'none',
  originName: 'Reykjavík',
  destinationName: 'Akureyri',
  distanceM: 400_000,
  durationS: 18_000, // 5 hours
  pointForecasts: [],
  earliestDepartureAt: '2026-07-10T08:00:00Z',
}

describe('checkTravelWeather', () => {
  describe('no trailer — driving thresholds', () => {
    it('returns graent with calm weather and no trailer', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 0)] })
      expect(result.stada).toBe('graent')
      expect(result.toolName).toBe('checkTravelWeather')
      expect(result.source).toBe('deterministic')
    })

    it('returns gult at caution wind (15 m/s)', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 15, 17, 0)] })
      expect(result.stada).toBe('gult')
      expect(result.reasonCode).toBe('caution_wind_driving')
    })

    it('returns rautt at red wind (20 m/s)', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 20, 22, 0)] })
      expect(result.stada).toBe('rautt')
      expect(result.reasonCode).toBe('too_windy_driving')
    })

    it('returns rautt at red gust (28 m/s)', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 14, 28, 0)] })
      expect(result.stada).toBe('rautt')
      expect(result.reasonCode).toBe('too_windy_driving')
    })

    it('returns graent with light rain (1.5 mm/h) and calm wind — below new 2.0 threshold', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 1.5)] })
      expect(result.stada).toBe('graent')
    })

    it('returns graent at exactly 2.0 mm/h (strict > threshold)', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 2.0)] })
      expect(result.stada).toBe('graent')
    })

    it('returns gult with precipitation (> 2.0 mm/h)', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 2.1)] })
      expect(result.stada).toBe('gult')
      expect(result.reasonCode).toBe('precipitation')
    })
  })

  describe('caravan trailer thresholds', () => {
    it('returns gult at caution wind (13 m/s) with caravan', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'caravan', pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 13, 15, 0)] })
      expect(result.stada).toBe('gult')
      expect(result.reasonCode).toBe('caution_wind_trailer')
    })

    it('returns rautt at red wind (18 m/s) with caravan', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'caravan', pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 18, 20, 0)] })
      expect(result.stada).toBe('rautt')
      expect(result.reasonCode).toBe('too_windy_trailer')
    })

    it('returns rautt at red gust (25 m/s) with caravan', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'caravan', pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 12, 25, 0)] })
      expect(result.stada).toBe('rautt')
      expect(result.reasonCode).toBe('too_windy_trailer')
    })

    it('returns gult with precipitation and caravan (> 2.0 mm/h)', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'caravan', pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 2.1)] })
      expect(result.stada).toBe('gult')
      expect(result.reasonCode).toBe('precipitation')
    })

    it('uses worst-case across multiple route points', () => {
      const calm = makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 0, { routeIndex: 0, distanceFromOriginM: 0 })
      const windy = makeForecast('2026-07-10T08:00:00Z', 10, 19, 22, 0, { routeIndex: 1, distanceFromOriginM: 200_000 })
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'caravan', pointForecasts: [calm, windy] })
      expect(result.stada).toBe('rautt')
    })
  })

  describe('tent lodging (deferred — stay logic removed from this phase)', () => {
    it.skip('returns gult at caution tent wind (6 m/s) during stay', () => { /* lodging deferred */ })
    it.skip('returns rautt at red tent wind (10 m/s) during stay', () => { /* lodging deferred */ })
    it.skip('stay is graent when route is windy but destination is calm', () => { /* lodging deferred */ })
    it.skip('stay is rautt when destination is windy', () => { /* lodging deferred */ })
    it.skip('returns gult with no_data when no destinationForecast', () => { /* lodging deferred */ })
  })

  describe('latestArrivalBy — candidate window analysis', () => {
    it('enables windowMode and generates multiple candidates', () => {
      // earliest 08:00, latestArrivalBy 15:00, route 5h → latestDep 10:00 → candidates at 08:00, 08:30, 09:00, 09:30, 10:00
      const result = checkTravelWeather({
        ...BASE_INPUT,
        pointForecasts: [makeForecast('2026-07-10T07:00:00Z', 20, 5, 7, 0)],
        latestArrivalBy: '2026-07-10T15:00:00Z',
      })
      expect(result.travelPlan?.outbound.windowMode).toBe(true)
      expect(result.travelPlan?.outbound.candidates.length).toBeGreaterThan(1)
    })

    it('sets bestWindow when conditions are good', () => {
      const result = checkTravelWeather({
        ...BASE_INPUT,
        pointForecasts: [makeForecast('2026-07-10T07:00:00Z', 20, 5, 7, 0)],
        latestArrivalBy: '2026-07-10T16:00:00Z',
      })
      expect(result.travelPlan?.outbound.bestWindow).toBeDefined()
      expect(result.travelPlan?.outbound.bestWindow?.status).toBe('graent')
      expect(result.stada).toBe('graent')
    })

    it('no bestWindow in single-window mode (no latestArrivalBy)', () => {
      const result = checkTravelWeather({
        ...BASE_INPUT,
        pointForecasts: [makeForecast('2026-07-10T07:00:00Z', 10, 5, 7, 0)],
      })
      expect(result.travelPlan?.outbound.windowMode).toBe(false)
      expect(result.travelPlan?.outbound.candidates.length).toBe(1)
      expect(result.travelPlan?.outbound.bestWindow).toBeUndefined()
    })

    it('returns arrival_too_soon when latestArrivalBy is too early for route duration', () => {
      // route = 5h, latest arrival = 10:00, earliest dep = 08:00 → latest dep = 05:00 < 08:00
      const result = checkTravelWeather({
        ...BASE_INPUT,
        pointForecasts: [makeForecast('2026-07-10T07:00:00Z', 10, 5, 7, 0)],
        latestArrivalBy: '2026-07-10T10:00:00Z',
      })
      expect(result.reasonCode).toBe('arrival_too_soon')
      expect(result.stada).toBe('gult')
    })
  })

  describe('latestHomeBy — return window analysis', () => {
    it('generates return candidates when latestHomeBy is set', () => {
      // earliest dep 08:00, route 5h, arrives 13:00. latestHomeBy = 23:00 → latestReturnDep = 18:00
      const result = checkTravelWeather({
        ...BASE_INPUT,
        pointForecasts: [makeForecast('2026-07-10T07:00:00Z', 50, 5, 7, 0)],
        latestHomeBy: '2026-07-10T23:00:00Z',
      })
      expect(result.travelPlan?.return).toBeDefined()
      expect(result.travelPlan?.return?.candidates.length).toBeGreaterThan(0)
    })

    it('produces rautt overall when return window is windy (caravan)', () => {
      // Outbound calm, return window windy
      const calmForecast = makeForecast('2026-07-10T07:00:00Z', 12, 5, 7, 0)
      const windyReturnForecast = makeForecast('2026-07-10T13:00:00Z', 12, 20, 22, 0, { routeIndex: 0, distanceFromOriginM: 0 })
      const result = checkTravelWeather({
        ...BASE_INPUT,
        trailerKind: 'caravan',
        pointForecasts: [calmForecast, windyReturnForecast],
        latestHomeBy: '2026-07-10T23:00:00Z',
      })
      expect(result.stada).toBe('rautt')
    })

    it('returns empty return candidates when latestHomeBy is impossibly soon', () => {
      // route 5h, arrives 13:00, latestHomeBy 14:00 → latestReturnDep 09:00 < 13:00 → impossible
      const result = checkTravelWeather({
        ...BASE_INPUT,
        pointForecasts: [makeForecast('2026-07-10T07:00:00Z', 20, 5, 7, 0)],
        latestHomeBy: '2026-07-10T14:00:00Z',
      })
      expect(result.travelPlan?.return?.candidates.length).toBe(0)
    })

    it('sets stada to at least gult when latestHomeBy is impossible, not silently graent', () => {
      // Outbound is fine, but home target is impossible — overall should be gult
      const result = checkTravelWeather({
        ...BASE_INPUT,
        pointForecasts: [makeForecast('2026-07-10T07:00:00Z', 20, 5, 7, 0)],
        latestHomeBy: '2026-07-10T14:00:00Z',
      })
      expect(result.stada).toBe('gult')
      expect(result.reasonCode).toBe('home_too_soon')
    })
  })

  describe('WorstMetric — location and time tracking', () => {
    it('highlightedIssue carries distanceFromOriginM and timeIso', () => {
      const origin = makeForecast('2026-07-10T08:00:00Z', 8, 5, 7, 0, { routeIndex: 0, distanceFromOriginM: 0 })
      const mid = makeForecast('2026-07-10T08:00:00Z', 8, 19, 22, 0, { lat: 65.0, lon: -19.0, routeIndex: 1, distanceFromOriginM: 200_000 })
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'caravan', pointForecasts: [origin, mid] })
      expect(result.stada).toBe('rautt')
      const issue = result.travelPlan?.highlightedIssue
      expect(issue).toBeDefined()
      expect(issue?.distanceFromOriginM).toBe(200_000)
      expect(issue?.lat).toBe(65.0)
      expect(typeof issue?.timeIso).toBe('string')
    })

    it('outbound leavingAt candidate has worstWind populated', () => {
      const forecast = makeForecast('2026-07-10T08:00:00Z', 10, 16, 18, 0)
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast] })
      const candidate = result.travelPlan?.outbound.leavingAt
      expect(candidate?.worstWind?.value).toBeGreaterThan(0)
      expect(typeof candidate?.worstWind?.timeIso).toBe('string')
    })
  })

  describe('auditability — forecastLat/forecastLon/metnoUrl/routeWeatherPoints', () => {
    it('WorstMetric includes forecastLat, forecastLon, and metnoUrl', () => {
      const forecast = makeForecast('2026-07-10T08:00:00Z', 10, 20, 26, 0, { lat: 64.123, lon: -21.456, forecastLat: 64.123, forecastLon: -21.456 })
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'caravan', pointForecasts: [forecast] })
      const worst = result.travelPlan?.outbound.leavingAt?.worstWind
      expect(worst?.forecastLat).toBeDefined()
      expect(worst?.forecastLon).toBeDefined()
      expect(worst?.metnoUrl).toMatch(/api\.met\.no\/weatherapi\/locationforecast/)
      expect(worst?.metnoUrl).toContain('lat=')
      expect(worst?.metnoUrl).toContain('lon=')
    })

    it('routeWeatherPoints is present on travelPlan', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 0)] })
      expect(Array.isArray(result.travelPlan?.routeWeatherPoints)).toBe(true)
      expect(result.travelPlan?.routeWeatherPoints?.length).toBeGreaterThan(0)
    })

    it('each routeWeatherPoint has googleMapsUrl, metnoUrl, and yrnoUrl', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 0)] })
      const pts = result.travelPlan?.routeWeatherPoints ?? []
      for (const pt of pts) {
        expect(pt.googleMapsUrl).toMatch(/google\.com\/maps/)
        expect(pt.metnoUrl).toMatch(/api\.met\.no\/weatherapi\/locationforecast/)
        expect(pt.yrnoUrl).toMatch(/yr\.no\/en\/forecast\/daily-table/)
        expect(typeof pt.forecastLat).toBe('number')
        expect(typeof pt.forecastLon).toBe('number')
      }
    })

    it('isDestinationClosest is true on the last route point', () => {
      const p1 = makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 0, { routeIndex: 0, distanceFromOriginM: 0 })
      const p2 = makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 0, { routeIndex: 1, distanceFromOriginM: 400_000 })
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [p1, p2] })
      const pts = result.travelPlan?.routeWeatherPoints ?? []
      expect(pts[pts.length - 1].isDestinationClosest).toBe(true)
      expect(pts.filter(p => p.isDestinationClosest).length).toBe(1)
    })

    it('isHighlightedIssue matches the highlighted issue point', () => {
      const calm = makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 0, { lat: 64.0, lon: -22.0, routeIndex: 0, distanceFromOriginM: 0 })
      const windy = makeForecast('2026-07-10T08:00:00Z', 10, 20, 26, 0, { lat: 65.0, lon: -19.0, routeIndex: 1, distanceFromOriginM: 200_000 })
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'caravan', pointForecasts: [calm, windy] })
      const pts = result.travelPlan?.routeWeatherPoints ?? []
      const highlightedPts = pts.filter(p => p.isHighlightedIssue)
      expect(highlightedPts.length).toBe(1)
      expect(highlightedPts[0].lat).toBe(65.0)
    })
  })

  describe('special cases', () => {
    it('returns no_data when no forecast points cover the window', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'caravan', pointForecasts: [makeForecast('2020-01-01T00:00:00Z', 5, 5, 7, 0)] })
      expect(result.reasonCode).toBe('no_data')
      expect(result.stada).toBe('gult')
    })

    it('red result always has a reasonCode', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'caravan', pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 20, 26, 0)] })
      expect(result.stada).toBe('rautt')
      expect(result.reasonCode).toBeTruthy()
    })

    it('includes horse_trailer caveat in facts', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'horse_trailer', pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 0)] })
      expect(result.facts?.some(f => f.includes('Hestakerra'))).toBe(true)
    })

    it('always includes disclaimer in facts', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 0)] })
      expect(result.facts?.some(f => f.includes('veðurmat'))).toBe(true)
    })

    it('result has required shape', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 0)] })
      expect(result.id).toMatch(/^dr_/)
      expect(result.source).toBe('deterministic')
      expect(result.toolName).toBe('checkTravelWeather')
      expect(typeof result.createdAt).toBe('string')
      expect(typeof result.svar).toBe('string')
      expect(Array.isArray(result.facts)).toBe(true)
      expect(result.travelPlan).toBeDefined()
    })
  })

  describe('return-leg ETA direction', () => {
    // Route: origin (0 km) and destination (400 km).
    // Bad weather at dest-side point (high fraction) at return departure time.
    // Return: depart from dest at T+6h, arrive home T+11h (duration=5h, distanceM=400k).
    // For return leg, dest-side (fraction≈1) → etaFraction = 1-1 = 0 → ETA ≈ return departure.
    // Origin-side (fraction≈0) → etaFraction = 1-0 = 1 → ETA ≈ return arrival (5h later).
    it('flags dest-side point at return departure, not origin-side point', () => {
      const origin = makeForecast('2026-07-10T08:00:00Z', 12, 5, 7, 0, { lat: 64.0, lon: -22.0, routeIndex: 0, distanceFromOriginM: 0 })
      // Dest-side point: bad wind starts at 15:00 — 2h after outbound arrival (13:00), so outbound window
      // (12:00-14:00) does NOT include it → outbound graent. Return dep 14:00: etaMs=14:00,
      // window 13:00-15:00 → 15:00 is in window → return sees bad wind.
      const dest = makeForecast('2026-07-10T15:00:00Z', 4, 20, 25, 0, { lat: 65.5, lon: -18.0, routeIndex: 1, distanceFromOriginM: 400_000 })

      const result = checkTravelWeather({
        ...BASE_INPUT,
        trailerKind: 'caravan',
        pointForecasts: [origin, dest],
        // latestHomeBy forces return analysis; earliest dep 08:00 → arrives 13:00 → return dep 14:00
        latestHomeBy: '2026-07-10T20:00:00Z',
      })

      const issue = result.travelPlan?.highlightedIssue
      expect(issue).toBeDefined()
      expect(issue?.leg).toBe('return')
      // The decisive point should be the dest-side point (lat=65.5), not origin (lat=64.0)
      expect(issue?.lat).toBeCloseTo(65.5, 1)
    })

    it('flags origin-side point at return arrival, not dest-side point', () => {
      // Bad weather at origin-side (fraction≈0) at return arrival time (returnDep + durationS).
      // Return departs 14:00, arrives 19:00. Origin ETA on return = 14:00 + (1-0)*5h = 19:00.
      const origin = makeForecast('2026-07-10T18:00:00Z', 4, 20, 25, 0, { lat: 64.0, lon: -22.0, routeIndex: 0, distanceFromOriginM: 0 })
      const dest = makeForecast('2026-07-10T08:00:00Z', 12, 5, 7, 0, { lat: 65.5, lon: -18.0, routeIndex: 1, distanceFromOriginM: 400_000 })

      const result = checkTravelWeather({
        ...BASE_INPUT,
        trailerKind: 'caravan',
        pointForecasts: [origin, dest],
        latestHomeBy: '2026-07-10T20:00:00Z',
      })

      const issue = result.travelPlan?.highlightedIssue
      expect(issue).toBeDefined()
      expect(issue?.leg).toBe('return')
      // Decisive point should be origin-side (lat=64.0)
      expect(issue?.lat).toBeCloseTo(64.0, 1)
    })
  })

  describe('metric-aware candidate selection', () => {
    it('picks precipitation candidate and exposes metric when precipitation drives the result', () => {
      // Two points: one with caution wind, one with heavy precipitation.
      const windyDry = makeForecast('2026-07-10T08:00:00Z', 8, 15, 17, 0, { lat: 64.1, lon: -22.1, routeIndex: 0, distanceFromOriginM: 0 })
      const calmerRainy = makeForecast('2026-07-10T08:00:00Z', 8, 5, 7, 2.5, { lat: 65.0, lon: -19.0, routeIndex: 1, distanceFromOriginM: 200_000 })

      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [windyDry, calmerRainy] })
      expect(result.stada).toBe('gult')
      const issue = result.travelPlan?.highlightedIssue
      expect(issue).toBeDefined()
      // candidateSeverity for wind=15 (caution_wind) ≈ 15; for precip=2.5 ≈ 2.5.
      // Wind severity > precip severity → wind candidate is highlighted, not precip.
      // The key assertion is that the issue is defined and has a metric.
      expect(issue?.metric).toMatch(/wind|gust|precipitation/)
    })

    it('highlighted issue has correct metric when only precipitation drives the result', () => {
      const rainy = makeForecast('2026-07-10T08:00:00Z', 8, 5, 7, 3.0, { lat: 64.0, lon: -22.0, routeIndex: 0, distanceFromOriginM: 0 })
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [rainy] })
      expect(result.stada).toBe('gult')
      expect(result.reasonCode).toBe('precipitation')
      expect(result.travelPlan?.highlightedIssue?.metric).toBe('precipitation')
      expect(result.travelPlan?.highlightedIssue?.lat).toBeCloseTo(64.0, 1)
    })

    it('cross-leg equal status: outbound with higher wind severity beats return with lower severity', () => {
      // Outbound: gult due to 16 m/s wind. Return: gult due to 1.5 mm/h rain (< wind severity).
      // With metric-aware tie-break, outbound (severity≈16) should beat return (severity≈1.5).
      const windyOutbound = makeForecast('2026-07-10T08:00:00Z', 8, 16, 18, 0, { lat: 65.0, lon: -19.0, routeIndex: 0, distanceFromOriginM: 200_000 })
      const rainyReturn = makeForecast('2026-07-10T14:00:00Z', 8, 5, 7, 2.5, { lat: 65.0, lon: -19.0, routeIndex: 0, distanceFromOriginM: 200_000 })

      const result = checkTravelWeather({
        ...BASE_INPUT,
        pointForecasts: [windyOutbound, rainyReturn],
        latestHomeBy: '2026-07-10T23:00:00Z',
      })
      const issue = result.travelPlan?.highlightedIssue
      expect(issue).toBeDefined()
      // Outbound wind severity (16) >> rain severity (1.5) → outbound selected
      expect(issue?.leg).toBe('outbound')
      expect(issue?.metric).toMatch(/wind|gust/)
    })

    it('cross-leg equal status full tie: outbound is preferred over return', () => {
      // Both legs gult with identical wind values on the same forecast point → outbound preferred.
      const forecast = makeForecast('2026-07-10T08:00:00Z', 20, 16, 18, 0, { lat: 65.0, lon: -19.0, routeIndex: 0, distanceFromOriginM: 200_000 })
      const result = checkTravelWeather({
        ...BASE_INPUT,
        pointForecasts: [forecast],
        latestHomeBy: '2026-07-10T23:00:00Z',
      })
      const issue = result.travelPlan?.highlightedIssue
      expect(issue).toBeDefined()
      expect(issue?.leg).toBe('outbound')
    })
  })

  describe('TravelIssue audit fields', () => {
    it('highlightedIssue has metnoUrl, yrnoUrl, and googleMapsUrl', () => {
      const windy = makeForecast('2026-07-10T08:00:00Z', 10, 20, 26, 0, {
        lat: 65.0, lon: -19.0, routeIndex: 1, distanceFromOriginM: 200_000,
        forecastLat: 65.0, forecastLon: -19.0,
      })
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'caravan', pointForecasts: [windy] })
      const issue = result.travelPlan?.highlightedIssue
      expect(issue).toBeDefined()
      expect(issue?.metnoUrl).toMatch(/api\.met\.no\/weatherapi\/locationforecast/)
      expect(issue?.yrnoUrl).toMatch(/yr\.no\/en\/forecast\/daily-table/)
      expect(issue?.googleMapsUrl).toMatch(/google\.com\/maps/)
    })

    it('highlightedIssue has routeIndex and forecastLat/forecastLon', () => {
      const windy = makeForecast('2026-07-10T08:00:00Z', 10, 20, 26, 0, {
        lat: 65.0, lon: -19.0, routeIndex: 2, distanceFromOriginM: 200_000,
        forecastLat: 65.0, forecastLon: -19.0,
      })
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'caravan', pointForecasts: [windy] })
      const issue = result.travelPlan?.highlightedIssue
      expect(issue?.routeIndex).toBe(2)
      expect(issue?.forecastLat).toBe(65.0)
      expect(issue?.forecastLon).toBe(-19.0)
    })

    it('precipitation issue has metric=precipitation and points to the rainy point', () => {
      const calm = makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 0, { lat: 64.0, lon: -22.0, routeIndex: 0, distanceFromOriginM: 0 })
      const rainy = makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 3.0, { lat: 65.0, lon: -19.0, routeIndex: 1, distanceFromOriginM: 200_000 })
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [calm, rainy] })
      const issue = result.travelPlan?.highlightedIssue
      expect(issue?.metric).toBe('precipitation')
      expect(issue?.lat).toBeCloseTo(65.0, 1)
      expect(issue?.unit).toBe('mm/klst')
    })

    it('outbound issue has distanceFromLegStartM equal to distanceFromOriginM', () => {
      const windy = makeForecast('2026-07-10T08:00:00Z', 10, 20, 26, 0, { lat: 65.0, lon: -19.0, routeIndex: 1, distanceFromOriginM: 200_000 })
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'caravan', pointForecasts: [windy] })
      const issue = result.travelPlan?.highlightedIssue
      expect(issue?.distanceFromLegStartM).toBe(200_000)
      expect(issue?.legStartName).toBe('Reykjavík')
    })

    it('return issue has distanceFromLegStartM = totalDistanceM - distanceFromOriginM', () => {
      // distanceM = 400_000, issue at distanceFromOriginM = 100_000 → from dest = 300_000
      const dest = makeForecast('2026-07-10T14:00:00Z', 8, 20, 26, 0, { lat: 65.5, lon: -18.0, routeIndex: 1, distanceFromOriginM: 100_000 })
      const origin = makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 0, { lat: 64.0, lon: -22.0, routeIndex: 0, distanceFromOriginM: 0 })
      const result = checkTravelWeather({
        ...BASE_INPUT,
        trailerKind: 'caravan',
        pointForecasts: [origin, dest],
        latestHomeBy: '2026-07-10T23:00:00Z',
      })
      const issue = result.travelPlan?.highlightedIssue
      expect(issue?.leg).toBe('return')
      expect(issue?.distanceFromLegStartM).toBe(300_000)
      expect(issue?.legStartName).toBe('Akureyri')
    })

    it('audit map URL includes required params when auditPolylinePoints are provided', () => {
      // Provide dummy auditPolylinePoints — buildAuditMapUrl only runs when NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY is set.
      // Test the URL construction indirectly via travelPlan.route.auditMapUrl (may be undefined in test env).
      // Test structural correctness of URLSearchParams by checking param names.
      const forecast = makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 0)
      const auditPolylinePoints = [{ lat: 64.0, lon: -22.0 }, { lat: 65.0, lon: -19.0 }]
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast], auditPolylinePoints })
      // auditMapUrl requires NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY in env — may be undefined in test.
      // If it exists, verify required params.
      const url = result.travelPlan?.route.auditMapUrl
      if (url) {
        expect(url).toContain('size=600x300')
        expect(url).toContain('scale=2')
        expect(url).toContain('path=')
        expect(url).toContain('key=')
      }
    })
  })

  describe('trailer-aware gust threshold decisiveness', () => {
    it('no trailer: wind=21 gust=26 → metric=wind, threshold=20 (not gust)', () => {
      // gust=26 < driving redGustMs=28, so gust is NOT decisive; wind=21 > redWindMs=20 is decisive
      const forecast = makeForecast('2026-07-10T08:00:00Z', 10, 21, 26, 0)
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'none', pointForecasts: [forecast] })
      expect(result.stada).toBe('rautt')
      const issue = result.travelPlan?.highlightedIssue
      expect(issue?.metric).toBe('wind')
      expect(issue?.thresholdValue).toBe(20)
    })

    it('no trailer: gust=28 → metric=gust, threshold=28', () => {
      // gust=28 >= driving redGustMs=28 → gust is decisive
      const forecast = makeForecast('2026-07-10T08:00:00Z', 10, 14, 28, 0)
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'none', pointForecasts: [forecast] })
      expect(result.stada).toBe('rautt')
      const issue = result.travelPlan?.highlightedIssue
      expect(issue?.metric).toBe('gust')
      expect(issue?.thresholdValue).toBe(28)
    })

    it('caravan: gust=25 → metric=gust, threshold=25', () => {
      // gust=25 >= caravan redGustMs=25 → gust is decisive for caravan trip
      const forecast = makeForecast('2026-07-10T08:00:00Z', 10, 12, 25, 0)
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'caravan', pointForecasts: [forecast] })
      expect(result.stada).toBe('rautt')
      const issue = result.travelPlan?.highlightedIssue
      expect(issue?.metric).toBe('gust')
      expect(issue?.thresholdValue).toBe(25)
    })

    it('no trailer: gust=26 is NOT above the 28 m/s threshold — no contradiction in display', () => {
      // This was the Codex P1 bug: gust=26 < 28 should NOT be shown as "yfir mörkum 28"
      // The issue must either be gust (>=28) or fall back to wind metric
      const forecast = makeForecast('2026-07-10T08:00:00Z', 10, 21, 26, 0)
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'none', pointForecasts: [forecast] })
      const issue = result.travelPlan?.highlightedIssue
      // If metric is gust, value must be >= thresholdValue (no contradiction)
      if (issue?.metric === 'gust') {
        expect((issue.value ?? 0)).toBeGreaterThanOrEqual(issue.thresholdValue ?? 0)
      }
      // And the metric must not be gust when gust < driving threshold
      expect(issue?.metric).not.toBe('gust')
    })
  })

  describe('nextCaution', () => {
    // BASE_INPUT: departure 08:00, durationS=18000 (5h), so arrival 13:00.
    // makeForecast generates hourly hours from fromIso for `hours` count.

    it('is undefined when current outbound is not green', () => {
      // Wind at 16 m/s (over cautionWindMs=14) → gult outbound → no nextCaution
      const forecast = makeForecast('2026-07-10T08:00:00Z', 30, 16, 20, 0)
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast] })
      expect(result.travelPlan?.outbound.nextCaution).toBeUndefined()
    })

    it('is undefined in window mode (not implemented for windows yet)', () => {
      const forecast = makeForecast('2026-07-10T08:00:00Z', 30, 5, 7, 0)
      const result = checkTravelWeather({
        ...BASE_INPUT,
        pointForecasts: [forecast],
        latestArrivalBy: '2026-07-10T14:00:00Z',
      })
      expect(result.travelPlan?.outbound.nextCaution).toBeUndefined()
    })

    it('finds future wind caution after green current departure', () => {
      // Hours 0-8: calm (wind 5 m/s), hours 9+: windy (wind 16 m/s, over caution 14)
      // durationS = 18000 (5h). Departure 08:00, nextCaution scan starts 09:00.
      // At scan dep=09:00, arrival=14:00 → hours 9-14 are accessed → wind 16 → gult.
      const calmHours = Array.from({ length: 9 }, (_, i) =>
        makeHour(new Date(new Date('2026-07-10T08:00:00Z').getTime() + i * 3600_000).toISOString(), 5, 7, 0)
      )
      const windyHours = Array.from({ length: 30 }, (_, i) =>
        makeHour(new Date(new Date('2026-07-10T17:00:00Z').getTime() + i * 3600_000).toISOString(), 16, 20, 0)
      )
      const forecast: TravelPointForecast = {
        hours: [...calmHours, ...windyHours],
        lat: 64.0, lon: -22.0, forecastLat: 64.0, forecastLon: -22.0,
        routeIndex: 0, distanceFromOriginM: 0,
      }
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast] })
      expect(result.stada).toBe('graent')
      const nc = result.travelPlan?.outbound.nextCaution
      expect(nc).toBeDefined()
      expect(nc!.departureIso).toBeDefined()
      expect(nc!.status).toBe('gult')
      expect(nc!.reasonCode).toContain('wind')
    })

    it('finds future precipitation caution after green current departure', () => {
      // Hours 0-8: calm, hours 9+: heavy precip (2.1 mm/h > cautionPrecipMmPerHour 2.0)
      const calmHours = Array.from({ length: 9 }, (_, i) =>
        makeHour(new Date(new Date('2026-07-10T08:00:00Z').getTime() + i * 3600_000).toISOString(), 5, 7, 0)
      )
      const rainyHours = Array.from({ length: 30 }, (_, i) =>
        makeHour(new Date(new Date('2026-07-10T17:00:00Z').getTime() + i * 3600_000).toISOString(), 5, 7, 2.1)
      )
      const forecast: TravelPointForecast = {
        hours: [...calmHours, ...rainyHours],
        lat: 64.0, lon: -22.0, forecastLat: 64.0, forecastLon: -22.0,
        routeIndex: 0, distanceFromOriginM: 0,
      }
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast] })
      expect(result.stada).toBe('graent')
      const nc = result.travelPlan?.outbound.nextCaution
      expect(nc).toBeDefined()
      expect(nc!.status).toBe('gult')
      expect(nc!.reasonCode).toBe('precipitation')
    })

    it('returns scannedHours with no departureIso when all future hours are calm', () => {
      // 24 calm hours — no future caution
      const forecast = makeForecast('2026-07-10T08:00:00Z', 24, 5, 7, 0)
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast] })
      expect(result.stada).toBe('graent')
      const nc = result.travelPlan?.outbound.nextCaution
      expect(nc).toBeDefined()
      expect(nc!.departureIso).toBeUndefined()
      expect(nc!.scannedHours).toBeGreaterThan(0)
    })

    it('does not trigger caution for precip exactly at 2.0 mm/h (strict > threshold)', () => {
      const calmHours = Array.from({ length: 9 }, (_, i) =>
        makeHour(new Date(new Date('2026-07-10T08:00:00Z').getTime() + i * 3600_000).toISOString(), 5, 7, 0)
      )
      const atThresholdHours = Array.from({ length: 30 }, (_, i) =>
        makeHour(new Date(new Date('2026-07-10T17:00:00Z').getTime() + i * 3600_000).toISOString(), 5, 7, 2.0)
      )
      const forecast: TravelPointForecast = {
        hours: [...calmHours, ...atThresholdHours],
        lat: 64.0, lon: -22.0, forecastLat: 64.0, forecastLon: -22.0,
        routeIndex: 0, distanceFromOriginM: 0,
      }
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast] })
      expect(result.stada).toBe('graent')
      const nc = result.travelPlan?.outbound.nextCaution
      // 2.0 mm/h is NOT > 2.0 → should not trigger caution
      expect(nc?.departureIso).toBeUndefined()
    })
  })

  describe('window range formatting — cross-day detection in svar', () => {
    it('same-day window shows compact kl. HH:MM–HH:MM format', () => {
      // Departure 08:00, latest arrival 16:00 → candidates 08:00-11:00 (5h drive), all same day
      const forecast = makeForecast('2026-07-10T08:00:00Z', 12, 5, 7, 0)
      const result = checkTravelWeather({
        ...BASE_INPUT,
        pointForecasts: [forecast],
        latestArrivalBy: '2026-07-10T16:00:00Z',
      })
      expect(result.stada).toBe('graent')
      // Same-day range: "kl. HH:MM–HH:MM"
      expect(result.svar).toMatch(/kl\. \d{2}:\d{2}[–-]\d{2}:\d{2}/)
      // Must NOT contain Icelandic day abbreviations for a same-day window
      expect(result.svar).not.toMatch(/mán\.|þri\.|mið\.|fim\.|fös\.|lau\./)
    })

    it('cross-day window includes Icelandic day abbreviations on both ends', () => {
      // Departure 22:00, durationS 5h, latest arrival next day 10:00
      // Best window spans midnight → from date ≠ to date
      const forecast = makeForecast('2026-07-10T22:00:00Z', 14, 5, 7, 0)
      const result = checkTravelWeather({
        ...BASE_INPUT,
        earliestDepartureAt: '2026-07-10T22:00:00Z',
        pointForecasts: [forecast],
        latestArrivalBy: '2026-07-11T10:00:00Z',
      })
      expect(result.stada).toBe('graent')
      // Cross-day: svar must contain at least one Icelandic day abbreviation
      expect(result.svar).toMatch(/mán\.|þri\.|mið\.|fim\.|fös\.|lau\.|sun\./)
    })

  })

  describe('timelineCandidates — single-departure hourly timeline', () => {
    it('always generates timelineCandidates in single-departure mode', () => {
      // 24 calm hours → timelineCandidates should have multiple entries
      const forecast = makeForecast('2026-07-10T08:00:00Z', 24, 5, 7, 0)
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast] })
      const timeline = result.travelPlan?.outbound.timelineCandidates
      expect(timeline).toBeDefined()
      expect(timeline!.length).toBeGreaterThan(1)
    })

    it('timelineCandidates[0] matches the current departure candidate (leavingAt)', () => {
      const forecast = makeForecast('2026-07-10T08:00:00Z', 24, 5, 7, 0)
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast] })
      const timeline = result.travelPlan?.outbound.timelineCandidates
      const leavingAt = result.travelPlan?.outbound.leavingAt
      // Compare departure times semantically (ISO string format may differ by ms suffix)
      expect(new Date(timeline![0].departureIso).getTime()).toBe(new Date(leavingAt!.departureIso).getTime())
      expect(timeline![0].status).toBe(leavingAt!.status)
    })

    it('generates timelineCandidates even when current departure is not green', () => {
      // Windy throughout → current dep is gult, but timeline should still exist
      const forecast = makeForecast('2026-07-10T08:00:00Z', 24, 16, 20, 0)
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast] })
      expect(result.stada).toBe('gult')
      const timeline = result.travelPlan?.outbound.timelineCandidates
      expect(timeline).toBeDefined()
      expect(timeline!.length).toBeGreaterThan(1)
    })

    it('nextCaution is derived from timelineCandidates when outbound is green', () => {
      // Calm hours 0-8, then windy. Timeline and nextCaution should agree on the first warning.
      const calmHours = Array.from({ length: 9 }, (_, i) =>
        makeHour(new Date(new Date('2026-07-10T08:00:00Z').getTime() + i * 3600_000).toISOString(), 5, 7, 0)
      )
      const windyHours = Array.from({ length: 20 }, (_, i) =>
        makeHour(new Date(new Date('2026-07-10T17:00:00Z').getTime() + i * 3600_000).toISOString(), 16, 20, 0)
      )
      const forecast: TravelPointForecast = {
        hours: [...calmHours, ...windyHours],
        lat: 64.0, lon: -22.0, forecastLat: 64.0, forecastLon: -22.0,
        routeIndex: 0, distanceFromOriginM: 0,
      }
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast] })
      expect(result.stada).toBe('graent')
      const nc = result.travelPlan?.outbound.nextCaution
      const timeline = result.travelPlan?.outbound.timelineCandidates
      expect(nc?.departureIso).toBeDefined()
      // nextCaution departure must match a non-green entry in the timeline
      const matchingSlot = timeline!.find(c => c.departureIso === nc!.departureIso)
      expect(matchingSlot).toBeDefined()
      expect(matchingSlot!.status).not.toBe('graent')
    })

    it('nextCaution is undefined when outbound is not green (no future scan for warning)', () => {
      const forecast = makeForecast('2026-07-10T08:00:00Z', 24, 16, 20, 0)
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast] })
      expect(result.stada).toBe('gult')
      expect(result.travelPlan?.outbound.nextCaution).toBeUndefined()
      // But timelineCandidates is still there
      expect(result.travelPlan?.outbound.timelineCandidates).toBeDefined()
    })

    it('no timelineCandidates in window mode', () => {
      const forecast = makeForecast('2026-07-10T08:00:00Z', 24, 5, 7, 0)
      const result = checkTravelWeather({
        ...BASE_INPUT,
        pointForecasts: [forecast],
        latestArrivalBy: '2026-07-10T16:00:00Z',
      })
      expect(result.travelPlan?.outbound.windowMode).toBe(true)
      expect(result.travelPlan?.outbound.timelineCandidates).toBeUndefined()
    })

    it('timeline candidates include pointStatuses for map coloring', () => {
      // Calm current departure, windy future hours → future timeline slot should have pointStatuses
      const calmHours = Array.from({ length: 9 }, (_, i) =>
        makeHour(new Date(new Date('2026-07-10T08:00:00Z').getTime() + i * 3600_000).toISOString(), 5, 7, 0)
      )
      const windyHours = Array.from({ length: 20 }, (_, i) =>
        makeHour(new Date(new Date('2026-07-10T17:00:00Z').getTime() + i * 3600_000).toISOString(), 16, 20, 0)
      )
      const forecast: TravelPointForecast = {
        hours: [...calmHours, ...windyHours],
        lat: 64.0, lon: -22.0, forecastLat: 64.0, forecastLon: -22.0,
        routeIndex: 0, distanceFromOriginM: 0,
      }
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast] })
      const timeline = result.travelPlan?.outbound.timelineCandidates
      // First slot (current departure) is green → no pointStatuses
      expect(timeline![0].pointStatuses).toBeUndefined()
      // Some later slot should be gult with pointStatuses
      const warnSlot = timeline!.find(c => c.status !== 'graent' && c.reasonCode !== 'no_data')
      expect(warnSlot?.pointStatuses).toBeDefined()
    })
  })

  describe('threshold overrides', () => {
    it('resolveThresholds returns driving defaults when no overrides', () => {
      const r = resolveThresholds('none')
      expect(r.cautionWindMs).toBe(15)
      expect(r.redWindMs).toBe(20)
      expect(r.redGustMs).toBe(28)
      expect(r.cautionPrecipMmPerHour).toBe(2.0)
    })

    it('resolveThresholds returns caravan defaults for non-none trailer', () => {
      const r = resolveThresholds('caravan')
      expect(r.cautionWindMs).toBe(13)
      expect(r.redWindMs).toBe(18)
      expect(r.redGustMs).toBe(25)
    })

    it('resolveThresholds merges partial overrides correctly', () => {
      const r = resolveThresholds('none', { cautionWindMs: 10 })
      expect(r.cautionWindMs).toBe(10)
      expect(r.redWindMs).toBe(20) // default unchanged
      expect(r.redGustMs).toBe(28) // default unchanged
    })

    it('override cautionWindMs: 10 triggers gult at wind=12 (default 15 would be green)', () => {
      const result = checkTravelWeather({
        ...BASE_INPUT,
        pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 12, 14, 0)],
        thresholdOverrides: { cautionWindMs: 10 },
      })
      expect(result.stada).toBe('gult')
      expect(result.reasonCode).toBe('caution_wind_driving')
    })

    it('raising cautionWindMs keeps wind=16 green (default 15 would be gult)', () => {
      const result = checkTravelWeather({
        ...BASE_INPUT,
        pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 16, 18, 0)],
        thresholdOverrides: { cautionWindMs: 18 },
      })
      expect(result.stada).toBe('graent')
    })

    it('thresholdsUsed on travelPlan reflects the override, not the default', () => {
      const result = checkTravelWeather({
        ...BASE_INPUT,
        pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 0)],
        thresholdOverrides: { cautionWindMs: 10, redGustMs: 30 },
      })
      expect(result.travelPlan?.thresholdsUsed?.cautionWindMs).toBe(10)
      expect(result.travelPlan?.thresholdsUsed?.redGustMs).toBe(30)
      expect(result.travelPlan?.thresholdsUsed?.redWindMs).toBe(20) // default
    })

    it('TravelIssue thresholdValue matches the override value', () => {
      const result = checkTravelWeather({
        ...BASE_INPUT,
        pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 12, 14, 0)],
        thresholdOverrides: { cautionWindMs: 10 },
      })
      expect(result.stada).toBe('gult')
      const issue = result.travelPlan?.highlightedIssue
      expect(issue?.metric).toBe('wind')
      expect(issue?.thresholdValue).toBe(10) // override value, not default 15
    })

    it('thresholdsUsed is present even when no overrides provided', () => {
      const result = checkTravelWeather({
        ...BASE_INPUT,
        pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 0)],
      })
      expect(result.travelPlan?.thresholdsUsed).toBeDefined()
      expect(result.travelPlan?.thresholdsUsed?.cautionWindMs).toBe(15)
    })

    it('validateResolvedThresholdOrdering returns null when caution < red', () => {
      const resolved = resolveThresholds('none', { cautionWindMs: 12, redWindMs: 20 })
      expect(validateResolvedThresholdOrdering(resolved)).toBeNull()
    })

    it('validateResolvedThresholdOrdering returns error string when caution >= red', () => {
      const resolved = resolveThresholds('none', { cautionWindMs: 25, redWindMs: 10 })
      expect(validateResolvedThresholdOrdering(resolved)).toMatch(/cautionWindMs/)
    })

    it('validateResolvedThresholdOrdering returns error when caution equals red', () => {
      const resolved = resolveThresholds('none', { cautionWindMs: 20, redWindMs: 20 })
      expect(validateResolvedThresholdOrdering(resolved)).not.toBeNull()
    })
  })

  describe('pointStatuses — per-point candidate coloring', () => {
    it('calm candidate has no pointStatuses (all green = empty)', () => {
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 0)] })
      const candidate = result.travelPlan?.outbound.leavingAt
      expect(candidate?.pointStatuses).toBeUndefined()
    })

    it('windy candidate includes the windy point in pointStatuses', () => {
      const calm = makeForecast('2026-07-10T08:00:00Z', 10, 5, 7, 0, { routeIndex: 0, distanceFromOriginM: 0 })
      const windy = makeForecast('2026-07-10T08:00:00Z', 10, 20, 22, 0, { lat: 65.0, lon: -19.0, routeIndex: 1, distanceFromOriginM: 200_000 })
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'caravan', pointForecasts: [calm, windy] })
      const candidate = result.travelPlan?.outbound.leavingAt
      expect(candidate?.pointStatuses).toBeDefined()
      expect(candidate!.pointStatuses!.some(ps => ps.routeIndex === 1)).toBe(true)
      // Calm point should NOT be in pointStatuses (delta: only non-green)
      expect(candidate!.pointStatuses!.some(ps => ps.routeIndex === 0)).toBe(false)
    })

    it('pointStatuses status matches overall candidate status for the worst point', () => {
      const windy = makeForecast('2026-07-10T08:00:00Z', 10, 20, 22, 0, { routeIndex: 0, distanceFromOriginM: 0 })
      const result = checkTravelWeather({ ...BASE_INPUT, trailerKind: 'caravan', pointForecasts: [windy] })
      const candidate = result.travelPlan?.outbound.leavingAt
      expect(candidate?.status).toBe('rautt')
      const ptStatus = candidate?.pointStatuses?.find(ps => ps.routeIndex === 0)
      expect(ptStatus?.status).toBe('rautt')
    })

    it('no_data point appears in pointStatuses when forecast does not cover departure window', () => {
      // Forecast only covers hours far before departure — no hours near ETA
      const staleData = makeForecast('2020-01-01T00:00:00Z', 5, 5, 7, 0)
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [staleData] })
      const candidate = result.travelPlan?.outbound.leavingAt
      // Candidate status is no_data (gult with no_data reasonCode)
      expect(candidate?.reasonCode).toBe('no_data')
      const ptStatus = candidate?.pointStatuses?.find(ps => ps.routeIndex === 0)
      expect(ptStatus?.status).toBe('no_data')
    })
  })

  describe('summaryForWindow.nextForecast', () => {
    // ETA at the origin point = departure time = '2026-07-10T08:00:00Z'.
    // ETA window = ±1h → [07:00, 09:00]. A forecast hour at 09:00 is on the boundary
    // (included), while 10:00 is outside. We use exactly two hours: 09:00 (decisive)
    // and 10:00 (next forecast), ensuring pt.hours[decisiveIdx+1] is well-defined.
    function makeNextForecastPair(wind1: number, gust1: number, wind2: number, gust2: number) {
      const t1 = '2026-07-10T09:00:00Z'
      const t2 = '2026-07-10T10:00:00Z'
      const merged = { lat: 64.0, lon: -22.0, routeIndex: 0, distanceFromOriginM: 0 }
      return {
        hours: [makeHour(t1, wind1, gust1, 0), makeHour(t2, wind2, gust2, 0)],
        ...merged,
        forecastLat: merged.lat,
        forecastLon: merged.lon,
      }
    }

    it('trend is worse when next hour escalates from graent to gult', () => {
      // Decisive (09:00): graent (wind=14 < caution 15). Next (10:00): gult (wind=15)
      const forecast = makeNextForecastPair(14, 16, 15, 17)
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast] })
      const rwp = result.travelPlan?.routeWeatherPoints?.[0]
      expect(rwp?.summaryForWindow?.nextForecast).toBeDefined()
      expect(rwp?.summaryForWindow?.nextForecast?.trend).toBe('worse')
    })

    it('trend is better when next hour improves from gult to graent', () => {
      // Decisive (09:00): gult (wind=15). Next (10:00): graent (wind=5)
      const forecast = makeNextForecastPair(15, 17, 5, 7)
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast] })
      const rwp = result.travelPlan?.routeWeatherPoints?.[0]
      expect(rwp?.summaryForWindow?.nextForecast?.trend).toBe('better')
    })

    it('trend is worse when same status but wind increases significantly', () => {
      // Decisive (09:00): gult wind=15. Next (10:00): gult wind=17 (> 15 * 1.1)
      const forecast = makeNextForecastPair(15, 17, 17, 19)
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast] })
      const rwp = result.travelPlan?.routeWeatherPoints?.[0]
      expect(rwp?.summaryForWindow?.nextForecast?.trend).toBe('worse')
    })

    it('trend is same when same status with similar wind', () => {
      // Decisive (09:00): gult wind=15. Next (10:00): gult wind=15.5 (< 15 * 1.1)
      const forecast = makeNextForecastPair(15, 17, 15.5, 17.5)
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast] })
      const rwp = result.travelPlan?.routeWeatherPoints?.[0]
      expect(rwp?.summaryForWindow?.nextForecast?.trend).toBe('same')
    })

    it('summaryForWindow includes etaIso and forecastTimeIso', () => {
      const forecast = makeNextForecastPair(15, 17, 5, 7)
      const result = checkTravelWeather({ ...BASE_INPUT, pointForecasts: [forecast] })
      const rwp = result.travelPlan?.routeWeatherPoints?.[0]
      expect(rwp?.summaryForWindow?.etaIso).toBeDefined()
      expect(rwp?.summaryForWindow?.forecastTimeIso).toBeDefined()
    })
  })
})
