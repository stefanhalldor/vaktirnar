import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser, mockAfter } = vi.hoisted(() => ({ mockGetUser: vi.fn(), mockAfter: vi.fn() }))
const { mockCheckFeatureAccess } = vi.hoisted(() => ({ mockCheckFeatureAccess: vi.fn() }))
const { mockGetCandidates, mockGetAssessmentCandidates } = vi.hoisted(() => ({
  mockGetCandidates: vi.fn(),
  mockGetAssessmentCandidates: vi.fn(),
}))
const { mockGuestRateLimit } = vi.hoisted(() => ({ mockGuestRateLimit: vi.fn() }))
const { mockGetRoadGraph, mockGetGraphCacheStatus } = vi.hoisted(() => ({
  mockGetRoadGraph: vi.fn(),
  mockGetGraphCacheStatus: vi.fn(),
}))
const { mockResolveAssessmentScope } = vi.hoisted(() => ({
  mockResolveAssessmentScope: vi.fn(),
}))
const { mockCreateRouteEvidenceClaim } = vi.hoisted(() => ({
  mockCreateRouteEvidenceClaim: vi.fn(),
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
  getTeskeidAssessmentRouteCandidatesOutcome: mockGetAssessmentCandidates,
  getTeskeidRouteCandidatesOutcome: mockGetCandidates,
}))

vi.mock('@/lib/iceland-routes/roadGraphRuntime.server', () => ({
  getIcelandRoadGraph: mockGetRoadGraph,
  getIcelandRoadGraphCacheStatus: mockGetGraphCacheStatus,
}))

vi.mock('@/lib/iceland-routes/routeAssessmentScope.server', () => ({
  resolveRouteAssessmentScope: mockResolveAssessmentScope,
}))

vi.mock('@/lib/iceland-routes/routeOptionEvidence.server', () => ({
  createRouteOptionEvidenceClaim: mockCreateRouteEvidenceClaim,
}))

import { POST } from '@/app/api/teskeid/weather/travel/route-candidate/route'
import { signRouteOptionEnvelope } from '@/lib/iceland-routes/routeOptionEnvelope.server'

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

function makeEvidence(route = makeCandidate()) {
  return {
    route,
    connectedRoadEdges: [],
    routeProvenanceFingerprint: 'b'.repeat(43),
    originAnchorKind: 'projected_road' as const,
    destinationAnchorKind: 'projected_road' as const,
  }
}

function makePublicAccessEnvelope(assessmentScopeId?: string) {
  return signRouteOptionEnvelope({
    origin: ORIGIN,
    destination: DESTINATION,
    route: {
      id: 'google-public-access',
      routeIndex: 0,
      provider: 'google',
      labels: ['DEFAULT_ROUTE'],
      isDefault: true,
      points: [ORIGIN, DESTINATION],
      providerMatchingPoints: [ORIGIN, DESTINATION],
      distanceM: 460_000,
      durationS: 18_000,
    },
    ...(assessmentScopeId ? { assessmentScopeId } : {}),
  })
}

function request(body: unknown = { origin: ORIGIN, destination: DESTINATION }) {
  return new Request('http://localhost/api/teskeid/weather/travel/route-candidate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '203.0.113.41',
    },
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
  const assessmentCandidate = makeCandidate()
  mockGetAssessmentCandidates.mockResolvedValue({
    status: 'ready',
    routes: [assessmentCandidate],
    evidence: [makeEvidence(assessmentCandidate)],
  })
  mockCreateRouteEvidenceClaim.mockReturnValue({
    graphBuildPolicyFingerprint: 'test-graph-policy',
    routeProvenanceFingerprint: 'b'.repeat(43),
    originAnchorKind: 'projected_road',
    destinationAnchorKind: 'projected_road',
    edgeIds: ['edge-1'],
    nodeIds: ['node-1', 'node-2'],
  })
  mockGuestRateLimit.mockResolvedValue(true)
  mockAfter.mockImplementation((callback: () => unknown) => callback())
  mockGetRoadGraph.mockResolvedValue({ graph: true })
  mockGetGraphCacheStatus.mockReturnValue('warm')
  mockResolveAssessmentScope.mockResolvedValue({
    status: 'ready',
    scopeId: `assessment:v3:${'a'.repeat(43)}`,
    origin: {
      ...ORIGIN,
      name: 'Reykjavík',
      formattedAddress: 'Reykjavík',
      source: 'official',
      sourceId: 'settlement:reykjavik',
      identityKind: 'urban_settlement',
      placeType: 'settlement',
    },
    destination: {
      ...DESTINATION,
      name: 'Ísafjörður',
      formattedAddress: 'Ísafjörður',
      source: 'official',
      sourceId: 'settlement:isafjordur',
      identityKind: 'urban_settlement',
      placeType: 'settlement',
    },
  })
})

