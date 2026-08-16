import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.send }
  },
}))

import { sendFeatureAccessRequestEmail } from '@/lib/teskeid/featureAccessRequestEmail.server'

describe('sendFeatureAccessRequestEmail', () => {
  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com, second@example.com')
    vi.stubEnv('EMAIL_FROM', 'Teskeið <test@example.com>')
    mocks.send.mockResolvedValue({ data: { id: 'email-1' }, error: null })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('sends only the canonical requester and fixed feature label to configured admins', async () => {
    await expect(sendFeatureAccessRequestEmail({
      actorUserId: '10000000-0000-4000-8000-000000000001',
      requesterEmail: 'requester@example.com',
      featureId: 'utlagt-og-endurgreitt',
      now: new Date('2026-08-16T12:00:00.000Z'),
    })).resolves.toBe('accepted')

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Teskeið <test@example.com>',
        to: ['admin@example.com', 'second@example.com'],
        subject: 'Aðgangsbeiðni: Útlagt og endurgreitt',
        text: expect.stringContaining('Notandi: requester@example.com'),
      }),
      { idempotencyKey: expect.stringMatching(/^feature-access-request\/[0-9a-f]{64}$/) },
    )
    const payload = mocks.send.mock.calls[0][0]
    expect(payload.text).not.toContain('expense')
    expect(payload.text).not.toContain('invitation')
  })

  it('uses a stable daily idempotency key without exposing the actor id', async () => {
    const input = {
      actorUserId: '10000000-0000-4000-8000-000000000001',
      requesterEmail: 'requester@example.com',
      featureId: 'utlagt-og-endurgreitt' as const,
      now: new Date('2026-08-16T23:59:59.000Z'),
    }
    await sendFeatureAccessRequestEmail(input)
    await sendFeatureAccessRequestEmail({ ...input, now: new Date('2026-08-16T00:00:01.000Z') })

    const first = mocks.send.mock.calls[0][1].idempotencyKey
    const second = mocks.send.mock.calls[1][1].idempotencyKey
    expect(first).toBe(second)
    expect(first).not.toContain(input.actorUserId)
    expect(first).not.toContain(input.requesterEmail)
  })

  it('fails visibly without mail configuration', async () => {
    vi.stubEnv('ADMIN_EMAILS', '')
    await expect(sendFeatureAccessRequestEmail({
      actorUserId: 'actor',
      requesterEmail: 'requester@example.com',
      featureId: 'utlagt-og-endurgreitt',
    })).resolves.toBe('failed')
    expect(mocks.send).not.toHaveBeenCalled()
  })
})
