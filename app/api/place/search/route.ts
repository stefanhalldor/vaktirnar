import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchHmsPlaces } from '@/lib/places/hmsDirectory.server'
import type { SelectedLocation } from '@/lib/places/types'
import {
  findRoadMapPlaceSuggestions,
  mergePlaceSuggestions,
} from '@/lib/road-intelligence/roadMapPlaces'
import { normalizePlaceSearchText } from '@/lib/road-intelligence/placeSearchBridge'
import { resolveWeatherBaseAccess, getWeatherEnabledMode } from '@/lib/weather/weatherBaseAccess.server'
import { getWeatherMapProvider } from '@/lib/weather/provider.server'
import { validateIcelandicCoords } from '@/lib/weather/coords'

const RATE_LIMIT_MAX = 30
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_KEYS = 2_000
const MAX_RESULTS = 8

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

function staticPlaces(query: string): SelectedLocation[] {
  return findRoadMapPlaceSuggestions(query, MAX_RESULTS).map(place => ({
    id: `static:${place.id}`,
    source: 'static',
    sourceId: place.id,
    name: place.name,
    formattedAddress: place.formattedAddress ?? place.name,
    lat: place.lat,
    lon: place.lon,
  }))
}

function relevanceScore(query: string, place: SelectedLocation): number {
  const normalizedQuery = normalizePlaceSearchText(query)
  const name = normalizePlaceSearchText(place.name)
  const address = normalizePlaceSearchText(place.formattedAddress)
  const municipality = normalizePlaceSearchText(place.municipality ?? '')
  const postalCode = normalizePlaceSearchText(place.postalCode ?? '')

  let score = 0
  if (name === normalizedQuery) score = 120
  else if (address === normalizedQuery) score = 115
  else if (name.startsWith(normalizedQuery)) score = 100
  else if (address.startsWith(normalizedQuery)) score = 90
  else if (municipality === normalizedQuery || postalCode === normalizedQuery) score = 80
  else if (name.includes(normalizedQuery)) score = 60
  else if (address.includes(normalizedQuery) || municipality.includes(normalizedQuery)) score = 50

  if (place.source === 'hms') score += 4
  return score
}

function dedupeAndRank(
  query: string,
  primary: readonly SelectedLocation[],
  secondary: readonly SelectedLocation[],
): SelectedLocation[] {
  const merged = mergePlaceSuggestions(primary, secondary, MAX_RESULTS * 2) as SelectedLocation[]
  return merged
    .map((place, index) => ({ place, index, score: relevanceScore(query, place) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_RESULTS)
    .map(item => item.place)
}

async function googleFallback(query: string): Promise<SelectedLocation[]> {
  if (process.env.PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED !== 'true') return []
  const provider = getWeatherMapProvider()
  if (!provider) return []

  try {
    const candidates = await provider.geocodePlace(query)
    return candidates
      .filter(candidate => validateIcelandicCoords(candidate.lat, candidate.lon))
      .slice(0, MAX_RESULTS)
      .map(candidate => ({
        id: `google:${candidate.placeId}`,
        source: 'google' as const,
        sourceId: candidate.placeId,
        googlePlaceId: candidate.placeId || undefined,
        routingRef: candidate.placeId
          ? { provider: 'google' as const, placeId: candidate.placeId }
          : undefined,
        name: candidate.displayName,
        formattedAddress: candidate.formattedAddress,
        lat: candidate.lat,
        lon: candidate.lon,
      }))
  } catch {
    return []
  }
}

async function readQuery(request: NextRequest): Promise<string | null> {
  const body = await request.json().catch(() => null) as { query?: unknown } | null
  if (!body || typeof body.query !== 'string') return null
  const query = body.query.trim()
  return query.length >= 2 && query.length <= 100 ? query : null
}

export async function POST(request: NextRequest) {
  if (process.env.AUTH_MVP_ENABLED !== 'true' || getWeatherEnabledMode() === 'off') {
    return noStoreJson({ results: [] }, 404)
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const access = await resolveWeatherBaseAccess(user)
  if (access.mode === 'blocked') {
    return noStoreJson({ results: [] }, 401)
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')?.trim()
    ?? ''
  if (ip && isRateLimited(ip)) {
    return noStoreJson({ results: [], error: 'rate_limited' }, 429)
  }

  const query = await readQuery(request)
  if (!query) return noStoreJson({ results: [] }, 400)

  // The public HMS directory is canonical. Curated localities complement it,
  // because an address register is not a settlement gazetteer. Google is an
  // explicit, transitional server-only fallback and receives the query only
  // when both local sources return no match.
  const [hms, curated] = await Promise.all([
    isHmsSearchEnabled()
      ? searchHmsPlaces(query, MAX_RESULTS).catch(() => {
          console.error('[place-search] HMS search unavailable')
          return []
        })
      : Promise.resolve([]),
    Promise.resolve(staticPlaces(query)),
  ])
  let results = dedupeAndRank(query, hms, curated)
  if (results.length === 0) {
    results = dedupeAndRank(query, await googleFallback(`${query} Ísland`), [])
  }

  return noStoreJson({ results })
}

/** Queries belong in a POST body so addresses do not leak into URL logs/history. */
export async function GET() {
  return noStoreJson({ results: [], error: 'method_not_allowed' }, 405)
}
