import { after, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateIcelandicCoords } from '@/lib/weather/coords'
import { resolveWeatherBaseAccess, getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { checkWeatherGuestRateLimit } from '@/lib/weather/ip-rate-limit.server'
import {
  getTeskeidAssessmentRouteCandidatesOutcome,
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
  verifyRouteOptionEnvelope,
} from '@/lib/iceland-routes/routeOptionEnvelope.server'

function validPoint(value: unknown): value is { lat: number; lon: number } {
  if (!value || typeof value !== 'object') return false
  const point = value as Record<string, unknown>
  return typeof point.lat === 'number' && typeof point.lon === 'number'
    && validateIcelandicCoords(point.lat, point.lon)
}

const WARM_BUDGET_MS = process.env.NODE_ENV === 'production' ? 7_500 : 30_000
const MAX_ASSESSMENT_SCOPE_ID_LENGTH = 500

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
  const hasAuthenticatedIdentity = Boolean(user?.id && user.email)
  const access = await resolveWeatherBaseAccess(user)
  if (access.mode === 'blocked') {
    return NextResponse.json({ status: 'unavailable', route: null }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (body?.warmOnly === true) {
    // Anonymous page loads must not be able to trigger graph materialisation.
    // Their first validated route request can warm the graph inside its normal
    // bounded candidate budget instead.
    if (!hasAuthenticatedIdentity) {
      return NextResponse.json({ status: 'disabled', route: null }, { status: 404 })
    }
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
  let origin = { lat: body.origin.lat, lon: body.origin.lon }
  let destination = { lat: body.destination.lat, lon: body.destination.lon }
  const rawAssessmentScopeId = body?.assessmentScopeId
  const assessmentScopeId = typeof rawAssessmentScopeId === 'string'
    ? rawAssessmentScopeId.trim()
    : null
  if (
    rawAssessmentScopeId !== undefined
    && (
      typeof rawAssessmentScopeId !== 'string'
      || assessmentScopeId === null
      || assessmentScopeId.length === 0
      || rawAssessmentScopeId !== assessmentScopeId
      || assessmentScopeId.length > MAX_ASSESSMENT_SCOPE_ID_LENGTH
    )
  ) {
    return NextResponse.json(
      { status: 'unavailable', routes: [], route: null },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  if (assessmentScopeId !== null) {
    const accessRouteEnvelope = verifyRouteOptionEnvelope(body.accessRouteEnvelope, {
      origin,
      destination,
      assessmentScopeId,
    })
    if (!accessRouteEnvelope || accessRouteEnvelope.route.provider !== 'google') {
      return NextResponse.json({
        status: 'unavailable',
        routes: [],
        route: null,
      }, {
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
    // Candidate work derives its endpoints only from the server-signed scoped
    // Google grant. The body pair was used solely as an exact verification
    // expectation and is not an independent trust source.
    origin = accessRouteEnvelope.origin
    destination = accessRouteEnvelope.destination
  } else if (
    (access.mode === 'public' && !hasAuthenticatedIdentity)
    || body.accessRouteEnvelope !== undefined
  ) {
    const accessRouteEnvelope = verifyRouteOptionEnvelope(body.accessRouteEnvelope, {
      origin,
      destination,
      assessmentScopeId: null,
    })
    if (!accessRouteEnvelope || accessRouteEnvelope.route.provider !== 'google') {
      return NextResponse.json({
        status: 'unavailable',
        routes: [],
        route: null,
      }, {
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
  }

  if (access.mode === 'public' && !hasAuthenticatedIdentity) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')?.trim()
      ?? ''
    const withinLimit = await checkWeatherGuestRateLimit(ip, 'teskeid-candidate')
    if (!withinLimit) {
      return NextResponse.json({
        status: 'unavailable',
        routes: [],
        route: null,
      }, {
        status: 429,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
  }

  const includeAlternatives = body?.alternatives === true
  const graphCache = getIcelandRoadGraphCacheStatus()
  const candidateStartedAt = performance.now()
  const outcome = assessmentScopeId !== null
    ? await getTeskeidAssessmentRouteCandidatesOutcome(
        origin,
        destination,
        assessmentScopeId,
        includeAlternatives,
      )
    : await getTeskeidRouteCandidatesOutcome(origin, destination, includeAlternatives)
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
        ...(assessmentScopeId ? { assessmentScopeId } : {}),
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
