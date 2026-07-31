import 'server-only'

import { getAdmin } from '@/lib/supabase/admin'
import { ROAD_MAP_PLACES, type RoadMapPlace } from '@/lib/road-intelligence/roadMapPlaces'
import { VEDURSTOFAN_STATIONS_REGISTRY } from '@/lib/weather/providers/vedurstofanStationsRegistry'
import { fetchForecastSnapshot } from '@/lib/weather/metno.server'
import type { HourPoint } from '@/lib/weather/types'
import type {
  WeatherChaseHistoryItemRequest,
  WeatherChaseHistoryResponse,
  WeatherChaseHistoryRow,
} from './weatherChaseHistory.types'

const HISTORY_RETENTION_DAYS = 14
const PAGE_SIZE = 1_000
const METNO_TARGET_TYPE = 'road_map_place'

type VedurstofanDbRow = {
  station_id: string
  atime: string | null
  forecast_time: string
  wind_speed_ms: number | null
  wind_direction_text: string | null
  temperature_c: number | null
  precipitation_mm_per_hour: number | null
  weather_text: string | null
}

type MetnoDbRow = {
  target_id: string
  metno_updated_at: string
  forecast_time: string
  wind_speed_ms: number | null
  wind_direction_deg: number | null
  temperature_c: number | null
  precipitation_mm_per_hour: number | null
  weather_symbol_code: string | null
}

function utcDay(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

function dayBounds(day: string): { fromIso: string; toIso: string } {
  return {
    fromIso: `${day}T00:00:00.000Z`,
    toIso: `${day}T23:59:59.999Z`,
  }
}

export function weatherChaseHistoryRangeBounds(
  fromDay: string,
  throughDay = utcDay(),
): { fromIso: string; toIso: string } {
  return {
    fromIso: dayBounds(fromDay).fromIso,
    toIso: dayBounds(throughDay).toIso,
  }
}

function degreesToIcelandicDirection(degrees: number | null): string | null {
  if (degrees === null || !Number.isFinite(degrees)) return null
  const directions = ['N', 'NA', 'A', 'SA', 'S', 'SV', 'V', 'NV']
  return directions[Math.round((((degrees % 360) + 360) % 360) / 45) % 8]
}

function validMetric(value: number | null): value is number {
  return value !== null && Number.isFinite(value)
}

export function selectLatestIssuedForecastRows<T extends { forecast_time: string }>(
  rows: T[],
  itemKey: (row: T) => string,
  cycleIso: (row: T) => string | null,
): Map<string, T[]> {
  const chosen = new Map<string, T>()
  for (const row of rows) {
    const validMs = Date.parse(row.forecast_time)
    const cycle = cycleIso(row)
    const cycleMs = cycle ? Date.parse(cycle) : NaN
    if (!Number.isFinite(validMs) || !Number.isFinite(cycleMs) || cycleMs > validMs) continue
    const key = `${itemKey(row)}:${row.forecast_time}`
    const previous = chosen.get(key)
    const previousCycle = previous ? cycleIso(previous) : null
    if (!previous || !previousCycle || Date.parse(previousCycle) < cycleMs) chosen.set(key, row)
  }
  const grouped = new Map<string, T[]>()
  for (const row of chosen.values()) {
    const key = itemKey(row)
    const existing = grouped.get(key)
    if (existing) existing.push(row)
    else grouped.set(key, [row])
  }
  for (const rowsForItem of grouped.values()) {
    rowsForItem.sort((a, b) => Date.parse(a.forecast_time) - Date.parse(b.forecast_time))
  }
  return grouped
}

async function readPagedRows<T>(build: (from: number, to: number) => PromiseLike<{
  data: unknown
  error: unknown
}>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1)
    if (error || !Array.isArray(data)) throw new Error('weather_history_query_failed')
    rows.push(...data as T[])
    if (data.length < PAGE_SIZE) break
  }
  return rows
}

function vedurstofanHistoryRow(row: VedurstofanDbRow): WeatherChaseHistoryRow | null {
  if (!validMetric(row.wind_speed_ms) || !validMetric(row.temperature_c)) return null
  return {
    timeIso: row.forecast_time,
    temperatureC: row.temperature_c,
    windSpeedMs: row.wind_speed_ms,
    windGustMs: row.wind_speed_ms,
    precipitationMmPerHour: row.precipitation_mm_per_hour ?? 0,
    windDirectionText: row.wind_direction_text,
    weatherText: row.weather_text,
    symbolCode: null,
  }
}

