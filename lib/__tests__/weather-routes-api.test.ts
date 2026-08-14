import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  after: vi.fn(),
  getWeatherEnabledMode: vi.fn(),
  resolveWeatherBaseAccess: vi.fn(),
  checkWeatherGuestRateLimit: vi.fn(),
  discoverTeskeidRoutes: vi.fn(),
  evidenceMatches: vi.fn(),
  createEvidenceClaim: vi.fn(),
  signEnvelope: vi.fn(),
  recordUsage: vi.fn(),
  routePairFingerprint: vi.fn(),
  globalFetch: vi.fn(),
}))

vi.mock('next/server', async importOriginal => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: mocks.after }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))

vi.mock('@/lib/weather/weatherBaseAccess.server', () => ({
  getWeatherEnabledMode: mocks.getWeatherEnabledMode,
  resolveWeatherBaseAccess: mocks.resolveWeatherBaseAccess,
}))

vi.mock('@/lib/weather/ip-rate-limit.server', () => ({
  checkWeatherGuestRateLimit: mocks.checkWeatherGuestRateLimit,
}))

vi.mock('@/lib/road-intelligence/teskeidRouteDiscovery.server', () => ({
  discoverTeskeidRoutes: mocks.discoverTeskeidRoutes,
}))

vi.mock('@/lib/iceland-routes/routeAssessmentCandidateEvidence.server', () => ({
  teskeidAssessmentEvidenceMatchesSignedRoute: mocks.evidenceMatches,
}))

vi.mock('@/lib/iceland-routes/routeOptionEvidence.server', () => ({
  createRouteOptionEvidenceClaim: mocks.createEvidenceClaim,
}))

vi.mock('@/lib/iceland-routes/routeOptionEnvelope.server', () => ({
  signRouteOptionEnvelope: mocks.signEnvelope,
}))

vi.mock('@/lib/teskeid/usage.server', () => ({
  recordTeskeidUsageEvent: mocks.recordUsage,
  routePairFingerprint: mocks.routePairFingerprint,
}))

import { POST } from '@/app/api/teskeid/weather/travel/routes/route'

const ORIGIN = { name: 'Reykjavík', lat: 64.135, lon: -21.895 }
const DESTINATION = { name: 'Selfoss', lat: 63.933, lon: -21 }
const SCOPE = {
  status: 'ready' as const,
  scopeId: `assessment:v3:${'a'.repeat(43)}`,
  origin: { ...ORIGIN, source: 'official' as const },
  destination: { ...DESTINATION, source: 'official' as const },
}
const ROUTES = [
  {
    id: 'teskeid-primary',
    routeIndex: 0,
    provider: 'teskeid' as const,
    labels: ['TESKEID_PRIMARY'],
    isDefault: true,
    points: [ORIGIN, DESTINATION],
    distanceM: 57_000,
    durationS: 3_600,
  },
  {
    id: 'teskeid-curated',
    routeIndex: 1,
    provider: 'teskeid' as const,
    labels: ['TESKEID_ALTERNATIVE', 'CURATED_VIA_TEST'],
    isDefault: false,
    points: [ORIGIN, { lat: 64, lon: -21.4 }, DESTINATION],
    distanceM: 61_000,
    durationS: 3_900,
  },
]
const EVIDENCE = ROUTES.map((route, index) => ({ route, edgeIds: [`edge-${index}`] }))

