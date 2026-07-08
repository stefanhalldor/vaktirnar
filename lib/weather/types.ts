export type WeatherStatus = 'graent' | 'gult' | 'rautt'

export type HourPoint = {
  time: string
  airTemperatureC: number
  windSpeedMs: number
  windGustMs: number
  windFromDegrees: number
  precipitationMmPerHour: number
  symbolCode: string
}

export type GolfWindow = {
  fromIso: string
  toIso: string
  maxWindMs: number
  maxGustMs: number
  maxPrecipMmPerHour: number
  avgTempC: number
  stada: WeatherStatus
}

export type TravelPointForecast = {
  hours: HourPoint[]
  lat: number
  lon: number
  /** Rounded coordinates actually sent to met.no (via roundCoord). */
  forecastLat: number
  forecastLon: number
  routeIndex: number
  distanceFromOriginM: number
}

export type WorstMetric = {
  value: number
  timeIso: string
  lat?: number
  lon?: number
  /** Rounded met.no forecast coordinates for this point. */
  forecastLat?: number
  forecastLon?: number
  /** Direct link to the met.no compact forecast for this point. */
  metnoUrl?: string
  /** Human-readable yr.no forecast page for this point. */
  yrnoUrl?: string
  routeIndex?: number
  distanceFromOriginM?: number
  routeFraction?: number
}

export type RouteWeatherPoint = {
  id: string
  routeIndex: number
  totalRouteWeatherPoints: number
  lat: number
  lon: number
  forecastLat: number
  forecastLon: number
  distanceFromOriginM: number
  routeFraction: number
  isOrigin?: boolean
  isDestinationClosest?: boolean
  isHighlightedIssue?: boolean
  googleMapsUrl: string
  metnoUrl: string
  /** Human-readable yr.no forecast page for this point. */
  yrnoUrl: string
  summaryForWindow?: {
    status: WeatherStatus
    worstWindMs: number
    worstGustMs: number
    worstPrecipMmPerHour: number
    decisiveTempC?: number
    decisiveMetric?: 'wind' | 'gust' | 'precipitation' | 'data'
    decisiveTimeIso?: string
    /** Estimated time of arrival at this route point for the summary candidate. */
    etaIso?: string
    /** Alias for decisiveTimeIso — the forecast hour used for status assessment. */
    forecastTimeIso?: string
    /** Next available forecast hour after the decisive time. */
    nextForecast?: {
      timeIso: string
      status: WeatherStatus
      trend: 'better' | 'worse' | 'same'
      windMs: number
      gustMs: number
      precipMmPerHour: number
    }
  }
}

/** Per-point status for a single departure candidate. Only non-green entries stored (delta encoding). */
export type CandidatePointStatus = {
  routeIndex: number
  status: 'gult' | 'rautt' | 'no_data'
}

export type TravelCandidate = {
  departureIso: string
  arrivalIso: string
  status: WeatherStatus
  reasonCode?: string
  worstWind?: WorstMetric
  worstGust?: WorstMetric
  worstPrecip?: WorstMetric
  /** Per-point statuses for timeline-driven map coloring. Only non-green entries present. */
  pointStatuses?: CandidatePointStatus[]
}

export type TravelWindow = {
  fromIso: string
  toIso: string
  status: WeatherStatus
  reasonCode?: string
}

export type TravelIssue = {
  leg: 'outbound' | 'return'
  metric: 'wind' | 'gust' | 'precipitation' | 'data'
  value?: number
  unit?: 'm/s' | 'mm/klst'
  thresholdValue?: number
  thresholdUnit?: 'm/s' | 'mm/klst'
  timeIso?: string
  lat?: number
  lon?: number
  distanceFromOriginM?: number
  routeFraction?: number
  reasonCode?: string
  routeIndex?: number
  forecastLat?: number
  forecastLon?: number
  /** Raw met.no API URL for this point. */
  metnoUrl?: string
  /** Google Maps URL for the road coordinate of this point. */
  googleMapsUrl?: string
  /** Human-readable yr.no forecast page for this point. */
  yrnoUrl?: string
  /** Distance from the start of this leg (origin for outbound, destination for return). */
  distanceFromLegStartM?: number
  /** Name of the start point for this leg. */
  legStartName?: string
}

export type NextCaution = {
  /** ISO departure of the first future non-green outbound candidate. Undefined = no caution found. */
  departureIso?: string
  arrivalIso?: string
  status?: Exclude<WeatherStatus, 'graent'>
  reasonCode?: string
  issue?: TravelIssue
  /** How many hours ahead were scanned. */
  scannedHours: number
}

export type RouteWeatherSamplingDiagnostics = {
  mode: 'all_unique_forecast_points' | 'distance_capped'
  rawRoutePointCount: number
  /** Unique ~1km-grid forecast cells found along the route. */
  uniqueForecastPointCount: number
  selectedWeatherPointCount: number
  targetSpacingM?: number
  cap?: number
}

export type TravelPlan = {
  route: {
    originName: string
    destinationName: string
    distanceKm: number
    durationMinutes: number
    /** Sampled route polyline points for audit map rendering (max 80). */
    auditPolylinePoints?: Array<{ lat: number; lon: number }>
    /** Google Static Maps URL showing route line + weather point markers. */
    auditMapUrl?: string
  }
  samplingDiagnostics?: RouteWeatherSamplingDiagnostics
  outbound: {
    earliestDepartureIso: string
    latestArrivalIso?: string
    latestDepartureIso?: string
    candidates: TravelCandidate[]
    bestWindow?: TravelWindow
    badWindows: TravelWindow[]
    leavingAt?: TravelCandidate
    windowMode: boolean
    nextCaution?: NextCaution
    /** Hourly timeline for single-departure mode (from departure to the full forecast coverage limit). */
    timelineCandidates?: TravelCandidate[]
  }
  return?: {
    earliestReturnDepartureIso: string
    latestHomeIso: string
    latestReturnDepartureIso: string
    candidates: TravelCandidate[]
    bestWindow?: TravelWindow
    badWindows: TravelWindow[]
  }
  highlightedIssue?: TravelIssue
  /** All sampled route weather points for auditability. */
  routeWeatherPoints?: RouteWeatherPoint[]
  /** Resolved thresholds actually used for this calculation. */
  thresholdsUsed?: ResolvedTravelThresholds
}

export type DeterministicResult = {
  id: string
  source: 'deterministic'
  toolName: string
  createdAt: string
  svar: string
  stada: WeatherStatus
  reasonCode?: string
  facts?: string[]
  suggestedAction?: string
  timeWindow?: { from?: string; to?: string }
  windows?: GolfWindow[]
  travelPlan?: TravelPlan
}

export type AiResult = {
  svar: string
  adgerd?: string
  toolResultId: string
}

export type WeatherAnswerEnvelope = {
  deterministic: DeterministicResult
  ai?: AiResult
  displayed: {
    source: 'ai' | 'deterministic'
    svar: string
    adgerd?: string
  }
  place?: {
    name: string
    lat: number
    lon: number
    staticMapUrl?: string
  }
}

export type ResolvedPlace = {
  name: string
  lat: number
  lon: number
}

export type LodgingKind = 'none' | 'tent' | 'tent_trailer' | 'folding_camper' | 'caravan' | 'indoor' | 'other'

export type TravelThresholdOverrides = {
  cautionWindMs?: number
  redWindMs?: number
  redGustMs?: number
  cautionPrecipMmPerHour?: number
}

export type ResolvedTravelThresholds = {
  cautionWindMs: number
  redWindMs: number
  redGustMs: number
  cautionPrecipMmPerHour: number
}
