import { describe, expect, it } from 'vitest'
import { formatDateOnly, formatDateTime, normalizeDisplayLocale } from '@/lib/date-format'

describe('date-only display formatting', () => {
  it('normalizes supported app locales', () => {
    expect(normalizeDisplayLocale('is')).toBe('is-IS')
    expect(normalizeDisplayLocale('is-IS')).toBe('is-IS')
    expect(normalizeDisplayLocale('en')).toBe('en-GB')
    expect(normalizeDisplayLocale('en-US')).toBe('en-GB')
  })

  it('formats the same ISO calendar day in Icelandic and English', () => {
    expect(formatDateOnly('2026-08-04', 'is')).toBe('4. ágúst 2026')
    expect(formatDateOnly('2026-08-04', 'en')).toBe('4 August 2026')
  })

  it('accepts a real leap day and rejects impossible or malformed dates', () => {
    expect(formatDateOnly('2024-02-29', 'is')).toBe('29. febrúar 2024')
    expect(formatDateOnly('2025-02-29', 'is')).toBe('')
    expect(formatDateOnly('2026-13-01', 'is')).toBe('')
    expect(formatDateOnly('08/04/2026', 'is')).toBe('')
    expect(formatDateOnly(null, 'is')).toBe('')
  })
})

describe('formatDateTime', () => {
  it('uses the requested display locale in Iceland time', () => {
    expect(formatDateTime('2026-08-04T13:05:00Z', 'is')).toBe('4. ágúst 2026, 13:05')
    expect(formatDateTime('2026-08-04T13:05:00Z', 'en')).toBe('4 August 2026, 13:05')
  })

  it('fails closed for invalid values', () => {
    expect(formatDateTime('ekki-dagsetning', 'is')).toBe('')
  })
})
