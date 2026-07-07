/**
 * Tests for /api/place/search route.
 *
 * Verifies auth enforcement, input validation, provider fallback, and
 * Iceland coordinate filtering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))
const { mockCheckFeatureAccess } = vi.hoisted(() => ({ mockCheckFeatureAccess: vi.fn() }))
const { mockGeocodePlace } = vi.hoisted(() => ({ mockGeocodePlace: vi.fn() }))

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
    geocodePlace: mockGeocodePlace,
  })),
}))

import { GET } from '@/app/api/place/search/route'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest(q?: string) {
  const url = q !== undefined
    ? `http://localhost/api/place/search?q=${encodeURIComponent(q)}`
    : 'http://localhost/api/place/search'
  return new NextRequest(url)
}

function authedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'test@example.com' } } })
  mockCheckFeatureAccess.mockResolvedValue(true)
}

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
})

describe('GET /api/place/search', () => {
  it('returns 404 when AUTH_MVP_ENABLED is not true', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    const res = await GET(makeRequest('reykjavik'))
    expect(res.status).toBe(404)
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest('reykjavik'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when user lacks vedrid feature access', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'test@example.com' } } })
    mockCheckFeatureAccess.mockResolvedValue(false)
    const res = await GET(makeRequest('reykjavik'))
    expect(res.status).toBe(404)
  })

  it('returns 400 when query is too short', async () => {
    authedUser()
    const res = await GET(makeRequest('r'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.results).toEqual([])
  })

  it('returns 400 when query is missing', async () => {
    authedUser()
    const res = await GET(makeRequest(''))
    expect(res.status).toBe(400)
  })

  it('returns 503 when provider is not configured', async () => {
    authedUser()
    const { getWeatherMapProvider } = await import('@/lib/weather/provider.server')
    vi.mocked(getWeatherMapProvider).mockReturnValueOnce(null)
    const res = await GET(makeRequest('reykjavik'))
    expect(res.status).toBe(503)
  })

  it('returns normalized results for a valid query', async () => {
    authedUser()
    mockGeocodePlace.mockResolvedValue([
      { placeId: 'p1', displayName: 'Reykjavík', formattedAddress: 'Reykjavík, Ísland', lat: 64.135, lon: -21.895 },
    ])
    const res = await GET(makeRequest('reykjavik'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toHaveLength(1)
    expect(body.results[0]).toMatchObject({ name: 'Reykjavík', lat: 64.135, lon: -21.895 })
  })

  it('filters out non-Iceland coordinates', async () => {
    authedUser()
    mockGeocodePlace.mockResolvedValue([
      { placeId: 'p1', displayName: 'Reykjavík', formattedAddress: 'Reykjavík, Ísland', lat: 64.135, lon: -21.895 },
      { placeId: 'p2', displayName: 'London', formattedAddress: 'London, UK', lat: 51.5, lon: -0.12 },
    ])
    const res = await GET(makeRequest('rey'))
    const body = await res.json()
    expect(body.results).toHaveLength(1)
    expect(body.results[0].name).toBe('Reykjavík')
  })

  it('returns empty results when provider throws', async () => {
    authedUser()
    mockGeocodePlace.mockRejectedValue(new Error('API error'))
    // Use a unique query to avoid hitting the module-level in-memory cache from other tests
    const res = await GET(makeRequest('þórshöfn-provider-error'))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.results).toEqual([])
  })
})
