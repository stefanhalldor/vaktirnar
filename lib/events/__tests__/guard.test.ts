import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFrom,
  mockGuardExpenseAccess,
  mockRedirect,
  mockSelect,
  mockEqEmail,
  mockEqFeature,
  mockMaybeSingle,
} = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGuardExpenseAccess: vi.fn(),
  mockRedirect: vi.fn((href: string) => { throw new Error(`NEXT_REDIRECT:${href}`) }),
  mockSelect: vi.fn(),
  mockEqEmail: vi.fn(),
  mockEqFeature: vi.fn(),
  mockMaybeSingle: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/expenses/guard', () => ({ guardExpenseAccess: mockGuardExpenseAccess }))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: () => ({ from: mockFrom }) }))

import { EVENT_FEATURE_KEY } from '@/lib/events/contracts'
import { guardEventAccess } from '@/lib/events/guard'

const savedFlag = process.env.EVENTS_ENABLED
const user = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'Dotted.User@GMAIL.com',
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.EVENTS_ENABLED = 'true'
  mockGuardExpenseAccess.mockResolvedValue({ user })
  mockFrom.mockReturnValue({ select: mockSelect })
  mockSelect.mockReturnValue({ eq: mockEqEmail })
  mockEqEmail.mockReturnValue({ eq: mockEqFeature })
  mockEqFeature.mockReturnValue({ maybeSingle: mockMaybeSingle })
  mockMaybeSingle.mockResolvedValue({ data: { email: 'dotteduser@gmail.com' }, error: null })
})

afterEach(() => {
  vi.restoreAllMocks()
  if (savedFlag === undefined) delete process.env.EVENTS_ENABLED
  else process.env.EVENTS_ENABLED = savedFlag
})

describe('event access guard', () => {
  it.each([undefined, 'false', 'TRUE'])('fails before expense/session access when EVENTS_ENABLED=%s', async (flag) => {
    if (flag === undefined) delete process.env.EVENTS_ENABLED
    else process.env.EVENTS_ENABLED = flag

    await expect(guardEventAccess()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockGuardExpenseAccess).not.toHaveBeenCalled()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('requires existing expense access before reading event entitlement', async () => {
    const redirectSignal = new Error('NEXT_REDIRECT:expense')
    mockGuardExpenseAccess.mockRejectedValue(redirectSignal)

    await expect(guardEventAccess()).rejects.toBe(redirectSignal)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('queries only the exact owner email and event feature key', async () => {
    await expect(guardEventAccess()).resolves.toEqual({ user })

    expect(mockFrom).toHaveBeenCalledWith('feature_access')
    expect(mockSelect).toHaveBeenCalledWith('email')
    expect(mockEqEmail).toHaveBeenCalledWith('email', 'dotteduser@gmail.com')
    expect(mockEqFeature).toHaveBeenCalledWith('feature_key', EVENT_FEATURE_KEY)
  })

  it('fails closed for a missing row without exposing account details', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })

    await expect(guardEventAccess()).rejects.toThrow('NEXT_REDIRECT:/')
  })

  it('fails closed and logs only a generic message on lookup errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'secret row for private@example.is' },
    })

    await expect(guardEventAccess()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(consoleError).toHaveBeenCalledWith('[events/guard] feature access lookup failed')
    expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('private@example.is'))
  })

  it('rejects a session without an email before querying feature_access', async () => {
    mockGuardExpenseAccess.mockResolvedValue({ user: { id: user.id, email: null } })

    await expect(guardEventAccess()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
