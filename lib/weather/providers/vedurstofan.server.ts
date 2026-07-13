/**
 * Veðurstofan Íslands fetch/cache wrapper (server-only, Phase 1C).
 *
 * Fetches type=forec station forecasts from xmlweather.vedur.is, caches
 * parsed JSONB per station in weather_cache, and returns structured results.
 *
 * Design principles:
 * - Cache-first: returns fresh cache without a network call when possible.
 * - Fail-open: Veðurstofan failures must never break MET/Yr route calculation.
 * - Station-batched: up to 10 station IDs per HTTP request.
 * - Verified-only: rejects station IDs not in the curated coordinatesVerified list.
 *
 * Cache key: vedurstofan:xml:forec:is:3h:F-D-T-R-W:{stationId}
 * TTL: 90 minutes — Veðurstofan-specific; XML service does not provide reliable
 *      Expires headers and updates less frequently than MET/Yr.
 *
 * Phase 1D will add scheduled cache warming.
 * Phase 2 will add shadow comparison and UI integration.
 */
import 'server-only'
import { getAdmin } from '@/lib/supabase/admin'
import { parseVedurstofanXml } from './vedurstofanXml'
import type { VedurstofanStationForecast } from './vedurstofanXml'
import { VEDURSTOFAN_STATIONS_REGISTRY } from './vedurstofanStationsRegistry'

// ── Service constants ─────────────────────────────────────────────────────────

const SERVICE_URL =
  'https://xmlweather.vedur.is/?op_w=xml&type=forec&lang=is&view=xml&time=3h&params=F;D;T;R;W'

const BATCH_MAX = 10

// 90-minute TTL: Veðurstofan-specific choice based on 3h forecast step frequency.
// The XML service does not provide reliable Expires headers.
const TTL_MS = 90 * 60 * 1000

// ── Types ─────────────────────────────────────────────────────────────────────

export type VedurstofanStationForecastCache = {
  source: 'vedurstofan'
  endpoint: 'xml'
  type: 'forec'
  lang: 'is'
  timeStep: '3h'
  params: ['F', 'D', 'T', 'R', 'W']
  stationId: string
  stationName: string
  /** When the forecast was generated (atime from XML), ISO UTC. Null if absent. */
  atimeIso: string | null
  fetchedAtIso: string
  expiresAtIso: string
  attribution: {
    provider: 'Veðurstofa Íslands'
    downloadedAtIso: string
    serviceUrl: string
  }
  forecasts: Array<{
    ftimeIso: string
    windSpeedMs: number | null
    windDirectionText: string | null
    temperatureC: number | null
    precipitationMmPerHour: number | null
    weatherText: string | null
  }>
  parseErrors: string[]
}

export type VedurstofanStationResult =
  | { status: 'ok'; payload: VedurstofanStationForecastCache }
  | { status: 'stale'; payload: VedurstofanStationForecastCache }
  | { status: 'unavailable' }

// ── Registry station index ────────────────────────────────────────────────────

// Allows all 280 official registry stations; rejects arbitrary user-supplied IDs.
const REGISTRY_STATION_IDS = new Set(
  VEDURSTOFAN_STATIONS_REGISTRY.filter(s => s.stationId !== null).map(s => s.stationId!),
)

function stationNameFromList(stationId: string): string {
  return VEDURSTOFAN_STATIONS_REGISTRY.find(s => s.stationId === stationId)?.name ?? stationId
}

// ── Cache key ─────────────────────────────────────────────────────────────────

/**
 * Encodes all response-shape dimensions: source, transport, type, language,
 * time step, param set, and station. Avoids key collisions when observation
 * types, 6h steps, English responses or different params are added later.
 */
export function cacheKeyForStation(stationId: string): string {
  return `vedurstofan:xml:forec:is:3h:F-D-T-R-W:${stationId}`
}

// ── Supabase cache helpers ────────────────────────────────────────────────────

type CacheRow = {
  response_body: unknown
  expires_at: string
}

async function getFromCache(key: string): Promise<CacheRow | null> {
  try {
    const { data } = await getAdmin()
      .from('weather_cache')
      .select('response_body, expires_at')
      .eq('cache_key', key)
      .maybeSingle()
    return data as CacheRow | null
  } catch {
    return null
  }
}

