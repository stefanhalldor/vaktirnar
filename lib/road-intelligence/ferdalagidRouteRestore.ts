export const FERDALAGID_ROUTE_RESTORE_SCHEMA_VERSION = 2
export const FERDALAGID_ROUTE_RESTORE_TTL_MS = 30 * 60 * 1_000

export function isValidFerdalagidRouteRestorePayload(
  data: unknown,
  nowMs = Date.now(),
): boolean {
  if (!data || typeof data !== 'object') return false
  const value = data as Record<string, unknown>
  if (value.schemaVersion !== FERDALAGID_ROUTE_RESTORE_SCHEMA_VERSION) return false
  if (value.step !== 'result') return false
  if (!value.result || typeof value.result !== 'object') return false
  if (!value.origin || typeof value.origin !== 'object') return false
  if (!value.destination || typeof value.destination !== 'object') return false
  if (typeof value.savedAtIso !== 'string') return false
  const savedAtMs = Date.parse(value.savedAtIso)
  const ageMs = nowMs - savedAtMs
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= FERDALAGID_ROUTE_RESTORE_TTL_MS
}

export function isLegacyFerdalagidRouteResult(selectedRouteId: unknown): boolean {
  return typeof selectedRouteId !== 'string'
    || !selectedRouteId.startsWith('teskeid-road-graph-v1')
}
