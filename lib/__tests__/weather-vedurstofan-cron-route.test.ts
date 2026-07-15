import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const { mockWarmer, mockGetRunState, mockInsertRunningRow } = vi.hoisted(() => ({
  mockWarmer: vi.fn(),
  mockGetRunState: vi.fn(),
  mockInsertRunningRow: vi.fn(),
}))

vi.mock('@/lib/weather/providers/vedurstofan.server', () => ({
  warmVedurstofanForecastCache: mockWarmer,
  getVedurstofanRunState: mockGetRunState,
  insertVedurstofanRunningRow: mockInsertRunningRow,
}))

// getExpectedVedurstofanCycleIso is a pure function — no need to mock it.

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
  mockGetRunState.mockResolvedValue({ state: 'available' })
  mockInsertRunningRow.mockResolvedValue(42)
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

// ── Fast-skip / run-state ─────────────────────────────────────────────────────

describe('GET /api/cron/warm-vedurstofan — fast-skip', () => {
  it('skips and does not call warmer when alreadyFresh', async () => {
    mockGetRunState.mockResolvedValue({ state: 'alreadyFresh' })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe('alreadyFresh')
    expect(mockWarmer).not.toHaveBeenCalled()
  })

  it('skips and does not call warmer when running', async () => {
    mockGetRunState.mockResolvedValue({ state: 'running' })
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.skipped).toBe('running')
    expect(mockWarmer).not.toHaveBeenCalled()
  })

  it('skips and does not call warmer when recentlyAttempted', async () => {
    mockGetRunState.mockResolvedValue({ state: 'recentlyAttempted', lastAttemptIso: '2026-07-15T06:00:00Z' })
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.skipped).toBe('recentlyAttempted')
    expect(mockWarmer).not.toHaveBeenCalled()
  })

  it('skips without calling warmer when running-row insert returns null (race)', async () => {
    mockInsertRunningRow.mockResolvedValue(null)
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.skipped).toBe('running')
    expect(mockWarmer).not.toHaveBeenCalled()
  })

  it('calls warmer with cron context when state is available', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    expect(mockInsertRunningRow).toHaveBeenCalledWith(expect.any(String), 'cron')
    expect(mockWarmer).toHaveBeenCalledWith(expect.objectContaining({
      existingRunId: 42,
      triggeredBy: 'cron',
      triggerReason: 'scheduled_cycle_warm',
      expectedAtimeIso: expect.any(String),
    }))
  })
})

// ── Response ─────────────────────────────────────────────────────────────────

describe('GET /api/cron/warm-vedurstofan — response', () => {
  it('returns warmer result fields plus expectedCycleIso', async () => {
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
    expect(body.expectedCycleIso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/)
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
