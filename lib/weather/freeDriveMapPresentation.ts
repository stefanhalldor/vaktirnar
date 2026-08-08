import type { LiveLocationPoint } from '@/lib/places/liveLocation.client'
import type { RoadIntelligencePlaceResult } from '@/lib/road-intelligence/placeSearchBridge'
import { validateIcelandicCoords } from '@/lib/weather/coords'
import {
  ALL_WIND_DISPLAY_STATUSES,
  type WindDisplayStatus,
} from '@/lib/weather/windDisplayStatus'

export const FREE_DRIVE_WIND_STATUS_FILTER_MODE = 'detailed' as const

export type FreeDriveStationDensityLevel = 'aggregate' | 'compact' | 'full'

export const FREE_DRIVE_AGGREGATE_MARKER_OFFSETS: Record<WindDisplayStatus, [number, number]> = {
  'innan-marka': [-28, -18],
  'nalgast-othaegindi': [0, -20],
  'othaegilegt': [28, -18],
  'nalgast-haettumork': [-20, 18],
  'haettulegt': [20, 18],
  'no_data': [-14, 42],
  'no_wind_data': [14, 42],
}

export function overviewStationClusterKey(
  spatialKey: string,
  status: WindDisplayStatus,
  splitByWindStatus: boolean,
): string {
  return splitByWindStatus ? `${spatialKey}:${status}` : spatialKey
}

export function freeDriveAggregateStatus(status: WindDisplayStatus): WindDisplayStatus {
  return status === 'no_data' ? 'no_wind_data' : status
}

export function createDefaultFreeDriveVisibleWindStatuses(): Set<WindDisplayStatus> {
  return new Set(
    ALL_WIND_DISPLAY_STATUSES.filter(
      status => status !== 'no_data' && status !== 'no_wind_data',
    ),
  )
}

/**
 * Free drive always filters the exact status represented by each pill.
 * Route filter preferences must not collapse neighbouring detailed statuses.
 */
export function isFreeDriveWindStatusVisible(
  status: WindDisplayStatus,
  visibleStatuses: ReadonlySet<WindDisplayStatus>,
): boolean {
  return visibleStatuses.size === 0 || visibleStatuses.has(status)
}

/**
 * Country and regional views stay clustered, while a close driving view keeps
 * every eligible station visible so small camera movements cannot swap a
 * nearby station for another screen-cell representative.
 */
export function freeDriveShowsIndividualStationMarkers(
  densityLevel: FreeDriveStationDensityLevel,
): boolean {
  return densityLevel === 'full'
}

export function freeDriveAggregateStationCountLabel(stationCount: number): string {
  return String(Math.max(0, Math.trunc(stationCount)))
}

export function routeOriginFromLiveLocation(
  point: Pick<LiveLocationPoint, 'lat' | 'lon' | 'accuracyM'>,
  name: string,
): RoadIntelligencePlaceResult | null {
  if (!validateIcelandicCoords(point.lat, point.lon)) return null
  return {
    name,
    lat: point.lat,
    lon: point.lon,
    source: 'device',
    labelSource: 'device',
    sourceId: `device:${point.lat.toFixed(6)}:${point.lon.toFixed(6)}`,
    placeType: 'point',
    ...(point.accuracyM !== null && Number.isFinite(point.accuracyM)
      ? { accuracyM: Math.max(0, point.accuracyM) }
      : {}),
  }
}
