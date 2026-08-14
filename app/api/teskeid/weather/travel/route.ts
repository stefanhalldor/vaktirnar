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
import type {
  WeatherProviderCompleteness,
  TravelThresholdOverrides,
} from '@/lib/weather/types'
import type { TrailerKind } from '@/lib/weather/question'
import type { PlaceCandidate, RouteOption } from '@/lib/weather/provider.types'
import { sampleRouteWeatherPoints } from '@/lib/weather/routeSampling'
import { resolveRouteForecastCompleteness } from '@/lib/weather/routeForecastCompleteness'
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
import { classifyLiveVegagerdinStationWindStatus } from '@/lib/weather/liveVegagerdinStation'
import { isTeskeidRouteCandidateEnabled } from '@/lib/iceland-routes/roadGraphCandidate.server'
import { verifyRouteOptionEnvelope } from '@/lib/iceland-routes/routeOptionEnvelope.server'
import { getIcelandRoadGraph } from '@/lib/iceland-routes/roadGraphRuntime.server'
import {
  restoreRouteOptionEvidence,
  restoredRouteOptionEvidenceMatchesSignedRoute,
} from '@/lib/iceland-routes/routeOptionEvidence.server'
import {
  isConfirmedLocationInput,
  toWeatherPlaceCandidate,
  type ConfirmedLocationInput,
} from '@/lib/places/providerCandidate'
import type { RouteWeatherCoverage } from '@/lib/iceland-routes/trustedRouteCoverage'

const VALID_TRAILER_KINDS = new Set([
  'none', 'generic_trailer', 'tent_trailer', 'folding_camper', 'caravan', 'horse_trailer',
])
const MAX_ASSESSMENT_SCOPE_ID_LENGTH = 500
type FullRouteWeatherCoverage = Extract<
  RouteWeatherCoverage,
  { status: 'full' | 'partial' }
> & { status: 'full' }

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

