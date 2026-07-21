/**
 * Provider-aware departure slot status helpers for the Road Intelligence route scrubber.
 *
 * These helpers derive per-slot WindDisplayStatus values from Icelandic provider data
 * (Vegagerðin current observations + Veðurstofan ETA-matched forecasts), replacing the
 * default MET/Yr candidate classification when provider data is available.
 *
 * Design contract:
 * - Vegagerðin current observations are RAUNGILDI (current measured values). They do NOT
 *   change per departure slot — the same station status applies as a floor across all slots.
 * - Veðurstofan forecast rows CAN vary per slot — ETA at each station is computed as:
 *     anchorMs = departureMs + routeFraction * routeDurationMs
 * - When both providers are present, each slot takes the WORST of:
 *     Vegagerðin current worst + Veðurstofan ETA forecast worst at that departure time
 * - When neither provider has route station data, returns null so the caller can fall back
 *   to MET/Yr native candidate classification.
 */

import {
  ALL_WIND_DISPLAY_STATUSES,
  classifyCandidateWindDisplayStatus,
  classifyForecastWindDisplayStatusAt,
  worstWindDisplayStatus,
  type WindDisplayStatus,
} from '@/lib/weather/windDisplayStatus'
import { resolveThresholds } from '@/lib/weather/thresholds'
import type {
  ResolvedTravelThresholds,
  TravelCandidate,
  TravelWindow,
  WeatherStatus,
} from '@/lib/weather/types'
import type { VedurstofanTravelLayer } from '@/lib/weather/providers/vedurstofanBlend'

/**
 * Returns the worst WindDisplayStatus in the counts map, using severity order.
 * Returns null if no statuses have positive counts.
 */
export function worstWindDisplayStatusFromCounts(
  counts: Partial<Record<WindDisplayStatus, number>>,
): WindDisplayStatus | null {
  let worst: WindDisplayStatus | null = null
  for (const status of ALL_WIND_DISPLAY_STATUSES) {
    if ((counts[status] ?? 0) <= 0) continue
    worst = worst ? worstWindDisplayStatus(worst, status) : status
  }
  return worst
}

/**
 * Computes the distribution of Veðurstofan ETA-matched forecast statuses at a given
 * departure time across all route stations.
 *
 * For each valid Veðurstofan station on the route:
 *   anchorMs = departureMs + station.routeFraction * routeDurationMs
 * The latest forecast row at or before anchorMs is used for classification.
 * If no past row exists, the first future row is used.
 */
export function countVedurstofanForecastStatusesAt(
  layer: VedurstofanTravelLayer | undefined,
  routeDurationMinutes: number,
  thresholds: ResolvedTravelThresholds,
  departureMs: number,
): Partial<Record<WindDisplayStatus, number>> {
  const counts: Partial<Record<WindDisplayStatus, number>> = {}
  const points = Array.isArray(layer?.points) ? layer.points : []
  const validPoints = points.filter(
    (p): p is typeof p & { lat: number; lon: number } =>
      typeof p.lat === 'number' && typeof p.lon === 'number',
  )
  const routeDurationMs = Math.max(0, routeDurationMinutes) * 60_000
  const effectiveDepartureMs = Number.isFinite(departureMs) ? departureMs : Date.now()

  for (const point of validPoints) {
    const anchorMs = effectiveDepartureMs + (point.routeFraction ?? 0) * routeDurationMs
    const status = classifyForecastWindDisplayStatusAt(
      point.forecastRows,
      thresholds,
      anchorMs,
    )
    counts[status] = (counts[status] ?? 0) + 1
  }

  return counts
}

type BuildProviderSlotStatusOverridesParams = {
  candidates: TravelCandidate[]
  thresholds: ResolvedTravelThresholds
  routeDurationMinutes: number
  vedurstofanLayer: VedurstofanTravelLayer | undefined
  vedurstofanStationCount: number
  vegagerdinStatusCounts: Partial<Record<WindDisplayStatus, number>>
  vegagerdinStationCount: number
}

/**
 * Builds per-slot WindDisplayStatus overrides for the DepartureHeatmap scrubber.
 *
 * Returns null when no Icelandic provider data is available, allowing the caller to
 * fall back to MET/Yr native candidate classification in DepartureHeatmap.
 *
 * When overrides are returned, each slot status is the WORST of:
 * - Vegagerðin current observed worst (same for all slots — current conditions)
 * - Veðurstofan ETA-matched forecast worst for that specific departure time
 * If only one provider is present, the other is skipped.
 *
 * Note: Vegagerðin acting as a constant floor means a route with an óþægilegt station
 * will show every departure slot as at least óþægilegt. This is correct behaviour —
 * current conditions apply regardless of when you plan to leave — but callers should
 * consider hiding the MET/Yr bestWindow highlight when overrides are present, since
 * the best-window is no longer meaningful relative to the provider-derived status.
 */
