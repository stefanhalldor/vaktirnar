import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reverseHmsPlace } from '@/lib/places/hmsDirectory.server'
import type { ReversePlaceResult, SelectedLocation } from '@/lib/places/types'
import { findNearestKnownRoadMapPlace } from '@/lib/road-intelligence/roadMapPlaces'
import { resolveWeatherBaseAccess, getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { validateIcelandicCoords } from '@/lib/weather/coords'

const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_KEYS = 2_000
const MAX_REVERSE_DISTANCE_M = 25_000

type RateLimitWindow = { count: number; startedAt: number }
const rateLimits = new Map<string, RateLimitWindow>()

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const current = rateLimits.get(ip)
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(ip, { count: 1, startedAt: now })
    if (rateLimits.size > RATE_LIMIT_MAX_KEYS) {
      for (const [key, value] of rateLimits) {
        if (now - value.startedAt >= RATE_LIMIT_WINDOW_MS) rateLimits.delete(key)
      }
      if (rateLimits.size > RATE_LIMIT_MAX_KEYS) {
        rateLimits.delete(rateLimits.keys().next().value as string)
      }
    }
    return false
  }
  current.count += 1
  return current.count > RATE_LIMIT_MAX
}

function isHmsSearchEnabled(): boolean {
  return process.env.HMS_PLACE_SEARCH_ENABLED === 'true'
}

function staticReverse(lat: number, lon: number): ReversePlaceResult | null {
  const nearest = findNearestKnownRoadMapPlace({ lat, lon }, MAX_REVERSE_DISTANCE_M)
  if (!nearest) return null
  const location: SelectedLocation = {
    id: `static:${nearest.place.id}`,
    source: 'static',
    sourceId: nearest.place.id,
    name: nearest.place.name,
    formattedAddress: nearest.place.formattedAddress ?? nearest.place.name,
    lat: nearest.place.lat,
    lon: nearest.place.lon,
  }
  return { location, distanceM: nearest.distanceM }
}

export async function POST(request: NextRequest) {
  if (process.env.AUTH_MVP_ENABLED !== 'true' || getWeatherEnabledMode() === 'off') {
    return noStoreJson({ location: null }, 404)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const access = await resolveWeatherBaseAccess(user)
  if (access.mode === 'blocked') {
    return noStoreJson({ location: null }, 401)
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')?.trim()
    ?? ''
  if (ip && isRateLimited(ip)) {
    return noStoreJson({ location: null, error: 'rate_limited' }, 429)
  }

  const body = await request.json().catch(() => null) as { lat?: unknown; lon?: unknown } | null
  if (
    !body ||
    typeof body.lat !== 'number' ||
    typeof body.lon !== 'number' ||
    !validateIcelandicCoords(body.lat, body.lon)
  ) {
    return noStoreJson({ location: null }, 400)
  }

  // Reverse lookup is local-only. Exact device coordinates are never placed in
  // a URL, shared cache or third-party geocoder request.
  const hmsResult = isHmsSearchEnabled()
    ? await reverseHmsPlace(
        body.lat,
        body.lon,
        MAX_REVERSE_DISTANCE_M,
      ).catch(() => {
        console.error('[place-reverse] HMS reverse lookup unavailable')
        return null
      })
    : null
  const result = hmsResult ?? staticReverse(body.lat, body.lon)

  return noStoreJson(result ?? { location: null })
}

export async function GET() {
  return noStoreJson({ location: null, error: 'method_not_allowed' }, 405)
}
