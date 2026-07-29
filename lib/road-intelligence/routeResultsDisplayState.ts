export type RouteBridgeDisplayStatus = 'idle' | 'loading' | 'success' | 'error'
export type SaferRouteCandidateStatus =
  | 'idle'
  | 'loading'
  | 'pending'
  | 'ready'
  | 'no_route'
  | 'unavailable'
export type SaferRouteAlternativesStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'none'
  | 'unavailable'

export type RouteResultsDisplayState =
  | 'safety-search'
  | 'route-switching'
  | 'route-loading'
  | 'comparison-opening'
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
  safetySearchPending,
  switchingChoiceId,
  comparisonOpening,
  hasHandoffOnly = false,
}: {
  bridgeStatus: RouteBridgeDisplayStatus
  hasSummary: boolean
  hasTravelResult: boolean
  safetySearchPending: boolean
  switchingChoiceId: string | null
  comparisonOpening: boolean
  hasHandoffOnly?: boolean
}): RouteResultsDisplayState {
  if (safetySearchPending) return 'safety-search'
  if (switchingChoiceId !== null) return 'route-switching'
  if (bridgeStatus === 'loading') return 'route-loading'
  if (comparisonOpening) return 'comparison-opening'
  if (bridgeStatus === 'success') {
    if (hasHandoffOnly) return 'handoff-only'
    return hasSummary && hasTravelResult ? 'summary' : 'route-loading'
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
  return {
    showSummary,
    showRouteCards: showSummary && Number.isInteger(routeChoiceCount) && routeChoiceCount > 0,
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

export function hasSaferRouteSearchFinished({
  routeCandidateEnabled,
  candidateStatus,
  alternativesStatus,
  automaticAlternativeSearchExpected,
  hasCandidateChoices,
}: {
  routeCandidateEnabled: boolean
  candidateStatus: SaferRouteCandidateStatus
  alternativesStatus: SaferRouteAlternativesStatus
  automaticAlternativeSearchExpected: boolean
  hasCandidateChoices: boolean
}): boolean {
  if (alternativesStatus === 'loading') return false
  if (
    alternativesStatus === 'ready'
    || alternativesStatus === 'none'
    || alternativesStatus === 'unavailable'
  ) {
    return true
  }
  if (!routeCandidateEnabled) return true
  if (candidateStatus === 'no_route' || candidateStatus === 'unavailable') return true
  return (
    candidateStatus === 'ready'
    && hasCandidateChoices
    && !automaticAlternativeSearchExpected
  )
}
