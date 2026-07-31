import { describe, expect, it } from 'vitest'
import { resolveRouteForecastEtaMs } from '@/lib/weather/routeForecastTiming'

describe('resolveRouteForecastEtaMs', () => {
  const departureMs = Date.parse('2026-07-31T12:00:00.000Z')
  const durationMs = 4 * 60 * 60_000

  it('computes route ETA at the start, midpoint and end', () => {
    expect(resolveRouteForecastEtaMs(departureMs, durationMs, 0)).toBe(departureMs)
    expect(resolveRouteForecastEtaMs(departureMs, durationMs, 0.5))
      .toBe(departureMs + durationMs / 2)
    expect(resolveRouteForecastEtaMs(departureMs, durationMs, 1))
      .toBe(departureMs + durationMs)
  })

  it.each([null, undefined, Number.NaN, -0.001, 1.001])(
    'fails closed for unplaceable route fraction %s',
    routeFraction => {
      expect(resolveRouteForecastEtaMs(departureMs, durationMs, routeFraction)).toBeNull()
    },
  )

  it('fails closed for invalid timing inputs', () => {
    expect(resolveRouteForecastEtaMs(Number.NaN, durationMs, 0.5)).toBeNull()
    expect(resolveRouteForecastEtaMs(departureMs, Number.POSITIVE_INFINITY, 0.5)).toBeNull()
    expect(resolveRouteForecastEtaMs(departureMs, -1, 0.5)).toBeNull()
  })

  it('accepts a zero-duration route without inventing time', () => {
    expect(resolveRouteForecastEtaMs(departureMs, 0, 0.5)).toBe(departureMs)
  })
})
