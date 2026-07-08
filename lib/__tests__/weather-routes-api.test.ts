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

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
})

describe('POST /api/teskeid/weather/travel/routes', () => {
  it('returns 404 when AUTH_MVP_ENABLED is not true', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    const res = await POST(makeRequest({ origin: VALID_ORIGIN, destination: VALID_DEST }))
    expect(res.status).toBe(404)
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
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
