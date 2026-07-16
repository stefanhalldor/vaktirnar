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
const { mockFeatureAccessQuery } = vi.hoisted(() => ({ mockFeatureAccessQuery: vi.fn() }))

vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))
vi.mock('@/lib/auth/allowlist', () => ({
  isAuthMvpAllowedEmail: mockIsAllowedEmail,
}))
vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: mockFeatureAccessQuery,
          })),
        })),
      })),
    })),
  })),
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

  it('returns true when LOANS_ENABLED=true for lanad-og-skilad', async () => {
    const result = await checkFeatureAccess('uid', 'user@example.com', 'lanad-og-skilad')
    expect(result).toBe(true)
    expect(mockIsAllowedEmail).not.toHaveBeenCalled()
  })

  it('returns false when LOANS_ENABLED is absent', async () => {
    delete process.env.LOANS_ENABLED
    const result = await checkFeatureAccess('uid', 'user@example.com', 'lanad-og-skilad')
    expect(result).toBe(false)
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

  it('does not redirect when LOANS_ENABLED=true', async () => {
    await expect(guardFeatureAccess('user@example.com', 'lanad-og-skilad')).resolves.toBeUndefined()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})

// ── checkFeatureAccess — umonnun ──────────────────────────────────────────────

describe('checkFeatureAccess — umonnun (global kill-switch)', () => {
  let savedEnabled: string | undefined
  let savedFlag: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedEnabled = process.env.UMONNUN_ENABLED
    savedFlag = process.env.UMONNUN_FLAG
  })

  afterEach(() => {
    setEnv('UMONNUN_ENABLED', savedEnabled)
    setEnv('UMONNUN_FLAG', savedFlag)
  })

  it('returns false when UMONNUN_ENABLED is not set', async () => {
    delete process.env.UMONNUN_ENABLED
    delete process.env.UMONNUN_FLAG
    expect(await checkFeatureAccess('uid', 'user@example.com', 'umonnun')).toBe(false)
  })

  it('returns false when UMONNUN_ENABLED=false', async () => {
    process.env.UMONNUN_ENABLED = 'false'
    delete process.env.UMONNUN_FLAG
    expect(await checkFeatureAccess('uid', 'user@example.com', 'umonnun')).toBe(false)
  })

  it('returns true when UMONNUN_ENABLED=true and FLAG unset (open to all)', async () => {
    process.env.UMONNUN_ENABLED = 'true'
    delete process.env.UMONNUN_FLAG
    expect(await checkFeatureAccess('uid', 'user@example.com', 'umonnun')).toBe(true)
  })

  it('returns true when UMONNUN_ENABLED=true and FLAG=false (open to all)', async () => {
    process.env.UMONNUN_ENABLED = 'true'
    process.env.UMONNUN_FLAG = 'false'
    expect(await checkFeatureAccess('uid', 'user@example.com', 'umonnun')).toBe(true)
  })
})

describe('checkFeatureAccess — umonnun (per-user FLAG=true)', () => {
  let savedEnabled: string | undefined
  let savedFlag: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedEnabled = process.env.UMONNUN_ENABLED
    savedFlag = process.env.UMONNUN_FLAG
    process.env.UMONNUN_ENABLED = 'true'
    process.env.UMONNUN_FLAG = 'true'
  })

  afterEach(() => {
    setEnv('UMONNUN_ENABLED', savedEnabled)
    setEnv('UMONNUN_FLAG', savedFlag)
  })

  it('returns true when row exists in feature_access', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: { email: 'user@example.com' }, error: null })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'umonnun')).toBe(true)
  })

  it('returns false when no row in feature_access', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: null })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'umonnun')).toBe(false)
  })

  it('returns false when DB query returns an error (fail-closed)', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: { message: 'connection refused' } })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'umonnun')).toBe(false)
  })

  it('returns false for invalid email', async () => {
    expect(await checkFeatureAccess('uid', 'not-an-email', 'umonnun')).toBe(false)
    expect(mockFeatureAccessQuery).not.toHaveBeenCalled()
  })

  it('normalizes Gmail dots before DB lookup', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: { email: 'arielpetur@gmail.com' }, error: null })
    // dotted form should resolve to same canonical email
    expect(await checkFeatureAccess('uid', 'ariel.petur@gmail.com', 'umonnun')).toBe(true)
  })

  it('returns false when query throws an exception (fail-closed)', async () => {
    mockFeatureAccessQuery.mockRejectedValue(new Error('DB connection error'))
    expect(await checkFeatureAccess('uid', 'user@example.com', 'umonnun')).toBe(false)
  })
})

// ── guardFeatureAccess — umonnun ──────────────────────────────────────────────

