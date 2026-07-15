import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveWeatherBaseAccess, getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { getWeatherMapProvider } from '@/lib/weather/provider.server'
import { validateIcelandicCoords } from '@/lib/weather/coords'
import type { PlaceCandidate } from '@/lib/weather/provider.types'
import { recordTeskeidUsageEvent, routePairFingerprint } from '@/lib/teskeid/usage.server'
import { checkWeatherGuestRateLimit } from '@/lib/weather/ip-rate-limit.server'

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

  if (!validateConfirmedPlace(body.origin)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 400 })
  }
  if (!validateConfirmedPlace(body.destination)) {
    return NextResponse.json({ error: 'invalid_destination' }, { status: 400 })
  }

  const provider = getWeatherMapProvider()
  if (!provider) {
    return NextResponse.json({ error: 'provider_not_configured' }, { status: 422 })
  }

  const origin = body.origin as { name: string; lat: number; lon: number; placeId?: string; formattedAddress?: string }
  const destination = body.destination as { name: string; lat: number; lon: number; placeId?: string; formattedAddress?: string }

  if (process.env.NODE_ENV !== 'production') {
    console.log('[routes/routes] placeId in request body:', {
      origin: origin.placeId ? `present (${String(origin.placeId).slice(0, 20)})` : 'absent',
      destination: destination.placeId ? `present (${String(destination.placeId).slice(0, 20)})` : 'absent',
    })
  }

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

  const routePairHash = routePairFingerprint(origin, destination)
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

  // Sort by durationS ascending — shortest driving time first
  const sorted = [...routes].sort((a, b) => a.durationS - b.durationS)

  await recordTeskeidUsageEvent({
    userId,
    featureKey: 'vedrid',
    eventName: 'weather_route_options_calculated',
    path: '/api/teskeid/weather/travel/routes',
    metadata: {
      actor,
      ...hashMeta,
      provider: 'google',
      routeCount: sorted.length,
      originIdPresent: originCandidate.placeId !== 'confirmed',
      destinationIdPresent: destCandidate.placeId !== 'confirmed',
      curatedRouteLabels: [...new Set(sorted.flatMap(r => r.labels).filter(l => l.startsWith('CURATED_')))],
    },
  })

  return NextResponse.json({ routes: sorted })
}
