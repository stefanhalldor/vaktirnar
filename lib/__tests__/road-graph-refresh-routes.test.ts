import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  requireAdmin: vi.fn(),
  enabled: vi.fn(),
  readActive: vi.fn(),
  parseContract: vi.fn(),
}))

vi.mock('@/lib/iceland-routes/roadGraphRefresh.server', () => ({
  refreshRoadGraphSnapshot: mocks.refresh,
}))
vi.mock('@/lib/iceland-routes/roadGraphCandidate.server', () => ({
  isTeskeidRouteCandidateEnabled: mocks.enabled,
}))
vi.mock('@/lib/iceland-routes/roadGraphSnapshotStore.server', () => ({
  readActiveRoadGraphSnapshotMetadata: mocks.readActive,
}))
vi.mock('@/lib/iceland-routes/roadGraphSnapshotFormat', () => ({
  parseRoadGraphRuntimeBuildContractV1: mocks.parseContract,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4: 'policy-v4',
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: vi.fn() } })),
}))
vi.mock('@/lib/teskeid/admin-auth', () => ({ requireAdmin: mocks.requireAdmin }))

import { NextResponse } from 'next/server'
import { GET as cronGET } from '@/app/api/cron/refresh-road-graph/route'
import {
  GET as adminGET,
  POST,
} from '@/app/api/admin/weather/refresh-road-graph/route'

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
  mocks.readActive.mockResolvedValue({
    id: 'snapshot-v4',
    validation: { runtimeBuildContract: { policyFingerprint: 'policy-v4' } },
    goldenRoutePassCount: 23,
    goldenRouteTotalCount: 23,
    promotedAtIso: '2026-08-08T19:33:57.000Z',
    storagePath: 'must-not-leak.json.gz',
    payloadSha256: 'must-not-leak',
  })
  mocks.parseContract.mockReturnValue({ policyFingerprint: 'policy-v4' })
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
    expect((await cronGET(cronRequest())).status).toBe(401)
    expect((await cronGET(cronRequest('wrong'))).status).toBe(401)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('skips scheduled live work while the global route flag is off', async () => {
    mocks.enabled.mockReturnValue(false)
    const response = await cronGET(cronRequest('secret'))
    await expect(response.json()).resolves.toEqual({ status: 'skipped', reason: 'routing_disabled' })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('runs the cron refresh with safe aggregate output', async () => {
    const response = await cronGET(cronRequest('secret'))
    expect(response.status).toBe(200)
    expect(mocks.refresh).toHaveBeenCalledWith('cron')
  })

  it('can prewarm snapshots behind a separate operational flag', async () => {
    mocks.enabled.mockReturnValue(false)
    process.env.TESKEID_ROAD_GRAPH_REFRESH_ENABLED = 'true'
    const response = await cronGET(cronRequest('secret'))
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

  it('requires a Teskeið admin before reading active snapshot status', async () => {
    mocks.requireAdmin.mockResolvedValue({
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    })
    const response = await adminGET()
    expect(response.status).toBe(403)
    expect(mocks.readActive).not.toHaveBeenCalled()
  })

  it('returns only a safe active V4 status projection to an admin', async () => {
    const response = await adminGET()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const payload = await response.json()
    expect(payload).toEqual({
      status: 'ready',
      snapshotId: 'snapshot-v4',
      policyFingerprint: 'policy-v4',
      isV4: true,
      goldenRoutePassCount: 23,
      goldenRouteTotalCount: 23,
      promotedAtIso: '2026-08-08T19:33:57.000Z',
    })
    expect(JSON.stringify(payload)).not.toContain('must-not-leak')
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