describe('guardFeatureAccess — umonnun', () => {
  let savedEnabled: string | undefined
  let savedFlag: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedEnabled = process.env.UMONNUN_ENABLED
    savedFlag = process.env.UMONNUN_FLAG
  })

  afterEach(() => {
    setEnv('UMONNUN_ENABLED', savedEnabled)
    setEnv('UMONNUN_FLAG', savedFlag)
  })

  it('redirects to / when UMONNUN_ENABLED is not set', async () => {
    delete process.env.UMONNUN_ENABLED
    delete process.env.UMONNUN_FLAG
    await expect(guardFeatureAccess('user@example.com', 'umonnun')).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('redirects to / when UMONNUN_ENABLED=false', async () => {
    process.env.UMONNUN_ENABLED = 'false'
    delete process.env.UMONNUN_FLAG
    await expect(guardFeatureAccess('user@example.com', 'umonnun')).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('does not redirect when UMONNUN_ENABLED=true and FLAG unset', async () => {
    process.env.UMONNUN_ENABLED = 'true'
    delete process.env.UMONNUN_FLAG
    await expect(guardFeatureAccess('user@example.com', 'umonnun')).resolves.toBeUndefined()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects when FLAG=true and user not in feature_access', async () => {
    process.env.UMONNUN_ENABLED = 'true'
    process.env.UMONNUN_FLAG = 'true'
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: null })
    await expect(guardFeatureAccess('user@example.com', 'umonnun')).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('does not redirect when FLAG=true and user is in feature_access', async () => {
    process.env.UMONNUN_ENABLED = 'true'
    process.env.UMONNUN_FLAG = 'true'
    mockFeatureAccessQuery.mockResolvedValue({ data: { email: 'user@example.com' }, error: null })
    await expect(guardFeatureAccess('user@example.com', 'umonnun')).resolves.toBeUndefined()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})

// ── checkFeatureAccess — facebook-oauth ───────────────────────────────────────

describe('checkFeatureAccess — facebook-oauth (global kill-switch)', () => {
  let savedEnabled: string | undefined
  let savedFlag: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedEnabled = process.env.FACEBOOK_OAUTH_ENABLED
    savedFlag = process.env.FACEBOOK_OAUTH_FLAG
  })

  afterEach(() => {
    setEnv('FACEBOOK_OAUTH_ENABLED', savedEnabled)
    setEnv('FACEBOOK_OAUTH_FLAG', savedFlag)
  })

  it('returns false when FACEBOOK_OAUTH_ENABLED is not set', async () => {
    delete process.env.FACEBOOK_OAUTH_ENABLED
    delete process.env.FACEBOOK_OAUTH_FLAG
    expect(await checkFeatureAccess('uid', 'user@example.com', 'facebook-oauth')).toBe(false)
  })

  it('returns false when FACEBOOK_OAUTH_ENABLED=false', async () => {
    process.env.FACEBOOK_OAUTH_ENABLED = 'false'
    delete process.env.FACEBOOK_OAUTH_FLAG
    expect(await checkFeatureAccess('uid', 'user@example.com', 'facebook-oauth')).toBe(false)
  })

  it('returns true when FACEBOOK_OAUTH_ENABLED=true and FLAG unset (open to all)', async () => {
    process.env.FACEBOOK_OAUTH_ENABLED = 'true'
    delete process.env.FACEBOOK_OAUTH_FLAG
    expect(await checkFeatureAccess('uid', 'user@example.com', 'facebook-oauth')).toBe(true)
  })

  it('returns true when FACEBOOK_OAUTH_ENABLED=true and FLAG=false (open to all)', async () => {
    process.env.FACEBOOK_OAUTH_ENABLED = 'true'
    process.env.FACEBOOK_OAUTH_FLAG = 'false'
    expect(await checkFeatureAccess('uid', 'user@example.com', 'facebook-oauth')).toBe(true)
  })
})

describe('checkFeatureAccess — facebook-oauth (per-user FLAG=true)', () => {
  let savedEnabled: string | undefined
  let savedFlag: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedEnabled = process.env.FACEBOOK_OAUTH_ENABLED
    savedFlag = process.env.FACEBOOK_OAUTH_FLAG
    process.env.FACEBOOK_OAUTH_ENABLED = 'true'
    process.env.FACEBOOK_OAUTH_FLAG = 'true'
  })

  afterEach(() => {
    setEnv('FACEBOOK_OAUTH_ENABLED', savedEnabled)
    setEnv('FACEBOOK_OAUTH_FLAG', savedFlag)
  })

  it('returns true when row exists in feature_access', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: { email: 'user@example.com' }, error: null })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'facebook-oauth')).toBe(true)
  })

  it('returns false when no row in feature_access', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: null })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'facebook-oauth')).toBe(false)
  })

  it('returns false when DB query returns an error (fail-closed)', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: { message: 'connection refused' } })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'facebook-oauth')).toBe(false)
  })

  it('returns false for invalid email', async () => {
    expect(await checkFeatureAccess('uid', 'not-an-email', 'facebook-oauth')).toBe(false)
    expect(mockFeatureAccessQuery).not.toHaveBeenCalled()
  })

  it('returns false when query throws an exception (fail-closed)', async () => {
    mockFeatureAccessQuery.mockRejectedValue(new Error('DB connection error'))
    expect(await checkFeatureAccess('uid', 'user@example.com', 'facebook-oauth')).toBe(false)
  })
})

