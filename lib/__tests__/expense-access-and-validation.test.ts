import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGuardSession, mockCheckFeatureAccess, mockRedirect } = vi.hoisted(() => ({
  mockGuardSession: vi.fn(),
  mockCheckFeatureAccess: vi.fn(),
  mockRedirect: vi.fn((href: string) => { throw new Error(`NEXT_REDIRECT:${href}`) }),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('@/lib/auth/guard', () => ({ guardTeskeidSession: mockGuardSession }))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mockCheckFeatureAccess }))

import { guardExpenseAccess } from '@/lib/expenses/guard'
import {
  CreateExpenseSchema,
  ReportExpenseRepaymentSchema,
  SaveExpensePaymentPreferenceSchema,
} from '@/lib/expenses/validation'

describe('expense private-beta access', () => {
  const savedFlag = process.env.EXPENSES_ENABLED

  beforeEach(() => {
    vi.clearAllMocks()
    mockGuardSession.mockResolvedValue({ user: { id: 'user-1', email: 'user@example.com' } })
    mockCheckFeatureAccess.mockResolvedValue(true)
  })

  afterEach(() => {
    if (savedFlag === undefined) delete process.env.EXPENSES_ENABLED
    else process.env.EXPENSES_ENABLED = savedFlag
  })

  it('checks the global switch before session or database access', async () => {
    delete process.env.EXPENSES_ENABLED
    await expect(guardExpenseAccess()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockGuardSession).not.toHaveBeenCalled()
    expect(mockCheckFeatureAccess).not.toHaveBeenCalled()
  })

  it('always requires the exact per-user entitlement when globally enabled', async () => {
    process.env.EXPENSES_ENABLED = 'true'
    mockCheckFeatureAccess.mockResolvedValue(false)
    await expect(guardExpenseAccess()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockCheckFeatureAccess).toHaveBeenCalledWith(
      'user-1',
      'user@example.com',
      'utlagt-og-endurgreitt',
    )
  })

  it('returns only the verified session user after both gates pass', async () => {
    process.env.EXPENSES_ENABLED = 'true'
    await expect(guardExpenseAccess()).resolves.toEqual({
      user: { id: 'user-1', email: 'user@example.com' },
    })
  })
})

describe('expense boundary validation', () => {
  it('requires a stale-safe server settlement version and parties for repayment', () => {
    const result = ReportExpenseRepaymentSchema.safeParse({
      group_id: crypto.randomUUID(),
      from_member_id: crypto.randomUUID(),
      to_member_id: crypto.randomUUID(),
      expected_financial_version: 3,
      amount: '1.000',
      currency: 'ISK',
      occurred_on: '2026-08-04',
      note: null,
      request_id: crypto.randomUUID(),
    })
    expect(result.success).toBe(true)
  })

  it('does not expose explicit-share before recipient grants exist', () => {
    const result = SaveExpensePaymentPreferenceSchema.safeParse({
      preference_id: null,
      request_id: crypto.randomUUID(),
      title: 'Reikningur',
      kind: 'bank_account',
      supported_currencies: ['ISK'],
      details: { accountNumber: '0000-00-000000' },
      visibility: 'explicit_share',
      assignment: { scope_type: 'general' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown payment-detail fields instead of silently persisting them', () => {
    const result = SaveExpensePaymentPreferenceSchema.safeParse({
      preference_id: null,
      request_id: crypto.randomUUID(),
      title: 'Reikningur',
      kind: 'bank_account',
      supported_currencies: ['ISK'],
      details: { accountNumber: '0000-00-000000', secret: 'must-not-pass' },
      visibility: 'private',
      assignment: { scope_type: 'general' },
    })
    expect(result.success).toBe(false)
  })

  it('requires another participant for a one-off expense', () => {
    const selfKey = `self:${crypto.randomUUID()}`
    const result = CreateExpenseSchema.safeParse({
      request_id: crypto.randomUUID(),
      group_id: null,
      title: 'Hádegismatur',
      total: '1.000',
      currency: 'ISK',
      incurred_on: '2026-08-04',
      split_method: 'equal',
      members: [{ type: 'self', key: selfKey }],
      payments: [{ member_key: selfKey, amount: '1.000' }],
      allocations: [{ member_key: selfKey }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ['members'],
        message: 'participant_required',
      }))
    }
  })

  it('rejects a currency-scoped assignment the payment method does not support', () => {
    const result = SaveExpensePaymentPreferenceSchema.safeParse({
      preference_id: null,
      request_id: crypto.randomUUID(),
      title: 'Evrureikningur',
      kind: 'bank_account',
      supported_currencies: ['EUR'],
      details: { accountNumber: '0000-00-000000' },
      visibility: 'private',
      assignment: { scope_type: 'currency', currency: 'ISK' },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ['assignment', 'currency'],
        message: 'unsupported_currency',
      }))
    }
  })
})
