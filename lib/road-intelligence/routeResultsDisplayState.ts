export type RouteBridgeDisplayStatus = 'idle' | 'loading' | 'success' | 'error'
export type RouteResultsDisplayState =
  | 'route-switching'
  | 'route-loading'
  | 'comparison-opening'
  | 'route-ready'
  | 'handoff-only'
  | 'summary'
  | 'form'

export type RouteResultsVisibility = Readonly<{
  showSummary: boolean
  showRouteCards: boolean
  showWeather: boolean
  showHandoffOnly: boolean
}>

export function resolveRouteResultsDisplayState({
  bridgeStatus,
  hasSummary,
  hasTravelResult,
  hasRouteChoices,
  switchingChoiceId,
  comparisonOpening,
  hasHandoffOnly = false,
}: {
  bridgeStatus: RouteBridgeDisplayStatus
  hasSummary: boolean
  hasTravelResult: boolean
  hasRouteChoices: boolean
  switchingChoiceId: string | null
  comparisonOpening: boolean
  hasHandoffOnly?: boolean
}): RouteResultsDisplayState {
  if (switchingChoiceId !== null) return 'route-switching'
  if (bridgeStatus === 'loading') return 'route-loading'
  if (comparisonOpening) return 'comparison-opening'
  if (bridgeStatus === 'success') {
    if (hasHandoffOnly) return 'handoff-only'
    if (hasSummary && hasTravelResult) return 'summary'
    return hasRouteChoices ? 'route-ready' : 'route-loading'
  }
  return 'form'
}

/**
 * Centralizes the user-visible result contract so a successful assessment
 * cannot silently render a blank summary. Route choices and assessed weather
 * remain separate, explicit parts of the ready state.
 */
export function resolveRouteResultsVisibility({
  displayState,
  hasSummary,
  hasTravelResult,
  hasAssessedWeatherCoverage,
  routeChoiceCount,
}: {
  displayState: RouteResultsDisplayState
  hasSummary: boolean
  hasTravelResult: boolean
  hasAssessedWeatherCoverage: boolean
  routeChoiceCount: number
}): RouteResultsVisibility {
  const showSummary = displayState === 'summary' && hasSummary && hasTravelResult
  const hasRouteCards = Number.isInteger(routeChoiceCount) && routeChoiceCount > 0
  return {
    showSummary,
    showRouteCards: (
      showSummary
      || displayState === 'route-ready'
      || displayState === 'route-switching'
    ) && hasRouteCards,
    showWeather: showSummary && hasAssessedWeatherCoverage,
    showHandoffOnly: displayState === 'handoff-only',
  }
}

export function shouldRecalculateRouteChoice(
  selectedRouteId: string | null,
  appliedRouteId: string | null,
): boolean {
  return selectedRouteId !== null && selectedRouteId !== appliedRouteId
}

/**
 * A route-weather response may update UI only while its exact request remains
 * the active one. Comparing signal identity also protects against a stale
 * response if a caller replaces the controller before abort delivery runs.
 */
export function isCurrentRouteWeatherRequest(
  requestSignal: AbortSignal,
  activeRequestSignal: AbortSignal | null | undefined,
): boolean {
  return !requestSignal.aborted && activeRequestSignal === requestSignal
}
