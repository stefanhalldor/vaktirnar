import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getWeatherMapProvider } from '@/lib/weather/provider.server'
import { validateIcelandicCoords } from '@/lib/weather/coords'

// Rate limiting: 30 requests per 60 seconds per IP (in-memory, best-effort).
const RATE_LIMIT_MAX = 30
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

// In-memory cache per normalized (trimmed + lowercased) query. 10-minute TTL, best-effort (Vercel process-level).
const CACHE_TTL_MS = 10 * 60 * 1000

type PlaceSearchResult = { name: string; formattedAddress: string; lat: number; lon: number }
const cache = new Map<string, { results: PlaceSearchResult[]; expiresAt: number }>()

export async function GET(request: NextRequest) {
  if (process.env.AUTH_MVP_ENABLED !== 'true') {
    return NextResponse.json({ results: [] }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ results: [] }, { status: 401 })
  }

  const allowed = await checkFeatureAccess(user.id, user.email, 'vedrid')
  if (!allowed) {
    return NextResponse.json({ results: [] }, { status: 404 })
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'

  if (isRateLimited(ip)) {
    return NextResponse.json({ results: [] }, { status: 429 })
  }

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2 || q.length > 100) {
    return NextResponse.json({ results: [] }, { status: 400 })
  }

  const normalizedQ = q.toLocaleLowerCase('is')
  const cached = cache.get(normalizedQ)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ results: cached.results })
  }

  const provider = getWeatherMapProvider()
  if (!provider) {
    return NextResponse.json({ results: [] }, { status: 503 })
  }

  try {
    const candidates = await provider.geocodePlace(q)
    const results: PlaceSearchResult[] = candidates
      .filter(c => validateIcelandicCoords(c.lat, c.lon))
      .map(c => ({
        name: c.displayName,
        formattedAddress: c.formattedAddress,
        lat: c.lat,
        lon: c.lon,
      }))
    cache.set(normalizedQ, { results, expiresAt: Date.now() + CACHE_TTL_MS })
    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ results: [] }, { status: 503 })
  }
}
