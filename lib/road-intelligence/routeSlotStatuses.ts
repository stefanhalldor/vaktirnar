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
  classifyPointWindDisplayStatus,
  classifyNearestForecastWindDisplayStatusAt,
  selectNearestForecastRowAt,
  worstWindDisplayStatus,
  type WindDisplayStatus,
} from '@/lib/weather/windDisplayStatus'
import { resolveThresholds } from '@/lib/weather/thresholds'
import { resolveRouteForecastEtaMs } from '@/lib/weather/routeForecastTiming'
import {
  routeMeasurementGaps,
  type RouteMeasurementGap,
} from '@/lib/weather/providerRouteMatching'
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

export type KnownWindDisplayStatus = Exclude<
  WindDisplayStatus,
  'no_data' | 'no_wind_data'
>

export type ProviderSlotCoverageReason =
  | 'invalid_route'
  | 'invalid_timing'
  | 'no_usable_points'
  | 'spatial_gap'
  | 'temporal_gap'
  | 'missing_wind'

type ProviderSlotCoverageDiagnostics = {
  usableStationCount: number
  usableRouteFractions: number[]
  measurementGaps: RouteMeasurementGap[]
  largestGapKm: number
  totalGapKm: number
  invalidRouteFractionCount: number
  temporalGapCount: number
  missingWindCount: number
}

export type ProviderSlotCoverage =
  | (ProviderSlotCoverageDiagnostics & {
      status: 'complete'
      reason: null
    })
  | (ProviderSlotCoverageDiagnostics & {
      status: 'incomplete'
      reason: ProviderSlotCoverageReason
    })

/**
 * Keeps the known wind hazard and route coverage as separate facts.
 * `displayStatus` is the compatibility projection used by filters and dots. It
 * preserves a known warning, while incomplete calm evidence becomes `no_data`.
 * Recommendation logic must additionally require complete coverage.
 */
export type ProviderRouteSlotAssessment = {
  hazardStatus: KnownWindDisplayStatus | null
  coverage: ProviderSlotCoverage
  displayStatus: WindDisplayStatus
  statusCounts: Partial<Record<KnownWindDisplayStatus, number>>
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

function isValidRouteFraction(value: number | null | undefined): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && value <= 1
}

function summarizeMeasurementGaps(gaps: readonly RouteMeasurementGap[]): {
  largestGapKm: number
  totalGapKm: number
} {
  return gaps.reduce(
    (summary, gap) => ({
      largestGapKm: Math.max(summary.largestGapKm, gap.distanceKm),
      totalGapKm: summary.totalGapKm + gap.distanceKm,
    }),
    { largestGapKm: 0, totalGapKm: 0 },
  )
}

/**
 * Builds the canonical Veðurstofan-only assessment for every departure slot.
 *
 * Coverage is calculated from stations that are actually usable for that slot:
 * a valid route position, resolvable ETA, a forecast row inside the existing
 * tolerance, and a finite wind value. Raw provider health remains diagnostic
 * metadata and does not veto a route whose usable evidence closes every gap.
 */
