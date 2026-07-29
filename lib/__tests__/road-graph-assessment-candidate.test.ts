import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetIcelandRoadGraph } = vi.hoisted(() => ({
  mockGetIcelandRoadGraph: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/iceland-routes/roadGraphRuntime.server', () => ({
  getIcelandRoadGraph: mockGetIcelandRoadGraph,
}))

import { buildIcelandRoadGraph } from '@/lib/iceland-routes/roadGraph'
import {
  getTeskeidAssessmentRouteCandidatesOutcome,
  resetTeskeidRouteCandidateCacheForTests,
  TESKEID_ROUTE_CANDIDATE_ID,
} from '@/lib/iceland-routes/roadGraphCandidate.server'
import { findRouteAssessmentRoadAnchors } from '@/lib/iceland-routes/routeAssessmentRoadAnchor.server'
import {
  resolveTeskeidAssessmentRouteEvidence,
  teskeidAssessmentEvidenceMatchesSignedRoute,
} from '@/lib/iceland-routes/routeAssessmentCandidateEvidence.server'
import { createRouteAssessmentScopeId } from '@/lib/iceland-routes/routeAssessmentScopeId.server'
import type { IcelandRoadGraph, IcelandRoadGraphSegmentInput } from '@/lib/iceland-routes/roadGraphTypes'
import type { LatLon } from '@/lib/iceland-routes/types'

const ROAD_START = { lat: 64, lon: -20.5 }
const ROAD_END = { lat: 64, lon: -20.1 }

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
    direction: 'both',
    ...overrides,
  }
}

function graph(overrides: Partial<IcelandRoadGraphSegmentInput> = {}): IcelandRoadGraph {
  return buildIcelandRoadGraph([
    segment('assessment-road', [ROAD_START, ROAD_END], overrides),
  ], { nodeSnapToleranceM: 2 })
}

function graphWithAlternative(direction: 'forward' | 'both' = 'forward'): IcelandRoadGraph {
  const startGateway = { lat: 64, lon: -20.6 }
  const primaryMid = { lat: 64, lon: -20.4 }
  const endGateway = { lat: 64, lon: -20.2 }
  const detourMid = { lat: 63.9, lon: -20.4 }
  return buildIcelandRoadGraph([
    segment('origin-edge', [{ lat: 64, lon: -20.7 }, startGateway], { direction }),
    segment('primary-a', [startGateway, primaryMid], { direction }),
    segment('primary-b', [primaryMid, endGateway], { direction }),
    segment('detour-a', [startGateway, detourMid], { direction }),
    segment('detour-b', [detourMid, endGateway], { direction }),
    segment('destination-edge', [endGateway, { lat: 64, lon: -20.1 }], { direction }),
  ], { nodeSnapToleranceM: 2 })
}