// ── guardFeatureAccess — facebook-oauth ───────────────────────────────────────

describe('guardFeatureAccess — facebook-oauth', () => {
  let savedEnabled: string | undefined
  let savedFlag: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedEnabled = process.env.FACEBOOK_OAUTH_ENABLED
    savedFlag = process.env.FACEBOOK_OAUTH_FLAG
  })

  afterEach(() => {
    setEnv('FACEBOOK_OAUTH_ENABLED', savedEnabled)
    setEnv('FACEBOOK_OAUTH_FLAG', savedFlag)
  })

  it('redirects to / when FACEBOOK_OAUTH_ENABLED is not set', async () => {
    delete process.env.FACEBOOK_OAUTH_ENABLED
    delete process.env.FACEBOOK_OAUTH_FLAG
    await expect(guardFeatureAccess('user@example.com', 'facebook-oauth')).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('redirects to / when FACEBOOK_OAUTH_ENABLED=false', async () => {
    process.env.FACEBOOK_OAUTH_ENABLED = 'false'
    delete process.env.FACEBOOK_OAUTH_FLAG
    await expect(guardFeatureAccess('user@example.com', 'facebook-oauth')).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('does not redirect when FACEBOOK_OAUTH_ENABLED=true and FLAG unset', async () => {
    process.env.FACEBOOK_OAUTH_ENABLED = 'true'
    delete process.env.FACEBOOK_OAUTH_FLAG
    await expect(guardFeatureAccess('user@example.com', 'facebook-oauth')).resolves.toBeUndefined()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects when FLAG=true and user not in feature_access', async () => {
    process.env.FACEBOOK_OAUTH_ENABLED = 'true'
    process.env.FACEBOOK_OAUTH_FLAG = 'true'
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: null })
    await expect(guardFeatureAccess('user@example.com', 'facebook-oauth')).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('does not redirect when FLAG=true and user is in feature_access', async () => {
    process.env.FACEBOOK_OAUTH_ENABLED = 'true'
    process.env.FACEBOOK_OAUTH_FLAG = 'true'
    mockFeatureAccessQuery.mockResolvedValue({ data: { email: 'user@example.com' }, error: null })
    await expect(guardFeatureAccess('user@example.com', 'facebook-oauth')).resolves.toBeUndefined()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})

// ── checkFeatureAccess — vedrid ───────────────────────────────────────────────

describe('checkFeatureAccess — vedrid (global kill-switch)', () => {
  let savedEnabled: string | undefined
  let savedFlag: string | undefined
  let savedAccessRequired: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedEnabled = process.env.WEATHER_ENABLED
    savedFlag = process.env.WEATHER_FLAG
    savedAccessRequired = process.env.WEATHER_AUTH_ACCESS_REQUIRED
  })

  afterEach(() => {
    setEnv('WEATHER_ENABLED', savedEnabled)
    setEnv('WEATHER_FLAG', savedFlag)
    setEnv('WEATHER_AUTH_ACCESS_REQUIRED', savedAccessRequired)
  })

  it('returns false when WEATHER_ENABLED is not set', async () => {
    delete process.env.WEATHER_ENABLED
    delete process.env.WEATHER_FLAG
    delete process.env.WEATHER_AUTH_ACCESS_REQUIRED
    expect(await checkFeatureAccess('uid', 'user@example.com', 'vedrid')).toBe(false)
  })

  it('returns false when WEATHER_ENABLED=false', async () => {
    process.env.WEATHER_ENABLED = 'false'
    delete process.env.WEATHER_FLAG
    delete process.env.WEATHER_AUTH_ACCESS_REQUIRED
    expect(await checkFeatureAccess('uid', 'user@example.com', 'vedrid')).toBe(false)
  })

  it('returns true when WEATHER_ENABLED=true and neither access flag set (open to all)', async () => {
    process.env.WEATHER_ENABLED = 'true'
    delete process.env.WEATHER_FLAG
    delete process.env.WEATHER_AUTH_ACCESS_REQUIRED
    expect(await checkFeatureAccess('uid', 'user@example.com', 'vedrid')).toBe(true)
  })

  it('passes kill-switch when WEATHER_ENABLED=All and no access flag set (open to all)', async () => {
    process.env.WEATHER_ENABLED = 'All'
    delete process.env.WEATHER_FLAG
    delete process.env.WEATHER_AUTH_ACCESS_REQUIRED
    expect(await checkFeatureAccess('uid', 'user@example.com', 'vedrid')).toBe(true)
  })

  it('passes kill-switch when WEATHER_ENABLED=Authenticated and no access flag set (open to all)', async () => {
    process.env.WEATHER_ENABLED = 'Authenticated'
    delete process.env.WEATHER_FLAG
    delete process.env.WEATHER_AUTH_ACCESS_REQUIRED
    expect(await checkFeatureAccess('uid', 'user@example.com', 'vedrid')).toBe(true)
  })

  it('returns true when WEATHER_ENABLED=true and legacy WEATHER_FLAG=false (open to all)', async () => {
    process.env.WEATHER_ENABLED = 'true'
    process.env.WEATHER_FLAG = 'false'
    delete process.env.WEATHER_AUTH_ACCESS_REQUIRED
    expect(await checkFeatureAccess('uid', 'user@example.com', 'vedrid')).toBe(true)
  })

  it('returns true when WEATHER_ENABLED=true and WEATHER_AUTH_ACCESS_REQUIRED=false (open to all)', async () => {
    process.env.WEATHER_ENABLED = 'true'
    process.env.WEATHER_AUTH_ACCESS_REQUIRED = 'false'
    delete process.env.WEATHER_FLAG
    expect(await checkFeatureAccess('uid', 'user@example.com', 'vedrid')).toBe(true)
  })

  it('new WEATHER_AUTH_ACCESS_REQUIRED=false wins over stale legacy WEATHER_FLAG=true', async () => {
    process.env.WEATHER_ENABLED = 'true'
    process.env.WEATHER_AUTH_ACCESS_REQUIRED = 'false'
    process.env.WEATHER_FLAG = 'true'
    expect(await checkFeatureAccess('uid', 'user@example.com', 'vedrid')).toBe(true)
  })

  it('WEATHER_AUTH_ACCESS_REQUIRED=true requires per-user access even when WEATHER_FLAG=false', async () => {
    process.env.WEATHER_ENABLED = 'true'
    process.env.WEATHER_AUTH_ACCESS_REQUIRED = 'true'
    process.env.WEATHER_FLAG = 'false'
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: null })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'vedrid')).toBe(false)
  })
})

