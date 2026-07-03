/**
 * Unit tests for lib/weather/tools.ts — checkGrillWeather
 */

import { describe, it, expect } from 'vitest'
import { checkGrillWeather, checkGolfWindow } from '@/lib/weather/tools'
import type { HourPoint } from '@/lib/weather/types'

function makeHour(overrides: Partial<HourPoint> = {}): HourPoint {
  return {
    time: '2026-07-03T18:00:00Z',
    airTemperatureC: 15,
    windSpeedMs: 3,
    windGustMs: 5,
    windFromDegrees: 90,
    precipitationMmPerHour: 0,
    symbolCode: 'clearsky_day',
    ...overrides,
  }
}

const FROM = '2026-07-03T18:00:00Z'
const TO   = '2026-07-03T23:00:00Z'

describe('checkGrillWeather — stada graent (ideal conditions)', () => {
  it('returns graent when wind, precip, and temp are all within thresholds', () => {
    const result = checkGrillWeather({
      placeName: 'Reykjavík',
      hours: [makeHour({ windSpeedMs: 5, precipitationMmPerHour: 0, airTemperatureC: 15 })],
      fromIso: FROM,
      toIso: TO,
    })
    expect(result.stada).toBe('graent')
    expect(result.svar).toContain('Reykjavík')
    expect(result.svar).toContain('til að grilla')
    expect(result.source).toBe('deterministic')
    expect(result.toolName).toBe('checkGrillWeather')
  })

  it('includes wind, precip, and temp facts', () => {
    const result = checkGrillWeather({
      placeName: 'Selfoss',
      hours: [makeHour()],
      fromIso: FROM,
      toIso: TO,
    })
    expect(result.facts).toBeDefined()
    expect(result.facts!.some(f => f.includes('Vindur'))).toBe(true)
    expect(result.facts!.some(f => f.includes('Úrkoma'))).toBe(true)
    expect(result.facts!.some(f => f.includes('Hitastig'))).toBe(true)
  })
})

describe('checkGrillWeather — stada rautt (too windy)', () => {
  it('returns rautt when maxWind > 8 m/s', () => {
    const result = checkGrillWeather({
      placeName: 'Reykjavík',
      hours: [makeHour({ windSpeedMs: 9, precipitationMmPerHour: 0, airTemperatureC: 15 })],
      fromIso: FROM,
      toIso: TO,
    })
    expect(result.stada).toBe('rautt')
    expect(result.reasonCode).toBe('too_windy')
    expect(result.suggestedAction).toBeDefined()
  })

  it('uses max wind across multiple hours', () => {
    const result = checkGrillWeather({
      placeName: 'Akureyri',
      hours: [
        makeHour({ windSpeedMs: 4 }),
        makeHour({ time: '2026-07-03T19:00:00Z', windSpeedMs: 10 }),
      ],
      fromIso: FROM,
      toIso: TO,
    })
    expect(result.stada).toBe('rautt')
  })

  it('wind at exactly 8 m/s is not rautt (threshold is strictly >)', () => {
    const result = checkGrillWeather({
      placeName: 'Selfoss',
      hours: [makeHour({ windSpeedMs: 8 })],
      fromIso: FROM,
      toIso: TO,
    })
    expect(result.stada).not.toBe('rautt')
  })
})

describe('checkGrillWeather — stada gult (precipitation)', () => {
  it('returns gult when maxPrecip > 0.1 mm/h', () => {
    const result = checkGrillWeather({
      placeName: 'Selfoss',
      hours: [makeHour({ windSpeedMs: 3, precipitationMmPerHour: 0.5, airTemperatureC: 15 })],
      fromIso: FROM,
      toIso: TO,
    })
    expect(result.stada).toBe('gult')
    expect(result.reasonCode).toBe('precipitation')
  })

  it('precipitation at exactly 0.1 mm/h is not gult (threshold is strictly >)', () => {
    const result = checkGrillWeather({
      placeName: 'Selfoss',
      hours: [makeHour({ windSpeedMs: 3, precipitationMmPerHour: 0.1, airTemperatureC: 15 })],
      fromIso: FROM,
      toIso: TO,
    })
    expect(result.stada).not.toBe('gult')
  })
})

describe('checkGrillWeather — stada gult (cold)', () => {
  it('returns gult when avgTemp < 5°C', () => {
    const result = checkGrillWeather({
      placeName: 'Akureyri',
      hours: [makeHour({ windSpeedMs: 2, precipitationMmPerHour: 0, airTemperatureC: 4 })],
      fromIso: FROM,
      toIso: TO,
    })
    expect(result.stada).toBe('gult')
    expect(result.reasonCode).toBe('cold')
  })

  it('temp exactly 5°C is not gult (threshold is strictly <)', () => {
    const result = checkGrillWeather({
      placeName: 'Akureyri',
      hours: [makeHour({ windSpeedMs: 2, precipitationMmPerHour: 0, airTemperatureC: 5 })],
      fromIso: FROM,
      toIso: TO,
    })
    expect(result.stada).not.toBe('gult')
  })
})

