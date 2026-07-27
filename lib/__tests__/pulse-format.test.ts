import { describe, expect, it } from 'vitest'
import { formatPulseDistanceKm } from '@/lib/weather/pulseFormat'

describe('formatPulseDistanceKm', () => {
  it('uses deterministic Icelandic decimal text during hydration', () => {
    expect(formatPulseDistanceKm(9_200, 'is')).toBe('9,2')
    expect(formatPulseDistanceKm(9_200, 'is-IS')).toBe('9,2')
    expect(formatPulseDistanceKm(1_774, 'is')).toBe('1,8')
  })

  it('omits a redundant decimal and keeps an ASCII fallback for English', () => {
    expect(formatPulseDistanceKm(10_000, 'is')).toBe('10')
    expect(formatPulseDistanceKm(9_200, 'en')).toBe('9.2')
  })

  it('rejects invalid distances', () => {
    expect(() => formatPulseDistanceKm(Number.NaN, 'is')).toThrow(/distanceM/)
    expect(() => formatPulseDistanceKm(-1, 'is')).toThrow(/distanceM/)
  })
})
