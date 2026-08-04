import { describe, expect, it } from 'vitest'
import {
  ExpenseDomainError,
  expenseCurrencyMinorDigits,
  formatExpenseMinor,
  formatExpenseMinorForCopy,
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
    expect(formatExpenseMinor(12_345, 'ISK', 'is-IS')).toContain('12.345')
    expect(formatExpenseMinor(1_234, 'EUR', 'en-GB')).toContain('12.34')
    expect(formatExpenseMinorForCopy(12_345, 'ISK')).toBe('12345')
    expect(formatExpenseMinorForCopy(1_234, 'EUR')).toBe('12.34')
  })
})
