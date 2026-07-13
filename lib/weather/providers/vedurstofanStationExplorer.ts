/**
 * Pure data helper for the Veðurstofan station explorer (Phase 2B0).
 *
 * Merges curated station metadata with live/cached fetch results into a
 * client-safe response payload. No network calls, no Supabase access.
 *
 * Safe to import types from client components (no server-only deps).
 */
import type { VedurstofanStation } from './vedurstofanStations'
import type { VedurstofanStationResult } from './vedurstofan.server'

const SERVICE_URL =
  'https://xmlweather.vedur.is/?op_w=xml&type=forec&lang=is&view=xml&time=3h&params=F;D;T;R;W'

export type StationExplorerStation = {
  stationId: string
  stationName: string
  owner: string
  lat: number
  lon: number
  coordinatesVerified: boolean
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
  stations: readonly VedurstofanStation[],
  results: Map<string, VedurstofanStationResult>,
): StationExplorerResponse {
  const stationList: StationExplorerStation[] = stations.map(s => {
    const result = results.get(s.stationId)
    if (!result || result.status === 'unavailable') {
      return {
        stationId: s.stationId,
        stationName: s.stationName,
        owner: s.owner,
        lat: s.lat,
        lon: s.lon,
        coordinatesVerified: s.coordinatesVerified,
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
      stationName: s.stationName,
      owner: s.owner,
      lat: s.lat,
      lon: s.lon,
      coordinatesVerified: s.coordinatesVerified,
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
