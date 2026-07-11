/**
 * Shared route-leg weather assessment.
 *
 * This is the shared domain seam used by:
 * - checkTravelWeather() (Ferðaveðrið) via internal composers in travel.ts
 * - Future Ferðalagið multi-stop trip assessment
 *
 * Main domain API:  assessRouteLeg()
 * Supporting utils: assessDrivingConditions(), getForecastHoursNearEta()
 * Private:          findWorstRouteMetric()
 */

import type {
  HourPoint, WeatherStatus, TravelPointForecast, WorstMetric,
  TravelCandidate, CandidatePointStatus, CandidateDisplayPoint,
  ResolvedTravelThresholds,
} from './types'
import type { TrailerKind } from './question'

const ETA_WINDOW_MS = 3_600_000 // ±1 hour around each route point's estimated arrival time

const METNO_FORECAST_BASE = 'https://api.met.no/weatherapi/locationforecast/2.0/compact'
const YRNO_FORECAST_BASE = 'https://www.yr.no/en/forecast/daily-table/'

// ── Supporting utilities ───────────────────────────────────────────────────
// Pure helpers used by assessRouteLeg and by Ferðaveðrið composers in
// travel.ts. These are NOT the domain seam — use assessRouteLeg for
// route-leg weather assessment.

/** Returns forecast hours within ±windowMs of the given ETA. */
export function getForecastHoursNearEta(
  hours: HourPoint[],
  etaMs: number,
  windowMs = ETA_WINDOW_MS,
): HourPoint[] {
  return hours.filter(h => Math.abs(new Date(h.time).getTime() - etaMs) <= windowMs)
}

/**
 * Applies driving thresholds to wind/gust/precip values.
 * Returns route status and reason code.
 * Supporting utility — not the domain assessment entry point.
 */
export function assessDrivingConditions(
  wind: number,
  gust: number,
  precip: number,
  trailerKind: 'none' | TrailerKind,
  thresholds: ResolvedTravelThresholds,
): { stada: WeatherStatus; reasonCode?: string } {
  const isTrailer = trailerKind !== 'none'
  const { cautionWindMs, redWindMs, redGustMs, cautionPrecipMmPerHour } = thresholds
  if (wind >= redWindMs || gust >= redGustMs) return { stada: 'rautt', reasonCode: isTrailer ? 'too_windy_trailer' : 'too_windy_driving' }
  if (wind >= cautionWindMs || precip > cautionPrecipMmPerHour) {
    return { stada: 'gult', reasonCode: wind >= cautionWindMs ? (isTrailer ? 'caution_wind_trailer' : 'caution_wind_driving') : 'precipitation' }
  }
  return { stada: 'graent' }
}

// ── Private helpers ────────────────────────────────────────────────────────

/**
 * Finds the worst metric value across all route points, evaluating each point at its
 * estimated arrival time (ETA) rather than the full route window. This ensures that
 * weather at a point 90% into the route is assessed at ~90% into the drive, not at
 * departure time.
 *
 * For return legs the ETA fraction is inverted: a point near the origin (fraction≈0)
 * is reached near the *end* of the return journey, not the start.
 */
function findWorstRouteMetric(
  pointForecasts: TravelPointForecast[],
  departureIso: string,
  arrivalIso: string,
  totalDistanceM: number,
  getter: (h: HourPoint) => number,
  leg: 'outbound' | 'return',
): WorstMetric | undefined {
  const depMs = new Date(departureIso).getTime()
  const durMs = new Date(arrivalIso).getTime() - depMs
  let worst: WorstMetric | undefined
  for (const pt of pointForecasts) {
    const routeFraction = totalDistanceM > 0 ? pt.distanceFromOriginM / totalDistanceM : 0
    const etaFraction = leg === 'return' ? 1 - routeFraction : routeFraction
    const etaMs = depMs + etaFraction * durMs
    for (const h of getForecastHoursNearEta(pt.hours, etaMs)) {
      const val = getter(h)
      if (worst === undefined || val > worst.value) {
        worst = {
          value: val,
          timeIso: h.time,
          lat: pt.lat,
          lon: pt.lon,
          forecastLat: pt.forecastLat,
          forecastLon: pt.forecastLon,
          metnoUrl: `${METNO_FORECAST_BASE}?lat=${pt.forecastLat}&lon=${pt.forecastLon}`,
          yrnoUrl: `${YRNO_FORECAST_BASE}${pt.forecastLat},${pt.forecastLon}`,
          routeIndex: pt.routeIndex,
          distanceFromOriginM: pt.distanceFromOriginM,
          routeFraction,
        }
      }
    }
  }
  return worst
}

// ── Domain seam ────────────────────────────────────────────────────────────

export type RouteLegInput = {
  departureIso: string
  arrivalIso: string
  pointForecasts: TravelPointForecast[]
  thresholds: ResolvedTravelThresholds
  totalDistanceM: number
  trailerKind: 'none' | TrailerKind
  /** Defaults to 'outbound'. Pass 'return' for the return leg (inverts ETA fractions). */
  leg?: 'outbound' | 'return'
}

