import type { RouteWeatherPoint, TravelIssue, TravelCandidate, WeatherStatus, ResolvedTravelThresholds } from '@/lib/weather/types'
import { WEATHER_THRESHOLDS, deriveThreshold } from '@/lib/weather/thresholds'

/** Google Maps LatLngLiteral shape (lng instead of lon). */
export type LatLngLiteral = { lat: number; lng: number }

/** Convert { lat, lon } to Google Maps LatLngLiteral { lat, lng }. */
export function toLngLat(p: { lat: number; lon: number }): LatLngLiteral {
  return { lat: p.lat, lng: p.lon }
}

/** Route point (road coordinate) as LatLngLiteral. */
export function getRoutePointLatLng(pt: RouteWeatherPoint): LatLngLiteral {
  return { lat: pt.lat, lng: pt.lon }
}

/** met.no forecast grid coordinate as LatLngLiteral. */
export function getForecastPointLatLng(pt: RouteWeatherPoint): LatLngLiteral {
  return { lat: pt.forecastLat, lng: pt.forecastLon }
}

/** Approximate distance in meters between two LatLngLiteral points (Haversine). */
function haversineMeters(a: LatLngLiteral, b: LatLngLiteral): number {
  const R = 6_371_000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinA = Math.sin(dLat / 2)
  const sinB = Math.sin(dLng / 2)
  const hav = sinA * sinA + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinB * sinB
  return 2 * R * Math.asin(Math.sqrt(hav))
}

/** Returns true if the two coordinates are within toleranceMeters of each other. */
export function isSameCoordinatePair(
  a: LatLngLiteral,
  b: LatLngLiteral,
  toleranceMeters = 150,
): boolean {
  return haversineMeters(a, b) <= toleranceMeters
}

/**
 * Returns true when the route point and met.no forecast point are far enough
 * apart that showing a separate forecast marker adds useful information.
 */
export function shouldShowForecastPointMarker(
  pt: RouteWeatherPoint,
  toleranceMeters = 50,
): boolean {
  return !isSameCoordinatePair(getRoutePointLatLng(pt), getForecastPointLatLng(pt), toleranceMeters)
}

export type PointMarkerStyle = {
  color: string
  scale: number
  zIndex: number
}

/** Returns marker color, scale, and z-index for a weather point. */
export function markerStyleForStatus(
  status: WeatherStatus | undefined,
  isHighlighted: boolean,
): PointMarkerStyle {
  const color = status === 'rautt' ? '#dc2626' : status === 'gult' ? '#f59e0b' : '#2d5a27'
  if (isHighlighted) return { color, scale: 1.6, zIndex: 10 }
  switch (status) {
    case 'rautt': return { color: '#dc2626', scale: 1.1, zIndex: 8 }
    case 'gult':  return { color: '#f59e0b', scale: 1.0, zIndex: 7 }
    default:      return { color: '#2d5a27', scale: 0.8, zIndex: 5 }
  }
}

/**
 * Returns the index of the weather point that should be initially selected.
 * Priority: highlighted issue point → destination-closest point → first point.
 */
export function initialSelectedIndex(
  weatherPoints: RouteWeatherPoint[],
  highlightedIssue?: TravelIssue,
  activeCandidate?: TravelCandidate,
): number {
  if (weatherPoints.length === 0) return 0
  if (highlightedIssue?.lat !== undefined && highlightedIssue?.lon !== undefined) {
    const idx = weatherPoints.findIndex(
      p => p.lat === highlightedIssue.lat && p.lon === highlightedIssue.lon,
    )
    if (idx >= 0) return idx
  }
  // Use the slot's worst metric point by routeIndex (works for green slots too)
  const worstRouteIdx =
    activeCandidate?.worstWind?.routeIndex ??
    activeCandidate?.worstGust?.routeIndex ??
    activeCandidate?.worstPrecip?.routeIndex
  if (worstRouteIdx !== undefined) {
    const idx = weatherPoints.findIndex(p => p.routeIndex === worstRouteIdx)
    if (idx >= 0) return idx
  }
  // Use server-flagged worst point when no slot-specific data is available
  const serverWorstIdx = weatherPoints.findIndex(p => p.isHighlightedIssue)
  if (serverWorstIdx >= 0) return serverWorstIdx
  // Fallback: summaryForWindow worst status
  const redIdx = weatherPoints.findIndex(p => p.summaryForWindow?.status === 'rautt')
  if (redIdx >= 0) return redIdx
  const yellowIdx = weatherPoints.findIndex(p => p.summaryForWindow?.status === 'gult')
  if (yellowIdx >= 0) return yellowIdx
  const destIdx = weatherPoints.findIndex(p => p.isDestinationClosest && !p.isOrigin)
  if (destIdx >= 0) return destIdx
  return 0
}

