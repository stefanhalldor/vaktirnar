/**
 * Vegagerðin current-measurement provider — server-only.
 *
 * Data source: gagnaveita.vegagerdin.is/api/vedur2014_1
 * Returns current/live weather station measurements, NOT forecast data.
 *
 * Key semantic rules (from Vegagerðin documentation):
 *   Vindhradi  → meanWindMs   (sustained/mean wind speed, current)
 *   Vindhvida  → gustLast10MinMs (max gust last 10 min; NOT a forecast gust)
 *   Vindatt    → windDirectionDeg (0=N, 90=A)
 *   VindattAsc → windDirectionText (Icelandic compass text)
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
 * Response contract and live direction-field types: VERIFIED 2026-07-28
 * against the official documentation and gagnaveita.vegagerdin.is/api/vedur2014_1.
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
const TELEMETRY_CACHE_KEY = 'vegagerdin:vedur2014_1:telemetry'
const UPSTREAM_URL = 'https://gagnaveita.vegagerdin.is/api/vedur2014_1'
const FRESH_TTL_MS = 2 * 60 * 1000       // 2 minutes
const STALE_FALLBACK_MS = 30 * 60 * 1000 // 30 minutes
const UPSTREAM_TIMEOUT_MS = 8_000         // 8 seconds
const HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000  // 24 hours

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
 * Parse the documented numeric direction field without accepting partial
 * numbers or out-of-contract bearings. Both 0 and 360 represent north.
 */
function parseWindDirectionDeg(val: unknown): number | null {
  if (val === null || val === undefined) return null
  const raw = typeof val === 'string' ? val.trim().replace(',', '.') : val
  if (raw === '') return null
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 360 ? parsed : null
}

/** Direction labels must be actual text, never a numeric value stringified. */
function parseWindDirectionText(val: unknown): string | null {
  const text = parseStr(val)
  if (text === null) return null
  const numeric = Number(text.replace(',', '.'))
  return Number.isFinite(numeric) ? null : text
}

function parseWindDirection(raw: VegagerdinRawItem): {
  degrees: number | null
  text: string | null
} {
  // Official contract first. The second operand in each expression is a
  // deliberately narrow fallback for cached/tests based on the old reversed
  // field assumption; numeric input cannot become a label and vice versa.
  return {
    degrees: parseWindDirectionDeg(raw.Vindatt) ?? parseWindDirectionDeg(raw.VindattAsc),
    text: parseWindDirectionText(raw.VindattAsc) ?? parseWindDirectionText(raw.Vindatt),
  }
}

function parseUtcDateParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): string | null {
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second)
  const date = new Date(timestamp)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null
  }
  return date.toISOString()
}

/**
 * Parse the Vegagerðin Dags field to an ISO UTC string.
 *
 * Iceland uses UTC year-round (no DST, UTC+0), so local time = UTC.
 * Supported live formats: Icelandic 'D.M.YYYY HH:mm:ss' and legacy
 * 'YYYY-MM-DD HH:mm:ss'.
 *
 * Falls back to fetchedAtIso if Dags is absent or unparseable.
 * Do NOT rely on new Date(raw.Dags) unless the live format is confirmed ISO.
 */
function parseDags(raw: string | null | undefined, fallbackIso: string): string {
  if (!raw) return fallbackIso
  const trimmed = String(raw).trim()
  if (trimmed === '') return fallbackIso

  // Live responses currently use Icelandic day-month-year timestamps such as
  // "9.8.2026 16:30:00". Date.parse interprets that ambiguously as September
  // 8 in Node, which can turn old measurements into future measurements and
  // suppress stale-data warnings. Parse the documented Icelandic order first.
  const icelandicMatch = trimmed.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  )
  if (icelandicMatch) {
    return parseUtcDateParts(
      Number(icelandicMatch[3]),
      Number(icelandicMatch[2]),
      Number(icelandicMatch[1]),
      Number(icelandicMatch[4]),
      Number(icelandicMatch[5]),
      Number(icelandicMatch[6] ?? 0),
    ) ?? fallbackIso
  }

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
    return []
  }

  const items = extractVegagerdinItems(raw)
  return items ? parseVegagerdinItems(items, fetchedAtIso).measurements : []
}

type VegagerdinRowRejectionCounts = {
  notObject: number
  missingStationId: number
  missingCoordinates: number
}

type ParsedVegagerdinItems = {
  measurements: VegagerdinCurrentMeasurement[]
  rejectedRows: VegagerdinRowRejectionCounts
}

function extractVegagerdinItems(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (Array.isArray(record.results)) return record.results
  if (Array.isArray(record.data)) return record.data
  return null
}

