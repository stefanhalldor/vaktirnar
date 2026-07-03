import 'server-only'
import { getAdmin } from '@/lib/supabase/admin'
import { parseMetnoForecast } from './forecast'
import { roundCoord } from './places'
import type { HourPoint } from './types'

const METNO_BASE = 'https://api.met.no/weatherapi/locationforecast/2.0/compact'

function cacheKey(lat: number, lon: number): string {
  return `metno:locationforecast:2.0:compact:${roundCoord(lat)}:${roundCoord(lon)}`
}

type CacheRow = {
  response_body: unknown
  expires_at: string
  last_modified: string | null
}

async function getFromCache(key: string): Promise<CacheRow | null> {
  try {
    const { data } = await getAdmin()
      .from('weather_cache')
      .select('response_body, expires_at, last_modified')
      .eq('cache_key', key)
      .maybeSingle()
    return data as CacheRow | null
  } catch {
    return null
  }
}

async function saveToCache(
  key: string,
  body: unknown,
  expiresAt: string,
  lastModified: string | null,
): Promise<void> {
  try {
    const now = new Date().toISOString()
    await getAdmin()
      .from('weather_cache')
      .upsert(
        { cache_key: key, response_body: body, expires_at: expiresAt, last_modified: lastModified, fetched_at: now, updated_at: now },
        { onConflict: 'cache_key' },
      )
  } catch {
    console.error('[weather/metno] cache write failed')
  }
}

async function touchCache(key: string): Promise<void> {
  try {
    await getAdmin()
      .from('weather_cache')
      .update({ updated_at: new Date().toISOString() })
      .eq('cache_key', key)
  } catch {
    // non-fatal
  }
}

function parseExpires(header: string | null): string {
  if (header) {
    const d = new Date(header)
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  // Default: 1 hour
  return new Date(Date.now() + 60 * 60 * 1000).toISOString()
}

export async function fetchForecast(lat: number, lon: number): Promise<HourPoint[]> {
  const key = cacheKey(lat, lon)
  const cached = await getFromCache(key)
  const userAgent =
    process.env.METNO_USER_AGENT ??
    'Teskeidin/1.0 (+https://teskeid.is; teskeid@gottvibe.is)'

  // Cache hit and not expired: return immediately
  if (cached && new Date(cached.expires_at) > new Date()) {
    return parseMetnoForecast(cached.response_body)
  }

  const headers: Record<string, string> = { 'User-Agent': userAgent }
  if (cached?.last_modified) {
    headers['If-Modified-Since'] = cached.last_modified
  }

  const url = `${METNO_BASE}?lat=${roundCoord(lat)}&lon=${roundCoord(lon)}`
  let res: Response

  try {
    res = await fetch(url, { headers, cache: 'no-store' })
  } catch (err) {
    console.error('[weather/metno] fetch error', err)
    if (cached) return parseMetnoForecast(cached.response_body)
    throw new Error('met.no fetch failed')
  }

  if (res.status === 304) {
    await touchCache(key)
    if (cached) return parseMetnoForecast(cached.response_body)
    throw new Error('met.no 304 but no cache')
  }

  if (res.status === 203) {
    console.warn('[weather/metno] 203 Non-Authoritative Information')
  }

  if (res.status === 403) {
    console.error('[weather/metno] 403 Forbidden — check User-Agent and met.no terms')
    if (cached) return parseMetnoForecast(cached.response_body)
    throw new Error('met.no access denied')
  }

  if (res.status === 429) {
    console.error('[weather/metno] 429 Too Many Requests')
    if (cached) return parseMetnoForecast(cached.response_body)
    throw new Error('met.no rate limited')
  }

  if (!res.ok) {
    console.error(`[weather/metno] HTTP ${res.status}`)
    if (cached) return parseMetnoForecast(cached.response_body)
    throw new Error(`met.no HTTP ${res.status}`)
  }

  const body = await res.json()
  const expiresAt = parseExpires(res.headers.get('Expires'))
  const lastModified = res.headers.get('Last-Modified')

  await saveToCache(key, body, expiresAt, lastModified)
  return parseMetnoForecast(body)
}
