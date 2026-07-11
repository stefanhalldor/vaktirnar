/**
 * Tests for POST /api/teskeid/weather/travel/routes
 *
 * Verifies auth enforcement, validation, provider errors, and
 * that results are sorted by durationS ascending.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))
const { mockCheckFeatureAccess } = vi.hoisted(() => ({ mockCheckFeatureAccess: vi.fn() }))
const { mockGetRouteOptions } = vi.hoisted(() => ({ mockGetRouteOptions: vi.fn() }))
const { mockRecordTeskeidUsageEvent } = vi.hoisted(() => ({ mockRecordTeskeidUsageEvent: vi.fn() }))
const { mockCheckWeatherGuestRateLimit } = vi.hoisted(() => ({ mockCheckWeatherGuestRateLimit: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/loans/guard', () => ({
  checkFeatureAccess: mockCheckFeatureAccess,
}))

vi.mock('@/lib/weather/provider.server', () => ({
  getWeatherMapProvider: vi.fn(() => ({
    getRouteOptions: mockGetRouteOptions,
  })),
}))

vi.mock('@/lib/teskeid/usage.server', () => ({
  recordTeskeidUsageEvent: mockRecordTeskeidUsageEvent,
  routePairFingerprint: vi.fn(() => 'testhash'),
}))

vi.mock('@/lib/weather/ip-rate-limit.server', () => ({
  checkWeatherGuestRateLimit: mockCheckWeatherGuestRateLimit,
}))

import { POST } from '@/app/api/teskeid/weather/travel/routes/route'

// ── Helpers ────────────────────────────────────────────────────────────────────

const VALID_ORIGIN = { name: 'Reykjavík', lat: 64.135, lon: -21.895 }
const VALID_DEST   = { name: 'Selfoss',   lat: 63.933, lon: -21.0 }

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

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
  process.env.WEATHER_ENABLED = 'true'
  delete process.env.WEATHER_PUBLIC_ENABLED
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

  it('returns 404 when user lacks vedrid feature access', async () => {
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

  it('records guest weather_route_options_calculated with userId null and actor guest', async () => {
    guestUser()
    mockGetRouteOptions.mockResolvedValue([makeRouteOption('google-0', 0, 3600, 80000, true)])
    await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(mockRecordTeskeidUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      userId: null,
      featureKey: 'vedrid',
      eventName: 'weather_route_options_calculated',
      metadata: expect.objectContaining({ actor: 'guest' }),
    }))
  })

  it('records guest weather_route_options_failed when provider returns no routes', async () => {
    guestUser()
    mockGetRouteOptions.mockResolvedValue([])
    await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(mockRecordTeskeidUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      userId: null,
      eventName: 'weather_route_options_failed',
      metadata: expect.objectContaining({ actor: 'guest' }),
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
      metadata: expect.objectContaining({ actor: 'guest' }),
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
