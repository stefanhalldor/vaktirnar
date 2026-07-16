import { describe, it, expect } from 'vitest'
import { matchProviderPointsToRoute, haversineM } from '@/lib/weather/providerRouteMatching'

// Simple east-west route across Iceland (lat=64.0, lon from -22.0 to -21.0)
// Segment length ≈ 50 km
const ROUTE_EW = [
  { lat: 64.0, lon: -22.0 },
  { lat: 64.0, lon: -21.0 },
]

// Longer route with multiple segments
const ROUTE_MULTI = [
  { lat: 64.0, lon: -22.0 }, // A
  { lat: 64.0, lon: -21.0 }, // B  (~50 km from A)
  { lat: 64.5, lon: -20.5 }, // C  (~60 km from B)
]

describe('matchProviderPointsToRoute', () => {
  it('includes a point near the middle of a segment even when far from route vertices', () => {
    // P is 0.1° north of segment midpoint (-21.5) — ~11.1 km perpendicular distance
    const points = [{ id: 'mid', lat: 64.1, lon: -21.5 }]
    const matches = matchProviderPointsToRoute({
      points,
      routePolyline: ROUTE_EW,
      maxDistanceM: 15_000,
    })
    expect(matches).toHaveLength(1)
    expect(matches[0].point.id).toBe('mid')
    // distanceM should be ~11 km, not the vertex distances (~40 km each)
    expect(matches[0].distanceM).toBeLessThan(12_000)
    expect(matches[0].distanceM).toBeGreaterThan(10_000)
    // distanceFromOriginM should be near the segment midpoint (~25 km)
    expect(matches[0].distanceFromOriginM).toBeGreaterThan(20_000)
    expect(matches[0].distanceFromOriginM).toBeLessThan(30_000)
  })

  it('excludes a point outside maxDistanceM', () => {
    // P is 0.2° north of segment midpoint — ~22.3 km perpendicular
    const points = [{ id: 'far', lat: 64.2, lon: -21.5 }]
    const matches = matchProviderPointsToRoute({
      points,
      routePolyline: ROUTE_EW,
      maxDistanceM: 15_000,
    })
    expect(matches).toHaveLength(0)
  })

  it('sorts included points by route order (distanceFromOriginM ascending)', () => {
    const points = [
      { id: 'near-end', lat: 64.05, lon: -21.1 },   // close to B end
      { id: 'near-start', lat: 64.05, lon: -21.9 }, // close to A start
    ]
    const matches = matchProviderPointsToRoute({
      points,
      routePolyline: ROUTE_EW,
      maxDistanceM: 15_000,
    })
    expect(matches).toHaveLength(2)
    expect(matches[0].point.id).toBe('near-start')
    expect(matches[1].point.id).toBe('near-end')
    expect(matches[0].distanceFromOriginM).toBeLessThan(matches[1].distanceFromOriginM)
  })

  it('deduplicates duplicate ids, keeping first occurrence', () => {
    // Two entries with the same id; second has different (farther) coords
    const points = [
      { id: 'dup', lat: 64.05, lon: -21.5, name: 'first' },
      { id: 'dup', lat: 64.05, lon: -22.5, name: 'second' }, // farther from route
    ]
    const matches = matchProviderPointsToRoute({
      points,
      routePolyline: ROUTE_EW,
      maxDistanceM: 15_000,
    })
    expect(matches).toHaveLength(1)
    expect(matches[0].point.name).toBe('first')
  })

  it('handles null, undefined, and non-finite coordinates safely', () => {
    const points = [
      { id: 'null-lat', lat: null, lon: -21.5 },
      { id: 'null-lon', lat: 64.05, lon: null },
      { id: 'nan', lat: NaN, lon: -21.5 },
      { id: 'inf', lat: Infinity, lon: -21.5 },
      { id: 'valid', lat: 64.05, lon: -21.5 },
    ]
    expect(() => matchProviderPointsToRoute({
      points,
      routePolyline: ROUTE_EW,
      maxDistanceM: 15_000,
    })).not.toThrow()
    const matches = matchProviderPointsToRoute({
      points,
      routePolyline: ROUTE_EW,
      maxDistanceM: 15_000,
    })
    expect(matches).toHaveLength(1)
    expect(matches[0].point.id).toBe('valid')
  })

  it('handles empty polyline by returning [] without throwing', () => {
    const points = [{ id: 'p', lat: 64.05, lon: -21.5 }]
    expect(() => matchProviderPointsToRoute({
      points,
      routePolyline: [],
      maxDistanceM: 15_000,
    })).not.toThrow()
    const matches = matchProviderPointsToRoute({
      points,
      routePolyline: [],
      maxDistanceM: 15_000,
    })
    expect(matches).toHaveLength(0)
  })

  it('handles single-point polyline safely', () => {
    const singlePoint = [{ lat: 64.0, lon: -21.5 }]
    // Point very close to the single vertex — should be included
    const nearby = [{ id: 'close', lat: 64.0, lon: -21.5 + 0.001 }]
    const matchesNear = matchProviderPointsToRoute({
      points: nearby,
      routePolyline: singlePoint,
      maxDistanceM: 15_000,
    })
    expect(matchesNear).toHaveLength(1)
    expect(matchesNear[0].distanceFromOriginM).toBe(0)
    expect(matchesNear[0].routeFraction).toBe(0)

    // Point 30 km away — should be excluded
    const distant = [{ id: 'far', lat: 64.3, lon: -21.5 }]
    const matchesFar = matchProviderPointsToRoute({
      points: distant,
      routePolyline: singlePoint,
      maxDistanceM: 15_000,
    })
    expect(matchesFar).toHaveLength(0)
  })

  it('produces sensible routeFraction and distanceFromOriginM for a multi-segment route', () => {
    // Point just north of the midpoint of segment B→C in ROUTE_MULTI
    // B=(64.0, -21.0), C=(64.5, -20.5), midpoint ≈ (64.25, -20.75)
    const points = [{ id: 'bc-mid', lat: 64.3, lon: -20.75 }]
    const matches = matchProviderPointsToRoute({
      points,
      routePolyline: ROUTE_MULTI,
      maxDistanceM: 50_000,
    })
    expect(matches).toHaveLength(1)
    const m = matches[0]
    // distanceFromOriginM should be greater than the A→B segment length (~50 km)
    expect(m.distanceFromOriginM).toBeGreaterThan(50_000)
    // routeFraction must be between 0 and 1
    expect(m.routeFraction).toBeGreaterThan(0)
    expect(m.routeFraction).toBeLessThan(1)
    // nearestRoutePoint should be on segment B→C, not at A
    expect(m.nearestRoutePoint.lat).toBeGreaterThan(64.0)
    expect(m.nearestRoutePoint.lon).toBeGreaterThan(-21.5)
  })
})

describe('haversineM', () => {
  it('returns 0 for identical points', () => {
    expect(haversineM(64.0, -22.0, 64.0, -22.0)).toBe(0)
  })

  it('returns ~111 km per degree of latitude', () => {
    const d = haversineM(64.0, -22.0, 65.0, -22.0)
    expect(d).toBeGreaterThan(110_000)
    expect(d).toBeLessThan(112_000)
  })
})