function metnoHistoryRow(row: MetnoDbRow): WeatherChaseHistoryRow | null {
  if (!validMetric(row.wind_speed_ms) || !validMetric(row.temperature_c)) return null
  return {
    timeIso: row.forecast_time,
    temperatureC: row.temperature_c,
    windSpeedMs: row.wind_speed_ms,
    windGustMs: row.wind_speed_ms,
    precipitationMmPerHour: row.precipitation_mm_per_hour ?? 0,
    windDirectionText: degreesToIcelandicDirection(row.wind_direction_deg),
    weatherText: null,
    symbolCode: row.weather_symbol_code,
  }
}

export async function fetchRoadMapPlaceMetnoForecast(
  place: Pick<RoadMapPlace, 'lat' | 'lon'>,
): Promise<HourPoint[]> {
  const snapshot = await fetchForecastSnapshot(place.lat, place.lon)
  return snapshot.forecasts
}

export async function fetchAndProjectRoadMapPlaceMetnoHistory(
  place: RoadMapPlace,
  options: { requireHistoryWrite?: boolean } = {},
): Promise<HourPoint[]> {
  const snapshot = await fetchForecastSnapshot(place.lat, place.lon)
  const forecasts = snapshot.forecasts
  const cycleIso = snapshot.updatedAtIso
  const fetchedAtIso = new Date().toISOString()
  const rows = forecasts
    .filter(forecast => {
      const date = new Date(forecast.time)
      return Number.isFinite(date.getTime()) && date.getUTCMinutes() === 0 && date.getUTCHours() % 3 === 0
    })
    .map(forecast => ({
      target_type: METNO_TARGET_TYPE,
      target_id: place.id,
      target_name: place.name,
      target_lat: place.lat,
      target_lon: place.lon,
      metno_updated_at: cycleIso,
      forecast_time: forecast.time,
      paired_provider: null,
      paired_provider_cycle_time: null,
      wind_speed_ms: forecast.windSpeedMs,
      wind_direction_deg: forecast.windFromDegrees,
      temperature_c: forecast.airTemperatureC,
      precipitation_mm_per_hour: forecast.precipitationMmPerHour,
      weather_symbol_code: forecast.symbolCode,
      metno_cache_key: `road-map-place:${place.id}`,
      expires_at: null,
      last_fetched_at: fetchedAtIso,
    }))

  if (rows.length > 0) {
    try {
      const { error } = await getAdmin()
        .from('metno_point_forecasts_history')
        .upsert(rows, {
          onConflict: 'target_type,target_id,metno_updated_at,forecast_time',
        })
      if (error) {
        if (options.requireHistoryWrite) throw new Error('metno_history_write_failed')
        console.warn('[weather-chase-history] met.no history projection unavailable')
      }
    } catch {
      if (options.requireHistoryWrite) throw new Error('metno_history_write_failed')
      console.warn('[weather-chase-history] met.no history projection unavailable')
    }
  }

  return forecasts
}

export async function projectRoadMapPlaceMetnoHistory(
  place: RoadMapPlace,
  options: { requireHistoryWrite?: boolean } = {},
): Promise<WeatherChaseHistoryRow[]> {
  const forecasts = await fetchAndProjectRoadMapPlaceMetnoHistory(place, options)
  return roadMapPlaceMetnoRows(forecasts)
}

function roadMapPlaceMetnoRows(forecasts: HourPoint[]): WeatherChaseHistoryRow[] {
  return forecasts.map(forecast => ({
    timeIso: forecast.time,
    temperatureC: forecast.airTemperatureC,
    windSpeedMs: forecast.windSpeedMs,
    windGustMs: forecast.windGustMs,
    precipitationMmPerHour: forecast.precipitationMmPerHour,
    windDirectionText: degreesToIcelandicDirection(forecast.windFromDegrees),
    weatherText: null,
    symbolCode: forecast.symbolCode,
  }))
}

export async function pruneMetnoRoadMapPlaceHistory(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1_000).toISOString()
  const { error } = await getAdmin()
    .from('metno_point_forecasts_history')
    .delete()
    .eq('target_type', METNO_TARGET_TYPE)
    .lt('forecast_time', cutoff)
  if (error) throw new Error('metno_history_prune_failed')
}

export async function warmAllRoadMapPlaceMetnoHistory(): Promise<{
  total: number
  succeeded: number
  failed: number
}> {
  let succeeded = 0
  let failed = 0
  const batchSize = 5
  for (let index = 0; index < ROAD_MAP_PLACES.length; index += batchSize) {
    const batch = ROAD_MAP_PLACES.slice(index, index + batchSize)
    const results = await Promise.allSettled(batch.map(place => (
      projectRoadMapPlaceMetnoHistory(place, { requireHistoryWrite: true })
    )))
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.length > 0) succeeded += 1
      else failed += 1
    }
  }
  await pruneMetnoRoadMapPlaceHistory()
  return { total: ROAD_MAP_PLACES.length, succeeded, failed }
}

