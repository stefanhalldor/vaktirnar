/**
 * Vegagerðin current-measurement provider — server-only.
 *
 * Data source: gagnaveita.vegagerdin.is/api/vedur2014_1
 * Returns current/live weather station measurements, NOT forecast data.
 *
 * Key semantic rules (from Vegagerðin documentation):
 *   Vindhradi  → meanWindMs   (sustained/mean wind speed, current)
 *   Vindhvida  → gustLast10MinMs (max gust last 10 min; NOT a forecast gust)
 *   Null stays null. Never coerce missing/absent values to 0.
 *
 * IMPORTANT — Live fetch status:
 *   fetchVegagerdinCurrent() makes a real HTTP call to Vegagerðin upstream.
 *   This function MUST NOT be called until Stebbi explicitly approves the
 *   external fetch. It is included here so the wiring is ready.
 *
 *   readVegagerdinCurrentFromCache() is safe to call at any time: it only
 *   reads from the local weather_cache table and never contacts upstream.
 *
 * Cache key: vegagerdin:vedur2014_1:latest
 * TTL: 2 minutes (fresh); stale fallback: 30 minutes.
 * Upstream timeout: 8 seconds.
 *
 * Live response shape: VERIFIED 2026-07-18 against gagnaveita.vegagerdin.is/api/vedur2014_1.
 * Field names confirmed: Nr, Breidd, Lengd, Dags, Vindhradi, Vindhvida, VindattAsc, Vindatt,
 * Hiti, Veghiti, Nafn. Array of 202 items on first live fetch.
 */
import 'server-only'
import { getAdmin } from '@/lib/supabase/admin'
import type {
  VegagerdinRawItem,
  VegagerdinCurrentMeasurement,
  VegagerdinCachePayload,
  MeasurementFreshness,
} from './vegagerdinCurrentTypes'

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_KEY = 'vegagerdin:vedur2014_1:latest'
const UPSTREAM_URL = 'https://gagnaveita.vegagerdin.is/api/vedur2014_1'
const FRESH_TTL_MS = 2 * 60 * 1000       // 2 minutes
const STALE_FALLBACK_MS = 30 * 60 * 1000 // 30 minutes
const UPSTREAM_TIMEOUT_MS = 8_000         // 8 seconds

// ── Parsing helpers ───────────────────────────────────────────────────────────

/**
 * Parse a value that may be a number, numeric string, or null.
 * Returns null for any absent, blank, or non-finite value.
 * Never returns 0 for a missing value.
 */
function parseNum(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) return null
  if (typeof val === 'number') return isFinite(val) ? val : null
  const trimmed = String(val).trim()
  if (trimmed === '') return null
  const n = parseFloat(trimmed)
  return isFinite(n) ? n : null
}

/**
 * Parse a string value, returning null for absent or blank strings.
 */
function parseStr(val: unknown): string | null {
  if (val === null || val === undefined) return null
  const s = String(val).trim()
  return s === '' ? null : s
}

/**
 * Parse the Vegagerðin Dags field to an ISO UTC string.
 *
 * Iceland uses UTC year-round (no DST, UTC+0), so local time = UTC.
 * Expected format: 'YYYY-MM-DD HH:mm:ss' (documented; unverified against live).
 *
 * Falls back to fetchedAtIso if Dags is absent or unparseable.
 * Do NOT rely on new Date(raw.Dags) unless the live format is confirmed ISO.
 */
function parseDags(raw: string | null | undefined, fallbackIso: string): string {
  if (!raw) return fallbackIso
  const trimmed = String(raw).trim()
  if (trimmed === '') return fallbackIso
  // Attempt: 'YYYY-MM-DD HH:mm:ss' → replace space with T, append Z for UTC.
  const isoAttempt = trimmed.replace(' ', 'T') + (trimmed.includes('Z') ? '' : 'Z')
  const ms = Date.parse(isoAttempt)
  if (isFinite(ms)) return new Date(ms).toISOString()
  // Second attempt: try raw as-is in case it is already ISO.
  const ms2 = Date.parse(trimmed)
  if (isFinite(ms2)) return new Date(ms2).toISOString()
  return fallbackIso
}

