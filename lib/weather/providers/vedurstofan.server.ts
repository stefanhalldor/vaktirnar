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
const FOREC_CACHE_KEY_PREFIX = 'vedurstofan:xml:forec:is:3h:F-D-T-R-W:'

export function cacheKeyForStation(stationId: string): string {
  return `${FOREC_CACHE_KEY_PREFIX}${stationId}`
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
 * Reads Veðurstofan forecast data from the vedurstofan_forecasts_latest
 * product table. This is the preferred read path once the background warmer
 * has populated the table.
 *
 * Returns a Map keyed by station ID:
 *   { status: 'ok', payload }    — has rows and expires_at is in the future
 *   { status: 'stale', payload } — has rows but expires_at is in the past
 *   { status: 'unavailable' }    — no rows for this station
 *
 * Never throws. Errors return an empty/partial map (fail-open).
 */
export async function readVedurstofanProductForStations(
  stationIds: string[],
): Promise<Map<string, VedurstofanStationResult>> {
  const result = new Map<string, VedurstofanStationResult>()
  if (stationIds.length === 0) return result

  const admin = getAdmin()
  const now = new Date()

  type ForecastRow = {
    station_id: string
    forecast_time: string
    wind_speed_ms: number | null
    wind_direction_text: string | null
    temperature_c: number | null
    precipitation_mm_per_hour: number | null
    weather_text: string | null
    atime: string | null
    expires_at: string | null
    fetched_at: string
  }

  try {
    const { data, error } = await admin
      .from('vedurstofan_forecasts_latest')
      .select(
        'station_id, forecast_time, wind_speed_ms, wind_direction_text, temperature_c, precipitation_mm_per_hour, weather_text, atime, expires_at, fetched_at',
      )
      .in('station_id', stationIds)
      .order('forecast_time')

    if (error || !data) return result

    // Group rows by station_id
    const byStation = new Map<string, ForecastRow[]>()
    for (const row of (data as ForecastRow[])) {
      const existing = byStation.get(row.station_id)
      if (existing) existing.push(row)
      else byStation.set(row.station_id, [row])
    }

    for (const stationId of stationIds) {
      const rows = byStation.get(stationId)
      if (!rows || rows.length === 0) {
        result.set(stationId, { status: 'unavailable' })
        continue
      }

      const firstRow = rows[0]
      const expiresAtIso = firstRow.expires_at
      const isFresh = expiresAtIso ? new Date(expiresAtIso) > now : false

      const payload: VedurstofanStationForecastCache = {
        source: 'vedurstofan',
        endpoint: 'xml',
        type: 'forec',
        lang: 'is',
        timeStep: '3h',
        params: ['F', 'D', 'T', 'R', 'W'],
        stationId,
        stationName: stationId,
        atimeIso: firstRow.atime,
        fetchedAtIso: firstRow.fetched_at,
        expiresAtIso: expiresAtIso ?? firstRow.fetched_at,
        attribution: {
          provider: 'Veðurstofa Íslands',
          downloadedAtIso: firstRow.fetched_at,
          serviceUrl: 'https://xmlweather.vedur.is',
        },
        forecasts: rows.map(r => ({
          ftimeIso: r.forecast_time,
          windSpeedMs: r.wind_speed_ms,
          windDirectionText: r.wind_direction_text,
          temperatureC: r.temperature_c,
          precipitationMmPerHour: r.precipitation_mm_per_hour,
          weatherText: r.weather_text,
        })),
        parseErrors: [],
      }

      result.set(stationId, { status: isFresh ? 'ok' : 'stale', payload })
    }
  } catch {
    // Fail-open: return partial map
  }

  return result
}

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

// ── Product table projector ───────────────────────────────────────────────────

export type VedurstofanProjectionResult = {
  projected: number
  skipped: number
  errors: number
  runId: number | null
}

/**
 * Projects cached Veðurstofan forecast payloads into the vedurstofan_forecasts_latest
 * product table and records the run in weather_fetch_runs.
 *
 * Reads all vedurstofan:xml:forec:is:3h:F-D-T-R-W:* rows from weather_cache
 * (structured JSON payloads, not raw XML), validates each, then for every valid
 * station: deletes existing forecast rows and inserts the new set.
 *
 * Per-station replace semantics: existing rows are only deleted after the
 * payload passes validation. If validation or insert fails, the existing rows
 * are preserved for that station and the station counts as an error.
 *
 * Never makes live HTTP requests to Veðurstofan.
 * Never throws — errors are counted and returned.
 */
export async function projectVedurstofanCacheToProductTables(): Promise<VedurstofanProjectionResult> {
  const admin = getAdmin()
  const startedAt = new Date().toISOString()

  // ── 1. Scan weather_cache for all forec entries ──────────────────────────────

  type WeatherCacheRow = { cache_key: string; response_body: unknown; expires_at: string }
  let cacheRows: WeatherCacheRow[] = []

  try {
    const { data, error } = await admin
      .from('weather_cache')
      .select('cache_key, response_body, expires_at')
      .like('cache_key', `${FOREC_CACHE_KEY_PREFIX}%`)

    if (error || !data) {
      const runId = await writeRunRecord(admin, startedAt, 0, 0, 1, 'Failed to read weather_cache')
      return { projected: 0, skipped: 0, errors: 1, runId }
    }

    cacheRows = data as WeatherCacheRow[]
  } catch {
    const runId = await writeRunRecord(admin, startedAt, 0, 0, 1, 'Exception reading weather_cache')
    return { projected: 0, skipped: 0, errors: 1, runId }
  }

  // ── 2. Project each cache row ────────────────────────────────────────────────

  let projected = 0
  let skipped = 0
  let errors = 0

  for (const row of cacheRows) {
    const payload = row.response_body as VedurstofanStationForecastCache | null

    // Validate before touching product tables
    if (
      !payload ||
      payload.source !== 'vedurstofan' ||
      payload.type !== 'forec' ||
      typeof payload.stationId !== 'string' ||
      !Array.isArray(payload.forecasts) ||
      payload.forecasts.length === 0
    ) {
      skipped++
      continue
    }

    // Cache key suffix must match payload stationId to prevent mismatched projection
    const keyStationId = row.cache_key.slice(FOREC_CACHE_KEY_PREFIX.length)
    if (keyStationId !== payload.stationId) {
      skipped++
      continue
    }

    const stationId = payload.stationId

    // Only project forecasts with a valid ftimeIso — skip individual bad rows
    const validForecasts = payload.forecasts.filter(
      f => typeof f.ftimeIso === 'string' && f.ftimeIso.length > 0,
    )
    if (validForecasts.length === 0) {
      skipped++
      continue
    }

    const forecastRows = validForecasts.map(f => ({
      station_id: stationId,
      forecast_time: f.ftimeIso,
      wind_speed_ms: f.windSpeedMs ?? null,
      wind_direction_text: f.windDirectionText ?? null,
      temperature_c: f.temperatureC ?? null,
      precipitation_mm_per_hour: f.precipitationMmPerHour ?? null,
      weather_text: f.weatherText ?? null,
      atime: payload.atimeIso ?? null,
      expires_at: payload.expiresAtIso ?? null,
      fetched_at: payload.fetchedAtIso,
    }))

    try {
      // Upsert new rows first — if this fails, existing product rows are preserved
      const { error: upsertError } = await admin
        .from('vedurstofan_forecasts_latest')
        .upsert(forecastRows, { onConflict: 'station_id,forecast_time' })

      if (upsertError) {
        errors++
        continue
      }

      // Delete stale rows only after upsert succeeds.
      // Stale = rows for this station with an older fetched_at than the new payload.
      // A lingering stale row is preferable to an empty station.
      const { error: deleteError } = await admin
        .from('vedurstofan_forecasts_latest')
        .delete()
        .eq('station_id', stationId)
        .lt('fetched_at', payload.fetchedAtIso)

      if (deleteError) {
        console.warn(`[weather/vedurstofan] stale row cleanup failed for ${stationId}`)
      }

      projected++
    } catch {
      errors++
    }
  }

  // ── 3. Write fetch run record ────────────────────────────────────────────────

  const errorSummary = errors > 0 ? `${errors} station(s) failed projection` : null
  const runId = await writeRunRecord(
    admin,
    startedAt,
    cacheRows.length,
    projected,
    errors,
    errorSummary,
  )

  return { projected, skipped, errors, runId }
}

// ── Background warmer ─────────────────────────────────────────────────────────

export type VedurstofanWarmResult = {
  /** Stations returned fresh live data (status='ok'). */
  fresh: number
  /** Stations served from expired cache because live fetch failed (status='stale'). */
  stale: number
  /** Stations with no data: unverified ID, or no cache and fetch failed (status='unavailable'). */
  unavailable: number
  projected: number
  skipped: number
  errors: number
  projectionRunId: number | null
}

/**
 * Fetches forecast data for all 280 registry stations from Veðurstofan,
 * updates weather_cache, then projects the full cache into vedurstofan_forecasts_latest.
 *
 * Uses cache-first logic: stations with a fresh cache entry are not re-fetched.
 * Per-batch timeout of 8 seconds to avoid indefinite hangs on a single batch.
 *
 * Intended for background/admin use only — never call from a user request path.
 * Never throws.
 */
export async function warmVedurstofanForecastCache(): Promise<VedurstofanWarmResult> {
  const allIds = VEDURSTOFAN_STATIONS_REGISTRY
    .filter(s => s.stationId !== null)
    .map(s => s.stationId!)

  let results: Map<string, VedurstofanStationResult>
  try {
    results = await fetchVedurstofanForecastsForStations(allIds, { timeoutMs: 8000 })
  } catch {
    results = new Map()
  }

  let fresh = 0
  let stale = 0
  let unavailable = 0
  for (const r of results.values()) {
    if (r.status === 'ok') fresh++
    else if (r.status === 'stale') stale++
    else unavailable++
  }

  let projection: VedurstofanProjectionResult
  try {
    projection = await projectVedurstofanCacheToProductTables()
  } catch {
    projection = { projected: 0, skipped: 0, errors: 0, runId: null }
  }

  return {
    fresh,
    stale,
    unavailable,
    projected: projection.projected,
    skipped: projection.skipped,
    errors: projection.errors,
    projectionRunId: projection.runId,
  }
}

async function writeRunRecord(
  admin: ReturnType<typeof getAdmin>,
  startedAt: string,
  attempted: number,
  succeeded: number,
  failed: number,
  errorSummary: string | null,
): Promise<number | null> {
  try {
    const { data } = await admin
      .from('weather_fetch_runs')
      .insert({
        source: 'vedurstofan',
        fetch_type: 'forec',
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        stations_attempted: attempted,
        stations_succeeded: succeeded,
        stations_failed: failed,
        error_summary: errorSummary,
      })
      .select('id')
      .maybeSingle()

    return (data as { id: number } | null)?.id ?? null
  } catch {
    return null
  }
}
