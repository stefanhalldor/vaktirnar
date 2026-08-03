import { describe, expect, it } from 'vitest'
import {
  FREE_DRIVE_STATION_STALE_AFTER_MS,
  freeDriveStationFreshness,
} from '@/lib/weather/freeDrive'
import { classifyLiveVegagerdinStationWindStatus } from '@/lib/weather/liveVegagerdinStation'
import { resolveThresholds, windThresholdInputsMatchSaved } from '@/lib/weather/thresholds'

const NOW = Date.parse('2026-08-01T12:00:00.000Z')
const thresholds = resolveThresholds('none', { cautionWindMs: 10, redWindMs: 15 })

describe('free-drive station safety presentation', () => {
  it('keeps fresh measurements on the existing user thresholds', () => {
    expect(classifyLiveVegagerdinStationWindStatus({
      meanWindMs: 11,
      gustLast10MinMs: 12,
    }, thresholds)).toBe('othaegilegt')
  })

  it('classifies wind without coupling the result to a measurement timestamp', () => {
    expect(classifyLiveVegagerdinStationWindStatus({
      meanWindMs: 4,
      gustLast10MinMs: 5,
    }, thresholds)).toBe('innan-marka')
    expect(classifyLiveVegagerdinStationWindStatus({
      meanWindMs: 4,
      gustLast10MinMs: 16,
    }, thresholds)).toBe('haettulegt')
  })

  it('does not convert missing wind into zero', () => {
    expect(classifyLiveVegagerdinStationWindStatus({
      meanWindMs: null,
      gustLast10MinMs: null,
    }, thresholds)).toBe('no_wind_data')
  })

  it('reports freshness independently from the wind values', () => {
    expect(FREE_DRIVE_STATION_STALE_AFTER_MS).toBe(15 * 60 * 1_000)
    expect(freeDriveStationFreshness('2026-08-01T11:45:00.001Z', NOW)).toBe('fresh')
    expect(freeDriveStationFreshness('2026-08-01T11:45:01.000Z', NOW)).toBe('fresh')
    expect(freeDriveStationFreshness('2026-08-01T11:45:00.000Z', NOW)).toBe('fresh')
    expect(freeDriveStationFreshness('2026-08-01T11:44:59.999Z', NOW)).toBe('stale')
    expect(freeDriveStationFreshness(
      '2026-08-01T09:45:00.000Z',
      Date.parse('2026-08-01T10:00:59.999Z'),
    )).toBe('fresh')
    expect(freeDriveStationFreshness(
      '2026-08-01T09:45:00.000Z',
      Date.parse('2026-08-01T10:01:00.000Z'),
    )).toBe('stale')
    expect(freeDriveStationFreshness('2026-08-01T11:00:00.000Z', NOW)).toBe('stale')
    expect(freeDriveStationFreshness(null, NOW)).toBe('unknown')
    expect(freeDriveStationFreshness('not-a-date', NOW)).toBe('unknown')
  })

  it('matches manually entered or reused wind limits against saved thresholds numerically', () => {
    const saved = { cautionWindMs: 10, redWindMs: 15 }
    expect(windThresholdInputsMatchSaved('10', '15', saved)).toBe(true)
    expect(windThresholdInputsMatchSaved('10.0', '15.00', saved)).toBe(true)
    expect(windThresholdInputsMatchSaved('9', '15', saved)).toBe(false)
    expect(windThresholdInputsMatchSaved('', '15', saved)).toBe(false)
    expect(windThresholdInputsMatchSaved('10', '15', null)).toBe(false)
  })
})
