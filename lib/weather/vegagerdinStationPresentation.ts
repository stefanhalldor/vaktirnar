export const VEGAGERDIN_STATION_EXTERNAL_ONLY_AFTER_MS = 90 * 60 * 1_000
export const VEGAGERDIN_STATION_TIMESTAMP_AFTER_MS = 15 * 60 * 1_000
export const VEGAGERDIN_STATION_WARNING_AFTER_MS = 20 * 60 * 1_000

export function vegagerdinStationUrl(stationId: string): string | null {
  return /^\d{1,8}$/.test(stationId)
    ? `https://umferdin.is/vedurstodvar/${stationId}`
    : null
}

export function vegagerdinStationAgeMs(
  measuredAtIso: string | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (!measuredAtIso) return null
  const measuredAtMs = Date.parse(measuredAtIso)
  if (!Number.isFinite(measuredAtMs) || measuredAtMs > nowMs + 5 * 60 * 1_000) return null
  return Math.max(0, nowMs - measuredAtMs)
}

export function shouldOpenVegagerdinStationExternally(
  measuredAtIso: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  const ageMs = vegagerdinStationAgeMs(measuredAtIso, nowMs)
  return ageMs !== null && ageMs >= VEGAGERDIN_STATION_EXTERNAL_ONLY_AFTER_MS
}

function reykjavikDateParts(valueMs: number, locale: string) {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: 'Atlantic/Reykjavik',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(valueMs)
  const part = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find(candidate => candidate.type === type)?.value ?? ''
  )
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
  }
}

export function formatVegagerdinStationCompactTimestamp(
  measuredAtIso: string | null | undefined,
  locale: string,
  nowMs = Date.now(),
): string | null {
  const ageMs = vegagerdinStationAgeMs(measuredAtIso, nowMs)
  if (ageMs === null || ageMs < VEGAGERDIN_STATION_TIMESTAMP_AFTER_MS) return null

  const measuredAtMs = Date.parse(measuredAtIso as string)
  const normalizedLocale = locale.toLowerCase().startsWith('is') ? 'is-IS' : 'en-GB'
  const time = new Intl.DateTimeFormat(normalizedLocale, {
    timeZone: 'Atlantic/Reykjavik',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(measuredAtMs)
  const measuredDate = reykjavikDateParts(measuredAtMs, normalizedLocale)
  const currentDate = reykjavikDateParts(nowMs, normalizedLocale)
  if (
    measuredDate.year === currentDate.year
    && measuredDate.month === currentDate.month
    && measuredDate.day === currentDate.day
  ) {
    return time
  }

  return normalizedLocale === 'is-IS'
    ? `${Number(measuredDate.day)}.${Number(measuredDate.month)}. ${time}`
    : `${measuredDate.day}/${measuredDate.month} ${time}`
}

export function shouldWarnVegagerdinStationAge(
  measuredAtIso: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  const ageMs = vegagerdinStationAgeMs(measuredAtIso, nowMs)
  return ageMs !== null && ageMs >= VEGAGERDIN_STATION_WARNING_AFTER_MS
}
