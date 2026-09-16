import { expenseCurrencyMinorDigits } from '@/lib/expenses/input-money'
import { normalizeDisplayLocale } from '@/lib/date-format'

export function exchangeCurrencyMinorDigits(currency: string): number | null {
  if (!/^[A-Z]{3}$/.test(currency)) return null
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? null
  } catch { return null }
}

export function formatConvertedMoney(amount: number | bigint, currency: string, locale: string): string {
  const digits = exchangeCurrencyMinorDigits(currency)
  if (digits === null) return ''
  const minor = BigInt(amount); const factor = BigInt(10 ** digits); const absolute = minor < BigInt(0) ? -minor : minor
  const whole = String(absolute / factor); const fraction = digits ? String(absolute % factor).padStart(digits, '0').replace(/0+$/, '') : ''
  const icelandic = normalizeDisplayLocale(locale) === 'is-IS'
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, icelandic ? '.' : ',')
  const number = grouped + (fraction ? (icelandic ? ',' : '.') + fraction : '')
  return (minor < BigInt(0) ? '-' : '') + (icelandic ? number + ' ' + currency : currency + ' ' + number)
}

export function convertSplitMoney(
  sourceMinor: number | bigint,
  sourceCurrency: string,
  targetCurrency: string,
  rawRate: string,
): bigint | null {
  const value = rawRate.trim().replace(',', '.')
  if (!/^\d+(?:\.\d{0,8})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const denominator = BigInt(10 ** fraction.length)
  const numerator = BigInt(whole + fraction)
  if (numerator <= BigInt(0)) return null

  const sourceFactor = BigInt(10 ** expenseCurrencyMinorDigits(sourceCurrency))
  const targetDigits = exchangeCurrencyMinorDigits(targetCurrency)
  if (targetDigits === null) return null
  const targetFactor = BigInt(10 ** targetDigits)
  const scaled = BigInt(sourceMinor) * numerator * targetFactor
  const divisor = denominator * sourceFactor
  const sign = scaled < BigInt(0) ? BigInt(-1) : BigInt(1)
  const absolute = scaled < BigInt(0) ? -scaled : scaled
  return sign * ((absolute + divisor / BigInt(2)) / divisor)
}
