import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFindSettlement,
  mockFindGraphRoute,
  mockGetRoadGraph,
  mockResolveCoverage,
} = vi.hoisted(() => ({
  mockFindSettlement: vi.fn(),
  mockFindGraphRoute: vi.fn(),
  mockGetRoadGraph: vi.fn(),
  mockResolveCoverage: vi.fn(),
}))

vi.mock('@/lib/places/officialPlaceDirectory.server', () => ({
  findOfficialSettlementContainingPoint: mockFindSettlement,
}))

vi.mock('@/lib/iceland-routes/roadGraph', () => ({
  findIcelandRoadGraphRoute: mockFindGraphRoute,
  ICELAND_ROUTING_PROFILES: { fastestCar: { objective: 'fastest' } },
}))

vi.mock('@/lib/iceland-routes/roadGraphRuntime.server', () => ({
  getIcelandRoadGraph: mockGetRoadGraph,
}))

vi.mock('@/lib/iceland-routes/trustedRouteCoverage', () => ({
  resolveTrustedRouteCoverage: mockResolveCoverage,
}))

import { resolveTrustedRouteCoverageFromRuntime } from '../iceland-routes/trustedRouteCoverage.server'

const SETTLEMENT = {
  id: 'urban:1',
  name: 'Bær',
  geometry: {
    type: 'MultiPolygon' as const,
    coordinates: [[[[-20.1, 63.9], [-19.9, 63.9], [-19.9, 64.1], [-20.1, 64.1], [-20.1, 63.9]]]],
  },
}

const EDGE = {
  id: 'edge:1',
  segmentId: 'segment:1',
  fromNodeId: 'a',
  toNodeId: 'b',
  geometry: [{ lat: 64, lon: -20.05 }, { lat: 64, lon: -19.95 }],
  lengthM: 5_000,
  travelTimeS: 300,
  speedKmh: 60,
  speedSource: 'official' as const,
  roadClass: 'trunk' as const,
  surface: 'paved' as const,
  isFRoad: false,
  isMountainRoad: false,
  isSeasonal: false,
}

const INPUT = {
  origin: { name: 'Upphaf', lat: 64, lon: -20.05 },
  destination: { name: 'Endir', lat: 64, lon: -19.95 },
  referenceRoute: [{ lat: 64, lon: -20.05 }, { lat: 64, lon: -19.95 }],
  routeDistanceM: 5_000,
  routeDurationS: 300,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindSettlement.mockReturnValue(SETTLEMENT)
  mockGetRoadGraph.mockResolvedValue({ edges: [EDGE] })
  mockFindGraphRoute.mockReturnValue({
    status: 'ok',
    route: { edgeIds: [EDGE.id] },
    originSnapDistanceM: 10,
    destinationSnapDistanceM: 20,
  })
})

describe('resolveTrustedRouteCoverageFromRuntime — same-settlement orchestration', () => {
  it('returns immediately without loading the graph when the complete route is same-urban', async () => {
    const sameUrban = {
      status: 'same_urban_area' as const,
      settlementId: SETTLEMENT.id,
      settlementName: SETTLEMENT.name,
    }
    mockResolveCoverage.mockReturnValueOnce(sameUrban)

    await expect(resolveTrustedRouteCoverageFromRuntime(INPUT)).resolves.toEqual(sameUrban)
    expect(mockResolveCoverage).toHaveBeenCalledOnce()
    expect(mockGetRoadGraph).not.toHaveBeenCalled()
    expect(mockFindGraphRoute).not.toHaveBeenCalled()
  })

  it('falls through to the connected graph when a same-settlement route exits and re-enters', async () => {
    const partial = {
      status: 'partial' as const,
      start: {},
      end: {},
      coverageDistanceM: 4_000,
      coverageDurationS: 240,
      distanceConfidence: 'reference_route' as const,
    }
    mockResolveCoverage
      .mockReturnValueOnce({ status: 'unavailable', reason: 'no_connected_official_road' })
      .mockReturnValueOnce(partial)

    await expect(resolveTrustedRouteCoverageFromRuntime(INPUT)).resolves.toEqual(partial)
    expect(mockGetRoadGraph).toHaveBeenCalledOnce()
    expect(mockFindGraphRoute).toHaveBeenCalledOnce()
    expect(mockResolveCoverage).toHaveBeenCalledTimes(2)
    expect(mockResolveCoverage.mock.calls[1][0]).toMatchObject({
      connectedRoadEdges: [EDGE],
      originSnapDistanceM: 10,
      destinationSnapDistanceM: 20,
      originSettlement: SETTLEMENT,
      destinationSettlement: SETTLEMENT,
    })
  })
})