/** Normalizes short app locale codes to Intl-valid locales ('is' → 'is-IS', 'en' → 'en-US'). */
export function normalizeLocale(locale: string): string {
  if (locale === 'is') return 'is-IS'
  if (locale === 'en') return 'en-US'
  return locale
}

/** Known Icelandic city/place names → dative form. Only include safe, verified entries. */
export const IS_PLACE_DATIVE: Record<string, string> = {
  'Reykjavík': 'Reykjavík',
  'Garðabær': 'Garðabæ',
  'Kópavogur': 'Kópavogi',
  'Hafnarfjörður': 'Hafnarfirði',
  'Akureyri': 'Akureyri',
  'Selfoss': 'Selfossi',
  'Egilsstaðir': 'Egilsstöðum',
  'Akranes': 'Akranesi',
  'Ísafjörður': 'Ísafirði',
  'Vestmannaeyjar': 'Vestmannaeyjum',
  'Hvolsvöllur': 'Hvolsvelli',
  'Vík': 'Vík',
  'Borgarnes': 'Borgarnesi',
  'Hveragerði': 'Hveragerði',
  'Þorlákshöfn': 'Þorlákshöfn',
  'Grindavík': 'Grindavík',
  'Keflavík': 'Keflavík',
  'Njarðvík': 'Njarðvík',
  'Höfn': 'Höfn',
  'Neskaupstaður': 'Neskaupstað',
  'Eskifjörður': 'Eskifirði',
  'Reyðarfjörður': 'Reyðarfirði',
  'Seyðisfjörður': 'Seyðisfirði',
  'Ólafsvík': 'Ólafsvík',
  'Stykkishólmur': 'Stykkishólmi',
  'Blönduós': 'Blönduósi',
  'Siglufjörður': 'Sigluförði',
  'Dalvík': 'Dalvík',
  'Húsavík': 'Húsavík',
  'Þórshöfn': 'Þórshöfn',
  'Vopnafjörður': 'Vopnafirði',
  'Hvammstangi': 'Hvammstanga',
  'Hella': 'Hellu',
  'Kirkjubæjarklaustur': 'Kirkjubæjarklaustri',
  'Patreksfjörður': 'Patreksfirði',
  'Ísafjarðarbær': 'Ísafjarðarbæ',
}

/** Returns the Icelandic dative form of a place name, or fallback if unknown. */
export function getOriginDisplay(originName: string, locale: string, fallback: string): string {
  const norm = normalizeLocale(locale)
  if (!norm.startsWith('is')) return originName || fallback
  const dative = IS_PLACE_DATIVE[originName.trim()]
  return dative ?? fallback
}

/** Format a number to 1 decimal place with locale-aware decimal separator, trimming whole-number `.0`. */
export function formatNum(value: number, locale: string): string {
  const fixed = value.toFixed(1)
  const trimmed = fixed.replace(/\.0$/, '')
  if (locale === 'is' || locale.startsWith('is')) {
    return trimmed.replace('.', ',')
  }
  return trimmed
}

/** Format a UTC ISO string as HH:mm for display (e.g. "kl. 17:00"). */
export function formatKlTime(isoString: string): string {
  const d = new Date(isoString)
  const hh = d.getUTCHours().toString().padStart(2, '0')
  const mm = d.getUTCMinutes().toString().padStart(2, '0')
  return `${hh}:${mm}`
}

