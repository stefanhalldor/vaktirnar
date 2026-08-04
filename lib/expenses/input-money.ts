import { failExpenseDomain } from './domain-error'
import { normalizeCurrency } from './money'

export const EXPENSE_CURRENCIES = ['ISK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK', 'SEK'] as const
export type ExpenseCurrency = (typeof EXPENSE_CURRENCIES)[number]

const ZERO_DECIMAL_CURRENCIES = new Set<string>(['ISK'])

export function expenseCurrencyMinorDigits(currency: string): number {
  const normalized = normalizeCurrency(currency)
  if (!(EXPENSE_CURRENCIES as readonly string[]).includes(normalized)) {
    failExpenseDomain('invalid_currency', { currency: normalized })
  }
  return ZERO_DECIMAL_CURRENCIES.has(normalized) ? 0 : 2
}

/**
 * Parses a user-entered decimal amount without floating-point arithmetic.
 * Both comma and period are accepted as decimal separators, but thousands
 * separators are deliberately rejected so ambiguous financial input fails.
 */
export function parseExpenseAmountToMinor(
  raw: string,
  currency: string,
  options: { allowZero?: boolean } = {},
): number {
  if (typeof raw !== 'string') failExpenseDomain('invalid_amount')
  const value = raw.trim().replace(/\s+/g, '')
  if (!/^\d+(?:[.,]\d+)?$/.test(value)) failExpenseDomain('invalid_amount')
  if (value.includes('.') && value.includes(',')) failExpenseDomain('invalid_amount')

  const digits = expenseCurrencyMinorDigits(currency)
  const [wholeRaw, fractionRaw = ''] = value.replace(',', '.').split('.')
  if (fractionRaw.length > digits) failExpenseDomain('invalid_amount')
  if (digits === 0 && fractionRaw.length > 0) failExpenseDomain('invalid_amount')

  const whole = Number(wholeRaw)
  const fraction = fractionRaw.padEnd(digits, '0') || '0'
  const factor = 10 ** digits
  const minor = whole * factor + Number(fraction)
  if (
    !Number.isSafeInteger(minor) ||
    minor < 0 ||
    (!options.allowZero && minor === 0)
  ) failExpenseDomain('invalid_amount')
  return minor
}

export function parseExpensePercentageToBasisPoints(raw: string): number {
  if (typeof raw !== 'string') failExpenseDomain('invalid_amount')
  const value = raw.trim().replace(',', '.')
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) failExpenseDomain('invalid_amount')
  const [wholeRaw, fractionRaw = ''] = value.split('.')
  const basisPoints = Number(wholeRaw) * 100 + Number(fractionRaw.padEnd(2, '0') || '0')
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    failExpenseDomain('invalid_amount')
  }
  return basisPoints
}

export function parseExpenseWeight(raw: string): number {
  const value = raw.trim()
  if (!/^\d{1,7}$/.test(value)) failExpenseDomain('invalid_amount')
  const weight = Number(value)
  if (!Number.isSafeInteger(weight) || weight < 0 || weight > 1_000_000) {
    failExpenseDomain('invalid_amount')
  }
  return weight
}

export function formatExpenseMinor(
  amountMinor: number,
  currency: string,
  locale = 'is-IS',
): string {
  if (!Number.isSafeInteger(amountMinor)) failExpenseDomain('invalid_amount')
  const normalized = normalizeCurrency(currency)
  const digits = expenseCurrencyMinorDigits(normalized)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: normalized,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amountMinor / (10 ** digits))
}

/** Plain decimal value suitable for copying into an external payment form. */
export function formatExpenseMinorForCopy(amountMinor: number, currency: string): string {
  if (!Number.isSafeInteger(amountMinor)) failExpenseDomain('invalid_amount')
  const digits = expenseCurrencyMinorDigits(currency)
  const sign = amountMinor < 0 ? '-' : ''
  const absolute = Math.abs(amountMinor)
  if (digits === 0) return `${sign}${absolute}`
  const factor = 10 ** digits
  const whole = Math.floor(absolute / factor)
  const fraction = String(absolute % factor).padStart(digits, '0')
  return `${sign}${whole}.${fraction}`
}
