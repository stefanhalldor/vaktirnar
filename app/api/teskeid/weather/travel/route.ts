import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { resolveWeatherBaseAccess, getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { fetchForecast } from '@/lib/weather/metno.server'
import { readVedurstofanProductForStations, getLastVedurstofanWarmAttemptIso } from '@/lib/weather/providers/vedurstofan.server'
import { VEDURSTOFAN_STATIONS } from '@/lib/weather/providers/vedurstofanStations'
import { checkTravelWeather } from '@/lib/weather/travel'
import type { VedurstofanTravelLayer } from '@/lib/weather/providers/vedurstofanBlend'
import { VEDURSTOFAN_STATIONS_REGISTRY } from '@/lib/weather/providers/vedurstofanStationsRegistry'
import { resolveThresholds, validateResolvedThresholdOrdering } from '@/lib/weather/thresholds'
import { getWeatherMapProvider } from '@/lib/weather/provider.server'
import type {
  DeterministicResult,
  HourPoint,
  TravelPointForecast,
  TravelThresholdOverrides,
} from '@/lib/weather/types'
import type { TrailerKind } from '@/lib/weather/question'
import type { PlaceCandidate, RouteOption } from '@/lib/weather/provider.types'
import { sampleRouteWeatherPoints } from '@/lib/weather/routeSampling'
import {
  haversineM,
  matchProviderPointsToRoute,
  pointToPolylineDistanceM,
  DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M,
  VEGAGERDIN_PROVIDER_ROUTE_MAX_DISTANCE_M,
  type ProviderRouteMatch,
  type ProviderRoutePoint,
} from '@/lib/weather/providerRouteMatching'
import { recordTeskeidUsageEvent, routePairFingerprint } from '@/lib/teskeid/usage.server'
import { readVegagerdinCurrentWithHistoryFallback } from '@/lib/weather/providers/vegagerdinCurrent.server'
import type { VegagerdinRouteLayer } from '@/lib/road-intelligence/vegagerdinRouteLayer'
import { classifyObservationWindDisplayStatus } from '@/lib/weather/windDisplayStatus'
import { normalizePlaceForMemory, buildRouteMemoryKey } from '@/lib/iceland-routes/routePlaceNormalization'
import { recordRouteMemory, type RouteMemoryStation } from '@/lib/iceland-routes/routeMemory.server'
import { scheduleTeskeidShadowRun } from '@/lib/iceland-routes/routingScheduler.server'
import {
  getTeskeidRouteCandidateById,
  isTeskeidRouteCandidateEnabled,
  TESKEID_ROUTE_CANDIDATE_ID,
  TESKEID_ROUTE_CANDIDATE_ID_PREFIX,
} from '@/lib/iceland-routes/roadGraphCandidate.server'
import { verifyRouteOptionEnvelope } from '@/lib/iceland-routes/routeOptionEnvelope.server'
import { routeMemoryVariantIdentity } from '@/lib/iceland-routes/routeMemoryVariant'
import {
  isConfirmedLocationInput,
  toWeatherPlaceCandidate,
  type ConfirmedLocationInput,
} from '@/lib/places/providerCandidate'
import { resolveTrustedRouteCoverageFromRuntime } from '@/lib/iceland-routes/trustedRouteCoverage.server'
import {
  sliceRouteByFractions,
  type RouteWeatherCoverage,
} from '@/lib/iceland-routes/trustedRouteCoverage'

const VALID_TRAILER_KINDS = new Set([
  'none', 'generic_trailer', 'tent_trailer', 'folding_camper', 'caravan', 'horse_trailer',
])
const MAX_ASSESSMENT_SCOPE_ID_LENGTH = 500

/**
 * Max time to wait for the Veðurstofan product-table read before falling back
 * to baseline only. The read includes every matched route station and an
 * optional history window, so a cold serverless/database path can legitimately
 * exceed the old 1.5 s budget. Keep a finite fail-open bound, but prefer
 * waiting over presenting a partial station set as a complete route result.
 */
const VEDURSTOFAN_LAYER_BUDGET_MS = 20_000

function withLayerTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<T>(resolve => {
    timer = setTimeout(() => resolve(fallback), VEDURSTOFAN_LAYER_BUDGET_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>
}

// Provider route distance policy: imported from providerRouteMatching so both this endpoint
// and the route-selection provider-stations endpoint always use the same cutoff.
// Change DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M in providerRouteMatching.ts to update both.
const VEGAGERDIN_ROUTE_FALLBACK_MAX_DISTANCE_M = 12_000
const VEGAGERDIN_ROUTE_FALLBACK_MAX_POINTS = 40

function shouldLogRoadMapApiDiagnostics(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ROAD_INTELLIGENCE_DEBUG === 'true'
}

function logRoadMapApiDiagnostic(message: string, details?: Record<string, unknown>) {
  if (!shouldLogRoadMapApiDiagnostics()) return
  if (details) {
    console.info(`[RoadMap API][diagnostic] ${message}`, details)
  } else {
    console.info(`[RoadMap API][diagnostic] ${message}`)
  }
}

function nearestProviderPointDiagnostics<T extends ProviderRoutePoint>(
  points: readonly T[],
  routePolyline: ReadonlyArray<{ lat: number; lon: number }>,
) {
  if (routePolyline.length < 2) return []
  return points
    .filter((point): point is T & { lat: number; lon: number } =>
      typeof point.lat === 'number' &&
      Number.isFinite(point.lat) &&
      typeof point.lon === 'number' &&
      Number.isFinite(point.lon),
    )
    .map(point => ({
      id: point.id,
      name: point.name ?? null,
      distanceM: Math.round(pointToPolylineDistanceM(point.lat, point.lon, routePolyline)),
    }))
    .sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id))
    .slice(0, 8)
}

function matchVegagerdinPointsToRoute<T extends ProviderRoutePoint>({
  points,
  routePolyline,
}: {
  points: readonly T[]
  routePolyline: ReadonlyArray<{ lat: number; lon: number }>
}): ProviderRouteMatch<T>[] {
  const strictMatches = matchProviderPointsToRoute({
    points,
    routePolyline,
    maxDistanceM: VEGAGERDIN_PROVIDER_ROUTE_MAX_DISTANCE_M,
  })
  if (strictMatches.length > 0) {
    logRoadMapApiDiagnostic('vegagerdin route match', {
      mode: 'strict',
      routePointCount: routePolyline.length,
      providerPointCount: points.length,
      strictCount: strictMatches.length,
      wideCount: null,
      nearest: strictMatches.slice(0, 8).map(match => ({
        id: match.point.id,
        name: match.point.name ?? null,
        distanceM: Math.round(match.distanceM),
        distanceFromOriginM: Math.round(match.distanceFromOriginM),
      })),
    })
    return strictMatches
  }

  const wideMatches = matchProviderPointsToRoute({
    points,
    routePolyline,
    maxDistanceM: VEGAGERDIN_ROUTE_FALLBACK_MAX_DISTANCE_M,
    maxPoints: VEGAGERDIN_ROUTE_FALLBACK_MAX_POINTS,
  })
  logRoadMapApiDiagnostic('vegagerdin route match', {
    mode: wideMatches.length > 0 ? 'wide-fallback' : 'no-match',
    routePointCount: routePolyline.length,
    providerPointCount: points.length,
    strictCount: strictMatches.length,
    wideCount: wideMatches.length,
    nearest: wideMatches.length > 0
      ? wideMatches.slice(0, 8).map(match => ({
          id: match.point.id,
          name: match.point.name ?? null,
          distanceM: Math.round(match.distanceM),
          distanceFromOriginM: Math.round(match.distanceFromOriginM),
        }))
      : nearestProviderPointDiagnostics(points, routePolyline),
  })
  return wideMatches
}

function validateThresholdOverrides(raw: unknown): TravelThresholdOverrides | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const result: TravelThresholdOverrides = {}

  const checkMs = (key: keyof TravelThresholdOverrides, min: number, max: number) => {
    const v = o[key]
    if (v === undefined) return
    if (typeof v !== 'number' || !isFinite(v) || v < min || v > max) {
      throw new Error(`${key} must be a number between ${min} and ${max}`)
    }
    result[key] = v
  }

  checkMs('cautionWindMs', 0, 40)
  checkMs('redWindMs', 0, 40)
  // Gust and precip are neutralised in this phase — high neutral values (100) must be accepted
  checkMs('redGustMs', 0, 100)
  checkMs('cautionPrecipMmPerHour', 0, 100)

  return Object.keys(result).length > 0 ? result : undefined
}

