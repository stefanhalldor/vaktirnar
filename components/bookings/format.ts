export function normalizeBookingLocale(locale: string): string {
  const value = locale.trim().toLowerCase()
  if (value === 'is' || value.startsWith('is-')) return 'is-IS'
  if (value === 'en' || value.startsWith('en-')) return 'en-GB'
  return locale || 'is-IS'
}

export function formatBookingDateTime(value: string, locale: string, timeZone: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(normalizeBookingLocale(locale), {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone,
    }).format(date)
  } catch {
    return ''
  }
}

export function formatRequestedBookingTime(
  date: string,
  time: string,
  locale: string,
  timeZone: string,
): string {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  if (![year, month, day, hour, minute].every(Number.isFinite)) return `${date} ${time}`
  const displayDate = new Date(Date.UTC(year, month - 1, day, hour, minute))
  try {
    const dateLabel = new Intl.DateTimeFormat(normalizeBookingLocale(locale), {
      dateStyle: 'long',
      timeZone: 'UTC',
    }).format(displayDate)
    return `${dateLabel} · ${time} (${timeZone})`
  } catch {
    return `${date} · ${time} (${timeZone})`
  }
}

export function formatDiscountBps(value: number, locale: string): string {
  return new Intl.NumberFormat(normalizeBookingLocale(locale), {
    maximumFractionDigits: 2,
  }).format(value / 100)
}
