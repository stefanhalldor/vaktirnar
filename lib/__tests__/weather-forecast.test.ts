/**
 * Unit tests for lib/weather/forecast.ts
 */

import { describe, it, expect } from 'vitest'
import { parseMetnoForecast, filterHours } from '@/lib/weather/forecast'
import type { HourPoint } from '@/lib/weather/types'

function makeRaw(overrides: Partial<{
  time: string
  air_temperature: number
  wind_speed: number
  wind_speed_of_gust: number
  wind_from_direction: number
  precipitation_amount: number
  symbol_code: string
}> = {}): unknown {
  const o = {
    time: '2026-07-03T18:00:00Z',
    air_temperature: 15,
    wind_speed: 5,
    wind_speed_of_gust: 7,
    wind_from_direction: 90,
    precipitation_amount: 0,
    symbol_code: 'clearsky_day',
    ...overrides,
  }
  return {
    properties: {
      timeseries: [{
        time: o.time,
        data: {
          instant: {
            details: {
              air_temperature: o.air_temperature,
              wind_speed: o.wind_speed,
              wind_speed_of_gust: o.wind_speed_of_gust,
              wind_from_direction: o.wind_from_direction,
            },
          },
          next_1_hours: {
            summary: { symbol_code: o.symbol_code },
            details: { precipitation_amount: o.precipitation_amount },
          },
        },
      }],
    },
  }
}

describe('parseMetnoForecast', () => {
  it('parses a single timeseries entry', () => {
    const result = parseMetnoForecast(makeRaw())
    expect(result).toHaveLength(1)
    expect(result[0].airTemperatureC).toBe(15)
    expect(result[0].windSpeedMs).toBe(5)
    expect(result[0].windGustMs).toBe(7)
    expect(result[0].precipitationMmPerHour).toBe(0)
    expect(result[0].symbolCode).toBe('clearsky_day')
  })

  it('falls back gust to wind_speed when wind_speed_of_gust is missing', () => {
    const raw = makeRaw() as { properties: { timeseries: Array<{ data: { instant: { details: Record<string, unknown> } } }> } }
    delete raw.properties.timeseries[0].data.instant.details.wind_speed_of_gust
    const result = parseMetnoForecast(raw)
    expect(result[0].windGustMs).toBe(5) // falls back to wind_speed
  })

  it('falls back to next_6_hours symbol when next_1_hours is absent', () => {
    const raw = {
      properties: {
        timeseries: [{
          time: '2026-07-03T18:00:00Z',
          data: {
            instant: { details: { air_temperature: 10, wind_speed: 3 } },
            next_6_hours: {
              summary: { symbol_code: 'rain' },
              details: { precipitation_amount: 2 },
            },
          },
        }],
      },
    }
    const result = parseMetnoForecast(raw)
    expect(result[0].symbolCode).toBe('rain')
    expect(result[0].precipitationMmPerHour).toBe(2)
  })

  it('returns empty array for empty timeseries', () => {
    expect(parseMetnoForecast({ properties: { timeseries: [] } })).toEqual([])
  })

  it('returns empty array for null/undefined input', () => {
    expect(parseMetnoForecast(null)).toEqual([])
    expect(parseMetnoForecast(undefined)).toEqual([])
  })

  it('skips entries where wind_speed is undefined (prevents false-green from missing data)', () => {
    const raw = {
      properties: {
        timeseries: [{
          time: '2026-07-03T18:00:00Z',
          data: { instant: {} },
        }],
      },
    }
    // wind_speed is undefined → entry is filtered out entirely
    const result = parseMetnoForecast(raw)
    expect(result).toHaveLength(0)
  })

  it('skips entries where both next_1_hours and next_6_hours are absent (no precipitation period data)', () => {
    const raw = {
      properties: {
        timeseries: [{
          time: '2026-07-03T18:00:00Z',
          data: {
            instant: { details: { wind_speed: 3, air_temperature: 15 } },
            // no next_1_hours, no next_6_hours
          },
        }],
      },
    }
    const result = parseMetnoForecast(raw)
    expect(result).toHaveLength(0)
  })

  it('keeps entries where next_6_hours is present but next_1_hours is absent', () => {
    const raw = {
      properties: {
        timeseries: [{
          time: '2026-07-03T18:00:00Z',
          data: {
            instant: { details: { wind_speed: 3, air_temperature: 15 } },
            next_6_hours: { summary: { symbol_code: 'clearsky_day' }, details: { precipitation_amount: 0 } },
          },
        }],
      },
    }
    const result = parseMetnoForecast(raw)
    expect(result).toHaveLength(1)
  })
})

describe('filterHours', () => {
  const points: HourPoint[] = [
    { time: '2026-07-03T16:00:00Z', airTemperatureC: 12, windSpeedMs: 3, windGustMs: 5, windFromDegrees: 90, precipitationMmPerHour: 0, symbolCode: 'clearsky_day' },
    { time: '2026-07-03T18:00:00Z', airTemperatureC: 14, windSpeedMs: 4, windGustMs: 6, windFromDegrees: 90, precipitationMmPerHour: 0, symbolCode: 'clearsky_day' },
    { time: '2026-07-03T20:00:00Z', airTemperatureC: 11, windSpeedMs: 5, windGustMs: 8, windFromDegrees: 90, precipitationMmPerHour: 0.2, symbolCode: 'partlycloudy_day' },
    { time: '2026-07-03T23:00:00Z', airTemperatureC: 9,  windSpeedMs: 6, windGustMs: 9, windFromDegrees: 90, precipitationMmPerHour: 0, symbolCode: 'clearsky_night' },
  ]

  it('returns only points within the window (inclusive)', () => {
    const result = filterHours(points, '2026-07-03T18:00:00Z', '2026-07-03T20:00:00Z')
    expect(result).toHaveLength(2)
    expect(result[0].time).toBe('2026-07-03T18:00:00Z')
    expect(result[1].time).toBe('2026-07-03T20:00:00Z')
  })

  it('returns empty array when no points fall in the window', () => {
    expect(filterHours(points, '2026-07-04T00:00:00Z', '2026-07-04T06:00:00Z')).toEqual([])
  })

  it('returns all points when window covers everything', () => {
    expect(filterHours(points, '2026-07-03T00:00:00Z', '2026-07-04T00:00:00Z')).toHaveLength(4)
  })
})
