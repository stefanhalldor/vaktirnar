import { describe, expect, it, vi } from 'vitest'
import {
  ExpenseDomainError,
  EXPENSE_CURRENCIES,
  expenseCurrencyMinorDigits,
  formatExpenseAmountInput,
  formatExpenseMinor,
  formatExpenseMinorForCopy,
  normalizeExpenseAmountInput,
  parseExpenseAmountToMinor,
  parseExpensePercentageToBasisPoints,
} from '@/lib/expenses'

describe('expense amount input', () => {
  it('parses ISK as whole minor units', () => {
    expect(expenseCurrencyMinorDigits('isk')).toBe(0)
    expect(parseExpenseAmountToMinor('18000', 'ISK')).toBe(18_000)
  })

  it('parses comma or period decimals without floating point', () => {
    expect(parseExpenseAmountToMinor('12,34', 'EUR')).toBe(1_234)
    expect(parseExpenseAmountToMinor('12.30', 'USD')).toBe(1_230)
  })

  it('parses percentages into basis points, including zero', () => {
    expect(parseExpensePercentageToBasisPoints('33,33')).toBe(3_333)
    expect(parseExpensePercentageToBasisPoints('100')).toBe(10_000)
    expect(parseExpensePercentageToBasisPoints('0')).toBe(0)
    expect(() => parseExpensePercentageToBasisPoints('100.01')).toThrow(ExpenseDomainError)
  })

  it('rejects ambiguous separators and excess precision', () => {
    expect(() => parseExpenseAmountToMinor('1.234,50', 'EUR')).toThrow(ExpenseDomainError)
    expect(() => parseExpenseAmountToMinor('10.5', 'ISK')).toThrow(ExpenseDomainError)
    expect(() => parseExpenseAmountToMinor('1.234', 'EUR')).toThrow(ExpenseDomainError)
  })

  it('rejects zero, negative, unsupported currencies and unsafe amounts', () => {
    expect(() => parseExpenseAmountToMinor('0', 'ISK')).toThrow(ExpenseDomainError)
    expect(parseExpenseAmountToMinor('0', 'ISK', { allowZero: true })).toBe(0)
    expect(() => parseExpenseAmountToMinor('-1', 'ISK')).toThrow(ExpenseDomainError)
    expect(() => parseExpenseAmountToMinor('10', 'ZZZ')).toThrow(ExpenseDomainError)
    expect(() => parseExpenseAmountToMinor('999999999999999999', 'ISK')).toThrow(ExpenseDomainError)
  })

  it('formats minor units using the currency exponent', () => {
    expect(formatExpenseMinor(12_345, 'ISK', 'is-IS')).toBe('12.345 kr.')
    expect(formatExpenseMinor(12_345, 'ISK', 'en-GB')).toBe('ISK 12,345')
    expect(formatExpenseMinor(1_234, 'EUR', 'is')).toBe('12,34 EUR')
    expect(formatExpenseMinor(1_234, 'EUR', 'en')).toBe('EUR 12.34')
    expect(formatExpenseMinor(-1_234, 'USD', 'is')).toBe('-12,34 USD')
    expect(formatExpenseMinor(-1_234, 'USD', 'en')).toBe('-USD 12.34')
    for (const currency of EXPENSE_CURRENCIES) {
      const amount = currency === 'ISK' ? 1_234_567 : 123_456_789
      expect(formatExpenseMinor(amount, currency, 'is')).toMatch(
        currency === 'ISK' ? /^1\.234\.567 kr\.$/ : /^1\.234\.567,89 [A-Z]{3}$/,
      )
      expect(formatExpenseMinor(amount, currency, 'en')).toMatch(
        new RegExp(`^${currency} 1,234,567${currency === 'ISK' ? '' : '\\.89'}$`),
      )
    }
    expect(formatExpenseMinorForCopy(12_345, 'ISK')).toBe('12345')
    expect(formatExpenseMinorForCopy(1_234, 'EUR')).toBe('12.34')
  })

  it('formats display amounts without runtime Intl currency data', () => {
    const numberFormat = vi.spyOn(Intl, 'NumberFormat')

    expect(formatExpenseMinor(24_000, 'ISK', 'is')).toBe('24.000 kr.')
    expect(formatExpenseMinor(24_000, 'ISK', 'en')).toBe('ISK 24,000')
    expect(numberFormat).not.toHaveBeenCalled()

    numberFormat.mockRestore()
  })

  it('groups editable amounts by locale without changing the canonical value', () => {
    expect(formatExpenseAmountInput('10000000', 'ISK', 'is')).toBe('10.000.000')
    expect(formatExpenseAmountInput('12345.67', 'EUR', 'is')).toBe('12.345,67')
    expect(formatExpenseAmountInput('12345.67', 'EUR', 'en')).toBe('12,345.67')
    expect(normalizeExpenseAmountInput('10.000.000', 'ISK', 'is')).toBe('10000000')
    expect(normalizeExpenseAmountInput('12.345,67', 'EUR', 'is')).toBe('12345.67')
    expect(normalizeExpenseAmountInput('12,345.67', 'EUR', 'en')).toBe('12345.67')
  })
})
