import { describe, expect, it } from 'vitest'
import { resolveThresholds } from '@/lib/weather/thresholds'
import {
  classifyLiveVegagerdinStationWindStatus,
  liveDriveTemperatureValue,
  liveVegagerdinFeedFreshness,
  liveVegagerdinStationFromCurrent,
  liveVegagerdinStationFromRoutePoint,
} from '@/lib/weather/liveVegagerdinStation'
import type { VegagerdinCurrentStationDto } from '@/lib/weather/providers/vegagerdinCurrentTypes'
import type { VegagerdinRouteLayerPoint } from '@/lib/road-intelligence/vegagerdinRouteLayer'

const currentStation: VegagerdinCurrentStationDto = {
  stationId: '1',
  stationName: 'Prófunarstöð',
  lat: 64.1,
  lon: -21.9,
  measuredAtIso: '2026-08-01T12:00:00.000Z',
  fetchedAtIso: '2026-08-01T12:01:00.000Z',
  meanWindMs: 11,
  gustLast10MinMs: 13,
  windDirectionDeg: 180,
  windDirectionText: 'S',
  airTemperatureC: 1,
  roadTemperatureC: 3,
  dataQuality: 'complete',
}

describe('live Vegagerðin station presentation', () => {
  it('adapts route-bound and route-less measurements to one model', () => {
    const thresholds = resolveThresholds('none', { cautionWindMs: 10, redWindMs: 15 })
    const fromCurrent = liveVegagerdinStationFromCurrent(
      currentStation,
      thresholds,
      Date.parse('2026-08-01T12:05:00.000Z'),
    )
    const routePoint: VegagerdinRouteLayerPoint = {
      ...currentStation,
      routePointId: 'route:1',
      distanceM: 20,
      distanceFromOriginM: 1_000,
      routeFraction: 0.1,
      windDisplayStatus: fromCurrent.displayStatus,
      statusWindMs: 13,
    }
    const fromRoute = liveVegagerdinStationFromRoutePoint(routePoint, thresholds)

    expect(fromCurrent.displayStatus).toBe('othaegilegt')
    expect(fromRoute).toMatchObject({
      provider: 'vegagerdin',
      stationId: fromCurrent.stationId,
      stationName: fromCurrent.stationName,
      meanWindMs: fromCurrent.meanWindMs,
      gustLast10MinMs: fromCurrent.gustLast10MinMs,
      displayStatus: fromCurrent.displayStatus,
    })
    expect(fromRoute).not.toHaveProperty('routeFraction')
    expect(fromRoute).not.toHaveProperty('distanceFromOriginM')
  })

  it('keeps freshness separate from threshold-based wind status', () => {
    const thresholds = resolveThresholds('none', { cautionWindMs: 10, redWindMs: 15 })
    const stale = liveVegagerdinStationFromCurrent(
      currentStation,
      thresholds,
      Date.parse('2026-08-01T13:00:01.000Z'),
    )
    const future = liveVegagerdinStationFromCurrent(
      { ...currentStation, measuredAtIso: '2026-08-01T13:10:00.000Z' },
      thresholds,
      Date.parse('2026-08-01T13:00:00.000Z'),
    )
    const unknown = liveVegagerdinStationFromCurrent(
      { ...currentStation, measuredAtIso: 'not-a-time' },
      thresholds,
      Date.parse('2026-08-01T13:00:00.000Z'),
    )

    expect(stale.displayStatus).toBe('othaegilegt')
    expect(stale.freshness).toBe('stale')
    expect(future.displayStatus).toBe('othaegilegt')
    expect(future.freshness).toBe('unknown')
    expect(unknown.displayStatus).toBe('othaegilegt')
    expect(unknown.freshness).toBe('unknown')
  })

  it('fails safe when the provider feed is stale even if one station timestamp looks fresh', () => {
    const nowMs = Date.parse('2026-08-01T12:05:00.000Z')
    const measuredAtIso = '2026-08-01T12:00:00.000Z'

    expect(liveVegagerdinFeedFreshness({
      cacheStatus: 'fresh',
      measurementFreshness: 'fresh',
      measuredAtIso,
    }, nowMs)).toBe('fresh')
    expect(liveVegagerdinFeedFreshness({
      cacheStatus: 'history_fallback',
      measurementFreshness: 'fresh',
      measuredAtIso,
    }, nowMs)).toBe('stale')
    expect(liveVegagerdinFeedFreshness({
      cacheStatus: 'fresh',
      measurementFreshness: 'unknown',
      measuredAtIso,
    }, nowMs)).toBe('stale')
  })

  it('uses gust first, falls back to mean wind and reserves no-wind for missing values', () => {
    const thresholds = resolveThresholds('none', { cautionWindMs: 10, redWindMs: 15 })

    expect(classifyLiveVegagerdinStationWindStatus({
      meanWindMs: 4,
      gustLast10MinMs: 16,
    }, thresholds)).toBe('haettulegt')
    expect(classifyLiveVegagerdinStationWindStatus({
      meanWindMs: 12,
      gustLast10MinMs: null,
    }, thresholds)).toBe('othaegilegt')
    expect(classifyLiveVegagerdinStationWindStatus({
      meanWindMs: null,
      gustLast10MinMs: null,
    }, thresholds)).toBe('no_wind_data')
  })

  it('uses one live temperature boundary for both drive modes', () => {
    expect(liveDriveTemperatureValue(-4)).toBe(-4)
    expect(liveDriveTemperatureValue(2)).toBe(2)
    expect(liveDriveTemperatureValue(2.1)).toBeNull()
    expect(liveDriveTemperatureValue(Number.NaN)).toBeNull()
    expect(liveDriveTemperatureValue(null)).toBeNull()
  })
})
