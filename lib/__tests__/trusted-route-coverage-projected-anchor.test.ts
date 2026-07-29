import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFindSettlement, mockGetRoadGraph } = vi.hoisted(() => ({
  mockFindSettlement: vi.fn(),
  mockGetRoadGraph: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/places/officialPlaceDirectory.server', () => ({
  findOfficialSettlementContainingPoint: mockFindSettlement,
}))
vi.mock('@/lib/iceland-routes/roadGraphRuntime.server', () => ({
  getIcelandRoadGraph: mockGetRoadGraph,
}))

import {
  buildIcelandRoadGraph,
  haversineDistanceM,
} from '@/lib/iceland-routes/roadGraph'
import { findRouteAssessmentRoadAnchors } from '@/lib/iceland-routes/routeAssessmentRoadAnchor.server'
import { createRouteAssessmentScopeId } from '@/lib/iceland-routes/routeAssessmentScopeId.server'
import { resolveTrustedRouteCoverageFromRuntime } from '@/lib/iceland-routes/trustedRouteCoverage.server'

const ROAD_START = { lat: 64, lon: -20.5 }
const ROAD_END = { lat: 64, lon: -20.1 }
const MID_EDGE_DESTINATION = { lat: 64, lon: -20.3 }

const graph = buildIcelandRoadGraph([{
  id: 'long-road',
  source: 'teskeid_fixture',
  sourceId: 'long-road',
  geometry: [ROAD_START, ROAD_END],
  roadClass: 'trunk',
  surface: 'paved',
  direction: 'forward',
}], { nodeSnapToleranceM: 2 })

function assessmentScopeId(): string {
  const anchors = findRouteAssessmentRoadAnchors(
    graph,
    { kind: 'trusted_anchor', point: ROAD_START },
    { kind: 'trusted_anchor', point: MID_EDGE_DESTINATION },
    { maxOriginSnapDistanceM: 2, maxDestinationSnapDistanceM: 2 },
  )
  if (anchors.status !== 'ok') throw new Error(`unexpected anchor status: ${anchors.status}`)
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
  mockFindSettlement.mockReturnValue(null)
  mockGetRoadGraph.mockResolvedValue(graph)
})

describe('trusted coverage for a signed mid-edge assessment endpoint', () => {
  it('matches only the direction-correct partial edge and reaches the provider endpoint', async () => {
    const distanceM = haversineDistanceM(ROAD_START, MID_EDGE_DESTINATION)
    const result = await resolveTrustedRouteCoverageFromRuntime({
      origin: { name: 'Garðabær', ...ROAD_START },
      destination: { name: 'Hella', ...MID_EDGE_DESTINATION },
      referenceRoute: [ROAD_START, MID_EDGE_DESTINATION],
      routeDistanceM: distanceM,
      routeDurationS: 600,
      assessmentScopeId: assessmentScopeId(),
    })

    expect(result.status).toBe('full')
    if (result.status !== 'full') return
    expect(result.start).toMatchObject({
      kind: 'exact',
      point: ROAD_START,
      routeFraction: 0,
    })
    expect(result.end).toMatchObject({
      kind: 'exact',
      point: MID_EDGE_DESTINATION,
      routeFraction: 1,
    })
    expect(result.coverageDistanceM).toBeCloseTo(distanceM, 0)
  })
})
