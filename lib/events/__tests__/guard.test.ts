import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const {
  mockCheckFeatureAccess,
  mockGuardTeskeidSession,
  mockRedirect,
} = vi.hoisted(() => ({
  mockCheckFeatureAccess: vi.fn(),
  mockGuardTeskeidSession: vi.fn(),
  mockRedirect: vi.fn((href: string) => { throw new Error(`NEXT_REDIRECT:${href}`) }),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/auth/guard', () => ({ guardTeskeidSession: mockGuardTeskeidSession }))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mockCheckFeatureAccess }))

import { EVENT_FEATURE_KEY } from '@/lib/events/contracts'
import { EXPENSE_FEATURE_KEY } from '@/lib/expenses/contracts'
import { canUseEventExpenses, guardEventAccess, guardEventSession } from '@/lib/events/guard'

const savedFlag = process.env.EVENTS_ENABLED
const savedExpensesFlag = process.env.EXPENSES_ENABLED
const user = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'Dotted.User@GMAIL.com',
} as User

beforeEach(() => {
  vi.clearAllMocks()
  process.env.EVENTS_ENABLED = 'true'
  process.env.EXPENSES_ENABLED = 'true'
  mockGuardTeskeidSession.mockResolvedValue({ user })
  mockCheckFeatureAccess.mockResolvedValue(true)
})

afterEach(() => {
  if (savedFlag === undefined) delete process.env.EVENTS_ENABLED
  else process.env.EVENTS_ENABLED = savedFlag
  if (savedExpensesFlag === undefined) delete process.env.EXPENSES_ENABLED
  else process.env.EXPENSES_ENABLED = savedExpensesFlag
})

describe('event access guard', () => {
  it('allows a signed-in session through the global gate without a per-user lookup', async () => {
    mockCheckFeatureAccess.mockResolvedValue(false)

    await expect(guardEventSession()).resolves.toEqual({ user })
    expect(mockCheckFeatureAccess).not.toHaveBeenCalled()
  })

  it.each([undefined, 'false', 'TRUE'])('fails the session-only guard before auth when EVENTS_ENABLED=%s', async (flag) => {
    if (flag === undefined) delete process.env.EVENTS_ENABLED
    else process.env.EVENTS_ENABLED = flag

    await expect(guardEventSession()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockGuardTeskeidSession).not.toHaveBeenCalled()
  })

  it.each([undefined, 'false', 'TRUE'])('fails before session access when EVENTS_ENABLED=%s', async (flag) => {
    if (flag === undefined) delete process.env.EVENTS_ENABLED
    else process.env.EVENTS_ENABLED = flag

    await expect(guardEventAccess()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockGuardTeskeidSession).not.toHaveBeenCalled()
    expect(mockCheckFeatureAccess).not.toHaveBeenCalled()
  })

  it('preserves the canonical session redirect before the per-user lookup', async () => {
    const redirectSignal = new Error('NEXT_REDIRECT:/innskraning')
    mockGuardTeskeidSession.mockRejectedValue(redirectSignal)

    await expect(guardEventAccess()).rejects.toBe(redirectSignal)
    expect(mockCheckFeatureAccess).not.toHaveBeenCalled()
  })

  it('requires only the exact Events entitlement after the session guard', async () => {
    await expect(guardEventAccess()).resolves.toEqual({ user })
    expect(mockCheckFeatureAccess).toHaveBeenCalledWith(user.id, user.email, EVENT_FEATURE_KEY)
  })

  it('fails closed when the Events entitlement is absent', async () => {
    mockCheckFeatureAccess.mockResolvedValue(false)
    await expect(guardEventAccess()).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('rejects a malformed session without an email before the entitlement lookup', async () => {
    mockGuardTeskeidSession.mockResolvedValue({ user: { id: user.id, email: null } })
    await expect(guardEventAccess()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockCheckFeatureAccess).not.toHaveBeenCalled()
  })
})

describe('event financial capability', () => {
  it.each([
    [undefined, 'true'],
    ['false', 'true'],
    ['true', undefined],
    ['true', 'false'],
  ])('fails closed before entitlement lookups for EVENTS=%s EXPENSES=%s', async (events, expenses) => {
    if (events === undefined) delete process.env.EVENTS_ENABLED
    else process.env.EVENTS_ENABLED = events
    if (expenses === undefined) delete process.env.EXPENSES_ENABLED
    else process.env.EXPENSES_ENABLED = expenses

    await expect(canUseEventExpenses(user)).resolves.toBe(false)
    expect(mockCheckFeatureAccess).not.toHaveBeenCalled()
  })

  it('requires both exact per-user feature keys', async () => {
    mockCheckFeatureAccess.mockImplementation(async (
      _userId: string,
      _email: string,
      featureKey: string,
    ) => featureKey === EVENT_FEATURE_KEY)

    await expect(canUseEventExpenses(user)).resolves.toBe(false)
    expect(mockCheckFeatureAccess).toHaveBeenCalledWith(user.id, user.email, EVENT_FEATURE_KEY)
    expect(mockCheckFeatureAccess).toHaveBeenCalledWith(user.id, user.email, EXPENSE_FEATURE_KEY)

    mockCheckFeatureAccess.mockResolvedValue(true)
    await expect(canUseEventExpenses(user)).resolves.toBe(true)
  })

  it('is non-redirecting and fail-closed for malformed sessions or lookup errors', async () => {
    await expect(canUseEventExpenses({ ...user, email: undefined })).resolves.toBe(false)
    expect(mockCheckFeatureAccess).not.toHaveBeenCalled()

    mockCheckFeatureAccess.mockRejectedValue(new Error('lookup failed'))
    await expect(canUseEventExpenses(user)).resolves.toBe(false)
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
