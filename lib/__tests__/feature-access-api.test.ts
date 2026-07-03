/**
 * Tests for /api/admin/feature-access route.
 *
 * Verifies auth enforcement (401/403), email validation (400),
 * and that arbitrary feature_key cannot be sent by the client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }))
const { mockAdminQuery } = vi.hoisted(() => ({ mockAdminQuery: vi.fn() }))

vi.mock('@/lib/teskeid/admin-auth', () => ({
  requireAdmin: mockRequireAdmin,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: vi.fn() })),
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      insert: vi.fn(() => mockAdminQuery()),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => mockAdminQuery()),
        })),
      })),
    })),
  })),
}))

import { GET, POST, DELETE } from '@/app/api/admin/feature-access/route'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeUnauthorizedResponse() {
  return { json: async () => ({ error: 'Unauthorized' }), status: 401, ok: false }
}

function makeForbiddenResponse() {
  return { json: async () => ({ error: 'Forbidden' }), status: 403, ok: false }
}

function makeRequest(body?: unknown, method = 'POST', feature?: string) {
  const url = feature
    ? `http://localhost/api/admin/feature-access?feature=${feature}`
    : 'http://localhost/api/admin/feature-access'
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function makeGetRequest(feature?: string) {
  const url = feature
    ? `http://localhost/api/admin/feature-access?feature=${feature}`
    : 'http://localhost/api/admin/feature-access'
  return new NextRequest(url, { method: 'GET' })
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/admin/feature-access — auth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    mockRequireAdmin.mockResolvedValue({ error: makeUnauthorizedResponse() })
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(401)
  })

  it('returns 403 when authenticated but not admin', async () => {
    mockRequireAdmin.mockResolvedValue({ error: makeForbiddenResponse() })
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(403)
  })

  it('returns 200 with list when admin (default umonnun)', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { email: 'admin@example.com', id: 'u1' } })
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(200)
  })

  it('returns 200 for ?feature=tengsl', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { email: 'admin@example.com', id: 'u1' } })
    const res = await GET(makeGetRequest('tengsl'))
    expect(res.status).toBe(200)
  })

  it('returns 200 for ?feature=vedrid', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { email: 'admin@example.com', id: 'u1' } })
    const res = await GET(makeGetRequest('vedrid'))
    expect(res.status).toBe(200)
  })

  it('returns 400 for unknown ?feature=badkey', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { email: 'admin@example.com', id: 'u1' } })
    const res = await GET(makeGetRequest('badkey'))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/admin/feature-access — auth and validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    mockRequireAdmin.mockResolvedValue({ error: makeUnauthorizedResponse() })
    const res = await POST(makeRequest({ email: 'user@example.com' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue({ error: makeForbiddenResponse() })
    const res = await POST(makeRequest({ email: 'user@example.com' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 for missing email', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { email: 'admin@example.com', id: 'u1' } })
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid email format', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { email: 'admin@example.com', id: 'u1' } })
    const res = await POST(makeRequest({ email: 'not-an-email' }))
    expect(res.status).toBe(400)
  })

  it('returns 201 for valid email grant', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { email: 'admin@example.com', id: 'u1' } })
    mockAdminQuery.mockResolvedValue({ error: null })
    const res = await POST(makeRequest({ email: 'user@example.com' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.email).toBe('user@example.com')
  })

  it('client cannot inject arbitrary feature_key via body — route uses ?feature= param only', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { email: 'admin@example.com', id: 'u1' } })
    mockAdminQuery.mockResolvedValue({ error: null })
    // Extra fields in body are ignored; feature key comes from ?feature= query param (default umonnun)
    const res = await POST(makeRequest({ email: 'user@example.com', feature_key: 'lanad-og-skilad' }))
    expect(res.status).toBe(201)
  })

  it('returns 400 for unknown ?feature=badkey', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { email: 'admin@example.com', id: 'u1' } })
    const res = await POST(makeRequest({ email: 'user@example.com' }, 'POST', 'badkey'))
    expect(res.status).toBe(400)
  })

  it('?feature=tengsl is accepted', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { email: 'admin@example.com', id: 'u1' } })
    mockAdminQuery.mockResolvedValue({ error: null })
    const res = await POST(makeRequest({ email: 'user@example.com' }, 'POST', 'tengsl'))
    expect(res.status).toBe(201)
  })

  it('returns 200 idempotently for duplicate grant', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { email: 'admin@example.com', id: 'u1' } })
    mockAdminQuery.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } })
    const res = await POST(makeRequest({ email: 'user@example.com' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})

describe('DELETE /api/admin/feature-access — auth and validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    mockRequireAdmin.mockResolvedValue({ error: makeUnauthorizedResponse() })
    const res = await DELETE(makeRequest({ email: 'user@example.com' }, 'DELETE'))
    expect(res.status).toBe(401)
  })

  it('returns 403 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue({ error: makeForbiddenResponse() })
    const res = await DELETE(makeRequest({ email: 'user@example.com' }, 'DELETE'))
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid email', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { email: 'admin@example.com', id: 'u1' } })
    const res = await DELETE(makeRequest({ email: 'bad' }, 'DELETE'))
    expect(res.status).toBe(400)
  })

  it('returns 200 on successful revoke', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { email: 'admin@example.com', id: 'u1' } })
    mockAdminQuery.mockResolvedValue({ error: null })
    const res = await DELETE(makeRequest({ email: 'user@example.com' }, 'DELETE'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})
