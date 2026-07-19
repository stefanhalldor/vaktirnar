'use client'

import { useState, useMemo } from 'react'
import { resolveThresholds } from './thresholds'
import type { ResolvedTravelThresholds, TravelThresholdOverrides } from './types'

export type WeatherThresholdState = {
  /** Resolved thresholds — defaults merged with any user overrides. */
  thresholds: ResolvedTravelThresholds
  /** Current active overrides (empty object = all defaults). */
  overrides: TravelThresholdOverrides
  /** Apply new override values. Partial: omitted keys fall back to defaults. */
  setOverrides: (overrides: TravelThresholdOverrides) => void
  /** Clear all overrides and return to driving defaults. */
  reset: () => void
}

/**
 * Manages user threshold overrides for weather status classification.
 *
 * Starts from driving defaults (resolveThresholds('none')):
 *   cautionWindMs: 10, redWindMs: 15
 *
 * Components call setOverrides({ cautionWindMs, redWindMs }) to apply user-specified values.
 * Call reset() to return to defaults. The resolved thresholds are memoized and recompute
 * only when overrides change.
 *
 * Currently instantiated by WeatherOverviewClient for /vedrid overview. The same defaults
 * are used by /vedrid/ferdalagid when no overrides are set — initial overview marker colors
 * therefore align with ferðalagið defaults out of the box.
 *
 * TODO: when threshold state is promoted to a shared layer, both /vedrid overview and
 * /vedrid/ferdalagid should consume this hook (or a derived context) so threshold changes
 * on one screen carry over to the other within the same session.
 */
export function useWeatherThresholds(): WeatherThresholdState {
  const [overrides, setOverrides] = useState<TravelThresholdOverrides>({})
  const thresholds = useMemo(() => resolveThresholds('none', overrides), [overrides])
  return {
    thresholds,
    overrides,
    setOverrides,
    reset: () => setOverrides({}),
  }
}