function request(body: unknown, headers?: HeadersInit) {
  return new Request('http://localhost/api/teskeid/weather/travel/routes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.globalFetch.mockRejectedValue(new Error('unexpected_network_fetch'))
  vi.stubGlobal('fetch', mocks.globalFetch)
  process.env.AUTH_MVP_ENABLED = 'true'
  mocks.getWeatherEnabledMode.mockReturnValue('all')
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'u@example.com' } } })
  mocks.resolveWeatherBaseAccess.mockResolvedValue({
    mode: 'authenticated', actor: 'authenticated', userId: 'u1',
  })
  mocks.checkWeatherGuestRateLimit.mockResolvedValue(true)
  mocks.routePairFingerprint.mockReturnValue('pair-hash')
  mocks.discoverTeskeidRoutes.mockResolvedValue({
    status: 'ready',
    assessmentScope: SCOPE,
    routes: ROUTES,
    evidence: EVIDENCE,
    recommendedRouteId: ROUTES[0].id,
    cacheable: true,
  })
  mocks.evidenceMatches.mockReturnValue(true)
  mocks.createEvidenceClaim.mockImplementation(({ evidence }: { evidence: { edgeIds: string[] } }) => ({
    edgeIds: evidence.edgeIds,
  }))
  mocks.signEnvelope.mockImplementation(({ route, assessmentScopeId, routeEvidence }) => ({
    version: 1,
    issuedAt: '2026-08-13T12:00:00.000Z',
    expiresAt: '2026-08-13T12:15:00.000Z',
    assessmentScopeId,
    origin: { lat: SCOPE.origin.lat, lon: SCOPE.origin.lon },
    destination: { lat: SCOPE.destination.lat, lon: SCOPE.destination.lon },
    route,
    routeEvidence,
    signature: `signed-${route.id}`,
  }))
  mocks.after.mockImplementation((callback: () => unknown) => callback())
})