export function buildProviderSlotAssessments({
  candidates,
  thresholds,
  routeDurationMinutes,
  routeDistanceKm,
  vedurstofanLayer,
}: BuildProviderSlotStatusOverridesParams): ProviderRouteSlotAssessment[] {
  const layerPoints = Array.isArray(vedurstofanLayer?.points)
    ? vedurstofanLayer.points
    : []
  const routeIsValid = Number.isFinite(routeDistanceKm) && routeDistanceKm > 0
  const routeDurationMs = routeDurationMinutes * 60_000
  const routeTimingIsValid = Number.isFinite(routeDurationMs) && routeDurationMs >= 0
  const positionedRouteFractions = layerPoints
    .map(point => point.routeFraction)
    .filter(isValidRouteFraction)

  return candidates.map(candidate => {
    const departureMs = Date.parse(candidate.departureIso)
    const timingIsValid = routeTimingIsValid && Number.isFinite(departureMs)
    const usableRouteFractions: number[] = []
    const statusCounts: Partial<Record<KnownWindDisplayStatus, number>> = {}
    let invalidRouteFractionCount = 0
    let temporalGapCount = 0
    let missingWindCount = 0

    for (const point of layerPoints) {
      if (!isValidRouteFraction(point.routeFraction)) {
        invalidRouteFractionCount += 1
        continue
      }

      const etaMs = timingIsValid
        ? resolveRouteForecastEtaMs(
            departureMs,
            routeDurationMs,
            point.routeFraction,
          )
        : null
      if (etaMs === null) {
        temporalGapCount += 1
        continue
      }

      const rowIndex = selectNearestForecastRowAt(point.forecastRows, etaMs)
      if (rowIndex === null) {
        temporalGapCount += 1
        continue
      }

      const windSpeedMs = point.forecastRows[rowIndex]?.windSpeedMs
      if (typeof windSpeedMs !== 'number' || !Number.isFinite(windSpeedMs)) {
        missingWindCount += 1
        continue
      }

      const status = classifyPointWindDisplayStatus(
        windSpeedMs,
        true,
        thresholds,
      )
      if (UNKNOWN_WIND_DISPLAY_STATUSES.has(status)) {
        missingWindCount += 1
        continue
      }

      const knownStatus = status as KnownWindDisplayStatus
      usableRouteFractions.push(point.routeFraction)
      statusCounts[knownStatus] = (statusCounts[knownStatus] ?? 0) + 1
    }

    const hazardStatus = worstWindDisplayStatusFromCounts(statusCounts) as
      | KnownWindDisplayStatus
      | null
    const measurementGaps = routeIsValid
      ? routeMeasurementGaps(routeDistanceKm, usableRouteFractions)
      : []
    const { largestGapKm, totalGapKm } = summarizeMeasurementGaps(measurementGaps)
    const diagnostics: ProviderSlotCoverageDiagnostics = {
      usableStationCount: usableRouteFractions.length,
      usableRouteFractions,
      measurementGaps,
      largestGapKm,
      totalGapKm,
      invalidRouteFractionCount,
      temporalGapCount,
      missingWindCount,
    }

    let coverage: ProviderSlotCoverage
    if (!routeIsValid) {
      coverage = { ...diagnostics, status: 'incomplete', reason: 'invalid_route' }
    } else if (!timingIsValid) {
      coverage = { ...diagnostics, status: 'incomplete', reason: 'invalid_timing' }
    } else if (usableRouteFractions.length === 0) {
      const reason: ProviderSlotCoverageReason =
        temporalGapCount > 0 && missingWindCount === 0
          ? 'temporal_gap'
          : missingWindCount > 0 && temporalGapCount === 0
            ? 'missing_wind'
            : 'no_usable_points'
      coverage = { ...diagnostics, status: 'incomplete', reason }
    } else if (measurementGaps.length > 0) {
      const positionedGaps = routeMeasurementGaps(
        routeDistanceKm,
        positionedRouteFractions,
      )
      coverage = {
        ...diagnostics,
        status: 'incomplete',
        reason: positionedGaps.length > 0
          ? 'spatial_gap'
          : temporalGapCount > 0
            ? 'temporal_gap'
            : missingWindCount > 0
              ? 'missing_wind'
              : 'spatial_gap',
      }
    } else {
      coverage = { ...diagnostics, status: 'complete', reason: null }
    }

    const displayStatus = hazardStatus && hazardStatus !== 'innan-marka'
      ? hazardStatus
      : coverage.status === 'complete'
        ? hazardStatus ?? 'no_data'
        : 'no_data'

    return {
      hazardStatus,
      coverage,
      displayStatus,
      statusCounts,
    }
  })
}

/**
 * Builds Veðurstofan-only per-slot WindDisplayStatus values for the departure scrubber.
 *
 * Always returns one override per candidate. Incomplete calm evidence becomes
 * `no_data`; a known warning is preserved and consumers of this compatibility
 * API must show coverage separately. It never falls back to MET/Yr weather from
 * the route candidate.
 *
 * Vegagerðin is a current-measurement provider and must never color a future
 * departure slot. It remains a separate safety floor for the standalone Now view.
 */
export function buildProviderSlotStatusOverrides(
  params: BuildProviderSlotStatusOverridesParams,
): WindDisplayStatus[] {
  return buildProviderSlotAssessments(params)
    .map(assessment => assessment.displayStatus)
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

    if (status === cur.status && reasonCode === cur.reasonCode) {
      cur = {
        ...cur,
        toIso: candidate.departureIso,
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
  slotStatusesOrAssessments: WindDisplayStatus[] | ProviderRouteSlotAssessment[],
): TravelWindow | undefined {
  const slotStatusOverrides = slotStatusesOrAssessments.map(item =>
    typeof item === 'string'
      ? item
      : item.coverage.status === 'complete'
        ? item.displayStatus
        : 'no_data',
  )
  const windows = buildProviderSlotWindows(candidates, slotStatusOverrides)
  return windows.find((window) => window.status === 'graent') ??
    windows.find((window) => window.status === 'gult' && !window.reasonCode)
}

// Default thresholds (no trailer, no overrides) — for tests and callers that need a baseline.
export const DEFAULT_SLOT_THRESHOLDS: ResolvedTravelThresholds = resolveThresholds('none')
