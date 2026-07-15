import type { HourPoint } from '@/lib/weather/types'

/** Forecast row fields used for max-blending. Structurally compatible with VedurstofanStationForecastCache.forecasts. */
type ForecastRow = {
  ftimeIso: string
  windSpeedMs: number | null
  precipitationMmPerHour: number | null
}

/** ±1.5h window for matching a MET/Yr hour to the nearest Veðurstofan 3h forecast row. */
const MAX_BLEND_OFFSET_MS = 90 * 60 * 1000

/**
 * Returns augmented HourPoints where wind and precipitation are max(MET/Yr, Veðurstofan).
 *
 * Rules:
 * - Veðurstofan can only raise values, never lower them.
 * - Each MET/Yr hour is matched to the nearest Veðurstofan forecast row within ±1.5h.
 * - If no row falls within the window, the MET/Yr hour is returned unchanged.
 * - Null Veðurstofan fields are ignored (MET/Yr value kept).
 * - Temperature is not blended here — callers use it for display only.
 */
export function blendHoursWithVedurstofan(
  hours: HourPoint[],
  forecasts: ForecastRow[],
): HourPoint[] {
  if (forecasts.length === 0) return hours
  return hours.map(hour => {
    const hourMs = new Date(hour.time).getTime()
    let nearest: ForecastRow | null = null
    let minOffset = Infinity
    for (const row of forecasts) {
      const offset = Math.abs(new Date(row.ftimeIso).getTime() - hourMs)
      if (offset <= MAX_BLEND_OFFSET_MS && offset < minOffset) {
        nearest = row
        minOffset = offset
      }
    }
    if (!nearest) return hour
    return {
      ...hour,
      windSpeedMs: nearest.windSpeedMs !== null
        ? Math.max(hour.windSpeedMs, nearest.windSpeedMs)
        : hour.windSpeedMs,
      precipitationMmPerHour: nearest.precipitationMmPerHour !== null
        ? Math.max(hour.precipitationMmPerHour, nearest.precipitationMmPerHour)
        : hour.precipitationMmPerHour,
    }
  })
}

/** Full Veðurstofan enrichment layer returned alongside the baseline travel result. */
export type VedurstofanTravelLayer = {
  experimental: true
  /** available: all mapped route points have usable data. partial: some do. unavailable: none do. */
  status: 'available' | 'partial' | 'unavailable'
  /** Unique Veðurstofan stations fetched for this route (from product table). */
  mappedPointCount: number
  availablePointCount: number
  stalePointCount: number
  unavailablePointCount: number
  /**
   * The oldest atimeIso across all usable layer stations (conservative freshness indicator).
   * Null when no stations have atime data. Used by the UI to show "gögnin eru frá kl. HH:mm".
   */
  layerAtimeIso: string | null
  /**
   * ISO timestamp of the most recently finished background warm run (weather_fetch_runs.finished_at).
   * Null when no run has been recorded yet. Used to show "síðast reynt kl. HH:mm".
   */
  lastWarmAttemptIso: string | null
  /** One entry per unique Veðurstofan station with usable data for this route. */
  points: Array<{
    /** Stable identity — `vedurstofan_{stationId}`. */
    routePointId: string
    /** Not used for station-based points. */
    routeIndex?: number
    stationId: string
    stationName: string
    /** Distance from the station to the nearest segment of the route polyline (metres). */
    distanceM: number
    /** Cumulative distance from the route origin to the projected station point (metres). Null if station coordinates are unavailable. */
    distanceFromOriginM: number | null
    /** Fraction of total route length at the projected station point, in [0, 1]. Null if station coordinates are unavailable. */
    routeFraction: number | null
    /** Not used for station-based points. */
    confidence?: 'good' | 'ok' | 'weak' | 'unavailable'
    status: 'ok' | 'stale'
    atimeIso: string | null
    /** ISO timestamp when the product table row was fetched/warmed. */
    fetchedAtIso: string
    /** ISO timestamp after which the cached row is considered stale. */
    expiresAtIso: string
    /** Station WGS84 latitude (null when not in curated registry). */
    lat: number | null
    /** Station WGS84 longitude, negative for Iceland (null when not in curated registry). */
    lon: number | null
    /** Official station info page URL (null when not available). */
    sourceUrl: string | null
    forecastRows: Array<{
      ftimeIso: string
      windSpeedMs: number | null
      precipitationMmPerHour: number | null
      temperatureC: number | null
      windDirectionText: string | null
      weatherText: string | null
    }>
  }>
}
