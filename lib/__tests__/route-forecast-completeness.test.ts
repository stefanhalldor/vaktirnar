import { describe, expect, it } from 'vitest'

import { resolveRouteForecastCompleteness } from '@/lib/weather/routeForecastCompleteness'
import type { HourPoint, TravelPointForecast } from '@/lib/weather/types'

const ROUTE_DISTANCE_M = 60_000

function hour(time = '2026-07-10T08:00:00Z'): HourPoint {
  return {
    time,
    airTemperatureC: 10,
    windSpeedMs: 3,
    windGustMs: 5,
    windFromDegrees: 180,
    precipitationMmPerHour: 0,
    symbolCode: 'clearsky_day',
  }
}

function point(routeIndex: number, distanceFromOriginM: number): Omit<TravelPointForecast, 'hours'> {
  return {
    lat: 64 + routeIndex * 0.01,
    lon: -21 + routeIndex * 0.01,
    forecastLat: 64 + routeIndex * 0.01,
    forecastLon: -21 + routeIndex * 0.01,
    routeIndex,
    distanceFromOriginM,
    elapsedFromTripOriginS: routeIndex * 600,
  }
}

const fulfilled = (time?: string) => ({ status: 'fulfilled' as const, value: [hour(time)] })
const rejected = () => ({ status: 'rejected' as const, reason: new Error('private upstream failure') })

