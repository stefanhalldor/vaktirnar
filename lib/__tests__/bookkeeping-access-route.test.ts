import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCheckFeatureAccess,
  mockGuardTeskeidSession,
  mockRedirect,
} = vi.hoisted(() => ({
  mockCheckFeatureAccess: vi.fn(),
  mockGuardTeskeidSession: vi.fn(),
  mockRedirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`)
  }),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/auth/guard', () => ({ guardTeskeidSession: mockGuardTeskeidSession }))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mockCheckFeatureAccess }))

import { guardBookkeepingAccess } from '@/lib/bookkeeping/guard'

const savedBookkeepingFlag = process.env.BOOKKEEPING_ENABLED
const user = { id: 'user-1', email: 'stefanhalldor@gmail.com' }

beforeEach(() => {
  vi.clearAllMocks()
  mockGuardTeskeidSession.mockResolvedValue({ user })
  mockCheckFeatureAccess.mockResolvedValue(true)
})

afterEach(() => {
  if (savedBookkeepingFlag === undefined) delete process.env.BOOKKEEPING_ENABLED
  else process.env.BOOKKEEPING_ENABLED = savedBookkeepingFlag
})

describe('bookkeeping fail-closed access guard', () => {
  it.each([
    ['unset', undefined],
    ['false', 'false'],
  ])('redirects with the global flag %s before reading session or entitlement', async (_, flag) => {
    if (flag === undefined) delete process.env.BOOKKEEPING_ENABLED
    else process.env.BOOKKEEPING_ENABLED = flag

    await expect(guardBookkeepingAccess()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockGuardTeskeidSession).not.toHaveBeenCalled()
    expect(mockCheckFeatureAccess).not.toHaveBeenCalled()
  })

  it('redirects a session without email before checking the per-user entitlement', async () => {
    process.env.BOOKKEEPING_ENABLED = 'true'
    mockGuardTeskeidSession.mockResolvedValue({ user: { id: 'user-1', email: null } })

    await expect(guardBookkeepingAccess()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockCheckFeatureAccess).not.toHaveBeenCalled()
  })

  it('requires the exact per-user bokhaldid entitlement', async () => {
    process.env.BOOKKEEPING_ENABLED = 'true'
    mockCheckFeatureAccess.mockResolvedValue(false)

    await expect(guardBookkeepingAccess()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockCheckFeatureAccess).toHaveBeenCalledWith(
      'user-1',
      'stefanhalldor@gmail.com',
      'bokhaldid',
    )
  })

  it('returns the verified user only when the exact global flag and entitlement pass', async () => {
    process.env.BOOKKEEPING_ENABLED = 'true'

    await expect(guardBookkeepingAccess()).resolves.toEqual({ user })
    expect(mockGuardTeskeidSession).toHaveBeenCalledTimes(1)
    expect(mockCheckFeatureAccess).toHaveBeenCalledWith(
      user.id,
      user.email,
      'bokhaldid',
    )
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('does not swallow or translate Next redirect control flow', async () => {
    delete process.env.BOOKKEEPING_ENABLED
    const redirectSignal = { digest: 'NEXT_REDIRECT;replace;/;307;' }
    mockRedirect.mockImplementationOnce(() => { throw redirectSignal })

    await expect(guardBookkeepingAccess()).rejects.toBe(redirectSignal)
  })
})

describe('bookkeeping route loading contract', () => {
  const loadingFiles = [
    'app/auth-mvp/bokhaldid/loading.tsx',
    'app/auth-mvp/bokhaldid/timabil/[periodId]/loading.tsx',
    'app/auth-mvp/bokhaldid/timabil/[periodId]/faerslur/ny/loading.tsx',
    'app/auth-mvp/bokhaldid/timabil/[periodId]/faerslur/[entryId]/breyta/loading.tsx',
  ] as const

  it('provides a translated retry boundary for transient load failures', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/auth-mvp/bokhaldid/error.tsx'),
      'utf8',
    )
    expect(source).toContain("useTranslations('teskeid.bookkeeping')")
    expect(source).toContain("t('errors.load_failed')")
    expect(source).toContain('startTransition(reset)')
    expect(source).toContain('role="alert"')
  })

  it('uses state-specific locked copy on the direct edit route', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/auth-mvp/bokhaldid/timabil/[periodId]/faerslur/[entryId]/breyta/page.tsx',
      ),
      'utf8',
    )
    expect(source).toContain("view.period.state === 'ready'")
    expect(source).toContain("'period.readyLocked'")
    expect(source).toContain("'period.submittedLocked'")
  })

  it('wires every bookkeeping route segment to the shared loading component', () => {
    for (const relativePath of loadingFiles) {
      const source = readFileSync(join(process.cwd(), relativePath), 'utf8')
      expect(source).toContain(
        "import { BookkeepingRouteLoading } from '@/components/bookkeeping/BookkeepingRouteLoading'",
      )
      expect(source).toMatch(/export\s+default\s+BookkeepingRouteLoading/)
    }
  })

  it('keeps the shared route helper on the canonical TeskeidLoader', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/bookkeeping/BookkeepingRouteLoading.tsx'),
      'utf8',
    )
    expect(source).toContain(
      "import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'",
    )
    expect(source).toContain('<TeskeidLoader')
  })
})
