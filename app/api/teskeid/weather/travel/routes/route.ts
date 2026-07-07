import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getWeatherMapProvider } from '@/lib/weather/provider.server'
import { validateIcelandicCoords } from '@/lib/weather/coords'
import type { PlaceCandidate } from '@/lib/weather/provider.types'

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

  let routes
  try {
    routes = await provider.getRouteOptions(originCandidate, destCandidate)
  } catch {
    return NextResponse.json({ error: 'route_unavailable' }, { status: 503 })
  }

  if (routes.length === 0) {
    return NextResponse.json({ error: 'route_unavailable' }, { status: 422 })
  }

  // Sort by durationS ascending — shortest driving time first
  const sorted = [...routes].sort((a, b) => a.durationS - b.durationS)

  return NextResponse.json({ routes: sorted })
}