describe('checkGrillWeather — priority: rautt wins over gult', () => {
  it('returns rautt even when precip is also high', () => {
    const result = checkGrillWeather({
      placeName: 'Selfoss',
      hours: [makeHour({ windSpeedMs: 10, precipitationMmPerHour: 5, airTemperatureC: 2 })],
      fromIso: FROM,
      toIso: TO,
    })
    expect(result.stada).toBe('rautt')
    expect(result.reasonCode).toBe('too_windy')
  })
})

describe('checkGrillWeather — no data', () => {
  it('returns gult with no_data reasonCode when window has no matching hours', () => {
    const result = checkGrillWeather({
      placeName: 'Mosfellsbær',
      hours: [makeHour({ time: '2026-07-04T10:00:00Z' })],
      fromIso: FROM,
      toIso: TO,
    })
    expect(result.stada).toBe('gult')
    expect(result.reasonCode).toBe('no_data')
    expect(result.svar).toContain('Mosfellsbær')
  })
})

// ── checkGolfWindow ───────────────────────────────────────────────────────────

// 14 hours of data for "á morgun" window (08:00–21:00)
function makeGolfHours(overrides: Partial<HourPoint>[] = []): HourPoint[] {
  return Array.from({ length: 14 }, (_, i) =>
    makeHour({
      time: `2026-07-04T${(8 + i).toString().padStart(2, '0')}:00:00Z`,
      windSpeedMs: 4,
      windGustMs: 6,
      precipitationMmPerHour: 0,
      airTemperatureC: 14,
      ...(overrides[i] ?? {}),
    })
  )
}

const GOLF_FROM = '2026-07-04T08:00:00Z'
const GOLF_TO   = '2026-07-04T22:00:00Z'

describe('checkGolfWindow — stada graent (ideal conditions)', () => {
  it('returns graent when wind and precip are within golf thresholds', () => {
    const result = checkGolfWindow({
      placeName: 'Grafarholt',
      hours: makeGolfHours(),
      fromIso: GOLF_FROM,
      toIso: GOLF_TO,
    })
    expect(result.stada).toBe('graent')
    expect(result.source).toBe('deterministic')
    expect(result.toolName).toBe('checkGolfWindow')
    expect(result.svar).toContain('Grafarholt')
  })

  it('wind at 10-11 m/s is not rautt (below hardWindMs of 17)', () => {
    const result = checkGolfWindow({
      placeName: 'Grafarholt',
      hours: makeGolfHours(Array(14).fill({ windSpeedMs: 11, windGustMs: 14 })),
      fromIso: GOLF_FROM,
      toIso: GOLF_TO,
    })
    expect(result.stada).not.toBe('rautt')
  })

  it('wind at 12 m/s is not rautt', () => {
    const result = checkGolfWindow({
      placeName: 'Grafarholt',
      hours: makeGolfHours(Array(14).fill({ windSpeedMs: 12 })),
      fromIso: GOLF_FROM,
      toIso: GOLF_TO,
    })
    expect(result.stada).not.toBe('rautt')
  })
})

describe('checkGolfWindow — stada gult (discomfort wind)', () => {
  it('returns gult when wind is 13 m/s (discomfortWindMs)', () => {
    const result = checkGolfWindow({
      placeName: 'Grafarholt',
      hours: makeGolfHours(Array(14).fill({ windSpeedMs: 13 })),
      fromIso: GOLF_FROM,
      toIso: GOLF_TO,
    })
    expect(result.stada).toBe('gult')
    expect(result.reasonCode).toBe('discomfort_wind_golf')
  })

  it('returns gult when precipitation is present (wind otherwise ok)', () => {
    const result = checkGolfWindow({
      placeName: 'Grafarholt',
      hours: makeGolfHours(Array(14).fill({ windSpeedMs: 5, precipitationMmPerHour: 0.5 })),
      fromIso: GOLF_FROM,
      toIso: GOLF_TO,
    })
    expect(result.stada).toBe('gult')
    expect(result.reasonCode).toBe('precipitation')
  })
})

describe('checkGolfWindow — stada rautt (too windy)', () => {
  it('returns rautt when wind is at hardWindMs (17 m/s)', () => {
    const result = checkGolfWindow({
      placeName: 'Grafarholt',
      hours: makeGolfHours(Array(14).fill({ windSpeedMs: 17 })),
      fromIso: GOLF_FROM,
      toIso: GOLF_TO,
    })
    expect(result.stada).toBe('rautt')
    expect(result.reasonCode).toBe('too_windy_golf')
  })

  it('returns rautt when wind exceeds 17 m/s', () => {
    const result = checkGolfWindow({
      placeName: 'Grafarholt',
      hours: makeGolfHours(Array(14).fill({ windSpeedMs: 20 })),
      fromIso: GOLF_FROM,
      toIso: GOLF_TO,
    })
    expect(result.stada).toBe('rautt')
  })
})