export function buildProviderSlotStatusOverrides({
  candidates,
  thresholds,
  routeDurationMinutes,
  vedurstofanLayer,
  vedurstofanStationCount,
  vegagerdinStatusCounts,
  vegagerdinStationCount,
}: BuildProviderSlotStatusOverridesParams): WindDisplayStatus[] | null {
  const vegagerdinWorst =
    vegagerdinStationCount > 0
      ? worstWindDisplayStatusFromCounts(vegagerdinStatusCounts)
      : null
  const hasVedurstofan = vedurstofanStationCount > 0 && Array.isArray(vedurstofanLayer?.points)

  if (!vegagerdinWorst && !hasVedurstofan) return null

  return candidates.map((candidate) => {
    let providerStatus = vegagerdinWorst
    if (hasVedurstofan) {
      const departureMs = Date.parse(candidate.departureIso)
      const vedurstofanCounts = countVedurstofanForecastStatusesAt(
        vedurstofanLayer,
        routeDurationMinutes,
        thresholds,
        departureMs,
      )
      const vedurstofanWorst = worstWindDisplayStatusFromCounts(vedurstofanCounts)
      if (vedurstofanWorst) {
        providerStatus = providerStatus
          ? worstWindDisplayStatus(providerStatus, vedurstofanWorst)
          : vedurstofanWorst
      }
    }

    // When official Icelandic provider data exists, it owns the displayed slot status.
    // MET/Yr still provides candidate timestamps until the route engine becomes
    // fully provider-native, so we fall back to MET/Yr classification only when
    // no provider status could be computed (shouldn't happen given the guard above).
    return providerStatus ?? classifyCandidateWindDisplayStatus(candidate, thresholds)
  })
}

export function windDisplayStatusToTravelStatus(status: WindDisplayStatus): WeatherStatus {
  switch (status) {
    case 'haettulegt':
      return 'rautt'
    case 'othaegilegt':
    case 'nalgast-haettumork':
    case 'no_data':
    case 'no_wind_data':
      return 'gult'
    default:
      return 'graent'
  }
}

/**
 * Groups provider-derived slot statuses into TravelWindow ranges so the shared
 * DepartureHeatmap can highlight the best provider-native departure window.
 *
 * The route candidate timestamps still define the window boundaries, while the
 * provider slot overrides define the status. If overrides are shorter than the
 * candidate list, only the complete shared prefix is grouped.
 */
export function buildProviderSlotWindows(
  candidates: TravelCandidate[],
  slotStatusOverrides: WindDisplayStatus[],
): TravelWindow[] {
  const count = Math.min(candidates.length, slotStatusOverrides.length)
  if (count === 0) return []

  const firstStatus = windDisplayStatusToTravelStatus(slotStatusOverrides[0])
  const firstReasonCode = ['no_data', 'no_wind_data'].includes(slotStatusOverrides[0])
    ? slotStatusOverrides[0]
    : undefined
  const windows: TravelWindow[] = []
  let cur: TravelWindow = {
    fromIso: candidates[0].departureIso,
    toIso: candidates[0].departureIso,
    status: firstStatus,
    reasonCode: firstReasonCode,
  }

  for (let i = 1; i < count; i++) {
    const candidate = candidates[i]
    const rawStatus = slotStatusOverrides[i]
    const status = windDisplayStatusToTravelStatus(rawStatus)
    const reasonCode = ['no_data', 'no_wind_data'].includes(rawStatus)
      ? rawStatus
      : undefined

    if (status === cur.status) {
      cur = {
        ...cur,
        toIso: candidate.departureIso,
        reasonCode: reasonCode === cur.reasonCode ? cur.reasonCode : undefined,
      }
    } else {
      windows.push(cur)
      cur = {
        fromIso: candidate.departureIso,
        toIso: candidate.departureIso,
        status,
        reasonCode,
      }
    }
  }

  windows.push(cur)
  return windows
}

export function buildProviderBestWindow(
  candidates: TravelCandidate[],
  slotStatusOverrides: WindDisplayStatus[],
): TravelWindow | undefined {
  const windows = buildProviderSlotWindows(candidates, slotStatusOverrides)
  return windows.find((window) => window.status === 'graent') ??
    windows.find((window) => window.status === 'gult')
}

// Default thresholds (no trailer, no overrides) — for tests and callers that need a baseline.
export const DEFAULT_SLOT_THRESHOLDS: ResolvedTravelThresholds = resolveThresholds('none')
