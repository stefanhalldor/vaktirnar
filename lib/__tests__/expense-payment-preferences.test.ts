import { describe, expect, it } from 'vitest'
import {
  ExpenseDomainError,
  canViewPaymentPreference,
  createPaymentPreferenceSnapshot,
  resolvePaymentPreference,
  validatePaymentPreference,
} from '@/lib/expenses'
import type { ExpenseDomainErrorCode } from '@/lib/expenses/domain-error'
import type {
  PaymentPreference,
  PaymentPreferenceAssignment,
} from '@/lib/expenses/types'

function expectDomainError(run: () => unknown, code: ExpenseDomainErrorCode): void {
  try {
    run()
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(ExpenseDomainError)
    expect((error as ExpenseDomainError).code).toBe(code)
  }
}

function bankPreference(
  preferenceId: string,
  overrides: Partial<PaymentPreference> = {},
): PaymentPreference {
  return {
    preferenceId,
    ownerId: 'owner',
    version: 1,
    title: preferenceId,
    kind: 'bank_account',
    supportedCurrencies: null,
    details: { accountNumber: `account-${preferenceId}` },
    visibility: 'debt_context',
    active: true,
    ...overrides,
  }
}

const assignments: PaymentPreferenceAssignment[] = [
  {
    ownerId: 'owner',
    preferenceId: 'group',
    scope: { type: 'group_currency', groupId: 'trip', currency: 'ISK' },
  },
  {
    ownerId: 'owner',
    preferenceId: 'currency',
    scope: { type: 'currency', currency: 'ISK' },
  },
  {
    ownerId: 'owner',
    preferenceId: 'general',
    scope: { type: 'general' },
  },
]

describe('payment preference resolution', () => {
  const preferences = [
    bankPreference('general'),
    bankPreference('currency', { supportedCurrencies: ['ISK'] }),
    bankPreference('group', { supportedCurrencies: ['isk'] }),
  ]

  it('uses the group-and-currency override first', () => {
    const result = resolvePaymentPreference({
      ownerId: 'owner', currency: 'isk', groupId: 'trip', preferences, assignments,
    })
    expect(result?.preference.preferenceId).toBe('group')
    expect(result?.source).toBe('group_currency')
  })

  it('falls back to the currency default and then the general default', () => {
    const currencyResult = resolvePaymentPreference({
      ownerId: 'owner', currency: 'ISK', groupId: 'other', preferences, assignments,
    })
    expect(currencyResult?.preference.preferenceId).toBe('currency')
    expect(currencyResult?.source).toBe('currency')

    const generalResult = resolvePaymentPreference({
      ownerId: 'owner', currency: 'EUR', groupId: 'trip', preferences, assignments,
    })
    expect(generalResult?.preference.preferenceId).toBe('general')
    expect(generalResult?.source).toBe('general')
  })

  it('skips inactive or currency-incompatible preferences', () => {
    const result = resolvePaymentPreference({
      ownerId: 'owner',
      currency: 'ISK',
      groupId: 'trip',
      preferences: [
        bankPreference('group', { active: false }),
        bankPreference('currency', { supportedCurrencies: ['EUR'] }),
        bankPreference('general'),
      ],
      assignments,
    })
    expect(result?.preference.preferenceId).toBe('general')
    expect(result?.source).toBe('general')
  })

  it('returns no details when no assignment resolves', () => {
    expect(resolvePaymentPreference({
      ownerId: 'owner', currency: 'ISK', preferences: [], assignments: [],
    })).toBeNull()
  })

  it('lets a specific scope explicitly suppress broader payment details', () => {
    expect(resolvePaymentPreference({
      ownerId: 'owner',
      currency: 'ISK',
      groupId: 'trip',
      preferences,
      assignments: [
        { ownerId: 'owner', preferenceId: null, scope: { type: 'group_currency', groupId: 'trip', currency: 'ISK' } },
        assignments[1]!,
        assignments[2]!,
      ],
    })).toBeNull()
    expect(resolvePaymentPreference({
      ownerId: 'owner',
      currency: 'ISK',
      preferences,
      assignments: [
        { ownerId: 'owner', preferenceId: null, scope: { type: 'currency', currency: 'ISK' } },
        assignments[2]!,
      ],
    })).toBeNull()
  })

  it('rejects duplicate assignment scopes and cross-owner data', () => {
    expectDomainError(
      () => resolvePaymentPreference({
        ownerId: 'owner',
        currency: 'ISK',
        preferences,
        assignments: [assignments[2]!, { ...assignments[2]!, preferenceId: 'currency' }],
      }),
      'payment_preference_assignment_duplicate',
    )
    expectDomainError(
      () => resolvePaymentPreference({
        ownerId: 'owner',
        currency: 'ISK',
        preferences: [bankPreference('foreign', { ownerId: 'someone-else' })],
        assignments: [],
      }),
      'payment_preference_owner_mismatch',
    )
    expectDomainError(
      () => resolvePaymentPreference({
        ownerId: 'owner',
        currency: 'ISK',
        preferences,
        assignments: [{
          ownerId: 'owner', preferenceId: 'general', scope: { type: 'future_scope' } as never,
        }],
      }),
      'payment_preference_invalid',
    )
  })
})