describe('checkFeatureAccess — vedrid (per-user gate via legacy WEATHER_FLAG=true)', () => {
  let savedEnabled: string | undefined
  let savedFlag: string | undefined
  let savedAccessRequired: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedEnabled = process.env.WEATHER_ENABLED
    savedFlag = process.env.WEATHER_FLAG
    savedAccessRequired = process.env.WEATHER_AUTH_ACCESS_REQUIRED
    process.env.WEATHER_ENABLED = 'true'
    process.env.WEATHER_FLAG = 'true'
    delete process.env.WEATHER_AUTH_ACCESS_REQUIRED
  })

  afterEach(() => {
    setEnv('WEATHER_ENABLED', savedEnabled)
    setEnv('WEATHER_FLAG', savedFlag)
    setEnv('WEATHER_AUTH_ACCESS_REQUIRED', savedAccessRequired)
  })

  it('returns true when row exists in feature_access', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: { email: 'user@example.com' }, error: null })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'vedrid')).toBe(true)
  })

  it('returns false when no row in feature_access', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: null })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'vedrid')).toBe(false)
  })

  it('returns false when DB query returns an error (fail-closed)', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: { message: 'connection refused' } })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'vedrid')).toBe(false)
  })

  it('returns false for invalid email', async () => {
    expect(await checkFeatureAccess('uid', 'not-an-email', 'vedrid')).toBe(false)
    expect(mockFeatureAccessQuery).not.toHaveBeenCalled()
  })

  it('returns false when query throws an exception (fail-closed)', async () => {
    mockFeatureAccessQuery.mockRejectedValue(new Error('DB connection error'))
    expect(await checkFeatureAccess('uid', 'user@example.com', 'vedrid')).toBe(false)
  })
})