async function saveToCache(
  key: string,
  payload: VedurstofanStationForecastCache,
): Promise<void> {
  try {
    const now = new Date().toISOString()
    await getAdmin()
      .from('weather_cache')
      .upsert(
        {
          cache_key: key,
          response_body: payload as unknown,
          expires_at: payload.expiresAtIso,
          last_modified: null,
          fetched_at: now,
          updated_at: now,
        },
        { onConflict: 'cache_key' },
      )
  } catch {
    console.error('[weather/vedurstofan] cache write failed')
  }
}

// ── HTTP fetch ────────────────────────────────────────────────────────────────

async function fetchBatch(stationIds: string[], signal?: AbortSignal): Promise<string | null> {
  const url = `${SERVICE_URL}&ids=${stationIds.join(';')}`
  try {
    const res = await fetch(url, { cache: 'no-store', signal })
    if (!res.ok) {
      console.error(`[weather/vedurstofan] HTTP ${res.status}`)
      return null
    }
    return await res.text()
  } catch (err) {
    console.error('[weather/vedurstofan] fetch error', err)
    return null
  }
}

// ── Payload builder ───────────────────────────────────────────────────────────

function buildPayload(
  stationId: string,
  station: VedurstofanStationForecast,
  parseErrors: string[],
  fetchedAtIso: string,
): VedurstofanStationForecastCache {
  const expiresAtIso = new Date(Date.parse(fetchedAtIso) + TTL_MS).toISOString()
  return {
    source: 'vedurstofan',
    endpoint: 'xml',
    type: 'forec',
    lang: 'is',
    timeStep: '3h',
    params: ['F', 'D', 'T', 'R', 'W'],
    stationId,
    stationName: station.stationName || stationNameFromList(stationId),
    atimeIso: station.atimeIso,
    fetchedAtIso,
    expiresAtIso,
    attribution: {
      provider: 'Veðurstofa Íslands',
      downloadedAtIso: fetchedAtIso,
      serviceUrl: SERVICE_URL,
    },
    forecasts: station.forecasts.map(f => ({
      ftimeIso: f.ftimeIso,
      windSpeedMs: f.windSpeedMs,
      windDirectionText: f.windDirectionText,
      temperatureC: f.temperatureC,
      precipitationMmPerHour: f.precipitationMmPerHour,
      weatherText: f.weatherText,
    })),
    parseErrors,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Reads Veðurstofan forecast data from the weather_cache layer only.
 * Never makes live HTTP requests to the XML service.
 *
 * Use this in user-facing routes where a cold-cache live fetch for hundreds
 * of stations would be unacceptably slow. The station explorer uses this so
 * that page load is fast regardless of cache warmth.
 *
 * Returns a Map keyed by station ID:
 *   { status: 'ok', payload }    — fresh cache entry
 *   { status: 'stale', payload } — expired but available cache entry
 *   { status: 'unavailable' }    — not in registry, or no cache entry
 *
 * Never throws.
 */
export async function readVedurstofanCacheForStations(
  stationIds: string[],
): Promise<Map<string, VedurstofanStationResult>> {
  const result = new Map<string, VedurstofanStationResult>()

  if (stationIds.length === 0) return result

  const uniqueIds = [...new Set(stationIds)]

  const registryIds: string[] = []
  for (const id of uniqueIds) {
    if (REGISTRY_STATION_IDS.has(id)) {
      registryIds.push(id)
    } else {
      result.set(id, { status: 'unavailable' })
    }
  }

  if (registryIds.length === 0) return result

  const now = new Date()

  try {
    const cacheEntries = await Promise.all(
      registryIds.map(id =>
        getFromCache(cacheKeyForStation(id)).then(row => ({ id, row })),
      ),
    )

    for (const { id, row } of cacheEntries) {
      if (!row) {
        result.set(id, { status: 'unavailable' })
      } else if (new Date(row.expires_at) > now) {
        result.set(id, { status: 'ok', payload: row.response_body as VedurstofanStationForecastCache })
      } else {
        result.set(id, { status: 'stale', payload: row.response_body as VedurstofanStationForecastCache })
      }
    }
  } catch {
    // Cache read failure: mark all as unavailable
    for (const id of registryIds) {
      result.set(id, { status: 'unavailable' })
    }
  }

  return result
}

/**
 * Fetches Veðurstofan type=forec forecasts for the given station IDs,
 * using weather_cache as a cache-first store.
 *
 * Returns a Map keyed by station ID. Each value is one of:
 *   { status: 'ok', payload }     — fresh data (from cache or live fetch)
 *   { status: 'stale', payload }  — expired cache returned because fetch failed
 *   { status: 'unavailable' }     — unverified ID, or no cache + fetch failed
 *
 * Never throws. Veðurstofan failures are fail-open.
 *
 * @param options.timeoutMs - If set, each HTTP batch fetch is aborted after this many ms.
 *   On timeout, stale cache is returned for affected stations (unavailable if no cache exists).
 */
export async function fetchVedurstofanForecastsForStations(
  stationIds: string[],
  options?: { timeoutMs?: number },
): Promise<Map<string, VedurstofanStationResult>> {
  const result = new Map<string, VedurstofanStationResult>()

  if (stationIds.length === 0) return result

  // Dedupe input so duplicate IDs do not cause extra cache reads or batch slots
  const uniqueIds = [...new Set(stationIds)]

  // Partition: verified stations can be fetched; unverified return unavailable
  const verified: string[] = []
  for (const id of uniqueIds) {
    if (REGISTRY_STATION_IDS.has(id)) {
      verified.push(id)
    } else {
      result.set(id, { status: 'unavailable' })
    }
  }

  if (verified.length === 0) return result

  const now = new Date()

  // Read all cache rows in parallel
  const cacheEntries = await Promise.all(
    verified.map(id =>
      getFromCache(cacheKeyForStation(id)).then(row => ({ id, row })),
    ),
  )

  const cacheMap = new Map<string, CacheRow | null>()
  for (const { id, row } of cacheEntries) {
    cacheMap.set(id, row)
  }

  // Split into fresh-cache hits and stations that need a live fetch
  const fresh: string[] = []
  const needsFetch: string[] = []

  for (const id of verified) {
    const row = cacheMap.get(id)
    if (row && new Date(row.expires_at) > now) {
      fresh.push(id)
    } else {
      needsFetch.push(id)
    }
  }

  // Return fresh cache immediately
  for (const id of fresh) {
    const row = cacheMap.get(id)!
    result.set(id, { status: 'ok', payload: row.response_body as VedurstofanStationForecastCache })
  }

  if (needsFetch.length === 0) return result

  // Live fetch in batches of at most BATCH_MAX
  const freshlyFetched = new Map<string, VedurstofanStationForecastCache>()

  for (let i = 0; i < needsFetch.length; i += BATCH_MAX) {
    const batch = needsFetch.slice(i, i + BATCH_MAX)
    let controller: AbortController | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (options?.timeoutMs && options.timeoutMs > 0) {
      controller = new AbortController()
      timeoutId = setTimeout(() => controller!.abort(), options.timeoutMs)
    }
    let xml: string | null
    try {
      xml = await fetchBatch(batch, controller?.signal)
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }

    if (xml !== null) {
      const fetchedAtIso = new Date().toISOString()
      const { stations, parseErrors } = parseVedurstofanXml(xml)

      for (const station of stations) {
        if (!batch.includes(station.stationId)) continue
        // Skip invalid, error, or empty station responses — do not cache them as ok.
        // The resolution step will fall back to stale cache or unavailable.
        if (!station.valid || station.errText !== '' || station.forecasts.length === 0) {
          console.warn(
            `[weather/vedurstofan] station ${station.stationId} skipped: valid=${station.valid} err="${station.errText}" forecasts=${station.forecasts.length}`,
          )
          continue
        }
        const payload = buildPayload(station.stationId, station, parseErrors, fetchedAtIso)
        freshlyFetched.set(station.stationId, payload)
        await saveToCache(cacheKeyForStation(station.stationId), payload)
      }
    }
  }

  // Resolve each needs-fetch station: fresh > stale fallback > unavailable
  for (const id of needsFetch) {
    const fetched = freshlyFetched.get(id)
    if (fetched) {
      result.set(id, { status: 'ok', payload: fetched })
      continue
    }
    const staleRow = cacheMap.get(id)
    if (staleRow) {
      result.set(id, { status: 'stale', payload: staleRow.response_body as VedurstofanStationForecastCache })
    } else {
      result.set(id, { status: 'unavailable' })
    }
  }

  return result
}
