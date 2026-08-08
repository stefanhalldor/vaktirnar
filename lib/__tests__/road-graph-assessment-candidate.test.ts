import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetIcelandRoadGraph } = vi.hoisted(() => ({
  mockGetIcelandRoadGraph: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/iceland-routes/roadGraphRuntime.server', () => ({
  getIcelandRoadGraph: mockGetIcelandRoadGraph,
}))

import {
  buildIcelandRoadGraph,
} from '@/lib/iceland-routes/roadGraph'
import {
  getTeskeidAssessmentRouteCandidatesOutcome,
  resetTeskeidRouteCandidateCacheForTests,
  TESKEID_ROUTE_CANDIDATE_ID,
} from '@/lib/iceland-routes/roadGraphCandidate.server'
import { findRouteAssessmentRoadAnchors } from '@/lib/iceland-routes/routeAssessmentRoadAnchor.server'
import {
  resolveTeskeidAssessmentRouteEvidence,
  teskeidAssessmentRouteEdgesHaveIntegrity,
  teskeidAssessmentEvidenceMatchesSignedRoute,
} from '@/lib/iceland-routes/routeAssessmentCandidateEvidence.server'
import { signRouteOptionEnvelope } from '@/lib/iceland-routes/routeOptionEnvelope.server'
import { createRouteAssessmentScopeId } from '@/lib/iceland-routes/routeAssessmentScopeId.server'
import { HOLMAVIK_NORTH_ROUTE61_VIA } from '@/lib/weather/routeCautionConstants'
import type { IcelandRoadGraph, IcelandRoadGraphSegmentInput } from '@/lib/iceland-routes/roadGraphTypes'
import type { LatLon } from '@/lib/iceland-routes/types'

const ROAD_START = { lat: 64, lon: -20.5 }
const ROAD_END = { lat: 64, lon: -20.1 }
const REYKJAVIK = { lat: 64.1466, lon: -21.9426 }
const HOLMAVIK = { lat: 65.703, lon: -21.685 }
const THINGEYRI = { lat: 65.8797, lon: -23.4929 }

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

function graphWithWestfjordsRoutes(): IcelandRoadGraph {
  return buildIcelandRoadGraph([
    segment('south-westfjords-direct', [REYKJAVIK, THINGEYRI]),
    segment('holmavik-leg-south', [REYKJAVIK, HOLMAVIK]),
    segment('holmavik-leg-north', [HOLMAVIK, THINGEYRI]),
  ], { nodeSnapToleranceM: 2 })
}

function graphWithOnlyHolmavikWestfjordsRoute(): IcelandRoadGraph {
  return buildIcelandRoadGraph([
    segment('holmavik-only-south', [REYKJAVIK, HOLMAVIK]),
    segment('holmavik-only-north', [HOLMAVIK, THINGEYRI]),
  ], { nodeSnapToleranceM: 2 })
}