describe('checkFeatureAccess — vedrid (per-user gate via WEATHER_AUTH_ACCESS_REQUIRED=true)', () => {
  let savedEnabled: string | undefined
  let savedFlag: string | undefined
  let savedAccessRequired: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedEnabled = process.env.WEATHER_ENABLED
    savedFlag = process.env.WEATHER_FLAG
    savedAccessRequired = process.env.WEATHER_AUTH_ACCESS_REQUIRED
    process.env.WEATHER_ENABLED = 'true'
    process.env.WEATHER_AUTH_ACCESS_REQUIRED = 'true'
    delete process.env.WEATHER_FLAG
  })

  afterEach(() => {
    setEnv('WEATHER_ENABLED', savedEnabled)
    setEnv('WEATHER_FLAG', savedFlag)
    setEnv('WEATHER_AUTH_ACCESS_REQUIRED', savedAccessRequired)
  })

  it('returns true when row exists in feature_access', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: { email: 'user@example.com' }, error: null })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'vedrid')).toBe(true)
  })

  it('returns false when no row in feature_access', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: null })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'vedrid')).toBe(false)
  })
})

// ── guardFeatureAccess — vedrid ───────────────────────────────────────────────

describe('guardFeatureAccess — vedrid', () => {
  let savedEnabled: string | undefined
  let savedFlag: string | undefined
  let savedAccessRequired: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedEnabled = process.env.WEATHER_ENABLED
    savedFlag = process.env.WEATHER_FLAG
    savedAccessRequired = process.env.WEATHER_AUTH_ACCESS_REQUIRED
  })

  afterEach(() => {
    setEnv('WEATHER_ENABLED', savedEnabled)
    setEnv('WEATHER_FLAG', savedFlag)
    setEnv('WEATHER_AUTH_ACCESS_REQUIRED', savedAccessRequired)
  })

  it('redirects to / when WEATHER_ENABLED is not set', async () => {
    delete process.env.WEATHER_ENABLED
    delete process.env.WEATHER_FLAG
    delete process.env.WEATHER_AUTH_ACCESS_REQUIRED
    await expect(guardFeatureAccess('user@example.com', 'vedrid')).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('redirects to / when WEATHER_ENABLED=false', async () => {
    process.env.WEATHER_ENABLED = 'false'
    delete process.env.WEATHER_FLAG
    delete process.env.WEATHER_AUTH_ACCESS_REQUIRED
    await expect(guardFeatureAccess('user@example.com', 'vedrid')).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('does not redirect when WEATHER_ENABLED=true and no access flag set (open to all)', async () => {
    process.env.WEATHER_ENABLED = 'true'
    delete process.env.WEATHER_FLAG
    delete process.env.WEATHER_AUTH_ACCESS_REQUIRED
    await expect(guardFeatureAccess('user@example.com', 'vedrid')).resolves.toBeUndefined()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects when WEATHER_AUTH_ACCESS_REQUIRED=true and user not in feature_access', async () => {
    process.env.WEATHER_ENABLED = 'true'
    process.env.WEATHER_AUTH_ACCESS_REQUIRED = 'true'
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: null })
    await expect(guardFeatureAccess('user@example.com', 'vedrid')).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('does not redirect when WEATHER_AUTH_ACCESS_REQUIRED=true and user is in feature_access', async () => {
    process.env.WEATHER_ENABLED = 'true'
    process.env.WEATHER_AUTH_ACCESS_REQUIRED = 'true'
    mockFeatureAccessQuery.mockResolvedValue({ data: { email: 'user@example.com' }, error: null })
    await expect(guardFeatureAccess('user@example.com', 'vedrid')).resolves.toBeUndefined()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects when legacy WEATHER_FLAG=true and user not in feature_access', async () => {
    process.env.WEATHER_ENABLED = 'true'
    process.env.WEATHER_FLAG = 'true'
    delete process.env.WEATHER_AUTH_ACCESS_REQUIRED
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: null })
    await expect(guardFeatureAccess('user@example.com', 'vedrid')).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('does not redirect when legacy WEATHER_FLAG=true and user is in feature_access', async () => {
    process.env.WEATHER_ENABLED = 'true'
    process.env.WEATHER_FLAG = 'true'
    delete process.env.WEATHER_AUTH_ACCESS_REQUIRED
    mockFeatureAccessQuery.mockResolvedValue({ data: { email: 'user@example.com' }, error: null })
    await expect(guardFeatureAccess('user@example.com', 'vedrid')).resolves.toBeUndefined()
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

  it('proceeds to session check when both flags are true', async () => {
    const result = await guardLoanAccess()
    expect(mockRedirect).not.toHaveBeenCalled()
    expect(mockGetUser).toHaveBeenCalled()
    expect(mockIsAllowedEmail).not.toHaveBeenCalled()
    expect(result).toEqual({ user: { id: 'u1', email: 'user@example.com' } })
  })
})

// ── checkFeatureAccess — elta-vedrid ──────────────────────────────────────────

describe('checkFeatureAccess — elta-vedrid (kill-switch and strict flag)', () => {
  let savedEnabled: string | undefined
  let savedFlag: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedEnabled = process.env.WEATHER_ENABLED
    savedFlag = process.env.WEATHER_ELTA_VEDRID_FLAG
  })

  afterEach(() => {
    setEnv('WEATHER_ENABLED', savedEnabled)
    setEnv('WEATHER_ELTA_VEDRID_FLAG', savedFlag)
  })

  it('returns false when WEATHER_ENABLED is not set', async () => {
    delete process.env.WEATHER_ENABLED
    delete process.env.WEATHER_ELTA_VEDRID_FLAG
    expect(await checkFeatureAccess('uid', 'user@example.com', 'elta-vedrid')).toBe(false)
  })

  it('returns false when WEATHER_ENABLED=false', async () => {
    process.env.WEATHER_ENABLED = 'false'
    process.env.WEATHER_ELTA_VEDRID_FLAG = 'true'
    expect(await checkFeatureAccess('uid', 'user@example.com', 'elta-vedrid')).toBe(false)
  })

  it('returns false when WEATHER_ELTA_VEDRID_FLAG is not set (no graduation path)', async () => {
    process.env.WEATHER_ENABLED = 'true'
    delete process.env.WEATHER_ELTA_VEDRID_FLAG
    expect(await checkFeatureAccess('uid', 'user@example.com', 'elta-vedrid')).toBe(false)
  })

  it('passes kill-switch when WEATHER_ENABLED=All (still requires WEATHER_ELTA_VEDRID_FLAG)', async () => {
    process.env.WEATHER_ENABLED = 'All'
    delete process.env.WEATHER_ELTA_VEDRID_FLAG
    expect(await checkFeatureAccess('uid', 'user@example.com', 'elta-vedrid')).toBe(false)
  })

  it('returns false when WEATHER_ELTA_VEDRID_FLAG=false', async () => {
    process.env.WEATHER_ENABLED = 'true'
    process.env.WEATHER_ELTA_VEDRID_FLAG = 'false'
    expect(await checkFeatureAccess('uid', 'user@example.com', 'elta-vedrid')).toBe(false)
  })
})

describe('checkFeatureAccess — elta-vedrid (per-user FLAG=true)', () => {
  let savedEnabled: string | undefined
  let savedFlag: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedEnabled = process.env.WEATHER_ENABLED
    savedFlag = process.env.WEATHER_ELTA_VEDRID_FLAG
    process.env.WEATHER_ENABLED = 'true'
    process.env.WEATHER_ELTA_VEDRID_FLAG = 'true'
  })

  afterEach(() => {
    setEnv('WEATHER_ENABLED', savedEnabled)
    setEnv('WEATHER_ELTA_VEDRID_FLAG', savedFlag)
  })

  it('returns true when row exists in feature_access', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: { email: 'user@example.com' }, error: null })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'elta-vedrid')).toBe(true)
  })

  it('returns false when no row in feature_access', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: null })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'elta-vedrid')).toBe(false)
  })

  it('returns false when DB query returns an error (fail-closed)', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: { message: 'connection refused' } })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'elta-vedrid')).toBe(false)
  })

  it('returns false for invalid email', async () => {
    expect(await checkFeatureAccess('uid', 'not-an-email', 'elta-vedrid')).toBe(false)
    expect(mockFeatureAccessQuery).not.toHaveBeenCalled()
  })
})

