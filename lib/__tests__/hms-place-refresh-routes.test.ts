import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireAdmin: vi.fn(),
  refresh: vi.fn(),
  supabase: { auth: { getUser: vi.fn() } },
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/teskeid/admin-auth', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/places/hmsImport.server', () => ({
  refreshHmsPlaceDirectory: mocks.refresh,
}))

import { NextResponse } from 'next/server'
import { GET as GET_CRON } from '@/app/api/cron/refresh-hms-places/route'
import { POST as POST_ADMIN } from '@/app/api/admin/weather/refresh-hms-places/route'

function cronRequest(secret?: string | null) {
  return new Request('http://localhost/api/cron/refresh-hms-places', {
    headers: secret === null ? {} : { authorization: `Bearer ${secret ?? 'test-secret'}` },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('CRON_SECRET', 'test-secret')
  vi.stubEnv('HMS_PLACE_DIRECTORY_REFRESH_ENABLED', 'true')
  mocks.createClient.mockResolvedValue(mocks.supabase)
  mocks.requireAdmin.mockResolvedValue({ user: { id: 'admin-1', email: 'admin@example.com' } })
  mocks.refresh.mockResolvedValue({
    status: 'ok',
    datasetId: 'dataset-1',
    sourceRowCount: 100_000,
    canonicalPlaceCount: 90_000,
    municipalityMappingSource: 'hagstofa',
  })
})

describe('HMS directory scheduled refresh route', () => {
  it('is scheduled weekly at a quiet, deterministic time', () => {
    const config = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
      crons?: Array<{ path?: string; schedule?: string }>
    }

    expect(config.crons).toContainEqual({
      path: '/api/cron/refresh-hms-places',
      schedule: '17 2 * * 1',
    })
  })

  it.each([
    ['missing header', null],
    ['wrong secret', 'wrong'],
  ])('fails closed for %s', async (_label, secret) => {
    const response = await GET_CRON(cronRequest(secret))

    expect(response.status).toBe(401)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('fails closed when CRON_SECRET is missing, empty, or sent as Bearer undefined', async () => {
    delete process.env.CRON_SECRET
    expect((await GET_CRON(cronRequest('undefined'))).status).toBe(401)

    vi.stubEnv('CRON_SECRET', '')
    expect((await GET_CRON(cronRequest(''))).status).toBe(401)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('skips all network and database work while refresh is disabled', async () => {
    vi.stubEnv('HMS_PLACE_DIRECTORY_REFRESH_ENABLED', 'false')

    const response = await GET_CRON(cronRequest())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'skipped', reason: 'refresh_disabled' })
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('runs with cron provenance when both protections pass', async () => {
    const response = await GET_CRON(cronRequest())

    expect(response.status).toBe(200)
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.refresh).toHaveBeenCalledWith('cron')
  })

  it('returns 500 for a safe refresh error result', async () => {
    mocks.refresh.mockResolvedValue({ status: 'error', reason: 'hms_dataset_validation_failed' })

    const response = await GET_CRON(cronRequest())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      status: 'error',
      reason: 'hms_dataset_validation_failed',
    })
  })
})

describe('HMS directory manual admin refresh route', () => {
  it('returns the admin guard response unchanged and does no refresh work', async () => {
    mocks.requireAdmin.mockResolvedValue({
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    })

    const response = await POST_ADMIN()

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' })
    expect(mocks.requireAdmin).toHaveBeenCalledWith(mocks.supabase)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('skips refresh after admin authentication when the operational flag is off', async () => {
    vi.stubEnv('HMS_PLACE_DIRECTORY_REFRESH_ENABLED', 'false')

    const response = await POST_ADMIN()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'skipped', reason: 'refresh_disabled' })
    expect(mocks.requireAdmin).toHaveBeenCalledOnce()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('runs an explicitly enabled bootstrap with admin provenance', async () => {
    const response = await POST_ADMIN()

    expect(response.status).toBe(200)
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(mocks.refresh).toHaveBeenCalledWith('admin')
  })

  it('returns 500 for a safe manual refresh error result', async () => {
    mocks.refresh.mockResolvedValue({ status: 'error', reason: 'hms_source_download_failed' })

    const response = await POST_ADMIN()

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      status: 'error',
      reason: 'hms_source_download_failed',
    })
  })
})
