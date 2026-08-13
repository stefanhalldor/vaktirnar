export const VEGAGERDIN_STATION_EXTERNAL_ONLY_AFTER_MS = 90 * 60 * 1_000
export const VEGAGERDIN_STATION_WARNING_AFTER_MS = 20 * 60 * 1_000

export function vegagerdinStationUrl(stationId: string): string | null {
  return /^\d{1,8}$/.test(stationId)
    ? `https://umferdin.is/vedurstodvar/${stationId}`
    : null
}

export function vegagerdinStationAgeMs(
  measuredAtIso: string | null | undefined,
  nowMs = Date.now(),
): number | null {
  if (!measuredAtIso) return null
  const measuredAtMs = Date.parse(measuredAtIso)
  if (!Number.isFinite(measuredAtMs) || measuredAtMs > nowMs + 5 * 60 * 1_000) return null
  return Math.max(0, nowMs - measuredAtMs)
}

export function shouldOpenVegagerdinStationExternally(
  measuredAtIso: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  const ageMs = vegagerdinStationAgeMs(measuredAtIso, nowMs)
  return ageMs !== null && ageMs >= VEGAGERDIN_STATION_EXTERNAL_ONLY_AFTER_MS
}

export function shouldWarnVegagerdinStationAge(
  measuredAtIso: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  const ageMs = vegagerdinStationAgeMs(measuredAtIso, nowMs)
  return ageMs !== null && ageMs >= VEGAGERDIN_STATION_WARNING_AFTER_MS
}