// ── guardFeatureAccess — elta-vedrid ──────────────────────────────────────────

describe('guardFeatureAccess — elta-vedrid', () => {
  let savedEnabled: string | undefined
  let savedFlag: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedEnabled = process.env.WEATHER_ENABLED
    savedFlag = process.env.WEATHER_ELTA_VEDRID_FLAG
  })

  afterEach(() => {
    setEnv('WEATHER_ENABLED', savedEnabled)
    setEnv('WEATHER_ELTA_VEDRID_FLAG', savedFlag)
  })

  it('redirects to / when WEATHER_ENABLED is not set', async () => {
    delete process.env.WEATHER_ENABLED
    delete process.env.WEATHER_ELTA_VEDRID_FLAG
    await expect(guardFeatureAccess('user@example.com', 'elta-vedrid')).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('redirects to / when WEATHER_ELTA_VEDRID_FLAG is not set', async () => {
    process.env.WEATHER_ENABLED = 'true'
    delete process.env.WEATHER_ELTA_VEDRID_FLAG
    await expect(guardFeatureAccess('user@example.com', 'elta-vedrid')).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('redirects when FLAG=true and user not in feature_access', async () => {
    process.env.WEATHER_ENABLED = 'true'
    process.env.WEATHER_ELTA_VEDRID_FLAG = 'true'
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: null })
    await expect(guardFeatureAccess('user@example.com', 'elta-vedrid')).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('does not redirect when FLAG=true and user is in feature_access', async () => {
    process.env.WEATHER_ENABLED = 'true'
    process.env.WEATHER_ELTA_VEDRID_FLAG = 'true'
    mockFeatureAccessQuery.mockResolvedValue({ data: { email: 'user@example.com' }, error: null })
    await expect(guardFeatureAccess('user@example.com', 'elta-vedrid')).resolves.toBeUndefined()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})

// ── checkFeatureAccess — weather-provider-vedurstofan ───────────────────────────────

describe('checkFeatureAccess — weather-provider-vedurstofan (kill-switch and access flag)', () => {
  let savedEnabled: string | undefined
  let savedLegacyFlag: string | undefined
  let savedAccessRequired: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedEnabled = process.env.WEATHER_ENABLED
    savedLegacyFlag = process.env.WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
    savedAccessRequired = process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED
  })

  afterEach(() => {
    setEnv('WEATHER_ENABLED', savedEnabled)
    setEnv('WEATHER_PROVIDER_VEDURSTOFAN_ENABLED', savedLegacyFlag)
    setEnv('WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED', savedAccessRequired)
  })

  it('returns false when WEATHER_ENABLED is not set', async () => {
    delete process.env.WEATHER_ENABLED
    delete process.env.WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
    delete process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED
    expect(await checkFeatureAccess('uid', 'user@example.com', 'weather-provider-vedurstofan')).toBe(false)
  })

  it('returns false when WEATHER_ENABLED=false', async () => {
    process.env.WEATHER_ENABLED = 'false'
    process.env.WEATHER_PROVIDER_VEDURSTOFAN_ENABLED = 'true'
    delete process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED
    expect(await checkFeatureAccess('uid', 'user@example.com', 'weather-provider-vedurstofan')).toBe(false)
  })

  it('returns true when WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED is absent (graduation — open to all weather users)', async () => {
    process.env.WEATHER_ENABLED = 'true'
    delete process.env.WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
    delete process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED
    expect(await checkFeatureAccess('uid', 'user@example.com', 'weather-provider-vedurstofan')).toBe(true)
    expect(mockFeatureAccessQuery).not.toHaveBeenCalled()
  })

  it('returns true when legacy var set but new var absent (graduation — delete new var = open)', async () => {
    process.env.WEATHER_ENABLED = 'true'
    process.env.WEATHER_PROVIDER_VEDURSTOFAN_ENABLED = 'true'
    delete process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED
    expect(await checkFeatureAccess('uid', 'user@example.com', 'weather-provider-vedurstofan')).toBe(true)
    expect(mockFeatureAccessQuery).not.toHaveBeenCalled()
  })

  it('returns true when WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=false (non-true = graduation open)', async () => {
    process.env.WEATHER_ENABLED = 'true'
    process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED = 'false'
    expect(await checkFeatureAccess('uid', 'user@example.com', 'weather-provider-vedurstofan')).toBe(true)
    expect(mockFeatureAccessQuery).not.toHaveBeenCalled()
  })

  it('returns true when WEATHER_ENABLED=All and access var absent (graduation open, no DB lookup)', async () => {
    process.env.WEATHER_ENABLED = 'All'
    delete process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED
    expect(await checkFeatureAccess('uid', 'user@example.com', 'weather-provider-vedurstofan')).toBe(true)
    expect(mockFeatureAccessQuery).not.toHaveBeenCalled()
  })
})

describe('checkFeatureAccess — weather-provider-vedurstofan (per-user gate, WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED=true)', () => {
  let savedEnabled: string | undefined
  let savedLegacyFlag: string | undefined
  let savedAccessRequired: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedEnabled = process.env.WEATHER_ENABLED
    savedLegacyFlag = process.env.WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
    savedAccessRequired = process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED
    process.env.WEATHER_ENABLED = 'true'
    process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED = 'true'
    delete process.env.WEATHER_PROVIDER_VEDURSTOFAN_ENABLED
  })

  afterEach(() => {
    setEnv('WEATHER_ENABLED', savedEnabled)
    setEnv('WEATHER_PROVIDER_VEDURSTOFAN_ENABLED', savedLegacyFlag)
    setEnv('WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED', savedAccessRequired)
  })

  it('returns true when row exists in feature_access', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: { email: 'user@example.com' }, error: null })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'weather-provider-vedurstofan')).toBe(true)
  })

  it('returns false when no row in feature_access', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: null })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'weather-provider-vedurstofan')).toBe(false)
  })

  it('returns false when DB query returns an error (fail-closed)', async () => {
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: { message: 'connection refused' } })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'weather-provider-vedurstofan')).toBe(false)
  })

  it('returns false for invalid email', async () => {
    expect(await checkFeatureAccess('uid', 'not-an-email', 'weather-provider-vedurstofan')).toBe(false)
    expect(mockFeatureAccessQuery).not.toHaveBeenCalled()
  })
})

