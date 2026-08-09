export type LiveDriveMode = 'off' | 'route' | 'free-drive'

export type FreeDriveStationFreshness = 'fresh' | 'stale' | 'unknown'

export const FREE_DRIVE_STATION_STALE_AFTER_MS = 15 * 60 * 1_000
export const FREE_DRIVE_STATION_VERY_STALE_AFTER_MS = 20 * 60 * 1_000
export const FREE_DRIVE_STATION_FUTURE_TOLERANCE_MS = 5 * 60 * 1_000
const MINUTE_MS = 60 * 1_000

function visibleMeasurementAgeMs(measuredAtMs: number, nowMs: number): number {
  const measuredMinuteMs = Math.floor(measuredAtMs / MINUTE_MS) * MINUTE_MS
  const currentMinuteMs = Math.floor(nowMs / MINUTE_MS) * MINUTE_MS
  return currentMinuteMs - measuredMinuteMs
}

export function freeDriveStationFreshness(
  measuredAtIso: string | null | undefined,
  nowMs = Date.now(),
): FreeDriveStationFreshness {
  if (!measuredAtIso) return 'unknown'
  const measuredAtMs = Date.parse(measuredAtIso)
  if (!Number.isFinite(measuredAtMs)) return 'unknown'
  if (measuredAtMs > nowMs + FREE_DRIVE_STATION_FUTURE_TOLERANCE_MS) return 'unknown'
  // The UI presents measurements and the current time to whole minutes. Compare
  // the same visible minute buckets so a 09:45 measurement remains fresh for
  // the full 10:00 minute and first becomes stale at 10:01.
  if (visibleMeasurementAgeMs(measuredAtMs, nowMs) > FREE_DRIVE_STATION_STALE_AFTER_MS) {
    return 'stale'
  }
  return 'fresh'
}

export function freeDriveStationIsVeryStale(
  measuredAtIso: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!measuredAtIso) return false
  const measuredAtMs = Date.parse(measuredAtIso)
  if (!Number.isFinite(measuredAtMs)) return false
  if (measuredAtMs > nowMs + FREE_DRIVE_STATION_FUTURE_TOLERANCE_MS) return false
  return visibleMeasurementAgeMs(measuredAtMs, nowMs) > FREE_DRIVE_STATION_VERY_STALE_AFTER_MS
}