describe('resolveRouteForecastCompleteness', () => {
  it('marks every planned point as a complete assessment', () => {
    const resolved = resolveRouteForecastCompleteness({
      plannedPoints: [point(0, 0), point(1, 30_000), point(2, 60_000)],
      settledResults: [fulfilled(), fulfilled(), fulfilled()],
      routeDistanceM: ROUTE_DISTANCE_M,
      routeScope: {
        status: 'full',
        startRouteFraction: 0,
        endRouteFraction: 1,
        startDistanceM: 0,
        endDistanceM: ROUTE_DISTANCE_M,
      },
    })

    expect(resolved.pointForecasts).toHaveLength(3)
    expect(resolved.assessmentCompleteness).toMatchObject({
      status: 'complete',
      assessedStartDistanceM: 0,
      assessedEndDistanceM: ROUTE_DISTANCE_M,
      assessedDistanceM: ROUTE_DISTANCE_M,
      unassessedBeforeM: 0,
      unassessedAfterM: 0,
      forecast: {
        status: 'complete',
        requestedPointCount: 3,
        succeededPointCount: 3,
        failedPointCount: 0,
        assessedPointCount: 3,
        excludedSucceededPointCount: 0,
      },
    })
  })

  it('never treats one successful point as complete truth for a positive route', () => {
    const resolved = resolveRouteForecastCompleteness({
      plannedPoints: [point(0, 0)],
      settledResults: [fulfilled()],
      routeDistanceM: ROUTE_DISTANCE_M,
      routeScope: {
        status: 'full',
        startRouteFraction: 0,
        endRouteFraction: 1,
        startDistanceM: 0,
        endDistanceM: ROUTE_DISTANCE_M,
      },
    })

    expect(resolved.pointForecasts).toEqual([])
    expect(resolved.assessmentCompleteness).toMatchObject({
      status: 'unavailable',
      reason: 'forecast_unavailable',
      assessedDistanceM: 0,
      forecast: {
        status: 'unavailable',
        requestedPointCount: 1,
        succeededPointCount: 1,
        failedPointCount: 0,
        assessedPointCount: 0,
        excludedSucceededPointCount: 1,
      },
    })
  })

  it('marks an all-successful plan partial when it does not reach the end boundary', () => {
    const resolved = resolveRouteForecastCompleteness({
      plannedPoints: [point(0, 0), point(1, 20_000)],
      settledResults: [fulfilled(), fulfilled()],
      routeDistanceM: ROUTE_DISTANCE_M,
      routeScope: {
        status: 'full',
        startRouteFraction: 0,
        endRouteFraction: 1,
        startDistanceM: 0,
        endDistanceM: ROUTE_DISTANCE_M,
      },
    })

    expect(resolved.pointForecasts.map(item => item.routeIndex)).toEqual([0, 1])
    expect(resolved.assessmentCompleteness).toMatchObject({
      status: 'partial',
      reason: 'forecast_incomplete',
      assessedEndDistanceM: 20_000,
      unassessedAfterM: 40_000,
      forecast: {
        status: 'partial',
        requestedPointCount: 2,
        succeededPointCount: 2,
        failedPointCount: 0,
        assessedPointCount: 2,
      },
    })
  })

  it('fails unavailable when an all-successful plan omits the start boundary', () => {
    const resolved = resolveRouteForecastCompleteness({
      plannedPoints: [point(0, 10_000), point(1, ROUTE_DISTANCE_M)],
      settledResults: [fulfilled(), fulfilled()],
      routeDistanceM: ROUTE_DISTANCE_M,
      routeScope: {
        status: 'full',
        startRouteFraction: 0,
        endRouteFraction: 1,
        startDistanceM: 0,
        endDistanceM: ROUTE_DISTANCE_M,
      },
    })

    expect(resolved.pointForecasts).toEqual([])
    expect(resolved.assessmentCompleteness).toMatchObject({
      status: 'unavailable',
      reason: 'forecast_unavailable',
      assessedDistanceM: 0,
      forecast: {
        status: 'unavailable',
        assessedPointCount: 0,
        excludedSucceededPointCount: 2,
      },
    })
  })

  it('assesses only the uninterrupted prefix when the trailing forecast fails', () => {
    const resolved = resolveRouteForecastCompleteness({
      plannedPoints: [point(0, 0), point(1, 25_000), point(2, 60_000)],
      settledResults: [fulfilled(), fulfilled(), rejected()],
      routeDistanceM: ROUTE_DISTANCE_M,
      routeScope: {
        status: 'full',
        startRouteFraction: 0,
        endRouteFraction: 1,
        startDistanceM: 0,
        endDistanceM: ROUTE_DISTANCE_M,
      },
    })

    expect(resolved.pointForecasts.map(item => item.routeIndex)).toEqual([0, 1])
    expect(resolved.assessmentCompleteness).toMatchObject({
      status: 'partial',
      reason: 'forecast_incomplete',
      assessedEndDistanceM: 25_000,
      assessedEndRouteFraction: 25_000 / ROUTE_DISTANCE_M,
      unassessedAfterM: 35_000,
      forecast: {
        status: 'partial',
        requestedPointCount: 3,
        succeededPointCount: 2,
        failedPointCount: 1,
        assessedPointCount: 2,
        excludedSucceededPointCount: 0,
      },
    })
  })

  it('never crosses a forecast gap even when later points succeed', () => {
    const resolved = resolveRouteForecastCompleteness({
      plannedPoints: [point(0, 0), point(1, 20_000), point(2, 40_000), point(3, 60_000)],
      settledResults: [fulfilled(), fulfilled(), rejected(), fulfilled()],
      routeDistanceM: ROUTE_DISTANCE_M,
      routeScope: {
        status: 'full',
        startRouteFraction: 0,
        endRouteFraction: 1,
        startDistanceM: 0,
        endDistanceM: ROUTE_DISTANCE_M,
      },
    })

    expect(resolved.pointForecasts.map(item => item.routeIndex)).toEqual([0, 1])
    expect(resolved.assessmentCompleteness).toMatchObject({
      status: 'partial',
      reason: 'forecast_gap',
      assessedEndDistanceM: 20_000,
      forecast: {
        succeededPointCount: 3,
        failedPointCount: 1,
        assessedPointCount: 2,
        excludedSucceededPointCount: 1,
      },
    })
  })

  it('returns unavailable instead of treating one survivor as route truth', () => {
    const resolved = resolveRouteForecastCompleteness({
      plannedPoints: [point(0, 5_000), point(1, 30_000), point(2, 60_000)],
      settledResults: [fulfilled(), rejected(), fulfilled()],
      routeDistanceM: ROUTE_DISTANCE_M,
      routeScope: {
        status: 'full',
        startRouteFraction: 0,
        endRouteFraction: 1,
        startDistanceM: 0,
        endDistanceM: ROUTE_DISTANCE_M,
      },
    })

    expect(resolved.pointForecasts).toEqual([])
    expect(resolved.assessmentCompleteness).toMatchObject({
      status: 'unavailable',
      reason: 'forecast_unavailable',
      assessedDistanceM: 0,
      unassessedAfterM: ROUTE_DISTANCE_M,
      forecast: {
        status: 'unavailable',
        requestedPointCount: 3,
        succeededPointCount: 2,
        failedPointCount: 1,
        assessedPointCount: 0,
        excludedSucceededPointCount: 2,
      },
    })
  })

  it('keeps route-scope and forecast completeness as independent inputs', () => {
    const resolved = resolveRouteForecastCompleteness({
      plannedPoints: [point(0, 12_000), point(1, 48_000)],
      settledResults: [fulfilled(), fulfilled()],
      routeDistanceM: ROUTE_DISTANCE_M,
      routeScope: {
        status: 'partial',
        startRouteFraction: 0.2,
        endRouteFraction: 0.8,
        startDistanceM: 12_000,
        endDistanceM: 48_000,
      },
    })

    expect(resolved.assessmentCompleteness).toMatchObject({
      status: 'partial',
      reason: 'route_scope_partial',
      assessedStartRouteFraction: 0.2,
      assessedEndRouteFraction: 0.8,
      assessedStartDistanceM: 12_000,
      assessedEndDistanceM: 48_000,
      assessedDistanceM: 36_000,
      unassessedBeforeM: 12_000,
      unassessedAfterM: 12_000,
      forecast: { status: 'complete' },
    })
    expect(JSON.stringify(resolved.assessmentCompleteness)).not.toContain('64.')
    expect(JSON.stringify(resolved.assessmentCompleteness)).not.toContain('-21.')
  })
})
