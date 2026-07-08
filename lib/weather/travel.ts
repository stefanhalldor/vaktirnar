import type {
  HourPoint, DeterministicResult, WeatherStatus,
  TravelPointForecast, WorstMetric, TravelCandidate, TravelWindow, TravelIssue, TravelPlan, RouteWeatherPoint, NextCaution,
  CandidatePointStatus, RouteWeatherSamplingDiagnostics,
  TravelThresholdOverrides, ResolvedTravelThresholds,
} from './types'
import type { TrailerKind } from './question'
import { deriveThreshold, resolveThresholds } from './thresholds'

const CANDIDATE_INTERVAL_S = 30 * 60 // 30-minute intervals between candidate departures
const NEXT_CAUTION_STEP_S = 3600 // 1-hour steps for next-caution scan
const NEXT_CAUTION_MIN_USEFUL_H = 3 // below this, report insufficient coverage
const METNO_FORECAST_BASE = 'https://api.met.no/weatherapi/locationforecast/2.0/compact'
const GMAPS_SEARCH_BASE = 'https://www.google.com/maps/search/?api=1&query='
const YRNO_FORECAST_BASE = 'https://www.yr.no/en/forecast/daily-table/'
const ETA_WINDOW_MS = 3_600_000 // ±1 hour around each route point's estimated arrival time

/** Returns forecast hours within ±windowMs of the given ETA. */
function getHoursNearEta(hours: HourPoint[], etaMs: number, windowMs = ETA_WINDOW_MS): HourPoint[] {
  return hours.filter(h => Math.abs(new Date(h.time).getTime() - etaMs) <= windowMs)
}

function makeId(): string {
  return `dr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function addSeconds(isoString: string, seconds: number): string {
  return new Date(new Date(isoString).getTime() + seconds * 1000).toISOString()
}

function formatUtcTime(isoString: string): string {
  const d = new Date(isoString)
  return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`
}

/**
 * Finds the worst metric value across all route points, evaluating each point at its
 * estimated arrival time (ETA) rather than the full route window. This ensures that
 * weather at a point 90% into the route is assessed at ~90% into the drive, not at
 * departure time.
 *
 * For return legs the ETA fraction is inverted: a point near the origin (fraction≈0)
 * is reached near the *end* of the return journey, not the start.
 */
