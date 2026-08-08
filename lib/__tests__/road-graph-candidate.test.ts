import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetIcelandRoadGraph, mockFindRoute } = vi.hoisted(() => ({
  mockGetIcelandRoadGraph: vi.fn(),
  mockFindRoute: vi.fn(),
}))

vi.mock('@/lib/iceland-routes/roadGraphRuntime.server', () => ({
  getIcelandRoadGraph: mockGetIcelandRoadGraph,
}))

vi.mock('server-only', () => ({}))

vi.mock('@/lib/iceland-routes/roadGraph', () => ({
  ICELAND_ROUTING_PROFILES: { fastestCar: { id: 'fastest-car' } },
  findIcelandRoadGraphRoute: mockFindRoute,
}))

import {
  getTeskeidRouteCandidate,
  getTeskeidRouteCandidatesOutcome,
  isTeskeidRouteCandidateEnabled,
  resetTeskeidRouteCandidateCacheForTests,
  TESKEID_ROUTE_CANDIDATE_ID,
} from '@/lib/iceland-routes/roadGraphCandidate.server'
import { signRouteOptionEnvelope } from '@/lib/iceland-routes/routeOptionEnvelope.server'

const ORIGIN = { lat: 64.14, lon: -21.9 }
const DESTINATION = { lat: 65.68, lon: -18.1 }

beforeEach(() => {
  vi.clearAllMocks()
  resetTeskeidRouteCandidateCacheForTests()
  delete process.env.TESKEID_ROUTE_CANDIDATE_ENABLED
})

