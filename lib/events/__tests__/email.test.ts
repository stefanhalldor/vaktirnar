import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockProviderSend } = vi.hoisted(() => ({ mockProviderSend: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockProviderSend }
  },
}))

import {
  classifyEventAttendanceEmailError,
  sendEventAttendanceInvitationEmail,
} from '@/lib/events/email'

const INVITATION_ID = '50000000-0000-4000-8000-000000000001'
const RECIPIENT = 'private.recipient@example.is'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('RESEND_API_KEY', 're_test')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://teskeid.is/untrusted-path')
  mockProviderSend.mockResolvedValue({ data: { id: 'provider-id' }, error: null })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('event attendance email', () => {
  it('uses attempt idempotency without links while escaping untrusted names', async () => {
    await expect(sendEventAttendanceInvitationEmail(
      RECIPIENT,
      INVITATION_ID,
      2,
      {
        templateVersion: 'event-attendance-v1',
        invitationKind: 'identity_and_access',
        eventName: '<img src=x onerror=alert(1)> https://private.example',
        guestDisplayName: 'Anna <script>alert(1)</script>',
        inviterDisplayName: 'Eigandi@example.is',
      },
    )).resolves.toBe('sent')

    expect(mockProviderSend).toHaveBeenCalledTimes(1)
    const [payload, options] = mockProviderSend.mock.calls[0]!
    expect(payload.to).toBe(RECIPIENT)
    expect(options).toEqual({
      idempotencyKey: `event-attendance/v1/${INVITATION_ID}/2`,
    })
    expect(payload.html).toContain('&lt;img')
    expect(payload.html).not.toContain('Anna')
    expect(payload.html).not.toContain('<script>')
    expect(payload.html).not.toContain('href=')
    expect(payload.html).not.toContain('https://')
    expect(payload.text).not.toContain('https://')
    expect(payload.html).not.toContain('Teskeið.is')
    expect(payload.text).not.toContain('Teskeið.is')
    expect(payload.html).not.toContain(INVITATION_ID)
    expect(payload.text).not.toContain(INVITATION_ID)
    expect(payload.text).toContain('Ólesið')
  })

  it('uses the localized inviter fallback without exposing the guest identity', async () => {
    await sendEventAttendanceInvitationEmail(
      RECIPIENT,
      INVITATION_ID,
      1,
      {
        templateVersion: 'event-attendance-v1',
        invitationKind: 'access_only',
        eventName: 'Kvisskvöld',
        guestDisplayName: null,
        inviterDisplayName: null,
      },
    )
    const payload = mockProviderSend.mock.calls[0]![0]
    expect(payload.text).toContain('Boð frá: Teskeiðarnotanda')
    expect(payload.text).not.toContain('Gestanafn')
    expect(payload.text).not.toContain('Gestur')
    expect(payload.text).not.toContain('undefined')
    expect(payload.text).not.toContain('null')
  })

  it.each([
    [{ name: 'validation_error', statusCode: 400 }, 'failed'],
    [{ name: 'conflict', statusCode: 409 }, 'failed'],
    [{ name: 'concurrent_idempotent_requests', statusCode: 409 }, 'uncertain'],
    [{ name: 'rate_limit', statusCode: 429 }, 'uncertain'],
    [{ name: 'timeout', statusCode: 408 }, 'uncertain'],
    [{ name: 'server_error', statusCode: 500 }, 'uncertain'],
    [{ name: 'network', statusCode: null }, 'uncertain'],
  ] as const)('classifies provider error %j as %s', (error, expected) => {
    expect(classifyEventAttendanceEmailError(error)).toBe(expected)
  })

  it('returns uncertainty without logging recipient, event, guest or invitation context', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockProviderSend.mockRejectedValueOnce(new Error(
      `${RECIPIENT} ${INVITATION_ID} Kvisskvöld Anna`,
    ))
    await expect(sendEventAttendanceInvitationEmail(
      RECIPIENT,
      INVITATION_ID,
      1,
      {
        templateVersion: 'event-attendance-v1',
        invitationKind: 'access_only',
        eventName: 'Kvisskvöld',
        guestDisplayName: 'Anna',
        inviterDisplayName: 'Bjarni',
      },
    )).resolves.toBe('uncertain')
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('fails closed with a generic production log when the provider is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('RESEND_API_KEY', '')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(sendEventAttendanceInvitationEmail(
      RECIPIENT,
      INVITATION_ID,
      1,
      {
        templateVersion: 'event-attendance-v1',
        invitationKind: 'access_only',
        eventName: 'Kvisskvöld',
        guestDisplayName: 'Anna',
        inviterDisplayName: null,
      },
    )).resolves.toBe('uncertain')
    expect(consoleError).toHaveBeenCalledWith(
      '[events/email] delivery provider is not configured',
    )
    expect(JSON.stringify(consoleError.mock.calls)).not.toMatch(
      /private\.recipient|Kvisskvöld|Anna|50000000/,
    )
  })
})