function findWorstMetric(
  pointForecasts: TravelPointForecast[],
  departureIso: string,
  arrivalIso: string,
  totalDistanceM: number,
  getter: (h: HourPoint) => number,
  leg: 'outbound' | 'return' = 'outbound',
): WorstMetric | undefined {
  const depMs = new Date(departureIso).getTime()
  const durMs = new Date(arrivalIso).getTime() - depMs
  let worst: WorstMetric | undefined
  for (const pt of pointForecasts) {
    const routeFraction = totalDistanceM > 0 ? pt.distanceFromOriginM / totalDistanceM : 0
    const etaFraction = leg === 'return' ? 1 - routeFraction : routeFraction
    const etaMs = depMs + etaFraction * durMs
    for (const h of getHoursNearEta(pt.hours, etaMs)) {
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

function evalDrivingLeg(
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

function evaluateCandidate(
  departureIso: string,
  arrivalIso: string,
  pointForecasts: TravelPointForecast[],
  trailerKind: 'none' | TrailerKind,
  totalDistanceM: number,
  leg: 'outbound' | 'return' = 'outbound',
  thresholds: ResolvedTravelThresholds,
): TravelCandidate {
  const worstWind = findWorstMetric(pointForecasts, departureIso, arrivalIso, totalDistanceM, h => h.windSpeedMs, leg)
  const worstGust = findWorstMetric(pointForecasts, departureIso, arrivalIso, totalDistanceM, h => h.windGustMs, leg)
  const worstPrecip = findWorstMetric(pointForecasts, departureIso, arrivalIso, totalDistanceM, h => h.precipitationMmPerHour, leg)

  // Per-point statuses for timeline-driven map coloring (delta: only non-green entries stored)
  const depMs = new Date(departureIso).getTime()
  const durMs = new Date(arrivalIso).getTime() - depMs
  const pointStatuses: CandidatePointStatus[] = []
  for (const pt of pointForecasts) {
    const routeFraction = totalDistanceM > 0 ? pt.distanceFromOriginM / totalDistanceM : 0
    const etaFraction = leg === 'return' ? 1 - routeFraction : routeFraction
    const etaMs = depMs + etaFraction * durMs
    const hrs = getHoursNearEta(pt.hours, etaMs)
    if (hrs.length === 0) {
      pointStatuses.push({ routeIndex: pt.routeIndex, status: 'no_data' })
      continue
    }
    const ptWind = Math.max(...hrs.map(h => h.windSpeedMs))
    const ptGust = Math.max(...hrs.map(h => h.windGustMs))
    const ptPrecip = Math.max(...hrs.map(h => h.precipitationMmPerHour))
    const ptResult = evalDrivingLeg(ptWind, ptGust, ptPrecip, trailerKind, thresholds)
    if (ptResult.stada !== 'graent') {
      pointStatuses.push({ routeIndex: pt.routeIndex, status: ptResult.stada })
    }
  }

  if (!worstWind && !worstGust && !worstPrecip) {
    return { departureIso, arrivalIso, status: 'gult', reasonCode: 'no_data', pointStatuses: pointStatuses.length > 0 ? pointStatuses : undefined }
  }

  const legResult = evalDrivingLeg(
    worstWind?.value ?? 0,
    worstGust?.value ?? 0,
    worstPrecip?.value ?? 0,
    trailerKind,
    thresholds,
  )

  return {
    departureIso,
    arrivalIso,
    status: legResult.stada,
    reasonCode: legResult.reasonCode,
    worstWind,
    worstGust,
    worstPrecip,
    pointStatuses: pointStatuses.length > 0 ? pointStatuses : undefined,
  }
}

function generateCandidates(
  earliestDep: string,
  latestDep: string,
  durationS: number,
  pointForecasts: TravelPointForecast[],
  trailerKind: 'none' | TrailerKind,
  totalDistanceM: number,
  leg: 'outbound' | 'return' = 'outbound',
  thresholds: ResolvedTravelThresholds,
): TravelCandidate[] {
  const candidates: TravelCandidate[] = []
  const intervalMs = CANDIDATE_INTERVAL_S * 1000
  let t = new Date(earliestDep).getTime()
  const end = new Date(latestDep).getTime()
  while (t <= end) {
    const depIso = new Date(t).toISOString()
    candidates.push(evaluateCandidate(depIso, addSeconds(depIso, durationS), pointForecasts, trailerKind, totalDistanceM, leg, thresholds))
    t += intervalMs
  }
  return candidates
}

/** Groups adjacent same-status candidates into windows. Both fromIso and toIso are departure times. */
function groupCandidatesIntoWindows(candidates: TravelCandidate[]): TravelWindow[] {
  if (candidates.length === 0) return []
  const windows: TravelWindow[] = []
  let cur: TravelWindow = {
    fromIso: candidates[0].departureIso,
    toIso: candidates[0].departureIso,
    status: candidates[0].status,
    reasonCode: candidates[0].reasonCode,
  }
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]
    if (c.status === cur.status) {
      cur = { ...cur, toIso: c.departureIso, reasonCode: c.reasonCode === cur.reasonCode ? cur.reasonCode : undefined }
    } else {
      windows.push(cur)
      cur = { fromIso: c.departureIso, toIso: c.departureIso, status: c.status, reasonCode: c.reasonCode }
    }
  }
  windows.push(cur)
  return windows
}

function findBestWindow(windows: TravelWindow[]): TravelWindow | undefined {
  return windows.find(w => w.status === 'graent') ?? windows.find(w => w.status === 'gult')
}

function worstStada(stadaList: WeatherStatus[]): WeatherStatus {
  if (stadaList.includes('rautt')) return 'rautt'
  if (stadaList.includes('gult')) return 'gult'
  return 'graent'
}

/** Returns a severity score for tie-breaking candidates at the same status level. */
function candidateSeverity(c: TravelCandidate, thresholds: ResolvedTravelThresholds): number {
  if (c.reasonCode === 'precipitation') return c.worstPrecip?.value ?? 0
  const gustVal = c.worstGust?.value ?? 0
  return gustVal >= thresholds.redGustMs ? gustVal : (c.worstWind?.value ?? 0)
}

function worstCandidateOf(candidates: TravelCandidate[], thresholds: ResolvedTravelThresholds): TravelCandidate | undefined {
  if (candidates.length === 0) return undefined
  const order: Record<WeatherStatus, number> = { rautt: 2, gult: 1, graent: 0 }
  return candidates.reduce((a, b) => {
    if (order[b.status] > order[a.status]) return b
    if (order[b.status] < order[a.status]) return a
    return candidateSeverity(b, thresholds) > candidateSeverity(a, thresholds) ? b : a
  })
}

function buildHighlightedIssue(
  outboundWorst: TravelCandidate | undefined,
  returnWorst: TravelCandidate | undefined,
  thresholds: ResolvedTravelThresholds,
): TravelIssue | undefined {
  const entries: Array<{ cand: TravelCandidate; leg: 'outbound' | 'return' }> = []
  if (outboundWorst) entries.push({ cand: outboundWorst, leg: 'outbound' })
  if (returnWorst) entries.push({ cand: returnWorst, leg: 'return' })
  if (entries.length === 0) return undefined

  const order: Record<WeatherStatus, number> = { rautt: 2, gult: 1, graent: 0 }
  const { cand: worst, leg } = entries.reduce((a, b) => {
    if (order[b.cand.status] > order[a.cand.status]) return b
    if (order[b.cand.status] < order[a.cand.status]) return a
    const bSev = candidateSeverity(b.cand, thresholds)
    const aSev = candidateSeverity(a.cand, thresholds)
    if (bSev > aSev) return b
    if (bSev < aSev) return a
    return a  // full tie: outbound first (a = outbound, appended first)
  })
  if (worst.status === 'graent') return undefined
  if (worst.reasonCode === 'no_data') return { leg, metric: 'data', reasonCode: 'no_data' }

  if (worst.reasonCode === 'precipitation') {
    const m = worst.worstPrecip
    const thresh = deriveThreshold('precipitation', worst.reasonCode, thresholds)
    return {
      leg, metric: 'precipitation', value: m?.value, unit: 'mm/klst',
      thresholdValue: thresh.thresholdValue, thresholdUnit: thresh.thresholdUnit,
      timeIso: m?.timeIso, lat: m?.lat, lon: m?.lon,
      distanceFromOriginM: m?.distanceFromOriginM, routeFraction: m?.routeFraction,
      routeIndex: m?.routeIndex, forecastLat: m?.forecastLat, forecastLon: m?.forecastLon,
      metnoUrl: m?.metnoUrl, yrnoUrl: m?.yrnoUrl,
      googleMapsUrl: m?.lat !== undefined && m?.lon !== undefined ? `${GMAPS_SEARCH_BASE}${m.lat},${m.lon}` : undefined,
      reasonCode: worst.reasonCode,
    }
  }

  // Wind-related: prefer gust if it exceeds the resolved red gust threshold, else use wind
  const gustVal = worst.worstGust?.value ?? 0
  const useGust = gustVal >= thresholds.redGustMs
  const metricName = useGust ? 'gust' as const : 'wind' as const
  const m = useGust ? worst.worstGust : worst.worstWind
  const thresh = deriveThreshold(metricName, worst.reasonCode, thresholds)
  return {
    leg, metric: metricName, value: m?.value, unit: 'm/s',
    thresholdValue: thresh.thresholdValue, thresholdUnit: thresh.thresholdUnit,
    timeIso: m?.timeIso, lat: m?.lat, lon: m?.lon,
    distanceFromOriginM: m?.distanceFromOriginM, routeFraction: m?.routeFraction,
    routeIndex: m?.routeIndex, forecastLat: m?.forecastLat, forecastLon: m?.forecastLon,
    metnoUrl: m?.metnoUrl, yrnoUrl: m?.yrnoUrl,
    googleMapsUrl: m?.lat !== undefined && m?.lon !== undefined ? `${GMAPS_SEARCH_BASE}${m.lat},${m.lon}` : undefined,
    reasonCode: worst.reasonCode,
  }
}

function buildRouteWeatherPoints(
  pointForecasts: TravelPointForecast[],
  summaryInfo: { candidate: TravelCandidate; leg: 'outbound' | 'return' } | undefined,
  highlightedIssue: TravelIssue | undefined,
  trailerKind: 'none' | TrailerKind,
  totalDistanceM: number,
  thresholds: ResolvedTravelThresholds,
): RouteWeatherPoint[] {
  const total = pointForecasts.length
  return pointForecasts.map((pt, idx) => {
    const routeFraction = totalDistanceM > 0 ? pt.distanceFromOriginM / totalDistanceM : 0

    let summaryForWindow: RouteWeatherPoint['summaryForWindow'] | undefined
    if (summaryInfo) {
      const { candidate, leg } = summaryInfo
      const depMs = new Date(candidate.departureIso).getTime()
      const durMs = new Date(candidate.arrivalIso).getTime() - depMs
      // For return leg, point near origin (fraction≈0) is reached late in journey, not early
      const etaFraction = leg === 'return' ? 1 - routeFraction : routeFraction
      const etaMs = depMs + etaFraction * durMs
      const hrs = getHoursNearEta(pt.hours, etaMs)
      if (hrs.length > 0) {
        const worstWindMs = Math.max(...hrs.map(h => h.windSpeedMs))
        const worstGustMs = Math.max(...hrs.map(h => h.windGustMs))
        const worstPrecipMmPerHour = Math.max(...hrs.map(h => h.precipitationMmPerHour))
        const legResult = evalDrivingLeg(worstWindMs, worstGustMs, worstPrecipMmPerHour, trailerKind, thresholds)
        const ptRedGustThreshold = thresholds.redGustMs
        const decisiveMetric: NonNullable<RouteWeatherPoint['summaryForWindow']>['decisiveMetric'] =
          legResult.reasonCode === 'precipitation' ? 'precipitation' :
          legResult.reasonCode === 'no_data' ? 'data' :
          (legResult.reasonCode?.includes('wind') || legResult.reasonCode?.includes('trailer'))
            ? (worstGustMs >= ptRedGustThreshold ? 'gust' : 'wind')
            : undefined
        // Pick the hour with the highest value for the decisive metric
        const decisiveTimeIso = decisiveMetric === 'precipitation'
          ? hrs.reduce((a, b) => b.precipitationMmPerHour > a.precipitationMmPerHour ? b : a).time
          : hrs.reduce((a, b) => Math.max(b.windSpeedMs, b.windGustMs) > Math.max(a.windSpeedMs, a.windGustMs) ? b : a).time
        const etaIso = new Date(etaMs).toISOString()
        const forecastTimeIso = decisiveTimeIso
        const decisiveHour = decisiveTimeIso ? hrs.find(h => h.time === decisiveTimeIso) : hrs[0]
        const decisiveTempC = decisiveHour?.airTemperatureC

        // Find the next forecast hour after decisiveTimeIso
        let nextForecast: NonNullable<RouteWeatherPoint['summaryForWindow']>['nextForecast']
        if (decisiveTimeIso) {
          const decisiveIdx = pt.hours.findIndex(h => h.time === decisiveTimeIso)
          const nextHour = decisiveIdx >= 0 && decisiveIdx < pt.hours.length - 1
            ? pt.hours[decisiveIdx + 1]
            : undefined
          if (nextHour) {
            const nextResult = evalDrivingLeg(nextHour.windSpeedMs, nextHour.windGustMs, nextHour.precipitationMmPerHour, trailerKind, thresholds)
            const severityOf = (s: WeatherStatus) => s === 'rautt' ? 2 : s === 'gult' ? 1 : 0
            const curSev = severityOf(legResult.stada)
            const nextSev = severityOf(nextResult.stada)
            let trend: 'better' | 'worse' | 'same'
            if (nextSev > curSev) trend = 'worse'
            else if (nextSev < curSev) trend = 'better'
            else {
              const curWind = Math.max(worstWindMs, worstGustMs)
              const nextWind = Math.max(nextHour.windSpeedMs, nextHour.windGustMs)
              trend = nextWind > curWind * 1.1 ? 'worse' : nextWind < curWind * 0.9 ? 'better' : 'same'
            }
            nextForecast = {
              timeIso: nextHour.time,
              status: nextResult.stada,
              trend,
              windMs: nextHour.windSpeedMs,
              gustMs: nextHour.windGustMs,
              precipMmPerHour: nextHour.precipitationMmPerHour,
            }
          }
        }

        summaryForWindow = { status: legResult.stada, worstWindMs, worstGustMs, worstPrecipMmPerHour, decisiveTempC, decisiveMetric, decisiveTimeIso, etaIso, forecastTimeIso, nextForecast }
      }
    }

    const isHighlightedIssue = !!(
      highlightedIssue && highlightedIssue.lat !== undefined &&
      highlightedIssue.lat === pt.lat && highlightedIssue.lon === pt.lon
    )

    return {
      id: `rwp_${pt.routeIndex}`,
      routeIndex: pt.routeIndex,
      totalRouteWeatherPoints: total,
      lat: pt.lat,
      lon: pt.lon,
      forecastLat: pt.forecastLat,
      forecastLon: pt.forecastLon,
      distanceFromOriginM: pt.distanceFromOriginM,
      routeFraction,
      isOrigin: routeFraction < 0.02,
      isDestinationClosest: idx === total - 1,
      isHighlightedIssue,
      googleMapsUrl: `${GMAPS_SEARCH_BASE}${pt.lat},${pt.lon}`,
      metnoUrl: `${METNO_FORECAST_BASE}?lat=${pt.forecastLat}&lon=${pt.forecastLon}`,
      yrnoUrl: `${YRNO_FORECAST_BASE}${pt.forecastLat},${pt.forecastLon}`,
      summaryForWindow,
    }
  })
}

/**
 * Builds a Google Static Maps URL showing the route line and weather point markers.
 * Samples the polyline down to ≤40 points to stay well within URL length limits.
 */
function buildAuditMapUrl(
  auditPolylinePoints: Array<{ lat: number; lon: number }>,
  routeWeatherPoints: RouteWeatherPoint[],
  browserKey: string,
): string {
  const maxPath = 40
  let pts: Array<{ lat: number; lon: number }>
  if (auditPolylinePoints.length <= maxPath) {
    pts = auditPolylinePoints
  } else {
    const step = Math.ceil(auditPolylinePoints.length / maxPath)
    const sampled: typeof auditPolylinePoints = []
    for (let i = 0; i < auditPolylinePoints.length; i += step) sampled.push(auditPolylinePoints[i])
    const last = auditPolylinePoints[auditPolylinePoints.length - 1]
    if (sampled[sampled.length - 1] !== last) {
      if (sampled.length < maxPath) sampled.push(last)
      else sampled[sampled.length - 1] = last
    }
    pts = sampled
  }

  const pathCoords = pts.map(p => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join('|')
  const params = new URLSearchParams()
  params.set('size', '600x300')
  params.set('scale', '2')
  params.append('path', `color:0x4A90E2B0|weight:3|${pathCoords}`)

  const highlighted = routeWeatherPoints.find(p => p.isHighlightedIssue)
  if (highlighted) {
    params.append('markers', `color:red|label:V|${highlighted.lat.toFixed(4)},${highlighted.lon.toFixed(4)}`)
  }
  const dest = routeWeatherPoints.find(p => p.isDestinationClosest && !p.isOrigin)
  if (dest) {
    params.append('markers', `color:green|label:A|${dest.lat.toFixed(4)},${dest.lon.toFixed(4)}`)
  }
  params.set('key', browserKey)
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`
}

const IS_DAYS = ['sun.', 'mán.', 'þri.', 'mið.', 'fim.', 'fös.', 'lau.']
const IS_MONTHS = ['jan.', 'feb.', 'mar.', 'apr.', 'maí', 'jún.', 'júl.', 'ágú.', 'sep.', 'okt.', 'nóv.', 'des.']

/**
 * Formats a departure window as a date-aware Icelandic string.
 * Same UTC day: "kl. HH:MM–HH:MM". Different days: "X. jul. kl. HH:MM – Y. jul. kl. HH:MM".
 */
function formatWindowRange(fromIso: string, toIso: string): string {
  const fromDate = fromIso.slice(0, 10)
  const toDate = toIso.slice(0, 10)
  if (fromDate === toDate) {
    return `kl. ${formatUtcTime(fromIso)}–${formatUtcTime(toIso)}`
  }
  const fmtDay = (iso: string) => {
    const d = new Date(iso)
    return `${IS_DAYS[d.getUTCDay()]} ${d.getUTCDate()}. ${IS_MONTHS[d.getUTCMonth()]} kl. ${formatUtcTime(iso)}`
  }
  return `${fmtDay(fromIso)} – ${fmtDay(toIso)}`
}

function reasonToText(reasonCode: string | undefined): string {
  switch (reasonCode) {
    case 'too_windy_driving': return 'Vindur fer yfir viðmið'
    case 'caution_wind_driving': return 'Vindur nálgast óþægileg mörk'
    case 'too_windy_trailer': return 'Vindur fer yfir viðmið fyrir eftirvagn'
    case 'caution_wind_trailer': return 'Vindur nálgast óþægileg mörk fyrir eftirvagn'
    case 'precipitation': return 'Rigning á leiðinni'
    case 'no_data': return 'Spágögn vantar á hluta leiðarinnar'
    case 'home_too_soon': return 'Miðað við aksturstíma nærðu ekki heim fyrir þennan tíma'
    default: return 'Slæmar veðuraðstæður'
  }
}

/**
 * Builds the single-departure hourly timeline from departure to the full forecast coverage limit.
 * Returns all candidates (first = current departure) and derives nextCaution from the first
 * non-green non-no_data candidate after the current departure.
 * Skips no_data as a caution trigger — data absence alone is not a meaningful forward caution.
 */
function buildSingleDepartureTimeline(
  departureIso: string,
  durationS: number,
  pointForecasts: TravelPointForecast[],
  trailerKind: 'none' | TrailerKind,
  totalDistanceM: number,
  originName: string,
  thresholds: ResolvedTravelThresholds,
): { timelineCandidates: TravelCandidate[]; nextCaution: NextCaution } {
  // Latest usable departure = (min last forecast hour across all points) - durationS
  let lastForecastMs = Infinity
  for (const pf of pointForecasts) {
    if (pf.hours.length > 0) {
      const last = new Date(pf.hours[pf.hours.length - 1].time).getTime()
      if (last < lastForecastMs) lastForecastMs = last
    }
  }
  const coverageCapMs = isFinite(lastForecastMs) ? lastForecastMs - durationS * 1000 : 0

  const startMs = new Date(departureIso).getTime()
  const endMs = coverageCapMs
  const scannedHours = Math.max(0, Math.round((endMs - startMs) / 3_600_000))

  const timelineCandidates: TravelCandidate[] = []
  let t = startMs
  while (t <= endMs) {
    const depIso = new Date(t).toISOString()
    timelineCandidates.push(evaluateCandidate(depIso, addSeconds(depIso, durationS), pointForecasts, trailerKind, totalDistanceM, 'outbound', thresholds))
    t += NEXT_CAUTION_STEP_S * 1000
  }

  // Derive nextCaution from first non-green non-no_data candidate after the current departure (i > 0)
  let nextCaution: NextCaution = { scannedHours }
  for (let i = 1; i < timelineCandidates.length; i++) {
    const cand = timelineCandidates[i]
    if (cand.status !== 'graent' && cand.reasonCode !== 'no_data') {
      const issue = buildHighlightedIssue(cand, undefined, thresholds)
      if (issue && issue.distanceFromOriginM !== undefined) {
        issue.distanceFromLegStartM = Math.round(issue.distanceFromOriginM)
        issue.legStartName = originName
      }
      nextCaution = {
        departureIso: cand.departureIso,
        arrivalIso: cand.arrivalIso,
        status: cand.status as Exclude<WeatherStatus, 'graent'>,
        reasonCode: cand.reasonCode,
        issue: issue ?? undefined,
        scannedHours,
      }
      break
    }
  }

  return { timelineCandidates, nextCaution }
}

export type TravelWeatherInput = {
  trailerKind: 'none' | TrailerKind
  originName: string
  destinationName: string
  distanceM: number
  durationS: number
  /** Route points with forecast data and location metadata for WorstMetric tracking. */
  pointForecasts: TravelPointForecast[]
  /** Destination forecast reserved for future lodging use. */
  destinationForecast?: { hours: HourPoint[] }
  /** Earliest desired departure ISO. Defaults to now if absent. */
  earliestDepartureAt?: string
  /** Latest desired arrival at destination ISO. Triggers candidate-window analysis. */
  latestArrivalBy?: string
  /** Latest desired home arrival ISO. Triggers return-window analysis. */
  latestHomeBy?: string
  /** Sampled route polyline for audit map (max 80 points). Passed to buildAuditMapUrl. */
  auditPolylinePoints?: Array<{ lat: number; lon: number }>
  /** Diagnostics from route weather point sampling. Passed through to travelPlan. */
  samplingDiagnostics?: RouteWeatherSamplingDiagnostics
  /** Optional per-run threshold overrides. Merged with trailer-kind defaults via resolveThresholds. */
  thresholdOverrides?: TravelThresholdOverrides
}

export function checkTravelWeather(input: TravelWeatherInput): DeterministicResult {
  const {
    trailerKind, originName, destinationName, distanceM, durationS, pointForecasts,
    earliestDepartureAt, latestArrivalBy, latestHomeBy, auditPolylinePoints, samplingDiagnostics,
    thresholdOverrides,
  } = input

  const resolved = resolveThresholds(trailerKind, thresholdOverrides)
  const distanceKm = Math.round(distanceM / 1000)
  const durationMin = Math.round(durationS / 60)
  const earliestDeparture = earliestDepartureAt ?? new Date().toISOString()
  const arrivalAtEarliest = addSeconds(earliestDeparture, durationS)
  const windowMode = !!latestArrivalBy

  // --- Arrival-too-soon guard ---
  if (windowMode) {
    const latestDep = addSeconds(latestArrivalBy, -durationS)
    if (new Date(latestDep) < new Date(earliestDeparture)) {
      const plan: TravelPlan = {
        route: { originName, destinationName, distanceKm, durationMinutes: durationMin },
        outbound: { earliestDepartureIso: earliestDeparture, latestArrivalIso: latestArrivalBy, candidates: [], bestWindow: undefined, badWindows: [], windowMode: true },
      }
      return {
        id: makeId(), source: 'deterministic', toolName: 'checkTravelWeather', createdAt: new Date().toISOString(),
        svar: `Miðað við aksturstíma nærðu ekki á áfangastað fyrir kl. ${formatUtcTime(latestArrivalBy)}.`,
        stada: 'gult', reasonCode: 'arrival_too_soon',
        facts: [`Leið: ${originName} → ${destinationName} (${distanceKm} km, ${durationMin} mín.)`, 'Þetta er veðurmat, ekki umferðar- eða farartrygging.'],
        travelPlan: plan,
      }
    }
  }

  // --- Outbound candidates ---
  let outboundCandidates: TravelCandidate[]
  let latestDepartureIso: string | undefined

  if (windowMode) {
    latestDepartureIso = addSeconds(latestArrivalBy, -durationS)
    outboundCandidates = generateCandidates(earliestDeparture, latestDepartureIso, durationS, pointForecasts, trailerKind, distanceM, 'outbound', resolved)
  } else {
    outboundCandidates = [evaluateCandidate(earliestDeparture, arrivalAtEarliest, pointForecasts, trailerKind, distanceM, 'outbound', resolved)]
  }

  const outboundWindows = groupCandidatesIntoWindows(outboundCandidates)
  const bestOutboundWindow = windowMode ? findBestWindow(outboundWindows) : undefined
  const badOutboundWindows = outboundWindows.filter(w => w.status === 'rautt')
  const outboundOverallStada = worstStada(outboundCandidates.map(c => c.status))

  // --- Return candidates ---
  let returnPlan: TravelPlan['return'] | undefined
  let returnCandidates: TravelCandidate[] = []
  let returnImpossible = false

  if (latestHomeBy) {
    const latestReturnDep = addSeconds(latestHomeBy, -durationS)
    const earliestReturnDep = bestOutboundWindow
      ? addSeconds(bestOutboundWindow.fromIso, durationS)
      : arrivalAtEarliest

    if (new Date(latestReturnDep) < new Date(earliestReturnDep)) {
      // Blocker 3: impossible home target — mark explicitly so status is not silently green
      returnImpossible = true
      returnPlan = { earliestReturnDepartureIso: earliestReturnDep, latestHomeIso: latestHomeBy, latestReturnDepartureIso: latestReturnDep, candidates: [], bestWindow: undefined, badWindows: [] }
    } else {
      returnCandidates = generateCandidates(earliestReturnDep, latestReturnDep, durationS, pointForecasts, trailerKind, distanceM, 'return', resolved)
      const returnWindows = groupCandidatesIntoWindows(returnCandidates)
      returnPlan = {
        earliestReturnDepartureIso: earliestReturnDep,
        latestHomeIso: latestHomeBy,
        latestReturnDepartureIso: latestReturnDep,
        candidates: returnCandidates,
        bestWindow: findBestWindow(returnWindows),
        badWindows: returnWindows.filter(w => w.status === 'rautt'),
      }
    }
  }

  // --- Overall status ---
  const returnOverallStada: WeatherStatus = returnImpossible ? 'gult' : (returnCandidates.length > 0 ? worstStada(returnCandidates.map(c => c.status)) : 'graent')
  const overallStada = worstStada([outboundOverallStada, returnOverallStada])

  // --- Highlighted issue ---
  const outboundWorst = worstCandidateOf(outboundCandidates, resolved)
  const returnWorst = returnCandidates.length > 0 ? worstCandidateOf(returnCandidates, resolved) : undefined
  const highlightedIssue = buildHighlightedIssue(outboundWorst, returnWorst, resolved)

  if (highlightedIssue && highlightedIssue.distanceFromOriginM !== undefined) {
    const fromDest = highlightedIssue.leg === 'return'
    highlightedIssue.distanceFromLegStartM = fromDest
      ? Math.round(distanceM - highlightedIssue.distanceFromOriginM)
      : Math.round(highlightedIssue.distanceFromOriginM)
    highlightedIssue.legStartName = fromDest ? destinationName : originName
  }

  // --- Single-departure timeline (always in single-departure mode) ---
  // timelineCandidates: hourly from departure to the full forecast coverage limit, used for the timeline scrubber.
  // nextCaution: only set when current outbound is green (derived from timelineCandidates).
  let nextCaution: NextCaution | undefined
  let timelineCandidates: TravelCandidate[] | undefined

  if (!windowMode) {
    const scanResult = buildSingleDepartureTimeline(earliestDeparture, durationS, pointForecasts, trailerKind, distanceM, originName, resolved)
    timelineCandidates = scanResult.timelineCandidates.length > 0 ? scanResult.timelineCandidates : undefined
    if (outboundOverallStada === 'graent') {
      nextCaution = scanResult.nextCaution
    }
  }

  // Major 1: derive reason from the highlighted issue itself, not from outbound ?? return fallback
  const issueReasonCode = returnImpossible && !highlightedIssue ? 'home_too_soon' : highlightedIssue?.reasonCode
  const issueText = reasonToText(issueReasonCode)
  const issueTime = highlightedIssue?.timeIso ? ` um kl. ${formatUtcTime(highlightedIssue.timeIso)}` : ''
  const issueLeg = highlightedIssue?.leg ?? 'outbound'
  // Major 2: for return leg, show distance from destination (not origin)
  const issueDist = (highlightedIssue?.distanceFromOriginM ?? 0) > 0
    ? issueLeg === 'return'
      ? `, um ${Math.round((distanceM - highlightedIssue!.distanceFromOriginM!) / 1000)} km frá ${destinationName}`
      : `, um ${Math.round(highlightedIssue!.distanceFromOriginM! / 1000)} km frá ${originName}`
    : ''

  // --- svar ---
  let svar: string
  if (windowMode) {
    const bestWindowNote = bestOutboundWindow
      ? ` Besti glugginn virðist vera ${formatWindowRange(bestOutboundWindow.fromIso, bestOutboundWindow.toIso)}.`
      : ''
    const homeTooSoonNote = returnImpossible ? ` Óþægilegt á heimleið: miðað við aksturstíma nærðu ekki heim fyrir kl. ${formatUtcTime(latestHomeBy!)}.` : ''
    if (overallStada === 'graent') {
      const windowRange = bestOutboundWindow
        ? formatWindowRange(bestOutboundWindow.fromIso, bestOutboundWindow.toIso)
        : formatWindowRange(earliestDeparture, arrivalAtEarliest)
      svar = `Ferðaveður lítur vel út. Besti brottfararglugginn virðist vera ${windowRange}.${homeTooSoonNote}`
    } else if (overallStada === 'gult') {
      svar = `Óþægilegt. ${issueReasonCode === 'home_too_soon' ? issueText : `${issueText}${issueTime}${issueDist}`}.${bestWindowNote}${homeTooSoonNote}`
    } else {
      svar = `Hættulegt. ${issueText}${issueTime}${issueDist}.${bestWindowNote}${homeTooSoonNote}`
    }
  } else {
    const depTime = formatUtcTime(earliestDeparture)
    if (returnImpossible && overallStada === 'gult' && outboundOverallStada === 'graent') {
      svar = `Ferðin frá kl. ${depTime} lítur vel út veðurfarslega. Óþægilegt á heimleið: ${issueText} (${formatUtcTime(latestHomeBy!)}).`
    } else if (overallStada === 'graent') {
      svar = `Ferðin frá kl. ${depTime} lítur vel út veðurfarslega.`
    } else {
      const legLabel = issueLeg === 'return' ? 'Heimferð' : `Útleið frá kl. ${depTime}`
      const statusLabel = overallStada === 'rautt' ? 'Hættulegt' : 'Óþægilegt'
      svar = `${statusLabel}. ${legLabel}: ${issueText}${issueTime}${issueDist}.`
    }
  }

  // --- facts ---
  const facts: string[] = [`Leið: ${originName} → ${destinationName} (${distanceKm} km, ${durationMin} mín.)`]

  if (outboundWorst?.worstWind) {
    const oGust = outboundWorst.worstGust && outboundWorst.worstGust.value > outboundWorst.worstWind.value
      ? ` (hviður: ${outboundWorst.worstGust.value.toFixed(1)} m/s)` : ''
    facts.push(`Mesti vindur á útleið: ${outboundWorst.worstWind.value.toFixed(1)} m/s${oGust}, úrkoma: ${outboundWorst.worstPrecip?.value.toFixed(1) ?? '0.0'} mm/klst`)
  }
  if (returnWorst?.worstWind && returnCandidates.length > 0) {
    const rGust = returnWorst.worstGust && returnWorst.worstGust.value > returnWorst.worstWind.value
      ? ` (hviður: ${returnWorst.worstGust.value.toFixed(1)} m/s)` : ''
    facts.push(`Mesti vindur á heimleið: ${returnWorst.worstWind.value.toFixed(1)} m/s${rGust}, úrkoma: ${returnWorst.worstPrecip?.value.toFixed(1) ?? '0.0'} mm/klst`)
  }
  if (trailerKind === 'horse_trailer') {
    facts.push('Hestakerra: gæti krafist sérstaks ökuréttindaflokks (BE) og er viðkvæmari fyrir hliðarvindum.')
  }
  facts.push('Þetta er veðurmat, ekki umferðar- eða farartrygging.')

  // --- routeWeatherPoints ---
  // Use the decisive leg's candidate for summaryForWindow so row values match the actual issue leg/time.
  const decisiveIsReturn = highlightedIssue?.leg === 'return'
  const summaryCandidate = decisiveIsReturn
    ? (returnPlan?.bestWindow
        ? returnCandidates.find(c => c.departureIso === returnPlan!.bestWindow?.fromIso) ?? returnCandidates[0]
        : returnCandidates[0])
    : (bestOutboundWindow
        ? outboundCandidates.find(c => c.departureIso === bestOutboundWindow.fromIso) ?? outboundCandidates[0]
        : outboundCandidates[0])
  const summaryLeg: 'outbound' | 'return' = decisiveIsReturn ? 'return' : 'outbound'
  const summaryInfo = summaryCandidate ? { candidate: summaryCandidate, leg: summaryLeg } : undefined
  const routeWeatherPoints = buildRouteWeatherPoints(pointForecasts, summaryInfo, highlightedIssue, trailerKind, distanceM, resolved)

  // --- audit map ---
  const browserKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
  const auditMapUrl = auditPolylinePoints && auditPolylinePoints.length > 0 && browserKey
    ? buildAuditMapUrl(auditPolylinePoints, routeWeatherPoints, browserKey)
    : undefined

  // --- travelPlan ---
  const travelPlan: TravelPlan = {
    route: { originName, destinationName, distanceKm, durationMinutes: durationMin, auditPolylinePoints, auditMapUrl },
    samplingDiagnostics,
    outbound: {
      earliestDepartureIso: earliestDeparture,
      latestArrivalIso: latestArrivalBy,
      latestDepartureIso,
      candidates: outboundCandidates,
      bestWindow: bestOutboundWindow,
      badWindows: badOutboundWindows,
      leavingAt: outboundCandidates[0],
      windowMode,
      nextCaution,
      timelineCandidates,
    },
    return: returnPlan,
    highlightedIssue,
    routeWeatherPoints,
    thresholdsUsed: resolved,
  }

  return {
    id: makeId(),
    source: 'deterministic',
    toolName: 'checkTravelWeather',
    createdAt: new Date().toISOString(),
    svar,
    stada: overallStada,
    reasonCode: issueReasonCode,
    facts,
    travelPlan,
  }
}
