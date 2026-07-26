import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  requireAdmin: vi.fn(),
  enabled: vi.fn(),
}))

vi.mock('@/lib/iceland-routes/roadGraphRefresh.server', () => ({
  refreshRoadGraphSnapshot: mocks.refresh,
}))
vi.mock('@/lib/iceland-routes/roadGraphCandidate.server', () => ({
  isTeskeidRouteCandidateEnabled: mocks.enabled,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: vi.fn() } })),
}))
vi.mock('@/lib/teskeid/admin-auth', () => ({ requireAdmin: mocks.requireAdmin }))

import { NextResponse } from 'next/server'
import { GET } from '@/app/api/cron/refresh-road-graph/route'
import { POST } from '@/app/api/admin/weather/refresh-road-graph/route'

function cronRequest(secret?: string) {
  return new Request('http://localhost/api/cron/refresh-road-graph', {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'secret'
  delete process.env.TESKEID_ROAD_GRAPH_REFRESH_ENABLED
  mocks.enabled.mockReturnValue(true)
  mocks.requireAdmin.mockResolvedValue({ user: { id: 'u1', email: 'admin@example.com' } })
  mocks.refresh.mockResolvedValue({ status: 'ok', snapshotId: 'snapshot-1' })
})

describe('road graph refresh routes', () => {
  it('schedules the protected refresh once per day in Vercel', () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons?: Array<{ path?: string; schedule?: string }>
    }
    expect(config.crons).toContainEqual({
      path: '/api/cron/refresh-road-graph',
      schedule: '17 4 * * *',
    })
  })

  it('fails cron closed when CRON_SECRET is missing or wrong', async () => {
    expect((await GET(cronRequest())).status).toBe(401)
    expect((await GET(cronRequest('wrong'))).status).toBe(401)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('skips scheduled live work while the global route flag is off', async () => {
    mocks.enabled.mockReturnValue(false)
    const response = await GET(cronRequest('secret'))
    await expect(response.json()).resolves.toEqual({ status: 'skipped', reason: 'routing_disabled' })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('runs the cron refresh with safe aggregate output', async () => {
    const response = await GET(cronRequest('secret'))
    expect(response.status).toBe(200)
    expect(mocks.refresh).toHaveBeenCalledWith('cron')
  })

  it('can prewarm snapshots behind a separate operational flag', async () => {
    mocks.enabled.mockReturnValue(false)
    process.env.TESKEID_ROAD_GRAPH_REFRESH_ENABLED = 'true'
    const response = await GET(cronRequest('secret'))
    expect(response.status).toBe(200)
    expect(mocks.refresh).toHaveBeenCalledWith('cron')
  })

  it('requires a Teskeið admin for manual bootstrap', async () => {
    mocks.requireAdmin.mockResolvedValue({
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    })
    const response = await POST()
    expect(response.status).toBe(403)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('allows an admin to bootstrap before the global route flag is enabled', async () => {
    mocks.enabled.mockReturnValue(false)
    const response = await POST()
    expect(response.status).toBe(200)
    expect(mocks.refresh).toHaveBeenCalledWith('admin')
  })

  it('returns 500 without leaking details when refresh reports a safe failure', async () => {
    mocks.refresh.mockResolvedValue({ status: 'error', reason: 'snapshot_validation_failed' })
    const response = await POST()
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ status: 'error', reason: 'snapshot_validation_failed' })
  })
})
