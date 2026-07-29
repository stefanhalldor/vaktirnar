import { describe, expect, it } from 'vitest'

import {
  resolveTrustedRouteCoverage,
  type TrustedRouteCoverageInput,
  type TrustedRoutePoint,
  type TrustedSettlementBoundary,
} from '../iceland-routes/trustedRouteCoverage'
import { geometryLengthM, haversineDistanceM } from '../iceland-routes/roadGraph'
import type { IcelandRoadGraphEdge } from '../iceland-routes/roadGraphTypes'

function makeEdge(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  geometry: readonly TrustedRoutePoint[],
): IcelandRoadGraphEdge {
  const lengthM = geometryLengthM(geometry)
  return {
    id,
    segmentId: `segment:${id}`,
    fromNodeId,
    toNodeId,
    geometry,
    lengthM,
    travelTimeS: lengthM / 20,
    speedKmh: 72,
    speedSource: 'official',
    roadNumber: '1',
    roadName: 'Þjóðvegur',
    roadClass: 'trunk',
    surface: 'paved',
    isFRoad: false,
    isMountainRoad: false,
    isSeasonal: false,
  }
}

function makeSettlement(
  id: string,
  name: string,
  bounds: { minLat: number; minLon: number; maxLat: number; maxLon: number },
): TrustedSettlementBoundary {
  return {
    id,
    name,
    geometry: {
      type: 'MultiPolygon',
      coordinates: [[[
        [bounds.minLon, bounds.minLat],
        [bounds.maxLon, bounds.minLat],
        [bounds.maxLon, bounds.maxLat],
        [bounds.minLon, bounds.maxLat],
        [bounds.minLon, bounds.minLat],
      ]]],
    },
  }
}

function makeInput(
  referenceRoute: readonly TrustedRoutePoint[],
  connectedRoadEdges: readonly IcelandRoadGraphEdge[],
  overrides: Partial<TrustedRouteCoverageInput> = {},
): TrustedRouteCoverageInput {
  const routeDistanceM = geometryLengthM(referenceRoute)
  return {
    origin: { ...referenceRoute[0], name: 'Nákvæmur upphafsstaður' },
    destination: {
      ...referenceRoute[referenceRoute.length - 1],
      name: 'Nákvæmur áfangastaður',
    },
    referenceRoute,
    routeDistanceM,
    routeDurationS: 3_600,
    connectedRoadEdges,
    originSnapDistanceM: 0,
    destinationSnapDistanceM: 0,
    ...overrides,
  }
}

