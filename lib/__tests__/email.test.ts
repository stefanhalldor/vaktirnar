/**
 * Unit tests for lib/loans/email.ts
 *
 * Uses vi.hoisted + vi.mock to intercept the dynamic import('resend') call
 * inside sendLoanInvitationEmail, so no real HTTP calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoist mock factory so it can be referenced inside vi.mock ───────────────
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}))

// Mock 'resend' to intercept the dynamic import inside sendLoanInvitationEmail.
// Use class syntax so `new Resend(key)` works correctly in vitest.
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockSend }
  },
}))

import { classifyResendError, sendLoanInvitationEmail } from '@/lib/loans/email'

// ── classifyResendError ──────────────────────────────────────────────────────

describe('classifyResendError', () => {
  describe('returns "failed" for clear 4xx errors', () => {
    it.each([400, 401, 403, 404, 422])('status %i → failed', (status) => {
      expect(classifyResendError({ statusCode: status })).toBe('failed')
    })
  })

  describe('returns "uncertain" for retryable errors', () => {
    it('408 (timeout) → uncertain', () => {
      expect(classifyResendError({ statusCode: 408 })).toBe('uncertain')
    })

    it('409 concurrent_idempotent_requests → uncertain (retry safe)', () => {
      expect(classifyResendError({
        statusCode: 409,
        name: 'concurrent_idempotent_requests',
      })).toBe('uncertain')
    })

    it('429 (rate limit) → uncertain', () => {
      expect(classifyResendError({ statusCode: 429 })).toBe('uncertain')
    })
  })

  describe('returns "failed" for 409 implementation bugs', () => {
    it('409 invalid_idempotent_request → failed (payload mismatch, code bug)', () => {
      expect(classifyResendError({
        statusCode: 409,
        name: 'invalid_idempotent_request',
      })).toBe('failed')
    })

    it('409 with unknown name → failed', () => {
      expect(classifyResendError({
        statusCode: 409,
        name: 'unknown_409_variant',
      })).toBe('failed')
    })

    it('409 with null name → failed', () => {
      expect(classifyResendError({ statusCode: 409, name: null })).toBe('failed')
    })
  })

  describe('returns "uncertain" for server and network errors', () => {
    it.each([500, 502, 503])('status %i → uncertain', (status) => {
      expect(classifyResendError({ statusCode: status })).toBe('uncertain')
    })

    it('null statusCode → uncertain', () => {
      expect(classifyResendError({ statusCode: null })).toBe('uncertain')
    })

    it('undefined statusCode → uncertain', () => {
      expect(classifyResendError({})).toBe('uncertain')
    })
  })
})

// ── sendLoanInvitationEmail ──────────────────────────────────────────────────

describe('sendLoanInvitationEmail', () => {
  const INVITATION_ID = 'inv-uuid-1234'
  const ATTEMPT = 1
  const RECIPIENT = 'recipient@example.com'

  beforeEach(() => {
    mockSend.mockReset()
    // Ensure RESEND_API_KEY is set so we take the real send path
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('passes idempotency key as second argument to resend.emails.send', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null })

    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT)

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: RECIPIENT }),
      { idempotencyKey: `loan-invitation/${INVITATION_ID}/${ATTEMPT}` },
    )
  })

  it('returns "sent" when Resend returns data and no error', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null })

    const result = await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT)

    expect(result).toBe('sent')
  })

  it('returns "failed" on a clear 4xx error (e.g. 422)', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', statusCode: 422, message: 'Invalid address' },
    })

    const result = await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT)

    expect(result).toBe('failed')
  })

  it('returns "uncertain" on 429 rate limit', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'rate_limit_exceeded', statusCode: 429, message: 'Too many requests' },
    })

    const result = await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT)

    expect(result).toBe('uncertain')
  })

  it('returns "uncertain" on 409 concurrent_idempotent_requests', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'concurrent_idempotent_requests', statusCode: 409, message: 'Concurrent request' },
    })

    const result = await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT)

    expect(result).toBe('uncertain')
  })

  it('returns "uncertain" on 408 timeout', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'timeout', statusCode: 408, message: 'Request timeout' },
    })

    const result = await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT)

    expect(result).toBe('uncertain')
  })

  it('returns "uncertain" on 409 concurrent_idempotent_requests', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'concurrent_idempotent_requests', statusCode: 409, message: 'Concurrent request' },
    })

    const result = await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT)

    expect(result).toBe('uncertain')
  })

  it('returns "failed" on 409 invalid_idempotent_request (implementation bug)', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'invalid_idempotent_request', statusCode: 409, message: 'Payload mismatch' },
    })

    const result = await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT)

    expect(result).toBe('failed')
  })

  it('returns "uncertain" on 5xx server error', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'server_error', statusCode: 500, message: 'Internal server error' },
    })

    const result = await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT)

    expect(result).toBe('uncertain')
  })

  it('returns "uncertain" on network exception (thrown error)', async () => {
    mockSend.mockRejectedValue(new Error('Network error'))

    const result = await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT)

    expect(result).toBe('uncertain')
  })

  it('does not log recipient email in any call', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null })

    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT)

    const allOutput = [
      ...consoleSpy.mock.calls.flat(),
      ...errorSpy.mock.calls.flat(),
    ].join(' ')
    expect(allOutput).not.toContain(RECIPIENT)

    consoleSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('uses attempt number in idempotency key (different attempts → different keys)', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null })

    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, 1)
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, 2)

    const calls = mockSend.mock.calls
    expect(calls[0][1].idempotencyKey).toBe(`loan-invitation/${INVITATION_ID}/1`)
    expect(calls[1][1].idempotencyKey).toBe(`loan-invitation/${INVITATION_ID}/2`)
  })
})

// ── sendLoanInvitationEmail — email content ──────────────────────────────────

describe('sendLoanInvitationEmail — subject and content', () => {
  const INVITATION_ID = 'inv-uuid-abcd'
  const ATTEMPT = 1
  const RECIPIENT = 'user@example.com'

  beforeEach(() => {
    mockSend.mockReset()
    mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null })
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('subject is "Þér hefur verið sent lánaboð á Teskeið"', async () => {
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT)
    const [payload] = mockSend.mock.calls[0]
    expect(payload.subject).toBe('Þér hefur verið sent lánaboð á Teskeið')
  })

  it('borrower context → html contains "lántakandinn"', async () => {
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, { recipientRole: 'borrower', templateVersion: 'v2', itemName: null, creatorDisplayName: null })
    const [payload] = mockSend.mock.calls[0]
    expect(payload.html).toContain('lántakandinn')
    expect(payload.html).not.toContain('lánveitandinn')
  })

  it('lender context → html contains "lánveitandinn"', async () => {
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, { recipientRole: 'lender', templateVersion: 'v2', itemName: null, creatorDisplayName: null })
    const [payload] = mockSend.mock.calls[0]
    expect(payload.html).toContain('lánveitandinn')
    expect(payload.html).not.toContain('lántakandinn')
  })

  it('recipient email is HTML-escaped in body', async () => {
    const tricky = 'a&b<c>d"e@example.com'
    await sendLoanInvitationEmail(tricky, INVITATION_ID, ATTEMPT, { recipientRole: 'borrower', templateVersion: 'v2', itemName: null, creatorDisplayName: null })
    const [payload] = mockSend.mock.calls[0]
    expect(payload.html).toContain('a&amp;b&lt;c&gt;d&quot;e@example.com')
    expect(payload.html).not.toContain('a&b<c>')
  })

  it('html contains claim link with invitation ID', async () => {
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, { recipientRole: 'borrower', templateVersion: 'v2', itemName: null, creatorDisplayName: null })
    const [payload] = mockSend.mock.calls[0]
    expect(payload.html).toContain(`/lanad-og-skilad/claim/${INVITATION_ID}`)
  })

  it('fallback (no context) uses generic text without role label', async () => {
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT)
    const [payload] = mockSend.mock.calls[0]
    expect(payload.html).not.toContain('lántakandinn')
    expect(payload.html).not.toContain('lánveitandinn')
    expect(payload.html).toContain('Skoða lánaboð')
  })

  it('fallback includes claim link even without context', async () => {
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT)
    const [payload] = mockSend.mock.calls[0]
    expect(payload.html).toContain(`/lanad-og-skilad/claim/${INVITATION_ID}`)
  })

  it('same args produce identical html on repeated calls (idempotency payload stability)', async () => {
    const ctx = { recipientRole: 'borrower' as const, templateVersion: 'v2' as const, itemName: null, creatorDisplayName: null }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    const html1 = mockSend.mock.calls[0][0].html
    const html2 = mockSend.mock.calls[1][0].html
    expect(html1).toBe(html2)
  })

  it('full v2 context with snapshots → html contains item name (HTML-escaped)', async () => {
    const ctx = { recipientRole: 'borrower' as const, templateVersion: 'v2' as const, itemName: 'Bók & taska', creatorDisplayName: 'Anna' }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    const [payload] = mockSend.mock.calls[0]
    expect(payload.html).toContain('Bók &amp; taska')
    expect(payload.html).toContain('Anna')
  })

  it('null creatorDisplayName → fallback creator text', async () => {
    const ctx = { recipientRole: 'borrower' as const, templateVersion: 'v2' as const, itemName: 'Bók', creatorDisplayName: null }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    const [payload] = mockSend.mock.calls[0]
    expect(payload.html).toContain('notanda á Teskeið')
  })

  it('full v2 context ×2 → identical Resend payload (snapshot stability)', async () => {
    const ctx = { recipientRole: 'lender' as const, templateVersion: 'v2' as const, itemName: 'Reiðhjól', creatorDisplayName: 'Jón' }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    expect(mockSend.mock.calls[0][0].html).toBe(mockSend.mock.calls[1][0].html)
    expect(mockSend.mock.calls[0][0].subject).toBe(mockSend.mock.calls[1][0].subject)
  })

  it('null-snapshot context ×2 → identical payload (v2 generic stability)', async () => {
    const ctx = { recipientRole: 'borrower' as const, templateVersion: 'v2' as const, itemName: null, creatorDisplayName: null }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    expect(mockSend.mock.calls[0][0].html).toBe(mockSend.mock.calls[1][0].html)
  })

  it('same args ×2 produce identical full Resend payload (from, to, subject, html, idempotencyKey)', async () => {
    const ctx = { recipientRole: 'borrower' as const, templateVersion: 'v2' as const, itemName: 'Reiðhjól', creatorDisplayName: 'Anna' }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    const [payload1, options1] = mockSend.mock.calls[0]
    const [payload2, options2] = mockSend.mock.calls[1]
    expect(payload1).toEqual(payload2)
    expect(options1).toEqual(options2)
  })
})

// ── sendLoanInvitationEmail — v3 template ────────────────────────────────────

describe('sendLoanInvitationEmail — v3 template', () => {
  const INVITATION_ID = 'inv-uuid-v3test'
  const ATTEMPT = 1
  const RECIPIENT = 'v3recipient@example.com'
  const CTX_V3_FULL = {
    recipientRole: 'borrower' as const,
    templateVersion: 'v3' as const,
    itemName: 'Reiðhjól',
    creatorDisplayName: 'Anna',
  }

  beforeEach(() => {
    mockSend.mockReset()
    mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null })
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('subject is "Nýr hlutur í „Lánað og skilað" á Teskeið.is"', async () => {
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, CTX_V3_FULL)
    expect(mockSend.mock.calls[0][0].subject).toBe(
      'Nýr hlutur í \u201ELánað og skilað\u201C á Teskeið.is',
    )
  })

  it('html contains no <a elements', async () => {
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, CTX_V3_FULL)
    const { html } = mockSend.mock.calls[0][0]
    expect(html).not.toContain('<a')
    expect(html).not.toContain('href=')
  })

  it('html contains no http or www. strings', async () => {
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, CTX_V3_FULL)
    const { html } = mockSend.mock.calls[0][0]
    expect(html).not.toContain('http')
    expect(html).not.toContain('www.')
  })

  it('html does not contain recipient email', async () => {
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, CTX_V3_FULL)
    expect(mockSend.mock.calls[0][0].html).not.toContain(RECIPIENT)
  })

  it('text does not contain recipient email', async () => {
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, CTX_V3_FULL)
    expect(mockSend.mock.calls[0][0].text).not.toContain(RECIPIENT)
  })

  it('text does not contain http or www. strings', async () => {
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, CTX_V3_FULL)
    const { text } = mockSend.mock.calls[0][0]
    expect(text).not.toContain('http')
    expect(text).not.toContain('www.')
  })

  it('text field is included in payload', async () => {
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, CTX_V3_FULL)
    const [payload] = mockSend.mock.calls[0]
    expect(typeof payload.text).toBe('string')
    expect(payload.text!.length).toBeGreaterThan(0)
  })

  it('html contains HTML-escaped itemName', async () => {
    const ctx = { ...CTX_V3_FULL, itemName: 'Bók & taska' }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    const { html } = mockSend.mock.calls[0][0]
    expect(html).toContain('Bók &amp; taska')
    expect(html).not.toContain('Bók & taska')
  })

  it('html contains HTML-escaped creatorDisplayName', async () => {
    const ctx = { ...CTX_V3_FULL, creatorDisplayName: 'A<B>"C' }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    const { html } = mockSend.mock.calls[0][0]
    expect(html).toContain('A&lt;B&gt;&quot;C')
    expect(html).not.toContain('A<B>')
  })

  it('null itemName → "Ekki tilgreint" in html and text', async () => {
    const ctx = { ...CTX_V3_FULL, itemName: null }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    const { html, text } = mockSend.mock.calls[0][0]
    expect(html).toContain('Ekki tilgreint')
    expect(text).toContain('Ekki tilgreint')
  })

  it('null creatorDisplayName → "Notanda á Teskeið" in html and text', async () => {
    const ctx = { ...CTX_V3_FULL, creatorDisplayName: null }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    const { html, text } = mockSend.mock.calls[0][0]
    expect(html).toContain('Notanda á Teskeið')
    expect(text).toContain('Notanda á Teskeið')
  })

  it('html contains itemName and creatorDisplayName', async () => {
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, CTX_V3_FULL)
    const { html } = mockSend.mock.calls[0][0]
    expect(html).toContain('Reiðhjól')
    expect(html).toContain('Anna')
  })

  it('text contains itemName and creatorDisplayName', async () => {
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, CTX_V3_FULL)
    const { text } = mockSend.mock.calls[0][0]
    expect(text).toContain('Reiðhjól')
    expect(text).toContain('Anna')
  })

  it('same args ×2 → identical html and text (payload stability)', async () => {
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, CTX_V3_FULL)
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, CTX_V3_FULL)
    expect(mockSend.mock.calls[0][0].html).toBe(mockSend.mock.calls[1][0].html)
    expect(mockSend.mock.calls[0][0].text).toBe(mockSend.mock.calls[1][0].text)
    expect(mockSend.mock.calls[0][0].subject).toBe(mockSend.mock.calls[1][0].subject)
  })

  it('v2 payload is unaffected: still contains claim link, role label, and no text field', async () => {
    const ctxV2 = {
      recipientRole: 'borrower' as const,
      templateVersion: 'v2' as const,
      itemName: 'Bók',
      creatorDisplayName: 'Anna',
    }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctxV2)
    const [payload] = mockSend.mock.calls[0]
    expect(payload.html).toContain('<a href=')
    expect(payload.html).toContain('lántakandinn')
    expect(payload.html).toContain('Skoða lánaboð')
    expect(payload.text).toBeUndefined()
  })

  it('v2 subject is unchanged', async () => {
    const ctxV2 = {
      recipientRole: 'borrower' as const,
      templateVersion: 'v2' as const,
      itemName: null,
      creatorDisplayName: null,
    }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctxV2)
    expect(mockSend.mock.calls[0][0].subject).toBe('Þér hefur verið sent lánaboð á Teskeið')
  })

  it('v2 full snapshot — exact Resend payload is byte-for-byte stable', async () => {
    // Use vi.resetModules() + dynamic import so module-level constants
    // (SITE_URL, DEFAULT_FROM) are evaluated with known env state, making
    // this test deterministic regardless of .env.local or CI environment.
    const savedFrom = process.env.EMAIL_FROM
    const savedSiteUrl = process.env.NEXT_PUBLIC_SITE_URL
    try {
      delete process.env.EMAIL_FROM
      delete process.env.NEXT_PUBLIC_SITE_URL
      vi.resetModules()
      const { sendLoanInvitationEmail: sendFresh } =
        await import('@/lib/loans/email')
      mockSend.mockReset()
      mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null })
      process.env.RESEND_API_KEY = 'test-key'

      const ctxV2 = {
        recipientRole: 'borrower' as const,
        templateVersion: 'v2' as const,
        itemName: 'Bók',
        creatorDisplayName: 'Anna',
      }
      await sendFresh(RECIPIENT, INVITATION_ID, ATTEMPT, ctxV2)
      const [payload, options] = mockSend.mock.calls[0]

      const expectedHtml = [
        '<p>Samkvæmt skráningunni á Teskeið ert þú lántakandinn fyrir hlutinn <strong>Bók</strong>.</p>',
        '<p>Lánaboðið er frá Anna.</p>',
        `<p>Boðið var sent á ${RECIPIENT}. Skráðu þig inn á Teskeið með sama netfangi til að samþykkja eða hafna boðinu.</p>`,
        `<p><a href="https://teskeid.is/auth-mvp/lanad-og-skilad/claim/${INVITATION_ID}">Skoða lánaboð</a></p>`,
        '<p>Teskeið</p>',
      ].join('\n')

      expect(payload).toEqual({
        from: 'Teskeið <teskeid@mail.gottvibe.is>',
        to: RECIPIENT,
        subject: 'Þér hefur verið sent lánaboð á Teskeið',
        html: expectedHtml,
      })
      expect(payload.text).toBeUndefined()
      expect(options).toEqual({ idempotencyKey: `loan-invitation/${INVITATION_ID}/${ATTEMPT}` })
    } finally {
      if (savedFrom !== undefined) process.env.EMAIL_FROM = savedFrom
      else delete process.env.EMAIL_FROM
      if (savedSiteUrl !== undefined) process.env.NEXT_PUBLIC_SITE_URL = savedSiteUrl
      else delete process.env.NEXT_PUBLIC_SITE_URL
      vi.resetModules()
    }
  })
})

// ── sendLoanInvitationEmail — v3 auto-link prevention ────────────────────────

describe('sendLoanInvitationEmail — v3 auto-link prevention', () => {
  const INVITATION_ID = 'inv-uuid-autolink'
  const ATTEMPT = 1
  const RECIPIENT = 'autolink@example.com'
  const BASE_CTX = {
    recipientRole: 'borrower' as const,
    templateVersion: 'v3' as const,
    itemName: 'Venjulegt nafn',
    creatorDisplayName: 'Venjulegt nafn',
  }

  beforeEach(() => {
    mockSend.mockReset()
    mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null })
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('https:// URL in itemName is not auto-linkable in html or text', async () => {
    const ctx = { ...BASE_CTX, itemName: 'https://example.com' }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    const { html, text } = mockSend.mock.calls[0][0]
    expect(html).not.toContain('https://')
    expect(html).not.toContain('https://example.com')
    expect(text).not.toContain('https://')
    expect(text).not.toContain('https://example.com')
  })

  it('www. domain in itemName is not auto-linkable in html or text', async () => {
    const ctx = { ...BASE_CTX, itemName: 'www.example.com' }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    const { html, text } = mockSend.mock.calls[0][0]
    expect(html).not.toContain('www.example.com')
    expect(html).not.toContain('www.')
    expect(text).not.toContain('www.example.com')
    expect(text).not.toContain('www.')
  })

  it('email address in creatorDisplayName is not auto-linkable in html or text', async () => {
    const ctx = { ...BASE_CTX, creatorDisplayName: 'anna@example.com' }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    const { html, text } = mockSend.mock.calls[0][0]
    expect(html).not.toContain('anna@example.com')
    expect(text).not.toContain('anna@example.com')
  })

  it('normal name without URL or @ is preserved unchanged in html', async () => {
    const ctx = { ...BASE_CTX, itemName: 'Fínn reiðhjólshjálmur', creatorDisplayName: 'Gunnar Sigurðsson' }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    const { html } = mockSend.mock.calls[0][0]
    expect(html).toContain('Fínn reiðhjólshjálmur')
    expect(html).toContain('Gunnar Sigurðsson')
  })

  it('bare domain (example.com) in itemName is not auto-linkable in html or text', async () => {
    const ctx = { ...BASE_CTX, itemName: 'example.com' }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    const { html, text } = mockSend.mock.calls[0][0]
    expect(html).not.toContain('example.com')
    expect(text).not.toContain('example.com')
  })

  it('subdomain (sub.example.is) in itemName is not auto-linkable in html or text', async () => {
    const ctx = { ...BASE_CTX, itemName: 'sub.example.is' }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    const { html, text } = mockSend.mock.calls[0][0]
    expect(html).not.toContain('sub.example.is')
    expect(text).not.toContain('sub.example.is')
  })

  it('IP address (192.168.1.1) in itemName is not auto-linkable in html or text', async () => {
    const ctx = { ...BASE_CTX, itemName: '192.168.1.1' }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctx)
    const { html, text } = mockSend.mock.calls[0][0]
    expect(html).not.toContain('192.168.1.1')
    expect(text).not.toContain('192.168.1.1')
  })

  it('auto-link prevention is not applied to v2 (v2 unchanged)', async () => {
    // v2 does not call preventAutoLink; an @ in the recipient email must appear verbatim
    const ctxV2 = {
      recipientRole: 'borrower' as const,
      templateVersion: 'v2' as const,
      itemName: null,
      creatorDisplayName: null,
    }
    await sendLoanInvitationEmail(RECIPIENT, INVITATION_ID, ATTEMPT, ctxV2)
    const { html } = mockSend.mock.calls[0][0]
    // v2 embeds recipient email directly — no ZWS
    expect(html).toContain(RECIPIENT)
  })
})

// ── Manual / integration test plan (not runnable in unit test environment) ──

describe.skip('sendLoanInvitationEmail — integration (requires real Resend credentials)', () => {
  it('sends an email to a real address and returns "sent"')
  it('returns "failed" for a known-invalid email address with real Resend API')
  it('idempotent: sending same invitation_id/attempt_number twice returns "sent" both times')
})
