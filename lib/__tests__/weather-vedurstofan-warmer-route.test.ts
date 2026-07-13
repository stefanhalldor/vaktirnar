import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRequireAdmin } = vi.hoisted(() => ({ mockRequireAdmin: vi.fn() }))
const { mockWarmer } = vi.hoisted(() => ({ mockWarmer: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: vi.fn() } })),
}))

vi.mock('@/lib/teskeid/admin-auth', () => ({
  requireAdmin: mockRequireAdmin,
}))

vi.mock('@/lib/weather/providers/vedurstofan.server', () => ({
  warmVedurstofanForecastCache: mockWarmer,
}))

import { POST } from '@/app/api/admin/weather/warm-vedurstofan/route'
import { NextResponse } from 'next/server'

beforeEach(() => {
  vi.clearAllMocks()
  mockWarmer.mockResolvedValue({ ok: 246, unavailable: 34, projected: 246, projectionRunId: 2 })
})

describe('POST /api/admin/weather/warm-vedurstofan — auth', () => {
  it('returns 401 when not authenticated', async () => {
    mockRequireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) })
    const res = await POST()
    expect(res.status).toBe(401)
    expect(mockWarmer).not.toHaveBeenCalled()
  })

  it('returns 403 when not admin', async () => {
    mockRequireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    const res = await POST()
    expect(res.status).toBe(403)
    expect(mockWarmer).not.toHaveBeenCalled()
  })

  it('calls warmer and returns 200 for admin', async () => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'u1', email: 'admin@example.com' } })
    const res = await POST()
    expect(res.status).toBe(200)
    expect(mockWarmer).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/admin/weather/warm-vedurstofan — response', () => {
  beforeEach(() => {
    mockRequireAdmin.mockResolvedValue({ user: { id: 'u1', email: 'admin@example.com' } })
  })

  it('returns ok, unavailable, projected, projectionRunId', async () => {
    mockWarmer.mockResolvedValue({ ok: 260, unavailable: 20, projected: 258, projectionRunId: 5 })
    const res = await POST()
    const body = await res.json()
    expect(body.ok).toBe(260)
    expect(body.unavailable).toBe(20)
    expect(body.projected).toBe(258)
    expect(body.projectionRunId).toBe(5)
  })

  it('returns 500 if warmer throws', async () => {
    mockWarmer.mockRejectedValue(new Error('crash'))
    const res = await POST()
    expect(res.status).toBe(500)
  })

  it('does not expose admin identity in response', async () => {
    const res = await POST()
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('admin@example.com')
  })
})
