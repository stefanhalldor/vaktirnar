import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  validate: vi.fn(),
  getUser: vi.fn(),
  access: vi.fn(),
}))

vi.mock('@/lib/weather/weatherChaseHistory.server', () => ({
  readWeatherChaseHistory: mocks.read,
  validateWeatherChaseHistoryRequest: mocks.validate,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mocks.access }))
vi.mock('@/lib/weather/weatherBaseAccess.server', () => ({
  getWeatherEnabledMode: vi.fn(() => 'all'),
}))

import { POST } from '@/app/api/teskeid/weather/forecast-history/route'

function request(body: unknown) {
  return new Request('https://teskeid.is/api/teskeid/weather/forecast-history', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST forecast-history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.AUTH_MVP_ENABLED = 'true'
    process.env.WEATHER_ELTA_VEDRID_FLAG = 'true'
    delete process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED
    mocks.validate.mockReturnValue({ day: '2026-07-26', items: [{ id: 'metno:reykjavik', providerId: 'metno' }] })
    mocks.read.mockResolvedValue({
      status: 'ok', requestedDay: '2026-07-26', availableFromDay: '2026-07-25',
      availableToDay: '2026-08-02', rowsByItemId: { 'metno:reykjavik': [] },
    })
  })

  it('allows bounded public reads and returns private no-store data', async () => {
    const response = await POST(request({}))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.read).toHaveBeenCalledOnce()
  })

  it('rejects malformed or non-canonical input', async () => {
    mocks.validate.mockReturnValue(null)
    const response = await POST(request({ day: 'tomorrow', items: [] }))
    expect(response.status).toBe(400)
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('keeps canonical met.no history public when only Veðurstofan is restricted', async () => {
    process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED = 'true'
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    const response = await POST(request({}))
    expect(response.status).toBe(200)
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(mocks.read).toHaveBeenCalledOnce()
  })

  it('honours restricted Veðurstofan access without exposing its history', async () => {
    process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED = 'true'
    mocks.validate.mockReturnValue({
      day: '2026-07-26',
      items: [{ id: 'vedurstofan:31392', providerId: 'vedurstofan' }],
    })
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    const response = await POST(request({}))
    expect(response.status).toBe(404)
    expect(mocks.read).not.toHaveBeenCalled()
  })
})
