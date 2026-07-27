import { describe, expect, it } from 'vitest'
import {
  analyzeIcelandRoadGraph,
  buildIcelandRoadGraph,
  findIcelandRoadGraphRoute,
  findIcelandRoadGraphAlternatives,
  ICELAND_ROUTING_PROFILES,
} from '@/lib/iceland-routes/roadGraph'
import { fetchVegagerdinRoadGraphSegments } from '@/lib/iceland-routes/vegagerdinRoadGraphSource.server'
import { auditIcelandGoldenRoutes } from '@/lib/iceland-routes/goldenRoutes'
import { validateRoadGraphSnapshot } from '@/lib/iceland-routes/roadGraphRefresh.server'

const liveEnabled = process.env.ROAD_GRAPH_LIVE_TEST === 'true'

describe.skipIf(!liveEnabled)('Vegagerdin all-Iceland road graph — live read-only audit', () => {
  it('builds the official graph and finds Reykjavík to Akureyri', async () => {
    const segments = await fetchVegagerdinRoadGraphSegments()
    expect(segments.length).toBeGreaterThan(1_000)

    const reykjavik = { lat: 64.1466, lon: -21.9426 }
    const akureyri = { lat: 65.6826, lon: -18.0907 }
    let selected: ReturnType<typeof findIcelandRoadGraphRoute> | null = null
    let selectedGraph: ReturnType<typeof buildIcelandRoadGraph> | null = null
    let selectedDiagnostics: ReturnType<typeof analyzeIcelandRoadGraph> | null = null
    for (const toleranceM of [20, 50, 100, 200]) {
      const graph = buildIcelandRoadGraph(segments, { nodeSnapToleranceM: toleranceM })
      const diagnostics = analyzeIcelandRoadGraph(graph)
      const route = findIcelandRoadGraphRoute(graph, reykjavik, akureyri, {
        profile: ICELAND_ROUTING_PROFILES.fastestCar,
        maxSnapDistanceM: 20_000,
      })
      console.info('[road-graph-live-audit]', JSON.stringify({ toleranceM, ...diagnostics, routeStatus: route.status }))
      if (!selected && route.status === 'ok') {
        selected = route
        selectedGraph = graph
        selectedDiagnostics = diagnostics
      }
    }

    const fastest = selected ?? { status: 'no_route' as const }
    expect(fastest.status).toBe('ok')
    if (fastest.status !== 'ok') return
    console.info('[road-graph-live-route]', JSON.stringify({
      distanceM: fastest.route.distanceM,
      durationS: fastest.route.durationS,
      segmentCount: fastest.route.segmentIds.length,
      surface: fastest.route.surface,
      derivedSpeedDistanceM: fastest.route.derivedSpeedDistanceM,
      originSnapDistanceM: fastest.originSnapDistanceM,
      destinationSnapDistanceM: fastest.destinationSnapDistanceM,
    }))
    expect(fastest.route.distanceM).toBeGreaterThan(350_000)
    expect(fastest.route.distanceM).toBeLessThan(500_000)
    expect(selectedDiagnostics?.surfaceEdgeCounts.mixed).toBe(0)
    expect(selectedDiagnostics?.surfaceEdgeCounts.unknown).toBe(0)

    const paved = findIcelandRoadGraphRoute(selectedGraph!, reykjavik, akureyri, {
      profile: ICELAND_ROUTING_PROFILES.shortestPaved,
      maxSnapDistanceM: 20_000,
    })
    expect(paved.status).toBe('ok')
    if (paved.status !== 'ok') return
    expect(paved.route.surface.gravelM).toBe(0)
    expect(paved.route.surface.unknownM).toBe(0)
    const goldenRoutes = auditIcelandGoldenRoutes(selectedGraph!)
    console.info('[road-graph-golden-routes]', JSON.stringify(goldenRoutes))
    expect(goldenRoutes.every(route => route.status === 'ok')).toBe(true)
    const snapshotValidation = validateRoadGraphSnapshot({
      diagnostics: selectedDiagnostics!,
      goldenRouteStatuses: goldenRoutes.map(route => route.status),
      previous: {
        id: 'measured-pre-linear-reference-baseline',
        segmentCount: 1_226,
        nodeCount: 1_363,
        edgeCount: 2_452,
        largestWeakComponentNodeCount: 854,
      },
    })
    expect(snapshotValidation.ok, JSON.stringify(snapshotValidation)).toBe(true)

    const isafjordurAlternatives = findIcelandRoadGraphAlternatives(
      selectedGraph!, reykjavik, { lat: 66.0748, lon: -23.1340 },
      { profile: ICELAND_ROUTING_PROFILES.fastestCar, maxSnapDistanceM: 25_000, maxAlternatives: 3, maxOverlap: 0.94 },
    )
    console.info('[road-graph-isafjordur-alternatives]', JSON.stringify(isafjordurAlternatives.map(candidate => ({ distanceM: candidate.route.distanceM, durationS: candidate.route.durationS, surface: candidate.route.surface, overlap: candidate.overlapWithPrimary }))))
    expect(isafjordurAlternatives.length).toBeGreaterThanOrEqual(1)
  }, 60_000)
})
