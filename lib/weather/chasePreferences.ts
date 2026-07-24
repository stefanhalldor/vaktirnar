export const WEATHER_CHASE_VISIBLE_HOURS = [0, 3, 6, 9, 12, 15, 18, 21] as const

export type WeatherChaseVisibleHour = (typeof WEATHER_CHASE_VISIBLE_HOURS)[number]

const WEATHER_CHASE_VISIBLE_HOUR_SET = new Set<number>(WEATHER_CHASE_VISIBLE_HOURS)

export function getMedalEmoji(value: number, allValues: number[], direction: 'asc' | 'desc'): string | null {
  const valid = allValues.filter(Number.isFinite)
  if (valid.length < 2) return null
  const sorted = [...new Set(valid)].sort((a, b) => direction === 'desc' ? b - a : a - b)
  const rank = sorted.indexOf(value)
  if (rank === 0) return '🏆'
  if (rank === 1) return '🥈'
  if (rank === 2) return '🥉'
  return null
}

export function normalizeWeatherChaseVisibleHours(value: unknown): WeatherChaseVisibleHour[] {
  if (!Array.isArray(value)) return [12]

  const hours = Array.from(new Set(
    value.filter((hour): hour is WeatherChaseVisibleHour => (
      typeof hour === 'number' && WEATHER_CHASE_VISIBLE_HOUR_SET.has(hour)
    )),
  )).sort((a, b) => a - b)

  return hours.length > 0 ? hours : [12]
}
