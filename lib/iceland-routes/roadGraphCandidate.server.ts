import 'server-only'

import type { RouteOption } from '@/lib/weather/provider.types'
import {
  findIcelandRoadGraphAlternatives,
  findIcelandRoadGraphRoute,
  ICELAND_ROUTING_PROFILES,
} from './roadGraph'
import type { IcelandRoadGraph } from './roadGraphTypes'
import { getIcelandRoadGraph } from './roadGraphRuntime.server'
import { ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT } from './roadGraphSnapshotFormat'
import {
  TESKEID_ROUTE_CANDIDATE_ID,
  TESKEID_ROUTE_CANDIDATE_ID_PREFIX,
} from './routeAssessmentCandidateIdentity.server'
import {
  resolveTeskeidAssessmentRouteEvidence,
  roadGraphRouteToTeskeidOption,
  type TeskeidAssessmentRouteEvidence,
} from './routeAssessmentCandidateEvidence.server'

export const TESKEID_ROUTE_CANDIDATE_FLAG = 'TESKEID_ROUTE_CANDIDATE_ENABLED'
export {
  TESKEID_ROUTE_CANDIDATE_ID,
  TESKEID_ROUTE_CANDIDATE_ID_PREFIX,
} from './routeAssessmentCandidateIdentity.server'

const PRODUCTION_CANDIDATE_BUDGET_MS = 8_000
const PRODUCTION_EXTENDED_CANDIDATE_BUDGET_MS = 20_000
const DEVELOPMENT_CANDIDATE_BUDGET_MS = 30_000
const MAX_SNAP_DISTANCE_M = 25_000
const CANDIDATE_CACHE_TTL_MS = 30 * 60 * 1_000
const CANDIDATE_CACHE_MAX_ENTRIES_PER_GRAPH = 128
const CURRENT_ASSESSMENT_SCOPE_ID_PATTERN = /^assessment:v3:[A-Za-z0-9_-]{43}$/
const ROUTE_CANDIDATE_POLICY_VERSION = 'nearest-reachable-road-v3'
const ROUTE_CANDIDATE_CACHE_POLICY_FINGERPRINT =
  `${ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT}:${ROUTE_CANDIDATE_POLICY_VERSION}`

type Point = { lat: number; lon: number }
export type TeskeidCandidateSearchMode = 'quick' | 'extended'

type CachedCandidate = {
  expiresAt: number
  outcome: TeskeidRouteCandidatesOutcome
}

type CandidateCacheBucket = {
  completed: Map<string, CachedCandidate>
  pending: Map<string, Promise<TeskeidRouteCandidatesOutcome>>
}

type CandidateCacheState = {
  policyFingerprint: string
  byGraph: WeakMap<IcelandRoadGraph, CandidateCacheBucket>
}

// Bump this global key whenever a routing-policy change must invalidate state
// retained across Next.js Fast Refresh/module replacement.
const CANDIDATE_CACHE_STATE_KEY = '__teskeidRouteCandidateCacheV4__' as const

