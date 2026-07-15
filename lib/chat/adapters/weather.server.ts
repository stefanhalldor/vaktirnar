import 'server-only'
import { VEDURSTOFAN_STATIONS_REGISTRY } from '@/lib/weather/providers/vedurstofanStationsRegistry'
import type { ChatThreadTarget } from '../types'

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
