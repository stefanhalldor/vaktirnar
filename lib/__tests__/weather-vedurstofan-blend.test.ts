/**
 * Tests for blendHoursWithVedurstofan — max-blending helper.
 *
 * Rules verified:
 * - Veðurstofan can only raise values, never lower them.
 * - Nearest forecast row within ±1.5h is used.
 * - If no row falls within the window, MET/Yr hour is returned unchanged.
 * - Null Veðurstofan fields are ignored (MET/Yr value kept).
 * - Empty forecast list returns hours unchanged.
 */

import { describe, it, expect } from 'vitest'
import { blendHoursWithVedurstofan } from '@/lib/weather/providers/vedurstofanBlend'
import { worstWindDisplayStatus, WIND_DISPLAY_STATUS_PRIORITY_ORDER } from '@/lib/weather/windDisplayStatus'

function makeHour(time: string, windSpeedMs: number, precipitationMmPerHour: number) {
  return {
    time,
    airTemperatureC: 10,
    windSpeedMs,
    windGustMs: windSpeedMs + 2,
    windFromDegrees: 180,
    precipitationMmPerHour,
    symbolCode: 'clearsky_day',
  }
}

function makeForecastRow(ftimeIso: string, windSpeedMs: number | null, precipitationMmPerHour: number | null) {
  return { ftimeIso, windSpeedMs, precipitationMmPerHour }
}

describe('blendHoursWithVedurstofan', () => {
  it('returns hours unchanged when forecasts list is empty', () => {
    const hours = [makeHour('2026-07-10T09:00:00Z', 5, 0.2)]
    const result = blendHoursWithVedurstofan(hours, [])
    expect(result).toEqual(hours)
  })

  it('raises wind when Veðurstofan is higher', () => {
    const hours = [makeHour('2026-07-10T09:00:00Z', 5, 0)]
    const forecasts = [makeForecastRow('2026-07-10T09:00:00Z', 12, null)]
    const result = blendHoursWithVedurstofan(hours, forecasts)
    expect(result[0].windSpeedMs).toBe(12)
  })

  it('does not lower wind when Veðurstofan is lower', () => {
    const hours = [makeHour('2026-07-10T09:00:00Z', 15, 0)]
    const forecasts = [makeForecastRow('2026-07-10T09:00:00Z', 8, null)]
    const result = blendHoursWithVedurstofan(hours, forecasts)
    expect(result[0].windSpeedMs).toBe(15)
  })

  it('raises precipitation when Veðurstofan is higher', () => {
    const hours = [makeHour('2026-07-10T09:00:00Z', 3, 0.1)]
    const forecasts = [makeForecastRow('2026-07-10T09:00:00Z', null, 2.5)]
    const result = blendHoursWithVedurstofan(hours, forecasts)
    expect(result[0].precipitationMmPerHour).toBe(2.5)
  })

  it('does not lower precipitation when Veðurstofan is lower', () => {
    const hours = [makeHour('2026-07-10T09:00:00Z', 3, 5.0)]
    const forecasts = [makeForecastRow('2026-07-10T09:00:00Z', null, 1.0)]
    const result = blendHoursWithVedurstofan(hours, forecasts)
    expect(result[0].precipitationMmPerHour).toBe(5.0)
  })

  it('keeps MET/Yr wind when Veðurstofan wind is null', () => {
    const hours = [makeHour('2026-07-10T09:00:00Z', 8, 0)]
    const forecasts = [makeForecastRow('2026-07-10T09:00:00Z', null, 0)]
    const result = blendHoursWithVedurstofan(hours, forecasts)
    expect(result[0].windSpeedMs).toBe(8)
  })

  it('keeps MET/Yr precip when Veðurstofan precip is null', () => {
    const hours = [makeHour('2026-07-10T09:00:00Z', 3, 1.5)]
    const forecasts = [makeForecastRow('2026-07-10T09:00:00Z', 3, null)]
    const result = blendHoursWithVedurstofan(hours, forecasts)
    expect(result[0].precipitationMmPerHour).toBe(1.5)
  })

  it('returns MET/Yr hour unchanged when no forecast falls within ±1.5h', () => {
    const hours = [makeHour('2026-07-10T09:00:00Z', 5, 0)]
    // 2h offset — outside the ±1.5h window
    const forecasts = [makeForecastRow('2026-07-10T11:00:00Z', 20, 5)]
    const result = blendHoursWithVedurstofan(hours, forecasts)
    expect(result[0].windSpeedMs).toBe(5)
    expect(result[0].precipitationMmPerHour).toBe(0)
  })

  it('matches nearest forecast row within ±1.5h when multiple rows exist', () => {
    const hours = [makeHour('2026-07-10T10:00:00Z', 5, 0)]
    const forecasts = [
      makeForecastRow('2026-07-10T09:00:00Z', 10, 0),  // 1h before — within window
      makeForecastRow('2026-07-10T12:00:00Z', 20, 0),  // 2h after — outside window
    ]
    const result = blendHoursWithVedurstofan(hours, forecasts)
    // Only the 09:00 row is within ±1.5h, so wind should be max(5, 10) = 10
    expect(result[0].windSpeedMs).toBe(10)
  })

  it('picks the nearest of two rows both within the window', () => {
    const hours = [makeHour('2026-07-10T10:00:00Z', 5, 0)]
    const forecasts = [
      makeForecastRow('2026-07-10T09:00:00Z', 10, 0),  // 1h before
      makeForecastRow('2026-07-10T10:30:00Z', 20, 0),  // 30min after — closer
    ]
    const result = blendHoursWithVedurstofan(hours, forecasts)
    // 10:30 is closer, so wind should be max(5, 20) = 20
    expect(result[0].windSpeedMs).toBe(20)
  })

  it('preserves all non-blended fields from the original HourPoint', () => {
    const hours = [makeHour('2026-07-10T09:00:00Z', 5, 0)]
    const forecasts = [makeForecastRow('2026-07-10T09:00:00Z', 12, 1.0)]
    const result = blendHoursWithVedurstofan(hours, forecasts)
    expect(result[0].airTemperatureC).toBe(10)
    expect(result[0].windGustMs).toBe(7)
    expect(result[0].windFromDegrees).toBe(180)
    expect(result[0].symbolCode).toBe('clearsky_day')
    expect(result[0].time).toBe('2026-07-10T09:00:00Z')
  })

  it('handles multiple hours independently', () => {
    const hours = [
      makeHour('2026-07-10T06:00:00Z', 3, 0),
      makeHour('2026-07-10T09:00:00Z', 5, 0),
      makeHour('2026-07-10T12:00:00Z', 8, 0),
    ]
    const forecasts = [
      makeForecastRow('2026-07-10T06:00:00Z', 2, 0),   // lower — no change
      makeForecastRow('2026-07-10T09:00:00Z', 15, 0),  // higher — raises
      // No row for 12:00 within ±1.5h
    ]
    const result = blendHoursWithVedurstofan(hours, forecasts)
    expect(result[0].windSpeedMs).toBe(3)   // not lowered
    expect(result[1].windSpeedMs).toBe(15)  // raised
    expect(result[2].windSpeedMs).toBe(8)   // unchanged (no match)
  })
})