describe('checkGolfWindow — best window selection', () => {
  it('picks the calmest window when hours vary', () => {
    // Hours 08-12: windy (15 m/s), hours 13-17: calm (3 m/s)
    const mixed = [
      ...Array(5).fill({ windSpeedMs: 15 }),
      ...Array(9).fill({ windSpeedMs: 3 }),
    ]
    const result = checkGolfWindow({
      placeName: 'Grafarholt',
      hours: makeGolfHours(mixed),
      fromIso: GOLF_FROM,
      toIso: GOLF_TO,
    })
    expect(result.stada).toBe('graent')
    expect(result.svar).toContain('13:00')  // calm window starts at 13:00
  })

  it('returns up to 3 non-overlapping windows in facts', () => {
    const result = checkGolfWindow({
      placeName: 'Grafarholt',
      hours: makeGolfHours(),
      fromIso: GOLF_FROM,
      toIso: GOLF_TO,
    })
    expect(result.facts).toBeDefined()
    expect(result.facts!.length).toBeGreaterThanOrEqual(2) // best + at least 1 alternative
    expect(result.facts!.length).toBeLessThanOrEqual(3)
  })

  it('windows field contains GolfWindow objects', () => {
    const result = checkGolfWindow({
      placeName: 'Grafarholt',
      hours: makeGolfHours(),
      fromIso: GOLF_FROM,
      toIso: GOLF_TO,
    })
    expect(result.windows).toBeDefined()
    expect(result.windows!.length).toBeGreaterThanOrEqual(1)
    const w = result.windows![0]
    expect(w.fromIso).toBeDefined()
    expect(w.maxWindMs).toBeTypeOf('number')
    expect(w.stada).toBeDefined()
  })

  it('windows are non-overlapping (each at least 4.5h apart)', () => {
    const result = checkGolfWindow({
      placeName: 'Grafarholt',
      hours: makeGolfHours(),
      fromIso: GOLF_FROM,
      toIso: GOLF_TO,
    })
    const ws = result.windows!
    if (ws.length >= 2) {
      const gap = new Date(ws[1].fromIso).getTime() - new Date(ws[0].fromIso).getTime()
      expect(gap).toBeGreaterThanOrEqual(4.5 * 60 * 60 * 1000)
    }
  })
})

describe('checkGolfWindow — no data', () => {
  it('returns gult with no_data when window has fewer than 5 hours', () => {
    const result = checkGolfWindow({
      placeName: 'Grafarholt',
      hours: [makeHour({ time: '2026-07-04T10:00:00Z' })],
      fromIso: GOLF_FROM,
      toIso: GOLF_TO,
    })
    expect(result.stada).toBe('gult')
    expect(result.reasonCode).toBe('no_data')
    expect(result.svar).toContain('Grafarholt')
  })
})

describe('checkGolfWindow — result shape', () => {
  it('id starts with dr_', () => {
    const result = checkGolfWindow({
      placeName: 'Grafarholt',
      hours: makeGolfHours(),
      fromIso: GOLF_FROM,
      toIso: GOLF_TO,
    })
    expect(result.id).toMatch(/^dr_/)
  })

  it('includes timeWindow', () => {
    const result = checkGolfWindow({
      placeName: 'Grafarholt',
      hours: makeGolfHours(),
      fromIso: GOLF_FROM,
      toIso: GOLF_TO,
    })
    expect(result.timeWindow?.from).toBe(GOLF_FROM)
    expect(result.timeWindow?.to).toBe(GOLF_TO)
  })

  it('svar mentions place name', () => {
    const result = checkGolfWindow({
      placeName: 'Keilir',
      hours: makeGolfHours(),
      fromIso: GOLF_FROM,
      toIso: GOLF_TO,
    })
    expect(result.svar).toContain('Keilir')
  })
})

describe('checkGolfWindow — grill regression', () => {
  it('checkGrillWeather still works correctly after golf was added', () => {
    const result = checkGrillWeather({
      placeName: 'Mosfellsbær',
      hours: [makeHour({ windSpeedMs: 3, precipitationMmPerHour: 0, airTemperatureC: 15 })],
      fromIso: FROM,
      toIso: TO,
    })
    expect(result.stada).toBe('graent')
    expect(result.toolName).toBe('checkGrillWeather')
  })
})

describe('checkGrillWeather — result shape', () => {
  it('returns an id that starts with dr_', () => {
    const result = checkGrillWeather({
      placeName: 'Reykjavík',
      hours: [makeHour()],
      fromIso: FROM,
      toIso: TO,
    })
    expect(result.id).toMatch(/^dr_/)
  })

  it('returns a createdAt ISO timestamp', () => {
    const result = checkGrillWeather({
      placeName: 'Reykjavík',
      hours: [makeHour()],
      fromIso: FROM,
      toIso: TO,
    })
    expect(() => new Date(result.createdAt)).not.toThrow()
    expect(new Date(result.createdAt).toISOString()).toBe(result.createdAt)
  })

  it('includes timeWindow', () => {
    const result = checkGrillWeather({
      placeName: 'Selfoss',
      hours: [makeHour()],
      fromIso: FROM,
      toIso: TO,
    })
    expect(result.timeWindow?.from).toBe(FROM)
    expect(result.timeWindow?.to).toBe(TO)
  })
})
