import type { VegagerdinRouteLayerPoint } from '@/lib/road-intelligence/vegagerdinRouteLayer'
import type { VegagerdinCurrentStationDto } from '@/lib/weather/providers/vegagerdinCurrentTypes'
import type { ResolvedTravelThresholds } from '@/lib/weather/types'
import type { WindDisplayStatus } from '@/lib/weather/windDisplayStatus'
import { classifyFreeDriveStationWindStatus, freeDriveStationFreshness } from './freeDrive'

/**
 * Provider-current presentation model shared by route-bound and route-less
 * live driving. Route matching and ETA deliberately stay outside this model.
 */
export type LiveVegagerdinStation = {
  provider: 'vegagerdin'
  stationId: string
  stationName: string
  lat: number
  lon: number
  measuredAtIso: string
  fetchedAtIso: string
  meanWindMs: number | null
  gustLast10MinMs: number | null
  windDirectionDeg: number | null
  windDirectionText: string | null
  airTemperatureC: number | null
  roadTemperatureC: number | null
  dataQuality: 'complete' | 'partial'
  displayStatus: WindDisplayStatus
  freshness: 'fresh' | 'stale' | 'unknown'
}

export const LIVE_DRIVE_TEMPERATURE_MAX_C = 2

export function liveDriveTemperatureValue(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value <= LIVE_DRIVE_TEMPERATURE_MAX_C
    ? value
    : null
}

export function liveVegagerdinStationFromRoutePoint(
  point: VegagerdinRouteLayerPoint,
): LiveVegagerdinStation {
  return {
    provider: 'vegagerdin',
    stationId: point.stationId,
    stationName: point.stationName,
    lat: point.lat,
    lon: point.lon,
    measuredAtIso: point.measuredAtIso,
    fetchedAtIso: point.fetchedAtIso,
    meanWindMs: point.meanWindMs,
    gustLast10MinMs: point.gustLast10MinMs,
    windDirectionDeg: point.windDirectionDeg,
    windDirectionText: point.windDirectionText,
    airTemperatureC: point.airTemperatureC,
    roadTemperatureC: point.roadTemperatureC,
    dataQuality: point.dataQuality,
    displayStatus: point.windDisplayStatus,
    freshness: freeDriveStationFreshness(point.measuredAtIso),
  }
}

export function liveVegagerdinStationFromCurrent(
  station: VegagerdinCurrentStationDto,
  thresholds: ResolvedTravelThresholds,
  nowMs = Date.now(),
): LiveVegagerdinStation {
  return {
    ...station,
    provider: 'vegagerdin',
    displayStatus: classifyFreeDriveStationWindStatus(station, thresholds, nowMs),
    freshness: freeDriveStationFreshness(station.measuredAtIso, nowMs),
  }
}
