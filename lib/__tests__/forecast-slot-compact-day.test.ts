import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  filterForecastSlotsFromToday,
  formatCompactForecastDay,
  resolveForecastMapActiveTime,
} from '@/lib/weather/forecastSlotHelpers'

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

describe('filterForecastSlotsFromToday', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps every slot today and in the future while removing prior days and invalid values', () => {
    const yesterday = Date.parse('2026-08-10T23:59:59.999Z')
    const todayStart = Date.parse('2026-08-11T00:00:00.000Z')
    const elapsedToday = Date.parse('2026-08-11T06:00:00.000Z')
    const tomorrow = Date.parse('2026-08-12T00:00:00.000Z')
    const nowMs = Date.parse('2026-08-11T18:30:00.000Z')

    const result = filterForecastSlotsFromToday([
      { timeMs: yesterday, id: 'yesterday' },
      { timeMs: todayStart, id: 'today-start' },
      { timeMs: elapsedToday, id: 'elapsed-today' },
      { timeMs: tomorrow, id: 'tomorrow' },
      { timeMs: Number.NaN, id: 'invalid' },
    ], nowMs)

    expect(result.map(slot => slot.id)).toEqual([
      'today-start',
      'elapsed-today',
      'tomorrow',
    ])
  })

  it('uses the UTC Icelandic calendar boundary exactly at midnight', () => {
    const nowMs = Date.parse('2026-08-11T00:00:00.000Z')

    expect(filterForecastSlotsFromToday([
      { timeMs: nowMs - 1 },
      { timeMs: nowMs },
    ], nowMs)).toEqual([{ timeMs: nowMs }])
  })

  it('falls back to the first visible map hour when UTC midnight removes the active slot', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-11T23:59:59.999Z'))

    const priorDayNoon = Date.parse('2026-08-11T12:00:00.000Z')
    const nextDayMidnight = Date.parse('2026-08-12T00:00:00.000Z')
    const nextDayNoon = Date.parse('2026-08-12T12:00:00.000Z')
    const slots = [
      { timeMs: priorDayNoon },
      { timeMs: nextDayMidnight },
      { timeMs: nextDayNoon },
    ]
    const visibleMapSlots = () => filterForecastSlotsFromToday(slots, Date.now())
      .filter(slot => new Date(slot.timeMs).getUTCHours() === 12)

    expect(resolveForecastMapActiveTime(priorDayNoon, visibleMapSlots())).toBe(priorDayNoon)

    vi.advanceTimersByTime(1)

    expect(visibleMapSlots()).toEqual([{ timeMs: nextDayNoon }])
    expect(resolveForecastMapActiveTime(priorDayNoon, visibleMapSlots())).toBe(nextDayNoon)
  })
})
