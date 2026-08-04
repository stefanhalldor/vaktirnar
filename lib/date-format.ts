const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

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

  return new Intl.DateTimeFormat(normalizeDisplayLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

/** Formats an instant consistently in Teskeið's Iceland time zone. */
export function formatDateTime(
  value: string | Date | null | undefined,
  locale: string,
): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(normalizeDisplayLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Atlantic/Reykjavik',
  }).format(date)
}