export type PointSummary = {
  routeIndex: number
  totalPoints: number
  isHighlighted: boolean
  isOrigin: boolean
  isDestination: boolean
  distanceFromOriginKm: number
  windMs: number
  gustMs: number
  precipMmPerHour: number
  decisiveTempC?: number
  status: WeatherStatus | undefined
  decisiveMetric?: 'wind' | 'gust' | 'precipitation' | 'data'
  decisiveTimeFormatted: string | undefined
  yrnoUrl: string
  googleMapsUrl: string
  metnoUrl: string
  /** Road coordinate (actual route sample point). */
  routeLat: number
  routeLon: number
  /** met.no forecast grid coordinate used for weather values. */
  forecastLat: number
  forecastLon: number
  /** Whether the forecast point is visually distinct from the route point. */
  hasSeparateForecastPoint: boolean
  /** Approximate distance in meters between the route coordinate and the met.no forecast grid point. */
  forecastDistanceFromRouteM: number
  /** Departure time from the active candidate (shown in panel header). */
  departureIso?: string
  /** Estimated arrival time at this route point (dynamic if activeCandidate supplied). */
  etaIso?: string
  /** The forecast hour used for status assessment. */
  forecastTimeIso?: string
  /** Next forecast hour after the decisive time. */
  nextForecast?: NonNullable<RouteWeatherPoint['summaryForWindow']>['nextForecast']
}

/** Estimate the ISO time a route point is reached for a given departure candidate. */
export function estimatePointEtaIso(
  candidate: TravelCandidate,
  pt: RouteWeatherPoint,
  leg: 'outbound' | 'return' = 'outbound',
): string {
  const depMs = new Date(candidate.departureIso).getTime()
  const durMs = new Date(candidate.arrivalIso).getTime() - depMs
  const etaFraction = leg === 'return' ? 1 - pt.routeFraction : pt.routeFraction
  return new Date(depMs + etaFraction * durMs).toISOString()
}

/**
 * Derives a TravelIssue from a TravelCandidate's worst metric.
 * Used by DepartureHeatmap and FerdalagidClient to sync heatmap selection to the audit map.
 */
export function candidateToIssue(
  c: TravelCandidate,
  leg: 'outbound' | 'return' = 'outbound',
  opts?: { routeDistanceM?: number; legStartName?: string; thresholdsUsed?: ResolvedTravelThresholds },
): TravelIssue | undefined {
  if (c.status === 'graent') return undefined
  if (c.reasonCode === 'no_data') return { leg, metric: 'data', reasonCode: 'no_data' }

  function legStartDistance(distFromOrigin: number | undefined): number | undefined {
    if (distFromOrigin === undefined) return undefined
    if (leg === 'return' && opts?.routeDistanceM !== undefined) {
      return opts.routeDistanceM - distFromOrigin
    }
    return distFromOrigin
  }

  if (c.reasonCode === 'precipitation') {
    const m = c.worstPrecip
    const thresh = deriveThreshold('precipitation', c.reasonCode, opts?.thresholdsUsed)
    return {
      leg, metric: 'precipitation', value: m?.value, unit: 'mm/klst',
      thresholdValue: thresh.thresholdValue, thresholdUnit: thresh.thresholdUnit,
      lat: m?.lat, lon: m?.lon, forecastLat: m?.forecastLat, forecastLon: m?.forecastLon,
      distanceFromOriginM: m?.distanceFromOriginM, routeIndex: m?.routeIndex,
      distanceFromLegStartM: legStartDistance(m?.distanceFromOriginM),
      legStartName: opts?.legStartName,
      timeIso: m?.timeIso,
      reasonCode: c.reasonCode,
    }
  }

  const gustVal = c.worstGust?.value ?? 0
  const isTrailer = c.reasonCode?.includes('trailer') ?? false
  const redGustThreshold = opts?.thresholdsUsed?.redGustMs
    ?? (isTrailer ? WEATHER_THRESHOLDS.caravan.redGustMs : WEATHER_THRESHOLDS.driving.redGustMs)
  const useGust = gustVal >= redGustThreshold
  const metricName = useGust ? 'gust' as const : 'wind' as const
  const m = useGust ? c.worstGust : c.worstWind
  const thresh = deriveThreshold(metricName, c.reasonCode, opts?.thresholdsUsed)
  return {
    leg, metric: metricName, value: m?.value, unit: 'm/s',
    thresholdValue: thresh.thresholdValue, thresholdUnit: thresh.thresholdUnit,
    lat: m?.lat, lon: m?.lon, forecastLat: m?.forecastLat, forecastLon: m?.forecastLon,
    distanceFromOriginM: m?.distanceFromOriginM, routeIndex: m?.routeIndex,
    distanceFromLegStartM: legStartDistance(m?.distanceFromOriginM),
    legStartName: opts?.legStartName,
    timeIso: m?.timeIso,
    reasonCode: c.reasonCode,
  }
}

