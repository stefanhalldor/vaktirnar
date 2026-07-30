import { describe, expect, it } from 'vitest'
import { resolveLegacySafeRouteSelection } from '@/lib/road-intelligence/legacyRouteSelectionSafety'
import type { RouteOption } from '@/lib/weather/provider.types'

function route(
  id: string,
  provider: RouteOption['provider'],
  isDefault = false,
): RouteOption {
  return {
    id,
    routeIndex: 0,
    provider,
    labels: [],
    isDefault,
    distanceM: 1_000,
    durationS: 60,
    points: [{ lat: 64, lon: -21 }, { lat: 64.01, lon: -21.01 }],
  }
}

describe('resolveLegacySafeRouteSelection', () => {
  it('blocks confirm during restoration and selects the safe default fallback', () => {
    const result = resolveLegacySafeRouteSelection([
      route('google-default', 'google', true),
      route('teskeid-restored', 'teskeid'),
    ], 'teskeid-restored')

    expect(result.routeOptions?.map(option => option.id)).toEqual(['google-default'])
    expect(result.selectedRouteId).toBe('google-default')
    expect(result.replacementRouteId).toBe('google-default')
    expect(result.canConfirm).toBe(false)
  })

  it('fails closed when a hidden Teskeið route has no safe fallback', () => {
    const result = resolveLegacySafeRouteSelection([
      route('teskeid-only', 'teskeid', true),
    ], 'teskeid-only')

    expect(result.routeOptions).toEqual([])
    expect(result.selectedRouteId).toBeNull()
    expect(result.replacementRouteId).toBeNull()
    expect(result.canConfirm).toBe(false)
  })

  it('allows confirm only after parent state contains a visible safe route', () => {
    const result = resolveLegacySafeRouteSelection([
      route('google', 'google', true),
      route('teskeid', 'teskeid'),
    ], 'google')

    expect(result.selectedRouteId).toBe('google')
    expect(result.replacementRouteId).toBeNull()
    expect(result.canConfirm).toBe(true)
  })
})
