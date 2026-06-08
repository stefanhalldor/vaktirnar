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

import { guardTeskeidAccess, guardTeskeidSession } from '@/lib/auth/guard'
import { guardLoanAccess, checkFeatureAccess, guardFeatureAccess } from '@/lib/loans/guard'

// ── Env helpers ───────────────────────────────────────────────────────────────

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// ── guardTeskeidAccess ────────────────────────────────────────────────────────

describe('guardTeskeidAccess — feature flag', () => {
  let savedAuth: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedAuth = process.env.AUTH_MVP_ENABLED
    process.env.LOANS_ENABLED = 'true'
  })

  afterEach(() => {
    setEnv('AUTH_MVP_ENABLED', savedAuth)
  })

  it('redirects to / without calling Supabase when AUTH_MVP_ENABLED is not true', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    await expect(guardTeskeidAccess()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('redirects to / when AUTH_MVP_ENABLED is absent', async () => {
    delete process.env.AUTH_MVP_ENABLED
    await expect(guardTeskeidAccess()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockGetUser).not.toHaveBeenCalled()
  })
})

describe('guardTeskeidAccess — session and allowlist', () => {
  let savedAuth: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedAuth = process.env.AUTH_MVP_ENABLED
    process.env.AUTH_MVP_ENABLED = 'true'
  })

  afterEach(() => {
    setEnv('AUTH_MVP_ENABLED', savedAuth)
  })

  it('redirects to /innskraning when there is no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(guardTeskeidAccess()).rejects.toThrow('NEXT_REDIRECT:/innskraning')
  })

  it('redirects to / when email is not on the allowlist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'x@example.com' } } })
    mockIsAllowedEmail.mockResolvedValue(false)
    await expect(guardTeskeidAccess()).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('returns user when all checks pass', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'user@example.com' } } })
    mockIsAllowedEmail.mockResolvedValue(true)
    const result = await guardTeskeidAccess()
    expect(result).toEqual({ user: { id: 'u1', email: 'user@example.com' } })
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('lowercases and trims email before allowlist check', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: '  USER@EXAMPLE.COM  ' } } })
    mockIsAllowedEmail.mockResolvedValue(true)
    await guardTeskeidAccess()
    expect(mockIsAllowedEmail).toHaveBeenCalledWith('user@example.com')
  })
})

// ── guardTeskeidSession ───────────────────────────────────────────────────────

describe('guardTeskeidSession — feature flag', () => {
  let savedAuth: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedAuth = process.env.AUTH_MVP_ENABLED
  })

  afterEach(() => {
    setEnv('AUTH_MVP_ENABLED', savedAuth)
  })

  it('redirects to / without calling Supabase when AUTH_MVP_ENABLED is not true', async () => {
    process.env.AUTH_MVP_ENABLED = 'false'
    await expect(guardTeskeidSession()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('redirects to /innskraning when there is no session', async () => {
    process.env.AUTH_MVP_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(guardTeskeidSession()).rejects.toThrow('NEXT_REDIRECT:/innskraning')
  })

  it('returns user regardless of allowlist when session is valid', async () => {
    process.env.AUTH_MVP_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'anyone@example.com' } } })
    const result = await guardTeskeidSession()
    expect(result).toEqual({ user: { id: 'u1', email: 'anyone@example.com' } })
    expect(mockIsAllowedEmail).not.toHaveBeenCalled()
  })
})

// ── checkFeatureAccess ────────────────────────────────────────────────────────

describe('checkFeatureAccess', () => {
  let savedLoans: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedLoans = process.env.LOANS_ENABLED
    process.env.LOANS_ENABLED = 'true'
  })

  afterEach(() => {
    setEnv('LOANS_ENABLED', savedLoans)
  })

  it('returns false for unknown feature key', async () => {
    mockIsAllowedEmail.mockResolvedValue(true)
    const result = await checkFeatureAccess('uid', 'user@example.com', 'unknown-feature')
    expect(result).toBe(false)
    expect(mockIsAllowedEmail).not.toHaveBeenCalled()
  })

  it('returns false when LOANS_ENABLED is not true', async () => {
    process.env.LOANS_ENABLED = 'false'
    const result = await checkFeatureAccess('uid', 'user@example.com', 'lanad-og-skilad')
    expect(result).toBe(false)
    expect(mockIsAllowedEmail).not.toHaveBeenCalled()
  })

  it('returns false when email is not on allowlist', async () => {
    mockIsAllowedEmail.mockResolvedValue(false)
    const result = await checkFeatureAccess('uid', 'user@example.com', 'lanad-og-skilad')
    expect(result).toBe(false)
  })

  it('returns true when LOANS_ENABLED and email is on allowlist', async () => {
    mockIsAllowedEmail.mockResolvedValue(true)
    const result = await checkFeatureAccess('uid', 'user@example.com', 'lanad-og-skilad')
    expect(result).toBe(true)
  })

  it('returns false (fail-closed) when allowlist lookup throws', async () => {
    mockIsAllowedEmail.mockRejectedValue(new Error('db error'))
    const result = await checkFeatureAccess('uid', 'user@example.com', 'lanad-og-skilad')
    expect(result).toBe(false)
  })

  it('lowercases and trims email before allowlist check', async () => {
    mockIsAllowedEmail.mockResolvedValue(true)
    await checkFeatureAccess('uid', '  USER@EXAMPLE.COM  ', 'lanad-og-skilad')
    expect(mockIsAllowedEmail).toHaveBeenCalledWith('user@example.com')
  })
})

// ── guardFeatureAccess ────────────────────────────────────────────────────────

describe('guardFeatureAccess', () => {
  let savedLoans: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedLoans = process.env.LOANS_ENABLED
    process.env.LOANS_ENABLED = 'true'
  })

  afterEach(() => {
    setEnv('LOANS_ENABLED', savedLoans)
  })

  it('redirects to / when LOANS_ENABLED is false', async () => {
    process.env.LOANS_ENABLED = 'false'
    await expect(guardFeatureAccess('user@example.com', 'lanad-og-skilad')).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('redirects to / when email is not on allowlist', async () => {
    mockIsAllowedEmail.mockResolvedValue(false)
    await expect(guardFeatureAccess('user@example.com', 'lanad-og-skilad')).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('does not redirect when access is granted', async () => {
    mockIsAllowedEmail.mockResolvedValue(true)
    await expect(guardFeatureAccess('user@example.com', 'lanad-og-skilad')).resolves.toBeUndefined()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})

// ── guardLoanAccess ───────────────────────────────────────────────────────────

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
