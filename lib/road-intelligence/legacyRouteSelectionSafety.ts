import type { RouteOption } from '@/lib/weather/provider.types'

export type LegacySafeRouteSelection = Readonly<{
  routeOptions: RouteOption[] | null
  selectedRouteId: string | null
  replacementRouteId: string | null
  canConfirm: boolean
}>

/**
 * The legacy selector cannot yet present Teskeið's scoped coverage contract.
 * Keep its visible options and its confirm boundary on the same fail-closed
 * decision, including the render before a restored hidden selection is
 * replaced in parent state.
 */
export function resolveLegacySafeRouteSelection(
  routeOptions: readonly RouteOption[] | null,
  selectedRouteId: string | null,
): LegacySafeRouteSelection {
  const safeRouteOptions = routeOptions
    ? routeOptions.filter(route => route.provider !== 'teskeid')
    : null
  const selected = selectedRouteId && routeOptions
    ? routeOptions.find(route => route.id === selectedRouteId) ?? null
    : null

  if (selected?.provider === 'teskeid') {
    const fallback = safeRouteOptions?.find(route => route.isDefault)
      ?? safeRouteOptions?.[0]
      ?? null
    return {
      routeOptions: safeRouteOptions,
      selectedRouteId: fallback?.id ?? null,
      replacementRouteId: fallback?.id ?? null,
      canConfirm: false,
    }
  }

  const selectedIsSafe = Boolean(
    selectedRouteId
    && safeRouteOptions?.some(route => route.id === selectedRouteId),
  )
  return {
    routeOptions: safeRouteOptions,
    selectedRouteId: selectedIsSafe ? selectedRouteId : null,
    replacementRouteId: null,
    canConfirm: selectedIsSafe,
  }
}
