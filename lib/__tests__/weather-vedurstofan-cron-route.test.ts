import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const { mockWarmer } = vi.hoisted(() => ({ mockWarmer: vi.fn() }))

vi.mock('@/lib/weather/providers/vedurstofan.server', () => ({
  warmVedurstofanForecastCache: mockWarmer,
}))

import { GET } from '@/app/api/cron/warm-vedurstofan/route'

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(opts?: { secret?: string | null }): Request {
  const headers: Record<string, string> = {}
  if (opts?.secret !== null) {
    headers['authorization'] = `Bearer ${opts?.secret ?? 'test-secret'}`
  }
  return new Request('http://localhost/api/cron/warm-vedurstofan', { headers })
}

const WARM_RESULT = {
  fresh: 246,
  stale: 10,
  unavailable: 24,
  projected: 256,
  skipped: 0,
  errors: 0,
  projectionRunId: 3,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'test-secret')
  vi.stubEnv('WEATHER_ENABLED', 'true')
  mockWarmer.mockResolvedValue(WARM_RESULT)
})

// ── Auth ─────────────────────────────────────────────────────────────────────

describe('GET /api/cron/warm-vedurstofan — auth', () => {
  it('returns 401 with no Authorization header', async () => {
    const res = await GET(makeRequest({ secret: null }))
    expect(res.status).toBe(401)
    expect(mockWarmer).not.toHaveBeenCalled()
  })

  it('returns 401 with wrong secret', async () => {
    vi.stubEnv('CRON_SECRET', 'correct-secret')
    const res = await GET(makeRequest({ secret: 'wrong-secret' }))
    expect(res.status).toBe(401)
    expect(mockWarmer).not.toHaveBeenCalled()
  })

  it('returns 401 when CRON_SECRET env is missing', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    expect(mockWarmer).not.toHaveBeenCalled()
  })

  it('returns 401 when CRON_SECRET env is empty string', async () => {
    vi.stubEnv('CRON_SECRET', '')
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    expect(mockWarmer).not.toHaveBeenCalled()
  })

  it('does not accept "Bearer undefined" when CRON_SECRET is missing', async () => {
    delete process.env.CRON_SECRET
    const req = new Request('http://localhost/api/cron/warm-vedurstofan', {
      headers: { authorization: 'Bearer undefined' },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
    expect(mockWarmer).not.toHaveBeenCalled()
  })

  it('calls warmer with correct secret', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    expect(mockWarmer).toHaveBeenCalledTimes(1)
  })
})

// ── Feature flag ─────────────────────────────────────────────────────────────

describe('GET /api/cron/warm-vedurstofan — WEATHER_ENABLED', () => {
  it('returns 200 with skipped when WEATHER_ENABLED is not set', async () => {
    vi.stubEnv('WEATHER_ENABLED', '')
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe('weather disabled')
    expect(mockWarmer).not.toHaveBeenCalled()
  })

  it('runs warmer when WEATHER_ENABLED is true', async () => {
    const res = await GET(makeRequest())
    expect(mockWarmer).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
  })
})

// ── Response ─────────────────────────────────────────────────────────────────

describe('GET /api/cron/warm-vedurstofan — response', () => {
  it('returns all 7 warmer result fields', async () => {
    mockWarmer.mockResolvedValue(WARM_RESULT)
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.fresh).toBe(246)
    expect(body.stale).toBe(10)
    expect(body.unavailable).toBe(24)
    expect(body.projected).toBe(256)
    expect(body.skipped).toBe(0)
    expect(body.errors).toBe(0)
    expect(body.projectionRunId).toBe(3)
  })

  it('returns 500 if warmer throws', async () => {
    mockWarmer.mockRejectedValue(new Error('crash'))
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
  })

  it('never exposes secrets in response body', async () => {
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('test-secret')
  })
})
