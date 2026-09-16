import { expenseCurrencyMinorDigits } from '@/lib/expenses/input-money'
import { normalizeDisplayLocale } from '@/lib/date-format'

/** Format exact minor units, including large review differences, without
 * converting money to a floating point major-unit value. */
export function formatSplitMoney(amount: number | bigint, currency: string, locale: string) {
  const minor = BigInt(amount)
  const digits = expenseCurrencyMinorDigits(currency)
  const factor = BigInt(10 ** digits)
  const absolute = minor < BigInt(0) ? -minor : minor
  const whole = String(absolute / factor)
  const fraction = digits ? String(absolute % factor).padStart(digits, '0').replace(/0+$/, '') : ''
  // Node and Edge can disagree on ICU currency placement for is-IS. Keep the
  // two supported display locales deterministic, as in the shared money helper.
  const icelandic = normalizeDisplayLocale(locale) === 'is-IS'
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, icelandic ? '.' : ',')
  const number = grouped + (fraction ? (icelandic ? ',' : '.') + fraction : '')
  const sign = minor < BigInt(0) ? '-' : ''
  return sign + (icelandic ? number + ' ' + currency : currency + ' ' + number)
}