afterEach(() => {
  expect(mocks.globalFetch).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

describe('POST /api/teskeid/weather/travel/routes (v238)', () => {
  it('enforces product and base-weather access', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    expect((await POST(request({ origin: ORIGIN, destination: DESTINATION }))).status).toBe(404)

    process.env.AUTH_MVP_ENABLED = 'true'
    mocks.resolveWeatherBaseAccess.mockResolvedValueOnce({ mode: 'blocked' })
    expect((await POST(request({ origin: ORIGIN, destination: DESTINATION }))).status).toBe(401)
    expect(mocks.discoverTeskeidRoutes).not.toHaveBeenCalled()
  })

  it('rate-limits only a signed-out public discovery', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    mocks.resolveWeatherBaseAccess.mockResolvedValue({ mode: 'public', actor: 'public', userId: null })
    mocks.checkWeatherGuestRateLimit.mockResolvedValue(false)

    const response = await POST(request(
      { origin: ORIGIN, destination: DESTINATION },
      { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
    ))
    expect(response.status).toBe(429)
    expect(mocks.checkWeatherGuestRateLimit).toHaveBeenCalledWith('203.0.113.10', 'teskeid-candidate')
    expect(mocks.discoverTeskeidRoutes).not.toHaveBeenCalled()
  })

  it('serves an allowed public guest from the same Teskeið-only discovery path', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    mocks.resolveWeatherBaseAccess.mockResolvedValue({
      mode: 'public', actor: 'public', userId: null,
    })

    const response = await POST(request(
      { origin: ORIGIN, destination: DESTINATION },
      { 'x-forwarded-for': '203.0.113.11' },
    ))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.routes.every((route: { provider: string }) => route.provider === 'teskeid')).toBe(true)
    expect(mocks.checkWeatherGuestRateLimit).toHaveBeenCalledWith(
      '203.0.113.11',
      'teskeid-candidate',
    )
    expect(mocks.discoverTeskeidRoutes).toHaveBeenCalledOnce()
  })

  it('treats an email-less Supabase identity as anonymous candidate traffic', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'anonymous-id', email: null } } })
    mocks.resolveWeatherBaseAccess.mockResolvedValue({
      mode: 'public', actor: 'public', userId: null,
    })

    const response = await POST(request(
      { origin: ORIGIN, destination: DESTINATION },
      { 'x-real-ip': '203.0.113.12' },
    ))

    expect(response.status).toBe(200)
    expect(mocks.checkWeatherGuestRateLimit).toHaveBeenCalledWith(
      '203.0.113.12',
      'teskeid-candidate',
    )
  })

  it.each([
    [{ destination: DESTINATION }, 'invalid_origin'],
    [{ origin: ORIGIN, destination: { name: 'Oslo', lat: 59.9, lon: 10.7 } }, 'invalid_destination'],
  ])('rejects invalid endpoints before discovery', async (body, error) => {
    const response = await POST(request(body))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error })
    expect(mocks.discoverTeskeidRoutes).not.toHaveBeenCalled()
  })

  it('returns one atomic, ordered, signed Teskeið artifact', async () => {
    const response = await POST(request({ origin: ORIGIN, destination: DESTINATION }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe('ready')
    expect(body.assessmentScope).toEqual(SCOPE)
    expect(body.routes.map((route: { id: string }) => route.id)).toEqual([
      'teskeid-primary',
      'teskeid-curated',
    ])
    expect(body.routeEnvelopes.map((envelope: { route: { id: string } }) => envelope.route.id))
      .toEqual(body.routes.map((route: { id: string }) => route.id))
    expect(body.recommendedRouteId).toBe(body.routes[0].id)
    expect(mocks.discoverTeskeidRoutes).toHaveBeenCalledWith(ORIGIN, DESTINATION)
    expect(mocks.signEnvelope).toHaveBeenCalledTimes(2)
    expect(mocks.signEnvelope).toHaveBeenNthCalledWith(1, expect.objectContaining({
      assessmentScopeId: SCOPE.scopeId,
      route: ROUTES[0],
      routeEvidence: { edgeIds: ['edge-0'] },
    }))
  })

  it('fails closed if any route/evidence pair cannot be signed', async () => {
    mocks.evidenceMatches.mockImplementation((_evidence, route) => route.id !== 'teskeid-curated')
    const response = await POST(request({ origin: ORIGIN, destination: DESTINATION }))

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'route_envelope_unavailable' })
  })

  it.each([
    ['pending', 202],
    ['no_route', 422],
    ['unavailable', 422],
    ['disabled', 422],
  ] as const)('returns truthful %s without unsigned route choices', async (status, httpStatus) => {
    mocks.discoverTeskeidRoutes.mockResolvedValue({
      status,
      assessmentScope: status === 'pending' ? SCOPE : null,
      routes: [],
      evidence: [],
      recommendedRouteId: null,
      cacheable: false,
    })
    const response = await POST(request({ origin: ORIGIN, destination: DESTINATION }))
    const body = await response.json()

    expect(response.status).toBe(httpStatus)
    expect(body).toMatchObject({ status, routes: [], routeEnvelopes: [], recommendedRouteId: null })
    expect(mocks.signEnvelope).not.toHaveBeenCalled()
  })

  it('keeps analytics deferred and privacy-safe', async () => {
    const response = await POST(request({ origin: ORIGIN, destination: DESTINATION }))
    expect(response.status).toBe(200)
    expect(mocks.after).toHaveBeenCalledOnce()
    expect(mocks.recordUsage).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'weather_route_options_calculated',
      metadata: expect.objectContaining({
        actor: 'authenticated',
        provider: 'teskeid',
        routeCount: 2,
        routePairHash: 'pair-hash',
        curatedRouteLabels: ['CURATED_VIA_TEST'],
      }),
    }))
    const metadata = mocks.recordUsage.mock.calls[0]?.[0]?.metadata
    expect(JSON.stringify(metadata)).not.toMatch(/Reykjavík|Selfoss|64\.135|-21\.895/)
  })

  it('has no Google, weather-provider, station or route-memory dependency', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/api/teskeid/weather/travel/routes/route.ts'),
      'utf8',
    )
    expect(source).not.toContain('getWeatherMapProvider')
    expect(source).not.toContain('getRouteOptions')
    expect(source).not.toContain('getRouteGeometry')
    expect(source).not.toContain('routeMemory')
    expect(source).not.toContain('provider-stations')
    expect(source).not.toContain('metno')
    expect(source).not.toContain('vegagerdinCurrent')
  })
})
