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
import { validateIcelandicCoords } from '@/lib/weather/coords'
import type { HourPoint, TravelPointForecast, TravelThresholdOverrides } from '@/lib/weather/types'
import type { TrailerKind } from '@/lib/weather/question'
import type { PlaceCandidate } from '@/lib/weather/provider.types'
import { sampleRouteWeatherPoints } from '@/lib/weather/routeSampling'
import { haversineM, matchProviderPointsToRoute } from '@/lib/weather/providerRouteMatching'
import { recordTeskeidUsageEvent, routePairFingerprint } from '@/lib/teskeid/usage.server'

const VALID_TRAILER_KINDS = new Set([
  'none', 'generic_trailer', 'tent_trailer', 'folding_camper', 'caravan', 'horse_trailer',
])

/** Max time to wait for the Veðurstofan product-table read before falling back to baseline only. */
const VEDURSTOFAN_LAYER_BUDGET_MS = 1500

function withLayerTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<T>(resolve => {
    timer = setTimeout(() => resolve(fallback), VEDURSTOFAN_LAYER_BUDGET_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>
}

/** Maximum perpendicular distance from the route polyline for Veðurstofan station inclusion. */
const VEDURSTOFAN_ROUTE_MAX_DISTANCE_M = 15_000

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


function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false
  return isFinite(new Date(value).getTime())
}

function validateConfirmedPlace(raw: unknown): raw is { name: string; lat: number; lon: number; placeId?: string; formattedAddress?: string } {
  if (!raw || typeof raw !== 'object') return false
  const p = raw as Record<string, unknown>
  return (
    typeof p.name === 'string' && p.name.trim().length > 0 &&
    typeof p.lat === 'number' && typeof p.lon === 'number' &&
    validateIcelandicCoords(p.lat, p.lon)
  )
}

function normalizeOptionalPlaceId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > 500) return undefined
  return trimmed
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
  if (!validateConfirmedPlace(body.origin)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 400 })
  }
  if (!validateConfirmedPlace(body.destination)) {
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

  // Check provider
  const provider = getWeatherMapProvider()
  if (!provider) {
    return NextResponse.json({ error: 'provider_not_configured' }, { status: 422 })
  }

  const origin = body.origin as { name: string; lat: number; lon: number; placeId?: string; formattedAddress?: string }
  const destination = body.destination as { name: string; lat: number; lon: number; placeId?: string; formattedAddress?: string }

  const originCandidate: PlaceCandidate = {
    placeId: normalizeOptionalPlaceId(origin.placeId) ?? 'confirmed',
    displayName: origin.name.trim(),
    formattedAddress: (origin.formattedAddress ?? origin.name).trim(),
    lat: origin.lat,
    lon: origin.lon,
  }

  const destCandidate: PlaceCandidate = {
    placeId: normalizeOptionalPlaceId(destination.placeId) ?? 'confirmed',
    displayName: destination.name.trim(),
    formattedAddress: (destination.formattedAddress ?? destination.name).trim(),
    lat: destination.lat,
    lon: destination.lon,
  }

  // Get route geometry — use selected route if provided, otherwise first available
  const { actor, userId } = access

  const selectedRouteId = typeof body.selectedRouteId === 'string' ? body.selectedRouteId : null
  const routePairHash = routePairFingerprint(origin, destination)
  const hashMeta = routePairHash !== null ? { routePairHash } : {}

  let routeGeometry
  try {
    if (selectedRouteId) {
      const routeOptions = await provider.getRouteOptions(originCandidate, destCandidate)
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
      routeGeometry = await provider.getRouteGeometry(originCandidate, destCandidate)
    }
  } catch {
    await recordTeskeidUsageEvent({
      userId,
      featureKey: 'vedrid',
      eventName: 'weather_final_forecast_failed',
      path: '/api/teskeid/weather/travel',
      metadata: { actor, ...hashMeta, failureReason: 'route_unavailable', selectedRouteProvided: !!selectedRouteId },
    })
    return NextResponse.json({ error: 'route_unavailable' }, { status: 503 })
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

  // Sample route weather points using exhaustive-when-cheap strategy.
  // Computes cumulative Haversine distance for all route points, then deduplicates
  // by ~1km grid. Uses all unique cells when cheap (≤120), falls back to 10km spacing.
  const allPts = routeGeometry.points
  const cumDist: number[] = [0]
  for (let i = 1; i < allPts.length; i++) {
    cumDist.push(cumDist[i - 1] + haversineM(allPts[i - 1].lat, allPts[i - 1].lon, allPts[i].lat, allPts[i].lon))
  }
  const { weatherPoints, diagnostics: samplingDiagnostics } = sampleRouteWeatherPoints(allPts, cumDist)

  // Fetch route point forecasts and check Veðurstofan layer access in parallel.
  // When WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED is not 'true' (or unset), the layer
  // is open to all callers including public users — deletion from Vercel = open.
  const vedurstofanAccessRequired =
    process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED === 'true'
  const [routeForecastResults, destForecastRaw, layerEnabled] = await Promise.all([
    Promise.allSettled(weatherPoints.map((pt) => fetchForecast(pt.lat, pt.lon))),
    fetchForecast(destCandidate.lat, destCandidate.lon).catch(() => null),
    !vedurstofanAccessRequired
      ? Promise.resolve(true)
      : user?.id && user?.email
        ? checkFeatureAccess(user.id, user.email, 'weather-provider-vedurstofan').catch(() => false)
        : Promise.resolve(false),
  ])

  // Match Veðurstofan stations directly against the selected route geometry.
  // Station selection is based on actual road proximity, not on sampled MET/Yr forecast points.
  const vedurstofanMatches = layerEnabled
    ? matchProviderPointsToRoute({
        points: VEDURSTOFAN_STATIONS_REGISTRY
          .filter(s => s.stationId !== null && s.lat !== null && s.lon !== null)
          .map(s => ({ id: s.stationId!, name: s.name, lat: s.lat!, lon: s.lon! })),
        routePolyline: routeGeometry.points,
        maxDistanceM: VEDURSTOFAN_ROUTE_MAX_DISTANCE_M,
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

  const pointForecasts: TravelPointForecast[] = routeForecastResults
    .map((r, i) => r.status === 'fulfilled' ? { hours: r.value as HourPoint[], ...weatherPoints[i] } : null)
    .filter((x): x is TravelPointForecast => x !== null)
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
    auditPolylinePoints: routeGeometry.points,
    samplingDiagnostics,
    thresholdOverrides,
  })

  // Build Veðurstofan experimental layer (fail-open — never breaks baseline result)
  let vedurstofanLayer: VedurstofanTravelLayer | undefined
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
    },
  })

  return NextResponse.json(vedurstofanLayer ? { ...result, vedurstofanLayer } : result)
}