async function earliestForecastDay(
  vedurstofanIds: string[],
  metnoIds: string[],
  today: string,
): Promise<string> {
  const candidates: string[] = []
  const admin = getAdmin()
  if (vedurstofanIds.length > 0) {
    const { data, error } = await admin
      .from('vedurstofan_forecasts_history')
      .select('forecast_time')
      .in('station_id', vedurstofanIds)
      .order('forecast_time', { ascending: true })
      .limit(1)
    if (error) throw new Error('weather_history_range_failed')
    const value = Array.isArray(data) ? data[0]?.forecast_time : null
    if (typeof value === 'string') candidates.push(value.slice(0, 10))
  }
  if (metnoIds.length > 0) {
    const { data, error } = await admin
      .from('metno_point_forecasts_history')
      .select('forecast_time')
      .eq('target_type', METNO_TARGET_TYPE)
      .in('target_id', metnoIds)
      .order('forecast_time', { ascending: true })
      .limit(1)
    if (error) throw new Error('weather_history_range_failed')
    const value = Array.isArray(data) ? data[0]?.forecast_time : null
    if (typeof value === 'string') candidates.push(value.slice(0, 10))
  }
  const retainedFrom = utcDay(new Date(Date.parse(`${today}T00:00:00.000Z`) - HISTORY_RETENTION_DAYS * 86_400_000))
  const earliest = candidates.sort()[0] ?? today
  return earliest < retainedFrom ? retainedFrom : earliest
}

export async function readWeatherChaseHistory(input: {
  day: string
  items: WeatherChaseHistoryItemRequest[]
}): Promise<WeatherChaseHistoryResponse> {
  const today = utcDay()
  // `day` is the inclusive start of the retained window. A single response
  // stays continuous through today and also includes the providers' current
  // rows, which may extend beyond today into the forecast horizon.
  const { fromIso, toIso } = weatherChaseHistoryRangeBounds(input.day, today)
  const vedurstofanIds = input.items
    .filter(item => item.providerId === 'vedurstofan')
    .map(item => item.id.slice('vedurstofan:'.length))
  const metnoIds = input.items
    .filter(item => item.providerId === 'metno')
    .map(item => item.id.slice('metno:'.length))
  const rowsByItemId: Record<string, WeatherChaseHistoryRow[]> = Object.fromEntries(
    input.items.map(item => [item.id, []]),
  )
  const admin = getAdmin()

  if (vedurstofanIds.length > 0) {
    const historyRows = await readPagedRows<VedurstofanDbRow>((from, to) => admin
      .from('vedurstofan_forecasts_history')
      .select('station_id, atime, forecast_time, wind_speed_ms, wind_direction_text, temperature_c, precipitation_mm_per_hour, weather_text')
      .in('station_id', vedurstofanIds)
      .gte('forecast_time', fromIso)
      .lte('forecast_time', toIso)
      .order('station_id')
      .order('atime')
      .order('forecast_time')
      .range(from, to))
    const chosen = selectLatestIssuedForecastRows(historyRows, row => row.station_id, row => row.atime)
    for (const stationId of vedurstofanIds) {
      rowsByItemId[`vedurstofan:${stationId}`] = (chosen.get(stationId) ?? [])
        .map(vedurstofanHistoryRow)
        .filter((row): row is WeatherChaseHistoryRow => row !== null)
    }

    const latestRows = await readPagedRows<VedurstofanDbRow>((from, to) => admin
      .from('vedurstofan_forecasts_latest')
      .select('station_id, atime, forecast_time, wind_speed_ms, wind_direction_text, temperature_c, precipitation_mm_per_hour, weather_text')
      .in('station_id', vedurstofanIds)
      .order('station_id')
      .order('forecast_time')
      .range(from, to))
    const latestIssuedRows = selectLatestIssuedForecastRows(
      latestRows,
      row => row.station_id,
      row => row.atime,
    )
    for (const stationId of vedurstofanIds) {
      const current = (latestIssuedRows.get(stationId) ?? [])
        .map(vedurstofanHistoryRow)
        .filter((row): row is WeatherChaseHistoryRow => row !== null)
      rowsByItemId[`vedurstofan:${stationId}`] = mergeRows(
        rowsByItemId[`vedurstofan:${stationId}`],
        current,
      )
    }
  }

  if (metnoIds.length > 0) {
    const currentRows = new Map<string, WeatherChaseHistoryRow[]>()
    await Promise.all(metnoIds.map(async placeId => {
      const place = ROAD_MAP_PLACES.find(candidate => candidate.id === placeId)
      if (!place) return
      const forecasts = await fetchRoadMapPlaceMetnoForecast(place).catch(() => [])
      const rows = roadMapPlaceMetnoRows(forecasts)
      currentRows.set(placeId, rows)
    }))
    const historyRows = await readPagedRows<MetnoDbRow>((from, to) => admin
      .from('metno_point_forecasts_history')
      .select('target_id, metno_updated_at, forecast_time, wind_speed_ms, wind_direction_deg, temperature_c, precipitation_mm_per_hour, weather_symbol_code')
      .eq('target_type', METNO_TARGET_TYPE)
      .in('target_id', metnoIds)
      .gte('forecast_time', fromIso)
      .lte('forecast_time', toIso)
      .order('target_id')
      .order('forecast_time')
      .order('metno_updated_at')
      .range(from, to))
    const chosen = selectLatestIssuedForecastRows(historyRows, row => row.target_id, row => row.metno_updated_at)
    for (const placeId of metnoIds) {
      const history = (chosen.get(placeId) ?? [])
        .map(metnoHistoryRow)
        .filter((row): row is WeatherChaseHistoryRow => row !== null)
      rowsByItemId[`metno:${placeId}`] = mergeRows(history, currentRows.get(placeId) ?? [])
    }
  }

  const availableFromDay = await earliestForecastDay(vedurstofanIds, metnoIds, today)
  const allTimes = Object.values(rowsByItemId).flat().map(row => row.timeIso.slice(0, 10)).sort()
  return {
    status: 'ok',
    requestedDay: input.day,
    availableFromDay,
    availableToDay: allTimes.at(-1) ?? today,
    rowsByItemId,
  }
}

