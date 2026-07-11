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

export type WindDisplayStatus = WindDistanceLabel | 'no_data'

/** Priority order for auto-selection — most severe first. Use in auto-select effects. */
export const WIND_DISPLAY_STATUS_PRIORITY_ORDER: WindDisplayStatus[] = [
  'haettulegt',
  'nalgast-haettumork',
  'othaegilegt',
  'nalgast-othaegindi',
  'innan-marka',
  'no_data',
]

/** Display order for pills — safe to dangerous. Use for filter chips in UI. */
export const WIND_DISPLAY_STATUS_PILL_ORDER: WindDisplayStatus[] = [
  'innan-marka',
  'nalgast-othaegindi',
  'othaegilegt',
  'nalgast-haettumork',
  'haettulegt',
  'no_data',
]

/** All display statuses in pill display order — canonical list for filter chips. */
export const ALL_WIND_DISPLAY_STATUSES: WindDisplayStatus[] = WIND_DISPLAY_STATUS_PILL_ORDER

/** @deprecated Use WIND_DISPLAY_STATUS_PRIORITY_ORDER for auto-select or WIND_DISPLAY_STATUS_PILL_ORDER for pills. */
export const WIND_DISPLAY_STATUS_ORDER: WindDisplayStatus[] = WIND_DISPLAY_STATUS_PRIORITY_ORDER

/** Display metadata for rendering each wind display status. */
export const WIND_STATUS_META: Record<WindDisplayStatus, {
  labelKey: string
  icon: string
  dotClass: string
  borderClass: string
  labelClass: string
  chipActiveClass: string
}> = {
  'innan-marka':        { labelKey: 'statusWithinLimits',   icon: '✓',  dotClass: 'bg-[#2d5a27]',          borderClass: 'border-[#2d5a27]',          labelClass: 'text-[#2d5a27]',   chipActiveClass: 'border-[#2d5a27] bg-[#2d5a27]/10 text-[#2d5a27]'          },
  'nalgast-othaegindi': { labelKey: 'statusNearDiscomfort', icon: '😬', dotClass: 'bg-amber-400',           borderClass: 'border-amber-400',           labelClass: 'text-amber-700',   chipActiveClass: 'border-amber-400 bg-amber-50 text-amber-700'               },
  'othaegilegt':        { labelKey: 'statusUncomfortable',  icon: '😟', dotClass: 'bg-orange-500',          borderClass: 'border-orange-500',          labelClass: 'text-orange-600',  chipActiveClass: 'border-orange-500 bg-orange-50 text-orange-700'            },
  'nalgast-haettumork': { labelKey: 'statusNearDanger',     icon: '😰', dotClass: 'bg-destructive',         borderClass: 'border-destructive',         labelClass: 'text-destructive', chipActiveClass: 'border-destructive bg-destructive/10 text-destructive'     },
  'haettulegt':         { labelKey: 'statusDangerous',      icon: '⚠️',  dotClass: 'bg-destructive',         borderClass: 'border-destructive',         labelClass: 'text-destructive', chipActiveClass: 'border-destructive bg-destructive/10 text-destructive'     },
  'no_data':            { labelKey: 'heatmapNotAssessed',   icon: '–',  dotClass: 'bg-muted-foreground/30', borderClass: 'border-muted-foreground/30', labelClass: 'text-muted-foreground', chipActiveClass: 'border-muted-foreground/30 bg-muted text-muted-foreground' },
}

/** Hex marker color for Google Maps point markers. */
export const WIND_STATUS_MARKER_COLOR: Record<WindDisplayStatus, string> = {
  'haettulegt':         '#dc2626',
  'nalgast-haettumork': '#dc2626',
  'othaegilegt':        '#f59e0b',
  'nalgast-othaegindi': '#f59e0b',
  'innan-marka':        '#2d5a27',
  'no_data':            '#9ca3af',
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