/** Build a display summary for a selected route weather point. */
export function buildPointSummary(
  pt: RouteWeatherPoint,
  highlightedIssue?: TravelIssue,
  activeCandidate?: TravelCandidate,
  activeLeg?: 'outbound' | 'return',
): PointSummary {
  const isHighlighted = !!(
    highlightedIssue?.lat !== undefined &&
    highlightedIssue.lat === pt.lat &&
    highlightedIssue.lon === pt.lon
  )
  const etaIso = activeCandidate
    ? estimatePointEtaIso(activeCandidate, pt, activeLeg ?? 'outbound')
    : pt.summaryForWindow?.etaIso
  // When an activeCandidate is selected, only show summaryForWindow weather metrics for the
  // highlighted issue (which carries active-candidate metric values via candidateToIssue).
  // For all other points, summaryForWindow metrics belong to a different departure window and
  // must not be shown alongside active-candidate departure/ETA times.
  const showSummaryMetrics = !activeCandidate || isHighlighted
  return {
    routeIndex: pt.routeIndex,
    totalPoints: pt.totalRouteWeatherPoints,
    isHighlighted,
    isOrigin: pt.isOrigin ?? false,
    isDestination: !!(pt.isDestinationClosest && !pt.isOrigin),
    distanceFromOriginKm: Math.round(pt.distanceFromOriginM / 1000),
    windMs: showSummaryMetrics ? (pt.summaryForWindow?.worstWindMs ?? 0) : 0,
    gustMs: showSummaryMetrics ? (pt.summaryForWindow?.worstGustMs ?? 0) : 0,
    precipMmPerHour: showSummaryMetrics ? (pt.summaryForWindow?.worstPrecipMmPerHour ?? 0) : 0,
    decisiveTempC: showSummaryMetrics ? pt.summaryForWindow?.decisiveTempC : undefined,
    status: showSummaryMetrics ? pt.summaryForWindow?.status : undefined,
    decisiveMetric: showSummaryMetrics ? pt.summaryForWindow?.decisiveMetric : undefined,
    decisiveTimeFormatted: showSummaryMetrics && pt.summaryForWindow?.decisiveTimeIso
      ? formatKlTime(pt.summaryForWindow.decisiveTimeIso)
      : undefined,
    yrnoUrl: pt.yrnoUrl,
    googleMapsUrl: pt.googleMapsUrl,
    metnoUrl: pt.metnoUrl,
    routeLat: pt.lat,
    routeLon: pt.lon,
    forecastLat: pt.forecastLat,
    forecastLon: pt.forecastLon,
    hasSeparateForecastPoint: shouldShowForecastPointMarker(pt),
    forecastDistanceFromRouteM: Math.round(haversineMeters(getRoutePointLatLng(pt), getForecastPointLatLng(pt))),
    departureIso: activeCandidate?.departureIso,
    etaIso,
    forecastTimeIso: activeCandidate ? undefined : pt.summaryForWindow?.forecastTimeIso,
    nextForecast: activeCandidate ? undefined : pt.summaryForWindow?.nextForecast,
  }
}
