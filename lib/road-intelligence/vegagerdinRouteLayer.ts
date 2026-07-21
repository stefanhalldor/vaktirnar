import type { MeasurementFreshness } from '@/lib/weather/providers/vegagerdinCurrentTypes'
import type { WindDisplayStatus } from '@/lib/weather/windDisplayStatus'

export type VegagerdinRouteLayerStatus = 'available' | 'partial' | 'unavailable'

export type VegagerdinRouteLayer = {
  provider: 'vegagerdin'
  status: VegagerdinRouteLayerStatus
  cacheStatus: 'fresh' | 'stale' | 'history_fallback' | null
  measurementFreshness: MeasurementFreshness | null
  measuredAtIso: string | null
  fetchedAtIso: string | null
  mappedPointCount: number
  availablePointCount: number
  noWindDataPointCount: number
  points: VegagerdinRouteLayerPoint[]
}

export type VegagerdinRouteLayerPoint = {
  routePointId: string
  stationId: string
  stationName: string
  lat: number
  lon: number
  distanceM: number
  distanceFromOriginM: number | null
  routeFraction: number | null
  measuredAtIso: string
  fetchedAtIso: string
  meanWindMs: number | null
  gustLast10MinMs: number | null
  windDirectionDeg: number | null
  windDirectionText: string | null
  airTemperatureC: number | null
  roadTemperatureC: number | null
  dataQuality: 'complete' | 'partial'
  windDisplayStatus: WindDisplayStatus
  /** Gust when available, otherwise mean wind. This is the value used for status. */
  statusWindMs: number | null
}
