import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdmin: vi.fn(),
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mocks.getAdmin }))

import {
  consumeFeatureAccessRequestQuota,
  getFeatureAccessEntitlementState,
} from '@/lib/teskeid/featureAccessRequest.server'

function entitlementQuery() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: mocks.maybeSingle,
  }
  return query
}

describe('feature access request server guards', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_CODE_SECRET', 'a'.repeat(64))
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    mocks.rpc.mockResolvedValue({ data: true, error: null })
    mocks.getAdmin.mockReturnValue({
      from: vi.fn(() => entitlementQuery()),
      rpc: mocks.rpc,
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('distinguishes a confirmed missing row from enabled access and lookup failure', async () => {
    await expect(getFeatureAccessEntitlementState(
      'person@example.com',
      'utlagt-og-endurgreitt',
    )).resolves.toBe('missing')

    mocks.maybeSingle.mockResolvedValueOnce({ data: { email: 'person@example.com' }, error: null })
    await expect(getFeatureAccessEntitlementState(
      'person@example.com',
      'utlagt-og-endurgreitt',
    )).resolves.toBe('enabled')

    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'private' } })
    await expect(getFeatureAccessEntitlementState(
      'person@example.com',
      'utlagt-og-endurgreitt',
    )).resolves.toBe('unavailable')
  })

  it('uses a namespaced non-PII HMAC and Reykjavik day in the bounded counter', async () => {
    const actorId = '10000000-0000-4000-8000-000000000001'
    await expect(consumeFeatureAccessRequestQuota(
      actorId,
      new Date('2026-08-16T12:00:00.000Z'),
    )).resolves.toBe(true)

    expect(mocks.rpc).toHaveBeenCalledWith('check_and_increment_ip_rate_limit', {
      p_ip_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_window_date: '2026-08-16',
      p_max_requests: 3,
    })
    expect(mocks.rpc.mock.calls[0][1].p_ip_hash).not.toContain(actorId)
  })

  it('fails closed without a strong secret or on RPC uncertainty', async () => {
    vi.stubEnv('AUTH_CODE_SECRET', 'short')
    await expect(consumeFeatureAccessRequestQuota('actor')).resolves.toBe(false)
    expect(mocks.rpc).not.toHaveBeenCalled()

    vi.stubEnv('AUTH_CODE_SECRET', 'a'.repeat(64))
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private' } })
    await expect(consumeFeatureAccessRequestQuota('actor')).resolves.toBe(false)
  })
})
