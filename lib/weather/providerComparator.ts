import { type WindDisplayStatus, WIND_DISPLAY_STATUS_PRIORITY_ORDER } from './windDisplayStatus'

/** Canonical weather provider keys — extend here when Vegagerðin data arrives. */
export type WeatherProviderKey = 'metno' | 'vedurstofan' | 'vegagerdin'

/** Minimal shape needed by selectDecisiveProvider for one provider's slot assessment. */
export type ProviderSlotAssessment = {
  provider: WeatherProviderKey
  status: WindDisplayStatus
  windMs: number | null
}

/**
 * Stable provider priority for tie-breaking when severity and windMs are equal.
 * Index 0 = highest priority (shown as decisive when tied).
 * Order matches v141 spec: vegagerdin > vedurstofan > metno.
 */
const PROVIDER_TIEBREAK_ORDER: WeatherProviderKey[] = ['vegagerdin', 'vedurstofan', 'metno']

/**
 * Returns the more decisive (worse) of two provider slot assessments.
 *
 * Tie-break order (v141 spec):
 * 1. Worse severity (lower WIND_DISPLAY_STATUS_PRIORITY_ORDER index) wins.
 * 2. If severity is equal: higher windMs wins.
 * 3. If severity and windMs are equal (or both null/zero): stable provider order wins
 *    (vegagerdin > vedurstofan > metno).
 */
export function selectDecisiveProvider(
  a: ProviderSlotAssessment,
  b: ProviderSlotAssessment,
): ProviderSlotAssessment {
  const aIdx = WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(a.status)
  const bIdx = WIND_DISPLAY_STATUS_PRIORITY_ORDER.indexOf(b.status)
  if (aIdx !== bIdx) return aIdx < bIdx ? a : b
  // Same severity: higher windMs wins
  const aWind = a.windMs ?? 0
  const bWind = b.windMs ?? 0
  if (aWind !== bWind) return aWind > bWind ? a : b
  // Same wind: stable provider order
  const aTie = PROVIDER_TIEBREAK_ORDER.indexOf(a.provider)
  const bTie = PROVIDER_TIEBREAK_ORDER.indexOf(b.provider)
  return aTie <= bTie ? a : b
}
