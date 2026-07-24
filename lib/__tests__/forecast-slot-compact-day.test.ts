import { describe, expect, it } from 'vitest'
import { formatCompactForecastDay } from '@/lib/weather/forecastSlotHelpers'

describe('formatCompactForecastDay', () => {
  it('formats Icelandic Friday as a two-line-friendly short label', () => {
    const timeMs = Date.parse('2026-07-24T12:00:00Z')
    expect(formatCompactForecastDay(timeMs, 'is')).toEqual({
      weekdayLabel: 'Fös.',
      dateLabel: '24.7',
    })
  })

  it('uses UTC for the Icelandic calendar day', () => {
    const timeMs = Date.parse('2026-07-25T00:00:00Z')
    expect(formatCompactForecastDay(timeMs, 'is-IS')).toEqual({
      weekdayLabel: 'Lau.',
      dateLabel: '25.7',
    })
  })
})
