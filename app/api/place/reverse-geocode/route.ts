import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'

// Kill switch: must explicitly set ENABLE_REVERSE_GEOCODE=true to enable (opt-in).
const ENABLED = process.env.ENABLE_REVERSE_GEOCODE === 'true'

// Simple per-IP rate limit: max 20 requests per 60 seconds (in-memory, best-effort).
const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 60_000
const ipTimestamps = new Map<string, number[]>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const windowStart = now - RATE_LIMIT_WINDOW_MS
  const prev = (ipTimestamps.get(ip) ?? []).filter(t => t > windowStart)
  if (prev.length >= RATE_LIMIT_MAX) return true
  prev.push(now)
  ipTimestamps.set(ip, prev)
  return false
}

// Server-side in-memory cache (per process). Keyed by lat/lon rounded to 2dp (~1 km).
const cache = new Map<string, string | null>()

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`
}

export async function GET(request: NextRequest) {
  if (!ENABLED) {
    return NextResponse.json({ name: null }, { status: 503 })
  }

  // Auth + feature gate — same requirement as the travel weather endpoint
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    return NextResponse.json({ name: null }, { status: 404 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ name: null }, { status: 401 })
  }
  const allowed = await checkFeatureAccess(user.id, user.email, 'vedrid')
  if (!allowed) {
    return NextResponse.json({ name: null }, { status: 404 })
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'

  if (isRateLimited(ip)) {
    return NextResponse.json({ name: null }, { status: 429 })
  }

  const { searchParams } = request.nextUrl
  const latStr = searchParams.get('lat')
  const lonStr = searchParams.get('lon')

  if (!latStr || !lonStr) {
    return NextResponse.json({ name: null }, { status: 400 })
  }

  const lat = parseFloat(latStr)
  const lon = parseFloat(lonStr)

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ name: null }, { status: 400 })
  }

  const key = cacheKey(lat, lon)
  if (cache.has(key)) {
    return NextResponse.json({ name: cache.get(key) })
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&accept-language=is`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'teskeid.is/1.0 weather-forecast-auditability (https://teskeid.is)',
        'Accept': 'application/json',
      },
    })

    if (!res.ok) {
      cache.set(key, null)
      return NextResponse.json({ name: null })
    }

    const data: {
      name?: string
      address?: {
        village?: string
        hamlet?: string
        town?: string
        city?: string
        municipality?: string
        county?: string
        suburb?: string
      }
    } = await res.json()

    const addr = data.address ?? {}
    const name =
      addr.village ??
      addr.hamlet ??
      addr.town ??
      addr.suburb ??
      addr.city ??
      addr.municipality ??
      addr.county ??
      data.name ??
      null

    cache.set(key, name)

    // Cache-Control: 24h for proxies/CDN, revalidation in background
    return NextResponse.json({ name }, {
      headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600' },
    })
  } catch {
    cache.set(key, null)
    return NextResponse.json({ name: null })
  }
}