function signedScopeInput(
  value: IcelandRoadGraph,
  origin: { kind: 'canonical_node' | 'projected_road'; point: LatLon },
  destination: { kind: 'canonical_node' | 'projected_road'; point: LatLon },
) {
  const anchors = findRouteAssessmentRoadAnchors(
    value,
    origin,
    destination,
    { maxOriginSnapDistanceM: 500, maxDestinationSnapDistanceM: 500 },
  )
  if (anchors.status !== 'ok') throw new Error(`unexpected anchor status: ${anchors.status}`)
  return {
    origin: anchors.origin.point,
    destination: anchors.destination.point,
    assessmentScopeId: createRouteAssessmentScopeId({
      originAnchorKind: anchors.origin.kind,
      originPoint: anchors.origin.point,
      destinationAnchorKind: anchors.destination.kind,
      destinationPoint: anchors.destination.point,
      routeProvenanceFingerprint: anchors.routeProvenanceFingerprint,
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetTeskeidRouteCandidateCacheForTests()
  process.env.TESKEID_ROUTE_CANDIDATE_ENABLED = 'true'
})

describe('edge-aware Teskeið candidate for a signed assessment scope', () => {
  it('preserves a projected mid-edge destination instead of re-snapping to the road endpoint', async () => {
    const activeGraph = graph()
    const exactNavigationDestination = { lat: 64.001, lon: -20.3 }
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'canonical_node', point: ROAD_START },
      { kind: 'projected_road', point: exactNavigationDestination },
    )
    mockGetIcelandRoadGraph.mockResolvedValue(activeGraph)

    const outcome = await getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      scope.assessmentScopeId,
    )

    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    expect(outcome.routes).toHaveLength(1)
    expect(outcome.routes[0]).toMatchObject({
      id: TESKEID_ROUTE_CANDIDATE_ID,
      provider: 'teskeid',
      isDefault: false,
    })
    expect(outcome.routes[0].points[0]).toEqual(ROAD_START)
    expect(outcome.routes[0].points.at(-1)).toEqual(scope.destination)
    expect(outcome.routes[0].points.at(-1)).not.toEqual(ROAD_END)
    expect(outcome.routes[0].distanceM).toBeLessThan(20_000)
    expect(JSON.stringify(outcome)).not.toContain(JSON.stringify(exactNavigationDestination))
  })

  it('preserves a projected mid-edge origin in the reverse direction', async () => {
    const activeGraph = graph()
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.3 } },
      { kind: 'canonical_node', point: ROAD_START },
    )
    mockGetIcelandRoadGraph.mockResolvedValue(activeGraph)

    const outcome = await getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      scope.assessmentScopeId,
    )

    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    expect(outcome.routes[0].points[0]).toEqual(scope.origin)
    expect(outcome.routes[0].points.at(-1)).toEqual(ROAD_START)
    expect(outcome.routes[0].points[0]).not.toEqual(ROAD_END)
  })

  it('preserves both projected endpoints on the same road edge', async () => {
    const activeGraph = graph()
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.4 } },
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.2 } },
    )
    mockGetIcelandRoadGraph.mockResolvedValue(activeGraph)

    const outcome = await getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      scope.assessmentScopeId,
    )

    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    expect(outcome.routes[0].points[0]).toEqual(scope.origin)
    expect(outcome.routes[0].points.at(-1)).toEqual(scope.destination)
    expect(outcome.routes[0].points).not.toContainEqual(ROAD_START)
    expect(outcome.routes[0].points).not.toContainEqual(ROAD_END)
  })

  it('performs a real scoped alternative search without re-snapping either endpoint', async () => {
    const activeGraph = graphWithAlternative()
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.65 } },
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.15 } },
    )
    mockGetIcelandRoadGraph.mockResolvedValue(activeGraph)

    const primaryOnly = await getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      scope.assessmentScopeId,
      false,
    )
    const withAlternatives = await getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      scope.assessmentScopeId,
      true,
    )
    const repeated = await getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      scope.assessmentScopeId,
      true,
    )

    expect(primaryOnly.status).toBe('ready')
    expect(withAlternatives.status).toBe('ready')
    expect(repeated).toBe(withAlternatives)
    if (primaryOnly.status !== 'ready' || withAlternatives.status !== 'ready') return
    expect(primaryOnly.routes).toHaveLength(1)
    expect(withAlternatives.routes).toHaveLength(2)
    const alternative = withAlternatives.routes[1]
    expect(alternative.id).toMatch(/^teskeid-road-graph-v1-alt-1-[A-Za-z0-9_-]{43}$/)
    expect(alternative.labels).toContain('TESKEID_ALTERNATIVE')
    expect(alternative.points[0]).toEqual(scope.origin)
    expect(alternative.points.at(-1)).toEqual(scope.destination)
    expect(alternative.points).toContainEqual({ lat: 63.9, lon: -20.4 })
    expect(alternative.points).not.toEqual(withAlternatives.routes[0].points)
    expect(mockGetIcelandRoadGraph).toHaveBeenCalledTimes(3)
  })

  it('preserves both projected endpoints during a reverse-direction alternative search', async () => {
    const activeGraph = graphWithAlternative('both')
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.15 } },
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.65 } },
    )
    mockGetIcelandRoadGraph.mockResolvedValue(activeGraph)

    const outcome = await getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      scope.assessmentScopeId,
      true,
    )

    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    expect(outcome.routes).toHaveLength(2)
    expect(outcome.routes[1].points[0]).toEqual(scope.origin)
    expect(outcome.routes[1].points.at(-1)).toEqual(scope.destination)
    expect(outcome.routes[1].points).toContainEqual({ lat: 63.9, lon: -20.4 })
  })

  it('returns pending instead of caching a partial alternative search as ready', async () => {
    const activeGraph = graphWithAlternative()
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.65 } },
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.15 } },
    )
    mockGetIcelandRoadGraph.mockResolvedValue(activeGraph)
    let nowCalls = 0
    const now = vi.spyOn(Date, 'now').mockImplementation(() => (
      nowCalls++ === 0 ? 0 : 100_000
    ))
    try {
      await expect(getTeskeidAssessmentRouteCandidatesOutcome(
        scope.origin,
        scope.destination,
        scope.assessmentScopeId,
        true,
      )).resolves.toEqual({ status: 'pending', routes: [] })
    } finally {
      now.mockRestore()
    }
  })

  it('binds alternative evidence to exact signed geometry, distance and duration', () => {
    const activeGraph = graphWithAlternative()
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.65 } },
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.15 } },
    )
    const outcome = resolveTeskeidAssessmentRouteEvidence({
      graph: activeGraph,
      origin: scope.origin,
      destination: scope.destination,
      assessmentScopeId: scope.assessmentScopeId,
      includeAlternatives: true,
      alternativeDeadlineAtMs: Date.now() + 30_000,
    })

    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    expect(outcome.evidence).toHaveLength(2)
    const alternative = outcome.evidence[1]
    expect(teskeidAssessmentEvidenceMatchesSignedRoute(
      alternative,
      alternative.route,
    )).toBe(true)
    expect(teskeidAssessmentEvidenceMatchesSignedRoute(alternative, {
      ...alternative.route,
      points: [
        alternative.route.points[0],
        { lat: 65, lon: -18 },
        alternative.route.points.at(-1)!,
      ],
    })).toBe(false)
    expect(teskeidAssessmentEvidenceMatchesSignedRoute(alternative, {
      ...alternative.route,
      distanceM: alternative.route.distanceM + 1,
    })).toBe(false)
  })

  it('fails closed for malformed, stale or graph-drifted scope attestations', async () => {
    const activeGraph = graph()
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'canonical_node', point: ROAD_START },
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.3 } },
    )

    await expect(getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      'not-a-current-scope',
    )).resolves.toEqual({ status: 'unavailable', routes: [] })
    expect(mockGetIcelandRoadGraph).not.toHaveBeenCalled()

    mockGetIcelandRoadGraph.mockResolvedValueOnce(activeGraph)
    await expect(getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      `assessment:v3:${'a'.repeat(43)}`,
    )).resolves.toEqual({ status: 'unavailable', routes: [] })

    mockGetIcelandRoadGraph.mockResolvedValueOnce(graph({ speedKmh: 70, speedSource: 'official' }))
    await expect(getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      scope.assessmentScopeId,
    )).resolves.toEqual({ status: 'unavailable', routes: [] })
  })

  it('caches only the exact graph, endpoint pair and signed scope', async () => {
    const activeGraph = graph()
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'canonical_node', point: ROAD_START },
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.3 } },
    )
    mockGetIcelandRoadGraph.mockResolvedValue(activeGraph)

    const first = await getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      scope.assessmentScopeId,
    )
    const repeated = await getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      scope.assessmentScopeId,
    )

    expect(first.status).toBe('ready')
    expect(repeated).toBe(first)

    const otherScope = signedScopeInput(
      activeGraph,
      { kind: 'canonical_node', point: ROAD_START },
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.2 } },
    )
    const otherEndpoint = await getTeskeidAssessmentRouteCandidatesOutcome(
      otherScope.origin,
      otherScope.destination,
      otherScope.assessmentScopeId,
    )
    expect(otherEndpoint.status).toBe('ready')
    expect(otherEndpoint).not.toBe(first)

    const replacementGraph = graph()
    const replacementScope = signedScopeInput(
      replacementGraph,
      { kind: 'canonical_node', point: ROAD_START },
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.3 } },
    )
    expect(replacementScope.assessmentScopeId).toBe(scope.assessmentScopeId)
    mockGetIcelandRoadGraph.mockResolvedValue(replacementGraph)
    const replacement = await getTeskeidAssessmentRouteCandidatesOutcome(
      replacementScope.origin,
      replacementScope.destination,
      replacementScope.assessmentScopeId,
    )
    expect(replacement.status).toBe('ready')
    expect(replacement).not.toBe(first)
    expect(mockGetIcelandRoadGraph).toHaveBeenCalledTimes(4)
  })

  it('does not load the graph while the candidate flag is disabled', async () => {
    delete process.env.TESKEID_ROUTE_CANDIDATE_ENABLED

    await expect(getTeskeidAssessmentRouteCandidatesOutcome(
      ROAD_START,
      { lat: 64, lon: -20.3 },
      `assessment:v3:${'a'.repeat(43)}`,
    )).resolves.toEqual({ status: 'disabled', routes: [] })
    expect(mockGetIcelandRoadGraph).not.toHaveBeenCalled()
  })
})
