import { describe, expect, it } from 'vitest'
import {
  FREE_DRIVE_STATION_STALE_AFTER_MS,
  classifyFreeDriveStationWindStatus,
  freeDriveStationFreshness,
} from '@/lib/weather/freeDrive'
import { resolveThresholds } from '@/lib/weather/thresholds'

const NOW = Date.parse('2026-08-01T12:00:00.000Z')
const thresholds = resolveThresholds('none', { cautionWindMs: 10, redWindMs: 15 })

describe('free-drive station safety presentation', () => {
  it('keeps fresh measurements on the existing user thresholds', () => {
    expect(classifyFreeDriveStationWindStatus({
      measuredAtIso: '2026-08-01T11:50:00.000Z',
      meanWindMs: 11,
      gustLast10MinMs: 12,
    }, thresholds, NOW)).toBe('othaegilegt')
  })

  it('fails old, invalid and implausibly future timestamps closed to neutral', () => {
    const station = { meanWindMs: 4, gustLast10MinMs: 5 }
    expect(classifyFreeDriveStationWindStatus({
      ...station,
      measuredAtIso: new Date(NOW - FREE_DRIVE_STATION_STALE_AFTER_MS - 1).toISOString(),
    }, thresholds, NOW)).toBe('no_data')
    expect(classifyFreeDriveStationWindStatus({
      ...station,
      measuredAtIso: 'not-a-time',
    }, thresholds, NOW)).toBe('no_data')
    expect(classifyFreeDriveStationWindStatus({
      ...station,
      measuredAtIso: '2026-08-01T12:06:00.000Z',
    }, thresholds, NOW)).toBe('no_data')
  })

  it('does not convert missing wind into zero', () => {
    expect(classifyFreeDriveStationWindStatus({
      measuredAtIso: '2026-08-01T11:50:00.000Z',
      meanWindMs: null,
      gustLast10MinMs: null,
    }, thresholds, NOW)).toBe('no_wind_data')
  })

  it('reports freshness independently from the wind values', () => {
    expect(freeDriveStationFreshness('2026-08-01T11:45:00.000Z', NOW)).toBe('fresh')
    expect(freeDriveStationFreshness('2026-08-01T11:00:00.000Z', NOW)).toBe('stale')
    expect(freeDriveStationFreshness(null, NOW)).toBe('unknown')
  })
})
