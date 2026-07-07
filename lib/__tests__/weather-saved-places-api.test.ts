/**
 * Tests for /api/teskeid/weather/saved-places (GET, POST) and
 * /api/teskeid/weather/saved-places/[id] (DELETE).
 *
 * Verifies auth enforcement, input validation, and happy paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))
const { mockCheckFeatureAccess } = vi.hoisted(() => ({ mockCheckFeatureAccess: vi.fn() }))

// DB query builder mock — supports the chains used in saved-places routes
const mockSingle = vi.hoisted(() => vi.fn())
const mockMaybeSingle = vi.hoisted(() => vi.fn())
const mockLimit = vi.hoisted(() => vi.fn())
const mockOrder = vi.hoisted(() => vi.fn())
const mockSelect = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn())
const mockInsert = vi.hoisted(() => vi.fn())
const mockDelete = vi.hoisted(() => vi.fn())
const mockEq = vi.hoisted(() => vi.fn())
const mockCount = vi.hoisted(() => vi.fn())
const mockIn = vi.hoisted(() => vi.fn())
const mockFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

vi.mock('@/lib/loans/guard', () => ({
  checkFeatureAccess: mockCheckFeatureAccess,
}))

import { GET, POST } from '@/app/api/teskeid/weather/saved-places/route'
import { DELETE } from '@/app/api/teskeid/weather/saved-places/[id]/route'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest(method: string, body?: unknown) {
  return new Request(`http://localhost/api/teskeid/weather/saved-places`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
}

function authedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } })
  mockCheckFeatureAccess.mockResolvedValue(true)
}

function unauthenticated() {
  mockGetUser.mockResolvedValue({ data: { user: null } })
}

function accessDenied() {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } } })
  mockCheckFeatureAccess.mockResolvedValue(false)
}

const VALID_PLACE = { name: 'Selfoss', formattedAddress: 'Selfoss, Iceland', lat: 63.933, lon: -21.0 }

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
})

// ── GET tests ──────────────────────────────────────────────────────────────────

describe('GET /api/teskeid/weather/saved-places', () => {
  it('returns 401 when AUTH_MVP_ENABLED is not true', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 401 when user is not authenticated', async () => {
    unauthenticated()
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 401 when feature access is denied', async () => {
    accessDenied()
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns empty places array on DB error', async () => {
    authedUser()
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
        }),
      }),
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.places).toEqual([])
  })

  it('returns mapped places on success', async () => {
    authedUser()
    const row = {
      id: 'abc',
      name: 'Selfoss',
      formatted_address: 'Selfoss, Iceland',
      lat: 63.933,
      lon: -21.0,
      usage_count: 2,
      last_used_at: '2026-07-07T00:00:00Z',
    }
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [row], error: null }),
        }),
      }),
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.places).toHaveLength(1)
    expect(body.places[0]).toMatchObject({
      id: 'abc',
      name: 'Selfoss',
      formattedAddress: 'Selfoss, Iceland',
      lat: 63.933,
      lon: -21.0,
      usageCount: 2,
    })
  })
})

// ── POST tests ─────────────────────────────────────────────────────────────────

describe('POST /api/teskeid/weather/saved-places', () => {
  it('returns 401 when AUTH_MVP_ENABLED is not true', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    const res = await POST(makeRequest('POST', VALID_PLACE))
    expect(res.status).toBe(401)
  })

  it('returns 401 when user is not authenticated', async () => {
    unauthenticated()
    const res = await POST(makeRequest('POST', VALID_PLACE))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid coordinates (out of Iceland range)', async () => {
    authedUser()
    const res = await POST(makeRequest('POST', { ...VALID_PLACE, lat: 51.5, lon: -0.1 }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_coords')
  })

  it('returns 400 for missing name', async () => {
    authedUser()
    const res = await POST(makeRequest('POST', { ...VALID_PLACE, name: '' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_name')
  })

  it('returns 400 for whitespace-only name', async () => {
    authedUser()
    const res = await POST(makeRequest('POST', { ...VALID_PLACE, name: '   ' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_name')
  })

  it('returns 400 for non-numeric lat', async () => {
    authedUser()
    const res = await POST(makeRequest('POST', { ...VALID_PLACE, lat: 'bad' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_coords')
  })

  it('returns 500 when insert fails', async () => {
    authedUser()
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'insert error' } }),
        }),
      }),
    })
    const res = await POST(makeRequest('POST', VALID_PLACE))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('save_failed')
  })

  it('returns 500 when update fails', async () => {
    authedUser()
    const existingRow = { id: 'existing-id', usage_count: 3 }
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: existingRow, error: null }),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'update error' } }),
          }),
        }),
      }),
    })
    const res = await POST(makeRequest('POST', VALID_PLACE))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('save_failed')
  })

  it('inserts new place and returns it', async () => {
    authedUser()
    const saved = {
      id: 'new-id',
      name: 'Selfoss',
      formatted_address: 'Selfoss, Iceland',
      lat: 63.933,
      lon: -21.0,
      usage_count: 1,
      last_used_at: '2026-07-07T00:00:00Z',
    }
    // SELECT maybeSingle → null (no existing row)
    const mockSelectSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    // INSERT chain
    const mockInsertSingle = vi.fn().mockResolvedValue({ data: saved, error: null })
    // COUNT query (cap check)
    const mockCountResult = vi.fn().mockResolvedValue({ count: 1, error: null })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'weather_saved_places') {
        return {
          select: vi.fn().mockImplementation((fields: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.count === 'exact') {
              return { count: null, error: null, then: undefined, ...mockCountResult() }
            }
            return {
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({ maybeSingle: mockSelectSingle }),
              }),
            }
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({ single: mockInsertSingle }),
          }),
        }
      }
      return {}
    })

    // Re-mock for the count select call separately
    let callCount = 0
    mockFrom.mockImplementation((_table: string) => ({
      select: vi.fn().mockImplementation((_fields: unknown, opts?: unknown) => {
        const isCount = opts && typeof opts === 'object' && (opts as Record<string, unknown>).count === 'exact'
        callCount++
        if (isCount) {
          // Cap count query: .select(..., { count: 'exact' }).eq('user_id', ...) -> { count, error }
          return {
            eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
          }
        }
        if (callCount === 1) {
          // maybeSingle lookup: .select(...).eq(...).eq(...).maybeSingle()
          return {
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
            }),
          }
        }
        // Oldest-row select: .select('id').eq('user_id', ...).order(...).limit(...)
        return {
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) }),
          }),
        }
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: saved, error: null }) }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: saved, error: null }) }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    }))

    const res = await POST(makeRequest('POST', VALID_PLACE))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('place')
  })
})

// ── DELETE tests ───────────────────────────────────────────────────────────────

describe('DELETE /api/teskeid/weather/saved-places/[id]', () => {
  const makeDeleteRequest = () =>
    new Request('http://localhost/api/teskeid/weather/saved-places/some-id', { method: 'DELETE' })

  it('returns 404 when AUTH_MVP_ENABLED is not true', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    const res = await DELETE(makeDeleteRequest(), { params: Promise.resolve({ id: 'some-id' }) })
    expect(res.status).toBe(404)
  })

  it('returns 401 when user is not authenticated', async () => {
    unauthenticated()
    const res = await DELETE(makeDeleteRequest(), { params: Promise.resolve({ id: 'some-id' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when feature access is denied', async () => {
    accessDenied()
    const res = await DELETE(makeDeleteRequest(), { params: Promise.resolve({ id: 'some-id' }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 ok on successful delete', async () => {
    authedUser()
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })
    const res = await DELETE(makeDeleteRequest(), { params: Promise.resolve({ id: 'some-id' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('returns 500 on DB error', async () => {
    authedUser()
    mockFrom.mockReturnValue({
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: { message: 'db error' } }),
      }),
    })
    const res = await DELETE(makeDeleteRequest(), { params: Promise.resolve({ id: 'some-id' }) })
    expect(res.status).toBe(500)
  })
})
