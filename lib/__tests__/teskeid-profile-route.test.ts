/**
 * Unit tests for app/api/teskeid/profile/route.ts
 *
 * Verifies that both GET and PATCH return 404 when AUTH_MVP_ENABLED is not
 * 'true', and that authenticated requests are forwarded to Supabase when the
 * flag is on.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))
const { mockFrom, mockSelect, mockEq, mockSingle, mockUpsert } = vi.hoisted(() => {
  const mockSingle = vi.fn()
  const mockEq = vi.fn(() => ({ single: mockSingle }))
  const mockSelect = vi.fn(() => ({ eq: mockEq }))
  const mockUpsert = vi.fn(() => ({ select: vi.fn(() => ({ single: mockSingle })) }))
  const mockFrom = vi.fn(() => ({ select: mockSelect, upsert: mockUpsert }))
  return { mockFrom, mockSelect, mockEq, mockSingle, mockUpsert }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

import { GET, PATCH } from '@/app/api/teskeid/profile/route'

// ── Helpers ───────────────────────────────────────────────────────────────────

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

function makeRequest(body?: unknown): NextRequest {
  return new NextRequest('http://localhost/api/teskeid/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/teskeid/profile — feature flag', () => {
  let savedAuth: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedAuth = process.env.AUTH_MVP_ENABLED
  })

  afterEach(() => {
    setEnv('AUTH_MVP_ENABLED', savedAuth)
  })

  it('returns 404 when AUTH_MVP_ENABLED is not set', async () => {
    delete process.env.AUTH_MVP_ENABLED
    const res = await GET()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns 404 when AUTH_MVP_ENABLED is false', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    const res = await GET()
    expect(res.status).toBe(404)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns 401 when AUTH_MVP_ENABLED is true but no session', async () => {
    process.env.AUTH_MVP_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 401 when user exists but email is missing', async () => {
    process.env.AUTH_MVP_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: null } } })
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns 401 when user exists but email is undefined', async () => {
    process.env.AUTH_MVP_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await GET()
    expect(res.status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns profile when AUTH_MVP_ENABLED is true and session is valid', async () => {
    process.env.AUTH_MVP_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'user@example.com' } } })
    mockSingle.mockResolvedValue({ data: { display_name: 'Jón' } })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.display_name).toBe('Jón')
    expect(body.email).toBe('user@example.com')
  })
})

describe('PATCH /api/teskeid/profile — feature flag', () => {
  let savedAuth: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedAuth = process.env.AUTH_MVP_ENABLED
  })

  afterEach(() => {
    setEnv('AUTH_MVP_ENABLED', savedAuth)
  })

  it('returns 404 when AUTH_MVP_ENABLED is not set', async () => {
    delete process.env.AUTH_MVP_ENABLED
    const res = await PATCH(makeRequest({ display_name: 'Test' }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns 404 when AUTH_MVP_ENABLED is false', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    const res = await PATCH(makeRequest({ display_name: 'Test' }))
    expect(res.status).toBe(404)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('returns 401 when AUTH_MVP_ENABLED is true but no session', async () => {
    process.env.AUTH_MVP_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makeRequest({ display_name: 'Test' }))
    expect(res.status).toBe(401)
  })

  it('returns 401 when user exists but email is missing', async () => {
    process.env.AUTH_MVP_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: null } } })
    const res = await PATCH(makeRequest({ display_name: 'Test' }))
    expect(res.status).toBe(401)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns 401 when user exists but email is undefined and does not upsert', async () => {
    process.env.AUTH_MVP_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await PATCH(makeRequest({ display_name: 'Test' }))
    expect(res.status).toBe(401)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid body', async () => {
    process.env.AUTH_MVP_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'user@example.com' } } })
    const res = await PATCH(makeRequest({ display_name: 'x'.repeat(201) }))
    expect(res.status).toBe(400)
  })

  it('updates profile and returns 200 when all checks pass', async () => {
    process.env.AUTH_MVP_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'user@example.com' } } })
    mockSingle.mockResolvedValue({ data: { display_name: 'Jón' }, error: null })
    const res = await PATCH(makeRequest({ display_name: 'Jón' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.display_name).toBe('Jón')
    expect(body.email).toBe('user@example.com')
  })
})
