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
  stationType: string | null
  wmoNumber: string | null
  abbreviation: string
  forecastAreaName: string | null
  forecastAreaCode: string | null
  owner: string | null
  /** WGS84 latitude — null if no coordinates on the official page */
  lat: number | null
  /** WGS84 longitude (negative for Iceland) — null if no coordinates */
  lon: number | null
  coordinatesRaw: string | null
  elevationM: number | null
  startYear: number | null
  sourceUrl: string
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
  // Include all registry stations. Stations without stationId cannot have cache data
  // but still appear in the list. The map layer filters on lat/lon.
  const stationList: StationExplorerStation[] = stations.map(s => {
    const cacheResult = s.stationId ? results.get(s.stationId) : undefined
    const base = {
      stationId: s.stationId ?? '',
      stationName: s.name,
      stationType: s.stationType,
      wmoNumber: s.wmoNumber,
      abbreviation: s.abbreviation,
      forecastAreaName: s.forecastAreaName,
      forecastAreaCode: s.forecastAreaCode,
      owner: s.owner,
      lat: s.lat,
      lon: s.lon,
      coordinatesRaw: s.coordinatesRaw,
      elevationM: s.elevationM,
      startYear: s.startYear,
      sourceUrl: s.sourceUrl,
      mappingStatus: s.mappingStatus,
    }
    if (!cacheResult || cacheResult.status === 'unavailable') {
      return {
        ...base,
        status: 'unavailable' as const,
        atimeIso: null,
        fetchedAtIso: null,
        expiresAtIso: null,
        forecastCount: 0,
        forecasts: [],
        parseErrors: [],
      }
    }
    const { payload } = cacheResult
    return {
      ...base,
      status: cacheResult.status,
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
