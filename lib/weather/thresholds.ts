import type { TravelThresholdOverrides, ResolvedTravelThresholds } from './types'

export const WEATHER_THRESHOLDS = {
  driving: {
    cautionWindMs: 15,
    redWindMs: 25,
    redGustMs: 35,
  },
  heavyTrailer: {
    cautionWindMs: 10,
    redWindMs: 15,
    redGustMs: 18,
  },
  caravan: {
    cautionWindMs: 13,
    redWindMs: 18,
    redGustMs: 25,
    cautionCrosswindMs: 10, // context only in Phase 1, does not affect stada
    redCrosswindMs: 15,     // context only in Phase 1, does not affect stada
  },
  golf: {
    discomfortWindMs: 13,
    hardWindMs: 17,
    eighteenHolesHours: 4.5,
  },
  dry: {
    maxPrecipMmPerHour: 0.1,
  },
  grill: {
    tooWindyMs: 8,
  },
  travel: {
    cautionPrecipMmPerHour: 5.0,
  },
  laundry: {
    goodDryHours: 4,
    helpfulWindMs: 3,
  },
  painting: {
    goodDryHours: 6,
  },
} as const

/**
 * Validates that resolved thresholds satisfy the ordering invariant.
 * Returns an error string if invalid, null if valid.
 * Used by both the API route and client-side submit handler.
 */
export function validateResolvedThresholdOrdering(resolved: ResolvedTravelThresholds): string | null {
  if (resolved.cautionWindMs >= resolved.redWindMs) {
    return 'cautionWindMs must be less than redWindMs'
  }
  return null
}

/**
 * Resolves travel thresholds by merging per-trailer defaults with optional user overrides.
 * `trailerKind` is `'none'` for driving-only or any non-empty string for trailer/caravan modes.
 */
export function resolveThresholds(
  trailerKind: string,
  overrides?: TravelThresholdOverrides,
): ResolvedTravelThresholds {
  const base =
    trailerKind === 'none'
      ? WEATHER_THRESHOLDS.driving
      : trailerKind === 'caravan' || trailerKind === 'horse_trailer'
        ? WEATHER_THRESHOLDS.heavyTrailer
        : WEATHER_THRESHOLDS.caravan
  return {
    cautionWindMs: overrides?.cautionWindMs ?? base.cautionWindMs,
    redWindMs: overrides?.redWindMs ?? base.redWindMs,
    redGustMs: overrides?.redGustMs ?? base.redGustMs,
    cautionPrecipMmPerHour: overrides?.cautionPrecipMmPerHour ?? WEATHER_THRESHOLDS.travel.cautionPrecipMmPerHour,
  }
}

/**
 * Returns the threshold value and unit for a given decisive metric + reason code.
 * When `resolved` is provided, returns the user-facing threshold values from it
 * rather than global defaults — so point detail cards reflect what the user actually set.
 */
export function deriveThreshold(
  metric: 'wind' | 'gust' | 'precipitation' | 'data',
  reasonCode: string | undefined,
  resolved?: ResolvedTravelThresholds,
): { thresholdValue?: number; thresholdUnit?: 'm/s' | 'mm/klst' } {
  if (metric === 'precipitation') {
    return {
      thresholdValue: resolved?.cautionPrecipMmPerHour ?? WEATHER_THRESHOLDS.travel.cautionPrecipMmPerHour,
      thresholdUnit: 'mm/klst',
    }
  }
  if (metric === 'gust') {
    if (resolved) return { thresholdValue: resolved.redGustMs, thresholdUnit: 'm/s' }
    const isTrailer = reasonCode?.includes('trailer') ?? false
    return {
      thresholdValue: isTrailer ? WEATHER_THRESHOLDS.caravan.redGustMs : WEATHER_THRESHOLDS.driving.redGustMs,
      thresholdUnit: 'm/s',
    }
  }
  if (metric === 'wind') {
    if (resolved) {
      const isCaution = reasonCode === 'caution_wind_driving' || reasonCode === 'caution_wind_trailer'
      return { thresholdValue: isCaution ? resolved.cautionWindMs : resolved.redWindMs, thresholdUnit: 'm/s' }
    }
    if (reasonCode === 'caution_wind_trailer') return { thresholdValue: WEATHER_THRESHOLDS.caravan.cautionWindMs, thresholdUnit: 'm/s' }
    if (reasonCode === 'too_windy_trailer') return { thresholdValue: WEATHER_THRESHOLDS.caravan.redWindMs, thresholdUnit: 'm/s' }
    if (reasonCode === 'caution_wind_driving') return { thresholdValue: WEATHER_THRESHOLDS.driving.cautionWindMs, thresholdUnit: 'm/s' }
    return { thresholdValue: WEATHER_THRESHOLDS.driving.redWindMs, thresholdUnit: 'm/s' }
  }
  return {}
}
