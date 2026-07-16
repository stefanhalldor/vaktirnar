const ICELAND_TZ = 'Atlantic/Reykjavik'

/**
 * Formats an ISO timestamp as "Fös. 17. júlí, 14:32".
 * Always uses Atlantic/Reykjavik timezone.
 */
export function formatChatTimestamp(isoString: string, locale: string): string {
  const d = new Date(isoString)
  const datePart = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: ICELAND_TZ,
  }).format(d)
  const timePart = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ICELAND_TZ,
  }).format(d)
  return `${datePart.charAt(0).toUpperCase()}${datePart.slice(1)}, ${timePart}`
}

/**
 * Formats an ISO timestamp as a day separator label: "Fös. 17. júlí"
 */
export function formatChatDayLabel(isoString: string, locale: string): string {
  const d = new Date(isoString)
  const label = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: ICELAND_TZ,
  }).format(d)
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`
}

/**
 * Returns a stable YYYY-MM-DD key in Atlantic/Reykjavik timezone.
 * Use for day-boundary detection — do NOT use Date.getDate() which is browser-tz-sensitive.
 */
export function calendarDateKey(isoString: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: ICELAND_TZ,
  }).formatToParts(new Date(isoString))
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
