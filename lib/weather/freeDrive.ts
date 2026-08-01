export type LiveDriveMode = 'off' | 'route' | 'free-drive'

export type FreeDriveStationFreshness = 'fresh' | 'stale' | 'unknown'

export const FREE_DRIVE_STATION_STALE_AFTER_MS = 15 * 60 * 1_000
export const FREE_DRIVE_STATION_FUTURE_TOLERANCE_MS = 5 * 60 * 1_000

export function freeDriveStationFreshness(
  measuredAtIso: string | null | undefined,
  nowMs = Date.now(),
): FreeDriveStationFreshness {
  if (!measuredAtIso) return 'unknown'
  const measuredAtMs = Date.parse(measuredAtIso)
  if (!Number.isFinite(measuredAtMs)) return 'unknown'
  if (measuredAtMs > nowMs + FREE_DRIVE_STATION_FUTURE_TOLERANCE_MS) return 'unknown'
  if (nowMs - measuredAtMs >= FREE_DRIVE_STATION_STALE_AFTER_MS) return 'stale'
  return 'fresh'
}
