import { describe, it, expect } from 'vitest'
import { sampleRouteWeatherPoints, MAX_EXHAUSTIVE_FORECAST_POINTS } from '../weather/routeSampling'

function makePts(coords: Array<[number, number]>): Array<{ lat: number; lon: number }> {
  return coords.map(([lat, lon]) => ({ lat, lon }))
}

function makeCumDist(pts: Array<{ lat: number; lon: number }>): number[] {
  const R = 6_371_000
  const toRad = (x: number) => (x * Math.PI) / 180
  const haversineM = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }
  const cum = [0]
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + haversineM(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon))
  }
  return cum
}

describe('sampleRouteWeatherPoints', () => {
  it('returns empty result for empty input', () => {
    const { weatherPoints, diagnostics } = sampleRouteWeatherPoints([], [])
    expect(weatherPoints).toHaveLength(0)
    expect(diagnostics.rawRoutePointCount).toBe(0)
  })

  it('includes origin and destination for short route', () => {
    const pts = makePts([[64.0, -22.0], [64.5, -21.0]])
    const cum = makeCumDist(pts)
    const { weatherPoints } = sampleRouteWeatherPoints(pts, cum)
    expect(weatherPoints.length).toBeGreaterThanOrEqual(1)
    // Last point should have distanceFromOriginM equal to last cumDist
    const last = weatherPoints[weatherPoints.length - 1]
    expect(last.distanceFromOriginM).toBeCloseTo(cum[cum.length - 1], -2)
  })

  it('uses all_unique_forecast_points mode when unique cells are under cap', () => {
    // 10 points spread over ~100km — well under 120 unique cells
    const pts = makePts([
      [64.00, -22.00], [64.10, -21.90], [64.20, -21.80], [64.30, -21.70], [64.40, -21.60],
      [64.50, -21.50], [64.60, -21.40], [64.70, -21.30], [64.80, -21.20], [64.90, -21.10],
    ])
    const cum = makeCumDist(pts)
    const { diagnostics } = sampleRouteWeatherPoints(pts, cum)
    expect(diagnostics.mode).toBe('all_unique_forecast_points')
    expect(diagnostics.uniqueForecastPointCount).toBeLessThanOrEqual(MAX_EXHAUSTIVE_FORECAST_POINTS)
  })

  it('deduplicates nearby points sharing the same ~1km grid cell', () => {
    // Two points very close together (~50m apart) — should share 2dp key
    const pts = makePts([
      [64.000, -22.000],
      [64.001, -22.001], // ~130m away — different 3dp key but same 2dp key
      [64.500, -21.000],
    ])
    const cum = makeCumDist(pts)
    const { weatherPoints, diagnostics } = sampleRouteWeatherPoints(pts, cum)
    // uniqueForecastPointCount should be < pts.length (dedup happened)
    expect(diagnostics.uniqueForecastPointCount).toBeLessThan(pts.length)
    // All selected points must have unique forecast keys
    const keys = weatherPoints.map(p => `${Math.round(p.forecastLat * 1000) / 1000},${Math.round(p.forecastLon * 1000) / 1000}`)
    const uniqueKeys = new Set(keys)
    expect(uniqueKeys.size).toBe(keys.length)
  })

  it('switches to distance_capped mode when unique cells exceed cap', () => {
    // Generate >120 unique points spread over many 1km cells
    const pts = []
    for (let i = 0; i <= 130; i++) {
      pts.push({ lat: 64.0 + i * 0.02, lon: -22.0 }) // 0.02° lat ≈ 2.2km apart → each is unique 2dp cell
    }
    const cum = makeCumDist(pts)
    const { diagnostics } = sampleRouteWeatherPoints(pts, cum)
    expect(diagnostics.mode).toBe('distance_capped')
    expect(diagnostics.selectedWeatherPointCount).toBeLessThanOrEqual(MAX_EXHAUSTIVE_FORECAST_POINTS)
  })

  it('always includes the last route point (destination)', () => {
    // Generate enough unique points to force distance_capped mode
    const pts = []
    for (let i = 0; i <= 130; i++) {
      pts.push({ lat: 64.0 + i * 0.02, lon: -22.0 })
    }
    const cum = makeCumDist(pts)
    const { weatherPoints, diagnostics } = sampleRouteWeatherPoints(pts, cum)
    expect(diagnostics.mode).toBe('distance_capped')
    const lastPt = pts[pts.length - 1]
    const lastDist = cum[cum.length - 1]
    const lastWeatherPt = weatherPoints[weatherPoints.length - 1]
    // Last weather point should be close to last route point
    expect(Math.abs(lastWeatherPt.lat - lastPt.lat)).toBeLessThan(0.02)
    expect(Math.abs(lastWeatherPt.distanceFromOriginM - lastDist)).toBeLessThan(5000)
  })

  it('routeIndex values are sequential starting from 0', () => {
    const pts = makePts([[64.0, -22.0], [64.2, -21.8], [64.4, -21.6], [64.6, -21.4]])
    const cum = makeCumDist(pts)
    const { weatherPoints } = sampleRouteWeatherPoints(pts, cum)
    weatherPoints.forEach((wp, i) => {
      expect(wp.routeIndex).toBe(i)
    })
  })

  it('forecastLat/forecastLon are 3dp rounded versions of lat/lon', () => {
    const pts = makePts([[64.12345, -21.98765], [64.56789, -18.12345]])
    const cum = makeCumDist(pts)
    const { weatherPoints } = sampleRouteWeatherPoints(pts, cum)
    for (const wp of weatherPoints) {
      expect(wp.forecastLat).toBeCloseTo(Math.round(wp.lat * 1000) / 1000, 3)
      expect(wp.forecastLon).toBeCloseTo(Math.round(wp.lon * 1000) / 1000, 3)
    }
  })

  it('diagnostics fields are complete', () => {
    const pts = makePts([[64.0, -22.0], [64.3, -21.5], [64.6, -21.0]])
    const cum = makeCumDist(pts)
    const { diagnostics } = sampleRouteWeatherPoints(pts, cum)
    expect(typeof diagnostics.mode).toBe('string')
    expect(typeof diagnostics.rawRoutePointCount).toBe('number')
    expect(typeof diagnostics.uniqueForecastPointCount).toBe('number')
    expect(typeof diagnostics.selectedWeatherPointCount).toBe('number')
    expect(diagnostics.rawRoutePointCount).toBe(pts.length)
    expect(diagnostics.selectedWeatherPointCount).toBeGreaterThan(0)
  })
})
