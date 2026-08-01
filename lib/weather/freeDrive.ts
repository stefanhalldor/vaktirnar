import type { ResolvedTravelThresholds } from '@/lib/weather/types'
import type { VegagerdinCurrentStationDto } from '@/lib/weather/providers/vegagerdinCurrentTypes'
import {
  classifyObservationWindDisplayStatus,
  type WindDisplayStatus,
} from '@/lib/weather/windDisplayStatus'

export type LiveDriveMode = 'off' | 'route' | 'free-drive'

export type FreeDriveStationFreshness = 'fresh' | 'stale' | 'unknown'

export const FREE_DRIVE_STATION_STALE_AFTER_MS = 30 * 60 * 1_000
export const FREE_DRIVE_STATION_FUTURE_TOLERANCE_MS = 5 * 60 * 1_000

export function freeDriveStationFreshness(
  measuredAtIso: string | null | undefined,
  nowMs = Date.now(),
): FreeDriveStationFreshness {
  if (!measuredAtIso) return 'unknown'
  const measuredAtMs = Date.parse(measuredAtIso)
  if (!Number.isFinite(measuredAtMs)) return 'unknown'
  if (measuredAtMs > nowMs + FREE_DRIVE_STATION_FUTURE_TOLERANCE_MS) return 'unknown'
  if (nowMs - measuredAtMs > FREE_DRIVE_STATION_STALE_AFTER_MS) return 'stale'
  return 'fresh'
}

/**
 * A route-less live viewer must not present an old or age-unknown observation
 * as a current green result. Fresh measurements keep the user's existing
 * observation thresholds; missing wind remains a separate neutral state.
 */
export function classifyFreeDriveStationWindStatus(
  station: Pick<
    VegagerdinCurrentStationDto,
    'measuredAtIso' | 'meanWindMs' | 'gustLast10MinMs'
  >,
  thresholds: ResolvedTravelThresholds,
  nowMs = Date.now(),
): WindDisplayStatus {
  if (freeDriveStationFreshness(station.measuredAtIso, nowMs) !== 'fresh') {
    return 'no_data'
  }
  const status = classifyObservationWindDisplayStatus({
    meanWindMs: station.meanWindMs,
    gustLast10MinMs: station.gustLast10MinMs,
  }, thresholds)
  return status === 'no_data' ? 'no_wind_data' : status
}