function buildUnassessedRouteResult(input: {
  originName: string
  destinationName: string
  distanceM: number
  durationS: number
  earliestDepartureAt?: string
  routePolyline: Array<{ lat: number; lon: number }>
  coverage: Extract<RouteWeatherCoverage, { status: 'same_urban_area' | 'unavailable' }>
}): DeterministicResult {
  const earliestDepartureIso = input.earliestDepartureAt ?? new Date().toISOString()
  return {
    id: `dr_scope_${Date.now()}`,
    source: 'deterministic',
    toolName: 'checkTravelWeather',
    createdAt: new Date().toISOString(),
    // This is an internal non-display value. Localized product copy is chosen
    // from weatherCoverage in the client.
    svar: '',
    stada: 'gult',
    reasonCode: input.coverage.status === 'same_urban_area'
      ? 'same_urban_area'
      : 'trusted_route_unavailable',
    travelPlan: {
      route: {
        originName: input.originName,
        destinationName: input.destinationName,
        distanceKm: Math.round(input.distanceM / 1000),
        durationMinutes: Math.round(input.durationS / 60),
        auditPolylinePoints: input.routePolyline,
        weatherCoverage: input.coverage,
      },
      outbound: {
        earliestDepartureIso,
        candidates: [],
        badWindows: [],
        windowMode: false,
      },
      routeWeatherPoints: [],
    },
  }
}

function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false
  return isFinite(new Date(value).getTime())
}