describe('payment preference validation, snapshots and visibility', () => {
  it('requires kind-appropriate details and a safe HTTPS payment link', () => {
    expectDomainError(
      () => validatePaymentPreference(bankPreference('missing', { details: {} })),
      'payment_preference_invalid',
    )
    expectDomainError(
      () => validatePaymentPreference(bankPreference('unsafe', {
        kind: 'payment_link',
        details: { paymentLink: 'javascript:alert(1)' },
      })),
      'payment_preference_invalid',
    )
    expect(validatePaymentPreference(bankPreference('safe', {
      kind: 'payment_link',
      details: { paymentLink: 'https://pay.example.test/request/1' },
    })).kind).toBe('payment_link')
  })

  it('fails closed for malformed runtime enums and booleans', () => {
    expectDomainError(
      () => validatePaymentPreference(bankPreference('bad-kind', { kind: 'future_kind' as never })),
      'payment_preference_invalid',
    )
    expectDomainError(
      () => validatePaymentPreference(bankPreference('bad-visibility', { visibility: 'public' as never })),
      'payment_preference_invalid',
    )
    expectDomainError(
      () => validatePaymentPreference(bankPreference('bad-active', { active: 'yes' as never })),
      'payment_preference_invalid',
    )
    expect(canViewPaymentPreference({
      viewerId: 'viewer', ownerId: 'owner', visibility: 'public' as never,
      viewerOwesOwner: true, sharesSettlementWithOwner: true, explicitlySharedWithViewer: true,
    })).toBe(false)
  })

  it('captures an immutable snapshot instead of a live profile reference', () => {
    const preference = bankPreference('bank', {
      version: 4,
      title: 'Aðalreikningur',
      details: { accountNumber: 'old-account', defaultReference: 'Dinner' },
    })
    const resolved = { preference, source: 'general' as const }
    const snapshot = createPaymentPreferenceSnapshot({
      resolved,
      currency: 'ISK',
      capturedAt: '2026-08-03T12:00:00.000Z',
    })

    preference.title = 'Nýr reikningur'
    ;(preference.details as { accountNumber?: string }).accountNumber = 'new-account'

    expect(snapshot).toMatchObject({
      sourcePreferenceId: 'bank',
      sourcePreferenceVersion: 4,
      title: 'Aðalreikningur',
      currency: 'ISK',
      details: { accountNumber: 'old-account', defaultReference: 'Dinner' },
    })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.details)).toBe(true)
  })

  it('rejects an invalid snapshot timestamp', () => {
    expectDomainError(
      () => createPaymentPreferenceSnapshot({
        resolved: { preference: bankPreference('bank'), source: 'general' },
        currency: 'ISK',
        capturedAt: 'not-a-date',
      }),
      'payment_preference_invalid',
    )
  })

  it('allows visibility only for the owner or the configured legitimate context', () => {
    const base = {
      viewerId: 'viewer',
      ownerId: 'owner',
      viewerOwesOwner: false,
      sharesSettlementWithOwner: false,
      explicitlySharedWithViewer: false,
    }
    expect(canViewPaymentPreference({ ...base, viewerId: 'owner', visibility: 'private' })).toBe(true)
    expect(canViewPaymentPreference({ ...base, visibility: 'private' })).toBe(false)
    expect(canViewPaymentPreference({ ...base, visibility: 'debt_context', viewerOwesOwner: true })).toBe(true)
    expect(canViewPaymentPreference({ ...base, visibility: 'debt_context', sharesSettlementWithOwner: true })).toBe(true)
    expect(canViewPaymentPreference({ ...base, visibility: 'debt_context' })).toBe(false)
    expect(canViewPaymentPreference({ ...base, visibility: 'explicit_share', explicitlySharedWithViewer: true })).toBe(true)
    expect(canViewPaymentPreference({ ...base, visibility: 'explicit_share' })).toBe(false)
  })
})
