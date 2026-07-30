import { after, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveWeatherBaseAccess, getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { getWeatherMapProvider } from '@/lib/weather/provider.server'
import type { PlaceCandidate, RouteOption } from '@/lib/weather/provider.types'
import {
  isConfirmedLocationInput,
  toWeatherPlaceCandidate,
  type ConfirmedLocationInput,
} from '@/lib/places/providerCandidate'
import { recordTeskeidUsageEvent, routePairFingerprint } from '@/lib/teskeid/usage.server'
import { checkWeatherGuestRateLimit } from '@/lib/weather/ip-rate-limit.server'
import { VEDURSTOFAN_STATIONS_REGISTRY } from '@/lib/weather/providers/vedurstofanStationsRegistry'
import { matchProviderPointsToRoute, DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M } from '@/lib/weather/providerRouteMatching'
import { readVegagerdinCurrentWithHistoryFallback } from '@/lib/weather/providers/vegagerdinCurrent.server'
import { normalizePlaceForMemory, buildRouteMemoryKey } from '@/lib/iceland-routes/routePlaceNormalization'
import { recordRouteMemory, type RouteMemoryStation } from '@/lib/iceland-routes/routeMemory.server'
import {
  getTeskeidRouteCandidate,
  isTeskeidRouteCandidateEnabled,
} from '@/lib/iceland-routes/roadGraphCandidate.server'
import {
  signRouteOptionEnvelope,
  type RouteOptionEnvelopeV1,
} from '@/lib/iceland-routes/routeOptionEnvelope.server'
import { routeMemoryVariantIdentity } from '@/lib/iceland-routes/routeMemoryVariant'
import { resolveRouteAssessmentScope } from '@/lib/iceland-routes/routeAssessmentScope.server'
import { getIcelandRoadGraph } from '@/lib/iceland-routes/roadGraphRuntime.server'

const MAX_EXPECTED_ASSESSMENT_SCOPE_ID_LENGTH = 500
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const

export async function POST(request: Request) {
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (getWeatherEnabledMode() === 'off') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const access = await resolveWeatherBaseAccess(user)
  if (access.mode === 'blocked') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (access.mode === 'public') {
    // Public/base weather: enforce per-IP rate limit
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            ?? request.headers.get('x-real-ip')?.trim()
            ?? ''
    const withinLimit = await checkWeatherGuestRateLimit(ip)
    if (!withinLimit) {
      await recordTeskeidUsageEvent({
        userId: null,
        featureKey: 'vedrid',
        eventName: 'weather_route_options_rate_limited',
        path: '/api/teskeid/weather/travel/routes',
        metadata: { actor: 'public' },
      })
      return NextResponse.json({ error: 'rate_limited_guest' }, { status: 429 })
    }
  }

  const { actor, userId } = access

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  if (!isConfirmedLocationInput(body.origin)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 400 })
  }
  if (!isConfirmedLocationInput(body.destination)) {
    return NextResponse.json({ error: 'invalid_destination' }, { status: 400 })
  }

  const origin = body.origin as ConfirmedLocationInput
  const destination = body.destination as ConfirmedLocationInput

  if (process.env.NODE_ENV !== 'production') {
    console.log('[routes/routes] placeId in request body:', {
      origin: origin.source ?? 'legacy',
      destination: destination.source ?? 'legacy',
    })
  }

  const resolveAssessmentScope = body.resolveAssessmentScope === true
  const rawExpectedAssessmentScopeId = body.expectedAssessmentScopeId
  let expectedAssessmentScopeId: string | null = null
  if (rawExpectedAssessmentScopeId !== undefined) {
    if (
      !resolveAssessmentScope
      || typeof rawExpectedAssessmentScopeId !== 'string'
      || rawExpectedAssessmentScopeId.trim().length === 0
      || rawExpectedAssessmentScopeId.length > MAX_EXPECTED_ASSESSMENT_SCOPE_ID_LENGTH
    ) {
      return NextResponse.json(
        { error: 'invalid_expected_assessment_scope_id' },
        { status: 400, headers: NO_STORE_HEADERS },
      )
    }
    expectedAssessmentScopeId = rawExpectedAssessmentScopeId.trim()
  }

  const assessmentScope = resolveAssessmentScope
    ? await resolveRouteAssessmentScope(origin, destination)
    : null
  if (
    expectedAssessmentScopeId !== null
    && !(assessmentScope?.status === 'unavailable'
      && assessmentScope.reason === 'road_graph_unavailable')
    && (
      assessmentScope?.status !== 'ready'
      || assessmentScope.scopeId !== expectedAssessmentScopeId
    )
  ) {
    return NextResponse.json(
      { error: 'assessment_scope_mismatch' },
      { status: 409, headers: NO_STORE_HEADERS },
    )
  }
  if (assessmentScope && assessmentScope.status !== 'ready') {
    if (
      assessmentScope.status === 'unavailable'
      && assessmentScope.reason === 'road_graph_unavailable'
    ) {
      // The first request may hit a cold serverless instance. Keep the shared
      // graph materialisation alive after this retryable response so the exact
      // same endpoints can succeed on a following client attempt.
      after(async () => {
        await getIcelandRoadGraph().catch(() => undefined)
      })
    }
    return NextResponse.json({
      assessmentScope,
      routes: [],
      ...(body.includeRouteEnvelopes === true ? { routeEnvelopes: [] } : {}),
    }, {
      headers: NO_STORE_HEADERS,
    })
  }

  const routeOrigin = assessmentScope?.status === 'ready' ? assessmentScope.origin : origin
  const routeDestination = assessmentScope?.status === 'ready' ? assessmentScope.destination : destination
  const originCandidate: PlaceCandidate = toWeatherPlaceCandidate(routeOrigin)
  const destCandidate: PlaceCandidate = toWeatherPlaceCandidate(routeDestination)

  const provider = getWeatherMapProvider()
  if (!provider) {
    return NextResponse.json({ error: 'provider_not_configured' }, { status: 422 })
  }

  const routePairHash = routePairFingerprint(routeOrigin, routeDestination)
  const hashMeta = routePairHash !== null ? { routePairHash } : {}

  let routes
  try {
    routes = await provider.getRouteOptions(originCandidate, destCandidate)
  } catch {
    await recordTeskeidUsageEvent({
      userId,
      featureKey: 'vedrid',
      eventName: 'weather_route_options_failed',
      path: '/api/teskeid/weather/travel/routes',
      metadata: { actor, ...hashMeta },
    })
    return NextResponse.json({ error: 'route_unavailable' }, { status: 503 })
  }

  if (routes.length === 0) {
    await recordTeskeidUsageEvent({
      userId,
      featureKey: 'vedrid',
      eventName: 'weather_route_options_failed',
      path: '/api/teskeid/weather/travel/routes',
      metadata: { actor, ...hashMeta },
    })
    return NextResponse.json({ error: 'route_unavailable' }, { status: 422 })
  }

  // Google remains canonical and first. The experimental Teskeið candidate is
  // available to every eligible Weather user, including public guests, while
  // the global server flag remains the emergency switch.
  const sorted = [...routes].sort((a, b) => a.durationS - b.durationS)
  const includeTeskeidCandidate = body.includeTeskeidCandidate !== false
  // Assessment anchors may land inside an official-road edge. The current
  // Teskeið candidate engine re-snaps to graph nodes, so fail closed for every
  // assessment scope until that engine preserves edge projections itself.
  const hasTeskeidRouting = assessmentScope?.status === 'ready'
    ? false
    : includeTeskeidCandidate && isTeskeidRouteCandidateEnabled()
  const teskeidCandidate = hasTeskeidRouting
    ? await getTeskeidRouteCandidate(
        { lat: originCandidate.lat, lon: originCandidate.lon },
        { lat: destCandidate.lat, lon: destCandidate.lon },
      )
    : null
  const responseRoutes = teskeidCandidate ? [...sorted, teskeidCandidate] : sorted

  const includeRouteEnvelopes = body.includeRouteEnvelopes === true
  const compactRouteEnvelopes = includeRouteEnvelopes && body.compactRouteEnvelopes === true
  let routeEnvelopes: RouteOptionEnvelopeV1[] = []
  if (includeRouteEnvelopes) {
    try {
      routeEnvelopes = responseRoutes.map(route => signRouteOptionEnvelope({
        origin: { lat: originCandidate.lat, lon: originCandidate.lon },
        destination: { lat: destCandidate.lat, lon: destCandidate.lon },
        route,
        ...(assessmentScope?.status === 'ready'
          ? { assessmentScopeId: assessmentScope.scopeId }
          : {}),
      }))
    } catch {
      return NextResponse.json({ error: 'route_envelope_unavailable' }, { status: 503 })
    }
  }

  const fromNorm = normalizePlaceForMemory(originCandidate.displayName, originCandidate.formattedAddress)
  const toNorm = normalizePlaceForMemory(destCandidate.displayName, destCandidate.formattedAddress)
  // Analytics and route-memory warming must not hold back the first usable
  // route. Next's after() keeps this best-effort work alive after the response.
  // Privacy remains unchanged: no raw route geometry or user ID is persisted
  // by the route-memory helper.
  after(async () => {
    await recordTeskeidUsageEvent({
      userId,
      featureKey: 'vedrid',
      eventName: 'weather_route_options_calculated',
      path: '/api/teskeid/weather/travel/routes',
      metadata: {
        actor,
        ...hashMeta,
        provider: 'google',
        routeCount: responseRoutes.length,
        googleRouteCount: sorted.length,
        teskeidCandidateIncluded: teskeidCandidate !== null,
        originIdPresent: originCandidate.placeId !== 'confirmed',
        destinationIdPresent: destCandidate.placeId !== 'confirmed',
        curatedRouteLabels: [...new Set(sorted.flatMap(r => r.labels).filter(l => l.startsWith('CURATED_')))],
      },
    })
    if (!compactRouteEnvelopes && fromNorm && toNorm) {
      await warmRouteMemoryFromOptions(responseRoutes, fromNorm, toNorm)
    }
  })

  return NextResponse.json({
    ...(assessmentScope ? { assessmentScope } : {}),
    ...(!compactRouteEnvelopes ? { routes: responseRoutes } : {}),
    ...(includeRouteEnvelopes ? { routeEnvelopes } : {}),
  })
}

