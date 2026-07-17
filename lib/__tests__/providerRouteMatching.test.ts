import { describe, it, expect } from 'vitest'
import { matchProviderPointsToRoute, haversineM, rdpSimplify, pointToPolylineDistanceM } from '@/lib/weather/providerRouteMatching'

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

describe('rdpSimplify', () => {
  it('preserves endpoints of a 2-point polyline', () => {
    const pts = [{ lat: 64.0, lon: -22.0 }, { lat: 64.0, lon: -21.0 }]
    const result = rdpSimplify(pts, 10)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ lat: 64.0, lon: -22.0 })
    expect(result[result.length - 1]).toMatchObject({ lat: 64.0, lon: -21.0 })
  })

  it('collapses collinear intermediate points on a straight segment', () => {
    // Five evenly spaced points on a straight east-west line — intermediate ones are collinear
    const pts = [
      { lat: 64.0, lon: -22.0 },
      { lat: 64.0, lon: -21.75 },
      { lat: 64.0, lon: -21.5 },
      { lat: 64.0, lon: -21.25 },
      { lat: 64.0, lon: -21.0 },
    ]
    const result = rdpSimplify(pts, 1) // 1 m epsilon — collinear points deviate 0 m
    expect(result).toHaveLength(2) // only endpoints remain
    expect(result[0]).toMatchObject({ lat: 64.0, lon: -22.0 })
    expect(result[1]).toMatchObject({ lat: 64.0, lon: -21.0 })
  })

  it('preserves a significant curve point that deviates beyond epsilon', () => {
    // Curve: A=(64.0, -22.0), B=(64.2, -21.5) deviates from A→C chord, C=(64.0, -21.0)
    // Perpendicular from B to A-C line is roughly 0.2° * 111 km ≈ 22 km — well above any epsilon
    const pts = [
      { lat: 64.0, lon: -22.0 },
      { lat: 64.2, lon: -21.5 }, // significant deviation
      { lat: 64.0, lon: -21.0 },
    ]
    const result = rdpSimplify(pts, 100) // 100 m epsilon — B deviates ~22 km, must be kept
    expect(result).toHaveLength(3)
    expect(result[1]).toMatchObject({ lat: 64.2, lon: -21.5 })
  })

  it('returns at most 2 points when all intermediates are collinear regardless of input size', () => {
    // 2000 collinear points — RDP collapses to 2. Verifies RDP handles large inputs without overflow.
    const pts = Array.from({ length: 2000 }, (_, i) => ({ lat: 64.0, lon: -22.0 + i * 0.0005 }))
    const result = rdpSimplify(pts, 1)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject(pts[0])
    expect(result[result.length - 1]).toMatchObject(pts[pts.length - 1])
  })

  it('cap regression: stride-capping RDP output to 1000 never produces more than 1000 points', () => {
    // Simulate the providerMatchingPointsFrom() stride cap logic with exact-multiple input size.
    // Previously: pushing last point beyond cap produced 1001 points — rejected by endpoint with 400.
    const MAX = 1000
    // Build an RDP output of 2000 points (all distinct — RDP won't collapse them further).
    // We only care about the cap logic here, so simulate rdp = 2000 distinct points.
    const rdp = Array.from({ length: 2000 }, (_, i) => ({ lat: 64.0 + i * 0.001, lon: -22.0 }))
    const step = Math.ceil(rdp.length / MAX)
    const strided: Array<{ lat: number; lon: number }> = []
    for (let i = 0; i < rdp.length; i += step) strided.push(rdp[i])
    const last = rdp[rdp.length - 1]
    if (strided[strided.length - 1] !== last) {
      if (strided.length < MAX) {
        strided.push(last)
      } else {
        strided[strided.length - 1] = last
      }
    }
    expect(strided.length).toBeLessThanOrEqual(MAX)
    expect(strided[strided.length - 1]).toMatchObject(rdp[rdp.length - 1]) // last point preserved
    expect(strided[0]).toMatchObject(rdp[0]) // first point preserved
  })

  it('regression: stride geometry misses a fjord station but dense RDP geometry includes it', () => {
    // Synthetic fjord route: A → fjord-bend (B, offset 5 km north) → C
    // Stride at 1 point in 3 would skip B entirely; RDP preserves B.
    // Station S is 500 m from B, far from A and C.
    const A = { lat: 64.0, lon: -22.0 }
    const B = { lat: 64.045, lon: -21.5 } // ~5 km north of the A-C chord
    const C = { lat: 64.0, lon: -21.0 }

    // Sparse geometry (just A and C — simulates stride missing B)
    const sparseMatches = matchProviderPointsToRoute({
      points: [{ id: 'S', lat: 64.045, lon: -21.5 }],
      routePolyline: [A, C],
      maxDistanceM: 1_000,
    })
    expect(sparseMatches).toHaveLength(0) // station missed by sparse geometry

    // Dense geometry with B preserved by RDP
    const denseRoute = rdpSimplify([A, B, C], 100)
    expect(denseRoute).toHaveLength(3) // B preserved (deviates ~5 km)

    const denseMatches = matchProviderPointsToRoute({
      points: [{ id: 'S', lat: 64.045, lon: -21.5 }],
      routePolyline: denseRoute,
      maxDistanceM: 1_000,
    })
    expect(denseMatches).toHaveLength(1) // station found with dense geometry
    expect(denseMatches[0].distanceM).toBeLessThan(1_000)
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

describe('pointToPolylineDistanceM', () => {
  // ROUTE_EW: east-west segment at lat=64.0 from lon=-22.0 to lon=-21.0 (~50 km)
  const ROUTE_EW = [
    { lat: 64.0, lon: -22.0 },
    { lat: 64.0, lon: -21.0 },
  ]

  it('returns 0 for a point on the polyline', () => {
    // Point exactly on a vertex
    expect(pointToPolylineDistanceM(64.0, -22.0, ROUTE_EW)).toBe(0)
  })

  it('returns segment-perpendicular distance for a point between vertices', () => {
    // Point 0.1° north of the midpoint (-21.5): ~11.1 km perpendicular.
    // Vertex distances are ~40 km each — vertex-only check would miss this at 15 km threshold.
    const d = pointToPolylineDistanceM(64.1, -21.5, ROUTE_EW)
    expect(d).toBeGreaterThan(10_000)
    expect(d).toBeLessThan(12_000)
  })

  it('returns distance to nearest endpoint for a point beyond the end of the polyline', () => {
    // Point at lon=-20.5, east of the eastern endpoint (-21.0).
    // Nearest point on the polyline is the eastern endpoint (lon=-21.0).
    const d = pointToPolylineDistanceM(64.0, -20.5, ROUTE_EW)
    const dToEndpoint = haversineM(64.0, -20.5, 64.0, -21.0)
    expect(d).toBeCloseTo(dToEndpoint, -2) // within 100 m
  })

  it('returns Infinity for empty polyline', () => {
    expect(pointToPolylineDistanceM(64.0, -22.0, [])).toBe(Infinity)
  })

  it('returns haversine distance for single-point polyline', () => {
    const d = pointToPolylineDistanceM(64.0, -21.0, [{ lat: 64.0, lon: -22.0 }])
    const expected = haversineM(64.0, -21.0, 64.0, -22.0)
    expect(d).toBeCloseTo(expected, -2)
  })

  it('regression: segment-only gate — no vertex inside radius but segment crosses through', () => {
    // Route goes directly west-east: from (-22.5, 64.0) to (-20.5, 64.0).
    // Two-vertex route — no intermediate vertex.
    // Gate centre at (64.05, -21.5): 0.05° north of segment midpoint ≈ 5.6 km from segment.
    // No vertex is within 6 km (both are ~55 km away).
    // Vertex-only check would miss this gate; segment projection finds it.
    const route = [
      { lat: 64.0, lon: -22.5 },
      { lat: 64.0, lon: -20.5 },
    ]
    const d = pointToPolylineDistanceM(64.05, -21.5, route)
    expect(d).toBeLessThan(6_000)   // segment projection finds it
    // Confirm both vertices are well outside 6 km (actual ~49 km, so use > 40_000)
    expect(haversineM(64.05, -21.5, 64.0, -22.5)).toBeGreaterThan(40_000)
    expect(haversineM(64.05, -21.5, 64.0, -20.5)).toBeGreaterThan(40_000)
  })
})