function graphWithHolmavikBacktrackTrap(): IcelandRoadGraph {
  const southernShortcut = { lat: 65.1, lon: -22.1 }
  return buildIcelandRoadGraph([
    segment('primary-southern-route', [REYKJAVIK, THINGEYRI], { lengthM: 300_000 }),
    segment('origin-to-holmavik', [REYKJAVIK, HOLMAVIK], { lengthM: 200_000 }),
    segment('holmavik-to-north-gate', [HOLMAVIK, HOLMAVIK_NORTH_ROUTE61_VIA], { lengthM: 20_000 }),
    segment('backtrack-south', [HOLMAVIK, southernShortcut], { lengthM: 10_000 }),
    segment('southern-shortcut-to-destination', [southernShortcut, THINGEYRI], { lengthM: 30_000 }),
    segment('north-gate-to-destination', [HOLMAVIK_NORTH_ROUTE61_VIA, THINGEYRI], { lengthM: 100_000 }),
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

  it('strips internal elevation metadata before signing a Teskeið route envelope', async () => {
    const elevatedGeometry = [
      { ...ROAD_START, elevationM: 10 },
      { lat: 64, lon: -20.3, elevationM: 20 },
      { ...ROAD_END, elevationM: 30 },
    ]
    const activeGraph = buildIcelandRoadGraph([
      segment('elevated-assessment-road', elevatedGeometry),
    ], { nodeSnapToleranceM: 2 })
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'canonical_node', point: ROAD_START },
      { kind: 'canonical_node', point: ROAD_END },
    )
    mockGetIcelandRoadGraph.mockResolvedValue(activeGraph)

    const outcome = await getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      scope.assessmentScopeId,
    )

    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    expect(outcome.routes[0].points.every(point => (
      Object.keys(point).sort().join(',') === 'lat,lon'
    ))).toBe(true)

    const savedSecret = process.env.AUTH_CODE_SECRET
    process.env.AUTH_CODE_SECRET = 'test-route-envelope-secret-at-least-32-bytes-long'
    try {
      expect(() => signRouteOptionEnvelope({
        origin: { lat: scope.origin.lat, lon: scope.origin.lon },
        destination: { lat: scope.destination.lat, lon: scope.destination.lon },
        assessmentScopeId: scope.assessmentScopeId,
        route: outcome.routes[0],
      })).not.toThrow()
    } finally {
      if (savedSecret === undefined) delete process.env.AUTH_CODE_SECRET
      else process.env.AUTH_CODE_SECRET = savedSecret
    }
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

  it('publishes a Teskeið-owned route through Hólmavík when the primary Westfjords route is cautioned', () => {
    const activeGraph = graphWithWestfjordsRoutes()
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'canonical_node', point: REYKJAVIK },
      { kind: 'canonical_node', point: THINGEYRI },
    )

    const outcome = resolveTeskeidAssessmentRouteEvidence({
      graph: activeGraph,
      origin: scope.origin,
      destination: scope.destination,
      assessmentScopeId: scope.assessmentScopeId,
      includeAlternatives: false,
      deadlineAtMs: Date.now() + 30_000,
    })

    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    expect(outcome.evidence).toHaveLength(2)
    expect(outcome.evidence[0].route.cautions).toContainEqual(
      expect.objectContaining({ id: 'westfjords-south-route60' }),
    )
    const viaHolmavik = outcome.evidence[1]
    expect(viaHolmavik.route).toMatchObject({
      provider: 'teskeid',
      labels: expect.arrayContaining(['CURATED_VIA_HOLMAVIK', 'TESKEID_ALTERNATIVE']),
    })
    expect(viaHolmavik.route.points).toContainEqual(HOLMAVIK)
    expect(viaHolmavik.route.cautions).not.toContainEqual(
      expect.objectContaining({ id: 'westfjords-south-route60' }),
    )
    expect(viaHolmavik.route.distanceM).toBeGreaterThan(outcome.evidence[0].route.distanceM)
  })

  it('keeps the Teskeið-owned Hólmavík route invariant in the reverse direction', () => {
    const activeGraph = graphWithWestfjordsRoutes()
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'canonical_node', point: THINGEYRI },
      { kind: 'canonical_node', point: REYKJAVIK },
    )

    const outcome = resolveTeskeidAssessmentRouteEvidence({
      graph: activeGraph,
      origin: scope.origin,
      destination: scope.destination,
      assessmentScopeId: scope.assessmentScopeId,
      includeAlternatives: false,
      deadlineAtMs: Date.now() + 30_000,
    })

    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    const viaHolmavik = outcome.evidence.find(evidence => (
      evidence.route.labels.includes('CURATED_VIA_HOLMAVIK')
    ))
    expect(viaHolmavik?.route.provider).toBe('teskeid')
    expect(viaHolmavik?.route.points).toContainEqual(HOLMAVIK)
    expect(viaHolmavik?.route.points[0]).toEqual(THINGEYRI)
    expect(viaHolmavik?.route.points.at(-1)).toEqual(REYKJAVIK)
  })

  it('names the primary Teskeið route when it already runs through Hólmavík', () => {
    const activeGraph = graphWithOnlyHolmavikWestfjordsRoute()
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'canonical_node', point: REYKJAVIK },
      { kind: 'canonical_node', point: THINGEYRI },
    )

    const outcome = resolveTeskeidAssessmentRouteEvidence({
      graph: activeGraph,
      origin: scope.origin,
      destination: scope.destination,
      assessmentScopeId: scope.assessmentScopeId,
      includeAlternatives: false,
    })

    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    expect(outcome.evidence).toHaveLength(1)
    expect(outcome.evidence[0].route).toMatchObject({
      provider: 'teskeid',
      labels: expect.arrayContaining(['CURATED_VIA_HOLMAVIK']),
    })
    expect(outcome.evidence[0].route.points).toContainEqual(HOLMAVIK)
  })

  it('does not let the post-Hólmavík leg turn south again when that path is shorter', () => {
    const activeGraph = graphWithHolmavikBacktrackTrap()
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'canonical_node', point: REYKJAVIK },
      { kind: 'canonical_node', point: THINGEYRI },
    )

    const outcome = resolveTeskeidAssessmentRouteEvidence({
      graph: activeGraph,
      origin: scope.origin,
      destination: scope.destination,
      assessmentScopeId: scope.assessmentScopeId,
      includeAlternatives: false,
      deadlineAtMs: Date.now() + 30_000,
    })

    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    const viaHolmavik = outcome.evidence.find(evidence => (
      evidence.route.labels.includes('CURATED_VIA_HOLMAVIK')
    ))
    expect(viaHolmavik).toBeDefined()
    expect(viaHolmavik?.connectedRoadEdges.some(edge => (
      edge.segmentId === 'north-gate-to-destination'
    ))).toBe(true)
    expect(viaHolmavik?.connectedRoadEdges.some(edge => (
      edge.segmentId === 'backtrack-south'
        || edge.segmentId === 'southern-shortcut-to-destination'
    ))).toBe(false)
  })

  it('keeps the northern exterior leg outside Hólmavík in the reverse direction too', () => {
    const activeGraph = graphWithHolmavikBacktrackTrap()
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'canonical_node', point: THINGEYRI },
      { kind: 'canonical_node', point: REYKJAVIK },
    )

    const outcome = resolveTeskeidAssessmentRouteEvidence({
      graph: activeGraph,
      origin: scope.origin,
      destination: scope.destination,
      assessmentScopeId: scope.assessmentScopeId,
      includeAlternatives: false,
      deadlineAtMs: Date.now() + 30_000,
    })

    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    const viaHolmavik = outcome.evidence.find(evidence => (
      evidence.route.labels.includes('CURATED_VIA_HOLMAVIK')
    ))
    expect(viaHolmavik).toBeDefined()
    expect(viaHolmavik?.connectedRoadEdges.some(edge => (
      edge.segmentId === 'north-gate-to-destination'
    ))).toBe(true)
    expect(viaHolmavik?.connectedRoadEdges.some(edge => (
      edge.segmentId === 'backtrack-south'
        || edge.segmentId === 'southern-shortcut-to-destination'
    ))).toBe(false)
  })

  it('keeps validated primary evidence when only implicit safety synthesis exhausts its budget', () => {
    const activeGraph = graphWithHolmavikBacktrackTrap()
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'canonical_node', point: REYKJAVIK },
      { kind: 'canonical_node', point: THINGEYRI },
    )

    const outcome = resolveTeskeidAssessmentRouteEvidence({
      graph: activeGraph,
      origin: scope.origin,
      destination: scope.destination,
      assessmentScopeId: scope.assessmentScopeId,
      includeAlternatives: false,
      deadlineAtMs: Date.now() + 30_000,
      alternativeDeadlineAtMs: Date.now() - 1,
    })

    expect(outcome.status).toBe('ready')
    if (outcome.status !== 'ready') return
    expect(outcome.cacheable).toBe(false)
    expect(outcome.evidence).toHaveLength(1)
    expect(outcome.evidence[0].route.cautions).toContainEqual(
      expect.objectContaining({ id: 'westfjords-south-route60' }),
    )
    expect(outcome.evidence[0].route.labels).not.toContain('CURATED_VIA_HOLMAVIK')

    expect(resolveTeskeidAssessmentRouteEvidence({
      graph: activeGraph,
      origin: scope.origin,
      destination: scope.destination,
      assessmentScopeId: scope.assessmentScopeId,
      includeAlternatives: true,
      deadlineAtMs: Date.now() + 30_000,
      alternativeDeadlineAtMs: Date.now() - 1,
    })).toEqual({ status: 'incomplete', evidence: [] })
  })

  it('does not cache a primary whose implicit safety route is still incomplete', async () => {
    const activeGraph = graphWithHolmavikBacktrackTrap()
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'canonical_node', point: REYKJAVIK },
      { kind: 'canonical_node', point: THINGEYRI },
    )
    mockGetIcelandRoadGraph.mockResolvedValue(activeGraph)
    let nowCalls = 0
    const now = vi.spyOn(Date, 'now').mockImplementation(() => (
      nowCalls++ === 0 ? 0 : 29_900
    ))
    try {
      const partial = await getTeskeidAssessmentRouteCandidatesOutcome(
        scope.origin,
        scope.destination,
        scope.assessmentScopeId,
      )
      expect(partial.status).toBe('ready')
      if (partial.status !== 'ready') return
      expect(partial.routes).toHaveLength(1)
      expect(partial.cacheable).toBe(false)

      const completed = await getTeskeidAssessmentRouteCandidatesOutcome(
        scope.origin,
        scope.destination,
        scope.assessmentScopeId,
      )
      expect(completed.status).toBe('ready')
      if (completed.status !== 'ready') return
      expect(completed.routes).toHaveLength(2)
      expect(completed.cacheable).toBeUndefined()
      expect(completed).not.toBe(partial)
      expect(mockGetIcelandRoadGraph).toHaveBeenCalledTimes(2)
    } finally {
      now.mockRestore()
    }
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

  it('propagates the absolute deadline to primary reconstruction without caching pending', async () => {
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

    const recovered = await getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      scope.assessmentScopeId,
      true,
    )
    expect(recovered.status).toBe('ready')
    expect(mockGetIcelandRoadGraph).toHaveBeenCalledTimes(2)
  })

  it('returns explicit incomplete evidence when the primary deadline is already exhausted', () => {
    const activeGraph = graph()
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'canonical_node', point: ROAD_START },
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.3 } },
    )

    expect(resolveTeskeidAssessmentRouteEvidence({
      graph: activeGraph,
      origin: scope.origin,
      destination: scope.destination,
      assessmentScopeId: scope.assessmentScopeId,
      includeAlternatives: false,
      deadlineAtMs: Date.now() - 1,
    })).toEqual({ status: 'incomplete', evidence: [] })
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

  it('rejects discontinuous, duplicate and wrong-scope edge evidence before publication', () => {
    const activeGraph = graphWithAlternative()
    const anchors = findRouteAssessmentRoadAnchors(
      activeGraph,
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.65 } },
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.15 } },
      { maxOriginSnapDistanceM: 500, maxDestinationSnapDistanceM: 500 },
    )
    expect(anchors.status).toBe('ok')
    if (anchors.status !== 'ok') return

    const validInput = {
      connectedRoadEdges: anchors.connectedRoadEdges,
      origin: anchors.origin.point,
      destination: anchors.destination.point,
    }
    expect(teskeidAssessmentRouteEdgesHaveIntegrity(validInput)).toBe(true)
    expect(teskeidAssessmentRouteEdgesHaveIntegrity({
      ...validInput,
      origin: { lat: anchors.origin.point.lat + 0.01, lon: anchors.origin.point.lon },
    })).toBe(false)
    expect(teskeidAssessmentRouteEdgesHaveIntegrity({
      ...validInput,
      connectedRoadEdges: [
        anchors.connectedRoadEdges[0],
        anchors.connectedRoadEdges[0],
      ],
    })).toBe(false)

    const disconnected = anchors.connectedRoadEdges.map((edge, index) => (
      index === 1
        ? {
            ...edge,
            geometry: [
              { lat: edge.geometry[0].lat + 0.01, lon: edge.geometry[0].lon },
              ...edge.geometry.slice(1),
            ],
          }
        : edge
    ))
    expect(teskeidAssessmentRouteEdgesHaveIntegrity({
      ...validInput,
      connectedRoadEdges: disconnected,
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

  it('keeps quick and extended results separately cached on one graph identity', async () => {
    const activeGraph = graph()
    const scope = signedScopeInput(
      activeGraph,
      { kind: 'canonical_node', point: ROAD_START },
      { kind: 'projected_road', point: { lat: 64.001, lon: -20.3 } },
    )
    mockGetIcelandRoadGraph.mockResolvedValue(activeGraph)

    const quick = await getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      scope.assessmentScopeId,
      false,
      'quick',
    )
    const extended = await getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      scope.assessmentScopeId,
      false,
      'extended',
    )
    const repeatedExtended = await getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      scope.assessmentScopeId,
      false,
      'extended',
    )

    expect(quick.status).toBe('ready')
    expect(extended.status).toBe('ready')
    expect(extended).not.toBe(quick)
    expect(repeatedExtended).toBe(extended)
    expect(mockGetIcelandRoadGraph.mock.calls).toEqual([
      [],
      [],
      [],
    ])
  })

  it('drops Fast Refresh candidate state created by an older routing policy', async () => {
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
    expect(first.status).toBe('ready')

    const runtime = globalThis as typeof globalThis & {
      __teskeidRouteCandidateCacheV4__?: { policyFingerprint: string }
    }
    expect(runtime.__teskeidRouteCandidateCacheV4__).toBeDefined()
    runtime.__teskeidRouteCandidateCacheV4__!.policyFingerprint = 'stale-routing-policy'

    const recomputed = await getTeskeidAssessmentRouteCandidatesOutcome(
      scope.origin,
      scope.destination,
      scope.assessmentScopeId,
    )
    expect(recomputed.status).toBe('ready')
    expect(recomputed).not.toBe(first)
    expect(mockGetIcelandRoadGraph).toHaveBeenCalledTimes(2)
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
