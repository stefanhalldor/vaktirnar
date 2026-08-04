import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockSend }
  },
}))

import { sendExpenseMemberInvitationEmail } from '@/lib/expenses/email'
import isMessages from '@/messages/is.json'

describe('expense member invitation email v1', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('uses fixed catalog copy, escapes snapshots and contains no links or guest label', async () => {
    const context = {
      templateVersion: 'v1' as const,
      contextTitle: 'Gjöf <einka> https://example.test',
      inviterDisplayName: 'A.B@example.is',
    }

    await expect(sendExpenseMemberInvitationEmail(
      'recipient@example.is',
      '50000000-0000-4000-8000-000000000001',
      2,
      context,
    )).resolves.toBe('sent')

    const [message, options] = mockSend.mock.calls[0]!
    expect(message.subject).toBe(
      isMessages.teskeid.expenses.memberInvitation.emailV1.subject,
    )
    expect(message.to).toBe('recipient@example.is')
    expect(options).toEqual({
      idempotencyKey: 'expense-member-invitation/50000000-0000-4000-8000-000000000001/2',
    })
    expect(message.html).toContain('&lt;einka&gt;')
    expect(message.html).not.toContain('<einka>')
    expect(message.html).not.toContain('href=')
    expect(message.html).not.toContain('https://')
    expect(message.text).not.toContain('https://')
    expect(`${message.html}\n${message.text}`).not.toContain('recipient@example.is')
    expect(`${message.html}\n${message.text}`).not.toContain('Skráð sem')

    await sendExpenseMemberInvitationEmail(
      'recipient@example.is',
      '50000000-0000-4000-8000-000000000001',
      2,
      context,
    )
    expect(mockSend.mock.calls[1]).toEqual(mockSend.mock.calls[0])
  })
})
