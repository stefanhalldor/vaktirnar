import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser, mockAfter } = vi.hoisted(() => ({ mockGetUser: vi.fn(), mockAfter: vi.fn() }))
const { mockCheckFeatureAccess } = vi.hoisted(() => ({ mockCheckFeatureAccess: vi.fn() }))
const { mockGetCandidates } = vi.hoisted(() => ({ mockGetCandidates: vi.fn() }))
const { mockGuestRateLimit } = vi.hoisted(() => ({ mockGuestRateLimit: vi.fn() }))
const { mockGetRoadGraph, mockGetGraphCacheStatus } = vi.hoisted(() => ({
  mockGetRoadGraph: vi.fn(),
  mockGetGraphCacheStatus: vi.fn(),
}))

vi.mock('next/server', async importOriginal => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: mockAfter }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/loans/guard', () => ({
  checkFeatureAccess: mockCheckFeatureAccess,
}))

vi.mock('@/lib/weather/ip-rate-limit.server', () => ({
  checkWeatherGuestRateLimit: mockGuestRateLimit,
}))

vi.mock('@/lib/iceland-routes/roadGraphCandidate.server', () => ({
  isTeskeidRouteCandidateEnabled: vi.fn(() => (
    process.env.TESKEID_ROUTE_CANDIDATE_ENABLED === 'true'
  )),
  getTeskeidRouteCandidatesOutcome: mockGetCandidates,
}))

vi.mock('@/lib/iceland-routes/roadGraphRuntime.server', () => ({
  getIcelandRoadGraph: mockGetRoadGraph,
  getIcelandRoadGraphCacheStatus: mockGetGraphCacheStatus,
}))

import { POST } from '@/app/api/teskeid/weather/travel/route-candidate/route'

const ORIGIN = { lat: 64.1466, lon: -21.9426 }
const DESTINATION = { lat: 66.0748, lon: -23.134 }

function makeCandidate() {
  return {
    id: 'teskeid-road-graph-v1',
    routeIndex: -1,
    provider: 'teskeid' as const,
    labels: ['TESKEID_EXPERIMENTAL'],
    isDefault: false,
    points: [ORIGIN, DESTINATION],
    providerMatchingPoints: [ORIGIN, DESTINATION],
    distanceM: 460_000,
    durationS: 18_000,
    experimental: {
      derivedDuration: true as const,
      surface: { pavedM: 450_000, gravelM: 10_000, mixedM: 0, unknownM: 0 },
    },
  }
}

function request(body: unknown = { origin: ORIGIN, destination: DESTINATION }) {
  return new Request('http://localhost/api/teskeid/weather/travel/route-candidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
  process.env.WEATHER_ENABLED = 'Authenticated'
  process.env.TESKEID_ROUTE_CANDIDATE_ENABLED = 'true'
  process.env.AUTH_CODE_SECRET = 'test-route-envelope-secret-at-least-32-bytes-long'
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'u1', email: 'user@example.com' } },
  })
  mockCheckFeatureAccess.mockImplementation(async (_uid: string, _email: string, key: string) => (
    key === 'vedrid' || key === 'teskeid-routing-v1'
  ))
  mockGetCandidates.mockResolvedValue({ status: 'ready', routes: [{ id: 'teskeid-road-graph-v1' }] })
  mockGuestRateLimit.mockResolvedValue(true)
  mockAfter.mockImplementation((callback: () => unknown) => callback())
  mockGetRoadGraph.mockResolvedValue({ graph: true })
  mockGetGraphCacheStatus.mockReturnValue('warm')
})

