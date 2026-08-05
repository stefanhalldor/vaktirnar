import { describe, expect, it } from 'vitest'
import {
  BookkeepingDomainError,
  formatIskAmount,
  formatIskForCopy,
  formatIskInput,
  formatIskInteger,
  formatSignedIskInput,
  parseIskAmount,
  suggestVatBreakdownFromGross,
  suggestVatBreakdownFromNet,
  validateVatLine,
  type BookkeepingEntryLine,
} from '@/lib/bookkeeping'

function line(overrides: Partial<BookkeepingEntryLine> = {}): BookkeepingEntryLine {
  return {
    id: 'line-1',
    entryId: 'entry-1',
    categoryCode: null,
    description: null,
    vatTreatment: 'taxable_24',
    currency: 'ISK',
    amountIncludesVat: true,
    grossMinor: 124_000,
    netMinor: 100_000,
    vatMinor: 24_000,
    inputVatDeductibility: 'not_applicable',
    deductibleVatMinor: 0,
    manualVatOverride: false,
    manualVatOverrideReason: null,
    exemptTurnoverConfirmed: false,
    ...overrides,
  }
}

describe('bookkeeping ISK money', () => {
  it('parses only unambiguous whole ISK values', () => {
    expect(parseIskAmount('124000')).toBe(124_000)
    expect(parseIskAmount('124.000')).toBe(124_000)
    expect(parseIskAmount(' 124 000 ')).toBe(124_000)
    expect(parseIskAmount('0', { allowZero: true })).toBe(0)

    for (const invalid of ['12.40', '124,000', '1.5', '-1', '', 'ISK 10']) {
      expect(() => parseIskAmount(invalid)).toThrow(BookkeepingDomainError)
    }
    expect(() => parseIskAmount('0')).toThrow(BookkeepingDomainError)
    expect(() => parseIskAmount('999999999999999999')).toThrow(BookkeepingDomainError)
  })

  it('formats display values and copies plain signed integers', () => {
    expect(formatIskAmount(12_345, 'is-IS')).toContain('12.345')
    expect(formatIskInteger(-12_345)).toBe('-12.345')
    expect(formatIskInput('65000')).toBe('65.000')
    expect(formatSignedIskInput('-65000')).toBe('-65.000')
    expect(formatIskForCopy(12_345)).toBe('12345')
    expect(formatIskForCopy(-5_000)).toBe('-5000')
  })

  it('calculates canonical gross and net VAT without floating point', () => {
    expect(suggestVatBreakdownFromGross(124_000, 24)).toEqual({
      grossMinor: 124_000,
      netMinor: 100_000,
      vatMinor: 24_000,
      rate: 24,
      amountIncludesVat: true,
    })
    expect(suggestVatBreakdownFromGross(111_000, 11)).toMatchObject({
      netMinor: 100_000,
      vatMinor: 11_000,
    })
    expect(suggestVatBreakdownFromNet(100_000, 24)).toMatchObject({
      grossMinor: 124_000,
      vatMinor: 24_000,
      amountIncludesVat: false,
    })
  })

  it('uses deterministic half-up integer rounding', () => {
    // 1 * 24 / 100 rounds to zero; 3 * 24 / 100 rounds to one.
    expect(suggestVatBreakdownFromNet(1, 24).vatMinor).toBe(0)
    expect(suggestVatBreakdownFromNet(3, 24).vatMinor).toBe(1)
    // This also exercises the overflow-safe quotient/remainder path.
    const large = suggestVatBreakdownFromGross(Number.MAX_SAFE_INTEGER, 24)
    expect(Number.isSafeInteger(large.netMinor)).toBe(true)
    expect(Number.isSafeInteger(large.vatMinor)).toBe(true)
    expect(large.netMinor + large.vatMinor).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('requires an explicit explained override when stored invoice VAT differs', () => {
    const unexplained = validateVatLine('sale', line({
      netMinor: 100_001,
      vatMinor: 23_999,
    }))
    expect(unexplained.map((issue) => issue.code)).toContain('manual_override_required')

    const missingReason = validateVatLine('sale', line({
      netMinor: 100_001,
      vatMinor: 23_999,
      manualVatOverride: true,
    }))
    expect(missingReason.map((issue) => issue.code))
      .toContain('manual_override_reason_required')

    expect(validateVatLine('sale', line({
      netMinor: 100_001,
      vatMinor: 23_999,
      manualVatOverride: true,
      manualVatOverrideReason: 'Raunverulegur VSK á fylgiskjali',
    }))).toEqual([])
  })
})
