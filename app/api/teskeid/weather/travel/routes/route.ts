import { after, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveWeatherBaseAccess, getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import {
  isConfirmedLocationInput,
  type ConfirmedLocationInput,
} from '@/lib/places/providerCandidate'
import { recordTeskeidUsageEvent, routePairFingerprint } from '@/lib/teskeid/usage.server'
import { checkWeatherGuestRateLimit } from '@/lib/weather/ip-rate-limit.server'
import { discoverTeskeidRoutes } from '@/lib/road-intelligence/teskeidRouteDiscovery.server'
import { teskeidAssessmentEvidenceMatchesSignedRoute } from '@/lib/iceland-routes/routeAssessmentCandidateEvidence.server'
import { createRouteOptionEvidenceClaim } from '@/lib/iceland-routes/routeOptionEvidence.server'
import {
  signRouteOptionEnvelope,
  type RouteOptionEnvelopeV1,
} from '@/lib/iceland-routes/routeOptionEnvelope.server'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const

/**
 * Compatibility route-discovery endpoint for Ferðalagið and older clients.
 * It is intentionally Teskeið-only and route-only: no forecast, provider
 * station, route-memory warming or Google Routes work is allowed here.
 */
export async function POST(request: Request) {
  if (process.env.AUTH_MVP_ENABLED !== 'true' || getWeatherEnabledMode() === 'off') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const hasAuthenticatedIdentity = Boolean(user?.id && user.email)
  const access = await resolveWeatherBaseAccess(user)
  if (access.mode === 'blocked') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (access.mode === 'public' && !hasAuthenticatedIdentity) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')?.trim()
      ?? ''
    const withinLimit = await checkWeatherGuestRateLimit(ip, 'teskeid-candidate')
    if (!withinLimit) {
      return NextResponse.json(
        { error: 'rate_limited_guest' },
        { status: 429, headers: NO_STORE_HEADERS },
      )
    }
  }

  const body = await request.json().catch(() => null)
  if (!body || !isConfirmedLocationInput(body.origin)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 400 })
  }
  if (!isConfirmedLocationInput(body.destination)) {
    return NextResponse.json({ error: 'invalid_destination' }, { status: 400 })
  }

  const origin = body.origin as ConfirmedLocationInput
  const destination = body.destination as ConfirmedLocationInput
  const routePairHash = routePairFingerprint(origin, destination)
  const hashMeta = routePairHash === null ? {} : { routePairHash }

  const outcome = await discoverTeskeidRoutes(origin, destination)
  if (outcome.status !== 'ready') {
    after(async () => {
      await recordTeskeidUsageEvent({
        userId: access.userId,
        featureKey: 'vedrid',
        eventName: 'weather_route_options_failed',
        path: '/api/teskeid/weather/travel/routes',
        metadata: { actor: access.actor, ...hashMeta, failureReason: outcome.status },
      })
    })
    return NextResponse.json({
      status: outcome.status,
      assessmentScope: outcome.assessmentScope,
      routes: [],
      routeEnvelopes: [],
      recommendedRouteId: null,
    }, {
      status: outcome.status === 'pending' ? 202 : 422,
      headers: NO_STORE_HEADERS,
    })
  }

  let routeEnvelopes: RouteOptionEnvelopeV1[]
  try {
    routeEnvelopes = outcome.routes.map((route, index) => {
      const evidence = outcome.evidence[index]
      if (!evidence || !teskeidAssessmentEvidenceMatchesSignedRoute(evidence, route)) {
        throw new Error('route_evidence_unavailable')
      }
      const routeEvidence = createRouteOptionEvidenceClaim({
        origin: outcome.assessmentScope.origin,
        destination: outcome.assessmentScope.destination,
        evidence,
      })
      if (!routeEvidence) throw new Error('route_evidence_unavailable')
      return signRouteOptionEnvelope({
        origin: {
          lat: outcome.assessmentScope.origin.lat,
          lon: outcome.assessmentScope.origin.lon,
        },
        destination: {
          lat: outcome.assessmentScope.destination.lat,
          lon: outcome.assessmentScope.destination.lon,
        },
        assessmentScopeId: outcome.assessmentScope.scopeId,
        route,
        routeEvidence,
      })
    })
  } catch {
    return NextResponse.json(
      { error: 'route_envelope_unavailable' },
      { status: 503, headers: NO_STORE_HEADERS },
    )
  }

  after(async () => {
    await recordTeskeidUsageEvent({
      userId: access.userId,
      featureKey: 'vedrid',
      eventName: 'weather_route_options_calculated',
      path: '/api/teskeid/weather/travel/routes',
      metadata: {
        actor: access.actor,
        ...hashMeta,
        provider: 'teskeid',
        routeCount: outcome.routes.length,
        curatedRouteLabels: [...new Set(
          outcome.routes.flatMap(route => route.labels).filter(label => label.startsWith('CURATED_')),
        )],
      },
    })
  })

  return NextResponse.json({
    status: 'ready',
    assessmentScope: outcome.assessmentScope,
    routes: outcome.routes,
    routeEnvelopes,
    recommendedRouteId: outcome.recommendedRouteId,
    ...(outcome.cacheable ? {} : { cacheable: false }),
  }, { headers: NO_STORE_HEADERS })
}