describe('POST /api/teskeid/weather/travel/route-candidate — strict per-user gate', () => {
  it('returns the candidate for an explicitly allowed user', async () => {
    const res = await POST(request())
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      status: 'ready',
      route: { id: 'teskeid-road-graph-v1' },
    })
    expect(mockGetCandidates).toHaveBeenCalledOnce()
    expect(res.headers.get('X-Teskeid-Graph-Cache')).toBe('warm')
    expect(res.headers.get('Server-Timing')).toContain('teskeid-candidate;dur=')
  })

  it('warms the graph without requiring route coordinates or starting candidate work', async () => {
    mockGetGraphCacheStatus.mockReturnValueOnce('cold').mockReturnValue('warm')

    const res = await POST(request({ warmOnly: true }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ status: 'ready', graphCache: 'warm' })
    expect(mockGetRoadGraph).toHaveBeenCalledOnce()
    expect(mockGetCandidates).not.toHaveBeenCalled()
    expect(res.headers.get('X-Teskeid-Graph-Cache')).toBe('cold')
  })

  it('returns a signed envelope for each ready candidate when requested', async () => {
    const candidate = makeCandidate()
    mockGetCandidates.mockResolvedValue({ status: 'ready', routes: [candidate] })

    const res = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      includeRouteEnvelopes: true,
      compactRouteEnvelopes: true,
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.routes).toBeUndefined()
    expect(body.route).toBeUndefined()
    expect(body.routeEnvelopes).toHaveLength(1)
    expect(body.routeEnvelopes[0]).toMatchObject({
      origin: ORIGIN,
      destination: DESTINATION,
      route: { id: candidate.id, provider: 'teskeid' },
    })
    expect(body.routeEnvelopes[0].signature).toMatch(/^[a-f0-9]{64}$/)
  })

  it('normalizes full client place objects before signing the envelope', async () => {
    const candidate = makeCandidate()
    mockGetCandidates.mockResolvedValue({ status: 'ready', routes: [candidate] })
    const clientOrigin = {
      ...ORIGIN,
      name: 'Reykjavík',
      placeId: 'google-64.1466,-21.9426',
      formattedAddress: 'Reykjavík, Ísland',
    }
    const clientDestination = {
      ...DESTINATION,
      name: 'Ísafjörður',
      placeId: 'google-66.0748,-23.134',
      formattedAddress: 'Ísafjörður, Ísland',
    }

    const res = await POST(request({
      origin: clientOrigin,
      destination: clientDestination,
      includeRouteEnvelopes: true,
      compactRouteEnvelopes: true,
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.routeEnvelopes).toHaveLength(1)
    expect(body.routeEnvelopes[0]).toMatchObject({
      origin: ORIGIN,
      destination: DESTINATION,
      route: { id: candidate.id },
    })
    expect(Object.keys(body.routeEnvelopes[0].origin).sort()).toEqual(['lat', 'lon'])
    expect(Object.keys(body.routeEnvelopes[0].destination).sort()).toEqual(['lat', 'lon'])
    expect(mockGetCandidates).toHaveBeenCalledWith(ORIGIN, DESTINATION, false)
  })

  it('fails closed instead of exposing an unsigned ready candidate', async () => {
    delete process.env.AUTH_CODE_SECRET
    mockGetCandidates.mockResolvedValue({ status: 'ready', routes: [makeCandidate()] })

    const res = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      includeRouteEnvelopes: true,
      compactRouteEnvelopes: true,
    }))

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({
      status: 'unavailable',
      routes: [],
      route: null,
    })
  })

  it('returns disabled and skips graph work when the user lacks routing access', async () => {
    mockCheckFeatureAccess.mockImplementation(async (_uid: string, _email: string, key: string) => (
      key === 'vedrid'
    ))

    const res = await POST(request())
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ status: 'disabled', route: null })
    expect(mockGetCandidates).not.toHaveBeenCalled()
  })

  it('does not expose candidates to signed-out public weather users', async () => {
    process.env.WEATHER_ENABLED = 'All'
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await POST(request())
    expect(res.status).toBe(404)
    expect(mockGetCandidates).not.toHaveBeenCalled()
    expect(mockGuestRateLimit).not.toHaveBeenCalled()
  })

  it('does not double-charge the guest IP bucket for an authenticated flagged public-tier user', async () => {
    process.env.WEATHER_ENABLED = 'All'
    mockCheckFeatureAccess.mockImplementation(async (_uid: string, _email: string, key: string) => (
      key === 'teskeid-routing-v1'
    ))

    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(mockGetCandidates).toHaveBeenCalledOnce()
    expect(mockGuestRateLimit).not.toHaveBeenCalled()
  })

  it('fails closed before auth work when the global switch is off', async () => {
    delete process.env.TESKEID_ROUTE_CANDIDATE_ENABLED

    const res = await POST(request())
    expect(res.status).toBe(404)
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(mockGetCandidates).not.toHaveBeenCalled()
  })

  it('returns pending and extends graph warm-up beyond the response', async () => {
    mockGetCandidates.mockResolvedValue({ status: 'pending', routes: [] })

    const res = await POST(request())

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ status: 'pending', route: null })
    expect(mockAfter).toHaveBeenCalledOnce()
    expect(mockGetRoadGraph).toHaveBeenCalledOnce()
  })

  it('never attaches an envelope to a pending result', async () => {
    mockGetCandidates.mockResolvedValue({ status: 'pending', routes: [] })

    const res = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      includeRouteEnvelopes: true,
      compactRouteEnvelopes: true,
    }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      status: 'pending',
      routeEnvelopes: [],
    })
  })
})
