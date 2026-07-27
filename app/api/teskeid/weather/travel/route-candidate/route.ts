import { after, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateIcelandicCoords } from '@/lib/weather/coords'
import { resolveWeatherBaseAccess, getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import {
  getTeskeidRouteCandidatesOutcome,
  isTeskeidRouteCandidateEnabled,
} from '@/lib/iceland-routes/roadGraphCandidate.server'
import {
  getIcelandRoadGraph,
  getIcelandRoadGraphCacheStatus,
} from '@/lib/iceland-routes/roadGraphRuntime.server'
import {
  signRouteOptionEnvelope,
  type RouteOptionEnvelopeV1,
} from '@/lib/iceland-routes/routeOptionEnvelope.server'

function validPoint(value: unknown): value is { lat: number; lon: number } {
  if (!value || typeof value !== 'object') return false
  const point = value as Record<string, unknown>
  return typeof point.lat === 'number' && typeof point.lon === 'number'
    && validateIcelandicCoords(point.lat, point.lon)
}

const WARM_BUDGET_MS = process.env.NODE_ENV === 'production' ? 7_500 : 30_000

async function warmRoadGraph(): Promise<'ready' | 'pending' | 'unavailable'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const graphPromise = getIcelandRoadGraph()
  const status = await Promise.race([
    graphPromise.then(() => 'ready' as const).catch(() => 'unavailable' as const),
    new Promise<'pending'>(resolve => {
      timer = setTimeout(() => resolve('pending'), WARM_BUDGET_MS)
    }),
  ])
  if (timer) clearTimeout(timer)
  if (status === 'pending') {
    after(async () => {
      await graphPromise.catch(() => undefined)
    })
  }
  return status
}

function timingHeaders(input: {
  graphCache: 'cold' | 'loading' | 'warm'
  candidateMs: number
  signMs?: number
}): Record<string, string> {
  const candidateMs = Math.max(0, Math.round(input.candidateMs * 10) / 10)
  const signMs = Math.max(0, Math.round((input.signMs ?? 0) * 10) / 10)
  return {
    'Cache-Control': 'no-store',
    'Server-Timing': `teskeid-candidate;dur=${candidateMs}, teskeid-sign;dur=${signMs}`,
    'X-Teskeid-Graph-Cache': input.graphCache,
  }
}

export async function POST(request: Request) {
  if (
    process.env.AUTH_MVP_ENABLED !== 'true'
    || getWeatherEnabledMode() === 'off'
    || !isTeskeidRouteCandidateEnabled()
  ) {
    return NextResponse.json({ status: 'disabled', route: null }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const access = await resolveWeatherBaseAccess(user)
  if (access.mode === 'blocked') {
    return NextResponse.json({ status: 'unavailable', route: null }, { status: 401 })
  }

  const hasTeskeidRouting = user?.id && user.email
    ? await checkFeatureAccess(user.id, user.email, 'teskeid-routing-v1').catch(() => false)
    : false
  if (!hasTeskeidRouting) {
    return NextResponse.json({ status: 'disabled', route: null }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  if (body?.warmOnly === true) {
    const graphCache = getIcelandRoadGraphCacheStatus()
    const startedAt = performance.now()
    const status = await warmRoadGraph()
    return NextResponse.json(
      { status, graphCache: getIcelandRoadGraphCacheStatus() },
      { headers: timingHeaders({ graphCache, candidateMs: performance.now() - startedAt }) },
    )
  }
  if (!validPoint(body?.origin) || !validPoint(body?.destination)) {
    return NextResponse.json({ status: 'unavailable', route: null }, { status: 400 })
  }

  // The client sends full place objects, but signed envelopes intentionally
  // bind only canonical coordinates. Do not pass display names, place IDs, or
  // any future client-only metadata into the strict envelope contract.
  const origin = { lat: body.origin.lat, lon: body.origin.lon }
  const destination = { lat: body.destination.lat, lon: body.destination.lon }
  const includeAlternatives = body?.alternatives === true
  const graphCache = getIcelandRoadGraphCacheStatus()
  const candidateStartedAt = performance.now()
  const outcome = await getTeskeidRouteCandidatesOutcome(origin, destination, includeAlternatives)
  const candidateMs = performance.now() - candidateStartedAt
  if (outcome.status === 'pending') {
    // The request budget protects latency, but the shared graph warm-up must be
    // allowed to finish after the response in serverless. A later client retry
    // then reads the same pending L1 promise or the durable active snapshot.
    after(async () => {
      try {
        await getIcelandRoadGraph()
      } catch {
        console.error('[route-candidate] graph warm-up failed')
      }
    })
  }
  const includeRouteEnvelopes = body?.includeRouteEnvelopes === true
  const compactRouteEnvelopes = includeRouteEnvelopes && body?.compactRouteEnvelopes === true
  let routeEnvelopes: RouteOptionEnvelopeV1[] = []
  let signMs = 0
  if (includeRouteEnvelopes && outcome.status === 'ready') {
    try {
      const signStartedAt = performance.now()
      routeEnvelopes = outcome.routes.map(route => signRouteOptionEnvelope({
        origin,
        destination,
        route,
      }))
      signMs = performance.now() - signStartedAt
    } catch {
      console.error('[route-candidate] envelope signing failed')
      return NextResponse.json({
        status: 'unavailable',
        routes: [],
        route: null,
      }, {
        status: 503,
        headers: timingHeaders({ graphCache, candidateMs, signMs }),
      })
    }
  }
  return NextResponse.json({
    status: outcome.status,
    ...(!compactRouteEnvelopes ? {
      routes: outcome.routes,
      route: outcome.status === 'ready' ? outcome.routes[0] ?? null : null,
    } : {}),
    ...(includeRouteEnvelopes ? { routeEnvelopes } : {}),
  }, {
    headers: timingHeaders({ graphCache, candidateMs, signMs }),
  })
}
