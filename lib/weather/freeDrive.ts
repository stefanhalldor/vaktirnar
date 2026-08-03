export type LiveDriveMode = 'off' | 'route' | 'free-drive'

export type FreeDriveStationFreshness = 'fresh' | 'stale' | 'unknown'

export const FREE_DRIVE_STATION_STALE_AFTER_MS = 15 * 60 * 1_000
export const FREE_DRIVE_STATION_FUTURE_TOLERANCE_MS = 5 * 60 * 1_000
const MINUTE_MS = 60 * 1_000

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
  const measuredMinuteMs = Math.floor(measuredAtMs / MINUTE_MS) * MINUTE_MS
  const currentMinuteMs = Math.floor(nowMs / MINUTE_MS) * MINUTE_MS
  if (currentMinuteMs - measuredMinuteMs > FREE_DRIVE_STATION_STALE_AFTER_MS) return 'stale'
  return 'fresh'
}
