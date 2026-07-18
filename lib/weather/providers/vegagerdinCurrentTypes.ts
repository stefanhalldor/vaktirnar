/**
 * Vegagerðin current measurement types — server-only shape.
 *
 * All data from gagnaveita.vegagerdin.is/api/vedur2014_1 represents
 * current/live observations, NOT forecast data. Never use these values for
 * route safety assessments, departure scrubber calculations, worst forecast
 * point, or selectDecisiveProvider in this step.
 *
 * Live response shape VERIFIED 2026-07-18 against gagnaveita.vegagerdin.is/api/vedur2014_1.
 * Array of 202 items. Field names confirmed:
 *   Nr         — station identifier
 *   Nafn       — station/road segment name
 *   Breidd     — latitude
 *   Lengd      — longitude
 *   Dags       — measurement time (Iceland is UTC+0 year-round)
 *   Vindhradi  — sustained/mean wind speed in m/s (current measurement)
 *   Vindhvida  — max gust in last 10 minutes in m/s (NOT forecast gust)
 *   VindattAsc — wind direction in degrees
 *   Vindatt    — wind direction as text (e.g. "S", "NA", "NNA")
 *   Hiti       — air temperature in °C
 *   Veghiti    — road surface temperature in °C
 */

/**
 * Raw item shape as returned by the Vegagerðin vedur2014_1 API.
 * Field names verified against live response 2026-07-18.
 * Values may be numbers, numeric strings, or null — parser handles both.
 */
export type VegagerdinRawItem = {
  /** Station identifier. */
  Nr: string | number | null
  /** Station/road segment name. */
  Nafn: string | null
  /** Latitude. */
  Breidd: string | number | null
  /** Longitude. */
  Lengd: string | number | null
  /** Measurement timestamp. Iceland is UTC+0 year-round. */
  Dags: string | null
  /** Mean/sustained wind speed in m/s. */
  Vindhradi: string | number | null
  /** Max gust in the last 10 minutes in m/s. NOT forecast gust. */
  Vindhvida: string | number | null
  /** Wind direction in degrees. */
  VindattAsc: string | number | null
  /** Wind direction as text (e.g. "S", "NA"). */
  Vindatt: string | null
  /** Air temperature in °C. */
  Hiti: string | number | null
  /** Road surface temperature in °C. */
  Veghiti: string | number | null
  [key: string]: unknown
}

/** Normalized current measurement from a Vegagerðin weather station. */
export type VegagerdinCurrentMeasurement = {
  source: 'vegagerdin'
  stationId: string
  stationName: string
  lat: number
  lon: number
  /** When the station recorded this measurement, ISO UTC. */
  measuredAtIso: string
  /** When our server fetched the upstream response, ISO UTC. */
  fetchedAtIso: string
  /** Vindhradi — sustained/mean wind speed in m/s. Null if absent or unparseable. */
  meanWindMs: number | null
  /** Vindhvida — max gust in last 10 min in m/s. NOT forecast gust. Null if absent. */
  gustLast10MinMs: number | null
  /** Wind direction in degrees (0–360). Null if absent. */
  windDirectionDeg: number | null
  /** Wind direction as text (e.g. "S", "NA"). Null if absent. */
  windDirectionText: string | null
  /** Air temperature in °C. Null if absent. */
  airTemperatureC: number | null
  /** Road surface temperature in °C. Null if absent. */
  roadTemperatureC: number | null
  /**
   * 'complete' — all expected numeric fields are present and non-null.
   * 'partial'  — at least one expected numeric field is null/absent.
   */
  dataQuality: 'complete' | 'partial'
}

/**
 * Client-safe DTO for a single Vegagerðin current measurement as returned by
 * /api/teskeid/weather/vegagerdin/current.
 *
 * Explicitly mapped from VegagerdinCurrentMeasurement in the API route.
 * Client code must use this type — not VegagerdinCurrentMeasurement directly —
 * so that server-internal fields do not leak through the API boundary.
 */
export type VegagerdinCurrentStationDto = {
  stationId: string
  stationName: string
  lat: number
  lon: number
  measuredAtIso: string
  fetchedAtIso: string
  meanWindMs: number | null
  gustLast10MinMs: number | null
  windDirectionDeg: number | null
  windDirectionText: string | null
  airTemperatureC: number | null
  roadTemperatureC: number | null
  dataQuality: 'complete' | 'partial'
}

/**
 * How fresh the actual station measurements are relative to wall clock.
 * Distinct from cache freshness (which measures time since our server fetched upstream).
 * Based on oldestMeasuredAtIso — the oldest actual station measurement in the payload.
 *
 * Vegagerðin stations measure every 10 minutes. Thresholds:
 *   fresh:   oldest measurement < 15 min ago (within ~1.5 cycles — normal operation)
 *   aging:   15–30 min ago (2–3 cycles behind — probably fine, check if stale)
 *   stale:   > 30 min ago (> 3 cycles — measurements are significantly behind)
 *   unknown: no oldestMeasuredAtIso available in payload
 */
export type MeasurementFreshness = 'fresh' | 'aging' | 'stale' | 'unknown'

/**
 * Shape stored in weather_cache under key 'vegagerdin:vedur2014_1:latest'.
 * Contains the full parsed station list from one upstream fetch.
 */
export type VegagerdinCachePayload = {
  source: 'vegagerdin'
  endpoint: 'vedur2014_1'
  fetchedAtIso: string
  /** ISO of the oldest measuredAt across all measurements — conservative freshness indicator. */
  oldestMeasuredAtIso: string | null
  measurements: VegagerdinCurrentMeasurement[]
}
