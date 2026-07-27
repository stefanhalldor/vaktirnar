import type { RouteOption } from '@/lib/weather/provider.types'
import { matchRouteCautions } from '@/lib/weather/routeCautions'
import { findIcelandRoadGraphAlternatives, findIcelandRoadGraphRoute, ICELAND_ROUTING_PROFILES } from './roadGraph'
import type { IcelandRoadGraph, IcelandRoadGraphRoute } from './roadGraphTypes'
import { getIcelandRoadGraph } from './roadGraphRuntime.server'
import { rdpSimplifyToMaxPoints } from '@/lib/weather/providerRouteMatching'

export const TESKEID_ROUTE_CANDIDATE_FLAG = 'TESKEID_ROUTE_CANDIDATE_ENABLED'
export const TESKEID_ROUTE_CANDIDATE_ID = 'teskeid-road-graph-v1'
export const TESKEID_ROUTE_CANDIDATE_ID_PREFIX = `${TESKEID_ROUTE_CANDIDATE_ID}-alt-`

const PRODUCTION_CANDIDATE_BUDGET_MS = 8_000
const DEVELOPMENT_CANDIDATE_BUDGET_MS = 30_000
const MAX_SNAP_DISTANCE_M = 25_000
const TESKEID_TRANSPORT_RDP_EPSILON_M = 3
const TESKEID_TRANSPORT_MAX_POINTS = 1_000
const CANDIDATE_CACHE_TTL_MS = 30 * 60 * 1_000
const CANDIDATE_CACHE_MAX_ENTRIES_PER_GRAPH = 128

type Point = { lat: number; lon: number }

type CachedCandidate = {
  expiresAt: number
  outcome: TeskeidRouteCandidatesOutcome
}

type CandidateCacheBucket = {
  completed: Map<string, CachedCandidate>
  pending: Map<string, Promise<TeskeidRouteCandidatesOutcome>>
}

type CandidateCacheState = {
  byGraph: WeakMap<IcelandRoadGraph, CandidateCacheBucket>
}

const CANDIDATE_CACHE_STATE_KEY = '__teskeidRouteCandidateCacheV2__' as const

function candidateCacheState(): CandidateCacheState {
  const runtime = globalThis as typeof globalThis & {
    [CANDIDATE_CACHE_STATE_KEY]?: CandidateCacheState
  }
  if (!runtime[CANDIDATE_CACHE_STATE_KEY]) {
    runtime[CANDIDATE_CACHE_STATE_KEY] = { byGraph: new WeakMap() }
  }
  return runtime[CANDIDATE_CACHE_STATE_KEY]
}

function candidateCacheBucket(graph: IcelandRoadGraph): CandidateCacheBucket {
  const state = candidateCacheState()
  const existing = state.byGraph.get(graph)
  if (existing) return existing
  const created = {
    completed: new Map<string, CachedCandidate>(),
    pending: new Map<string, Promise<TeskeidRouteCandidatesOutcome>>(),
  }
  state.byGraph.set(graph, created)
  return created
}

function candidateCacheKey(origin: Point, destination: Point, includeAlternatives: boolean): string {
  return JSON.stringify([
    origin.lat,
    origin.lon,
    destination.lat,
    destination.lon,
    includeAlternatives,
  ])
}

function readCachedCandidate(bucket: CandidateCacheBucket, key: string): TeskeidRouteCandidatesOutcome | null {
  const cached = bucket.completed.get(key)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    bucket.completed.delete(key)
    return null
  }
  // Map insertion order is the LRU order.
  bucket.completed.delete(key)
  bucket.completed.set(key, cached)
  return cached.outcome
}

function writeCachedCandidate(
  bucket: CandidateCacheBucket,
  key: string,
  outcome: TeskeidRouteCandidatesOutcome,
): void {
  if (outcome.status !== 'ready' && outcome.status !== 'no_route') return
  bucket.completed.delete(key)
  bucket.completed.set(key, {
    expiresAt: Date.now() + CANDIDATE_CACHE_TTL_MS,
    outcome,
  })
  while (bucket.completed.size > CANDIDATE_CACHE_MAX_ENTRIES_PER_GRAPH) {
    const oldest = bucket.completed.keys().next().value as string | undefined
    if (oldest === undefined) break
    bucket.completed.delete(oldest)
  }
}

export function resetTeskeidRouteCandidateCacheForTests(): void {
  const runtime = globalThis as typeof globalThis & {
    [CANDIDATE_CACHE_STATE_KEY]?: CandidateCacheState
  }
  runtime[CANDIDATE_CACHE_STATE_KEY] = { byGraph: new WeakMap() }
}

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
  const labels = ['TESKEID_EXPERIMENTAL', 'TESKEID_DERIVED_DURATION']
  if (index > 0) labels.push('TESKEID_ALTERNATIVE')
  if (route.surface.gravelM > 0) labels.push('TESKEID_GRAVEL')
  if (route.surface.mixedM > 0) labels.push('TESKEID_MIXED_SURFACE')
  if (route.surface.unknownM > 0) labels.push('TESKEID_UNKNOWN_SURFACE')
  if (originSnapDistanceM > 1_000 || destinationSnapDistanceM > 1_000) labels.push('TESKEID_LONG_SNAP')
  // The validated road graph can contain tens of thousands of dense vertices.
  // Keep one bounded, shape-preserving geometry for display, weather sampling,
  // and provider matching instead of sending the same raw geometry twice.
  const transportPoints = rdpSimplifyToMaxPoints(
    route.geometry,
    TESKEID_TRANSPORT_RDP_EPSILON_M,
    TESKEID_TRANSPORT_MAX_POINTS,
  )
  // Caution corridors use radii of at least 1.5 km. The shape-preserving route
  // is within metres of the raw geometry and avoids rescanning tens of thousands
  // of duplicate vertices for every caution rule.
  const cautions = matchRouteCautions(
    transportPoints,
    { placeId: 'origin', displayName: 'origin', formattedAddress: 'origin', ...origin },
    { placeId: 'destination', displayName: 'destination', formattedAddress: 'destination', ...destination },
    // Teskeið road-graph routes must use the same station-grade evidence as
    // curated avoidance routes. The old 10 km approximate Öxi corridor can
    // overlap Route 1 through the fjords and create a false caution.
    { evidencePointsOnly: true },
  )
  return {
    id: index === 0 ? TESKEID_ROUTE_CANDIDATE_ID : `${TESKEID_ROUTE_CANDIDATE_ID_PREFIX}${index}`,
    routeIndex: -(index + 1),
    provider: 'teskeid',
    labels,
    isDefault: false,
    points: transportPoints,
    distanceM: route.distanceM,
    durationS: route.durationS,
    cautions,
    experimental: {
      derivedDuration: true,
      surface: route.surface,
      ...(route.fRoadDistanceM > 0
        ? { fRoad: { distanceM: route.fRoadDistanceM, roadNumbers: [...route.fRoadNumbers] } }
        : {}),
    },
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
      const bucket = candidateCacheBucket(graph)
      const key = candidateCacheKey(origin, destination, includeAlternatives)
      const cached = readCachedCandidate(bucket, key)
      if (cached) return cached
      const inFlight = bucket.pending.get(key)
      if (inFlight) return await inFlight

      const computation = Promise.resolve().then((): TeskeidRouteCandidatesOutcome => {
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
      })
      bucket.pending.set(key, computation)
      try {
        const outcome = await computation
        writeCachedCandidate(bucket, key, outcome)
        return outcome
      } finally {
        if (bucket.pending.get(key) === computation) bucket.pending.delete(key)
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
