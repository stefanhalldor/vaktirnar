/**
 * Unit tests for lib/loans/guard.ts — guardLoanAccess feature flag checks.
 *
 * redirect() from next/navigation throws in the real Next.js runtime.
 * The mock replicates this so tests that expect a redirect see a rejection,
 * and tests that expect success see no throw.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn().mockImplementation((path: string): never => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  }),
}))

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))
const { mockIsAllowedEmail } = vi.hoisted(() => ({ mockIsAllowedEmail: vi.fn() }))

vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))
vi.mock('@/lib/auth/allowlist', () => ({
  isAuthMvpAllowedEmail: mockIsAllowedEmail,
}))

import { guardLoanAccess } from '@/lib/loans/guard'

// ── Env helpers ───────────────────────────────────────────────────────────────

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('guardLoanAccess — feature flags', () => {
  let savedAuthMvp: string | undefined
  let savedLoans: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedAuthMvp = process.env.AUTH_MVP_ENABLED
    savedLoans   = process.env.LOANS_ENABLED
    process.env.AUTH_MVP_ENABLED = 'true'
    process.env.LOANS_ENABLED    = 'true'
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'user@example.com' } },
    })
    mockIsAllowedEmail.mockResolvedValue(true)
  })

  afterEach(() => {
    setEnv('AUTH_MVP_ENABLED', savedAuthMvp)
    setEnv('LOANS_ENABLED',    savedLoans)
  })

  it('redirects to / when LOANS_ENABLED is absent', async () => {
    delete process.env.LOANS_ENABLED
    await expect(guardLoanAccess()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(mockIsAllowedEmail).not.toHaveBeenCalled()
  })

  it('redirects to / when LOANS_ENABLED=false', async () => {
    process.env.LOANS_ENABLED = 'false'
    await expect(guardLoanAccess()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('redirects to / when AUTH_MVP_ENABLED=false', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    await expect(guardLoanAccess()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('redirects to / when both flags are false', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    process.env.LOANS_ENABLED    = 'false'
    await expect(guardLoanAccess()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('proceeds to session and allowlist checks when both flags are true', async () => {
    const result = await guardLoanAccess()
    expect(mockRedirect).not.toHaveBeenCalled()
    expect(mockGetUser).toHaveBeenCalled()
    expect(mockIsAllowedEmail).toHaveBeenCalledWith('user@example.com')
    expect(result).toEqual({ user: { id: 'u1', email: 'user@example.com' } })
  })
})
