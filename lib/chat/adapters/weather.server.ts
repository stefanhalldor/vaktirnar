import 'server-only'
import { VEDURSTOFAN_STATIONS_REGISTRY } from '@/lib/weather/providers/vedurstofanStationsRegistry'
import { findVegagerdinCurrentMeasurementByStationId } from '@/lib/weather/providers/vegagerdinCurrent.server'
import type { ChatThreadTarget } from '../types'
import type { WeatherPulseProvider } from '@/lib/weather/pulseTarget'

/**
 * Builds a ChatThreadTarget for a Veðurstofan station.
 * Validates that the stationId exists in the official registry.
 * Returns null if the station is not found or has no stationId.
 */
export function buildWeatherStationTarget(stationId: string): ChatThreadTarget | null {
  const entry = VEDURSTOFAN_STATIONS_REGISTRY.find(
    (s) => s.stationId === stationId
  )
  if (!entry?.stationId) return null

  return {
    domain: 'weather',
    targetType: 'vedurstofan_station',
    targetId: entry.stationId,
    provider: 'vedurstofan',
    targetName: entry.name,
    lat: entry.lat ?? null,
    lon: entry.lon ?? null,
  }
}

/**
 * Provider-aware target builder for Veðurpúls chat threads.
 *
 * - 'vedurstofan': validates against VEDURSTOFAN_STATIONS_REGISTRY (sync).
 * - 'vegagerdin':  validates against the latest cached Vegagerðin current
 *   measurements. Returns null if cache is unavailable or station not found.
 *   Trusted targetName and lat/lon come from server cache, never from the client.
 *
 * NOTE: Creating a vegagerdin_station thread requires SQL migration 81
 * (sql/81_teskeid_chat_target_type_vegagerdin_station.sql) to be run first.
 * Without it the DB CHECK constraint will reject the insert.
 */
export async function buildWeatherPulseTarget(
  provider: WeatherPulseProvider,
  targetId: string
): Promise<ChatThreadTarget | null> {
  if (provider === 'vedurstofan') {
    return buildWeatherStationTarget(targetId)
  }

  // vegagerdin: look up from cache+history to get trusted name and coordinates.
  const m = await findVegagerdinCurrentMeasurementByStationId(targetId)
  if (!m) return null

  return {
    domain: 'weather',
    targetType: 'vegagerdin_station',
    targetId: m.stationId,
    provider: 'vegagerdin',
    targetName: m.stationName,
    lat: m.lat,
    lon: m.lon,
  }
}
