/**
 * Tests for GET /api/admin/teskeid-usage
 *
 * Verifies auth enforcement, period validation, aggregation logic,
 * and that raw user IDs, hashes, or metadata rows are not exposed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }))

vi.mock('@/lib/teskeid/admin-auth', () => ({ requireAdmin: mockRequireAdmin }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}))

// Chainable Supabase query mock
let mockRows: unknown[] = []
let mockQueryError: null | object = null

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => {
    const chain: Record<string, unknown> = {}
    const resolve = () => Promise.resolve({ data: mockRows, error: mockQueryError })
    chain.from = vi.fn(() => chain)
    chain.select = vi.fn(() => chain)
    chain.order = vi.fn(() => chain)
    chain.gte = vi.fn(() => chain)
    chain.then = (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) =>
      resolve().then(ok, fail)
    return { from: vi.fn(() => chain) }
  }),
}))

import { GET } from '@/app/api/admin/teskeid-usage/route'

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/admin/teskeid-usage')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url.toString())
}

function adminUser() {
  mockRequireAdmin.mockResolvedValue({ user: { id: 'admin1', email: 'admin@test.is' } })
}

function makeRow(overrides: Partial<{
  user_id: string
  feature_key: string
  event_name: string
  metadata: Record<string, unknown>
  created_at: string
}> = {}) {
  return {
    user_id: 'u1',
    feature_key: 'vedrid',
    event_name: 'weather_route_options_calculated',
    metadata: { routePairHash: 'abc123', routeCount: 2, curatedRouteLabels: [] },
    created_at: '2026-07-08T12:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRows = []
  mockQueryError = null
})

describe('GET /api/admin/teskeid-usage — auth', () => {
  it('returns 401 when not authenticated', async () => {
    mockRequireAdmin.mockResolvedValue({ error: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) })
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 403 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue({ error: new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) })
    const res = await GET(makeRequest())
    expect(res.status).toBe(403)
  })
})

describe('GET /api/admin/teskeid-usage — period validation', () => {
  it('returns 400 for an invalid period', async () => {
    adminUser()
    const res = await GET(makeRequest({ period: 'invalid' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid period')
  })

  it('accepts valid period=7d', async () => {
    adminUser()
    const res = await GET(makeRequest({ period: '7d' }))
    expect(res.status).toBe(200)
  })
})

describe('GET /api/admin/teskeid-usage — aggregation', () => {
  it('returns zero summary when no events', async () => {
    adminUser()
    mockRows = []
    const res = await GET(makeRequest({ period: '7d' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.summary.total_events).toBe(0)
    expect(body.summary.unique_users).toBe(0)
    expect(body.summary.weather_route_calculations).toBe(0)
  })

  it('includes fingerprinting_enabled in response', async () => {
    adminUser()
    const body = await GET(makeRequest({ period: '7d' })).then(r => r.json())
    expect(typeof body.fingerprinting_enabled).toBe('boolean')
  })

  it('counts total events and unique users', async () => {
    adminUser()
    mockRows = [
      makeRow({ user_id: 'u1' }),
      makeRow({ user_id: 'u1' }),
      makeRow({ user_id: 'u2' }),
    ]
    const body = await GET(makeRequest({ period: '7d' })).then(r => r.json())
    expect(body.summary.total_events).toBe(3)
    expect(body.summary.unique_users).toBe(2)
  })

  it('counts weather route calculations and distinct route pairs', async () => {
    adminUser()
    mockRows = [
      makeRow({ event_name: 'weather_route_options_calculated', metadata: { routePairHash: 'hash1', routeCount: 2, curatedRouteLabels: [] } }),
      makeRow({ event_name: 'weather_route_options_calculated', metadata: { routePairHash: 'hash1', routeCount: 2, curatedRouteLabels: [] } }),
      makeRow({ event_name: 'weather_route_options_calculated', metadata: { routePairHash: 'hash2', routeCount: 1, curatedRouteLabels: [] } }),
    ]
    const body = await GET(makeRequest({ period: '7d' })).then(r => r.json())
    expect(body.summary.weather_route_calculations).toBe(3)
    expect(body.summary.weather_distinct_route_pairs).toBe(2)
    expect(body.weather.distinct_route_pairs).toBe(2)
  })

  it('computes route-to-result conversion', async () => {
    adminUser()
    mockRows = [
      makeRow({ event_name: 'weather_route_options_calculated', metadata: { routePairHash: 'h1', routeCount: 1, curatedRouteLabels: [] } }),
      makeRow({ event_name: 'weather_route_options_calculated', metadata: { routePairHash: 'h2', routeCount: 1, curatedRouteLabels: [] } }),
      makeRow({ event_name: 'weather_final_forecast_completed', metadata: {} }),
    ]
    const body = await GET(makeRequest({ period: '7d' })).then(r => r.json())
    expect(body.summary.weather_final_forecasts).toBe(1)
    expect(body.summary.weather_route_to_result_conversion).toBe(0.5)
  })

  it('aggregates curated route label counts', async () => {
    adminUser()
    mockRows = [
      makeRow({ metadata: { routePairHash: 'h1', routeCount: 2, curatedRouteLabels: ['CURATED_VIA_THRENGSLAVEGUR'] } }),
      makeRow({ metadata: { routePairHash: 'h2', routeCount: 1, curatedRouteLabels: ['CURATED_VIA_THRENGSLAVEGUR'] } }),
    ]
    const body = await GET(makeRequest({ period: '7d' })).then(r => r.json())
    expect(body.weather.curated_route_labels).toEqual({ CURATED_VIA_THRENGSLAVEGUR: 2 })
  })

  it('does not expose user_id, raw metadata rows, or hashes in response', async () => {
    adminUser()
    mockRows = [makeRow()]
    const body = await GET(makeRequest({ period: '7d' })).then(r => r.json())
    const json = JSON.stringify(body)
    // No raw user IDs
    expect(json).not.toContain('"user_id"')
    // No raw rows array
    expect(Array.isArray(body.events)).toBe(false)
    expect(body.events).toBeUndefined()
    // Route pair hashes are not exposed as a list
    expect(body.weather.route_pair_hashes).toBeUndefined()
  })

  it('includes all four features in feature breakdown', async () => {
    adminUser()
    const body = await GET(makeRequest({ period: '7d' })).then(r => r.json())
    const keys = body.features.map((f: { feature_key: string }) => f.feature_key)
    expect(keys).toContain('vedrid')
    expect(keys).toContain('minnid')
    expect(keys).toContain('tengsl')
    expect(keys).toContain('umonnun')
  })

  it('returns 500 when database query fails with a non-missing-table error', async () => {
    adminUser()
    mockQueryError = { message: 'connection error' }
    const res = await GET(makeRequest({ period: '7d' }))
    expect(res.status).toBe(500)
  })

  it('returns 200 with migration_missing when table does not exist (42P01)', async () => {
    adminUser()
    mockQueryError = { code: '42P01', message: 'relation "public.teskeid_usage_events" does not exist' }
    const res = await GET(makeRequest({ period: '7d' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.migration_missing).toBe(true)
    expect(body.summary.total_events).toBe(0)
    expect(typeof body.fingerprinting_enabled).toBe('boolean')
  })

  it('returns 200 with migration_missing when error message says does not exist', async () => {
    adminUser()
    mockQueryError = { message: 'relation "teskeid_usage_events" does not exist' }
    const res = await GET(makeRequest({ period: '7d' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.migration_missing).toBe(true)
  })
})