describe('resolveTrustedRouteCoverage', () => {
  it('keeps an exact destination exact when the connected official road reaches it', () => {
    const origin = { lat: 64, lon: -21 }
    const middle = { lat: 64, lon: -20.98 }
    const destination = { lat: 64, lon: -20.96 }
    const route = [origin, middle, destination]
    const result = resolveTrustedRouteCoverage(makeInput(route, [
      makeEdge('exact-1', 'a', 'b', [origin, middle]),
      makeEdge('exact-2', 'b', 'c', [middle, destination]),
    ]))

    expect(result.status).toBe('full')
    if (result.status !== 'full') return
    expect(result.start).toMatchObject({
      kind: 'exact',
      label: 'Nákvæmur upphafsstaður',
      point: origin,
      distanceFromTripOriginM: 0,
      elapsedFromTripOriginS: 0,
    })
    expect(result.end).toMatchObject({
      kind: 'exact',
      label: 'Nákvæmur áfangastaður',
      point: destination,
    })
    expect(result.end.distanceFromTripOriginM).toBeCloseTo(result.coverageDistanceM, -1)
    expect(result.end.elapsedFromTripOriginS).toBe(3_600)
  })

  it('stops weather coverage at the route-aware settlement gateway without replacing the exact destination', () => {
    const origin = { lat: 64, lon: -20.08 }
    const destination = { lat: 64, lon: -20 }
    const route = [origin, destination]
    const settlement = makeSettlement('urban:1', 'Bær', {
      minLat: 63.98,
      minLon: -20.02,
      maxLat: 64.02,
      maxLon: -19.98,
    })
    const exactDestination = { ...destination, name: 'Heimilisfang inni í bæ' }
    const result = resolveTrustedRouteCoverage(makeInput(
      route,
      [makeEdge('west-approach', 'west', 'centre', route)],
      { destination: exactDestination, destinationSettlement: settlement },
    ))

    expect(result.status).toBe('partial')
    if (result.status !== 'partial') return
    expect(result.end.kind).toBe('settlement_gateway')
    expect(result.end.label).toBe('Bær')
    expect(result.end.point.lat).toBeCloseTo(64, 5)
    expect(result.end.point.lon).toBeCloseTo(-20.02, 4)
    expect(result.end.point).not.toEqual(exactDestination)
    expect(exactDestination).toEqual({ lat: 64, lon: -20, name: 'Heimilisfang inni í bæ' })
    expect(result.unassessedAfterM).toBeGreaterThan(250)
    expect(result.end.elapsedFromTripOriginS).toBeLessThan(3_600)
  })

  it('derives different gateways for different approaches into the same settlement', () => {
    const destination = { lat: 64, lon: -20 }
    const settlement = makeSettlement('urban:1', 'Bær', {
      minLat: 63.98,
      minLon: -20.02,
      maxLat: 64.02,
      maxLon: -19.98,
    })
    const westRoute = [{ lat: 64, lon: -20.08 }, destination]
    const southRoute = [{ lat: 63.94, lon: -20 }, destination]

    const west = resolveTrustedRouteCoverage(makeInput(
      westRoute,
      [makeEdge('west', 'west-outside', 'centre', westRoute)],
      { destinationSettlement: settlement },
    ))
    const south = resolveTrustedRouteCoverage(makeInput(
      southRoute,
      [makeEdge('south', 'south-outside', 'centre', southRoute)],
      { destinationSettlement: settlement },
    ))

    expect(west.status).toBe('partial')
    expect(south.status).toBe('partial')
    if (west.status !== 'partial' || south.status !== 'partial') return
    expect(west.end.point).toMatchObject({ lat: 64 })
    expect(west.end.point.lon).toBeCloseTo(-20.02, 4)
    expect(south.end.point.lon).toBeCloseTo(-20, 5)
    expect(south.end.point.lat).toBeCloseTo(63.98, 4)
    expect(haversineDistanceM(west.end.point, south.end.point)).toBeGreaterThan(1_000)
  })

  it('returns same_urban_area only when the complete reference route stays inside the polygon', () => {
    const settlement = makeSettlement('urban:1', 'Bær', {
      minLat: 63.98,
      minLon: -20.02,
      maxLat: 64.02,
      maxLon: -19.98,
    })
    const route = [
      { lat: 64, lon: -20.015 },
      { lat: 64, lon: -20 },
      { lat: 64, lon: -19.985 },
    ]
    const result = resolveTrustedRouteCoverage(makeInput(route, [], {
      originSettlement: settlement,
      destinationSettlement: settlement,
    }))

    expect(result).toEqual({
      status: 'same_urban_area',
      settlementId: 'urban:1',
      settlementName: 'Bær',
    })
  })

  it('does not call a route same-urban when it exits and later re-enters the polygon', () => {
    const settlement = makeSettlement('urban:1', 'Bær', {
      minLat: 63.98,
      minLon: -20.02,
      maxLat: 64.02,
      maxLon: -19.98,
    })
    const origin = { lat: 64, lon: -20.015 }
    const northWest = { lat: 64.04, lon: -20.015 }
    const northEast = { lat: 64.04, lon: -19.985 }
    const destination = { lat: 64, lon: -19.985 }
    const route = [origin, northWest, northEast, destination]
    const result = resolveTrustedRouteCoverage(makeInput(route, [
      makeEdge('exit', 'a', 'b', [origin, northWest]),
      makeEdge('outside', 'b', 'c', [northWest, northEast]),
      makeEdge('re-enter', 'c', 'd', [northEast, destination]),
    ], {
      originSettlement: settlement,
      destinationSettlement: settlement,
    }))

    expect(result.status).toBe('partial')
    if (result.status !== 'partial') return
    expect(result.start.kind).toBe('settlement_gateway')
    expect(result.status).not.toBe('same_urban_area')
    expect(result.coverageDistanceM).toBeGreaterThan(750)
  })

  it('accepts a short-edge corridor only when the official-road node chain is contiguous', () => {
    const origin = { lat: 64, lon: -21 }
    const middle = { lat: 64, lon: -20.99 }
    const destination = { lat: 64, lon: -20.98 }
    const route = [origin, middle, destination]

    const connected = resolveTrustedRouteCoverage(makeInput(route, [
      makeEdge('connected-1', 'a', 'b', [origin, middle]),
      makeEdge('connected-2', 'b', 'c', [middle, destination]),
    ]))
    const disconnected = resolveTrustedRouteCoverage(makeInput(route, [
      makeEdge('disconnected-1', 'a', 'b', [origin, middle]),
      makeEdge('disconnected-2', 'other', 'c', [middle, destination]),
    ]))

    expect(connected.status).toBe('full')
    expect(disconnected).toEqual({
      status: 'unavailable',
      reason: 'reference_route_mismatch',
    })
  })

  it('fails closed when 30–70 m parallel official roads fit the same reference route', () => {
    const origin = { lat: 64.0005, lon: -21 }
    const destination = { lat: 64.0005, lon: -20.96 }
    const referenceRoute = [origin, destination]
    const northRoad = [
      { lat: 64.00085, lon: -21 },
      { lat: 64.00085, lon: -20.96 },
    ]
    const southRoad = [
      { lat: 64.00015, lon: -21 },
      { lat: 64.00015, lon: -20.96 },
    ]
    const result = resolveTrustedRouteCoverage(makeInput(referenceRoute, [
      makeEdge('parallel-north', 'north-a', 'north-b', northRoad),
      makeEdge('parallel-south', 'south-a', 'south-b', southRoad),
    ], {
      originSnapDistanceM: haversineDistanceM(origin, northRoad[0]),
      destinationSnapDistanceM: haversineDistanceM(destination, northRoad[1]),
    }))

    expect(result).toEqual({
      status: 'unavailable',
      reason: 'reference_route_mismatch',
    })
  })

  it('returns a rural anchor on the matched official edge while keeping provider-relative progress', () => {
    const origin = { lat: 64, lon: -21 }
    const referenceAnchor = { lat: 64, lon: -20.96 }
    const destination = { lat: 64, lon: -20.92 }
    const officialOrigin = { lat: 64.0001, lon: -21 }
    const officialAnchor = { lat: 64.0001, lon: -20.96 }
    const route = [origin, referenceAnchor, destination]
    const result = resolveTrustedRouteCoverage(makeInput(
      route,
      [makeEdge('offset-official-road', 'official-a', 'official-b', [officialOrigin, officialAnchor])],
      {
        originSnapDistanceM: haversineDistanceM(origin, officialOrigin),
        destinationSnapDistanceM: 10_000,
      },
    ))

    expect(result.status).toBe('partial')
    if (result.status !== 'partial') return
    expect(result.end.kind).toBe('official_road_anchor')
    expect(result.end.point.lat).toBeCloseTo(officialAnchor.lat, 6)
    expect(result.end.point.lon).toBeCloseTo(officialAnchor.lon, 6)
    expect(haversineDistanceM(result.end.point, referenceAnchor)).toBeGreaterThan(5)
    expect(result.end.routeFraction).toBeCloseTo(0.5, 2)
    expect(result.end.elapsedFromTripOriginS).toBeCloseTo(1_800, -1)
  })

  it('fails closed when one sparse official edge makes a long off-route detour', () => {
    const origin = { lat: 64, lon: -21 }
    const destination = { lat: 64, lon: -20.9 }
    const referenceRoute = [origin, destination]
    const sparseDetour = [
      origin,
      { lat: 64, lon: -20.9875 },
      { lat: 64, lon: -20.975 },
      { lat: 64, lon: -20.9625 },
      { lat: 64.01, lon: -20.95 },
      { lat: 64, lon: -20.9375 },
      { lat: 64, lon: -20.925 },
      { lat: 64, lon: -20.9125 },
      destination,
    ]
    const result = resolveTrustedRouteCoverage(makeInput(
      referenceRoute,
      [makeEdge('sparse-detour', 'a', 'b', sparseDetour)],
    ))

    expect(result).toEqual({
      status: 'unavailable',
      reason: 'reference_route_mismatch',
    })
  })

  it('fails closed when official-edge progress backtracks along the reference route', () => {
    const origin = { lat: 64, lon: -21 }
    const destination = { lat: 64, lon: -20.9 }
    const referenceRoute = [origin, destination]
    const backtrackingEdge = [
      origin,
      { lat: 64, lon: -20.94 },
      { lat: 64, lon: -20.96 },
      destination,
    ]
    const result = resolveTrustedRouteCoverage(makeInput(
      referenceRoute,
      [makeEdge('backtracking-edge', 'a', 'b', backtrackingEdge)],
    ))

    expect(result).toEqual({
      status: 'unavailable',
      reason: 'reference_route_mismatch',
    })
  })

  it('measures the unassessed suffix along the reference route rather than by air distance', () => {
    const origin = { lat: 64, lon: -21 }
    const anchor = { lat: 64.02, lon: -21 }
    const corner = { lat: 64.02, lon: -20.96 }
    const destination = { lat: 64, lon: -20.96 }
    const route = [origin, anchor, corner, destination]
    const assessedLengthM = haversineDistanceM(origin, anchor)
    const suffixLengthM = haversineDistanceM(anchor, corner)
      + haversineDistanceM(corner, destination)
    const result = resolveTrustedRouteCoverage(makeInput(
      route,
      [makeEdge('trusted-prefix', 'origin', 'anchor', [origin, anchor])],
      { destinationSnapDistanceM: 10_000 },
    ))

    expect(result.status).toBe('partial')
    if (result.status !== 'partial') return
    expect(result.end.kind).toBe('official_road_anchor')
    expect(result.end.point.lat).toBeCloseTo(anchor.lat, 5)
    expect(result.end.point.lon).toBeCloseTo(anchor.lon, 5)
    expect(result.coverageDistanceM).toBeCloseTo(assessedLengthM, -1)
    expect(result.unassessedAfterM).toBeCloseTo(suffixLengthM, -1)
    expect(result.unassessedAfterM).toBeGreaterThan(
      haversineDistanceM(anchor, destination) + 500,
    )
  })
})
