import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { resolveWeatherBaseAccess } from '@/lib/weather/weatherBaseAccess.server'
import { readVedurstofanProductForStations } from '@/lib/weather/providers/vedurstofan.server'
import { VEDURSTOFAN_STATIONS_REGISTRY } from '@/lib/weather/providers/vedurstofanStationsRegistry'
import { matchProviderPointsToRoute, DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M, type ProviderStationPoint } from '@/lib/weather/providerRouteMatching'
const PROVIDER_STATIONS_MAX_ROUTE_POINTS = 1000
const PROVIDER_STATIONS_LAYER_BUDGET_MS = 1500

function withLayerTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<T>(resolve => {
    timer = setTimeout(() => resolve(fallback), PROVIDER_STATIONS_LAYER_BUDGET_MS)
  })
  return Promise.race([promise, timeout]).then(result => { clearTimeout(timer); return result })
}

export async function POST(req: Request) {
  // Gate 1: base weather access
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const access = await resolveWeatherBaseAccess(user)
  if (access.mode === 'blocked') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Gate 2: Veðurstofan provider access
  const vedurstofanAccessRequired =
    process.env.WEATHER_PROVIDER_VEDURSTOFAN_ACCESS_REQUIRED === 'true'
  const layerEnabled = !vedurstofanAccessRequired
    ? true
    : (user?.id && user?.email
        ? await checkFeatureAccess(user.id, user.email, 'weather-provider-vedurstofan').catch(() => false)
        : false)

  if (!layerEnabled) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Parse and validate request body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || !Array.isArray((body as Record<string, unknown>).routePoints)) {
    return NextResponse.json({ error: 'routePoints is required' }, { status: 400 })
  }

  const routePoints = (body as Record<string, unknown>).routePoints as unknown[]
  if (routePoints.length === 0) {
    return NextResponse.json({ error: 'routePoints must not be empty' }, { status: 400 })
  }
  if (routePoints.length > PROVIDER_STATIONS_MAX_ROUTE_POINTS) {
    return NextResponse.json(
      { error: `routePoints exceeds max ${PROVIDER_STATIONS_MAX_ROUTE_POINTS}` },
      { status: 400 },
    )
  }
  for (const pt of routePoints) {
    if (!pt || typeof pt !== 'object') {
      return NextResponse.json({ error: 'Invalid route point' }, { status: 400 })
    }
    const p = pt as Record<string, unknown>
    if (
      typeof p.lat !== 'number' || !isFinite(p.lat) ||
      typeof p.lon !== 'number' || !isFinite(p.lon)
    ) {
      return NextResponse.json({ error: 'Route point has invalid lat/lon' }, { status: 400 })
    }
  }

  const polyline = routePoints as Array<{ lat: number; lon: number }>

  // Match Veðurstofan stations to route geometry
  const matches = matchProviderPointsToRoute({
    points: VEDURSTOFAN_STATIONS_REGISTRY
      .filter(s => s.stationId !== null && s.lat !== null && s.lon !== null)
      .map(s => ({ id: s.stationId!, name: s.name, lat: s.lat!, lon: s.lon! })),
    routePolyline: polyline,
    maxDistanceM: DEFAULT_PROVIDER_ROUTE_MAX_DISTANCE_M,
  })

  if (matches.length === 0) {
    return NextResponse.json({ stations: [], status: 'unavailable' })
  }

  // Fetch Veðurstofan forecast data for matched stations
  const nowMs = Date.now()
  const etaWindowFromIso = new Date(nowMs - 3 * 60 * 60 * 1000).toISOString()
  const etaWindowToIso   = new Date(nowMs + 12 * 60 * 60 * 1000).toISOString()
  const stationIds = matches.map(m => m.point.id)

  const vedurstofanResults = await withLayerTimeout(
    readVedurstofanProductForStations(stationIds, { etaWindowFromIso, etaWindowToIso }),
    null,
  ).catch(() => null)

  if (!vedurstofanResults) {
    return NextResponse.json({ stations: [], status: 'unavailable' })
  }

  // Build response
  const registryByStationId = new Map(
    VEDURSTOFAN_STATIONS_REGISTRY
      .filter(s => s.stationId !== null)
      .map(s => [s.stationId!, s]),
  )
  const stationMatchById = new Map(matches.map(m => [m.point.id, m]))

  const stations: ProviderStationPoint[] = []

  for (const [stationId, stationResult] of vedurstofanResults) {
    if (stationResult.status === 'unavailable') continue
    const registryEntry = registryByStationId.get(stationId)
    const match = stationMatchById.get(stationId)
    if (!match) continue
    const lat = registryEntry?.lat ?? null
    const lon = registryEntry?.lon ?? null
    if (lat === null || lon === null) continue

    stations.push({
      stationId,
      stationName: registryEntry?.name ?? stationId,
      lat,
      lon,
      distanceM: match.distanceM,
      distanceFromOriginM: match.distanceFromOriginM,
      routeFraction: match.routeFraction,
      atimeIso: stationResult.payload.atimeIso,
      sourceUrl: registryEntry?.sourceUrl ?? null,
      forecastRows: stationResult.payload.forecasts,
    })
  }

  stations.sort((a, b) =>
    a.distanceFromOriginM !== b.distanceFromOriginM
      ? a.distanceFromOriginM - b.distanceFromOriginM
      : a.stationId.localeCompare(b.stationId),
  )

  return NextResponse.json({
    stations,
    status: stations.length > 0 ? 'available' : 'unavailable',
  })
}