function parseVegagerdinItems(
  items: unknown[],
  fetchedAtIso: string,
): ParsedVegagerdinItems {
  const rejectedRows: VegagerdinRowRejectionCounts = {
    notObject: 0,
    missingStationId: 0,
    missingCoordinates: 0,
  }

  const measurements: VegagerdinCurrentMeasurement[] = []

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      rejectedRows.notObject += 1
      continue
    }
    const r = item as VegagerdinRawItem

    const stationId = parseStationId(r.Nr)
    if (!stationId) {
      rejectedRows.missingStationId += 1
      continue
    }

    const lat = parseNum(r.Breidd)
    const lon = parseNum(r.Lengd)
    if (lat === null || lon === null) {
      rejectedRows.missingCoordinates += 1
      continue
    }

    const measuredAtIso = parseDags(r.Dags, fetchedAtIso)
    const meanWindMs = parseNum(r.Vindhradi)
    const gustLast10MinMs = parseNum(r.Vindhvida)
    const windDirection = parseWindDirection(r)
    const windDirectionDeg = windDirection.degrees
    const windDirectionText = windDirection.text
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

  return { measurements, rejectedRows }
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

type CacheRow = {
  response_body: unknown
  fetched_at: string
}

async function readFromCache(): Promise<CacheRow | null> {
  return readCacheRow(CACHE_KEY)
}

async function readCacheRow(cacheKey: string): Promise<CacheRow | null> {
  try {
    const { data } = await getAdmin()
      .from('weather_cache')
      .select('response_body, fetched_at')
      .eq('cache_key', cacheKey)
      .maybeSingle()
    return data as CacheRow | null
  } catch {
    return null
  }
}

export type VegagerdinFetchTelemetry = {
  lastAttemptedAtIso: string | null
}

/**
 * Read only the latest upstream-attempt timestamp. This metadata is isolated
 * from the successful measurement payload so a failed attempt can never make
 * old observations look newly fetched.
 */
export async function readVegagerdinFetchTelemetry(): Promise<VegagerdinFetchTelemetry> {
  const row = await readCacheRow(TELEMETRY_CACHE_KEY)
  if (!row?.response_body || typeof row.response_body !== 'object') {
    return { lastAttemptedAtIso: null }
  }
  const attemptedAt = (row.response_body as Record<string, unknown>).lastAttemptedAtIso
  if (typeof attemptedAt !== 'string' || !Number.isFinite(Date.parse(attemptedAt))) {
    return { lastAttemptedAtIso: null }
  }
  return { lastAttemptedAtIso: new Date(Date.parse(attemptedAt)).toISOString() }
}

