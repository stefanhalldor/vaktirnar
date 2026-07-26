import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ warm: vi.fn(), requireAdmin: vi.fn() }))
vi.mock('@/lib/weather/weatherChaseHistory.server', () => ({
  warmAllRoadMapPlaceMetnoHistory: mocks.warm,
}))
vi.mock('@/lib/weather/weatherBaseAccess.server', () => ({
  getWeatherEnabledMode: vi.fn(() => 'all'),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/teskeid/admin-auth', () => ({ requireAdmin: mocks.requireAdmin }))

import { NextResponse } from 'next/server'
import vercelConfig from '../../vercel.json'
import { GET } from '@/app/api/cron/warm-metno-points/route'
import { POST } from '@/app/api/admin/weather/warm-metno-points/route'

describe('met.no history warm routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'secret'
    process.env.AUTH_MVP_ENABLED = 'true'
    process.env.WEATHER_ELTA_VEDRID_FLAG = 'true'
    mocks.warm.mockResolvedValue({ total: 43, succeeded: 43, failed: 0 })
    mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin' } })
  })

  it('fails cron closed without the exact secret', async () => {
    const response = await GET(new Request('https://teskeid.is/api/cron/warm-metno-points'))
    expect(response.status).toBe(401)
    expect(mocks.warm).not.toHaveBeenCalled()
  })

  it('does not collect history while the forecast-table feature is disabled', async () => {
    process.env.WEATHER_ELTA_VEDRID_FLAG = 'false'
    const response = await GET(new Request('https://teskeid.is/api/cron/warm-metno-points', {
      headers: { authorization: 'Bearer secret' },
    }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ skipped: 'forecast history disabled' })
    expect(mocks.warm).not.toHaveBeenCalled()
  })

  it('warms canonical points for cron and an authenticated admin', async () => {
    const cron = await GET(new Request('https://teskeid.is/api/cron/warm-metno-points', {
      headers: { authorization: 'Bearer secret' },
    }))
    const admin = await POST()
    expect(cron.status).toBe(200)
    expect(admin.status).toBe(200)
    expect(mocks.warm).toHaveBeenCalledTimes(2)
  })

  it('does not allow a non-admin to trigger 43 provider reads', async () => {
    mocks.requireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    const response = await POST()
    expect(response.status).toBe(403)
    expect(mocks.warm).not.toHaveBeenCalled()
  })

  it('reports a partial collection as unavailable so monitoring can detect it', async () => {
    mocks.warm.mockResolvedValue({ total: 43, succeeded: 42, failed: 1 })
    const cron = await GET(new Request('https://teskeid.is/api/cron/warm-metno-points', {
      headers: { authorization: 'Bearer secret' },
    }))
    const admin = await POST()
    expect(cron.status).toBe(503)
    expect(admin.status).toBe(503)
  })

  it('schedules the bounded canonical-point warmup every three hours', () => {
    expect(vercelConfig.crons).toContainEqual({
      path: '/api/cron/warm-metno-points',
      schedule: '25 */3 * * *',
    })
  })
})
