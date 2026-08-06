import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  formatExpenseBankAccount,
  formatExpenseBankAccountDraft,
  formatExpenseNationalId,
  formatExpenseNationalIdDraft,
  normalizeExpensePaymentProfile,
} from '@/lib/expenses/payment-profile'
import {
  decryptExpensePaymentProfile,
  encryptExpensePaymentProfile,
} from '@/lib/expenses/payment-crypto.server'

const owner = '11111111-1111-4111-8111-111111111111'
const profile = '22222222-2222-4222-8222-222222222222'

describe('encrypted expense payment profile', () => {
  beforeEach(() => {
    process.env.EXPENSE_PAYMENT_ENCRYPTION_KEYS = JSON.stringify({
      activeKid: 'test-v1',
      keys: { 'test-v1': Buffer.alloc(32, 7).toString('base64') },
    })
  })

  it('normalizes digit fields without losing leading zeroes', () => {
    const result = normalizeExpensePaymentProfile({
      bank: '0159', ledger: '26', account: '001234', nationalId: '010180-9999', other: '  Aur  ',
    })
    expect(result).toEqual({ ok: true, value: {
      bank: '0159', ledger: '26', account: '001234', nationalId: '0101809999', other: 'Aur',
    } })
    if (result.ok) {
      expect(formatExpenseBankAccount(result.value)).toBe('0159-26-001234')
      expect(formatExpenseNationalId(result.value.nationalId)).toBe('010180-9999')
      expect(formatExpenseNationalIdDraft(result.value.nationalId)).toBe('010180-9999')
    }
  })

  it('requires all bank parts together', () => {
    expect(normalizeExpensePaymentProfile({ bank: '0159' })).toEqual({ ok: false, error: 'bank_incomplete' })
  })

  it('previews partial bank input live and left-pads a short account on save', () => {
    expect(formatExpenseBankAccountDraft({ bank: '0186', ledger: '26', account: '1' }))
      .toBe('0186-26-1')
    expect(normalizeExpensePaymentProfile({ bank: '0186', ledger: '26', account: '1' }))
      .toEqual({ ok: true, value: {
        bank: '0186', ledger: '26', account: '000001', nationalId: null, other: null,
      } })
  })

  it('allows the entire bank account to be omitted', () => {
    expect(normalizeExpensePaymentProfile({ nationalId: '0101809999' })).toEqual({
      ok: true,
      value: { bank: null, ledger: null, account: null, nationalId: '0101809999', other: null },
    })
  })

  it('round-trips authenticated ciphertext and binds it to owner and profile', () => {
    const details = { bank: '0159', ledger: '26', account: '001234', nationalId: null, other: 'Aur' }
    const encrypted = encryptExpensePaymentProfile({ ownerUserId: owner, profileId: profile, details })
    expect(encrypted.envelope).not.toEqual(expect.objectContaining(details))
    expect(decryptExpensePaymentProfile({ ownerUserId: owner, profileId: profile, envelope: encrypted.envelope })).toEqual(details)
    expect(() => decryptExpensePaymentProfile({ ownerUserId: owner, profileId: '33333333-3333-4333-8333-333333333333', envelope: encrypted.envelope })).toThrow('expense_payment_crypto_invalid')
  })

  it('fails closed when ciphertext is changed', () => {
    const encrypted = encryptExpensePaymentProfile({ ownerUserId: owner, profileId: profile, details: { bank: null, ledger: null, account: null, nationalId: null, other: 'Aur' } })
    const tampered = {
      ...encrypted.envelope,
      ciphertext: `${encrypted.envelope.ciphertext[0] === 'A' ? 'B' : 'A'}${encrypted.envelope.ciphertext.slice(1)}`,
    }
    expect(() => decryptExpensePaymentProfile({ ownerUserId: owner, profileId: profile, envelope: tampered })).toThrow('expense_payment_crypto_invalid')
  })
})
