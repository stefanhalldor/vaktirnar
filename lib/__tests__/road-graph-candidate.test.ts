import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetIcelandRoadGraph, mockFindRoute } = vi.hoisted(() => ({
  mockGetIcelandRoadGraph: vi.fn(),
  mockFindRoute: vi.fn(),
}))

vi.mock('@/lib/iceland-routes/roadGraphRuntime.server', () => ({
  getIcelandRoadGraph: mockGetIcelandRoadGraph,
}))

vi.mock('@/lib/iceland-routes/roadGraph', () => ({
  ICELAND_ROUTING_PROFILES: { fastestCar: { id: 'fastest-car' } },
  findIcelandRoadGraphRoute: mockFindRoute,
}))

import {
  getTeskeidRouteCandidate,
  isTeskeidRouteCandidateEnabled,
  TESKEID_ROUTE_CANDIDATE_ID,
} from '@/lib/iceland-routes/roadGraphCandidate.server'

const ORIGIN = { lat: 64.14, lon: -21.9 }
const DESTINATION = { lat: 65.68, lon: -18.1 }

beforeEach(() => {
  vi.clearAllMocks()
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

  it('fails closed when graph construction rejects', async () => {
    process.env.TESKEID_ROUTE_CANDIDATE_ENABLED = 'true'
    mockGetIcelandRoadGraph.mockRejectedValue(new Error('source unavailable'))

    await expect(getTeskeidRouteCandidate(ORIGIN, DESTINATION)).resolves.toBeNull()
  })

  it('fails closed when graph construction exceeds its time budget', async () => {
    vi.useFakeTimers()
    try {
      process.env.TESKEID_ROUTE_CANDIDATE_ENABLED = 'true'
      mockGetIcelandRoadGraph.mockReturnValue(new Promise(() => {}))

      const candidatePromise = getTeskeidRouteCandidate(ORIGIN, DESTINATION)
      await vi.advanceTimersByTimeAsync(30_000)

      await expect(candidatePromise).resolves.toBeNull()
      expect(mockFindRoute).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
