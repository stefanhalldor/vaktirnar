/**
 * Shared helper for grouping forecast time slots by UTC calendar day.
 * Used by ForecastTimeScrubber and WeatherSourceTimeSelector.
 * No dependency on component or UI files — safe to import from anywhere.
 *
 * Iceland uses UTC year-round (Atlantic/Reykjavik = UTC+0), so UTC date
 * arithmetic gives correct calendar days for all Icelandic forecast display.
 */

export interface ForecastSlot {
  timeMs: number
}

// Nominative definite weekday forms for Icelandic day labels (dagur → dagurinn).
// Sunday = index 0 (matches Date.getUTCDay()).
const IS_WEEKDAY_NOM = [
  'Sunnudagurinn', 'Mánudagurinn', 'Þriðjudagurinn',
  'Miðvikudagurinn', 'Fimmtudagurinn', 'Föstudagurinn', 'Laugardagurinn',
]
const IS_MONTH_FULL = [
  'janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní',
  'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember',
]
const IS_WEEKDAY_SHORT = ['Sun.', 'Mán.', 'Þri.', 'Mið.', 'Fim.', 'Fös.', 'Lau.']

export function formatCompactForecastDay(
  timeMs: number,
  locale: string,
): { weekdayLabel: string; dateLabel: string } {
  const date = new Date(timeMs)
  if (locale.startsWith('is')) {
    return {
      weekdayLabel: IS_WEEKDAY_SHORT[date.getUTCDay()],
      dateLabel: `${date.getUTCDate()}.${date.getUTCMonth() + 1}`,
    }
  }

  return {
    weekdayLabel: date.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' }),
    dateLabel: `${date.getUTCMonth() + 1}/${date.getUTCDate()}`,
  }
}

/**
 * Groups slots by UTC calendar day. Returns groups in input order (first slot
 * of each day determines the group's position).
 *
 * Generic over T so callers keep full slot type (worstStatus, worstStatusLabel, etc.)
 * without having to re-assert after grouping.
 */
export function groupSlotsByDay<T extends ForecastSlot>(
  slots: T[],
  locale: string,
): Array<{ dayKey: string; dayLabel: string; slots: T[] }> {
  const groups: Array<{ dayKey: string; dayLabel: string; slots: T[] }> = []
  const keyToIndex = new Map<string, number>()

  for (const slot of slots) {
    const date = new Date(slot.timeMs)
    const dayKey = date.toISOString().slice(0, 10)
    if (!keyToIndex.has(dayKey)) {
      keyToIndex.set(dayKey, groups.length)
      const dayLabel = locale.startsWith('is')
        ? `${IS_WEEKDAY_NOM[date.getUTCDay()]} ${date.getUTCDate()}. ${IS_MONTH_FULL[date.getUTCMonth()]}`
        : date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })
      groups.push({ dayKey, dayLabel, slots: [] })
    }
    groups[keyToIndex.get(dayKey)!].slots.push(slot)
  }

  return groups
}

/**
 * Filters forecast slots to today and future only.
 *
 * Cutoff = 00:00 UTC on the calendar date that contains `nowMs`.
 * Iceland uses UTC year-round (Atlantic/Reykjavik = UTC+0), so UTC date
 * arithmetic gives correct calendar days for all Icelandic forecast display.
 *
 * - Slots on today's calendar date (any hour, including past hours) are kept.
 * - Slots on previous calendar dates are removed.
 * - Non-finite / invalid `timeMs` values are removed.
 */
export function filterForecastSlotsFromToday<T extends ForecastSlot>(
  slots: T[],
  nowMs: number,
): T[] {
  const d = new Date(nowMs)
  const startOfTodayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return slots.filter(slot => Number.isFinite(slot.timeMs) && slot.timeMs >= startOfTodayMs)
}

/**
 * Keeps a forecast-map selection inside the exact slot list rendered by the
 * map scrubber. This matters when the UTC day boundary removes the old active
 * slot and the map only exposes selected hours from the wider forecast set.
 */
export function resolveForecastMapActiveTime<T extends ForecastSlot>(
  activeMode: 'now' | number,
  visibleSlots: T[],
): 'now' | number {
  if (
    typeof activeMode === 'number' &&
    visibleSlots.some(slot => slot.timeMs === activeMode)
  ) {
    return activeMode
  }
  return visibleSlots[0]?.timeMs ?? 'now'
}