/**
 * Parse the station ID to a stable string.
 * Vegagerðin uses Nr which may be a number or string.
 */
function parseStationId(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim()
  return s === '' ? null : s
}

// ── Public parser ─────────────────────────────────────────────────────────────

/**
 * Parse a Vegagerðin vedur2014_1 response body string into normalized measurements.
 *
 * Accepts the raw JSON response as a string (not yet parsed).
 * Never throws. Returns an empty array on any parse failure.
 *
 * @param body         Raw response body text from upstream.
 * @param fetchedAtIso ISO string of when the response was fetched.
 */
export function parseVegagerdinResponse(
  body: string,
  fetchedAtIso: string,
): VegagerdinCurrentMeasurement[] {
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    console.error('[vegagerdin] JSON parse failed')
    return []
  }

  // Endpoint may return an array directly or an object wrapping an array.
  // Handle both and fail gracefully for unexpected shapes.
  let items: unknown[]
  if (Array.isArray(raw)) {
    items = raw
  } else if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).results)) {
    items = (raw as Record<string, unknown>).results as unknown[]
  } else if (raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).data)) {
    items = (raw as Record<string, unknown>).data as unknown[]
  } else {
    console.error('[vegagerdin] unexpected response shape')
    return []
  }

  const measurements: VegagerdinCurrentMeasurement[] = []

  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const r = item as VegagerdinRawItem

    const stationId = parseStationId(r.Nr)
    if (!stationId) continue // station ID is required

    const lat = parseNum(r.Breidd)
    const lon = parseNum(r.Lengd)
    if (lat === null || lon === null) continue // coordinates required for mapping

    const measuredAtIso = parseDags(r.Dags, fetchedAtIso)
    const meanWindMs = parseNum(r.Vindhradi)
    const gustLast10MinMs = parseNum(r.Vindhvida)
    const windDirectionDeg = parseNum(r.VindattAsc)
    const windDirectionText = parseStr(r.Vindatt)
    const airTemperatureC = parseNum(r.Hiti)
    const roadTemperatureC = parseNum(r.Veghiti)

    // 'complete' only if all key numeric fields are present.
    const dataQuality: VegagerdinCurrentMeasurement['dataQuality'] =
      meanWindMs !== null &&
      gustLast10MinMs !== null &&
      windDirectionDeg !== null &&
      airTemperatureC !== null
        ? 'complete'
        : 'partial'

    measurements.push({
      source: 'vegagerdin',
      stationId,
      stationName: parseStr(r.Nafn) ?? stationId,
      lat,
      lon,
      measuredAtIso,
      fetchedAtIso,
      meanWindMs,
      gustLast10MinMs,
      windDirectionDeg,
      windDirectionText,
      airTemperatureC,
      roadTemperatureC,
      dataQuality,
    })
  }

  return measurements
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

type CacheRow = {
  response_body: unknown
  fetched_at: string
}

async function readFromCache(): Promise<CacheRow | null> {
  try {
    const { data } = await getAdmin()
      .from('weather_cache')
      .select('response_body, fetched_at')
      .eq('cache_key', CACHE_KEY)
      .maybeSingle()
    return data as CacheRow | null
  } catch {
    return null
  }
}

async function writeToCache(payload: VegagerdinCachePayload): Promise<boolean> {
  try {
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + FRESH_TTL_MS).toISOString()
    const { error } = await getAdmin()
      .from('weather_cache')
      .upsert(
        {
          cache_key: CACHE_KEY,
          response_body: payload as unknown,
          expires_at: expiresAt,
          last_modified: null,
          fetched_at: now,
          updated_at: now,
        },
        { onConflict: 'cache_key' },
      )
    if (error) {
      console.error('[vegagerdin] cache write failed', error.message)
      return false
    }
    return true
  } catch {
    console.error('[vegagerdin] cache write failed (exception)')
    return false
  }
}

// ── Freshness checks ──────────────────────────────────────────────────────────

