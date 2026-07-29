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
import { resolveTeskeidAssessmentRouteEvidence } from '@/lib/iceland-routes/routeAssessmentCandidateEvidence.server'
import { createRouteAssessmentScopeId } from '@/lib/iceland-routes/routeAssessmentScopeId.server'
import { resolveTrustedRouteCoverageFromRuntime } from '@/lib/iceland-routes/trustedRouteCoverage.server'
import type { IcelandRoadGraphSegmentInput } from '@/lib/iceland-routes/roadGraphTypes'
import type { LatLon } from '@/lib/iceland-routes/types'

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

function segment(
  id: string,
  geometry: readonly LatLon[],
  overrides: Partial<IcelandRoadGraphSegmentInput> = {},
): IcelandRoadGraphSegmentInput {
  return {
    id,
    source: 'teskeid_fixture',
    sourceId: id,
    geometry,
    roadClass: 'trunk',
    surface: 'paved',
    direction: 'forward',
    ...overrides,
  }
}

function alternativeGraph(driftAlternative = false) {
  const startGateway = { lat: 64, lon: -20.6 }
  const primaryMid = { lat: 64, lon: -20.4 }
  const endGateway = { lat: 64, lon: -20.2 }
  const detourMid = { lat: driftAlternative ? 63.89 : 63.9, lon: -20.4 }
  return buildIcelandRoadGraph([
    segment('origin-edge', [{ lat: 64, lon: -20.7 }, startGateway]),
    segment('primary-a', [startGateway, primaryMid]),
    segment('primary-b', [primaryMid, endGateway]),
    segment('detour-a', [startGateway, detourMid]),
    segment('detour-b', [detourMid, endGateway]),
    segment('destination-edge', [endGateway, { lat: 64, lon: -20.1 }]),
  ], { nodeSnapToleranceM: 2 })
}

function signedAlternativeFixture() {
  const activeGraph = alternativeGraph()
  const anchors = findRouteAssessmentRoadAnchors(
    activeGraph,
    { kind: 'projected_road', point: { lat: 64.001, lon: -20.65 } },
    { kind: 'projected_road', point: { lat: 64.001, lon: -20.15 } },
    { maxOriginSnapDistanceM: 500, maxDestinationSnapDistanceM: 500 },
  )
  if (anchors.status !== 'ok') throw new Error(`unexpected anchor status: ${anchors.status}`)
  const scopeId = createRouteAssessmentScopeId({
    originAnchorKind: anchors.origin.kind,
    originPoint: anchors.origin.point,
    destinationAnchorKind: anchors.destination.kind,
    destinationPoint: anchors.destination.point,
    routeProvenanceFingerprint: anchors.routeProvenanceFingerprint,
  })
  const evidence = resolveTeskeidAssessmentRouteEvidence({
    graph: activeGraph,
    origin: anchors.origin.point,
    destination: anchors.destination.point,
    assessmentScopeId: scopeId,
    includeAlternatives: true,
    alternativeDeadlineAtMs: Date.now() + 30_000,
  })
  if (evidence.status !== 'ready' || !evidence.evidence[1]) {
    throw new Error(`unexpected evidence status: ${evidence.status}`)
  }
  return {
    graph: activeGraph,
    origin: anchors.origin.point,
    destination: anchors.destination.point,
    scopeId,
    alternative: evidence.evidence[1].route,
  }
}

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

  it('uses the selected alternative official edges for complete weather coverage', async () => {
    const fixture = signedAlternativeFixture()
    mockGetRoadGraph.mockResolvedValue(fixture.graph)

    const result = await resolveTrustedRouteCoverageFromRuntime({
      origin: { name: 'Upphaf', ...fixture.origin },
      destination: { name: 'Endir', ...fixture.destination },
      referenceRoute: fixture.alternative.points,
      routeDistanceM: fixture.alternative.distanceM,
      routeDurationS: fixture.alternative.durationS,
      assessmentScopeId: fixture.scopeId,
      selectedTeskeidRoute: fixture.alternative,
    })

    expect(result.status).toBe('full')
    if (result.status !== 'full') return
    expect(result.start.point).toEqual(fixture.origin)
    expect(result.end.point).toEqual(fixture.destination)
    expect(result.coverageDistanceM).toBe(fixture.alternative.distanceM)
  })

  it('fails closed when alternative-only graph evidence drifts under a still-valid primary scope', async () => {
    const fixture = signedAlternativeFixture()
    mockGetRoadGraph.mockResolvedValue(alternativeGraph(true))

    await expect(resolveTrustedRouteCoverageFromRuntime({
      origin: { name: 'Upphaf', ...fixture.origin },
      destination: { name: 'Endir', ...fixture.destination },
      referenceRoute: fixture.alternative.points,
      routeDistanceM: fixture.alternative.distanceM,
      routeDurationS: fixture.alternative.durationS,
      assessmentScopeId: fixture.scopeId,
      selectedTeskeidRoute: fixture.alternative,
    })).resolves.toEqual({
      status: 'unavailable',
      reason: 'no_connected_official_road',
    })
  })
})
