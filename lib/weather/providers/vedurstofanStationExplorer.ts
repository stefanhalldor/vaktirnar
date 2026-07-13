/**
 * Pure data helper for the Veðurstofan station explorer (Phase 2B1).
 *
 * Merges authoritative registry metadata with live/cached fetch results into a
 * client-safe response payload. No network calls, no Supabase access.
 *
 * Safe to import types from client components (no server-only deps).
 */
import type { VedurstofanStationRegistryEntry } from './vedurstofanStationsRegistry'
import type { VedurstofanStationResult } from './vedurstofan.server'

const SERVICE_URL =
  'https://xmlweather.vedur.is/?op_w=xml&type=forec&lang=is&view=xml&time=3h&params=F;D;T;R;W'

export type StationExplorerStation = {
  stationId: string
  stationName: string
  owner: string | null
  lat: number
  lon: number
  mappingStatus: string
  status: 'ok' | 'stale' | 'unavailable'
  atimeIso: string | null
  fetchedAtIso: string | null
  expiresAtIso: string | null
  forecastCount: number
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

export type StationExplorerResponse = {
  generatedAtIso: string
  attribution: {
    provider: 'Veðurstofa Íslands'
    serviceUrl: string
  }
  summary: {
    total: number
    ok: number
    stale: number
    unavailable: number
  }
  stations: StationExplorerStation[]
}

export function buildStationExplorerResponse(
  stations: readonly VedurstofanStationRegistryEntry[],
  results: Map<string, VedurstofanStationResult>,
): StationExplorerResponse {
  // Only include stations with coordinates and a stationId in the response
  const mappable = stations.filter(
    (s): s is VedurstofanStationRegistryEntry & { lat: number; lon: number; stationId: string } =>
      s.lat !== null && s.lon !== null && s.stationId !== null,
  )

  const stationList: StationExplorerStation[] = mappable.map(s => {
    const result = results.get(s.stationId)
    if (!result || result.status === 'unavailable') {
      return {
        stationId: s.stationId,
        stationName: s.name,
        owner: s.owner,
        lat: s.lat,
        lon: s.lon,
        mappingStatus: s.mappingStatus,
        status: 'unavailable',
        atimeIso: null,
        fetchedAtIso: null,
        expiresAtIso: null,
        forecastCount: 0,
        forecasts: [],
        parseErrors: [],
      }
    }
    const { payload } = result
    return {
      stationId: s.stationId,
      stationName: s.name,
      owner: s.owner,
      lat: s.lat,
      lon: s.lon,
      mappingStatus: s.mappingStatus,
      status: result.status,
      atimeIso: payload.atimeIso,
      fetchedAtIso: payload.fetchedAtIso,
      expiresAtIso: payload.expiresAtIso,
      forecastCount: payload.forecasts.length,
      forecasts: payload.forecasts,
      parseErrors: payload.parseErrors,
    }
  })

  return {
    generatedAtIso: new Date().toISOString(),
    attribution: { provider: 'Veðurstofa Íslands', serviceUrl: SERVICE_URL },
    summary: {
      total: stationList.length,
      ok: stationList.filter(s => s.status === 'ok').length,
      stale: stationList.filter(s => s.status === 'stale').length,
      unavailable: stationList.filter(s => s.status === 'unavailable').length,
    },
    stations: stationList,
  }
}
