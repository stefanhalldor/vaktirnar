import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdmin: vi.fn(),
  membershipLimit: vi.fn(),
  invitationLimit: vi.fn(),
  invitationEmailEq: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mocks.getAdmin }))

import { hasExpenseAccessRequestContext } from '@/lib/expenses/access-request.server'

function createMembershipQuery() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    limit: mocks.membershipLimit,
  }
  return query
}

function createInvitationQuery() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((field: string, value: string) => {
      if (field === 'recipient_email_canonical') mocks.invitationEmailEq(value)
      return query
    }),
    gt: vi.fn(() => query),
    limit: mocks.invitationLimit,
  }
  return query
}

describe('hasExpenseAccessRequestContext', () => {
  beforeEach(() => {
    vi.stubEnv('EXPENSES_ENABLED', 'true')
    mocks.membershipLimit.mockResolvedValue({ data: [], error: null })
    mocks.invitationLimit.mockResolvedValue({ data: [], error: null })
    mocks.getAdmin.mockReturnValue({
      from: vi.fn((table: string) => table === 'expense_group_members'
        ? createMembershipQuery()
        : createInvitationQuery()),
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('does no database work while the global feature switch is off', async () => {
    vi.stubEnv('EXPENSES_ENABLED', 'false')
    await expect(hasExpenseAccessRequestContext('actor', 'actor@example.com')).resolves.toBe(false)
    expect(mocks.getAdmin).not.toHaveBeenCalled()
  })

  it('returns true for current-user financial membership', async () => {
    mocks.membershipLimit.mockResolvedValueOnce({ data: [{ id: 'member' }], error: null })
    await expect(hasExpenseAccessRequestContext('actor', 'actor@example.com')).resolves.toBe(true)
  })

  it('returns true for a pending email-scoped invitation and canonicalizes Gmail', async () => {
    mocks.invitationLimit.mockResolvedValueOnce({ data: [{ id: 'invitation' }], error: null })
    await expect(hasExpenseAccessRequestContext('actor', 'A.B@GMAIL.com')).resolves.toBe(true)
    expect(mocks.invitationEmailEq).toHaveBeenCalledWith('ab@gmail.com')
  })

  it('fails closed without projecting database errors', async () => {
    mocks.membershipLimit.mockResolvedValueOnce({ data: null, error: { message: 'private' } })
    await expect(hasExpenseAccessRequestContext('actor', 'actor@example.com')).resolves.toBe(false)
  })
})
