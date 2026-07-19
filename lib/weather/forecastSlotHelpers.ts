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
