import type {
  VegagerdinRouteLayer,
  VegagerdinRouteLayerPoint,
} from '@/lib/road-intelligence/vegagerdinRouteLayer'
import type { VegagerdinCurrentStationDto } from '@/lib/weather/providers/vegagerdinCurrentTypes'
import type { ResolvedTravelThresholds } from '@/lib/weather/types'
import {
  classifyObservationWindDisplayStatus,
  type WindDisplayStatus,
} from '@/lib/weather/windDisplayStatus'
import { freeDriveStationFreshness } from './freeDrive'

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

/**
 * Resolve the user-facing freshness of one provider feed. A fresh-looking
 * station timestamp must never override a stale/history cache or provider-wide
 * freshness warning.
 */
export function liveVegagerdinFeedFreshness(
  input: Pick<VegagerdinRouteLayer, 'cacheStatus' | 'measurementFreshness' | 'measuredAtIso'>,
  nowMs = Date.now(),
): LiveVegagerdinStation['freshness'] {
  const stationFreshness = freeDriveStationFreshness(input.measuredAtIso, nowMs)
  if (input.cacheStatus === null && input.measurementFreshness === null) {
    return stationFreshness
  }
  return input.cacheStatus === 'fresh' &&
    input.measurementFreshness === 'fresh' &&
    stationFreshness === 'fresh'
    ? 'fresh'
    : 'stale'
}

export function liveDriveTemperatureValue(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value <= LIVE_DRIVE_TEMPERATURE_MAX_C
    ? value
    : null
}

/**
 * Canonical current-observation classification for Vegagerðin stations in
 * both route-bound and route-less live driving. Measurement age is presented
 * separately and must not replace a real wind reading with a missing-data
 * status.
 */
export function classifyLiveVegagerdinStationWindStatus(
  station: Pick<VegagerdinCurrentStationDto, 'meanWindMs' | 'gustLast10MinMs'>,
  thresholds: ResolvedTravelThresholds,
): WindDisplayStatus {
  const status = classifyObservationWindDisplayStatus({
    meanWindMs: station.meanWindMs,
    gustLast10MinMs: station.gustLast10MinMs,
  }, thresholds)
  return status === 'no_data' ? 'no_wind_data' : status
}

export function liveVegagerdinStationFromRoutePoint(
  point: VegagerdinRouteLayerPoint,
  thresholds: ResolvedTravelThresholds,
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
    displayStatus: classifyLiveVegagerdinStationWindStatus(point, thresholds),
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
    displayStatus: classifyLiveVegagerdinStationWindStatus(station, thresholds),
    freshness: freeDriveStationFreshness(station.measuredAtIso, nowMs),
  }
}
