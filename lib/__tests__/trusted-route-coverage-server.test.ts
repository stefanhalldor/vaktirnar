import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFindSettlement,
  mockFindGraphRoute,
  mockFindAssessmentAnchors,
  mockGetRoadGraph,
  mockResolveCoverage,
} = vi.hoisted(() => ({
  mockFindSettlement: vi.fn(),
  mockFindGraphRoute: vi.fn(),
  mockFindAssessmentAnchors: vi.fn(),
  mockGetRoadGraph: vi.fn(),
  mockResolveCoverage: vi.fn(),
}))

vi.mock('server-only', () => ({}))
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

vi.mock('@/lib/iceland-routes/routeAssessmentRoadAnchor.server', () => ({
  findRouteAssessmentRoadAnchors: mockFindAssessmentAnchors,
}))

vi.mock('@/lib/iceland-routes/trustedRouteCoverage', () => ({
  resolveTrustedRouteCoverage: mockResolveCoverage,
}))

import { resolveTrustedRouteCoverageFromRuntime } from '../iceland-routes/trustedRouteCoverage.server'
import { createRouteAssessmentScopeId } from '../iceland-routes/routeAssessmentScopeId.server'

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

const ASSESSMENT_ANCHORS = {
  status: 'ok' as const,
  origin: {
    kind: 'settlement_node' as const,
    point: { lat: INPUT.origin.lat, lon: INPUT.origin.lon },
    snapDistanceM: 0,
  },
  destination: {
    kind: 'projected_road' as const,
    point: { lat: INPUT.destination.lat, lon: INPUT.destination.lon },
    snapDistanceM: 0,
  },
  connectedRoadEdges: [EDGE],
  routeProvenanceFingerprint: 'route-provenance-v1',
}

function assessmentScopeIdFor(
  anchors: typeof ASSESSMENT_ANCHORS = ASSESSMENT_ANCHORS,
): string {
  return createRouteAssessmentScopeId({
    originAnchorKind: anchors.origin.kind,
    originPoint: anchors.origin.point,
    destinationAnchorKind: anchors.destination.kind,
    destinationPoint: anchors.destination.point,
    routeProvenanceFingerprint: anchors.routeProvenanceFingerprint,
  })
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
  mockFindAssessmentAnchors.mockReturnValue(ASSESSMENT_ANCHORS)
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

describe('resolveTrustedRouteCoverageFromRuntime — signed assessment attestation', () => {
  it('uses two-metre edge-aware anchors only after exact scope re-attestation', async () => {
    const full = {
      status: 'full' as const,
      start: {},
      end: {},
      coverageDistanceM: 5_000,
      coverageDurationS: 300,
      distanceConfidence: 'reference_route' as const,
    }
    mockFindSettlement.mockReturnValue(null)
    mockResolveCoverage.mockReturnValue(full)

    await expect(resolveTrustedRouteCoverageFromRuntime({
      ...INPUT,
      assessmentScopeId: assessmentScopeIdFor(),
    })).resolves.toEqual(full)

    expect(mockFindAssessmentAnchors).toHaveBeenCalledWith(
      { edges: [EDGE] },
      { kind: 'trusted_anchor', point: INPUT.origin },
      { kind: 'trusted_anchor', point: INPUT.destination },
      { maxOriginSnapDistanceM: 2, maxDestinationSnapDistanceM: 2 },
    )
    expect(mockFindGraphRoute).not.toHaveBeenCalled()
    expect(mockResolveCoverage).toHaveBeenCalledWith(expect.objectContaining({
      connectedRoadEdges: [EDGE],
      originSnapDistanceM: 0,
      destinationSnapDistanceM: 0,
    }))
    expect(mockResolveCoverage.mock.calls[0][0]).not.toHaveProperty('assessmentScopeId')
  })

  it.each([
    'malformed',
    'assessment:v3:stale-scope',
  ])('fails closed for malformed or stale signed claim %s', async assessmentScopeId => {
    mockFindSettlement.mockReturnValue(null)

    await expect(resolveTrustedRouteCoverageFromRuntime({
      ...INPUT,
      assessmentScopeId,
    })).resolves.toEqual({
      status: 'unavailable',
      reason: 'no_connected_official_road',
    })
    expect(mockResolveCoverage).not.toHaveBeenCalled()
    expect(mockFindGraphRoute).not.toHaveBeenCalled()
  })

  it('fails closed when route provenance drifts after the scope was signed', async () => {
    mockFindSettlement.mockReturnValue(null)
    const originalScopeId = assessmentScopeIdFor()
    mockFindAssessmentAnchors.mockReturnValue({
      ...ASSESSMENT_ANCHORS,
      routeProvenanceFingerprint: 'route-provenance-after-graph-drift',
    })

    await expect(resolveTrustedRouteCoverageFromRuntime({
      ...INPUT,
      assessmentScopeId: originalScopeId,
    })).resolves.toEqual({
      status: 'unavailable',
      reason: 'no_connected_official_road',
    })
    expect(mockResolveCoverage).not.toHaveBeenCalled()
  })

  it('fails closed when scoped graph loading exceeds the coverage budget', async () => {
    mockFindSettlement.mockReturnValue(null)
    vi.useFakeTimers()
    try {
      mockGetRoadGraph.mockReturnValueOnce(new Promise(() => {}))
      const pending = resolveTrustedRouteCoverageFromRuntime({
        ...INPUT,
        assessmentScopeId: assessmentScopeIdFor(),
      })
      await vi.advanceTimersByTimeAsync(5_001)
      await expect(pending).resolves.toEqual({
        status: 'unavailable',
        reason: 'road_graph_unavailable',
      })
    } finally {
      vi.useRealTimers()
    }
    expect(mockFindAssessmentAnchors).not.toHaveBeenCalled()
    expect(mockResolveCoverage).not.toHaveBeenCalled()
  })
})
