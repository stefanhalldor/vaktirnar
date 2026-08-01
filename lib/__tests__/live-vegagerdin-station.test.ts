import { describe, expect, it } from 'vitest'
import { resolveThresholds } from '@/lib/weather/thresholds'
import {
  liveDriveTemperatureValue,
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
    const fromRoute = liveVegagerdinStationFromRoutePoint(routePoint)

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

  it('fails stale and future route-less measurements closed', () => {
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

    expect(stale.displayStatus).toBe('no_data')
    expect(stale.freshness).toBe('stale')
    expect(future.displayStatus).toBe('no_data')
    expect(future.freshness).toBe('unknown')
  })

  it('uses one live temperature boundary for both drive modes', () => {
    expect(liveDriveTemperatureValue(-4)).toBe(-4)
    expect(liveDriveTemperatureValue(2)).toBe(2)
    expect(liveDriveTemperatureValue(2.1)).toBeNull()
    expect(liveDriveTemperatureValue(null)).toBeNull()
  })
})