// ── checkFeatureAccess — weather-pulse ──────────────────────────────────────

describe('checkFeatureAccess — weather-pulse (graduation pattern)', () => {
  let savedEnabled: string | undefined
  let savedChatEnabled: string | undefined
  let savedPulseRequired: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedEnabled = process.env.WEATHER_ENABLED
    savedChatEnabled = process.env.TESKEID_CHAT_ENABLED
    savedPulseRequired = process.env.WEATHER_PULSE_ACCESS_REQUIRED
    process.env.WEATHER_ENABLED = 'true'
    process.env.TESKEID_CHAT_ENABLED = 'true'
    delete process.env.WEATHER_PULSE_ACCESS_REQUIRED
  })

  afterEach(() => {
    setEnv('WEATHER_ENABLED', savedEnabled)
    setEnv('TESKEID_CHAT_ENABLED', savedChatEnabled)
    setEnv('WEATHER_PULSE_ACCESS_REQUIRED', savedPulseRequired)
  })

  it('returns false when WEATHER_ENABLED is off', async () => {
    delete process.env.WEATHER_ENABLED
    expect(await checkFeatureAccess('uid', 'user@example.com', 'weather-pulse')).toBe(false)
    expect(mockFeatureAccessQuery).not.toHaveBeenCalled()
  })

  it('returns false when TESKEID_CHAT_ENABLED is not set', async () => {
    delete process.env.TESKEID_CHAT_ENABLED
    expect(await checkFeatureAccess('uid', 'user@example.com', 'weather-pulse')).toBe(false)
    expect(mockFeatureAccessQuery).not.toHaveBeenCalled()
  })

  it('returns false when TESKEID_CHAT_ENABLED=false', async () => {
    process.env.TESKEID_CHAT_ENABLED = 'false'
    expect(await checkFeatureAccess('uid', 'user@example.com', 'weather-pulse')).toBe(false)
    expect(mockFeatureAccessQuery).not.toHaveBeenCalled()
  })

  it('returns true when WEATHER_PULSE_ACCESS_REQUIRED is absent (graduation open, no DB lookup)', async () => {
    delete process.env.WEATHER_PULSE_ACCESS_REQUIRED
    expect(await checkFeatureAccess('uid', 'user@example.com', 'weather-pulse')).toBe(true)
    expect(mockFeatureAccessQuery).not.toHaveBeenCalled()
  })

  it('returns true when WEATHER_PULSE_ACCESS_REQUIRED=false (non-true = graduation open)', async () => {
    process.env.WEATHER_PULSE_ACCESS_REQUIRED = 'false'
    expect(await checkFeatureAccess('uid', 'user@example.com', 'weather-pulse')).toBe(true)
    expect(mockFeatureAccessQuery).not.toHaveBeenCalled()
  })

  it('returns true when WEATHER_PULSE_ACCESS_REQUIRED=true and row exists', async () => {
    process.env.WEATHER_PULSE_ACCESS_REQUIRED = 'true'
    mockFeatureAccessQuery.mockResolvedValue({ data: { email: 'user@example.com' }, error: null })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'weather-pulse')).toBe(true)
  })

  it('returns false when WEATHER_PULSE_ACCESS_REQUIRED=true and no row', async () => {
    process.env.WEATHER_PULSE_ACCESS_REQUIRED = 'true'
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: null })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'weather-pulse')).toBe(false)
  })

  it('returns false when WEATHER_PULSE_ACCESS_REQUIRED=true and DB error (fail-closed)', async () => {
    process.env.WEATHER_PULSE_ACCESS_REQUIRED = 'true'
    mockFeatureAccessQuery.mockResolvedValue({ data: null, error: { message: 'connection refused' } })
    expect(await checkFeatureAccess('uid', 'user@example.com', 'weather-pulse')).toBe(false)
  })

  it('returns false when WEATHER_PULSE_ACCESS_REQUIRED=true and invalid email', async () => {
    process.env.WEATHER_PULSE_ACCESS_REQUIRED = 'true'
    expect(await checkFeatureAccess('uid', 'not-an-email', 'weather-pulse')).toBe(false)
    expect(mockFeatureAccessQuery).not.toHaveBeenCalled()
  })
})