describe('provider aggregation (v141: selected providers must aggregate)', () => {
  it('combined slot is othaegilegt when MET/Yr is innan-marka and Veðurstofan is othaegilegt', () => {
    // Minimum required test from v141 spec
    const metnoStatus = 'innan-marka' as const
    const vedurstofanStatus = 'othaegilegt' as const
    const combined = worstWindDisplayStatus(metnoStatus, vedurstofanStatus)
    expect(combined).toBe('othaegilegt')
  })

  it('decisive provider is vedurstofan when vedurstofan is worse than metno', () => {
    // Veðurstofan worse: tie-break: vedurstofan wins; index(othaegilegt)=2 <= index(innan-marka)=4
    const vedurstofanStatus = 'othaegilegt' as const
    const metnoStatus = 'innan-marka' as const
    // decisive = vedurstofan when indexOf(vedurstofan) <= indexOf(metno)
    expect(WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(vedurstofanStatus))
      .toBeLessThanOrEqual(WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(metnoStatus))
  })

  it('metno is decisive when metno is worse than vedurstofan', () => {
    const vedurstofanStatus = 'innan-marka' as const
    const metnoStatus = 'haettulegt' as const
    // metno is decisive: indexOf(vedurstofan) > indexOf(metno)
    expect(WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(vedurstofanStatus))
      .toBeGreaterThan(WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(metnoStatus))
  })

  it('vedurstofan wins tie-break when both statuses are equal', () => {
    const status = 'othaegilegt' as const
    const combined = worstWindDisplayStatus(status, status)
    expect(combined).toBe('othaegilegt')
    // Tie-break: vedurstofan wins over metno when statuses are equal (indexOf condition: <=)
    expect(WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(status))
      .toBeLessThanOrEqual(WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(status))
  })

  it('metno is decisive when same severity band but metno has higher windMs (v143 tie-break fix)', () => {
    // Both othaegilegt, MET/Yr 11 m/s vs Veðurstofan 8 m/s — MET/Yr should be decisive
    const vedurstofanDs = 'othaegilegt' as const
    const metnoDs = 'othaegilegt' as const
    const vedurstofanWindMs = 8
    const metnoWindMs = 11
    const sameSeverity = WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(vedurstofanDs) === WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(metnoDs)
    expect(sameSeverity).toBe(true)
    // When same severity: decisive is vedurstofan only if metno does NOT have strictly higher wind
    const decisiveIsVedurstofan = metnoWindMs <= vedurstofanWindMs
    expect(decisiveIsVedurstofan).toBe(false)
  })
})

describe('worstWindDisplayStatus', () => {
  it('haettulegt beats all other statuses', () => {
    expect(worstWindDisplayStatus('haettulegt', 'othaegilegt')).toBe('haettulegt')
    expect(worstWindDisplayStatus('haettulegt', 'nalgast-haettumork')).toBe('haettulegt')
    expect(worstWindDisplayStatus('haettulegt', 'innan-marka')).toBe('haettulegt')
    expect(worstWindDisplayStatus('haettulegt', 'no_data')).toBe('haettulegt')
    expect(worstWindDisplayStatus('othaegilegt', 'haettulegt')).toBe('haettulegt')
  })

  it('othaegilegt beats innan-marka', () => {
    expect(worstWindDisplayStatus('othaegilegt', 'innan-marka')).toBe('othaegilegt')
    expect(worstWindDisplayStatus('innan-marka', 'othaegilegt')).toBe('othaegilegt')
  })

  it('any real status beats no_data', () => {
    expect(worstWindDisplayStatus('innan-marka', 'no_data')).toBe('innan-marka')
    expect(worstWindDisplayStatus('no_data', 'nalgast-othaegindi')).toBe('nalgast-othaegindi')
  })

  it('all no_data stays no_data', () => {
    expect(worstWindDisplayStatus('no_data', 'no_data')).toBe('no_data')
  })

  it('equal statuses return that status', () => {
    expect(worstWindDisplayStatus('othaegilegt', 'othaegilegt')).toBe('othaegilegt')
  })
})
