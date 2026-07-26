import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockSend }
  },
}))

import { sendLoginCode, sendUserLoginCode } from '@/lib/auth/email'

describe('auth email delivery result', () => {
  const savedKey = process.env.RESEND_API_KEY

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.RESEND_API_KEY = 'test-key'
  })

  afterEach(() => {
    if (savedKey === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = savedKey
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('returns accepted only when Resend returns a message id without an error', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null })

    await expect(sendUserLoginCode('user@example.com', '123456')).resolves.toBe('accepted')
  })

  it('returns failed when Resend explicitly rejects the request', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', statusCode: 422, message: 'sensitive detail' },
    })

    await expect(sendUserLoginCode('user@example.com', '123456')).resolves.toBe('failed')
  })

  it('returns uncertain when the provider call throws', async () => {
    mockSend.mockRejectedValue(new Error('network failure for user@example.com code 123456'))

    await expect(sendUserLoginCode('user@example.com', '123456')).resolves.toBe('uncertain')
  })

  it('returns uncertain instead of waiting for the platform timeout', async () => {
    vi.useFakeTimers()
    mockSend.mockReturnValue(new Promise(() => undefined))

    const delivery = sendUserLoginCode('user@example.com', '123456')
    await vi.advanceTimersByTimeAsync(10_000)

    await expect(delivery).resolves.toBe('uncertain')
  })

  it('keeps the legacy/admin wrapper fail-closed without logging email or code', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSend.mockResolvedValue({ data: null, error: { name: 'provider_error' } })

    await expect(sendLoginCode('user@example.com', '123456')).rejects.toThrow('email_delivery_failed')
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('user@example.com')
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('123456')
  })
})
