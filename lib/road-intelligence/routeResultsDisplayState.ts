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