const MEASUREMENT_FRESH_MS = 15 * 60 * 1000  // 15 minutes
const MEASUREMENT_AGING_MS = 30 * 60 * 1000  // 30 minutes

function isCacheFresh(fetchedAtIso: string): boolean {
  return Date.now() - Date.parse(fetchedAtIso) < FRESH_TTL_MS
}

function isCacheWithinStaleWindow(fetchedAtIso: string): boolean {
  return Date.now() - Date.parse(fetchedAtIso) < STALE_FALLBACK_MS
}

/**
 * Classify how fresh the actual station measurements are relative to wall clock.
 *
 * This is distinct from cache freshness (time since our server fetched upstream).
 * Based on the oldest measurement timestamp across all stations in the payload.
 *
 *   'fresh'   — oldest measurement < 15 min ago (normal operation, ~1.5 cycles)
 *   'aging'   — 15–30 min ago (2–3 cycles behind, probably fine)
 *   'stale'   — > 30 min ago (> 3 cycles, significantly behind)
 *   'unknown' — no oldestMeasuredAtIso available
 */
export function getMeasurementFreshness(oldestMeasuredAtIso: string | null): MeasurementFreshness {
  if (!oldestMeasuredAtIso) return 'unknown'
  const ageMs = Date.now() - Date.parse(oldestMeasuredAtIso)
  if (!isFinite(ageMs)) return 'unknown'
  if (ageMs < MEASUREMENT_FRESH_MS) return 'fresh'
  if (ageMs < MEASUREMENT_AGING_MS) return 'aging'
  return 'stale'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Safe shape descriptor for upstream parser diagnostics.
 * Never contains raw field values, coordinates, names, or secrets.
 * Only exposed via protected cron route — never in public API responses.
 */
export type SafeShapeInfo = {
  topLevelKind: 'array' | 'object' | 'other'
  topLevelKeys?: string[]
  firstItemKeys?: string[]
  itemCount?: number
}

export function buildSafeShapeInfo(raw: unknown): SafeShapeInfo {
  if (Array.isArray(raw)) {
    const firstItem = raw[0]
    return {
      topLevelKind: 'array',
      itemCount: raw.length,
      firstItemKeys:
        firstItem && typeof firstItem === 'object'
          ? Object.keys(firstItem as Record<string, unknown>)
          : undefined,
    }
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    const topLevelKeys = Object.keys(obj)
    // If the object wraps an array under a well-known key (results/data),
    // include first-item keys so caller can identify field names without raw values.
    const wrapperKey =
      (['results', 'data'] as const).find(k => Array.isArray(obj[k])) ??
      topLevelKeys.find(k => Array.isArray(obj[k]))
    if (wrapperKey) {
      const inner = obj[wrapperKey] as unknown[]
      const firstItem = inner[0]
      return {
        topLevelKind: 'object',
        topLevelKeys,
        itemCount: inner.length,
        firstItemKeys:
          firstItem && typeof firstItem === 'object'
            ? Object.keys(firstItem as Record<string, unknown>)
            : undefined,
      }
    }
    return { topLevelKind: 'object', topLevelKeys }
  }
  return { topLevelKind: 'other' }
}

export type VegagerdinUnavailableReason = 'cache_missing' | 'cache_expired' | 'cache_invalid'

export type VegagerdinCurrentResult =
  | { status: 'fresh'; cacheStatus: 'fresh'; measurementFreshness: MeasurementFreshness; payload: VegagerdinCachePayload }
  | { status: 'stale'; cacheStatus: 'stale'; measurementFreshness: MeasurementFreshness; payload: VegagerdinCachePayload }
  | { status: 'unavailable'; reason: VegagerdinUnavailableReason }

/**
 * Reads Vegagerðin current measurements from weather_cache only.
 * Never makes live HTTP requests to upstream.
 *
 * Returns:
 *   { status: 'fresh', cacheStatus: 'fresh', measurementFreshness, payload }
 *     — cache is within 2-minute TTL; measurementFreshness reflects actual station data age
 *   { status: 'stale', cacheStatus: 'stale', measurementFreshness, payload }
 *     — cache is 2–30 minutes old; measurementFreshness reflects actual station data age
 *   { status: 'unavailable' }
 *     — no cache entry, or cache older than 30 min
 *
 * Note: cacheStatus tracks when our server last fetched upstream.
 * measurementFreshness tracks how old the station observations themselves are.
 * A 'fresh' cache can still have 'stale' measurements if stations stopped reporting.
 *
 * Never throws. Safe to call from user-facing routes.
 */
export async function readVegagerdinCurrentFromCache(): Promise<VegagerdinCurrentResult> {
  const row = await readFromCache()
  if (!row) return { status: 'unavailable', reason: 'cache_missing' }

  const payload = row.response_body as VegagerdinCachePayload | null
  if (!payload || payload.source !== 'vegagerdin') return { status: 'unavailable', reason: 'cache_invalid' }

  const fetchedAt = row.fetched_at ?? payload.fetchedAtIso
  if (!fetchedAt || !isCacheWithinStaleWindow(fetchedAt)) return { status: 'unavailable', reason: 'cache_expired' }

  const measurementFreshness = getMeasurementFreshness(payload.oldestMeasuredAtIso)

  if (isCacheFresh(fetchedAt)) {
    return { status: 'fresh' as const, cacheStatus: 'fresh' as const, measurementFreshness, payload }
  }
  return { status: 'stale' as const, cacheStatus: 'stale' as const, measurementFreshness, payload }
}

export type FetchVegagerdinReason =
  | 'http_error'
  | 'fetch_error'
  | 'parse_zero'
  | 'write_failed'

export type FetchVegagerdinResult =
  | { ok: true; payload: VegagerdinCachePayload }
  | { ok: false; reason: FetchVegagerdinReason; shapeInfo?: SafeShapeInfo }

/**
 * Fetches Vegagerðin current measurements from upstream, parses, and caches.
 *
 * IMPORTANT: Do not call this function without explicit approval from Stebbi.
 * External network fetch to gagnaveita.vegagerdin.is requires sign-off.
 *
 * Returns { ok: true, payload } on success (fetch + parse + cache write all succeeded).
 * Returns { ok: false, reason, shapeInfo? } on any failure — never throws.
 *
 * shapeInfo is included on parse_zero to help diagnose unexpected upstream shapes.
 * It contains only structural info (keys, counts), never raw field values or secrets.
 */
export async function fetchVegagerdinCurrent(): Promise<FetchVegagerdinResult> {
  const fetchedAtIso = new Date().toISOString()
  let body: string | null = null

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
    try {
      const res = await fetch(UPSTREAM_URL, {
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      })
      if (!res.ok) {
        console.error(`[vegagerdin] HTTP ${res.status}`)
        return { ok: false, reason: 'http_error' }
      }
      body = await res.text()
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (err) {
    console.error('[vegagerdin] fetch error', err)
    return { ok: false, reason: 'fetch_error' }
  }

  if (!body) return { ok: false, reason: 'fetch_error' }

  const measurements = parseVegagerdinResponse(body, fetchedAtIso)
  if (measurements.length === 0) {
    console.warn('[vegagerdin] parsed 0 measurements from upstream response')
    let shapeInfo: SafeShapeInfo | undefined
    try {
      shapeInfo = buildSafeShapeInfo(JSON.parse(body))
    } catch {
      // ignore — shape info is diagnostic only
    }
    return { ok: false, reason: 'parse_zero', shapeInfo }
  }

  // Compute oldest measuredAt across all measurements (conservative freshness indicator).
  let oldestMeasuredAtIso: string | null = null
  for (const m of measurements) {
    if (!oldestMeasuredAtIso || m.measuredAtIso < oldestMeasuredAtIso) {
      oldestMeasuredAtIso = m.measuredAtIso
    }
  }

  const payload: VegagerdinCachePayload = {
    source: 'vegagerdin',
    endpoint: 'vedur2014_1',
    fetchedAtIso,
    oldestMeasuredAtIso,
    measurements,
  }

  const writeOk = await writeToCache(payload)
  if (!writeOk) {
    return { ok: false, reason: 'write_failed' }
  }

  return { ok: true, payload }
}
