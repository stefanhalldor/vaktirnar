const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const ICELANDIC_MONTHS = [
  'janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní',
  'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember',
] as const
const ENGLISH_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export function normalizeDisplayLocale(locale: string): string {
  const normalized = locale.trim().toLowerCase()
  if (normalized === 'is' || normalized.startsWith('is-')) return 'is-IS'
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en-GB'
  return locale || 'is-IS'
}

/**
 * Formats a calendar date without letting the browser timezone move it to a
 * different day. Storage, form and API values remain ISO YYYY-MM-DD strings.
 */
export function formatDateOnly(
  value: string | null | undefined,
  locale: string,
): string {
  if (!value) return ''
  const match = DATE_ONLY_PATTERN.exec(value)
  if (!match) return ''

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    return ''
  }

  const displayLocale = normalizeDisplayLocale(locale)
  const monthName = displayLocale === 'is-IS'
    ? ICELANDIC_MONTHS[month - 1]
    : ENGLISH_MONTHS[month - 1]
  return displayLocale === 'is-IS'
    ? `${day}. ${monthName} ${year}`
    : `${day} ${monthName} ${year}`
}

/**
 * Formats an instant consistently in Teskeið's Iceland time zone.
 *
 * Only numeric calendar parts come from Intl. Month names and ordering are
 * deterministic so Node and browsers with different ICU locale data cannot
 * produce a React hydration mismatch for the same locale and instant.
 */
export function formatDateTime(
  value: string | Date | null | undefined,
  locale: string,
): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
    timeZone: 'Atlantic/Reykjavik',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find(item => item.type === type)?.value ?? ''
  )
  const dateOnly = `${part('year')}-${part('month')}-${part('day')}`
  const formattedDate = formatDateOnly(dateOnly, locale)
  const hour = part('hour')
  const minute = part('minute')
  return formattedDate && hour && minute ? `${formattedDate}, ${hour}:${minute}` : ''
}