function mergeRows(
  older: WeatherChaseHistoryRow[] | undefined,
  preferred: WeatherChaseHistoryRow[],
): WeatherChaseHistoryRow[] {
  const byTime = new Map<string, WeatherChaseHistoryRow>()
  for (const row of older ?? []) byTime.set(row.timeIso, row)
  for (const row of preferred) byTime.set(row.timeIso, row)
  return [...byTime.values()].sort((a, b) => Date.parse(a.timeIso) - Date.parse(b.timeIso))
}

export function validateWeatherChaseHistoryRequest(value: unknown): {
  day: string
  items: WeatherChaseHistoryItemRequest[]
} | null {
  if (!value || typeof value !== 'object') return null
  const input = value as { day?: unknown; items?: unknown }
  if (typeof input.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.day)) return null
  const dayMs = Date.parse(`${input.day}T00:00:00.000Z`)
  const todayMs = Date.parse(`${utcDay()}T00:00:00.000Z`)
  if (
    !Number.isFinite(dayMs)
    || utcDay(new Date(dayMs)) !== input.day
    || dayMs > todayMs
    || dayMs < todayMs - HISTORY_RETENTION_DAYS * 86_400_000
  ) return null
  if (!Array.isArray(input.items) || input.items.length === 0 || input.items.length > 7) return null
  const knownVedurstofanIds = new Set(VEDURSTOFAN_STATIONS_REGISTRY.flatMap(station => station.stationId ? [station.stationId] : []))
  const knownMetnoIds = new Set(ROAD_MAP_PLACES.map(place => place.id))
  const seen = new Set<string>()
  const items: WeatherChaseHistoryItemRequest[] = []
  for (const item of input.items) {
    if (!item || typeof item !== 'object') return null
    const candidate = item as { id?: unknown; providerId?: unknown }
    if (typeof candidate.id !== 'string' || seen.has(candidate.id)) return null
    if (candidate.providerId === 'vedurstofan') {
      const stationId = candidate.id.startsWith('vedurstofan:')
        ? candidate.id.slice('vedurstofan:'.length)
        : ''
      if (!knownVedurstofanIds.has(stationId)) return null
    } else if (candidate.providerId === 'metno') {
      const placeId = candidate.id.startsWith('metno:') ? candidate.id.slice(6) : ''
      if (!knownMetnoIds.has(placeId)) return null
    } else {
      return null
    }
    seen.add(candidate.id)
    items.push({ id: candidate.id, providerId: candidate.providerId })
  }
  return { day: input.day, items }
}
