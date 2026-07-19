/**
 * Fine-grained wind display status for UI filter pills, scrubber dots, and map markers.
 *
 * This is a display layer on top of the internal WeatherStatus (graent/gult/rautt).
 * classifyWindDistance() in assessment.ts provides the underlying classification logic.
 *
 * Use classifyCandidateWindDisplayStatus() for TravelCandidate slots.
 * Use classifyPointWindDisplayStatus() for RouteWeatherPoint map points.
 */

import type { TravelCandidate, ResolvedTravelThresholds } from './types'
import { classifyWindDistance, type WindDistanceLabel } from './assessment'

export type WindDisplayStatus = WindDistanceLabel | 'no_data' | 'no_wind_data'

/** Priority order for auto-selection — most severe first. Use in auto-select effects. */
export const WIND_DISPLAY_STATUS_PRIORITY_ORDER: WindDisplayStatus[] = [
  'haettulegt',
  'nalgast-haettumork',
  'othaegilegt',
  'nalgast-othaegindi',
  'innan-marka',
  'no_data',
  'no_wind_data',
]

/** Display order for pills — safe to dangerous, unknowns last. Use for filter chips in UI. */
export const WIND_DISPLAY_STATUS_PILL_ORDER: WindDisplayStatus[] = [
  'innan-marka',
  'nalgast-othaegindi',
  'othaegilegt',
  'nalgast-haettumork',
  'haettulegt',
  'no_data',
  'no_wind_data',
]

/** All display statuses in pill display order — canonical list for filter chips. */
export const ALL_WIND_DISPLAY_STATUSES: WindDisplayStatus[] = WIND_DISPLAY_STATUS_PILL_ORDER

/**
 * Default visible statuses for the /vedrid overview map.
 * Hides low-signal statuses (within limits, no data) so the map leads with actionable information.
 * `empty Set = show all` semantics are preserved — Sýna allt resets to new Set().
 */
export const DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES: ReadonlySet<WindDisplayStatus> = new Set([
  'nalgast-othaegindi',
  'othaegilegt',
  'nalgast-haettumork',
  'haettulegt',
])

/** @deprecated Use WIND_DISPLAY_STATUS_PRIORITY_ORDER for auto-select or WIND_DISPLAY_STATUS_PILL_ORDER for pills. */
export const WIND_DISPLAY_STATUS_ORDER: WindDisplayStatus[] = WIND_DISPLAY_STATUS_PRIORITY_ORDER

/**
 * Minimal label/icon metadata — no Tailwind class strings.
 * For Tailwind class metadata (dotClass, borderClass, chipActiveClass etc.)
 * import WIND_STATUS_UI_META from components/weather/windStatusUi.ts.
 */
export const WIND_STATUS_META: Record<WindDisplayStatus, { labelKey: string; icon: string }> = {
  'innan-marka':        { labelKey: 'statusWithinLimits',   icon: '✓'  },
  'nalgast-othaegindi': { labelKey: 'statusNearDiscomfort', icon: '😬' },
  'othaegilegt':        { labelKey: 'statusUncomfortable',  icon: '😟' },
  'nalgast-haettumork': { labelKey: 'statusNearDanger',     icon: '😰' },
  'haettulegt':         { labelKey: 'statusDangerous',      icon: '⚠️'  },
  'no_data':            { labelKey: 'heatmapNotAssessed',   icon: '–'  },
  'no_wind_data':       { labelKey: 'noWindData',           icon: '–'  },
}

/** Hex marker color for Google Maps point markers. */
export const WIND_STATUS_MARKER_COLOR: Record<WindDisplayStatus, string> = {
  'haettulegt':         '#dc2626',
  'nalgast-haettumork': '#dc2626',
  'othaegilegt':        '#f97316',
  'nalgast-othaegindi': '#f59e0b',
  'innan-marka':        '#2d5a27',
  'no_data':            '#9ca3af',
  'no_wind_data':       '#9ca3af',
}

/**
 * Classifies a TravelCandidate into a fine-grained wind display status.
 * Uses worstWind.value for classification; falls back to 0 for green candidates.
 */
export function classifyCandidateWindDisplayStatus(
  candidate: TravelCandidate,
  thresholds: ResolvedTravelThresholds,
): WindDisplayStatus {
  if (candidate.reasonCode === 'no_data') return 'no_data'
  const wind = candidate.worstWind?.value ?? 0
  return classifyWindDistance(wind, thresholds.cautionWindMs, thresholds.redWindMs)
}

/**
 * Classifies a raw wind speed (m/s) into WindDisplayStatus, for use with RouteWeatherPoints.
 * Returns 'no_data' when hasData is false.
 */
