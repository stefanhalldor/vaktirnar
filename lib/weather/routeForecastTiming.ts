import { VEDURSTOFAN_CADENCE_MS } from './vedurstofanFreshness'

/** Maximum accepted distance from a route ETA to a Veðurstofan forecast row. */
export const VEDURSTOFAN_FORECAST_MATCH_TOLERANCE_MS = VEDURSTOFAN_CADENCE_MS / 2

/**
 * Resolves the time a driver reaches a point on the route.
 * Invalid or unplaceable inputs fail closed instead of being treated as the
 * route origin or the current clock time.
 */
export function resolveRouteForecastEtaMs(
  departureMs: number,
  routeDurationMs: number,
  routeFraction: number | null | undefined,
): number | null {
  if (!Number.isFinite(departureMs)) return null
  if (!Number.isFinite(routeDurationMs) || routeDurationMs < 0) return null
  if (
    typeof routeFraction !== 'number'
    || !Number.isFinite(routeFraction)
    || routeFraction < 0
    || routeFraction > 1
  ) return null

  const etaMs = departureMs + routeFraction * routeDurationMs
  return Number.isFinite(etaMs) ? etaMs : null
}
