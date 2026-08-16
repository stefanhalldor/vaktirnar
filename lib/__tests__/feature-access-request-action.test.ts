import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  guardSession: vi.fn(),
  entitlementState: vi.fn(),
  consumeQuota: vi.fn(),
  sendEmail: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/guard', () => ({ guardTeskeidSession: mocks.guardSession }))
vi.mock('@/lib/teskeid/featureAccessRequest.server', () => ({
  getFeatureAccessEntitlementState: mocks.entitlementState,
  consumeFeatureAccessRequestQuota: mocks.consumeQuota,
}))
vi.mock('@/lib/teskeid/featureAccessRequestEmail.server', () => ({
  sendFeatureAccessRequestEmail: mocks.sendEmail,
}))

import { requestClosedTestingAccess } from '@/lib/teskeid/featureAccessRequest.actions'

describe('requestClosedTestingAccess', () => {
  beforeEach(() => {
    vi.stubEnv('EXPENSES_ENABLED', 'true')
    mocks.guardSession.mockResolvedValue({
      user: { id: '10000000-0000-4000-8000-000000000001', email: 'A.B@GMAIL.com' },
    })
    mocks.entitlementState.mockResolvedValue('missing')
    mocks.consumeQuota.mockResolvedValue(true)
    mocks.sendEmail.mockResolvedValue('accepted')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('rejects extra identity fields before auth or delivery', async () => {
    await expect(requestClosedTestingAccess({
      feature_id: 'utlagt-og-endurgreitt',
      email: 'target@example.com',
    })).resolves.toEqual({ ok: false, error: 'invalid_input' })
    expect(mocks.guardSession).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('keeps the global switch fail-closed before reading a session', async () => {
    vi.stubEnv('EXPENSES_ENABLED', 'false')
    await expect(requestClosedTestingAccess({
      feature_id: 'utlagt-og-endurgreitt',
    })).resolves.toEqual({ ok: false, error: 'unavailable' })
    expect(mocks.guardSession).not.toHaveBeenCalled()
  })

  it('derives and canonicalizes requester identity from the session', async () => {
    await expect(requestClosedTestingAccess({
      feature_id: 'utlagt-og-endurgreitt',
    })).resolves.toEqual({ ok: true, status: 'requested' })
    expect(mocks.entitlementState).toHaveBeenCalledWith(
      'ab@gmail.com',
      'utlagt-og-endurgreitt',
    )
    expect(mocks.sendEmail).toHaveBeenCalledWith({
      actorUserId: '10000000-0000-4000-8000-000000000001',
      requesterEmail: 'ab@gmail.com',
      featureId: 'utlagt-og-endurgreitt',
    })
  })

  it('does not send a request after access has already been enabled', async () => {
    mocks.entitlementState.mockResolvedValueOnce('enabled')
    await expect(requestClosedTestingAccess({
      feature_id: 'utlagt-og-endurgreitt',
    })).resolves.toEqual({ ok: true, status: 'already_enabled' })
    expect(mocks.consumeQuota).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('does not send when entitlement lookup is unavailable', async () => {
    mocks.entitlementState.mockResolvedValueOnce('unavailable')
    await expect(requestClosedTestingAccess({
      feature_id: 'utlagt-og-endurgreitt',
    })).resolves.toEqual({ ok: false, error: 'unavailable' })
    expect(mocks.consumeQuota).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('fails closed when the actor daily quota is unavailable or exhausted', async () => {
    mocks.consumeQuota.mockResolvedValueOnce(false)
    await expect(requestClosedTestingAccess({
      feature_id: 'utlagt-og-endurgreitt',
    })).resolves.toEqual({ ok: false, error: 'rate_limited' })
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it.each(['failed', 'uncertain'] as const)('does not claim success for %s delivery', async (delivery) => {
    mocks.sendEmail.mockResolvedValueOnce(delivery)
    await expect(requestClosedTestingAccess({
      feature_id: 'utlagt-og-endurgreitt',
    })).resolves.toEqual({ ok: false, error: 'send_failed' })
  })
})
