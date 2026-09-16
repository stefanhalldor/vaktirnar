import { describe, expect, it } from 'vitest'
import { convertSplitMoney, exchangeCurrencyMinorDigits, formatConvertedMoney } from '@/lib/receipt-split/exchange'

describe('receipt split exchange calculator', () => {
  it('supports free ISO-style display currencies and their standard minor digits', () => {
    expect(exchangeCurrencyMinorDigits('PLN')).toBe(2)
    expect(exchangeCurrencyMinorDigits('JPY')).toBe(0)
    expect(exchangeCurrencyMinorDigits('pln')).toBeNull()
    expect(convertSplitMoney(500, 'EUR', 'PLN', '4.5')).toBe(BigInt(2250))
    expect(formatConvertedMoney(2250, 'PLN', 'en')).toBe('PLN 22.5')
  })
  it('converts decimal-currency minor units into a zero-decimal currency', () => {
    expect(convertSplitMoney(166300, 'EUR', 'ISK', '150')).toBe(BigInt(249450))
  })

  it('accepts comma decimals and rounds only at the target minor unit', () => {
    expect(convertSplitMoney(1, 'EUR', 'ISK', '150,5')).toBe(BigInt(2))
  })

  it('rejects missing, zero and malformed rates', () => {
    expect(convertSplitMoney(100, 'EUR', 'ISK', '')).toBeNull()
    expect(convertSplitMoney(100, 'EUR', 'ISK', '0')).toBeNull()
    expect(convertSplitMoney(100, 'EUR', 'ISK', '1/2')).toBeNull()
  })
})