/**
 * Type alias for a route leg weather assessment result.
 * Currently equivalent to TravelCandidate; will gain a distinct shape
 * when Ferðalagið multi-stop trips are introduced.
 */
export type RouteLegAssessment = TravelCandidate

/**
 * Assesses weather conditions for a single driving route leg.
 *
 * Given a departure time, arrival time, route point forecasts, and threshold
 * profile, returns the worst metrics along the leg, per-point map coloring,
 * and the display point for the most challenging segment.
 *
 * This function is the shared domain seam between Ferðaveðrið and Ferðalagið.
 * Both products must call this function — never duplicate its logic.
 */
export function assessRouteLeg(input: RouteLegInput): RouteLegAssessment {
  const {
    departureIso, arrivalIso, pointForecasts, thresholds,
    totalDistanceM, trailerKind, leg = 'outbound',
  } = input

  const worstWind = findWorstRouteMetric(pointForecasts, departureIso, arrivalIso, totalDistanceM, h => h.windSpeedMs, leg)
  const worstGust = findWorstRouteMetric(pointForecasts, departureIso, arrivalIso, totalDistanceM, h => h.windGustMs, leg)
  const worstPrecip = findWorstRouteMetric(pointForecasts, departureIso, arrivalIso, totalDistanceM, h => h.precipitationMmPerHour, leg)

  // Per-point statuses for timeline-driven map coloring (delta: only non-green entries stored)
  const depMs = new Date(departureIso).getTime()
  const durMs = new Date(arrivalIso).getTime() - depMs
  const pointStatuses: CandidatePointStatus[] = []
  for (const pt of pointForecasts) {
    const routeFraction = totalDistanceM > 0 ? pt.distanceFromOriginM / totalDistanceM : 0
    const etaFraction = leg === 'return' ? 1 - routeFraction : routeFraction
    const etaMs = depMs + etaFraction * durMs
    const hrs = getForecastHoursNearEta(pt.hours, etaMs)
    if (hrs.length === 0) {
      pointStatuses.push({ routeIndex: pt.routeIndex, status: 'no_data' })
      continue
    }
    const ptWind = Math.max(...hrs.map(h => h.windSpeedMs))
    const ptGust = Math.max(...hrs.map(h => h.windGustMs))
    const ptPrecip = Math.max(...hrs.map(h => h.precipitationMmPerHour))
    const ptResult = assessDrivingConditions(ptWind, ptGust, ptPrecip, trailerKind, thresholds)
    if (ptResult.stada !== 'graent') {
      pointStatuses.push({ routeIndex: pt.routeIndex, status: ptResult.stada })
    }
  }

  if (!worstWind && !worstGust && !worstPrecip) {
    return {
      departureIso, arrivalIso, status: 'gult', reasonCode: 'no_data',
      pointStatuses: pointStatuses.length > 0 ? pointStatuses : undefined,
    }
  }

  const legResult = assessDrivingConditions(
    worstWind?.value ?? 0,
    worstGust?.value ?? 0,
    worstPrecip?.value ?? 0,
    trailerKind,
    thresholds,
  )

  // Build displayPoint: active-candidate-safe metrics for the most challenging route point.
  // Uses the same decisive-metric logic as candidateToIssue / buildHighlightedIssue so the
  // map panel can show consistent wind/gust/precip/temp/forecastTime for any selected slot,
  // including green departures where highlightedIssue is undefined.
  const dpGustVal = worstGust?.value ?? 0
  const dpUseGust = dpGustVal >= thresholds.redGustMs
  const dpMetric: CandidateDisplayPoint['metric'] =
    legResult.reasonCode === 'precipitation' ? 'precipitation' :
    dpUseGust ? 'gust' : 'wind'
  const dpWorst = dpMetric === 'precipitation' ? worstPrecip : (dpUseGust ? worstGust : worstWind)
  let displayPoint: CandidateDisplayPoint | undefined
  if (dpWorst && dpWorst.routeIndex !== undefined && dpWorst.timeIso) {
    const pf = pointForecasts.find(p => p.routeIndex === dpWorst.routeIndex)
    const hour = pf?.hours.find(h => h.time === dpWorst.timeIso)
    if (pf && hour) {
      displayPoint = {
        routeIndex: dpWorst.routeIndex,
        forecastTimeIso: dpWorst.timeIso,
        windMs: hour.windSpeedMs,
        gustMs: hour.windGustMs,
        precipMmPerHour: hour.precipitationMmPerHour,
        airTemperatureC: hour.airTemperatureC,
        metric: dpMetric,
        distanceFromOriginM: dpWorst.distanceFromOriginM ?? pf.distanceFromOriginM,
        routeFraction: dpWorst.routeFraction ?? (totalDistanceM > 0 ? pf.distanceFromOriginM / totalDistanceM : 0),
      }
    }
  }

  return {
    departureIso,
    arrivalIso,
    status: legResult.stada,
    reasonCode: legResult.reasonCode,
    worstWind,
    worstGust,
    worstPrecip,
    pointStatuses: pointStatuses.length > 0 ? pointStatuses : undefined,
    displayPoint,
  }
}
