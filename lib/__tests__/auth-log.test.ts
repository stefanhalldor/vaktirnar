/**
 * Phase A regression tests: production logs must not contain email, OTP, or Supabase error tokens.
 *
 * Covers:
 *  - lib/auth/email.ts  — missing RESEND_API_KEY log
 *  - lib/auth/session.ts — all createAdminSession / createUserSession error logs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const { mockCreateUser, mockGenerateLink, mockVerifyOtp } = vi.hoisted(() => ({
  mockCreateUser: vi.fn(),
  mockGenerateLink: vi.fn(),
  mockVerifyOtp: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({}))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({
    auth: {
      admin: {
        createUser: mockCreateUser,
        generateLink: mockGenerateLink,
      },
    },
  })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { verifyOtp: mockVerifyOtp },
  })),
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }) }
  },
}))

import { createUserSession, createAdminSession } from '@/lib/auth/session'
import { sendLoginCode } from '@/lib/auth/email'

// ── Helpers ────────────────────────────────────────────────────────────────────

const TEST_EMAIL = 'user@example.com'
const TEST_TOKEN = 'super-secret-token-abc123'

function captureConsoleLogs() {
  const calls: unknown[][] = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    calls.push(args)
  })
  return { calls, restore: () => spy.mockRestore() }
}

// ── lib/auth/email.ts ──────────────────────────────────────────────────────────

describe('lib/auth/email — no PII in production error log', () => {
  let savedKey: string | undefined

  beforeEach(() => {
    savedKey = process.env.RESEND_API_KEY
    delete process.env.RESEND_API_KEY
  })

  afterEach(() => {
    if (savedKey !== undefined) process.env.RESEND_API_KEY = savedKey
    else delete process.env.RESEND_API_KEY
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('missing RESEND_API_KEY in production: error log does not contain recipient email', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { calls, restore } = captureConsoleLogs()

    await sendLoginCode(TEST_EMAIL, '123456')

    restore()
    const allOutput = calls.flat().join(' ')
    expect(allOutput).not.toContain(TEST_EMAIL)
    expect(allOutput).not.toContain('123456')
  })
})

// ── lib/auth/session.ts — createUserSession ────────────────────────────────────

describe('createUserSession — error logs contain no email or token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: createUser succeeds
    mockCreateUser.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('createUser failure: log does not contain email', async () => {
    mockCreateUser.mockResolvedValue({
      error: { message: `User ${TEST_EMAIL} already exists or something`, code: 'email_exists' },
    })
    const { calls, restore } = captureConsoleLogs()

    await createUserSession(TEST_EMAIL)

    restore()
    const allOutput = calls.flat().join(' ')
    expect(allOutput).not.toContain(TEST_EMAIL)
  })

  it('generateLink failure: log does not contain email or token', async () => {
    mockCreateUser.mockResolvedValue({ error: null })
    mockGenerateLink.mockResolvedValue({
      data: null,
      error: { message: `Failed for ${TEST_EMAIL} with token=${TEST_TOKEN}` },
    })
    const { calls, restore } = captureConsoleLogs()

    await createUserSession(TEST_EMAIL)

    restore()
    const allOutput = calls.flat().join(' ')
    expect(allOutput).not.toContain(TEST_EMAIL)
    expect(allOutput).not.toContain(TEST_TOKEN)
  })

  it('verifyOtp failure: log does not contain token', async () => {
    mockCreateUser.mockResolvedValue({ error: null })
    mockGenerateLink.mockResolvedValue({
      data: { properties: { hashed_token: TEST_TOKEN } },
      error: null,
    })
    mockVerifyOtp.mockResolvedValue({
      error: { message: `OTP ${TEST_TOKEN} invalid for ${TEST_EMAIL}` },
    })
    const { calls, restore } = captureConsoleLogs()

    await createUserSession(TEST_EMAIL)

    restore()
    const allOutput = calls.flat().join(' ')
    expect(allOutput).not.toContain(TEST_EMAIL)
    expect(allOutput).not.toContain(TEST_TOKEN)
  })
})

// ── lib/auth/session.ts — createAdminSession ──────────────────────────────────

describe('createAdminSession — error logs contain no email or token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateUser.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('createUser failure: log does not contain email', async () => {
    mockCreateUser.mockResolvedValue({
      error: { message: `User ${TEST_EMAIL} conflict` },
    })
    const { calls, restore } = captureConsoleLogs()

    await createAdminSession(TEST_EMAIL)

    restore()
    expect(calls.flat().join(' ')).not.toContain(TEST_EMAIL)
  })

  it('generateLink failure: log does not contain email or token', async () => {
    mockCreateUser.mockResolvedValue({ error: null })
    mockGenerateLink.mockResolvedValue({
      data: null,
      error: { message: `Link error for ${TEST_EMAIL} token=${TEST_TOKEN}` },
    })
    const { calls, restore } = captureConsoleLogs()

    await createAdminSession(TEST_EMAIL)

    restore()
    const out = calls.flat().join(' ')
    expect(out).not.toContain(TEST_EMAIL)
    expect(out).not.toContain(TEST_TOKEN)
  })

  it('verifyOtp failure: log does not contain token', async () => {
    mockCreateUser.mockResolvedValue({ error: null })
    mockGenerateLink.mockResolvedValue({
      data: { properties: { hashed_token: TEST_TOKEN } },
      error: null,
    })
    mockVerifyOtp.mockResolvedValue({
      error: { message: `Invalid OTP ${TEST_TOKEN} for email ${TEST_EMAIL}` },
    })
    const { calls, restore } = captureConsoleLogs()

    await createAdminSession(TEST_EMAIL)

    restore()
    const out = calls.flat().join(' ')
    expect(out).not.toContain(TEST_EMAIL)
    expect(out).not.toContain(TEST_TOKEN)
  })
})