describe('POST /api/teskeid/weather/travel/route-candidate — Weather rollout', () => {
  it('returns the candidate for an eligible authenticated weather user', async () => {
    const res = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      accessRouteEnvelope: makePublicAccessEnvelope(),
    }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      status: 'ready',
      route: { id: 'teskeid-road-graph-v1' },
    })
    expect(mockGetCandidates).toHaveBeenCalledOnce()
    expect(mockGuestRateLimit).not.toHaveBeenCalled()
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

  it('requires a matching scoped Google grant for authenticated assessment candidate work', async () => {
    const assessmentScopeId = `assessment:v3:${'a'.repeat(43)}`
    const withoutGrant = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      assessmentScopeId,
    }))
    expect(withoutGrant.status).toBe(403)
    expect(mockGetCandidates).not.toHaveBeenCalled()
    expect(mockGetAssessmentCandidates).not.toHaveBeenCalled()

    const withUnscopedGrant = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      assessmentScopeId,
      accessRouteEnvelope: makePublicAccessEnvelope(),
    }))
    expect(withUnscopedGrant.status).toBe(403)
    expect(mockGetCandidates).not.toHaveBeenCalled()
    expect(mockGetAssessmentCandidates).not.toHaveBeenCalled()

    const withStaleScopedGrant = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      assessmentScopeId,
      accessRouteEnvelope: makePublicAccessEnvelope(`assessment:v3:${'b'.repeat(43)}`),
    }))
    expect(withStaleScopedGrant.status).toBe(403)
    expect(mockGetCandidates).not.toHaveBeenCalled()
    expect(mockGetAssessmentCandidates).not.toHaveBeenCalled()
  })

  it('does not downgrade a scoped grant to the authenticated legacy candidate path', async () => {
    const res = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      accessRouteEnvelope: makePublicAccessEnvelope(`assessment:v3:${'a'.repeat(43)}`),
    }))

    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toMatchObject({
      status: 'unavailable',
      routes: [],
      route: null,
    })
    expect(mockGetCandidates).not.toHaveBeenCalled()
    expect(mockGetAssessmentCandidates).not.toHaveBeenCalled()
  })

  it('propagates the verified assessment claim into candidate envelopes', async () => {
    const assessmentScopeId = `assessment:v3:${'a'.repeat(43)}`
    const alternative = {
      ...makeCandidate(),
      id: `teskeid-road-graph-v1-alt-1-${'c'.repeat(43)}`,
      routeIndex: -2,
      labels: ['TESKEID_EXPERIMENTAL', 'TESKEID_ALTERNATIVE'],
      points: [ORIGIN, { lat: 65, lon: -22.4 }, DESTINATION],
    }
    mockGetAssessmentCandidates.mockResolvedValue({
      status: 'ready',
      routes: [makeCandidate(), alternative],
      evidence: [makeEvidence(makeCandidate()), makeEvidence(alternative)],
    })

    const res = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      assessmentScopeId,
      accessRouteEnvelope: makePublicAccessEnvelope(assessmentScopeId),
      alternatives: true,
      includeRouteEnvelopes: true,
      compactRouteEnvelopes: true,
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.routeEnvelopes).toHaveLength(2)
    for (const envelope of body.routeEnvelopes) {
      expect(envelope).toMatchObject({
        assessmentScopeId,
        origin: ORIGIN,
        destination: DESTINATION,
        route: { provider: 'teskeid' },
        routeEvidence: {
          graphBuildPolicyFingerprint: 'test-graph-policy',
          edgeIds: ['edge-1'],
          nodeIds: ['node-1', 'node-2'],
        },
      })
    }
    expect(body.routeEnvelopes[1].route.id).toBe(alternative.id)
    expect(mockGetAssessmentCandidates).toHaveBeenCalledWith(
      ORIGIN,
      DESTINATION,
      assessmentScopeId,
      true,
    )
    expect(mockGetCandidates).not.toHaveBeenCalled()
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
      error: 'route_envelope_unavailable',
      routes: [],
      route: null,
    })
  })

  it('does not require the legacy per-user routing row for an authenticated Weather user', async () => {
    mockCheckFeatureAccess.mockResolvedValue(false)

    const res = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      accessRouteEnvelope: makePublicAccessEnvelope(),
    }))
    expect(res.status).toBe(200)
    expect(mockGetCandidates).toHaveBeenCalledOnce()
  })

  it('exposes candidates to signed-out public Weather users in a separate guest bucket', async () => {
    process.env.WEATHER_ENABLED = 'All'
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      accessRouteEnvelope: makePublicAccessEnvelope(),
    }))
    expect(res.status).toBe(200)
    expect(mockGetCandidates).toHaveBeenCalledOnce()
    expect(mockGuestRateLimit).toHaveBeenCalledWith('203.0.113.41', 'teskeid-candidate')
  })

  it('does not launder a scoped public grant into legacy candidate mode when scope is omitted', async () => {
    process.env.WEATHER_ENABLED = 'All'
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      accessRouteEnvelope: makePublicAccessEnvelope('assessment:v3:server-attested'),
    }))

    expect(res.status).toBe(403)
    expect(mockGetCandidates).not.toHaveBeenCalled()
    expect(mockGuestRateLimit).not.toHaveBeenCalled()
  })

  it('treats an email-less Supabase identity as anonymous public traffic', async () => {
    process.env.WEATHER_ENABLED = 'All'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'anonymous-id', email: null } } })

    const res = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      accessRouteEnvelope: makePublicAccessEnvelope(),
    }))

    expect(res.status).toBe(200)
    expect(mockGuestRateLimit).toHaveBeenCalledWith('203.0.113.41', 'teskeid-candidate')
    expect(mockGetCandidates).toHaveBeenCalledOnce()
  })

  it('returns 429 before graph work when the anonymous candidate bucket is exhausted', async () => {
    process.env.WEATHER_ENABLED = 'All'
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGuestRateLimit.mockResolvedValue(false)

    const res = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      accessRouteEnvelope: makePublicAccessEnvelope(),
    }))

    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toEqual({
      status: 'rate_limited',
      routes: [],
      route: null,
    })
    expect(mockGetCandidates).not.toHaveBeenCalled()
  })

  it('uses the bounded extended assessment search only when explicitly requested', async () => {
    const assessmentScopeId = `assessment:v3:${'a'.repeat(43)}`
    const res = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      assessmentScopeId,
      accessRouteEnvelope: makePublicAccessEnvelope(assessmentScopeId),
      searchMode: 'extended',
    }))

    expect(res.status).toBe(200)
    expect(mockGetAssessmentCandidates).toHaveBeenCalledWith(
      ORIGIN,
      DESTINATION,
      assessmentScopeId,
      false,
      'extended',
    )
  })

  it('derives a provider-neutral assessment scope without waiting for a Google grant', async () => {
    const assessmentScopeId = `assessment:v3:${'a'.repeat(43)}`
    const candidate = makeCandidate()
    mockGetAssessmentCandidates.mockResolvedValue({
      status: 'ready',
      routes: [candidate],
      evidence: [makeEvidence(candidate)],
    })
    const res = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      resolveAssessmentScope: true,
      includeRouteEnvelopes: true,
      compactRouteEnvelopes: true,
    }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      status: 'ready',
      assessmentScope: { status: 'ready', scopeId: assessmentScopeId },
      routeEnvelopes: expect.any(Array),
    })
    expect(mockResolveAssessmentScope).toHaveBeenCalledWith(ORIGIN, DESTINATION)
    expect(mockGetAssessmentCandidates).toHaveBeenCalledWith(
      ORIGIN,
      DESTINATION,
      assessmentScopeId,
      false,
    )
  })

  it('rejects anonymous candidate work without a signed Google route grant', async () => {
    process.env.WEATHER_ENABLED = 'All'
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await POST(request())

    expect(res.status).toBe(403)
    expect(mockGuestRateLimit).not.toHaveBeenCalled()
    expect(mockGetCandidates).not.toHaveBeenCalled()
  })

  it('rejects a tampered anonymous route grant before rate-limit and graph work', async () => {
    process.env.WEATHER_ENABLED = 'All'
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const accessRouteEnvelope = makePublicAccessEnvelope()

    const res = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      accessRouteEnvelope: {
        ...accessRouteEnvelope,
        signature: `${accessRouteEnvelope.signature[0] === '0' ? '1' : '0'}${accessRouteEnvelope.signature.slice(1)}`,
      },
    }))

    expect(res.status).toBe(403)
    expect(mockGuestRateLimit).not.toHaveBeenCalled()
    expect(mockGetCandidates).not.toHaveBeenCalled()
  })

  it('rejects a signed Teskeið envelope used as an anonymous access grant', async () => {
    process.env.WEATHER_ENABLED = 'All'
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const accessRouteEnvelope = signRouteOptionEnvelope({
      origin: ORIGIN,
      destination: DESTINATION,
      route: makeCandidate(),
    })

    const res = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      accessRouteEnvelope,
    }))

    expect(res.status).toBe(403)
    expect(mockGuestRateLimit).not.toHaveBeenCalled()
    expect(mockGetCandidates).not.toHaveBeenCalled()
  })

  it('rejects an expired anonymous Google route grant before rate-limit and graph work', async () => {
    process.env.WEATHER_ENABLED = 'All'
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const accessRouteEnvelope = signRouteOptionEnvelope({
      origin: ORIGIN,
      destination: DESTINATION,
      route: makePublicAccessEnvelope().route,
    }, {
      now: new Date(Date.now() - 20 * 60_000),
      ttlMs: 60_000,
    })

    const res = await POST(request({
      origin: ORIGIN,
      destination: DESTINATION,
      accessRouteEnvelope,
    }))

    expect(res.status).toBe(403)
    expect(mockGuestRateLimit).not.toHaveBeenCalled()
    expect(mockGetCandidates).not.toHaveBeenCalled()
  })

  it('rejects a route grant bound to a different endpoint pair', async () => {
    process.env.WEATHER_ENABLED = 'All'
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await POST(request({
      origin: { ...ORIGIN, lat: ORIGIN.lat + 0.01 },
      destination: DESTINATION,
      accessRouteEnvelope: makePublicAccessEnvelope(),
    }))

    expect(res.status).toBe(403)
    expect(mockGuestRateLimit).not.toHaveBeenCalled()
    expect(mockGetCandidates).not.toHaveBeenCalled()
  })

  it('does not expose the graph warm-only operation to anonymous page loads', async () => {
    process.env.WEATHER_ENABLED = 'All'
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await POST(request({ warmOnly: true }))

    expect(res.status).toBe(404)
    expect(mockGetRoadGraph).not.toHaveBeenCalled()
    expect(mockGuestRateLimit).not.toHaveBeenCalled()
  })

  it('does not expose warm-only to an email-less Supabase identity', async () => {
    process.env.WEATHER_ENABLED = 'All'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'anonymous-id', email: null } } })

    const res = await POST(request({ warmOnly: true }))

    expect(res.status).toBe(404)
    expect(mockGetRoadGraph).not.toHaveBeenCalled()
    expect(mockGuestRateLimit).not.toHaveBeenCalled()
  })

  it('does not double-charge the guest IP bucket for an authenticated public-tier user', async () => {
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
