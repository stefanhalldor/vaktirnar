import type { RouteOption } from '@/lib/weather/provider.types'
import { matchRouteCautions } from '@/lib/weather/routeCautions'
import { findIcelandRoadGraphAlternatives, findIcelandRoadGraphRoute, ICELAND_ROUTING_PROFILES } from './roadGraph'
import type { IcelandRoadGraphRoute } from './roadGraphTypes'
import { getIcelandRoadGraph } from './roadGraphRuntime.server'

export const TESKEID_ROUTE_CANDIDATE_FLAG = 'TESKEID_ROUTE_CANDIDATE_ENABLED'
export const TESKEID_ROUTE_CANDIDATE_ID = 'teskeid-road-graph-v1'
export const TESKEID_ROUTE_CANDIDATE_ID_PREFIX = `${TESKEID_ROUTE_CANDIDATE_ID}-alt-`

const PRODUCTION_CANDIDATE_BUDGET_MS = 8_000
const DEVELOPMENT_CANDIDATE_BUDGET_MS = 30_000
const MAX_SNAP_DISTANCE_M = 25_000

type Point = { lat: number; lon: number }

export function isTeskeidRouteCandidateEnabled(
  env: { TESKEID_ROUTE_CANDIDATE_ENABLED?: string } = {
    TESKEID_ROUTE_CANDIDATE_ENABLED: process.env.TESKEID_ROUTE_CANDIDATE_ENABLED,
  },
): boolean {
  return env[TESKEID_ROUTE_CANDIDATE_FLAG] === 'true'
}

function candidateBudgetMs(): number {
  return process.env.NODE_ENV === 'production'
    ? PRODUCTION_CANDIDATE_BUDGET_MS
    : DEVELOPMENT_CANDIDATE_BUDGET_MS
}

function withCandidateTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<T>(resolve => {
    timer = setTimeout(() => resolve(fallback), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>
}

export type TeskeidRouteCandidateOutcome =
  | { status: 'ready'; route: RouteOption }
  | { status: 'disabled' | 'pending' | 'no_route' | 'unavailable'; route: null }

export type TeskeidRouteCandidatesOutcome =
  | { status: 'ready'; routes: RouteOption[] }
  | { status: 'disabled' | 'pending' | 'no_route' | 'unavailable'; routes: [] }

function toRouteOption(
  route: IcelandRoadGraphRoute,
  origin: Point,
  destination: Point,
  index: number,
  originSnapDistanceM: number,
  destinationSnapDistanceM: number,
): RouteOption {
  const cautions = matchRouteCautions(
    [...route.geometry],
    { placeId: 'origin', displayName: 'origin', formattedAddress: 'origin', ...origin },
    { placeId: 'destination', displayName: 'destination', formattedAddress: 'destination', ...destination },
  )
  const labels = ['TESKEID_EXPERIMENTAL', 'TESKEID_DERIVED_DURATION']
  if (index > 0) labels.push('TESKEID_ALTERNATIVE')
  if (route.surface.gravelM > 0) labels.push('TESKEID_GRAVEL')
  if (route.surface.mixedM > 0) labels.push('TESKEID_MIXED_SURFACE')
  if (route.surface.unknownM > 0) labels.push('TESKEID_UNKNOWN_SURFACE')
  if (originSnapDistanceM > 1_000 || destinationSnapDistanceM > 1_000) labels.push('TESKEID_LONG_SNAP')
  return {
    id: index === 0 ? TESKEID_ROUTE_CANDIDATE_ID : `${TESKEID_ROUTE_CANDIDATE_ID_PREFIX}${index}`,
    routeIndex: -(index + 1),
    provider: 'teskeid',
    labels,
    isDefault: false,
    points: [...route.geometry],
    providerMatchingPoints: [...route.geometry],
    distanceM: route.distanceM,
    durationS: route.durationS,
    cautions,
    experimental: { derivedDuration: true, surface: route.surface },
  }
}

export async function getTeskeidRouteCandidatesOutcome(
  origin: Point,
  destination: Point,
  includeAlternatives = false,
): Promise<TeskeidRouteCandidatesOutcome> {
  if (!isTeskeidRouteCandidateEnabled()) return { status: 'disabled', routes: [] }
  return withCandidateTimeout((async (): Promise<TeskeidRouteCandidatesOutcome> => {
    try {
      const graph = await getIcelandRoadGraph()
      const primary = findIcelandRoadGraphRoute(graph, origin, destination, {
        profile: ICELAND_ROUTING_PROFILES.fastestCar,
        maxSnapDistanceM: MAX_SNAP_DISTANCE_M,
      })
      if (primary.status !== 'ok') return { status: 'no_route', routes: [] }
      const alternatives = includeAlternatives
        ? findIcelandRoadGraphAlternatives(graph, origin, destination, {
            profile: ICELAND_ROUTING_PROFILES.fastestCar,
            maxSnapDistanceM: MAX_SNAP_DISTANCE_M,
            maxAlternatives: 4,
            maxOverlap: 0.94,
          })
        : []
      const candidates = [
        {
          route: primary.route,
          originSnapDistanceM: primary.originSnapDistanceM,
          destinationSnapDistanceM: primary.destinationSnapDistanceM,
        },
        ...alternatives,
      ]
      return {
        status: 'ready',
        routes: candidates.map((candidate, index) => toRouteOption(
          candidate.route,
          origin,
          destination,
          index,
          candidate.originSnapDistanceM,
          candidate.destinationSnapDistanceM,
        )),
      }
    } catch {
      return { status: 'unavailable', routes: [] }
    }
  })(), { status: 'pending', routes: [] }, candidateBudgetMs())
}

export async function getTeskeidRouteCandidateOutcome(
  origin: Point,
  destination: Point,
): Promise<TeskeidRouteCandidateOutcome> {
  const outcome = await getTeskeidRouteCandidatesOutcome(origin, destination)
  return outcome.status === 'ready'
    ? { status: 'ready', route: outcome.routes[0] }
    : { status: outcome.status, route: null }
}

export async function getTeskeidRouteCandidateById(
  origin: Point,
  destination: Point,
  routeId: string,
): Promise<RouteOption | null> {
  const includeAlternatives = routeId.startsWith(TESKEID_ROUTE_CANDIDATE_ID_PREFIX)
  const outcome = await getTeskeidRouteCandidatesOutcome(origin, destination, includeAlternatives)
  return outcome.status === 'ready'
    ? outcome.routes.find(route => route.id === routeId) ?? null
    : null
}

/**
 * Builds the single experimental Teskeið candidate used by both route selection
 * and the final travel calculation. It is deliberately fail-closed: flag off,
 * pending graph warm-up, graph refresh failure, and no-route results all return null.
 */
export async function getTeskeidRouteCandidate(
  origin: Point,
  destination: Point,
): Promise<RouteOption | null> {
  const outcome = await getTeskeidRouteCandidateOutcome(origin, destination)
  return outcome.route
}
