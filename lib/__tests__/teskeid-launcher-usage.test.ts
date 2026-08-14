import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { mockGetAdmin } = vi.hoisted(() => ({ mockGetAdmin: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mockGetAdmin }))

import {
  readTeskeidLauncherOrder,
  recordTeskeidLauncherOpen,
  TESKEID_OPENED_EVENT,
} from '@/lib/teskeid/launcherUsage.server'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_CODE_SECRET = 'launcher-test-secret-at-least-32-bytes-long'
})

function readAdmin(rowsByFeature: Record<string, string>, failingFeature?: string) {
  const queries: Array<Record<string, unknown>> = []
  return {
    queries,
    admin: {
      from: vi.fn(() => {
        const state = { filters: new Map<string, unknown>() }
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn((key: string, value: unknown) => {
            state.filters.set(key, value)
            return chain
          }),
          order: vi.fn(() => chain),
          limit: vi.fn(async () => {
            queries.push(Object.fromEntries(state.filters))
            const feature = String(state.filters.get('feature_key'))
            if (feature === failingFeature) return { data: null, error: { code: '42P01' } }
            const createdAt = rowsByFeature[feature]
            return {
              data: createdAt ? [{ feature_key: feature, created_at: createdAt }] : [],
              error: null,
            }
          }),
        }
        return chain
      }),
    },
  }
}

describe('SQL71 launcher reads', () => {
  it('reads exact latest event once per visible feature and orders all features', async () => {
    const fixture = readAdmin({
      vedrid: '2026-08-13T12:01:00Z',
      bokanir: '2026-08-13T12:00:00Z',
    })
    mockGetAdmin.mockReturnValue(fixture.admin)
    const result = await readTeskeidLauncherOrder('user-a', ['bokanir', 'vedrid', 'kviss'])
    expect(result).toEqual({ ids: ['vedrid', 'bokanir', 'kviss'], available: true })
    expect(fixture.queries).toHaveLength(3)
    expect(fixture.queries).toEqual(expect.arrayContaining([
      { user_id: 'user-a', event_name: TESKEID_OPENED_EVENT, feature_key: 'bokanir' },
      { user_id: 'user-a', event_name: TESKEID_OPENED_EVENT, feature_key: 'vedrid' },
      { user_id: 'user-a', event_name: TESKEID_OPENED_EVENT, feature_key: 'kviss' },
    ]))
  })

  it('returns the exact static visible order when SQL71 is missing or any read fails', async () => {
    const fixture = readAdmin({ vedrid: '2026-08-13T12:01:00Z' }, 'bokanir')
    mockGetAdmin.mockReturnValue(fixture.admin)
    await expect(readTeskeidLauncherOrder('user-a', ['bokanir', 'vedrid']))
      .resolves.toEqual({ ids: ['bokanir', 'vedrid'], available: false })
  })
})

describe('SQL71 launcher writes', () => {
  it('writes only the fixed event contract with empty path and metadata', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn()
      .mockReturnValueOnce((() => {
        const chain = {
          select: vi.fn(() => chain), eq: vi.fn(() => chain), order: vi.fn(() => chain),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
        return chain
      })())
      .mockReturnValueOnce({ insert })
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    mockGetAdmin.mockReturnValue({ from, rpc })
    await expect(recordTeskeidLauncherOpen('user-a', 'vedrid')).resolves.toBe('recorded')
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-a', feature_key: 'vedrid', event_name: TESKEID_OPENED_EVENT,
      path: '', metadata: {},
    })
    expect(rpc).toHaveBeenCalledWith('check_and_increment_ip_rate_limit', expect.objectContaining({
      p_ip_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_max_requests: 500,
    }))
  })

  it('skips insert when the same feature is already the latest event', async () => {
    const chain = {
      select: vi.fn(() => chain), eq: vi.fn(() => chain), order: vi.fn(() => chain),
      limit: vi.fn().mockResolvedValue({
        data: [{ feature_key: 'vedrid', created_at: '2026-08-13T12:00:00Z' }], error: null,
      }),
    }
    const from = vi.fn(() => chain)
    mockGetAdmin.mockReturnValue({ from, rpc: vi.fn() })
    await expect(recordTeskeidLauncherOpen('user-a', 'vedrid')).resolves.toBe('same-latest')
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('fails closed and never blocks the caller when SQL71 is unavailable', async () => {
    mockGetAdmin.mockImplementation(() => { throw new Error('missing') })
    await expect(recordTeskeidLauncherOpen('user-a', 'vedrid')).resolves.toBe('unavailable')
  })

  it('fails closed before insert when the existing atomic service-role limiter rejects the write', async () => {
    const insert = vi.fn()
    const from = vi.fn()
      .mockReturnValueOnce((() => {
        const chain = {
          select: vi.fn(() => chain), eq: vi.fn(() => chain), order: vi.fn(() => chain),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
        return chain
      })())
      .mockReturnValueOnce({ insert })
    mockGetAdmin.mockReturnValue({
      from,
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    })
    await expect(recordTeskeidLauncherOpen('user-a', 'vedrid')).resolves.toBe('rate-limited')
    expect(insert).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledTimes(1)
  })
})
