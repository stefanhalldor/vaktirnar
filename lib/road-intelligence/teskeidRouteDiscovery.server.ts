import 'server-only'

import type { ConfirmedLocationInput } from '@/lib/places/providerCandidate'
import {
  getTeskeidAssessmentRouteCandidatesOutcome,
  isTeskeidRouteCandidateEnabled,
  type TeskeidRouteCandidatesOutcome,
} from '@/lib/iceland-routes/roadGraphCandidate.server'
import { resolveRouteAssessmentScope } from '@/lib/iceland-routes/routeAssessmentScope.server'
import type { RouteAssessmentScope } from '@/lib/iceland-routes/routeAssessmentScope'

type ReadyRouteAssessmentScope = Extract<RouteAssessmentScope, { status: 'ready' }>

export type TeskeidRouteDiscoveryOutcome =
  | Readonly<{
      status: 'ready'
      assessmentScope: ReadyRouteAssessmentScope
      routes: Extract<TeskeidRouteCandidatesOutcome, { status: 'ready' }>['routes']
      evidence: NonNullable<Extract<TeskeidRouteCandidatesOutcome, { status: 'ready' }>['evidence']>
      recommendedRouteId: string
      cacheable: boolean
    }>
  | Readonly<{
      status: 'disabled' | 'pending' | 'no_route' | 'unavailable'
      assessmentScope: RouteAssessmentScope | null
      routes: []
      evidence: []
      recommendedRouteId: null
      cacheable: false
    }>

/**
 * Thin, server-only orchestration for every non-HTTP Teskeið route consumer.
 * Ranking, curated inclusion, capping, graph policy and caching remain owned by
 * `lib/iceland-routes`. Keeping the route/evidence arrays index-atomic here
 * prevents a server consumer from accidentally using unsigned or mismatched
 * graph facts.
 */
export async function discoverTeskeidRoutes(
  navigationOrigin: ConfirmedLocationInput,
  navigationDestination: ConfirmedLocationInput,
): Promise<TeskeidRouteDiscoveryOutcome> {
  if (!isTeskeidRouteCandidateEnabled()) {
    return emptyOutcome('disabled', null)
  }

  const assessmentScope = await resolveRouteAssessmentScope(
    navigationOrigin,
    navigationDestination,
  )
  if (assessmentScope.status !== 'ready') {
    return emptyOutcome(
      assessmentScope.status === 'same_area' ? 'no_route' : 'unavailable',
      assessmentScope,
    )
  }

  const origin = { lat: assessmentScope.origin.lat, lon: assessmentScope.origin.lon }
  const destination = {
    lat: assessmentScope.destination.lat,
    lon: assessmentScope.destination.lon,
  }
  const outcome = await getTeskeidAssessmentRouteCandidatesOutcome(
    origin,
    destination,
    assessmentScope.scopeId,
    true,
    'extended',
  )
  if (outcome.status !== 'ready') {
    return emptyOutcome(outcome.status, assessmentScope)
  }

  const evidence = outcome.evidence
  if (
    outcome.routes.length === 0
    || !evidence
    || evidence.length !== outcome.routes.length
    || evidence.some((item, index) => item.route !== outcome.routes[index])
  ) {
    return emptyOutcome('unavailable', assessmentScope)
  }

  return {
    status: 'ready',
    assessmentScope,
    routes: outcome.routes,
    evidence,
    recommendedRouteId: outcome.routes[0].id,
    cacheable: outcome.cacheable !== false,
  }
}

function emptyOutcome(
  status: Exclude<TeskeidRouteDiscoveryOutcome['status'], 'ready'>,
  assessmentScope: RouteAssessmentScope | null,
): Extract<TeskeidRouteDiscoveryOutcome, { status: Exclude<TeskeidRouteDiscoveryOutcome['status'], 'ready'> }> {
  return {
    status,
    assessmentScope,
    routes: [],
    evidence: [],
    recommendedRouteId: null,
    cacheable: false,
  }
}
