import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateIcelandicCoords } from '@/lib/weather/coords'
import { resolveWeatherBaseAccess, getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { checkWeatherGuestRateLimit } from '@/lib/weather/ip-rate-limit.server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import {
  getTeskeidRouteCandidatesOutcome,
  isTeskeidRouteCandidateEnabled,
} from '@/lib/iceland-routes/roadGraphCandidate.server'

function validPoint(value: unknown): value is { lat: number; lon: number } {
  if (!value || typeof value !== 'object') return false
  const point = value as Record<string, unknown>
  return typeof point.lat === 'number' && typeof point.lon === 'number'
    && validateIcelandicCoords(point.lat, point.lon)
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
  const access = await resolveWeatherBaseAccess(user)
  if (access.mode === 'blocked') {
    return NextResponse.json({ status: 'unavailable', route: null }, { status: 401 })
  }

  const hasTeskeidRouting = user?.id && user.email
    ? await checkFeatureAccess(user.id, user.email, 'teskeid-routing-v1').catch(() => false)
    : false
  if (!hasTeskeidRouting) {
    return NextResponse.json({ status: 'disabled', route: null }, { status: 404 })
  }

  if (access.mode === 'public') {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')?.trim()
      ?? ''
    if (!await checkWeatherGuestRateLimit(ip)) {
      return NextResponse.json({ status: 'unavailable', route: null }, { status: 429 })
    }
  }

  const body = await request.json().catch(() => null)
  if (!validPoint(body?.origin) || !validPoint(body?.destination)) {
    return NextResponse.json({ status: 'unavailable', route: null }, { status: 400 })
  }

  const includeAlternatives = body?.alternatives === true
  const outcome = await getTeskeidRouteCandidatesOutcome(body.origin, body.destination, includeAlternatives)
  return NextResponse.json({
    status: outcome.status,
    routes: outcome.routes,
    route: outcome.status === 'ready' ? outcome.routes[0] ?? null : null,
  })
}