export function classifyPointWindDisplayStatus(
  windMs: number | undefined,
  hasData: boolean,
  thresholds: ResolvedTravelThresholds,
): WindDisplayStatus {
  if (!hasData) return 'no_data'
  if (windMs === undefined) return 'innan-marka'
  return classifyWindDistance(windMs, thresholds.cautionWindMs, thresholds.redWindMs)
}

/**
 * Classifies a current-observation station's sustained wind reading into WindDisplayStatus,
 * for use with map markers and status labels on the /vedrid overview.
 *
 * Uses meanWindMs only in this version. Gust-adjusted classification is a future TODO:
 * gustMs is present on VegagerdinCurrentStationDto, but redGustMs in ResolvedTravelThresholds
 * is calibrated for route-forecast gusts, not current-observation gusts. Enable gust
 * classification only after a separate calibration step.
 *
 * Returns 'no_data' when meanWindMs is null (absent or unparseable).
 * This is the correct source of truth for observation marker color — NOT measurementFreshness.
 */
export function classifyObservationWindDisplayStatus(
  { meanWindMs }: { meanWindMs: number | null },
  thresholds: ResolvedTravelThresholds,
): WindDisplayStatus {
  if (meanWindMs === null) return 'no_data'
  return classifyPointWindDisplayStatus(meanWindMs, true, thresholds)
}

/**
 * Returns the index of the forecast row selected at anchorMs using at-or-before semantics.
 * Selects the latest slot at or before anchorMs; falls back to the first future slot.
 * Returns null when forecasts is empty.
 *
 * This is the single source of truth for forecast row selection shared by
 * classifyForecastWindDisplayStatusAt and StationDetail windowed row display.
 */
export function selectForecastRowAt(
  forecasts: ReadonlyArray<{ ftimeIso: string }>,
  anchorMs: number,
): number | null {
  if (forecasts.length === 0) return null

  let usedIdx = -1
  let latestMs = -Infinity
  for (let i = 0; i < forecasts.length; i++) {
    const t = new Date(forecasts[i].ftimeIso).getTime()
    if (t <= anchorMs && t > latestMs) {
      latestMs = t
      usedIdx = i
    }
  }
  if (usedIdx !== -1) return usedIdx

  // Fallback: first future slot
  let firstFutureMs = Infinity
  let firstFutureIdx = -1
  for (let i = 0; i < forecasts.length; i++) {
    const t = new Date(forecasts[i].ftimeIso).getTime()
    if (t > anchorMs && t < firstFutureMs) {
      firstFutureMs = t
      firstFutureIdx = i
    }
  }
  return firstFutureIdx !== -1 ? firstFutureIdx : null
}

/**
 * Classifies a Veðurstofan station's forecast into WindDisplayStatus at an explicit
 * anchor time, using at-or-before semantics (delegates to selectForecastRowAt).
 *
 * Selects the latest forecast slot whose ftimeIso is at or before anchorMs.
 * Falls back to the first future slot when no at-or-before slot exists.
 * Returns 'no_data' when forecasts is empty or the selected row has null wind speed.
 */
export function classifyForecastWindDisplayStatusAt(
  forecasts: ReadonlyArray<{ ftimeIso: string; windSpeedMs: number | null }>,
  thresholds: ResolvedTravelThresholds,
  anchorMs: number,
): WindDisplayStatus {
  const idx = selectForecastRowAt(forecasts, anchorMs)
  if (idx === null) return 'no_data'
  const row = forecasts[idx]
  if (row.windSpeedMs === null) return 'no_data'
  return classifyPointWindDisplayStatus(row.windSpeedMs, true, thresholds)
}

/**
 * Classifies a Veðurstofan station's forecast into WindDisplayStatus for the current time.
 * Thin wrapper around classifyForecastWindDisplayStatusAt(forecasts, thresholds, Date.now()).
 * Uses at-or-before semantics: latest slot at or before now, or first future slot.
 */
export function classifyNowAnchoredForecastWindDisplayStatus(
  forecasts: ReadonlyArray<{ ftimeIso: string; windSpeedMs: number | null }>,
  thresholds: ResolvedTravelThresholds,
): WindDisplayStatus {
  return classifyForecastWindDisplayStatusAt(forecasts, thresholds, Date.now())
}

/**
 * Returns the more severe of two WindDisplayStatus values.
 * Uses WIND_DISPLAY_STATUS_PRIORITY_ORDER (worst-first) for comparison.
 */
export function worstWindDisplayStatus(a: WindDisplayStatus, b: WindDisplayStatus): WindDisplayStatus {
  const aIdx = WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(a)
  const bIdx = WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(b)
  return aIdx <= bIdx ? a : b
}