// ── Route-memory warming helper ───────────────────────────────────────────────

/**
 * Match Veðurstofan and Vegagerðin stations for each route option and persist
 * via recordRouteMemory. Called fire-and-forget from the route-options endpoint.
 *
 * Uses cached Vegagerðin data only — never makes a live Vegagerðin request.
 * If Vegagerðin cache is unavailable, it is omitted from providersEvaluated
 * so existing station rows are preserved.
 */
async function warmRouteMemoryFromOptions(
  routeOptions: RouteOption[],
  fromNorm: { key: string; label: string },
  toNorm: { key: string; label: string },
): Promise<void> {
  try {
    const vegagerdinResult = await readVegagerdinCurrentWithHistoryFallback()
    const vegagerdinAvailable = vegagerdinResult.status === 'fresh' || vegagerdinResult.status === 'stale'
    const vegagerdinMatchable = (vegagerdinAvailable ? vegagerdinResult.payload.measurements : [])
      .filter(m => m.stationId && m.lat !== null && m.lon !== null)

    const vedurstofanPoints = VEDURSTOFAN_STATIONS_REGISTRY
      .filter(s => s.stationId !== null && s.lat !== null && s.lon !== null)
      .map(s => ({ id: s.stationId!, name: s.name, lat: s.lat!, lon: s.lon! }))

    await Promise.all(routeOptions.map(async routeOption => {
      const routePolyline = routeOption.providerMatchingPoints ?? routeOption.points

      const vedurstofanMatches = matchProviderPointsToRoute({
        points: vedurstofanPoints,
        routePolyline,
        maxDistanceM: DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M,
      })

      const vegagerdinMatches = matchProviderPointsToRoute({
        points: vegagerdinMatchable.map(m => ({
          id: m.stationId,
          name: m.stationName,
          lat: m.lat!,
          lon: m.lon!,
        })),
        routePolyline,
        maxDistanceM: DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M,
      })

      // Use curated label as variant label — do not store raw Google route text.
      const variant = routeMemoryVariantIdentity(routeOption)

      const stations: RouteMemoryStation[] = [
        ...vedurstofanMatches.map((m, i) => ({
          provider: 'vedurstofan' as const,
          stationId: m.point.id,
          stationName: m.point.name ?? null,
          routeOrder: i,
          distanceFromOriginM: Math.round(m.distanceFromOriginM),
          distanceFromRouteM: Math.round(m.distanceM),
          routeFraction: m.routeFraction,
        })),
        ...vegagerdinMatches.map((m, i) => ({
          provider: 'vegagerdin' as const,
          stationId: m.point.id,
          stationName: m.point.name ?? null,
          routeOrder: i,
          distanceFromOriginM: Math.round(m.distanceFromOriginM),
          distanceFromRouteM: Math.round(m.distanceM),
          routeFraction: m.routeFraction,
        })),
      ]

      const providersEvaluated: ReadonlyArray<'vedurstofan' | 'vegagerdin'> = vegagerdinAvailable
        ? ['vedurstofan', 'vegagerdin']
        : ['vedurstofan']

      await recordRouteMemory({
        routeKey: buildRouteMemoryKey(fromNorm.key, toNorm.key, variant.key),
        fromPlaceKey: fromNorm.key,
        fromPlaceLabel: fromNorm.label,
        toPlaceKey: toNorm.key,
        toPlaceLabel: toNorm.label,
        routeVariantKey: variant.key,
        routeVariantLabel: variant.label,
        routeCautionIds: routeOption.cautions?.map(c => c.id) ?? [],
        stations,
        providersEvaluated,
      })
    }))
  } catch {
    // Best-effort: swallow all errors. recordRouteMemory() logs DB failures internally.
    console.error('[route-memory] options warm failed')
  }
}
