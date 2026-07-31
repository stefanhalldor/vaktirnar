/**
 * Provider-aware departure slot status helpers for the Road Intelligence route scrubber.
 *
 * These helpers derive future departure-slot statuses exclusively from
 * Veðurstofan ETA-matched forecasts.
 *
 * Design contract:
 * - Vegagerðin current observations are RAUNGILDI and belong only to the separate
 *   current/live view. They must not color future departure slots.
 * - Veðurstofan forecast rows CAN vary per slot — ETA at each station is computed as:
 *     anchorMs = departureMs + routeFraction * routeDurationMs
 * - Future departure slots are driven only by Veðurstofan ETA-matched forecasts.
 * - MET/Yr candidate weather must never become a silent fallback for these slots.
 * - Missing or partial Veðurstofan coverage must never be displayed as safe.
 */

import {
  ALL_WIND_DISPLAY_STATUSES,
  classifyNearestForecastWindDisplayStatusAt,
  worstWindDisplayStatus,
  type WindDisplayStatus,
} from '@/lib/weather/windDisplayStatus'
import { resolveThresholds } from '@/lib/weather/thresholds'
import { resolveRouteForecastEtaMs } from '@/lib/weather/routeForecastTiming'
import { routeMeasurementGaps } from '@/lib/weather/providerRouteMatching'
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
 * The forecast row closest to anchorMs is used for classification, matching the
 * old /ferdalagid ETA-aware route logic.
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
  const routeDurationMs = routeDurationMinutes * 60_000

  for (const point of validPoints) {
    const anchorMs = resolveRouteForecastEtaMs(
      departureMs,
      routeDurationMs,
      point.routeFraction,
    )
    const status = anchorMs !== null
      ? classifyNearestForecastWindDisplayStatusAt(
          point.forecastRows,
          thresholds,
          anchorMs,
        )
      : 'no_data'
    counts[status] = (counts[status] ?? 0) + 1
  }

  return counts
}

type BuildProviderSlotStatusOverridesParams = {
  candidates: TravelCandidate[]
  thresholds: ResolvedTravelThresholds
  routeDurationMinutes: number
  routeDistanceKm: number
  vedurstofanLayer: VedurstofanTravelLayer | undefined
  vedurstofanStationCount: number
  /** @deprecated Current observations are intentionally ignored for future slots. */
  vegagerdinStatusCounts?: Partial<Record<WindDisplayStatus, number>>
  /** @deprecated Current observations are intentionally ignored for future slots. */
  vegagerdinStationCount?: number
}

const UNKNOWN_WIND_DISPLAY_STATUSES = new Set<WindDisplayStatus>([
  'no_data',
  'no_wind_data',
])

/**
 * Keeps the complete route assessment as the baseline while allowing known
 * station evidence to make the displayed verdict more cautious. Supporting
 * evidence can never downgrade a known route warning. Calm data from one
 * station is also not enough to turn an unassessed route into a safe route.
 */
export function conservativelyCombineWindDisplayStatuses(
  routeStatus: WindDisplayStatus,
  supportingStatus: WindDisplayStatus | null,
): WindDisplayStatus {
  if (!supportingStatus) return routeStatus
  const routeIsUnknown = UNKNOWN_WIND_DISPLAY_STATUSES.has(routeStatus)
  const supportingIsUnknown = UNKNOWN_WIND_DISPLAY_STATUSES.has(supportingStatus)
  if (supportingIsUnknown) return routeStatus
  if (routeIsUnknown && supportingStatus === 'innan-marka') return routeStatus
  return worstWindDisplayStatus(routeStatus, supportingStatus)
}

/**
 * Resolves a future departure slot from Veðurstofan evidence only.
 *
 * A known warning is still useful when another station is missing, so the worst
 * known warning wins. A calm result is only safe when every expected station has
 * a usable forecast value; otherwise the slot is explicitly unassessed.
 */
export function resolveVedurstofanOnlySlotStatus(
  counts: Partial<Record<WindDisplayStatus, number>>,
  expectedStationCount: number,
): WindDisplayStatus {
  let observedCount = 0
  let unknownCount = 0
  let worstKnown: WindDisplayStatus | null = null

  for (const status of ALL_WIND_DISPLAY_STATUSES) {
    const count = Math.max(0, counts[status] ?? 0)
    if (count === 0) continue
    observedCount += count
    if (UNKNOWN_WIND_DISPLAY_STATUSES.has(status)) {
      unknownCount += count
      continue
    }
    worstKnown = worstKnown ? worstWindDisplayStatus(worstKnown, status) : status
  }

  if (worstKnown && worstKnown !== 'innan-marka') return worstKnown

  const expectedCount = Math.max(0, expectedStationCount)
  const hasMissingCoverage =
    expectedCount === 0 || observedCount < expectedCount || unknownCount > 0

  if (hasMissingCoverage) return 'no_data'
  return worstKnown ?? 'no_data'
}

/**
 * Builds Veðurstofan-only per-slot WindDisplayStatus values for the departure scrubber.
 *
 * Always returns one override per candidate. When official forecast coverage is
 * unavailable, the corresponding slot is `no_data`; it never falls back to the
 * MET/Yr weather embedded in the route candidate.
 *
 * Vegagerðin is a current-measurement provider and must never color a future
 * departure slot. It remains a separate safety floor for the standalone Now view.
 */
export function buildProviderSlotStatusOverrides({
  candidates,
  thresholds,
  routeDurationMinutes,
  routeDistanceKm,
  vedurstofanLayer,
  vedurstofanStationCount,
}: BuildProviderSlotStatusOverridesParams): WindDisplayStatus[] {
  const layerPoints = Array.isArray(vedurstofanLayer?.points)
    ? vedurstofanLayer.points
    : []
  const expectedStationCount = Math.max(
    0,
    vedurstofanStationCount,
    vedurstofanLayer?.mappedPointCount ?? 0,
    layerPoints.length,
  )
  const hasCompleteLayerContract =
    vedurstofanLayer?.status === 'available'
    && (vedurstofanLayer.unavailablePointCount ?? 0) === 0
    && expectedStationCount > 0
  const routeFractions = layerPoints
    .map(point => point.routeFraction)
    .filter((fraction): fraction is number =>
      typeof fraction === 'number'
      && Number.isFinite(fraction)
      && fraction >= 0
      && fraction <= 1,
    )
  const hasCompleteSpatialCoverage =
    Number.isFinite(routeDistanceKm)
    && routeDistanceKm > 0
    && routeMeasurementGaps(routeDistanceKm, routeFractions).length === 0

  return candidates.map(candidate => {
    const departureMs = Date.parse(candidate.departureIso)
    const vedurstofanCounts = countVedurstofanForecastStatusesAt(
      vedurstofanLayer,
      routeDurationMinutes,
      thresholds,
      departureMs,
    )
    const status = resolveVedurstofanOnlySlotStatus(
      vedurstofanCounts,
      expectedStationCount,
    )
    return (!hasCompleteLayerContract || !hasCompleteSpatialCoverage)
      && status === 'innan-marka'
      ? 'no_data'
      : status
  })
}

export function windDisplayStatusToTravelStatus(status: WindDisplayStatus): WeatherStatus {
  switch (status) {
    case 'haettulegt':
      return 'rautt'
    case 'othaegilegt':
    case 'nalgast-haettumork':
    case 'nalgast-othaegindi':
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
