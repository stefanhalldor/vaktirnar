import { describe, it, expect } from 'vitest'
import { formatChatTimestamp, formatChatDayLabel, calendarDateKey } from '../chat/format'

// Atlantic/Reykjavik has no DST and is always UTC+0 in summer.
// These timestamps are the same in UTC and Reykjavik local time.
const ISO_AFTERNOON = '2026-07-17T14:32:00Z'       // Fri 17 Jul 14:32 Reykjavik
const ISO_BEFORE_MIDNIGHT = '2026-07-16T23:30:00Z'  // Thu 16 Jul 23:30 Reykjavik
const ISO_AFTER_MIDNIGHT  = '2026-07-17T00:30:00Z'  // Fri 17 Jul 00:30 Reykjavik

describe('formatChatTimestamp', () => {
  it('includes Icelandic month name and time', () => {
    const result = formatChatTimestamp(ISO_AFTERNOON, 'is')
    expect(result).toContain('júlí')
    expect(result).toContain('14:32')
    expect(result).toContain('17')
  })

  it('capitalises first letter', () => {
    const result = formatChatTimestamp(ISO_AFTERNOON, 'is')
    expect(result[0]).toBe(result[0].toUpperCase())
  })

  it('does not throw for English locale', () => {
    expect(() => formatChatTimestamp(ISO_AFTERNOON, 'en')).not.toThrow()
  })
})

describe('formatChatDayLabel', () => {
  it('returns capitalised weekday + day + month for Icelandic locale', () => {
    const result = formatChatDayLabel(ISO_AFTERNOON, 'is')
    expect(result).toContain('júlí')
    expect(result).toContain('17')
    expect(result[0]).toBe(result[0].toUpperCase())
  })

  it('does not include time', () => {
    const result = formatChatDayLabel(ISO_AFTERNOON, 'is')
    expect(result).not.toContain('14:32')
  })
})

describe('calendarDateKey', () => {
  it('returns Iceland date for before-midnight timestamp', () => {
    expect(calendarDateKey(ISO_BEFORE_MIDNIGHT)).toBe('2026-07-16')
  })

  it('returns Iceland date for after-midnight timestamp', () => {
    expect(calendarDateKey(ISO_AFTER_MIDNIGHT)).toBe('2026-07-17')
  })

  it('detects midnight day boundary in Iceland timezone', () => {
    expect(calendarDateKey(ISO_BEFORE_MIDNIGHT)).not.toBe(calendarDateKey(ISO_AFTER_MIDNIGHT))
  })

  it('same ISO date stays on same Iceland calendar day', () => {
    expect(calendarDateKey(ISO_AFTERNOON)).toBe('2026-07-17')
  })
})
