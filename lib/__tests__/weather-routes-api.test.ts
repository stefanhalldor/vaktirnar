/**
 * Tests for POST /api/teskeid/weather/travel/routes
 *
 * Verifies auth enforcement, validation, provider errors, and
 * that results are sorted by durationS ascending.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser, mockAfter } = vi.hoisted(() => ({ mockGetUser: vi.fn(), mockAfter: vi.fn() }))
const { mockCheckFeatureAccess } = vi.hoisted(() => ({ mockCheckFeatureAccess: vi.fn() }))
const { mockGetRouteOptions, mockGetWeatherMapProvider } = vi.hoisted(() => ({
  mockGetRouteOptions: vi.fn(),
  mockGetWeatherMapProvider: vi.fn(),
}))
const { mockRecordTeskeidUsageEvent, mockRoutePairFingerprint } = vi.hoisted(() => ({
  mockRecordTeskeidUsageEvent: vi.fn(),
  mockRoutePairFingerprint: vi.fn(),
}))
const { mockCheckWeatherGuestRateLimit } = vi.hoisted(() => ({ mockCheckWeatherGuestRateLimit: vi.fn() }))
const { mockGetTeskeidRouteCandidate } = vi.hoisted(() => ({ mockGetTeskeidRouteCandidate: vi.fn() }))
const { mockIsTeskeidRouteCandidateEnabled } = vi.hoisted(() => ({
  mockIsTeskeidRouteCandidateEnabled: vi.fn(),
}))
const { mockResolveRouteAssessmentScope } = vi.hoisted(() => ({
  mockResolveRouteAssessmentScope: vi.fn(),
}))
const {
  mockNormalizePlaceForMemory,
  mockBuildRouteMemoryKey,
  mockRecordRouteMemory,
  mockReadVegagerdinCurrentWithHistoryFallback,
} = vi.hoisted(() => ({
  mockNormalizePlaceForMemory: vi.fn(),
  mockBuildRouteMemoryKey: vi.fn(),
  mockRecordRouteMemory: vi.fn(),
  mockReadVegagerdinCurrentWithHistoryFallback: vi.fn(),
}))

vi.mock('next/server', async importOriginal => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: mockAfter }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/loans/guard', () => ({
  checkFeatureAccess: mockCheckFeatureAccess,
}))

vi.mock('@/lib/weather/provider.server', () => ({
  getWeatherMapProvider: mockGetWeatherMapProvider,
}))

vi.mock('@/lib/teskeid/usage.server', () => ({
  recordTeskeidUsageEvent: mockRecordTeskeidUsageEvent,
  routePairFingerprint: mockRoutePairFingerprint,
}))

vi.mock('@/lib/weather/ip-rate-limit.server', () => ({
  checkWeatherGuestRateLimit: mockCheckWeatherGuestRateLimit,
}))

vi.mock('@/lib/iceland-routes/roadGraphCandidate.server', () => ({
  getTeskeidRouteCandidate: mockGetTeskeidRouteCandidate,
  isTeskeidRouteCandidateEnabled: mockIsTeskeidRouteCandidateEnabled,
}))

vi.mock('@/lib/iceland-routes/routeAssessmentScope.server', () => ({
  resolveRouteAssessmentScope: mockResolveRouteAssessmentScope,
}))

vi.mock('@/lib/iceland-routes/routePlaceNormalization', () => ({
  normalizePlaceForMemory: mockNormalizePlaceForMemory,
  buildRouteMemoryKey: mockBuildRouteMemoryKey,
}))

vi.mock('@/lib/iceland-routes/routeMemory.server', () => ({
  recordRouteMemory: mockRecordRouteMemory,
}))

vi.mock('@/lib/weather/providers/vegagerdinCurrent.server', () => ({
  readVegagerdinCurrentWithHistoryFallback: mockReadVegagerdinCurrentWithHistoryFallback,
}))

import { POST } from '@/app/api/teskeid/weather/travel/routes/route'

// ── Helpers ────────────────────────────────────────────────────────────────────

const VALID_ORIGIN = { name: 'Reykjavík', lat: 64.135, lon: -21.895 }
const VALID_DEST   = { name: 'Selfoss',   lat: 63.933, lon: -21.0 }

const ASSESSMENT_ORIGIN = {
  name: 'Garðabær',
  formattedAddress: 'Garðabær',
  lat: 64.075,
  lon: -21.9,
  source: 'official' as const,
  sourceId: 'hagstofa:1300',
  placeType: 'settlement' as const,
  postalCode: '210',
  postalLocality: 'Garðabær',
}

const ASSESSMENT_DESTINATION = {
  name: 'Hella',
  formattedAddress: 'Hella',
  lat: 63.84,
  lon: -20.4,
  source: 'official' as const,
  sourceId: 'hagstofa:1120',
  placeType: 'settlement' as const,
  postalCode: '850',
  postalLocality: 'Hella',
}

const READY_ASSESSMENT_SCOPE = {
  status: 'ready' as const,
  scopeId: 'hagstofa:1300:gar-gateway:hagstofa:1120:hella-gateway',
  origin: ASSESSMENT_ORIGIN,
  destination: ASSESSMENT_DESTINATION,
}

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/teskeid/weather/travel/routes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function authedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'test@example.com' } } })
  mockCheckFeatureAccess.mockResolvedValue(true)
}

function makeRouteOption(id: string, routeIndex: number, durationS: number, distanceM: number, isDefault = false) {
  return {
    id,
    routeIndex,
    provider: 'google',
    labels: isDefault ? ['DEFAULT_ROUTE'] : ['DEFAULT_ROUTE_ALTERNATE'],
    isDefault,
    points: [{ lat: 64.135, lon: -21.895 }, { lat: 63.933, lon: -21.0 }],
    distanceM,
    durationS,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

function guestUser() {
  mockGetUser.mockResolvedValue({ data: { user: null } })
  mockCheckWeatherGuestRateLimit.mockResolvedValue(true)
  process.env.WEATHER_PUBLIC_ENABLED = 'true'
}

function publicAuthedUser() {
  // Signed-in user without vedrid — treated as public/base weather path
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u2', email: 'novedrid@example.com' } } })
  mockCheckFeatureAccess.mockResolvedValue(false)
  mockCheckWeatherGuestRateLimit.mockResolvedValue(true)
  process.env.WEATHER_PUBLIC_ENABLED = 'true'
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
  process.env.WEATHER_ENABLED = 'true'
  process.env.AUTH_CODE_SECRET = 'test-route-envelope-secret-at-least-32-bytes-long'
  delete process.env.WEATHER_PUBLIC_ENABLED
  mockGetTeskeidRouteCandidate.mockResolvedValue(null)
  mockIsTeskeidRouteCandidateEnabled.mockReturnValue(true)
  mockGetWeatherMapProvider.mockReturnValue({ getRouteOptions: mockGetRouteOptions })
  mockRoutePairFingerprint.mockReturnValue('testhash')
  mockResolveRouteAssessmentScope.mockResolvedValue(READY_ASSESSMENT_SCOPE)
  mockNormalizePlaceForMemory.mockImplementation((name: string) => ({
    key: name.toLocaleLowerCase('is').replace(/[^a-záðéíóúýþæö0-9]+/gi, ''),
    label: name,
  }))
  mockBuildRouteMemoryKey.mockImplementation((from: string, to: string, variant = 'default') => (
    `${from}--${to}--${variant}`
  ))
  mockRecordRouteMemory.mockResolvedValue(undefined)
  mockReadVegagerdinCurrentWithHistoryFallback.mockResolvedValue({
    status: 'unavailable',
    reason: 'test_unavailable',
  })
  mockAfter.mockImplementation((callback: () => unknown) => callback())
})

describe('POST /api/teskeid/weather/travel/routes', () => {
  it('returns 404 when AUTH_MVP_ENABLED is not true', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    const res = await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(res.status).toBe(404)
  })

  it('returns 401 when user is not authenticated and WEATHER_PUBLIC_ENABLED is off', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    // WEATHER_PUBLIC_ENABLED not set (deleted in beforeEach)
    const res = await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 404 when WEATHER_ENABLED is off (signed-in user without vedrid)', async () => {
    delete process.env.WEATHER_ENABLED
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'test@example.com' } } })
    mockCheckFeatureAccess.mockResolvedValue(false)
    const res = await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(res.status).toBe(404)
  })

  it('returns 400 when origin is missing', async () => {
    authedUser()
    const res = await POST(makeRequest({ destination: VALID_DEST }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_origin')
  })

  it('returns 400 when destination has out-of-Iceland coordinates', async () => {
    authedUser()
    const res = await POST(makeRequest({
      origin: VALID_ORIGIN,
      destination: { name: 'Oslo', lat: 59.9, lon: 10.7 },
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_destination')
  })

  it('keeps the legacy/default contract exact and never resolves assessment scope', async () => {
    authedUser()
    const exactOrigin = {
      ...VALID_ORIGIN,
      formattedAddress: 'Laugavegur 1, Reykjavík',
      source: 'google',
      placeId: 'google-origin',
    }
    const exactDestination = {
      ...VALID_DEST,
      formattedAddress: 'Austurvegur 2, Selfoss',
      source: 'google',
      placeId: 'google-destination',
    }
    mockGetRouteOptions.mockResolvedValue([
      makeRouteOption('google-0', 0, 3600, 80000, true),
    ])

    const res = await POST(makeRequest({
      origin: exactOrigin,
      destination: exactDestination,
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.assessmentScope).toBeUndefined()
    expect(mockResolveRouteAssessmentScope).not.toHaveBeenCalled()
    expect(mockGetRouteOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: exactOrigin.name,
        formattedAddress: exactOrigin.formattedAddress,
        lat: exactOrigin.lat,
        lon: exactOrigin.lon,
        placeId: 'google-origin',
      }),
      expect.objectContaining({
        displayName: exactDestination.name,
        formattedAddress: exactDestination.formattedAddress,
        lat: exactDestination.lat,
        lon: exactDestination.lon,
        placeId: 'google-destination',
      }),
    )
    expect(mockRoutePairFingerprint).toHaveBeenCalledWith(exactOrigin, exactDestination)
    expect(mockNormalizePlaceForMemory).toHaveBeenCalledWith(
      exactOrigin.name,
      exactOrigin.formattedAddress,
    )
    expect(mockNormalizePlaceForMemory).toHaveBeenCalledWith(
      exactDestination.name,
      exactDestination.formattedAddress,
    )
  })

  it('uses ready assessment endpoints for providers, envelopes, fingerprint and route memory', async () => {
    authedUser()
    mockAfter.mockImplementation(() => undefined)
    mockGetRouteOptions.mockResolvedValue([{
      ...makeRouteOption('google-assessment', 0, 3600, 80000, true),
      points: [
        { lat: ASSESSMENT_ORIGIN.lat, lon: ASSESSMENT_ORIGIN.lon },
        { lat: ASSESSMENT_DESTINATION.lat, lon: ASSESSMENT_DESTINATION.lon },
      ],
    }])

    const res = await POST(makeRequest({
      origin: VALID_ORIGIN,
      destination: VALID_DEST,
      resolveAssessmentScope: true,
      includeRouteEnvelopes: true,
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mockResolveRouteAssessmentScope).toHaveBeenCalledWith(VALID_ORIGIN, VALID_DEST)
    expect(body.assessmentScope).toEqual(READY_ASSESSMENT_SCOPE)
    expect(mockGetRouteOptions).toHaveBeenCalledWith(
      {
        placeId: 'confirmed',
        displayName: ASSESSMENT_ORIGIN.name,
        formattedAddress: ASSESSMENT_ORIGIN.formattedAddress,
        lat: ASSESSMENT_ORIGIN.lat,
        lon: ASSESSMENT_ORIGIN.lon,
      },
      {
        placeId: 'confirmed',
        displayName: ASSESSMENT_DESTINATION.name,
        formattedAddress: ASSESSMENT_DESTINATION.formattedAddress,
        lat: ASSESSMENT_DESTINATION.lat,
        lon: ASSESSMENT_DESTINATION.lon,
      },
    )
    expect(mockGetTeskeidRouteCandidate).toHaveBeenCalledWith(
      { lat: ASSESSMENT_ORIGIN.lat, lon: ASSESSMENT_ORIGIN.lon },
      { lat: ASSESSMENT_DESTINATION.lat, lon: ASSESSMENT_DESTINATION.lon },
    )
    expect(mockRoutePairFingerprint).toHaveBeenCalledWith(
      ASSESSMENT_ORIGIN,
      ASSESSMENT_DESTINATION,
    )
    expect(mockRoutePairFingerprint).not.toHaveBeenCalledWith(VALID_ORIGIN, VALID_DEST)
    expect(body.routeEnvelopes).toHaveLength(1)
    expect(body.routeEnvelopes[0]).toMatchObject({
      origin: { lat: ASSESSMENT_ORIGIN.lat, lon: ASSESSMENT_ORIGIN.lon },
      destination: {
        lat: ASSESSMENT_DESTINATION.lat,
        lon: ASSESSMENT_DESTINATION.lon,
      },
      route: { id: 'google-assessment' },
    })
    expect(mockNormalizePlaceForMemory).toHaveBeenNthCalledWith(
      1,
      ASSESSMENT_ORIGIN.name,
      ASSESSMENT_ORIGIN.formattedAddress,
    )
    expect(mockNormalizePlaceForMemory).toHaveBeenNthCalledWith(
      2,
      ASSESSMENT_DESTINATION.name,
      ASSESSMENT_DESTINATION.formattedAddress,
    )

    expect(mockAfter).toHaveBeenCalledOnce()
    const afterCallback = mockAfter.mock.calls[0]?.[0] as (() => Promise<void>) | undefined
    expect(afterCallback).toBeTypeOf('function')
    await afterCallback?.()

    expect(mockRecordRouteMemory).toHaveBeenCalledWith(expect.objectContaining({
      fromPlaceLabel: ASSESSMENT_ORIGIN.name,
      toPlaceLabel: ASSESSMENT_DESTINATION.name,
    }))
  })

  it.each([
    {
      status: 'same_area' as const,
      settlementId: 'hagstofa:1120',
      settlementName: 'Hella',
    },
    {
      status: 'unavailable' as const,
      reason: 'road_graph_unavailable' as const,
    },
  ])('returns a handoff-only $status scope without calling any route provider', async assessmentScope => {
    authedUser()
    mockResolveRouteAssessmentScope.mockResolvedValue(assessmentScope)

    const res = await POST(makeRequest({
      origin: VALID_ORIGIN,
      destination: VALID_DEST,
      resolveAssessmentScope: true,
      includeRouteEnvelopes: true,
    }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      assessmentScope,
      routes: [],
      routeEnvelopes: [],
    })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(mockGetWeatherMapProvider).not.toHaveBeenCalled()
    expect(mockGetRouteOptions).not.toHaveBeenCalled()
    expect(mockGetTeskeidRouteCandidate).not.toHaveBeenCalled()
    expect(mockRoutePairFingerprint).not.toHaveBeenCalled()
    expect(mockNormalizePlaceForMemory).not.toHaveBeenCalled()
    expect(mockAfter).not.toHaveBeenCalled()
  })

  it('returns 422 when provider returns no routes', async () => {
    authedUser()
    mockGetRouteOptions.mockResolvedValue([])
    const res = await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('route_unavailable')
  })

  it('returns 503 when provider throws', async () => {
    authedUser()
    mockGetRouteOptions.mockRejectedValue(new Error('network error'))
    const res = await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe('route_unavailable')
  })

  it('returns 200 with routes array', async () => {
    authedUser()
    mockGetRouteOptions.mockResolvedValue([
      makeRouteOption('google-0', 0, 3600, 80000, true),
    ])
    const res = await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.routes)).toBe(true)
    expect(body.routes).toHaveLength(1)
  })

  it('returns one signed envelope per Google route without starting Teskeið discovery', async () => {
    authedUser()
    mockGetRouteOptions.mockResolvedValue([
      makeRouteOption('google-0', 0, 3600, 80000, true),
      makeRouteOption('google-1', 1, 4200, 90000, false),
    ])

    const res = await POST(makeRequest({
      origin: VALID_ORIGIN,
      destination: VALID_DEST,
      includeTeskeidCandidate: false,
      includeRouteEnvelopes: true,
      compactRouteEnvelopes: true,
    }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.routes).toBeUndefined()
    expect(body.routeEnvelopes).toHaveLength(2)
    expect(body.routeEnvelopes.map((envelope: { route: { id: string } }) => envelope.route.id))
      .toEqual(['google-0', 'google-1'])
    expect(body.routeEnvelopes.every((envelope: { signature: string }) => envelope.signature.length === 64))
      .toBe(true)
    expect(mockGetTeskeidRouteCandidate).not.toHaveBeenCalled()
  })

  it('fails closed instead of returning unsigned selectable routes', async () => {
    authedUser()
    delete process.env.AUTH_CODE_SECRET
    mockGetRouteOptions.mockResolvedValue([
      makeRouteOption('google-0', 0, 3600, 80000, true),
    ])

    const res = await POST(makeRequest({
      origin: VALID_ORIGIN,
      destination: VALID_DEST,
      includeTeskeidCandidate: false,
      includeRouteEnvelopes: true,
    }))

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ error: 'route_envelope_unavailable' })
  })

  it('does not await analytics or route-memory work before returning route choices', async () => {
    authedUser()
    mockAfter.mockImplementation(() => undefined)
    mockGetRouteOptions.mockResolvedValue([
      makeRouteOption('google-0', 0, 3600, 80000, true),
    ])

    const res = await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))

    expect(res.status).toBe(200)
    expect(mockAfter).toHaveBeenCalledOnce()
    expect(mockRecordTeskeidUsageEvent).not.toHaveBeenCalled()
  })

  it('sorts routes by durationS ascending — shortest driving time first', async () => {
    authedUser()
    // Provider returns slower route first
    mockGetRouteOptions.mockResolvedValue([
      makeRouteOption('google-0', 0, 5400, 100000, true),  // 90 min, longer
      makeRouteOption('google-1', 1, 3600, 80000, false),  // 60 min, shorter
    ])
    const res = await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.routes[0].durationS).toBe(3600)
    expect(body.routes[1].durationS).toBe(5400)
  })

  it('three routes sorted by durationS ascending', async () => {
    authedUser()
    mockGetRouteOptions.mockResolvedValue([
      makeRouteOption('google-0', 0, 7200, 140000, true),
      makeRouteOption('google-1', 1, 5400, 100000, false),
      makeRouteOption('google-2', 2, 3600, 80000, false),
    ])
    const res = await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    const body = await res.json()
    expect(body.routes.map((r: { durationS: number }) => r.durationS)).toEqual([3600, 5400, 7200])
  })

  it('appends an experimental Teskeið candidate after sorted Google routes', async () => {
    authedUser()
    mockGetRouteOptions.mockResolvedValue([
      makeRouteOption('google-slow', 0, 5400, 100000, true),
      makeRouteOption('google-fast', 1, 3600, 80000, false),
    ])
    mockGetTeskeidRouteCandidate.mockResolvedValue({
      ...makeRouteOption('teskeid-road-graph-v1', -1, 3000, 75000),
      provider: 'teskeid',
      labels: ['TESKEID_EXPERIMENTAL'],
    })

    const res = await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    const body = await res.json()

    expect(body.routes.map((route: { id: string }) => route.id)).toEqual([
      'google-fast',
      'google-slow',
      'teskeid-road-graph-v1',
    ])
  })

  it('does not calculate or expose a Teskeið candidate when the global switch is off', async () => {
    authedUser()
    mockIsTeskeidRouteCandidateEnabled.mockReturnValue(false)
    mockGetRouteOptions.mockResolvedValue([
      makeRouteOption('google-0', 0, 3600, 80000, true),
    ])
    mockGetTeskeidRouteCandidate.mockResolvedValue({
      ...makeRouteOption('teskeid-road-graph-v1', -1, 3000, 75000),
      provider: 'teskeid',
      labels: ['TESKEID_EXPERIMENTAL'],
    })

    const res = await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.routes.map((route: { id: string }) => route.id)).toEqual(['google-0'])
    expect(mockGetTeskeidRouteCandidate).not.toHaveBeenCalled()
  })

  it('returns matching signed Google and Teskeið choices for a signed-out public Weather user', async () => {
    guestUser()
    mockGetRouteOptions.mockResolvedValue([
      makeRouteOption('google-0', 0, 3600, 80000, true),
    ])
    mockGetTeskeidRouteCandidate.mockResolvedValue({
      ...makeRouteOption('teskeid-road-graph-v1', -1, 3000, 75000),
      provider: 'teskeid',
      labels: ['TESKEID_EXPERIMENTAL'],
    })

    const res = await POST(makeRequest({
      origin: VALID_ORIGIN,
      destination: VALID_DEST,
      includeRouteEnvelopes: true,
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.routes.map((route: { id: string }) => route.id)).toEqual([
      'google-0',
      'teskeid-road-graph-v1',
    ])
    expect(body.routeEnvelopes.map((envelope: { route: { id: string } }) => envelope.route.id))
      .toEqual(['google-0', 'teskeid-road-graph-v1'])
    expect(body.routeEnvelopes[1]).toMatchObject({
      route: { id: 'teskeid-road-graph-v1', provider: 'teskeid' },
      signature: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(mockCheckWeatherGuestRateLimit).toHaveBeenCalledOnce()
  })

  it('returns Google routes unchanged when the Teskeið candidate is unavailable', async () => {
    authedUser()
    mockGetRouteOptions.mockResolvedValue([makeRouteOption('google-0', 0, 3600, 80000, true)])
    mockGetTeskeidRouteCandidate.mockResolvedValue(null)

    const res = await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.routes.map((route: { id: string }) => route.id)).toEqual(['google-0'])
  })

  it('forwards a valid string placeId to the provider', async () => {
    authedUser()
    mockGetRouteOptions.mockResolvedValue([makeRouteOption('google-0', 0, 3600, 80000, true)])
    await POST(makeRequest({
      origin: { ...VALID_ORIGIN, placeId: 'ChIJorigin123' },
      destination: { ...VALID_DEST, placeId: 'ChIJdest456' },
    }))
    const call = mockGetRouteOptions.mock.calls[0]
    expect(call[0].placeId).toBe('ChIJorigin123')
    expect(call[1].placeId).toBe('ChIJdest456')
  })

  it('treats empty string placeId as missing (uses confirmed sentinel)', async () => {
    authedUser()
    mockGetRouteOptions.mockResolvedValue([makeRouteOption('google-0', 0, 3600, 80000, true)])
    await POST(makeRequest({
      origin: { ...VALID_ORIGIN, placeId: '' },
      destination: VALID_DEST,
    }))
    const call = mockGetRouteOptions.mock.calls[0]
    expect(call[0].placeId).toBe('confirmed')
  })

  it('ignores non-string placeId (uses confirmed sentinel)', async () => {
    authedUser()
    mockGetRouteOptions.mockResolvedValue([makeRouteOption('google-0', 0, 3600, 80000, true)])
    await POST(makeRequest({
      origin: { ...VALID_ORIGIN, placeId: 12345 },
      destination: VALID_DEST,
    }))
    const call = mockGetRouteOptions.mock.calls[0]
    expect(call[0].placeId).toBe('confirmed')
  })

  it('signed-in user without vedrid uses public path and returns 200 when WEATHER_PUBLIC_ENABLED=true', async () => {
    publicAuthedUser()
    mockGetRouteOptions.mockResolvedValue([makeRouteOption('google-0', 0, 3600, 80000, true)])
    const res = await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(res.status).toBe(200)
  })

  it('signed-in user without vedrid gets 404 when WEATHER_ENABLED is off', async () => {
    delete process.env.WEATHER_ENABLED
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2', email: 'novedrid@example.com' } } })
    mockCheckFeatureAccess.mockResolvedValue(false)
    const res = await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(res.status).toBe(404)
  })

  it('signed-in user without vedrid is rate-limited on public path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2', email: 'novedrid@example.com' } } })
    mockCheckFeatureAccess.mockResolvedValue(false)
    mockCheckWeatherGuestRateLimit.mockResolvedValue(false)
    process.env.WEATHER_PUBLIC_ENABLED = 'true'
    const res = await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(res.status).toBe(429)
  })
})

describe('POST /api/teskeid/weather/travel/routes — usage events', () => {
  it('records weather_route_options_calculated on success', async () => {
    authedUser()
    mockGetRouteOptions.mockResolvedValue([makeRouteOption('google-0', 0, 3600, 80000, true)])
    await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(mockRecordTeskeidUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'vedrid',
      eventName: 'weather_route_options_calculated',
      metadata: expect.objectContaining({ routeCount: 1, routePairHash: 'testhash' }),
    }))
  })

  it('records weather_route_options_failed when provider returns no routes', async () => {
    authedUser()
    mockGetRouteOptions.mockResolvedValue([])
    await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(mockRecordTeskeidUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'vedrid',
      eventName: 'weather_route_options_failed',
    }))
  })

  it('records weather_route_options_failed when provider throws', async () => {
    authedUser()
    mockGetRouteOptions.mockRejectedValue(new Error('network error'))
    await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(mockRecordTeskeidUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'vedrid',
      eventName: 'weather_route_options_failed',
    }))
  })

  it('does not record usage event when blocked before auth/public check', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    // WEATHER_PUBLIC_ENABLED not set → 401 before any event recording
    await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(mockRecordTeskeidUsageEvent).not.toHaveBeenCalled()
  })

  it('records public weather_route_options_calculated with userId null and actor public', async () => {
    guestUser()
    mockGetRouteOptions.mockResolvedValue([makeRouteOption('google-0', 0, 3600, 80000, true)])
    await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(mockRecordTeskeidUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      userId: null,
      featureKey: 'vedrid',
      eventName: 'weather_route_options_calculated',
      metadata: expect.objectContaining({ actor: 'public' }),
    }))
  })

  it('records public weather_route_options_failed when provider returns no routes', async () => {
    guestUser()
    mockGetRouteOptions.mockResolvedValue([])
    await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(mockRecordTeskeidUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      userId: null,
      eventName: 'weather_route_options_failed',
      metadata: expect.objectContaining({ actor: 'public' }),
    }))
  })

  it('records weather_route_options_rate_limited and returns 429 when guest is rate limited', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockCheckWeatherGuestRateLimit.mockResolvedValue(false)
    process.env.WEATHER_PUBLIC_ENABLED = 'true'
    const res = await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(res.status).toBe(429)
    expect(mockRecordTeskeidUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      userId: null,
      eventName: 'weather_route_options_rate_limited',
      metadata: expect.objectContaining({ actor: 'public' }),
    }))
  })

  it('rate-limited event does not also record route_options_calculated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockCheckWeatherGuestRateLimit.mockResolvedValue(false)
    process.env.WEATHER_PUBLIC_ENABLED = 'true'
    await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    const calls = mockRecordTeskeidUsageEvent.mock.calls.map((c: unknown[]) => (c[0] as { eventName: string }).eventName)
    expect(calls).not.toContain('weather_route_options_calculated')
  })

  it('authenticated events include actor: authenticated', async () => {
    authedUser()
    mockGetRouteOptions.mockResolvedValue([makeRouteOption('google-0', 0, 3600, 80000, true)])
    await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(mockRecordTeskeidUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ actor: 'authenticated' }),
    }))
  })

  it('guest event metadata does not contain place names, lat, lon or address', async () => {
    guestUser()
    mockGetRouteOptions.mockResolvedValue([makeRouteOption('google-0', 0, 3600, 80000, true)])
    await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    const call = mockRecordTeskeidUsageEvent.mock.calls[0][0]
    const meta = JSON.stringify(call.metadata)
    expect(meta).not.toContain('Reykjavík')
    expect(meta).not.toContain('"lat"')
    expect(meta).not.toContain('"lon"')
  })

  it('metadata contains curatedRouteLabels and no place names or coords', async () => {
    authedUser()
    const curatedRoute = { ...makeRouteOption('google-0', 0, 3600, 80000, false), labels: ['CURATED_VIA_THRENGSLAVEGUR'] }
    mockGetRouteOptions.mockResolvedValue([curatedRoute])
    await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    const call = mockRecordTeskeidUsageEvent.mock.calls[0][0]
    expect(call.metadata.curatedRouteLabels).toContain('CURATED_VIA_THRENGSLAVEGUR')
    expect(JSON.stringify(call.metadata)).not.toContain('Reykjavík')
    expect(JSON.stringify(call.metadata)).not.toContain('lat')
  })

  it('omits routePairHash from metadata when routePairFingerprint returns null', async () => {
    authedUser()
    const { routePairFingerprint: mockFp } = await import('@/lib/teskeid/usage.server')
    vi.mocked(mockFp).mockReturnValueOnce(null)
    mockGetRouteOptions.mockResolvedValue([makeRouteOption('google-0', 0, 3600, 80000, true)])
    await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    const call = mockRecordTeskeidUsageEvent.mock.calls[0][0]
    expect(call.metadata.routePairHash).toBeUndefined()
  })
})