function candidateCacheState(): CandidateCacheState {
  const runtime = globalThis as typeof globalThis & {
    [CANDIDATE_CACHE_STATE_KEY]?: CandidateCacheState
  }
  if (
    runtime[CANDIDATE_CACHE_STATE_KEY]?.policyFingerprint
      !== ROUTE_CANDIDATE_CACHE_POLICY_FINGERPRINT
  ) {
    runtime[CANDIDATE_CACHE_STATE_KEY] = {
      policyFingerprint: ROUTE_CANDIDATE_CACHE_POLICY_FINGERPRINT,
      byGraph: new WeakMap(),
    }
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

function candidateCacheKey(
  origin: Point,
  destination: Point,
  includeAlternatives: boolean,
  searchMode: TeskeidCandidateSearchMode,
): string {
  return JSON.stringify([
    'legacy-node-route',
    ROUTE_CANDIDATE_POLICY_VERSION,
    origin.lat,
    origin.lon,
    destination.lat,
    destination.lon,
    includeAlternatives,
    searchMode,
  ])
}

function assessmentCandidateCacheKey(
  origin: Point,
  destination: Point,
  assessmentScopeId: string,
  includeAlternatives: boolean,
  searchMode: TeskeidCandidateSearchMode,
): string {
  return JSON.stringify([
    'assessment-edge-route',
    ROUTE_CANDIDATE_POLICY_VERSION,
    assessmentScopeId,
    origin.lat,
    origin.lon,
    destination.lat,
    destination.lon,
    includeAlternatives,
    searchMode,
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
  if (outcome.status === 'ready' && outcome.cacheable === false) return
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

async function readOrComputeCandidate(
  graph: IcelandRoadGraph,
  key: string,
  compute: () => TeskeidRouteCandidatesOutcome,
): Promise<TeskeidRouteCandidatesOutcome> {
  const bucket = candidateCacheBucket(graph)
  const cached = readCachedCandidate(bucket, key)
  if (cached) return cached
  const inFlight = bucket.pending.get(key)
  if (inFlight) return await inFlight

  const computation = Promise.resolve().then(compute)
  bucket.pending.set(key, computation)
  try {
    const outcome = await computation
    writeCachedCandidate(bucket, key, outcome)
    return outcome
  } finally {
    if (bucket.pending.get(key) === computation) bucket.pending.delete(key)
  }
}

export function resetTeskeidRouteCandidateCacheForTests(): void {
  const runtime = globalThis as typeof globalThis & {
    [CANDIDATE_CACHE_STATE_KEY]?: CandidateCacheState
  }
  runtime[CANDIDATE_CACHE_STATE_KEY] = {
    policyFingerprint: ROUTE_CANDIDATE_CACHE_POLICY_FINGERPRINT,
    byGraph: new WeakMap(),
  }
}

export function isTeskeidRouteCandidateEnabled(
  env: { TESKEID_ROUTE_CANDIDATE_ENABLED?: string } = {
    TESKEID_ROUTE_CANDIDATE_ENABLED: process.env.TESKEID_ROUTE_CANDIDATE_ENABLED,
  },
): boolean {
  return env[TESKEID_ROUTE_CANDIDATE_FLAG] === 'true'
}

function candidateBudgetMs(searchMode: TeskeidCandidateSearchMode = 'quick'): number {
  if (searchMode === 'extended' && process.env.NODE_ENV === 'production') {
    return PRODUCTION_EXTENDED_CANDIDATE_BUDGET_MS
  }
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
  | {
      status: 'ready'
      routes: RouteOption[]
      /** Server-only graph evidence; API responses must project only `routes`. */
      evidence?: readonly TeskeidAssessmentRouteEvidence[]
      /** False only when an implicit safety route timed out after primary validation. */
      cacheable?: false
    }
  | { status: 'disabled' | 'pending' | 'no_route' | 'unavailable'; routes: [] }

export async function getTeskeidRouteCandidatesOutcome(
  origin: Point,
  destination: Point,
  includeAlternatives = false,
  searchMode: TeskeidCandidateSearchMode = 'quick',
): Promise<TeskeidRouteCandidatesOutcome> {
  if (!isTeskeidRouteCandidateEnabled()) return { status: 'disabled', routes: [] }
  return withCandidateTimeout((async (): Promise<TeskeidRouteCandidatesOutcome> => {
    try {
      const graph = await getIcelandRoadGraph()
      const key = candidateCacheKey(origin, destination, includeAlternatives, searchMode)
      return await readOrComputeCandidate(graph, key, (): TeskeidRouteCandidatesOutcome => {
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
          routes: candidates.map((candidate, index) => roadGraphRouteToTeskeidOption(
            candidate.route,
            origin,
            destination,
            index,
            candidate.originSnapDistanceM,
            candidate.destinationSnapDistanceM,
          )),
        }
      })
    } catch {
      return { status: 'unavailable', routes: [] }
    }
  })(), { status: 'pending', routes: [] }, candidateBudgetMs(searchMode))
}

/**
 * Builds one edge-aware candidate from server-signed assessment endpoints.
 * The tiny trusted-anchor reconstruction and exact scope re-attestation happen
 * before any route is returned, so a projected endpoint can never fall back to
 * the legacy nearest-node router. Optional alternatives keep the exact same
 * selected anchor pair and mandatory partial endpoint edges as the primary.
 */
export async function getTeskeidAssessmentRouteCandidatesOutcome(
  origin: Point,
  destination: Point,
  assessmentScopeId: string,
  includeAlternatives = false,
  searchMode: TeskeidCandidateSearchMode = 'quick',
): Promise<TeskeidRouteCandidatesOutcome> {
  if (!isTeskeidRouteCandidateEnabled()) return { status: 'disabled', routes: [] }
  if (!CURRENT_ASSESSMENT_SCOPE_ID_PATTERN.test(assessmentScopeId)) {
    return { status: 'unavailable', routes: [] }
  }

  const budgetMs = candidateBudgetMs(searchMode)
  // The same absolute budget follows the work after graph warm-up and into
  // every synchronous primary/alternative traversal. Promise.race alone
  // cannot pre-empt CPU-bound graph work on the event loop.
  const deadlineAtMs = Date.now() + budgetMs
  const alternativeDeadlineAtMs = deadlineAtMs - Math.min(250, budgetMs)
  return withCandidateTimeout((async (): Promise<TeskeidRouteCandidatesOutcome> => {
    try {
      const graph = await getIcelandRoadGraph()
      const key = assessmentCandidateCacheKey(
        origin,
        destination,
        assessmentScopeId,
        includeAlternatives,
        searchMode,
      )
      return await readOrComputeCandidate(graph, key, (): TeskeidRouteCandidatesOutcome => {
        const evidence = resolveTeskeidAssessmentRouteEvidence({
          graph,
          origin,
          destination,
          assessmentScopeId,
          includeAlternatives,
          deadlineAtMs,
          alternativeDeadlineAtMs,
        })
        if (evidence.status === 'incomplete') return { status: 'pending', routes: [] }
        if (evidence.status !== 'ready') return { status: 'unavailable', routes: [] }
        return {
          status: 'ready',
          routes: evidence.evidence.map(candidate => candidate.route),
          evidence: evidence.evidence,
          ...(evidence.cacheable === false ? { cacheable: false as const } : {}),
        }
      })
    } catch {
      return { status: 'unavailable', routes: [] }
    }
  })(), { status: 'pending', routes: [] }, budgetMs)
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