describe('Teskeið route candidate flag', () => {
  it('is exact opt-in', () => {
    expect(isTeskeidRouteCandidateEnabled({})).toBe(false)
    expect(isTeskeidRouteCandidateEnabled({ TESKEID_ROUTE_CANDIDATE_ENABLED: 'TRUE' })).toBe(false)
    expect(isTeskeidRouteCandidateEnabled({ TESKEID_ROUTE_CANDIDATE_ENABLED: 'true' })).toBe(true)
  })

  it('does not build or fetch the graph while disabled', async () => {
    await expect(getTeskeidRouteCandidate(ORIGIN, DESTINATION)).resolves.toBeNull()
    expect(mockGetIcelandRoadGraph).not.toHaveBeenCalled()
  })

  it('returns a labelled, non-default candidate when the graph route succeeds', async () => {
    process.env.TESKEID_ROUTE_CANDIDATE_ENABLED = 'true'
    mockGetIcelandRoadGraph.mockResolvedValue({ graph: true })
    mockFindRoute.mockReturnValue({
      status: 'ok',
      originSnapDistanceM: 50,
      destinationSnapDistanceM: 80,
      route: {
        geometry: [ORIGIN, DESTINATION],
        distanceM: 390_000,
        durationS: 16_500,
        surface: { pavedM: 380_000, gravelM: 10_000, mixedM: 0, unknownM: 0 },
      },
    })

    const candidate = await getTeskeidRouteCandidate(ORIGIN, DESTINATION)

    expect(candidate).toMatchObject({
      id: TESKEID_ROUTE_CANDIDATE_ID,
      provider: 'teskeid',
      isDefault: false,
      distanceM: 390_000,
      labels: expect.arrayContaining(['TESKEID_EXPERIMENTAL', 'TESKEID_GRAVEL']),
      experimental: { derivedDuration: true },
    })
  })

  it('does not flag the fjord route from the broad approximate Öxi corridor alone', async () => {
    process.env.TESKEID_ROUTE_CANDIDATE_ENABLED = 'true'
    mockGetIcelandRoadGraph.mockResolvedValue({ graph: true })
    mockFindRoute.mockReturnValue({
      status: 'ok',
      originSnapDistanceM: 50,
      destinationSnapDistanceM: 80,
      route: {
        geometry: [
          { lat: 64.82, lon: -14.30 },
          { lat: 64.90, lon: -14.35 },
        ],
        distanceM: 20_000,
        durationS: 1_200,
        surface: { pavedM: 20_000, gravelM: 0, mixedM: 0, unknownM: 0 },
      },
    })

    const candidate = await getTeskeidRouteCandidate(ORIGIN, DESTINATION)

    expect(candidate?.cautions?.some(caution => caution.id === 'oxi-axarvegur-939')).toBe(false)
  })

  it('still flags a Teskeið route that passes the station-grade Öxi evidence point', async () => {
    process.env.TESKEID_ROUTE_CANDIDATE_ENABLED = 'true'
    mockGetIcelandRoadGraph.mockResolvedValue({ graph: true })
    mockFindRoute.mockReturnValue({
      status: 'ok',
      originSnapDistanceM: 50,
      destinationSnapDistanceM: 80,
      route: {
        geometry: [
          { lat: 64.82, lon: -14.66 },
          { lat: 64.83, lon: -14.65 },
        ],
        distanceM: 2_000,
        durationS: 240,
        surface: { pavedM: 0, gravelM: 2_000, mixedM: 0, unknownM: 0 },
      },
    })

    const candidate = await getTeskeidRouteCandidate(ORIGIN, DESTINATION)

    expect(candidate?.cautions?.some(caution => caution.id === 'oxi-axarvegur-939')).toBe(true)
  })

  it('exposes bounded F-road facts for route-card labelling', async () => {
    process.env.TESKEID_ROUTE_CANDIDATE_ENABLED = 'true'
    mockGetIcelandRoadGraph.mockResolvedValue({ graph: true })
    mockFindRoute.mockReturnValue({
      status: 'ok',
      originSnapDistanceM: 50,
      destinationSnapDistanceM: 80,
      route: {
        geometry: [ORIGIN, DESTINATION],
        distanceM: 90_000,
        durationS: 7_200,
        surface: { pavedM: 0, gravelM: 90_000, mixedM: 0, unknownM: 0 },
        fRoadDistanceM: 45_000,
        fRoadNumbers: ['F35'],
      },
    })

    const candidate = await getTeskeidRouteCandidate(ORIGIN, DESTINATION)

    expect(candidate?.experimental?.fRoad).toEqual({ distanceM: 45_000, roadNumbers: ['F35'] })
  })

  it('bounds a 28,496-point route to one envelope-safe geometry', async () => {
    process.env.TESKEID_ROUTE_CANDIDATE_ENABLED = 'true'
    process.env.AUTH_CODE_SECRET = 'test-route-envelope-secret-at-least-32-bytes-long'
    const denseGeometry = Array.from({ length: 28_496 }, (_, index) => {
      const fraction = index / 28_495
      return {
        lat: ORIGIN.lat + fraction * (DESTINATION.lat - ORIGIN.lat)
          + Math.sin(fraction * Math.PI * 4_000) * 0.003,
        lon: ORIGIN.lon + fraction * (DESTINATION.lon - ORIGIN.lon),
      }
    })
    mockGetIcelandRoadGraph.mockResolvedValue({ graph: true })
    mockFindRoute.mockReturnValue({
      status: 'ok',
      originSnapDistanceM: 50,
      destinationSnapDistanceM: 80,
      route: {
        geometry: denseGeometry,
        distanceM: 455_000,
        durationS: 20_100,
        surface: { pavedM: 450_000, gravelM: 5_000, mixedM: 0, unknownM: 0 },
      },
    })

    const candidate = await getTeskeidRouteCandidate(ORIGIN, DESTINATION)

    expect(candidate).not.toBeNull()
    expect(candidate!.points).toHaveLength(1_000)
    expect(candidate!.points[0]).toEqual(denseGeometry[0])
    expect(candidate!.points[candidate!.points.length - 1]).toEqual(denseGeometry[denseGeometry.length - 1])
    expect(candidate!.providerMatchingPoints).toBeUndefined()
    expect(Buffer.byteLength(JSON.stringify(candidate), 'utf8')).toBeLessThan(250_000)
    expect(() => signRouteOptionEnvelope({
      origin: ORIGIN,
      destination: DESTINATION,
      route: candidate!,
    })).not.toThrow()
  })

  it('reuses a completed candidate for the same graph and exact endpoints', async () => {
    process.env.TESKEID_ROUTE_CANDIDATE_ENABLED = 'true'
    const graph = { graph: true }
    mockGetIcelandRoadGraph.mockResolvedValue(graph)
    mockFindRoute.mockReturnValue({
      status: 'ok',
      originSnapDistanceM: 50,
      destinationSnapDistanceM: 80,
      route: {
        geometry: [ORIGIN, DESTINATION],
        distanceM: 390_000,
        durationS: 16_500,
        surface: { pavedM: 390_000, gravelM: 0, mixedM: 0, unknownM: 0 },
      },
    })

    const first = await getTeskeidRouteCandidatesOutcome(ORIGIN, DESTINATION)
    const second = await getTeskeidRouteCandidatesOutcome(ORIGIN, DESTINATION)

    expect(first).toBe(second)
    expect(mockFindRoute).toHaveBeenCalledOnce()
  })

  it('single-flights concurrent requests for the same graph and endpoints', async () => {
    process.env.TESKEID_ROUTE_CANDIDATE_ENABLED = 'true'
    const graph = { graph: true }
    mockGetIcelandRoadGraph.mockResolvedValue(graph)
    mockFindRoute.mockReturnValue({ status: 'no_route' })

    const [first, second] = await Promise.all([
      getTeskeidRouteCandidatesOutcome(ORIGIN, DESTINATION),
      getTeskeidRouteCandidatesOutcome(ORIGIN, DESTINATION),
    ])

    expect(first).toEqual({ status: 'no_route', routes: [] })
    expect(second).toBe(first)
    expect(mockFindRoute).toHaveBeenCalledOnce()
  })

  it('does not reuse candidates across graph versions or endpoint pairs', async () => {
    process.env.TESKEID_ROUTE_CANDIDATE_ENABLED = 'true'
    const firstGraph = { graph: 'v1' }
    const secondGraph = { graph: 'v2' }
    mockGetIcelandRoadGraph
      .mockResolvedValueOnce(firstGraph)
      .mockResolvedValueOnce(firstGraph)
      .mockResolvedValueOnce(secondGraph)
    mockFindRoute.mockReturnValue({ status: 'no_route' })

    await getTeskeidRouteCandidatesOutcome(ORIGIN, DESTINATION)
    await getTeskeidRouteCandidatesOutcome(ORIGIN, { ...DESTINATION, lon: DESTINATION.lon + 0.01 })
    await getTeskeidRouteCandidatesOutcome(ORIGIN, DESTINATION)

    expect(mockFindRoute).toHaveBeenCalledTimes(3)
  })

  it('fails closed when graph construction rejects', async () => {
    process.env.TESKEID_ROUTE_CANDIDATE_ENABLED = 'true'
    mockGetIcelandRoadGraph.mockRejectedValue(new Error('source unavailable'))

    await expect(getTeskeidRouteCandidate(ORIGIN, DESTINATION)).resolves.toBeNull()
  })

  it('returns a non-terminal pending state when graph construction exceeds its time budget', async () => {
    vi.useFakeTimers()
    try {
      process.env.TESKEID_ROUTE_CANDIDATE_ENABLED = 'true'
      mockGetIcelandRoadGraph.mockReturnValue(new Promise(() => {}))

      const outcomePromise = getTeskeidRouteCandidatesOutcome(ORIGIN, DESTINATION)
      await vi.advanceTimersByTimeAsync(30_000)

      await expect(outcomePromise).resolves.toEqual({ status: 'pending', routes: [] })
      expect(mockFindRoute).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps quick and extended budgets on the same fail-closed snapshot reader', async () => {
    vi.useFakeTimers()
    vi.stubEnv('NODE_ENV', 'production')
    try {
      process.env.TESKEID_ROUTE_CANDIDATE_ENABLED = 'true'
      mockGetIcelandRoadGraph.mockReturnValue(new Promise(() => {}))

      const quickOutcome = getTeskeidRouteCandidatesOutcome(
        ORIGIN,
        DESTINATION,
        false,
        'quick',
      )
      await vi.advanceTimersByTimeAsync(8_000)
      await expect(quickOutcome).resolves.toEqual({ status: 'pending', routes: [] })

      const extendedOutcome = getTeskeidRouteCandidatesOutcome(
        ORIGIN,
        DESTINATION,
        false,
        'extended',
      )
      await vi.advanceTimersByTimeAsync(20_000)
      await expect(extendedOutcome).resolves.toEqual({ status: 'pending', routes: [] })

      expect(mockGetIcelandRoadGraph.mock.calls).toEqual([
        [],
        [],
      ])
    } finally {
      vi.unstubAllEnvs()
      vi.useRealTimers()
    }
  })
})