/** Record an actual outbound attempt without changing successful data/cache age. */
export async function recordVegagerdinFetchAttempt(attemptedAtIso: string): Promise<boolean> {
  const attemptedAtMs = Date.parse(attemptedAtIso)
  if (!Number.isFinite(attemptedAtMs)) return false
  const normalizedAttemptedAtIso = new Date(attemptedAtMs).toISOString()
  try {
    const expiresAt = new Date(attemptedAtMs + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await getAdmin()
      .from('weather_cache')
      .upsert(
        {
          cache_key: TELEMETRY_CACHE_KEY,
          response_body: {
            source: 'vegagerdin',
            endpoint: 'vedur2014_1',
            lastAttemptedAtIso: normalizedAttemptedAtIso,
          },
          expires_at: expiresAt,
          last_modified: null,
          fetched_at: normalizedAttemptedAtIso,
          updated_at: normalizedAttemptedAtIso,
        },
        { onConflict: 'cache_key' },
      )
    if (error) {
      console.error('[vegagerdin] attempt telemetry write failed')
      return false
    }
    return true
  } catch {
    console.error('[vegagerdin] attempt telemetry write failed (exception)')
    return false
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
const MEASUREMENT_FUTURE_TOLERANCE_MS = 5 * 60 * 1000

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
  if (ageMs < -MEASUREMENT_FUTURE_TOLERANCE_MS) return 'unknown'
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

export type VegagerdinResponseBodyKind = 'json' | 'xml' | 'html' | 'empty' | 'other'

export type SafeFetchDiagnostics = {
  status: number
  contentType: string | null
  contentEncoding: string | null
  contentLength: number | null
  bodyBytes?: number
  responseDate: string | null
  age: string | null
  etag: string | null
  lastModified: string | null
  cacheControl: string | null
  bodyKind?: VegagerdinResponseBodyKind
  inputRowCount?: number
  acceptedRowCount?: number
  rejectedRowCount?: number
  rejectedRows?: VegagerdinRowRejectionCounts
  shapeInfo?: SafeShapeInfo
}

function safeHeader(headers: Headers, name: string): string | null {
  const value = headers.get(name)
  return value ? value.slice(0, 256) : null
}

function safeContentLength(headers: Headers): number | null {
  const value = headers.get('content-length')
  if (!value) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function responseDiagnostics(response: Response): SafeFetchDiagnostics {
  return {
    status: response.status,
    contentType: safeHeader(response.headers, 'content-type'),
    contentEncoding: safeHeader(response.headers, 'content-encoding'),
    contentLength: safeContentLength(response.headers),
    responseDate: safeHeader(response.headers, 'date'),
    age: safeHeader(response.headers, 'age'),
    etag: safeHeader(response.headers, 'etag'),
    lastModified: safeHeader(response.headers, 'last-modified'),
    cacheControl: safeHeader(response.headers, 'cache-control'),
  }
}

function responseBodyKind(body: string, contentType: string | null): VegagerdinResponseBodyKind {
  const trimmed = body.trimStart()
  if (trimmed === '') return 'empty'
  const normalizedContentType = contentType?.toLowerCase() ?? ''
  if (normalizedContentType.includes('html') || /^<!doctype\s+html|^<html[\s>]/i.test(trimmed)) {
    return 'html'
  }
  if (normalizedContentType.includes('xml') || trimmed.startsWith('<')) return 'xml'
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return 'json'
  return 'other'
}

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase()
  return mediaType === 'application/json' || mediaType.endsWith('+json')
}

function logRejectedUpstreamResponse(
  reason: FetchVegagerdinReason,
  diagnostics: SafeFetchDiagnostics,
): void {
  console.warn('[vegagerdin] upstream response rejected', { reason, diagnostics })
}

export type VegagerdinUnavailableReason = 'cache_missing' | 'cache_expired' | 'cache_invalid'

export type VegagerdinCurrentResult =
  | { status: 'fresh'; cacheStatus: 'fresh'; measurementFreshness: MeasurementFreshness; payload: VegagerdinCachePayload }
  | { status: 'stale'; cacheStatus: 'stale' | 'history_fallback'; measurementFreshness: MeasurementFreshness; payload: VegagerdinCachePayload }
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

/** Shape of a row from vegagerdin_measurements_history (select subset). */
export type VegagerdinHistoryDbRow = {
  station_id: string
  measured_at: string
  station_name: string
  lat: number
  lon: number
  mean_wind_ms: number | null
  gust_last_10_min_ms: number | null
  wind_direction_deg: number | null
  wind_direction_text: string | null
  air_temperature_c: number | null
  road_temperature_c: number | null
  data_quality: 'complete' | 'partial'
  fetched_at: string
  last_fetched_at: string
}

/**
 * Build a VegagerdinCachePayload from history rows.
 *
 * Deduplicates by station_id (keeps newest measured_at per station).
 * Returns null if rows is empty.
 * Exported for unit testing.
 */
export function buildPayloadFromHistoryRows(
  rows: VegagerdinHistoryDbRow[],
): VegagerdinCachePayload | null {
  if (rows.length === 0) return null

  // Keep newest measured_at per station
  const byStation = new Map<string, VegagerdinHistoryDbRow>()
  for (const row of rows) {
    const existing = byStation.get(row.station_id)
    if (!existing || row.measured_at > existing.measured_at) {
      byStation.set(row.station_id, row)
    }
  }

  const deduped = Array.from(byStation.values())
  let oldestMeasuredAtIso: string | null = null
  // Use the newest last_fetched_at as fetchedAtIso: represents when this batch was last confirmed.
  let newestLastFetchedAtIso: string | null = null

  const measurements: VegagerdinCurrentMeasurement[] = deduped.map(row => {
    if (!oldestMeasuredAtIso || row.measured_at < oldestMeasuredAtIso) {
      oldestMeasuredAtIso = row.measured_at
    }
    if (!newestLastFetchedAtIso || row.last_fetched_at > newestLastFetchedAtIso) {
      newestLastFetchedAtIso = row.last_fetched_at
    }
    return {
      source: 'vegagerdin' as const,
      stationId: row.station_id,
      stationName: row.station_name,
      lat: row.lat,
      lon: row.lon,
      measuredAtIso: row.measured_at,
      fetchedAtIso: row.fetched_at,
      meanWindMs: row.mean_wind_ms,
      gustLast10MinMs: row.gust_last_10_min_ms,
      windDirectionDeg: row.wind_direction_deg,
      windDirectionText: row.wind_direction_text,
      airTemperatureC: row.air_temperature_c,
      roadTemperatureC: row.road_temperature_c,
      dataQuality: row.data_quality,
    }
  })

  return {
    source: 'vegagerdin',
    endpoint: 'vedur2014_1',
    // fetchedAtIso at payload level = newest last_fetched_at (when this batch was last confirmed)
    fetchedAtIso: newestLastFetchedAtIso ?? new Date().toISOString(),
    oldestMeasuredAtIso,
    measurements,
  }
}

/**
 * Upsert a batch of measurements into vegagerdin_measurements_history.
 * Non-throwing. Returns { ok: false } on any DB error.
 * first_fetched_at is NOT included in the row object so the DB DEFAULT
 * fires on first insert and is preserved (not overwritten) on conflict.
 */
async function upsertVegagerdinHistory(
  measurements: VegagerdinCurrentMeasurement[],
  fetchedAtIso: string,
): Promise<{ ok: boolean }> {
  if (measurements.length === 0) return { ok: true }
  try {
    const rows = measurements.map(m => ({
      station_id: m.stationId,
      measured_at: m.measuredAtIso,
      station_name: m.stationName,
      lat: m.lat,
      lon: m.lon,
      mean_wind_ms: m.meanWindMs,
      gust_last_10_min_ms: m.gustLast10MinMs,
      wind_direction_deg: m.windDirectionDeg,
      wind_direction_text: m.windDirectionText,
      air_temperature_c: m.airTemperatureC,
      road_temperature_c: m.roadTemperatureC,
      data_quality: m.dataQuality,
      fetched_at: fetchedAtIso,
      last_fetched_at: fetchedAtIso,
    }))
    const { error } = await getAdmin()
      .from('vegagerdin_measurements_history')
      .upsert(rows, { onConflict: 'station_id,measured_at' })
    if (error) {
      console.error('[vegagerdin] history upsert failed', error.message)
      return { ok: false }
    }
    return { ok: true }
  } catch (err) {
    console.error('[vegagerdin] history upsert exception', err)
    return { ok: false }
  }
}

/**
 * Read the most recent batch from vegagerdin_measurements_history.
 *
 * Finds the newest last_fetched_at within the 24-hour window, then fetches all
 * rows from that exact fetch batch.
 * Returns unavailable if no history exists or history is too old.
 * Never throws.
 */
async function readVegagerdinCurrentFromHistory(): Promise<VegagerdinCurrentResult> {
  try {
    // No age cutoff: always return the newest available history batch regardless of age.
    // Vegagerðin is always gray otherwise when the cache is expired and cron is delayed.
    // measurementFreshness on the payload indicates to the UI how old the data is.
    const { data: newestRow, error: newestError } = await getAdmin()
      .from('vegagerdin_measurements_history')
      .select('last_fetched_at')
      .order('last_fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (newestError || !newestRow) {
      return { status: 'unavailable', reason: 'cache_missing' }
    }

    // Exact batch match: all rows in a batch share the same last_fetched_at
    // (upsertVegagerdinHistory sets the same fetchedAtIso on every row in one call).
    const { data: rows, error: rowsError } = await getAdmin()
      .from('vegagerdin_measurements_history')
      .select('station_id, measured_at, station_name, lat, lon, mean_wind_ms, gust_last_10_min_ms, wind_direction_deg, wind_direction_text, air_temperature_c, road_temperature_c, data_quality, fetched_at, last_fetched_at')
      .eq('last_fetched_at', newestRow.last_fetched_at)

    if (rowsError || !rows || rows.length === 0) {
      return { status: 'unavailable', reason: 'cache_missing' }
    }

    const payload = buildPayloadFromHistoryRows(rows as VegagerdinHistoryDbRow[])
    if (!payload) return { status: 'unavailable', reason: 'cache_missing' }

    const measurementFreshness = getMeasurementFreshness(payload.oldestMeasuredAtIso)
    return { status: 'stale', cacheStatus: 'history_fallback', measurementFreshness, payload }
  } catch {
    return { status: 'unavailable', reason: 'cache_missing' }
  }
}

/**
 * Reads Vegagerðin current measurements: cache first, history fallback.
 *
 * Returns a fresh or stale cache result if available.
 * Falls back to the history table if the cache is missing or expired.
 * History fallback result has cacheStatus: 'history_fallback' and status: 'stale'.
 *
 * Never throws. Safe to call from user-facing routes.
 */
export async function readVegagerdinCurrentWithHistoryFallback(): Promise<VegagerdinCurrentResult> {
  const cacheResult = await readVegagerdinCurrentFromCache()
  if (cacheResult.status !== 'unavailable') return cacheResult
  return readVegagerdinCurrentFromHistory()
}

/**
 * Look up a single Vegagerðin station measurement by stationId.
 *
 * Uses history fallback so station identity is preserved even when the
 * short-lived weather_cache row is expired or missing.
 *
 * Returns null if the cache+history is unavailable or the stationId is not found.
 * Never throws.
 */
export async function findVegagerdinCurrentMeasurementByStationId(
  stationId: string,
): Promise<VegagerdinCurrentMeasurement | null> {
  const result = await readVegagerdinCurrentWithHistoryFallback()
  if (result.status === 'unavailable') return null
  return result.payload.measurements.find(m => m.stationId === stationId) ?? null
}

export type FetchVegagerdinReason =
  | 'http_error'
  | 'fetch_error'
  | 'empty_dataset'
  | 'unexpected_content_type'
  | 'invalid_json'
  | 'unexpected_shape'
  | 'all_rows_rejected'
  | 'write_failed'

export type FetchVegagerdinResult =
  | { ok: true; payload: VegagerdinCachePayload; historyStatus: 'ok' | 'failed' }
  | { ok: false; reason: FetchVegagerdinReason; diagnostics?: SafeFetchDiagnostics }

/**
 * Fetches Vegagerðin current measurements from upstream, parses, and caches.
 *
 * IMPORTANT: Do not call this function without explicit approval from Stebbi.
 * External network fetch to gagnaveita.vegagerdin.is requires sign-off.
 *
 * Returns { ok: true, payload } on success (fetch + parse + cache write all succeeded).
 * Returns { ok: false, reason, diagnostics? } on any failure — never throws.
 *
 * Diagnostics contain only allowlisted response metadata, structural keys and
 * counts. They never contain raw field values, station names, coordinates or secrets.
 */
export async function fetchVegagerdinCurrent(): Promise<FetchVegagerdinResult> {
  const fetchedAtIso = new Date().toISOString()
  let response: Response

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
    try {
      response = await fetch(UPSTREAM_URL, {
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      })
    } finally {
      clearTimeout(timeoutId)
    }
  } catch {
    console.error('[vegagerdin] fetch failed')
    return { ok: false, reason: 'fetch_error' }
  }

  const baseDiagnostics = responseDiagnostics(response)
  if (!response.ok) {
    logRejectedUpstreamResponse('http_error', baseDiagnostics)
    return { ok: false, reason: 'http_error', diagnostics: baseDiagnostics }
  }

  let body: string
  try {
    body = await response.text()
  } catch {
    console.error('[vegagerdin] response body read failed')
    return { ok: false, reason: 'fetch_error', diagnostics: baseDiagnostics }
  }

  const diagnostics: SafeFetchDiagnostics = {
    ...baseDiagnostics,
    bodyBytes: new TextEncoder().encode(body).byteLength,
    bodyKind: responseBodyKind(body, baseDiagnostics.contentType),
  }

  if (!isJsonContentType(diagnostics.contentType)) {
    logRejectedUpstreamResponse('unexpected_content_type', diagnostics)
    return { ok: false, reason: 'unexpected_content_type', diagnostics }
  }

  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    logRejectedUpstreamResponse('invalid_json', diagnostics)
    return { ok: false, reason: 'invalid_json', diagnostics }
  }

  diagnostics.shapeInfo = buildSafeShapeInfo(raw)
  const items = extractVegagerdinItems(raw)
  if (!items) {
    logRejectedUpstreamResponse('unexpected_shape', diagnostics)
    return { ok: false, reason: 'unexpected_shape', diagnostics }
  }

  diagnostics.inputRowCount = items.length
  if (items.length === 0) {
    logRejectedUpstreamResponse('empty_dataset', diagnostics)
    return { ok: false, reason: 'empty_dataset', diagnostics }
  }

  const parsed = parseVegagerdinItems(items, fetchedAtIso)
  diagnostics.acceptedRowCount = parsed.measurements.length
  diagnostics.rejectedRowCount = items.length - parsed.measurements.length
  diagnostics.rejectedRows = parsed.rejectedRows
  const measurements = parsed.measurements

  if (measurements.length === 0) {
    logRejectedUpstreamResponse('all_rows_rejected', diagnostics)
    return { ok: false, reason: 'all_rows_rejected', diagnostics }
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

  // Non-blocking history upsert; failure is logged but does not fail the fetch.
  const historyResult = await upsertVegagerdinHistory(measurements, fetchedAtIso)

  return { ok: true, payload, historyStatus: historyResult.ok ? 'ok' : 'failed' }
}
