import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { fetchForecast } from '@/lib/weather/metno.server'
import { checkTravelWeather } from '@/lib/weather/travel'
import { resolveThresholds, validateResolvedThresholdOrdering } from '@/lib/weather/thresholds'
import { getWeatherMapProvider } from '@/lib/weather/provider.server'
import { validateIcelandicCoords } from '@/lib/weather/coords'
import type { HourPoint, TravelPointForecast, TravelThresholdOverrides } from '@/lib/weather/types'
import type { TrailerKind } from '@/lib/weather/question'
import type { PlaceCandidate } from '@/lib/weather/provider.types'
import { sampleRouteWeatherPoints } from '@/lib/weather/routeSampling'

const VALID_TRAILER_KINDS = new Set([
  'none', 'generic_trailer', 'tent_trailer', 'folding_camper', 'caravan', 'horse_trailer',
])

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
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
  checkMs('redGustMs', 0, 50)
  checkMs('cautionPrecipMmPerHour', 0, 20)

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

export async function POST(request: Request) {
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const allowed = await checkFeatureAccess(user.id, user.email, 'vedrid')
  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

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
    placeId: origin.placeId ?? 'confirmed',
    displayName: origin.name.trim(),
    formattedAddress: (origin.formattedAddress ?? origin.name).trim(),
    lat: origin.lat,
    lon: origin.lon,
  }

  const destCandidate: PlaceCandidate = {
    placeId: destination.placeId ?? 'confirmed',
    displayName: destination.name.trim(),
    formattedAddress: (destination.formattedAddress ?? destination.name).trim(),
    lat: destination.lat,
    lon: destination.lon,
  }

  // Get route geometry — use selected route if provided, otherwise first available
  const selectedRouteId = typeof body.selectedRouteId === 'string' ? body.selectedRouteId : null

  let routeGeometry
  try {
    if (selectedRouteId) {
      const routeOptions = await provider.getRouteOptions(originCandidate, destCandidate)
      const matched = routeOptions.find(r => r.id === selectedRouteId)
      if (!matched) {
        return NextResponse.json({ error: 'selected_route_unavailable' }, { status: 422 })
      }
      routeGeometry = matched
    } else {
      routeGeometry = await provider.getRouteGeometry(originCandidate, destCandidate)
    }
  } catch {
    return NextResponse.json({ error: 'route_unavailable' }, { status: 503 })
  }
  if (!routeGeometry) {
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

  // Fetch route point forecasts and destination forecast in parallel — ignore individual failures
  const [routeForecastResults, destForecastRaw] = await Promise.all([
    Promise.allSettled(weatherPoints.map((pt) => fetchForecast(pt.lat, pt.lon))),
    fetchForecast(destCandidate.lat, destCandidate.lon).catch(() => null),
  ])
  const pointForecasts: TravelPointForecast[] = routeForecastResults
    .map((r, i) => r.status === 'fulfilled' ? { hours: r.value as HourPoint[], ...weatherPoints[i] } : null)
    .filter((x): x is TravelPointForecast => x !== null)
  const destinationForecast = destForecastRaw ? { hours: destForecastRaw } : undefined

  if (pointForecasts.length === 0 && !destinationForecast) {
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

  return NextResponse.json(result)
}