export async function POST(request: Request) {
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (getWeatherEnabledMode() === 'off') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const hasAuthenticatedIdentity = Boolean(user?.id && user.email)

  const access = await resolveWeatherBaseAccess(user)
  if (access.mode === 'blocked') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // No rate limit for public/base weather final submit (intentional: rate limit is on /routes only)

  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  // Validate origin and destination
  if (!isConfirmedLocationInput(body.origin)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 400 })
  }
  if (!isConfirmedLocationInput(body.destination)) {
    return NextResponse.json({ error: 'invalid_destination' }, { status: 400 })
  }

  // Validate optional time fields — present but invalid → 400; absent/empty → undefined
  if (body.earliestDepartureAt && !isValidDateString(body.earliestDepartureAt)) {
    return NextResponse.json({ error: 'invalid_departure' }, { status: 400 })
  }
  if (body.latestArrivalBy && !isValidDateString(body.latestArrivalBy)) {
    return NextResponse.json({ error: 'invalid_latest_arrival' }, { status: 400 })
  }
  if (body.latestHomeBy && !isValidDateString(body.latestHomeBy)) {
    return NextResponse.json({ error: 'invalid_latest_home' }, { status: 400 })
  }
  const earliestDepartureAt: string | undefined = isValidDateString(body.earliestDepartureAt) ? body.earliestDepartureAt : undefined
  const latestArrivalBy: string | undefined = isValidDateString(body.latestArrivalBy) ? body.latestArrivalBy : undefined
  const latestHomeBy: string | undefined = isValidDateString(body.latestHomeBy) ? body.latestHomeBy : undefined

  const timeFieldCount = [earliestDepartureAt, latestArrivalBy, latestHomeBy].filter(Boolean).length
  if (timeFieldCount > 1) {
    return NextResponse.json({ error: 'time_constraint_conflict' }, { status: 400 })
  }

  // Validate enum fields
  if (!VALID_TRAILER_KINDS.has(String(body.trailerKind))) {
    return NextResponse.json({ error: 'invalid_trailer_kind' }, { status: 400 })
  }
  const trailerKind = body.trailerKind as 'none' | TrailerKind

  // Validate threshold overrides
  let thresholdOverrides: TravelThresholdOverrides | undefined
  try {
    thresholdOverrides = validateThresholdOverrides(body.thresholdOverrides)
  } catch (e: unknown) {
    return NextResponse.json(
      { error: 'thresholds_invalid', message: e instanceof Error ? e.message : 'Invalid threshold values' },
      { status: 400 },
    )
  }

  // Check threshold ordering invariant (cautionWindMs < redWindMs)
  if (thresholdOverrides) {
    const resolved = resolveThresholds(trailerKind, thresholdOverrides)
    const orderError = validateResolvedThresholdOrdering(resolved)
    if (orderError) {
      return NextResponse.json(
        { error: 'thresholds_invalid', message: orderError },
        { status: 400 },
      )
    }
  }
  const resolvedThresholds = resolveThresholds(trailerKind, thresholdOverrides)

  const origin = body.origin as ConfirmedLocationInput
  const destination = body.destination as ConfirmedLocationInput
  const rawAssessmentScopeId = body.assessmentScopeId
  const assessmentScopeId = rawAssessmentScopeId === undefined
    ? null
    : typeof rawAssessmentScopeId === 'string'
      && rawAssessmentScopeId.trim() === rawAssessmentScopeId
      && rawAssessmentScopeId.length > 0
      && rawAssessmentScopeId.length <= MAX_ASSESSMENT_SCOPE_ID_LENGTH
      ? rawAssessmentScopeId
      : undefined
  if (assessmentScopeId === undefined) {
    return NextResponse.json({ error: 'invalid_assessment_scope_id' }, { status: 400 })
  }

  // Get route geometry — use selected route if provided, otherwise first available
  const { actor, userId } = access

  const hasRouteEnvelope = body.routeEnvelope !== undefined
  if (assessmentScopeId !== null && !hasRouteEnvelope) {
    return NextResponse.json({ error: 'route_envelope_invalid' }, { status: 422 })
  }
  const verifiedRouteEnvelope = hasRouteEnvelope
    ? verifyRouteOptionEnvelope(body.routeEnvelope, {
        origin: { lat: origin.lat, lon: origin.lon },
        destination: { lat: destination.lat, lon: destination.lon },
        assessmentScopeId,
      })
    : null
  if (hasRouteEnvelope && !verifiedRouteEnvelope) {
    return NextResponse.json({ error: 'route_envelope_invalid' }, { status: 422 })
  }

  // In assessment mode, coordinates authenticated by the envelope are the
  // sole downstream authority. Client metadata remains display-only and can
  // never replace the server-issued road anchors.
  const trustedOrigin: ConfirmedLocationInput = assessmentScopeId !== null && verifiedRouteEnvelope
    ? { ...origin, lat: verifiedRouteEnvelope.origin.lat, lon: verifiedRouteEnvelope.origin.lon }
    : origin
  const trustedDestination: ConfirmedLocationInput = assessmentScopeId !== null && verifiedRouteEnvelope
    ? {
        ...destination,
        lat: verifiedRouteEnvelope.destination.lat,
        lon: verifiedRouteEnvelope.destination.lon,
      }
    : destination
  const originCandidate: PlaceCandidate = toWeatherPlaceCandidate(trustedOrigin)
  const destCandidate: PlaceCandidate = toWeatherPlaceCandidate(trustedDestination)

  const requestedRouteId = typeof body.selectedRouteId === 'string' ? body.selectedRouteId : null
  if (
    verifiedRouteEnvelope
    && requestedRouteId
    && requestedRouteId !== verifiedRouteEnvelope.route.id
  ) {
    return NextResponse.json({ error: 'route_envelope_invalid' }, { status: 422 })
  }
  const selectedRouteId = verifiedRouteEnvelope?.route.id ?? requestedRouteId
  const selectedTeskeidRouteId = verifiedRouteEnvelope?.route.provider === 'teskeid'
    ? verifiedRouteEnvelope.route.id
    : selectedRouteId && (
    selectedRouteId === TESKEID_ROUTE_CANDIDATE_ID
    || selectedRouteId.startsWith(TESKEID_ROUTE_CANDIDATE_ID_PREFIX)
  ) ? selectedRouteId : null
  const provider = getWeatherMapProvider()
  if (!verifiedRouteEnvelope && !provider) {
    return NextResponse.json({ error: 'provider_not_configured' }, { status: 422 })
  }
  const routePairHash = routePairFingerprint(trustedOrigin, trustedDestination)
  const hashMeta = routePairHash !== null ? { routePairHash } : {}

  if (selectedTeskeidRouteId) {
    const anonymousPublicTeskeidEnvelope = access.mode === 'public'
      && !hasAuthenticatedIdentity
      && verifiedRouteEnvelope?.route.provider === 'teskeid'
    if (
      !isTeskeidRouteCandidateEnabled()
      || (access.mode === 'public' && !hasAuthenticatedIdentity && !anonymousPublicTeskeidEnvelope)
    ) {
      await recordTeskeidUsageEvent({
        userId,
        featureKey: 'vedrid',
        eventName: 'weather_final_forecast_failed',
        path: '/api/teskeid/weather/travel',
        metadata: { actor, ...hashMeta, failureReason: 'selected_route_unavailable', selectedRouteProvided: true },
      })
      return NextResponse.json({ error: 'selected_route_unavailable' }, { status: 422 })
    }
  }

  let routeGeometry
  try {
    if (verifiedRouteEnvelope) {
      routeGeometry = verifiedRouteEnvelope.route
    } else if (selectedTeskeidRouteId) {
      routeGeometry = await getTeskeidRouteCandidateById(
        { lat: originCandidate.lat, lon: originCandidate.lon },
        { lat: destCandidate.lat, lon: destCandidate.lon },
        selectedTeskeidRouteId,
      )
      if (!routeGeometry) {
        await recordTeskeidUsageEvent({
          userId,
          featureKey: 'vedrid',
          eventName: 'weather_final_forecast_failed',
          path: '/api/teskeid/weather/travel',
          metadata: { actor, ...hashMeta, failureReason: 'selected_route_unavailable', selectedRouteProvided: true },
        })
        return NextResponse.json({ error: 'selected_route_unavailable' }, { status: 422 })
      }
    } else if (selectedRouteId) {
      const routeOptions = await provider!.getRouteOptions(originCandidate, destCandidate)
      const matched = routeOptions.find(r => r.id === selectedRouteId)
      if (!matched) {
        await recordTeskeidUsageEvent({
          userId,
          featureKey: 'vedrid',
          eventName: 'weather_final_forecast_failed',
          path: '/api/teskeid/weather/travel',
          metadata: { actor, ...hashMeta, failureReason: 'selected_route_unavailable', selectedRouteProvided: true },
        })
        return NextResponse.json({ error: 'selected_route_unavailable' }, { status: 422 })
      }
      routeGeometry = matched
    } else {
      try {
        routeGeometry = await provider!.getRouteGeometry(originCandidate, destCandidate)
      } catch (error) {
        if (shouldLogRoadMapApiDiagnostics()) {
          console.warn('[RoadMap API] default route geometry failed; trying route options fallback')
        }
        routeGeometry = null
      }
      if (!routeGeometry) {
        const fallbackOptions = await provider!.getRouteOptions(originCandidate, destCandidate)
        routeGeometry = fallbackOptions.find(route => route.isDefault) ?? fallbackOptions[0] ?? null
      }
    }
  } catch (error) {
    if (shouldLogRoadMapApiDiagnostics()) {
      console.error('[RoadMap API] route provider unavailable')
    }
    await recordTeskeidUsageEvent({
      userId,
      featureKey: 'vedrid',
      eventName: 'weather_final_forecast_failed',
      path: '/api/teskeid/weather/travel',
      metadata: { actor, ...hashMeta, failureReason: 'route_unavailable', selectedRouteProvided: !!selectedRouteId },
    })
    return NextResponse.json({
      error: 'route_unavailable',
      ...(process.env.NODE_ENV !== 'production'
        ? { diagnostic: error instanceof Error ? error.message : 'unknown' }
        : {}),
    }, { status: 503 })
  }
  if (!routeGeometry) {
    await recordTeskeidUsageEvent({
      userId,
      featureKey: 'vedrid',
      eventName: 'weather_final_forecast_failed',
      path: '/api/teskeid/weather/travel',
      metadata: { actor, ...hashMeta, failureReason: 'route_unavailable', selectedRouteProvided: !!selectedRouteId },
    })
    return NextResponse.json({ error: 'route_unavailable' }, { status: 422 })
  }
  const routeMemoryVariant = selectedRouteId
    ? routeMemoryVariantIdentity(routeGeometry as RouteOption)
    : null
  const routePolyline = routeGeometry.providerMatchingPoints ?? routeGeometry.points

  const weatherCoverage = await resolveTrustedRouteCoverageFromRuntime({
    origin: {
      name: originCandidate.displayName,
      lat: originCandidate.lat,
      lon: originCandidate.lon,
    },
    destination: {
      name: destCandidate.displayName,
      lat: destCandidate.lat,
      lon: destCandidate.lon,
    },
    referenceRoute: routePolyline,
    routeDistanceM: routeGeometry.distanceM,
    routeDurationS: routeGeometry.durationS,
    // Only the claim recovered from the verified envelope may activate the
    // tighter assessment-anchor coverage path. Never trust the body value.
    assessmentScopeId: verifiedRouteEnvelope?.assessmentScopeId ?? null,
  })

  // Schedule shadow run via after() so it outlives the response flush in serverless.
  // No-op when TESKEID_ROUTING_SHADOW_ENABLED is not exactly 'true'.
  scheduleTeskeidShadowRun({
    origin: { lat: originCandidate.lat, lon: originCandidate.lon },
    destination: { lat: destCandidate.lat, lon: destCandidate.lon },
    trailerKind: typeof trailerKind === 'string' ? trailerKind : null,
  })

  if (weatherCoverage.status === 'same_urban_area' || weatherCoverage.status === 'unavailable') {
    const unassessedResult = buildUnassessedRouteResult({
      originName: originCandidate.displayName,
      destinationName: destCandidate.displayName,
      distanceM: routeGeometry.distanceM,
      durationS: routeGeometry.durationS,
      earliestDepartureAt,
      routePolyline,
      coverage: weatherCoverage,
    })
    await recordTeskeidUsageEvent({
      userId,
      featureKey: 'vedrid',
      eventName: 'weather_final_forecast_completed',
      path: '/api/teskeid/weather/travel',
      metadata: {
        actor,
        ...hashMeta,
        selectedRouteProvided: !!selectedRouteId,
        selectedRouteMatched: !!selectedRouteId,
        routeDistanceBucketKm: Math.floor(routeGeometry.distanceM / 1000 / 50) * 50,
        routeDurationBucketMinutes: Math.floor(routeGeometry.durationS / 60 / 30) * 30,
        resultStatus: unassessedResult.stada,
        weatherCoverageStatus: weatherCoverage.status,
      },
    })
    return NextResponse.json(unassessedResult)
  }

  const assessmentStartFraction = weatherCoverage.start.routeFraction
  const assessmentEndFraction = weatherCoverage.end.routeFraction
  const assessmentRoutePolyline = sliceRouteByFractions(
    routePolyline,
    assessmentStartFraction,
    assessmentEndFraction,
  ).points

  // Sample route weather points using exhaustive-when-cheap strategy.
  // Computes cumulative Haversine distance for all route points, then deduplicates
  // by ~1km grid. Uses all unique cells when cheap (≤120), falls back to 10km spacing.
  const fullRoutePoints = routeGeometry.points
  const fullRouteCumDist: number[] = [0]
  for (let i = 1; i < fullRoutePoints.length; i++) {
    fullRouteCumDist.push(
      fullRouteCumDist[i - 1]
      + haversineM(
        fullRoutePoints[i - 1].lat,
        fullRoutePoints[i - 1].lon,
        fullRoutePoints[i].lat,
        fullRoutePoints[i].lon,
      ),
    )
  }
  const fullRouteHaversineM = fullRouteCumDist[fullRouteCumDist.length - 1] ?? 0
  const assessmentRoute = sliceRouteByFractions(
    fullRoutePoints,
    assessmentStartFraction,
    assessmentEndFraction,
  )
  const sampledWeather = sampleRouteWeatherPoints(
    assessmentRoute.points,
    assessmentRoute.cumulativeDistanceFromTripOriginM,
  )
  const weatherPoints = sampledWeather.weatherPoints.map(point => {
    const routeFraction = fullRouteHaversineM > 0
      ? Math.max(0, Math.min(1, point.distanceFromOriginM / fullRouteHaversineM))
      : assessmentStartFraction
    return {
      ...point,
      distanceFromOriginM: Math.round(routeFraction * routeGeometry.distanceM),
      elapsedFromTripOriginS: Math.round(routeFraction * routeGeometry.durationS),
    }
  })
  const samplingDiagnostics = sampledWeather.diagnostics

  // Fetch route point forecasts and check Veðurstofan layer access in parallel.
  // When WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED is not 'true' (or unset), the layer
  // is open to all callers including public users — deletion from Vercel = open.
  const vedurstofanAccessRequired =
    process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED === 'true'
  const vegagerdinAccessRequired =
    process.env.WEATHER_PROVIDER_VEGAGERDIN_ACCESS_REQUIRED === 'true'
  const [routeForecastResults, destForecastRaw, layerEnabled, vegagerdinLayerEnabled] = await Promise.all([
    Promise.allSettled(weatherPoints.map((pt) => fetchForecast(pt.lat, pt.lon))),
    weatherCoverage.end.kind === 'exact'
      ? fetchForecast(destCandidate.lat, destCandidate.lon).catch(() => null)
      : Promise.resolve(null),
    !vedurstofanAccessRequired
      ? Promise.resolve(true)
      : user?.id && user?.email
        ? checkFeatureAccess(user.id, user.email, 'weather-provider-vedurstofan').catch(() => false)
        : Promise.resolve(false),
    !vegagerdinAccessRequired
      ? Promise.resolve(true)
      : user?.id && user?.email
        ? checkFeatureAccess(user.id, user.email, 'weather-provider-vegagerdin').catch(() => false)
        : Promise.resolve(false),
  ])

  // Station membership covers the complete selected route between the
  // server-verified assessment anchors. The narrower trusted-coverage slice is
  // for forecast assessment only; using it here silently drops legitimate
  // stations from otherwise valid route segments. Exact navigation coordinates
  // are not present in this signed/server-generated route geometry.
  const vedurstofanMatches = layerEnabled
    ? matchProviderPointsToRoute({
        points: VEDURSTOFAN_STATIONS_REGISTRY
          .filter(s => s.stationId !== null && s.lat !== null && s.lon !== null)
          .map(s => ({ id: s.stationId!, name: s.name, lat: s.lat!, lon: s.lon! })),
        routePolyline,
        maxDistanceM: DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M,
      })
    : []
  const vedurstofanStationIds = vedurstofanMatches.map(m => m.point.id)
  const stationMatchById = new Map(vedurstofanMatches.map(m => [m.point.id, m]))

  // Compute ETA window for history augmentation: span from 6h before departure
  // to 3h after expected arrival, so prev/used/next forecast rows are available
  // for any ETA along the route.
  let etaWindowFromIso: string | undefined
  let etaWindowToIso: string | undefined
  if (layerEnabled && vedurstofanStationIds.length > 0) {
    const depMs = earliestDepartureAt ? Date.parse(earliestDepartureAt) : Date.now()
    const arrMs = latestArrivalBy
      ? Date.parse(latestArrivalBy)
      : depMs + routeGeometry.durationS * 1000
    etaWindowFromIso = new Date(depMs - 6 * 60 * 60 * 1000).toISOString()
    etaWindowToIso   = new Date(arrMs + 3 * 60 * 60 * 1000).toISOString()
  }

  const [vedurstofanResults, lastWarmAttemptIso] = await Promise.all([
    layerEnabled && vedurstofanStationIds.length > 0
      ? withLayerTimeout(readVedurstofanProductForStations(vedurstofanStationIds, { etaWindowFromIso, etaWindowToIso }), null).catch(() => null)
      : Promise.resolve(null),
    layerEnabled ? getLastVedurstofanWarmAttemptIso() : Promise.resolve(null),
  ])

  const pointForecasts = routeForecastResults.flatMap((routeForecast, index): TravelPointForecast[] => (
    routeForecast.status === 'fulfilled'
      ? [{ hours: routeForecast.value as HourPoint[], ...weatherPoints[index] }]
      : []
  ))
  const destinationForecast = destForecastRaw ? { hours: destForecastRaw } : undefined

  if (pointForecasts.length === 0 && !destinationForecast) {
    await recordTeskeidUsageEvent({
      userId,
      featureKey: 'vedrid',
      eventName: 'weather_final_forecast_failed',
      path: '/api/teskeid/weather/travel',
      metadata: { actor, ...hashMeta, failureReason: 'forecast_unavailable', selectedRouteProvided: !!selectedRouteId },
    })
    return NextResponse.json({ error: 'forecast_unavailable' }, { status: 503 })
  }

  const result = checkTravelWeather({
    trailerKind,
    originName: originCandidate.displayName,
    destinationName: destCandidate.displayName,
    distanceM: routeGeometry.distanceM,
    durationS: routeGeometry.durationS,
    pointForecasts,
    destinationForecast,
    earliestDepartureAt,
    latestArrivalBy,
    latestHomeBy,
    // providerMatchingPoints is the full RDP-simplified Google polyline (≤1000 pts, low-metre epsilon).
    // It follows roads accurately. Falls back to the 80-point met.no sample when absent.
    auditPolylinePoints: routePolyline,
    samplingDiagnostics,
    thresholdOverrides,
  })
  if (!result.travelPlan) {
    return NextResponse.json({ error: 'forecast_unavailable' }, { status: 503 })
  }
  result.travelPlan.route.weatherCoverage = weatherCoverage
  if (weatherCoverage.start.kind !== 'exact') {
    result.travelPlan.routeWeatherPoints?.forEach(point => {
      point.isOrigin = false
    })
  }
  if (weatherCoverage.end.kind !== 'exact') {
    result.travelPlan.routeWeatherPoints?.forEach(point => {
      point.isDestinationClosest = false
    })
  }

  // Build Veðurstofan experimental layer (fail-open — never breaks baseline result)
  let vedurstofanLayer: VedurstofanTravelLayer | undefined
  let vegagerdinLayer: VegagerdinRouteLayer | undefined
  let vegagerdinRouteMatches: ProviderRouteMatch<ProviderRoutePoint>[] = []
  let vegagerdinProviderEvaluated = false
  if (layerEnabled && vedurstofanResults) {

    // Build station lookup maps for metadata
    const curatedByStationId = new Map(VEDURSTOFAN_STATIONS.map(s => [s.stationId, s]))
    const registryByStationId = new Map(
      VEDURSTOFAN_STATIONS_REGISTRY
        .filter(s => s.stationId !== null)
        .map(s => [s.stationId!, s]),
    )

    // Build one point per unique Veðurstofan station — station-based, not per met.no sample.
    const layerPoints: VedurstofanTravelLayer['points'] = []
    let mappedPointCount = 0
    let availablePointCount = 0
    let stalePointCount = 0
    let unavailablePointCount = 0

    for (const [stationId, stationResult] of vedurstofanResults) {
      mappedPointCount++
      if (stationResult.status === 'unavailable') {
        unavailablePointCount++
        continue
      }
      const curatedStation = curatedByStationId.get(stationId)
      const registryEntry = registryByStationId.get(stationId)
      const stationName = curatedStation?.stationName ?? registryEntry?.name ?? stationId
      const lat = curatedStation?.lat ?? registryEntry?.lat ?? null
      const lon = curatedStation?.lon ?? registryEntry?.lon ?? null
      const match = stationMatchById.get(stationId) ?? null
      const distanceM = match?.distanceM ?? 0
      const distanceFromOriginM = match?.distanceFromOriginM ?? null
      const routeFraction = match?.routeFraction ?? null
      const { payload } = stationResult
      if (stationResult.status === 'ok') availablePointCount++
      else stalePointCount++
      layerPoints.push({
        routePointId: `vedurstofan_${stationId}`,
        stationId,
        stationName,
        distanceM,
        distanceFromOriginM,
        routeFraction,
        status: stationResult.status as 'ok' | 'stale',
        atimeIso: payload.atimeIso,
        fetchedAtIso: payload.fetchedAtIso,
        expiresAtIso: payload.expiresAtIso,
        lat,
        lon,
        sourceUrl: registryEntry?.sourceUrl ?? null,
        forecastRows: payload.forecasts,
      })
    }

    // Sort by route order so all consumers (map, cards, Safnpúls) share the same station sequence.
    layerPoints.sort((a, b) => {
      const af = a.distanceFromOriginM ?? Infinity
      const bf = b.distanceFromOriginM ?? Infinity
      return af !== bf ? af - bf : a.stationId.localeCompare(b.stationId)
    })

    const layerStatus: VedurstofanTravelLayer['status'] =
      layerPoints.length === 0 ? 'unavailable' :
      unavailablePointCount > 0 ? 'partial' :
      'available'

    // Oldest atimeIso across all usable points (conservative freshness indicator for the UI banner)
    const layerAtimeIso = layerPoints.length > 0
      ? layerPoints
          .map(p => p.atimeIso)
          .filter((a): a is string => a !== null)
          .sort()[0] ?? null
      : null

    vedurstofanLayer = {
      experimental: true,
      status: layerStatus,
      mappedPointCount,
      availablePointCount,
      stalePointCount,
      unavailablePointCount,
      layerAtimeIso,
      lastWarmAttemptIso,
      points: layerPoints,
    }
  }

  // Build Vegagerðin route layer from cached/current observations, separately from
  // route-memory writes so the experimental map can render live road-station labels
  // even if route-memory normalization or persistence fails.
  try {
    const vegagerdinResult = await readVegagerdinCurrentWithHistoryFallback()
    const vegagerdinAvailable = vegagerdinResult.status === 'fresh' || vegagerdinResult.status === 'stale'
    logRoadMapApiDiagnostic('vegagerdin current read', {
      status: vegagerdinResult.status,
      cacheStatus: vegagerdinAvailable ? vegagerdinResult.cacheStatus : null,
      measurementFreshness: vegagerdinAvailable ? vegagerdinResult.measurementFreshness : null,
      measurementCount: vegagerdinAvailable ? vegagerdinResult.payload.measurements.length : 0,
      reason: vegagerdinResult.status === 'unavailable' ? vegagerdinResult.reason : null,
      vegagerdinLayerEnabled,
      routePolylineCount: routePolyline.length,
    })

    if (vegagerdinAvailable) {
      vegagerdinProviderEvaluated = true
      const vegagerdinMatchable = vegagerdinResult.payload.measurements
        .filter(m => m.stationId && m.lat !== null && m.lon !== null)
      logRoadMapApiDiagnostic('vegagerdin match input', {
        measurementCount: vegagerdinResult.payload.measurements.length,
        matchableCount: vegagerdinMatchable.length,
        routePolylineCount: routePolyline.length,
      })

      vegagerdinRouteMatches = matchVegagerdinPointsToRoute({
        points: vegagerdinMatchable.map(m => ({
          id: m.stationId,
          name: m.stationName,
          lat: m.lat,
          lon: m.lon,
        })),
        routePolyline,
      })

      if (vegagerdinLayerEnabled) {
        const measurementByStationId = new Map(
          vegagerdinMatchable.map(m => [m.stationId, m]),
        )
        const layerPoints: VegagerdinRouteLayer['points'] = vegagerdinRouteMatches
          .map((match): VegagerdinRouteLayer['points'][number] | null => {
            const measurement = measurementByStationId.get(match.point.id)
            if (!measurement) return null
            const statusWindMs = measurement.gustLast10MinMs ?? measurement.meanWindMs
            return {
              routePointId: `vegagerdin_${measurement.stationId}`,
              stationId: measurement.stationId,
              stationName: measurement.stationName,
              lat: measurement.lat,
              lon: measurement.lon,
              distanceM: Math.round(match.distanceM),
              distanceFromOriginM: Math.round(match.distanceFromOriginM),
              routeFraction: match.routeFraction,
              measuredAtIso: measurement.measuredAtIso,
              fetchedAtIso: measurement.fetchedAtIso,
              meanWindMs: measurement.meanWindMs,
              gustLast10MinMs: measurement.gustLast10MinMs,
              windDirectionDeg: measurement.windDirectionDeg,
              windDirectionText: measurement.windDirectionText,
              airTemperatureC: measurement.airTemperatureC,
              roadTemperatureC: measurement.roadTemperatureC,
              dataQuality: measurement.dataQuality,
              windDisplayStatus: classifyObservationWindDisplayStatus(measurement, resolvedThresholds),
              statusWindMs,
            }
          })
          .filter((p): p is VegagerdinRouteLayer['points'][number] => p !== null)
          .sort((a, b) => {
            const af = a.distanceFromOriginM ?? Infinity
            const bf = b.distanceFromOriginM ?? Infinity
            return af !== bf ? af - bf : a.stationId.localeCompare(b.stationId)
          })

        const noWindDataPointCount = layerPoints.filter(p => p.windDisplayStatus === 'no_data').length
        const measuredAtIsoValues = layerPoints.map(p => p.measuredAtIso).sort()
        const fetchedAtIsoValues = layerPoints.map(p => p.fetchedAtIso).sort()

        vegagerdinLayer = {
          provider: 'vegagerdin',
          status:
            layerPoints.length === 0
              ? 'unavailable'
              : noWindDataPointCount > 0
                ? 'partial'
                : 'available',
          cacheStatus: vegagerdinResult.cacheStatus,
          measurementFreshness: vegagerdinResult.measurementFreshness,
          measuredAtIso: measuredAtIsoValues[measuredAtIsoValues.length - 1] ?? null,
          fetchedAtIso: fetchedAtIsoValues[fetchedAtIsoValues.length - 1] ?? null,
          mappedPointCount: vegagerdinRouteMatches.length,
          availablePointCount: layerPoints.length - noWindDataPointCount,
          noWindDataPointCount,
          points: layerPoints,
        }
        logRoadMapApiDiagnostic('vegagerdin layer built', {
          matchCount: vegagerdinRouteMatches.length,
          layerPointCount: layerPoints.length,
          availablePointCount: layerPoints.length - noWindDataPointCount,
          noWindDataPointCount,
          layerStatus: vegagerdinLayer.status,
        })
      } else {
        logRoadMapApiDiagnostic('vegagerdin layer not returned', {
          reason: 'feature-access-disabled',
          matchCount: vegagerdinRouteMatches.length,
        })
      }
    } else {
      logRoadMapApiDiagnostic('vegagerdin unavailable for route layer', {
        status: vegagerdinResult.status,
        reason: vegagerdinResult.status === 'unavailable' ? vegagerdinResult.reason : null,
      })
    }
  } catch {
    // Fail-open: Vegagerðin labels are an experimental overlay, not a reason to
    // fail the route calculation. Keep logs static to avoid leaking route content.
    console.error('[vegagerdin-route-layer] build failed')
    logRoadMapApiDiagnostic('vegagerdin layer exception', {
      failureCategory: 'layer_build_failed',
    })
  }

  // ── Route-memory write (best-effort) ─────────────────────────────────────────
  // Record exact provider station IDs for this route so /vedrid can filter its map
  // without any corridor/radius approximation on subsequent visits.
  // Privacy: only normalized place keys/labels + station IDs stored. No user ID,
  // no raw addresses, no raw Google route content.
  if (assessmentScopeId === null) {
    try {
      const fromNorm = normalizePlaceForMemory(originCandidate.displayName, originCandidate.formattedAddress)
      const toNorm = normalizePlaceForMemory(destCandidate.displayName, destCandidate.formattedAddress)

      if (fromNorm && toNorm) {
        const routeKey = buildRouteMemoryKey(
          fromNorm.key,
          toNorm.key,
          routeMemoryVariant?.key,
        )

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
          ...vegagerdinRouteMatches.map((m, i) => ({
            provider: 'vegagerdin' as const,
            stationId: m.point.id,
            stationName: m.point.name ?? null,
            routeOrder: i,
            distanceFromOriginM: Math.round(m.distanceFromOriginM),
            distanceFromRouteM: Math.round(m.distanceM),
            routeFraction: m.routeFraction,
          })),
        ]

        const providersEvaluated: Array<'vedurstofan' | 'vegagerdin'> = []
        if (layerEnabled) providersEvaluated.push('vedurstofan')
        if (vegagerdinProviderEvaluated) providersEvaluated.push('vegagerdin')

        await recordRouteMemory({
          routeKey,
          fromPlaceKey: fromNorm.key,
          fromPlaceLabel: fromNorm.label,
          toPlaceKey: toNorm.key,
          toPlaceLabel: toNorm.label,
          routeVariantKey: routeMemoryVariant?.key,
          routeVariantLabel: routeMemoryVariant?.label,
          routeCautionIds: (routeGeometry as Partial<RouteOption>).cautions?.map(caution => caution.id) ?? [],
          stations,
          // Only include providers that were actually evaluated. If a provider was gated
          // off or its cache was unavailable, leave existing station rows untouched.
          providersEvaluated,
        })
      }
    } catch (err) {
      // Best-effort: swallow all errors, log static code only (no raw content)
      console.error('[route-memory] write failed in travel route')
    }
  }

  await recordTeskeidUsageEvent({
    userId,
    featureKey: 'vedrid',
    eventName: 'weather_final_forecast_completed',
    path: '/api/teskeid/weather/travel',
    metadata: {
      actor,
      ...hashMeta,
      selectedRouteProvided: !!selectedRouteId,
      selectedRouteMatched: !!selectedRouteId,
      routeDistanceBucketKm: Math.floor(routeGeometry.distanceM / 1000 / 50) * 50,
      routeDurationBucketMinutes: Math.floor(routeGeometry.durationS / 60 / 30) * 30,
      resultStatus: result.stada,
      weatherCoverageStatus: weatherCoverage.status,
    },
  })

  const roadIntelligenceDebug = shouldLogRoadMapApiDiagnostics()
    ? {
        route: {
          routePolylineCount: routePolyline.length,
          assessmentRoutePolylineCount: assessmentRoutePolyline.length,
          sampledWeatherPointCount: weatherPoints.length,
          resultStatus: result.stada,
        },
        vegagerdin: {
          layerEnabled: vegagerdinLayerEnabled,
          providerEvaluated: vegagerdinProviderEvaluated,
          routeMatchCount: vegagerdinRouteMatches.length,
          layerReturned: Boolean(vegagerdinLayer),
          layerStatus: vegagerdinLayer?.status ?? null,
          layerPointCount: vegagerdinLayer?.points.length ?? 0,
        },
        vedurstofan: {
          layerEnabled,
          stationMatchCount: vedurstofanMatches.length,
          layerReturned: Boolean(vedurstofanLayer),
          layerPointCount: vedurstofanLayer?.points.length ?? 0,
        },
      }
    : undefined

  return NextResponse.json({
    ...result,
    ...(vedurstofanLayer ? { vedurstofanLayer } : {}),
    ...(vegagerdinLayer ? { vegagerdinLayer } : {}),
    ...(roadIntelligenceDebug ? { roadIntelligenceDebug } : {}),
  })
}