function buildFullRouteWeatherCoverage(input: {
  originName: string
  destinationName: string
  distanceM: number
  durationS: number
  routePolyline: ReadonlyArray<{ lat: number; lon: number }>
}): FullRouteWeatherCoverage | null {
  const startPoint = input.routePolyline[0]
  const endPoint = input.routePolyline[input.routePolyline.length - 1]
  if (!startPoint || !endPoint || input.routePolyline.length < 2) return null

  return {
    status: 'full',
    start: {
      kind: 'exact',
      label: input.originName,
      point: { ...startPoint },
      routeFraction: 0,
      distanceFromTripOriginM: 0,
      elapsedFromTripOriginS: 0,
    },
    end: {
      kind: 'exact',
      label: input.destinationName,
      point: { ...endPoint },
      routeFraction: 1,
      distanceFromTripOriginM: input.distanceM,
      elapsedFromTripOriginS: input.durationS,
    },
    coverageDistanceM: input.distanceM,
    coverageDurationS: input.durationS,
    unassessedBeforeM: 0,
    unassessedAfterM: 0,
    distanceConfidence: 'reference_route',
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
  const assessmentScopeId = typeof rawAssessmentScopeId === 'string'
      && rawAssessmentScopeId.trim() === rawAssessmentScopeId
      && rawAssessmentScopeId.length > 0
      && rawAssessmentScopeId.length <= MAX_ASSESSMENT_SCOPE_ID_LENGTH
      ? rawAssessmentScopeId
      : undefined
  if (assessmentScopeId === undefined) {
    return NextResponse.json({ error: 'invalid_assessment_scope_id' }, { status: 400 })
  }

  // Full route weather only accepts a fresh, scope-bound Teskeið envelope.
  const { actor, userId } = access

  const hasRouteEnvelope = body.routeEnvelope !== undefined
  if (!hasRouteEnvelope) {
    return NextResponse.json({ error: 'route_envelope_invalid' }, { status: 422 })
  }
  const verifiedRouteEnvelope = hasRouteEnvelope
    ? verifyRouteOptionEnvelope(body.routeEnvelope, {
        origin: { lat: origin.lat, lon: origin.lon },
        destination: { lat: destination.lat, lon: destination.lon },
        assessmentScopeId,
      })
    : null
  if (
    !verifiedRouteEnvelope
    || verifiedRouteEnvelope.route.provider !== 'teskeid'
    || !verifiedRouteEnvelope.routeEvidence
  ) {
    return NextResponse.json({ error: 'route_envelope_invalid' }, { status: 422 })
  }

  // In assessment mode, coordinates authenticated by the envelope are the
  // sole downstream authority. Client metadata remains display-only and can
  // never replace the server-issued road anchors.
  const trustedOrigin: ConfirmedLocationInput = {
    ...origin,
    lat: verifiedRouteEnvelope.origin.lat,
    lon: verifiedRouteEnvelope.origin.lon,
  }
  const trustedDestination: ConfirmedLocationInput = {
    ...destination,
    lat: verifiedRouteEnvelope.destination.lat,
    lon: verifiedRouteEnvelope.destination.lon,
  }
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
  const selectedRouteId = verifiedRouteEnvelope.route.id
  const routePairHash = routePairFingerprint(trustedOrigin, trustedDestination)
  const hashMeta = routePairHash !== null ? { routePairHash } : {}

  if (!isTeskeidRouteCandidateEnabled()) {
    await recordTeskeidUsageEvent({
      userId,
      featureKey: 'vedrid',
      eventName: 'weather_final_forecast_failed',
      path: '/api/teskeid/weather/travel',
      metadata: { actor, ...hashMeta, failureReason: 'selected_route_unavailable', selectedRouteProvided: true },
    })
    return NextResponse.json({ error: 'selected_route_unavailable' }, { status: 422 })
  }

  // Rebind the compact signed ledger to the immutable graph that is active in
  // this runtime. HMAC validity alone is insufficient: a graph snapshot drift,
  // missing edge or mismatched regenerated route must fail before any forecast
  // or station-provider work starts.
  try {
    const graph = await getIcelandRoadGraph()
    const restoredEvidence = restoreRouteOptionEvidence({
      graph,
      claim: verifiedRouteEnvelope.routeEvidence,
      origin: verifiedRouteEnvelope.origin,
      destination: verifiedRouteEnvelope.destination,
    })
    if (!restoredEvidence || !restoredRouteOptionEvidenceMatchesSignedRoute({
      restored: restoredEvidence,
      signedRoute: verifiedRouteEnvelope.route,
      claim: verifiedRouteEnvelope.routeEvidence,
      origin: verifiedRouteEnvelope.origin,
      destination: verifiedRouteEnvelope.destination,
    })) {
      return NextResponse.json({ error: 'route_envelope_invalid' }, { status: 422 })
    }
  } catch {
    return NextResponse.json({ error: 'route_envelope_invalid' }, { status: 422 })
  }
  const routeGeometry = verifiedRouteEnvelope.route
  const routePolyline = routeGeometry.providerMatchingPoints ?? routeGeometry.points
  const weatherCoverage = buildFullRouteWeatherCoverage({
    originName: originCandidate.displayName,
    destinationName: destCandidate.displayName,
    distanceM: routeGeometry.distanceM,
    durationS: routeGeometry.durationS,
    routePolyline,
  })
  if (!weatherCoverage) {
    await recordTeskeidUsageEvent({
      userId,
      featureKey: 'vedrid',
      eventName: 'weather_final_forecast_failed',
      path: '/api/teskeid/weather/travel',
      metadata: { actor, ...hashMeta, failureReason: 'route_unavailable', selectedRouteProvided: !!selectedRouteId },
    })
    return NextResponse.json({ error: 'route_unavailable' }, { status: 503 })
  }

  // Sample route weather points using exhaustive-when-cheap strategy.
  // Computes cumulative Haversine distance for all route points, then deduplicates
  // by ~1km grid. Uses all unique cells when cheap (≤120), falls back to 10km spacing.
  const fullRoutePoints = routePolyline
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
  const sampledWeather = sampleRouteWeatherPoints(
    fullRoutePoints,
    fullRouteCumDist,
  )
  const weatherPoints = sampledWeather.weatherPoints.map(point => {
    const routeFraction = fullRouteHaversineM > 0
      ? Math.max(0, Math.min(1, point.distanceFromOriginM / fullRouteHaversineM))
      : 0
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
    fetchForecast(destCandidate.lat, destCandidate.lon).catch(() => null),
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

  const {
    pointForecasts,
    assessmentCompleteness,
  } = resolveRouteForecastCompleteness({
    plannedPoints: weatherPoints,
    settledResults: routeForecastResults,
    routeDistanceM: routeGeometry.distanceM,
    routeScope: {
      status: weatherCoverage.status,
      startRouteFraction: weatherCoverage.start.routeFraction,
      endRouteFraction: weatherCoverage.end.routeFraction,
      startDistanceM: weatherCoverage.start.distanceFromTripOriginM,
      endDistanceM: weatherCoverage.end.distanceFromTripOriginM,
    },
  })

  // A destination-only success, a partial prefix or an isolated point after a
  // gap cannot rescue a route-wide assessment. Any missing planned forecast
  // remains an explicit, retryable failure instead of a partial route result.
  if (assessmentCompleteness.status !== 'complete') {
    await recordTeskeidUsageEvent({
      userId,
      featureKey: 'vedrid',
      eventName: 'weather_final_forecast_failed',
      path: '/api/teskeid/weather/travel',
      metadata: {
        actor,
        ...hashMeta,
        failureReason: 'forecast_unavailable',
        selectedRouteProvided: !!selectedRouteId,
        forecastRequestedPointCount: assessmentCompleteness.forecast.requestedPointCount,
        forecastSucceededPointCount: assessmentCompleteness.forecast.succeededPointCount,
        forecastFailedPointCount: assessmentCompleteness.forecast.failedPointCount,
      },
    })
    return NextResponse.json({
      error: 'forecast_unavailable',
      assessmentCompleteness,
    }, { status: 503 })
  }

  // Station membership covers the complete selected, server-verified route.
  // Official graph overlap is road/surface evidence only and must never clip
  // route-wide weather or station matching.
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
  const vedurstofanProviderCompleteness: WeatherProviderCompleteness = (() => {
    if (!layerEnabled) {
      return {
        provider: 'vedurstofan',
        assessmentRole: 'display_only',
        status: 'not_requested',
        requestedPointCount: 0,
        succeededPointCount: 0,
        failedPointCount: 0,
        reason: 'feature_disabled',
      }
    }
    if (vedurstofanStationIds.length === 0) {
      return {
        provider: 'vedurstofan',
        assessmentRole: 'display_only',
        status: 'not_applicable',
        requestedPointCount: 0,
        succeededPointCount: 0,
        failedPointCount: 0,
        reason: 'no_matching_points',
      }
    }
    if (!vedurstofanResults) {
      return {
        provider: 'vedurstofan',
        assessmentRole: 'display_only',
        status: 'unavailable',
        requestedPointCount: vedurstofanStationIds.length,
        succeededPointCount: 0,
        failedPointCount: vedurstofanStationIds.length,
        reason: 'provider_unavailable',
      }
    }
    const succeededPointCount = vedurstofanStationIds.filter(stationId => {
      const stationResult = vedurstofanResults.get(stationId)
      return stationResult?.status === 'ok' || stationResult?.status === 'stale'
    }).length
    const failedPointCount = vedurstofanStationIds.length - succeededPointCount
    return {
      provider: 'vedurstofan',
      assessmentRole: 'display_only',
      status: succeededPointCount === vedurstofanStationIds.length
        ? 'complete'
        : succeededPointCount > 0
          ? 'partial'
          : 'unavailable',
      requestedPointCount: vedurstofanStationIds.length,
      succeededPointCount,
      failedPointCount,
      ...(succeededPointCount === 0 ? { reason: 'provider_unavailable' as const } : {}),
    }
  })()
  const destinationForecast = assessmentCompleteness.forecast.status === 'complete' && destForecastRaw
    ? { hours: destForecastRaw }
    : undefined

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
    // Keep the same full, server-verified selected-route geometry for the
    // result, map, station matching and arrival-time forecast calculations.
    auditPolylinePoints: routePolyline,
    samplingDiagnostics,
    thresholdOverrides,
  })
  if (!result.travelPlan) {
    return NextResponse.json({
      error: 'forecast_unavailable',
      assessmentCompleteness,
    }, { status: 503 })
  }
  result.travelPlan.route.weatherCoverage = weatherCoverage
  result.travelPlan.route.assessmentCompleteness = assessmentCompleteness

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
    const mappedPointCount = vedurstofanStationIds.length
    let availablePointCount = 0
    let stalePointCount = 0
    let unavailablePointCount = 0

    // Iterate the requested IDs, not only Map entries returned by the provider.
    // A missing entry is failed evidence and must keep the layer partial.
    for (const stationId of vedurstofanStationIds) {
      const stationResult = vedurstofanResults.get(stationId)
      if (!stationResult || stationResult.status === 'unavailable') {
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
  let vegagerdinProviderCompleteness: WeatherProviderCompleteness = vegagerdinLayerEnabled
    ? {
        provider: 'vegagerdin',
        assessmentRole: 'display_only',
        status: 'unavailable',
        requestedPointCount: 0,
        succeededPointCount: 0,
        failedPointCount: 0,
        reason: 'provider_unavailable',
      }
    : {
        provider: 'vegagerdin',
        assessmentRole: 'display_only',
        status: 'not_requested',
        requestedPointCount: 0,
        succeededPointCount: 0,
        failedPointCount: 0,
        reason: 'feature_disabled',
      }
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

      if (vegagerdinLayerEnabled && vegagerdinRouteMatches.length === 0) {
        vegagerdinProviderCompleteness = {
          provider: 'vegagerdin',
          assessmentRole: 'display_only',
          status: 'not_applicable',
          requestedPointCount: 0,
          succeededPointCount: 0,
          failedPointCount: 0,
          reason: 'no_matching_points',
        }
      }

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
              windDisplayStatus: classifyLiveVegagerdinStationWindStatus(measurement, resolvedThresholds),
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
        const availablePointCount = layerPoints.length - noWindDataPointCount
        const measuredAtIsoValues = layerPoints.map(p => p.measuredAtIso).sort()
        const fetchedAtIsoValues = layerPoints.map(p => p.fetchedAtIso).sort()

        if (vegagerdinRouteMatches.length > 0) {
          vegagerdinProviderCompleteness = {
            provider: 'vegagerdin',
            assessmentRole: 'display_only',
            status: availablePointCount === vegagerdinRouteMatches.length
              ? 'complete'
              : availablePointCount > 0
                ? 'partial'
                : 'unavailable',
            requestedPointCount: vegagerdinRouteMatches.length,
            succeededPointCount: availablePointCount,
            failedPointCount: Math.max(0, vegagerdinRouteMatches.length - availablePointCount),
            ...(availablePointCount === 0 ? { reason: 'provider_unavailable' as const } : {}),
          }
        }

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
          availablePointCount,
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

  result.travelPlan.route.assessmentCompleteness = {
    ...assessmentCompleteness,
    providers: {
      vedurstofan: vedurstofanProviderCompleteness,
      vegagerdin: vegagerdinProviderCompleteness,
    },
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
          assessmentRoutePolylineCount: routePolyline.length,
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
