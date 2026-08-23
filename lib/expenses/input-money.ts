import { failExpenseDomain } from './domain-error'
import { normalizeCurrency } from './money'
import { normalizeDisplayLocale } from '../date-format'

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
  const displayLocale = normalizeDisplayLocale(locale)
  const factor = 10 ** digits
  const absolute = Math.abs(amountMinor)
  const whole = Math.floor(absolute / factor)
  const fraction = absolute % factor
  const isIcelandic = displayLocale === 'is-IS'
  const groupSeparator = isIcelandic ? '.' : ','
  const decimalSeparator = isIcelandic ? ',' : '.'
  const groupedWhole = String(whole).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    groupSeparator,
  )
  const amount = digits === 0
    ? groupedWhole
    : `${groupedWhole}${decimalSeparator}${String(fraction).padStart(digits, '0')}`
  const sign = amountMinor < 0 ? '-' : ''
  if (isIcelandic) {
    return `${sign}${amount} ${normalized === 'ISK' ? 'kr.' : normalized}`
  }
  return `${sign}${normalized} ${amount}`
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

function expenseInputSeparators(locale: string): { decimal: string; group: string } {
  const parts = new Intl.NumberFormat(normalizeDisplayLocale(locale)).formatToParts(12_345.6)
  return {
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
    group: parts.find((part) => part.type === 'group')?.value ?? ',',
  }
}

/**
 * Formats the canonical form value with locale-aware thousands separators.
 * The canonical value deliberately remains ungrouped so existing validation,
 * drafts and RPC payloads keep the same unambiguous decimal representation.
 */
export function formatExpenseAmountInput(
  value: string,
  currency: string,
  locale = 'is-IS',
): string {
  if (!value) return ''
  const digits = expenseCurrencyMinorDigits(currency)
  const canonical = value.includes(',') && !value.includes('.')
    ? value.replace(',', '.')
    : value
  const match = /^(\d+)(?:\.(\d*))?$/.exec(canonical)
  if (!match || (match[2]?.length ?? 0) > digits) return value

  const { decimal, group } = expenseInputSeparators(locale)
  const groupedWhole = match[1]!.replace(/\B(?=(\d{3})+(?!\d))/g, group)
  return match[2] === undefined ? groupedWhole : `${groupedWhole}${decimal}${match[2]}`
}

/** Converts a localized editing value back to the canonical ungrouped value. */
export function normalizeExpenseAmountInput(
  value: string,
  currency: string,
  locale = 'is-IS',
): string | null {
  const digits = expenseCurrencyMinorDigits(currency)
  const { decimal, group } = expenseInputSeparators(locale)
  let canonical = value.trim().replace(/[\s\u00a0\u202f]/g, '')
  if (group) canonical = canonical.split(group).join('')
  if (decimal !== '.') canonical = canonical.split(decimal).join('.')

  if (!canonical) return ''
  if (digits === 0) return /^\d+$/.test(canonical) ? canonical : null
  const match = /^(\d+)(?:\.(\d*))?$/.exec(canonical)
  if (!match || (match[2]?.length ?? 0) > digits) return null
  return canonical
}
