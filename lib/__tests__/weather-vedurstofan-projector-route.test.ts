import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ──────────────────────────────────────────────────────────────

const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }))
const { mockProjector } = vi.hoisted(() => ({ mockProjector: vi.fn() }))
const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/teskeid/admin-auth', () => ({
  requireAdmin: mockRequireAdmin,
}))

vi.mock('@/lib/weather/providers/vedurstofan.server', () => ({
  projectVedurstofanCacheToProductTables: mockProjector,
}))

import { POST } from '@/app/api/admin/weather/project-vedurstofan/route'
import { NextResponse } from 'next/server'

beforeEach(() => {
  vi.clearAllMocks()
  mockProjector.mockResolvedValue({ projected: 5, skipped: 0, errors: 0, runId: 1 })
})

// ── Auth ──────────────────────────────────────────────────────────────────────

describe('POST /api/admin/weather/project-vedurstofan — auth', () => {
  it('returns 401 when user is not authenticated', async () => {
    const errorResponse = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    mockRequireAdmin.mockResolvedValue({ error: errorResponse })
    const res = await POST()
    expect(res.status).toBe(401)
    expect(mockProjector).not.toHaveBeenCalled()
  })

  it('returns 403 when user is not admin', async () => {
    const errorResponse = NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    mockRequireAdmin.mockResolvedValue({ error: errorResponse })
    const res = await POST()
    expect(res.status).toBe(403)
    expect(mockProjector).not.toHaveBeenCalled()
  })

  it('calls projector and returns 200 for admin user', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'u1', email: 'admin@example.com' } })
    const res = await POST()
    expect(res.status).toBe(200)
    expect(mockProjector).toHaveBeenCalledTimes(1)
  })
})

// ── Response shape ─────────────────────────────────────────────────────────────

describe('POST /api/admin/weather/project-vedurstofan — response', () => {
  beforeEach(() => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'u1', email: 'admin@example.com' } })
  })

  it('returns projection result JSON', async () => {
    mockProjector.mockResolvedValue({ projected: 12, skipped: 2, errors: 0, runId: 7 })
    const res = await POST()
    const body = await res.json()
    expect(body.projected).toBe(12)
    expect(body.skipped).toBe(2)
    expect(body.errors).toBe(0)
    expect(body.runId).toBe(7)
  })

  it('returns 500 if projector throws unexpectedly', async () => {
    mockProjector.mockRejectedValue(new Error('unexpected crash'))
    const res = await POST()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Projection failed')
  })

  it('does not expose admin user identity in response', async () => {
    const res = await POST()
    const body = await res.json()
    const bodyStr = JSON.stringify(body)
    expect(bodyStr).not.toContain('admin@example.com')
    expect(bodyStr).not.toContain('u1')
  })
})
