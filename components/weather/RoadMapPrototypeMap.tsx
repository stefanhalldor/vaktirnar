'use client'

// MapLibre CSS is loaded by route layout (app/auth-mvp/vedrid/road-map-prototype/layout.tsx).
import { type FormEvent, type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { VEGAGERDIN_ATTRIBUTION, OPENSTREETMAP_ATTRIBUTION } from '@/lib/iceland-routes/openDataSources'
import type { RouteOption } from '@/lib/weather/provider.types'
import type { DeterministicResult, ForecastDrawerRow, ResolvedTravelThresholds, TravelCandidate, WeatherStatus } from '@/lib/weather/types'
import {
  normalizeWeatherChaseVisibleHours,
  type WeatherChaseVisibleHour,
} from '@/lib/weather/chasePreferences'
import type { StationExplorerResponse } from '@/lib/weather/providers/vedurstofanStationExplorer'
import type { VegagerdinCurrentStationDto } from '@/lib/weather/providers/vegagerdinCurrentTypes'
import { buildTravelBridgeMapData } from '@/lib/road-intelligence/travelBridgeMapData'
import {
  parsePlaceSearchResults,
  selectBestPlaceForQuery,
  type RoadIntelligencePlaceResult,
} from '@/lib/road-intelligence/placeSearchBridge'
import {
  ROAD_MAP_PLACES,
  findRoadMapPlaceSuggestions,
  mergePlaceSuggestions,
  type RoadMapPlace,
} from '@/lib/road-intelligence/roadMapPlaces'
import {
  ROAD_SEGMENT_STATUS_COLORS,
} from '@/lib/road-intelligence/vegagerdinSegments'
import {
  VEGAGERDIN_PROVIDER_ROUTE_MAX_DISTANCE_M,
  matchProviderPointsToRoute,
  pointToPolylineDistanceM,
  type ProviderRouteMatch,
  type ProviderRoutePoint,
} from '@/lib/weather/providerRouteMatching'
import {
  buildRouteSurfaceBbox,
  summarizeRouteRoadSurface,
  type RouteSurfaceSummary,
} from '@/lib/road-intelligence/vegagerdinRoadSurface'
import { formatCompactDateTime, formatKlTime, formatNum } from './travelAuditMap.helpers'
import { resolveThresholds, validateResolvedThresholdOrdering } from '@/lib/weather/thresholds'
import {
  ALL_WIND_DISPLAY_STATUSES,
  DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES,
  WIND_STATUS_META,
  classifyForecastWindDisplayStatusAt,
  classifyNearestForecastWindDisplayStatusAt,
  classifyObservationWindDisplayStatus,
  classifyPointWindDisplayStatus,
  selectForecastRowAt,
  selectNearestForecastRowAt,
  toSimpleWindDisplayStatus,
  worstWindDisplayStatus,
  WIND_STATUS_MARKER_COLOR,
  type WindDisplayStatus,
} from '@/lib/weather/windDisplayStatus'
import type { ForecastTimeScrubberSlot } from '@/components/weather/ForecastTimeScrubber'
import { WeatherSourceTimeSelector } from './WeatherSourceTimeSelector'
import { WindStatusFilterPills, type WindStatusFilterMode } from './WindStatusFilterPills'
import { DepartureHeatmap } from './DepartureHeatmap'
import { ConditionsFeedPreview } from './ConditionsFeedPreview'
import {
  WeatherChasePanel,
  preferenceItemFromWeatherChaseItem,
  type WeatherChaseCriteria,
  type WeatherChaseItem,
  type WeatherChasePreferenceItem,
  type WeatherChaseSaveStatus,
} from './WeatherChasePanel'
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
import { useConditionsFeedPreview } from '@/lib/weather/useConditionsFeedPreview'
import { vedurstofanPulseHref, vegagerdinPulseHref } from '@/lib/weather/pulseTarget'
import { haversineDistanceM } from '@/lib/weather/nearestStations'
import type { VedurstofanTravelLayer } from '@/lib/weather/providers/vedurstofanBlend'
import type {
  VegagerdinRouteLayer,
  VegagerdinRouteLayerPoint,
} from '@/lib/road-intelligence/vegagerdinRouteLayer'
import {
  worstWindDisplayStatusFromCounts,
  countVedurstofanForecastStatusesAt,
  windDisplayStatusToTravelStatus,
} from '@/lib/road-intelligence/routeSlotStatuses'

// CartoDB Voyager basemap (XYZ tiles, CORS open, no proxy needed).
// LMI_Island_einfalt was too simplified at zoom 6 — can be revisited with a better LMÍ layer.
const CARTO_VOYAGER_TILES = ['https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png']
const CARTO_ATTRIBUTION = `${OPENSTREETMAP_ATTRIBUTION} | © CARTO`

// Vegagerðin road network via same-origin allowlisted proxy (CORS not open to browser).
const VEGAGERDIN_VEGAKERFI_TILES = [
  '/api/teskeid/road-intelligence/map-proxy?source=vegakerfi&bbox={bbox-epsg-3857}',
]

const ICELAND_CENTER: [number, number] = [-18.9, 64.9]
const ICELAND_ZOOM = 6
const DEFAULT_ROUTE_THRESHOLDS = resolveThresholds('none')
const WIND_DISPLAY_STATUS_SET = new Set<string>(ALL_WIND_DISPLAY_STATUSES)
const VEGAGERDIN_ROUTE_FALLBACK_MAX_DISTANCE_M = 12_000
const VEGAGERDIN_ROUTE_FALLBACK_MAX_POINTS = 40
const WEATHER_CHASE_LOCAL_STORAGE_KEY = 'teskeid_weather_chase_preferences_v1'
const WEATHER_CHASE_PENDING_STORAGE_KEY = 'teskeid_weather_chase_preferences_pending_v1'
const DEFAULT_WEATHER_CHASE_CRITERIA: WeatherChaseCriteria = {
  minTemperatureC: null,
  maxWindMs: null,
  maxPrecipitationMmPerHour: null,
}

function shouldLogRoadMapDiagnostics(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_ROAD_INTELLIGENCE_DEBUG === 'true'
}

function logRoadMapDiagnostic(message: string, details?: Record<string, unknown>) {
  if (!shouldLogRoadMapDiagnostics()) return
  if (details) {
    console.info(`[RoadMap][diagnostic] ${message}`, details)
  } else {
    console.info(`[RoadMap][diagnostic] ${message}`)
  }
}

const ROAD_SEGMENT_COLOR_EXPRESSION = [
  'case',
  ['has', 'teskeidRoadStatusColor'],
  ['to-color', ['get', 'teskeidRoadStatusColor']],
  '#64748b',
]

const ROAD_SEGMENT_WIDTH_EXPRESSION = [
  'interpolate',
  ['linear'],
  ['zoom'],
  5, 1.4,
  8, 2.4,
  11, 4,
]

// Road condition legend entries in severity order.
const ROAD_CONDITION_LEGEND = [
  { color: ROAD_SEGMENT_STATUS_COLORS.clear,     label: 'Greiðfært' },
  { color: ROAD_SEGMENT_STATUS_COLORS.caution,   label: 'Varasamt' },
  { color: ROAD_SEGMENT_STATUS_COLORS.difficult, label: 'Erfitt' },
  { color: ROAD_SEGMENT_STATUS_COLORS.danger,    label: 'Hættulegt' },
  { color: ROAD_SEGMENT_STATUS_COLORS.closed,    label: 'Lokað' },
] as const

const TRAVEL_ROUTE_COLOR = '#14532d'
const OVERVIEW_WEATHER_MARKER_COLOR = '#475569'
const OVERVIEW_DENSITY_COMPACT_ZOOM = 5.8
const OVERVIEW_DENSITY_FULL_ZOOM = 7.2
const OVERVIEW_DENSITY_AGGREGATE_CELL_PX = 118
const OVERVIEW_DENSITY_COMPACT_CELL_PX = 82
const OVERVIEW_DENSITY_FULL_CELL_PX = 70
const OVERVIEW_AGGREGATE_REGIONS = [
  { id: 'isafjordur', name: 'Ísafjörður', lon: -23.1240, lat: 66.0747 },
  { id: 'reykjavik', name: 'Reykjavík', lon: -21.9426, lat: 64.1466 },
  { id: 'akureyri', name: 'Akureyri', lon: -18.1002, lat: 65.6885 },
  { id: 'egilsstadir', name: 'Egilsstaðir', lon: -14.3948, lat: 65.2674 },
  { id: 'hofn', name: 'Höfn', lon: -15.2082, lat: 64.2539 },
  { id: 'vik', name: 'Vík', lon: -19.0083, lat: 63.4186 },
  { id: 'selfoss', name: 'Selfoss', lon: -20.9971, lat: 63.9331 },
] as const
const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] } as const
const TRAVEL_METNO_LAYER_ID = 'travel-bridge-weather-points'
const VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID = 'vedurstofan-route-stations'
const VEGAGERDIN_ROUTE_STATIONS_LAYER_ID = 'vegagerdin-route-stations'
const OVERVIEW_VEGAGERDIN_LAYER_ID = 'overview-vegagerdin-stations'
const OVERVIEW_VEDURSTOFAN_LAYER_ID = 'overview-vedurstofan-stations'
const ROUTE_FILTER_LAYER_IDS = [
  TRAVEL_METNO_LAYER_ID,
  VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID,
  VEGAGERDIN_ROUTE_STATIONS_LAYER_ID,
] as const
const OVERVIEW_FILTER_LAYER_IDS = [
  OVERVIEW_VEGAGERDIN_LAYER_ID,
  OVERVIEW_VEDURSTOFAN_LAYER_ID,
] as const
const LEGACY_OVERVIEW_LAYER_IDS = ['station-markers'] as const
const TRAVEL_POINT_COLOR_EXPRESSION = [
  'match',
  ['get', 'windDisplayStatus'],
  'haettulegt', WIND_STATUS_MARKER_COLOR['haettulegt'],
  'nalgast-haettumork', WIND_STATUS_MARKER_COLOR['nalgast-haettumork'],
  'othaegilegt', WIND_STATUS_MARKER_COLOR['othaegilegt'],
  'nalgast-othaegindi', WIND_STATUS_MARKER_COLOR['nalgast-othaegindi'],
  'no_data', WIND_STATUS_MARKER_COLOR['no_data'],
  'no_wind_data', WIND_STATUS_MARKER_COLOR['no_wind_data'],
  WIND_STATUS_MARKER_COLOR['innan-marka'],
]
type RouteBridgeSummary = {
  fromName: string
  toName: string
  selectedRouteId: string | null
  status: DeterministicResult['stada']
  distanceKm: number
  durationMinutes: number
  metnoPointCount: number
  answer: string
  statusCounts: Partial<Record<WindDisplayStatus, number>>
  thresholdsUsed: ResolvedTravelThresholds
  vedurstofanStationCount: number
  vegagerdinStationCount: number
  slotStatusSource: RouteSlotStatusSource
}

type RouteSurfaceChoice = {
  routeId: string
  routeIndex: number
  label: string
  description: string
  distanceKm: number
  durationMinutes: number
  surfaceSummary: RouteSurfaceSummary | null
  route: RouteOption
}

type RouteLabelAnchor = 'center' | 'top' | 'bottom' | 'left' | 'right'

type RouteLabelPlacement = {
  layout: 'vertical' | 'horizontal'
  anchor: RouteLabelAnchor
  offset: [number, number]
}

type ResolvedRoutePlaces = {
  origin: RoadIntelligencePlaceResult
  destination: RoadIntelligencePlaceResult
}

type VegagerdinCurrentApiData =
  | {
      status: 'ok'
      cacheStatus: VegagerdinRouteLayer['cacheStatus']
      measurementFreshness: VegagerdinRouteLayer['measurementFreshness']
      fetchedAtIso: string
      oldestMeasuredAtIso: string | null
      stations: VegagerdinCurrentStationDto[]
    }
  | {
      status: 'unavailable'
      stations: []
    }

type RoadIntelligenceStationMarkerProperties = {
  stationId?: unknown
  stationName?: unknown
  meanWindMs?: unknown
  gustMs?: unknown
  windDirectionDeg?: unknown
  airTemperatureC?: unknown
  measuredAtIso?: unknown
}

type RoadIntelligenceStationMarkerFeature = {
  type?: unknown
  geometry?: {
    type?: unknown
    coordinates?: unknown
  }
  properties?: RoadIntelligenceStationMarkerProperties
}

type RouteSlotStatusSource = 'providers' | 'vegagerdin' | 'vedurstofan' | 'fallback'
type RouteWeatherMode = 'now' | 'forecast'
type RouteForecastBuildStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'
const ROUTE_TIMELINE_INITIAL_SLOT_COUNT = 8
const ROUTE_TIMELINE_TOTAL_SLOT_COUNT = 25
const ROUTE_TIMELINE_INITIAL_HOURLY_SLOT_COUNT = 6

type RouteForecastBuildContext = {
  timelineCandidates: TravelCandidate[]
  thresholds: ResolvedTravelThresholds
  routeDurationMinutes: number
  vedurstofanLayer: VedurstofanTravelLayer | undefined
  vedurstofanStationCount: number
  vegagerdinStatusCounts: Partial<Record<WindDisplayStatus, number>>
  vegagerdinStationCount: number
  nowWorstStatus: WindDisplayStatus
  signal: AbortSignal
}

function getRouteDepartureCandidates(result: DeterministicResult): TravelCandidate[] | null {
  const outbound = result.travelPlan?.outbound
  if (!outbound) return null
  const candidates = outbound.windowMode
    ? outbound.candidates
    : outbound.timelineCandidates ?? outbound.candidates
  return candidates.length > 0 ? candidates : null
}

function nextWholeUtcHourAfter(ms: number): number {
  const d = new Date(ms)
  d.setUTCMinutes(0, 0, 0)
  const wholeHourMs = d.getTime()
  return wholeHourMs <= ms ? wholeHourMs + 3_600_000 : wholeHourMs
}

function readStationMarkerFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readStationMarkerString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function cloneRouteCandidateForDeparture(
  seed: TravelCandidate,
  departureMs: number,
  durationMinutes: number,
): TravelCandidate {
  const departureIso = new Date(departureMs).toISOString()
  const durationMs = Math.max(0, durationMinutes) * 60_000
  return {
    ...seed,
    departureIso,
    arrivalIso: new Date(departureMs + durationMs).toISOString(),
    status: 'graent',
    reasonCode: undefined,
    worstWind: undefined,
    worstGust: undefined,
    worstPrecip: undefined,
    pointStatuses: undefined,
    displayPoint: undefined,
    arrivalWeather: undefined,
  }
}

function buildRouteTimelineCandidates(
  result: DeterministicResult,
  durationMinutes: number,
): TravelCandidate[] | null {
  const existing = getRouteDepartureCandidates(result)
  const outbound = result.travelPlan?.outbound
  const seed =
    existing?.[0] ??
    outbound?.leavingAt ??
    outbound?.candidates?.[0] ??
    null
  if (!seed) return existing

  const seedDepartureMs = Date.parse(seed.departureIso)
  if (!Number.isFinite(seedDepartureMs)) return existing

  const candidates: TravelCandidate[] = [seed]
  let nextDepartureMs = nextWholeUtcHourAfter(seedDepartureMs)
  while (candidates.length < ROUTE_TIMELINE_INITIAL_HOURLY_SLOT_COUNT + 1) {
    candidates.push(cloneRouteCandidateForDeparture(seed, nextDepartureMs, durationMinutes))
    nextDepartureMs += 3_600_000
  }

  while (candidates.length < ROUTE_TIMELINE_TOTAL_SLOT_COUNT) {
    candidates.push(cloneRouteCandidateForDeparture(seed, nextDepartureMs, durationMinutes))
    nextDepartureMs += 3_600_000
  }

  return candidates
}

function buildSyntheticRouteTimelineCandidates(
  durationMinutes: number,
  nowStatus: WindDisplayStatus,
): TravelCandidate[] {
  const departureMs = Date.now()
  const seed: TravelCandidate = {
    departureIso: new Date(departureMs).toISOString(),
    arrivalIso: new Date(departureMs + Math.max(0, durationMinutes) * 60_000).toISOString(),
    status: windDisplayStatusToTravelStatus(nowStatus),
  }
  const candidates: TravelCandidate[] = [seed]
  let nextDepartureMs = nextWholeUtcHourAfter(departureMs)
  while (candidates.length < ROUTE_TIMELINE_TOTAL_SLOT_COUNT) {
    candidates.push(cloneRouteCandidateForDeparture(seed, nextDepartureMs, durationMinutes))
    nextDepartureMs += 3_600_000
  }

  return candidates
}

function countStatusesTotal(counts: Partial<Record<WindDisplayStatus, number>>): number {
  return ALL_WIND_DISPLAY_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0)
}

function newestVegagerdinRouteMeasuredAtIso(
  points: ReadonlyArray<Pick<VegagerdinRouteLayerPoint, 'measuredAtIso'>>,
): string | null {
  let newestMs = -Infinity
  let newestIso: string | null = null
  for (const point of points) {
    if (!point.measuredAtIso) continue
    const timeMs = Date.parse(point.measuredAtIso)
    if (Number.isFinite(timeMs) && timeMs > newestMs) {
      newestMs = timeMs
      newestIso = point.measuredAtIso
    }
  }
  return newestIso
}

function buildDepartureForecastSlotStatusOverrides(
  context: RouteForecastBuildContext,
): WindDisplayStatus[] | null {
  if (!context.vedurstofanLayer || context.vedurstofanStationCount <= 0) return null

  return context.timelineCandidates.map(candidate => {
    const departureMs = Date.parse(candidate.departureIso)
    const counts = countVedurstofanForecastStatusesAt(
      context.vedurstofanLayer,
      context.routeDurationMinutes,
      context.thresholds,
      Number.isFinite(departureMs) ? departureMs : Date.now(),
    )
    return worstWindDisplayStatusFromCounts(counts) ?? 'no_data'
  })
}

function nearestProviderPointDiagnostics<T extends ProviderRoutePoint>(
  points: readonly T[],
  routePolyline: ReadonlyArray<{ lat: number; lon: number }>,
) {
  if (routePolyline.length < 2) return []
  return points
    .filter((point): point is T & { lat: number; lon: number } =>
      typeof point.lat === 'number' &&
      Number.isFinite(point.lat) &&
      typeof point.lon === 'number' &&
      Number.isFinite(point.lon),
    )
    .map(point => ({
      id: point.id,
      name: point.name ?? null,
      distanceM: Math.round(pointToPolylineDistanceM(point.lat, point.lon, routePolyline)),
    }))
    .sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id))
    .slice(0, 8)
}

function matchVegagerdinPointsToRoute<T extends ProviderRoutePoint>({
  points,
  routePolyline,
  debugLabel,
}: {
  points: readonly T[]
  routePolyline: ReadonlyArray<{ lat: number; lon: number }>
  debugLabel: string
}): ProviderRouteMatch<T>[] {
  const strictMatches = matchProviderPointsToRoute({
    points,
    routePolyline,
    maxDistanceM: VEGAGERDIN_PROVIDER_ROUTE_MAX_DISTANCE_M,
  })
  if (strictMatches.length > 0) {
    logRoadMapDiagnostic('vegagerdin route match', {
      debugLabel,
      mode: 'strict',
      routePointCount: routePolyline.length,
      providerPointCount: points.length,
      strictCount: strictMatches.length,
      wideCount: null,
      nearest: strictMatches.slice(0, 8).map(match => ({
        id: match.point.id,
        name: match.point.name ?? null,
        distanceM: Math.round(match.distanceM),
        distanceFromOriginM: Math.round(match.distanceFromOriginM),
      })),
    })
    return strictMatches
  }

  const wideMatches = matchProviderPointsToRoute({
    points,
    routePolyline,
    maxDistanceM: VEGAGERDIN_ROUTE_FALLBACK_MAX_DISTANCE_M,
    maxPoints: VEGAGERDIN_ROUTE_FALLBACK_MAX_POINTS,
  })
  logRoadMapDiagnostic('vegagerdin route match', {
    debugLabel,
    mode: wideMatches.length > 0 ? 'wide-fallback' : 'no-match',
    routePointCount: routePolyline.length,
    providerPointCount: points.length,
    strictCount: strictMatches.length,
    wideCount: wideMatches.length,
    nearest: wideMatches.length > 0
      ? wideMatches.slice(0, 8).map(match => ({
          id: match.point.id,
          name: match.point.name ?? null,
          distanceM: Math.round(match.distanceM),
          distanceFromOriginM: Math.round(match.distanceFromOriginM),
        }))
      : nearestProviderPointDiagnostics(points, routePolyline),
  })
  return wideMatches
}

type RoadMapPrototypeLabels = {
  roadFallback: (number: string) => string
  unknownRoad: string
  unknownCondition: string
  drivingTime: (value: string) => string
  routePointTitle: (index: string, total: string) => string
  routePointDistance: (value: string) => string
  routePointEta: (value: string) => string
  routePointWind: (value: string) => string
  routePointGust: (value: string) => string
  routePointPrecip: (value: string) => string
  routeStationMeasured: (value: string) => string
  routeStationAirTemp: (value: string) => string
  routeStationRoadTemp: (value: string) => string
  routeStationNoWind: string
  routeStationStale: string
  routeMarkerWindDirection: (value: string) => string
  routeMarkerWind: (value: string) => string
  routeMarkerTemperature: (value: string) => string
  routeMarkerPrecipitation: (value: string) => string
  routeMarkerRoadTemperature: (value: string) => string
  routeMarkerEta: (value: string) => string
  routeMarkerTemperatureTitle: string
  routeMarkerPrecipitationTitle: string
  routeMarkerRoadTemperatureTitle: string
}

type RouteBridgeField = 'from' | 'to'

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function windDirectionTextToArrow(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase()
  if (!normalized) return '•'

  const map: Record<string, string> = {
    N: '↓',
    NNA: '↓',
    NA: '↙',
    ANA: '↙',
    A: '←',
    ASA: '←',
    SA: '↖',
    SSA: '↖',
    S: '↑',
    SSV: '↑',
    SV: '↗',
    VSV: '↗',
    V: '→',
    VNV: '→',
    NV: '↘',
    NNV: '↘',
  }

  return map[normalized] ?? normalized
}

function weatherEmojiFromText(
  text: string | null | undefined,
  precipitationMmPerHour?: number | null,
): string {
  const normalized = text?.trim().toLocaleLowerCase('is') ?? ''
  if (normalized.includes('þrum')) return '🌩️'
  if (normalized.includes('snjó') || normalized.includes('él') || normalized.includes('hríð')) return '🌨️'
  if (
    normalized.includes('rign') ||
    normalized.includes('súld') ||
    normalized.includes('skúr') ||
    normalized.includes('úrkoma')
  ) {
    return '🌧️'
  }
  if (normalized.includes('þok') || normalized.includes('mistur')) return '🌫️'
  if (normalized.includes('léttský') || normalized.includes('hálfský')) return '🌤️'
  if (normalized.includes('ský')) return '☁️'
  if (normalized.includes('sól') || normalized.includes('bjart') || normalized.includes('heið')) return '☀️'
  if (typeof precipitationMmPerHour === 'number' && precipitationMmPerHour > 0.1) return '🌧️'
  return '💨'
}

function degreesToIcelandicDirection(deg: number): string {
  const dirs = ['N', 'NA', 'A', 'SA', 'S', 'SV', 'V', 'NV']
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8]
}

function metnoSymbolToEmoji(symbolCode: string | null | undefined): string | null {
  if (!symbolCode) return null
  const code = symbolCode.replace(/_day$|_night$|_polartwilight$/, '')
  if (code === 'clearsky' || code === 'fair') return '☀️'
  if (code === 'partlycloudy') return '⛅'
  if (code === 'cloudy') return '☁️'
  if (code === 'fog') return '🌫️'
  if (code.includes('thunder')) return '⛈️'
  if (code.includes('snow') || code.includes('sleet')) return '🌨️'
  if (code.includes('rain') || code.includes('shower')) return '🌧️'
  return null
}

type RoadMapForecastMetricDirection = ForecastDrawerRow['wind']['direction']
type RoadMapForecastMetricTone = ForecastDrawerRow['wind']['tone']

function roadMapForecastDirection(delta: number | undefined, epsilon: number): RoadMapForecastMetricDirection {
  if (delta === undefined) return 'none'
  if (Math.abs(delta) < epsilon) return 'steady'
  return delta > 0 ? 'up' : 'down'
}

function roadMapForecastTone(
  direction: RoadMapForecastMetricDirection,
  lowerIsBetter: boolean,
): RoadMapForecastMetricTone {
  if (direction === 'none' || direction === 'steady') return 'neutral'
  if (lowerIsBetter) return direction === 'down' ? 'positive' : 'negative'
  return direction === 'up' ? 'positive' : 'negative'
}

function classifyRoadMapForecastStatus(
  windMs: number,
  precipMmPerHour: number,
  thresholds: ResolvedTravelThresholds,
): WeatherStatus {
  if (windMs >= thresholds.redWindMs) return 'rautt'
  if (windMs >= thresholds.cautionWindMs || precipMmPerHour > thresholds.cautionPrecipMmPerHour) {
    return 'gult'
  }
  return 'graent'
}

function buildRoadMapForecastDrawerRows(
  forecasts: StationExplorerResponse['stations'][number]['forecasts'],
  thresholds: ResolvedTravelThresholds,
): ForecastDrawerRow[] {
  const rows: ForecastDrawerRow[] = []

  for (const forecast of forecasts) {
    if (forecast.windSpeedMs === null || forecast.temperatureC === null) continue

    const windMs = forecast.windSpeedMs
    const temperatureC = forecast.temperatureC
    const precipitationMmPerHour = forecast.precipitationMmPerHour ?? 0
    const prev = rows[rows.length - 1]

    const windDelta = prev ? +(windMs - prev.wind.value).toFixed(1) : undefined
    const windDirection = roadMapForecastDirection(windDelta, 0.5)
    const tempDelta = prev ? +(temperatureC - prev.temperature.value).toFixed(1) : undefined
    const tempDirection = roadMapForecastDirection(tempDelta, 0.5)
    const precipDelta = prev ? +(precipitationMmPerHour - prev.precipitation.value).toFixed(2) : undefined
    const precipDirection = roadMapForecastDirection(precipDelta, 0.1)

    rows.push({
      timeIso: forecast.ftimeIso,
      status: classifyRoadMapForecastStatus(windMs, precipitationMmPerHour, thresholds),
      temperature: {
        value: temperatureC,
        delta: tempDelta,
        direction: tempDirection,
        tone: roadMapForecastTone(tempDirection, false),
      },
      wind: {
        value: windMs,
        delta: windDelta,
        direction: windDirection,
        tone: roadMapForecastTone(windDirection, true),
      },
      gust: {
        value: windMs,
        delta: windDelta,
        direction: windDirection,
        tone: roadMapForecastTone(windDirection, true),
        severity: 'none',
      },
      precipitation: {
        value: precipitationMmPerHour,
        delta: precipDelta,
        direction: precipDirection,
        tone: roadMapForecastTone(precipDirection, true),
      },
      windDirectionText: forecast.windDirectionText ?? null,
      weatherEmoji: forecast.weatherText
        ? weatherEmojiFromText(forecast.weatherText, precipitationMmPerHour)
        : null,
    })
  }

  return rows
}

type RoadMapMetnoHourPoint = {
  time: string
  airTemperatureC: number
  windSpeedMs: number
  windGustMs: number
  windFromDegrees: number
  precipitationMmPerHour: number
  symbolCode: string
}

type RoadMapMetnoPointForecastResponse =
  | {
      status: 'ok'
      forecasts: RoadMapMetnoHourPoint[]
    }
  | {
      status: 'error'
      error?: string
    }

function buildRoadMapMetnoForecastDrawerRows(
  forecasts: RoadMapMetnoHourPoint[],
  thresholds: ResolvedTravelThresholds,
): ForecastDrawerRow[] {
  const rows: ForecastDrawerRow[] = []

  for (const forecast of forecasts) {
    const windMs = forecast.windSpeedMs
    const gustMs = forecast.windGustMs
    const temperatureC = forecast.airTemperatureC
    const precipitationMmPerHour = forecast.precipitationMmPerHour
    if (
      !Number.isFinite(windMs) ||
      !Number.isFinite(temperatureC) ||
      !Number.isFinite(precipitationMmPerHour)
    ) {
      continue
    }

    const prev = rows[rows.length - 1]
    const windDelta = prev ? +(windMs - prev.wind.value).toFixed(1) : undefined
    const windDirection = roadMapForecastDirection(windDelta, 0.5)
    const tempDelta = prev ? +(temperatureC - prev.temperature.value).toFixed(1) : undefined
    const tempDirection = roadMapForecastDirection(tempDelta, 0.5)
    const precipDelta = prev ? +(precipitationMmPerHour - prev.precipitation.value).toFixed(2) : undefined
    const precipDirection = roadMapForecastDirection(precipDelta, 0.1)
    const gustDelta = prev ? +(gustMs - prev.gust.value).toFixed(1) : undefined
    const gustDirection = roadMapForecastDirection(gustDelta, 0.5)

    rows.push({
      timeIso: forecast.time,
      status: classifyRoadMapForecastStatus(windMs, precipitationMmPerHour, thresholds),
      temperature: {
        value: temperatureC,
        delta: tempDelta,
        direction: tempDirection,
        tone: roadMapForecastTone(tempDirection, false),
      },
      wind: {
        value: windMs,
        delta: windDelta,
        direction: windDirection,
        tone: roadMapForecastTone(windDirection, true),
      },
      gust: {
        value: Number.isFinite(gustMs) ? gustMs : windMs,
        delta: gustDelta,
        direction: gustDirection,
        tone: roadMapForecastTone(gustDirection, true),
        severity: 'none',
      },
      precipitation: {
        value: precipitationMmPerHour,
        delta: precipDelta,
        direction: precipDirection,
        tone: roadMapForecastTone(precipDirection, true),
      },
      windDirectionText: Number.isFinite(forecast.windFromDegrees)
        ? degreesToIcelandicDirection(forecast.windFromDegrees)
        : null,
      weatherEmoji: metnoSymbolToEmoji(forecast.symbolCode),
    })
  }

  return rows
}

function isWindDisplayStatus(value: unknown): value is WindDisplayStatus {
  return typeof value === 'string' && WIND_DISPLAY_STATUS_SET.has(value)
}

function classifyVegagerdinObservationStationWindStatus(
  station: Pick<VegagerdinCurrentStationDto, 'meanWindMs' | 'gustLast10MinMs'>,
  thresholds: ResolvedTravelThresholds,
): WindDisplayStatus {
  const status = classifyObservationWindDisplayStatus({
    meanWindMs: station.meanWindMs,
    gustLast10MinMs: station.gustLast10MinMs,
  }, thresholds)
  return status === 'no_data' ? 'no_wind_data' : status
}

function normalizeVegagerdinRoutePointForRender(
  point: VegagerdinRouteLayerPoint,
): VegagerdinRouteLayerPoint | null {
  const raw = point as unknown as Record<string, unknown>
  const lat = readFiniteNumber(raw['lat'])
  const lon = readFiniteNumber(raw['lon'])
  if (lat === null || lon === null) return null

  return {
    ...point,
    lat,
    lon,
    distanceM: readFiniteNumber(raw['distanceM']) ?? point.distanceM,
    distanceFromOriginM: readFiniteNumber(raw['distanceFromOriginM']),
    routeFraction: readFiniteNumber(raw['routeFraction']),
    meanWindMs: readFiniteNumber(raw['meanWindMs']),
    gustLast10MinMs: readFiniteNumber(raw['gustLast10MinMs']),
    windDirectionDeg: readFiniteNumber(raw['windDirectionDeg']),
    airTemperatureC: readFiniteNumber(raw['airTemperatureC']),
    roadTemperatureC: readFiniteNumber(raw['roadTemperatureC']),
    statusWindMs: readFiniteNumber(raw['statusWindMs']),
    windDisplayStatus: isWindDisplayStatus(raw['windDisplayStatus'])
      ? raw['windDisplayStatus']
      : 'no_data',
  }
}

function statusIsVisibleInFilter(
  status: WindDisplayStatus,
  statuses: ReadonlySet<WindDisplayStatus>,
  mode: WindStatusFilterMode,
): boolean {
  if (statuses.size === 0) return true
  if (mode === 'simple') {
    const simpleStatus = toSimpleWindDisplayStatus(status)
    return [...statuses].some(st => toSimpleWindDisplayStatus(st) === simpleStatus)
  }
  return statuses.has(status)
}

function windDisplayStatusForRoutePoint(
  properties: Record<string, unknown>,
  thresholds: ResolvedTravelThresholds,
): WindDisplayStatus {
  if (properties['status'] === 'no_data') return 'no_data'
  const windMs = readFiniteNumber(properties['windMs'])
  return classifyPointWindDisplayStatus(windMs ?? undefined, true, thresholds)
}

function annotateRouteWeatherPointStatuses(
  geojson: Record<string, unknown>,
  thresholds: ResolvedTravelThresholds,
): Record<string, unknown> {
  const features = geojson['features']
  if (!Array.isArray(features)) return geojson

  return {
    ...geojson,
    features: features.map((feature) => {
      if (typeof feature !== 'object' || feature === null) return feature
      const featureRecord = feature as Record<string, unknown>
      const rawProperties = featureRecord['properties']
      const properties =
        typeof rawProperties === 'object' && rawProperties !== null
          ? (rawProperties as Record<string, unknown>)
          : {}
      const windDisplayStatus = windDisplayStatusForRoutePoint(properties, thresholds)
      return {
        ...featureRecord,
        properties: {
          ...properties,
          windDisplayStatus,
        },
      }
    }),
  }
}

function countRouteWeatherPointStatuses(
  geojson: Record<string, unknown>,
): Partial<Record<WindDisplayStatus, number>> {
  const counts: Partial<Record<WindDisplayStatus, number>> = {}
  const features = geojson['features']
  if (!Array.isArray(features)) return counts

  for (const feature of features) {
    if (typeof feature !== 'object' || feature === null) continue
    const rawProperties = (feature as Record<string, unknown>)['properties']
    if (typeof rawProperties !== 'object' || rawProperties === null) continue
    const status = (rawProperties as Record<string, unknown>)['windDisplayStatus']
    if (!isWindDisplayStatus(status)) continue
    counts[status] = (counts[status] ?? 0) + 1
  }

  return counts
}

function countWindDisplayStatuses(
  points: ReadonlyArray<{ windDisplayStatus: WindDisplayStatus }>,
): Partial<Record<WindDisplayStatus, number>> {
  const counts: Partial<Record<WindDisplayStatus, number>> = {}
  for (const point of points) {
    counts[point.windDisplayStatus] = (counts[point.windDisplayStatus] ?? 0) + 1
  }
  return counts
}

function routeStatusFromCounts(
  counts: Partial<Record<WindDisplayStatus, number>>,
): DeterministicResult['stada'] {
  if ((counts['haettulegt'] ?? 0) > 0) return 'rautt'
  if (
    (counts['nalgast-haettumork'] ?? 0) > 0 ||
    (counts['othaegilegt'] ?? 0) > 0
  ) {
    return 'gult'
  }
  return 'graent'
}

function isVedurstofanTravelLayer(value: unknown): value is VedurstofanTravelLayer {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { points?: unknown }).points)
  )
}

function isVegagerdinRouteLayer(value: unknown): value is VegagerdinRouteLayer {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { provider?: unknown }).provider === 'vegagerdin' &&
    Array.isArray((value as { points?: unknown }).points)
  )
}

function canUseMapStyle(map: import('maplibre-gl').Map | null): map is import('maplibre-gl').Map {
  if (!map) return false
  try {
    const style = map.getStyle()
    return Boolean(style && Array.isArray(style.layers) && style.sources)
  } catch {
    return false
  }
}

function expandRouteFilterStatuses(
  statuses: ReadonlySet<WindDisplayStatus>,
  mode: WindStatusFilterMode,
): WindDisplayStatus[] {
  if (mode === 'detailed') return Array.from(statuses)

  const simpleStatuses = new Set(Array.from(statuses, toSimpleWindDisplayStatus))
  return ALL_WIND_DISPLAY_STATUSES.filter(status =>
    simpleStatuses.has(toSimpleWindDisplayStatus(status)),
  )
}

function buildRouteStatusFilter(
  statuses: ReadonlySet<WindDisplayStatus>,
  mode: WindStatusFilterMode,
) {
  if (statuses.size === 0) return null
  return [
    'in',
    ['get', 'windDisplayStatus'],
    ['literal', expandRouteFilterStatuses(statuses, mode)],
  ]
}

function applyRouteStatusFilterToMap(
  map: import('maplibre-gl').Map | null,
  statuses: ReadonlySet<WindDisplayStatus>,
  mode: WindStatusFilterMode,
) {
  if (!map) return
  const filter = buildRouteStatusFilter(statuses, mode)
  for (const layerId of ROUTE_FILTER_LAYER_IDS) {
    if (!map.getLayer(layerId)) continue
    map.setFilter(layerId, filter as Parameters<typeof map.setFilter>[1])
  }
}

function toFiniteCoordinate(value: unknown): number | null {
  const numberValue = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : NaN
  return Number.isFinite(numberValue) ? numberValue : null
}

function bringWeatherLayersToFront(map: import('maplibre-gl').Map | null) {
  if (!canUseMapStyle(map)) return
  for (const layerId of [
    OVERVIEW_VEGAGERDIN_LAYER_ID,
    OVERVIEW_VEDURSTOFAN_LAYER_ID,
    TRAVEL_METNO_LAYER_ID,
    VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID,
    VEGAGERDIN_ROUTE_STATIONS_LAYER_ID,
  ] as const) {
    if (map.getLayer(layerId)) map.moveLayer(layerId)
  }
}

type RoadMapPlaceMarker = {
  marker: import('maplibre-gl').Marker
  element: HTMLButtonElement
  place: RoadMapPlace
}

type VedurstofanRoutePoint = VedurstofanTravelLayer['points'][number] & {
  lat: number
  lon: number
}

type VedurstofanRouteForecastRow = VedurstofanRoutePoint['forecastRows'][number]

type VedurstofanRouteStatusEntry = {
  point: VedurstofanRoutePoint
  windDisplayStatus: WindDisplayStatus
  selectedRow: VedurstofanRouteForecastRow | null
  etaIso: string | null
}

type RouteVedurstofanLabelMarker = {
  marker: import('maplibre-gl').Marker
  element: HTMLButtonElement
  entry: VedurstofanRouteStatusEntry
}

type RouteVegagerdinLabelMarker = {
  marker: import('maplibre-gl').Marker
  element: HTMLButtonElement
  point: VegagerdinRouteLayerPoint
}

type RouteEndpointMarker = {
  marker: import('maplibre-gl').Marker
  element: HTMLDivElement
}

type OverviewStationMarker = {
  marker: import('maplibre-gl').Marker
  element: HTMLButtonElement
  provider: 'vegagerdin' | 'vedurstofan'
  status: WindDisplayStatus
  lat: number
  lon: number
  stationName: string
  overviewLabel: string
  ariaLabel: string
  windMs: number | null
  clusterEmoji: string | null
}

type WeatherChaseMapMarker = {
  marker: import('maplibre-gl').Marker
  element: HTMLButtonElement
  itemId: string
  kind: 'selected' | 'nearby-vedurstofan'
}

type WeatherChasePreferencesPayload = {
  selectedItems: WeatherChasePreferenceItem[]
  criteria: WeatherChaseCriteria
  visibleHours: WeatherChaseVisibleHour[]
}

type OverviewMarkerDensityLevel = 'aggregate' | 'compact' | 'full'
type OverviewAggregateRegion = (typeof OVERVIEW_AGGREGATE_REGIONS)[number]

function clearTimerRef(timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  if (timerRef.current) clearTimeout(timerRef.current)
  timerRef.current = null
}

function abortControllerRef(abortRef: MutableRefObject<AbortController | null>) {
  abortRef.current?.abort()
  abortRef.current = null
}

function normalizeWeatherChaseCriteria(value: unknown): WeatherChaseCriteria {
  const input = typeof value === 'object' && value !== null ? value as Partial<WeatherChaseCriteria> : {}
  const numberOrNull = (raw: unknown, min: number, max: number): number | null => {
    if (raw === null || raw === undefined || raw === '') return null
    const parsed = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
  }

  return {
    minTemperatureC: numberOrNull(input.minTemperatureC, -60, 60),
    maxWindMs: numberOrNull(input.maxWindMs, 0, 80),
    maxPrecipitationMmPerHour: numberOrNull(input.maxPrecipitationMmPerHour, 0, 200),
  }
}

function normalizeWeatherChasePreferenceItems(value: unknown): WeatherChasePreferenceItem[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: WeatherChasePreferenceItem[] = []

  for (const raw of value.slice(0, 24)) {
    if (typeof raw !== 'object' || raw === null) continue
    const item = raw as Record<string, unknown>
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    const providerId = item.providerId
    if (
      !id ||
      seen.has(id) ||
      (providerId !== 'vedurstofan' && providerId !== 'metno' && providerId !== 'vegagerdin')
    ) {
      continue
    }
    seen.add(id)

    const label = typeof item.label === 'string' && item.label.trim()
      ? item.label.trim().slice(0, 120)
      : id
    const lat = typeof item.lat === 'number' && Number.isFinite(item.lat) ? item.lat : null
    const lon = typeof item.lon === 'number' && Number.isFinite(item.lon) ? item.lon : null
    result.push({
      id,
      providerId,
      label,
      ...(lat !== null ? { lat } : {}),
      ...(lon !== null ? { lon } : {}),
    })
  }

  return result
}

function normalizeWeatherChasePreferences(value: unknown): WeatherChasePreferencesPayload | null {
  if (typeof value !== 'object' || value === null) return null
  const input = value as Record<string, unknown>
  return {
    selectedItems: normalizeWeatherChasePreferenceItems(input.selectedItems),
    criteria: normalizeWeatherChaseCriteria(input.criteria),
    visibleHours: normalizeWeatherChaseVisibleHours(input.visibleHours),
  }
}

/**
 * MapLibre GL JS map for the Road Intelligence M2A prototype.
 *
 * Layers:
 *  1. CartoDB Voyager raster basemap (public XYZ, CORS open)
 *  2. Vegagerðin road network raster overlay (same-origin proxy)
 *  3. Neutral provider weather station markers for current/forecast overview
 *
 * Container note: containerRef uses h-full w-full (not absolute inset-0) because
 * MapLibre adds .maplibregl-map { position: relative } to the container element,
 * which would override Tailwind's `absolute` and collapse inset-0 to zero height.
 * h-full w-full survives that override.
 *
 * No user GPS. No Supabase writes. No routing advice.
 * Visible only to users with road-intelligence-v1 feature flag.
 */
export function RoadMapPrototypeMap({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const t = useTranslations('teskeid.vedrid.overview')
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const tPulse = useTranslations('teskeid.vedrid.eltaVedrid')
  const locale = useLocale()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('maplibre-gl').Map | null>(null)
  const popupRef = useRef<import('maplibre-gl').Popup | null>(null)
  const popupConstructorRef = useRef<typeof import('maplibre-gl').Popup | null>(null)
  const markerConstructorRef = useRef<typeof import('maplibre-gl').Marker | null>(null)
  const placeMarkersRef = useRef<RoadMapPlaceMarker[]>([])
  const overviewVegagerdinMarkersRef = useRef<OverviewStationMarker[]>([])
  const overviewVedurstofanMarkersRef = useRef<OverviewStationMarker[]>([])
  const weatherChaseMapMarkersRef = useRef<WeatherChaseMapMarker[]>([])
  const routeVedurstofanLabelMarkersRef = useRef<RouteVedurstofanLabelMarker[]>([])
  const routeVedurstofanEntriesRef = useRef<VedurstofanRouteStatusEntry[]>([])
  const routeVegagerdinLabelMarkersRef = useRef<RouteVegagerdinLabelMarker[]>([])
  const routeVegagerdinPointsRef = useRef<VegagerdinRouteLayerPoint[]>([])
  const routeEndpointMarkersRef = useRef<RouteEndpointMarker[]>([])
  const overviewDensityFrameRef = useRef<number | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const showOverlayRef = useRef(true)
  const showSegmentsRef = useRef(true)
  const visibleRouteStatusesRef = useRef<Set<WindDisplayStatus>>(new Set())
  const routeStatusFilterModeRef = useRef<WindStatusFilterMode>('simple')
  const routeWeatherModeRef = useRef<RouteWeatherMode>('now')
  const routeActiveRef = useRef(false)
  const weatherChaseActiveRef = useRef(false)
  const weatherChaseSelectedItemsRef = useRef<WeatherChaseItem[]>([])
  const weatherChaseAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const weatherChaseAutoSaveQueuedRef = useRef<WeatherChasePreferencesPayload | null>(null)
  const weatherChaseAutoSaveRunningRef = useRef(false)
  const overviewActiveModeRef = useRef<'now' | number>('now')
  const overviewVisibleStatusesRef = useRef<Set<WindDisplayStatus>>(
    new Set(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES),
  )
  const weatherChaseBoundsKeyRef = useRef<string | null>(null)
  const vedurstofanLayerRef = useRef<VedurstofanTravelLayer | undefined>(undefined)
  const routeDurationMinutesRef = useRef<number>(0)
  const routeThresholdsRef = useRef<ResolvedTravelThresholds>(DEFAULT_ROUTE_THRESHOLDS)
  const routeForecastBuildContextRef = useRef<RouteForecastBuildContext | null>(null)
  const activeRouteFieldRef = useRef<RouteBridgeField>('from')
  const selectRoutePlaceRef = useRef<
    (place: RoadIntelligencePlaceResult, target?: RouteBridgeField) => void
  >(() => {})
  const [showOverlay, setShowOverlay] = useState(true)
  const [showSegments, setShowSegments] = useState(true)
  const [activeRouteField, setActiveRouteField] = useState<RouteBridgeField>('from')
  const [stationCount, setStationCount] = useState<number | null>(null)
  const [segmentCount, setSegmentCount] = useState<number | 'loading' | 'error' | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [routeFrom, setRouteFrom] = useState('')
  const [routeTo, setRouteTo] = useState('')
  const [routeBridgeStatus, setRouteBridgeStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [routeBridgeError, setRouteBridgeError] = useState<string | null>(null)
  const [routeBridgeSummary, setRouteBridgeSummary] = useState<RouteBridgeSummary | null>(null)
  const [fromSuggestions, setFromSuggestions] = useState<RoadIntelligencePlaceResult[]>([])
  const [toSuggestions, setToSuggestions] = useState<RoadIntelligencePlaceResult[]>([])
  const [fromResolved, setFromResolved] = useState<RoadIntelligencePlaceResult | null>(null)
  const [toResolved, setToResolved] = useState<RoadIntelligencePlaceResult | null>(null)
  const [routeCautionWind, setRouteCautionWind] = useState(String(DEFAULT_ROUTE_THRESHOLDS.cautionWindMs))
  const [routeRedWind, setRouteRedWind] = useState(String(DEFAULT_ROUTE_THRESHOLDS.redWindMs))
  const [routeThresholdError, setRouteThresholdError] = useState<string | null>(null)
  const [routeStatusFilterMode, setRouteStatusFilterMode] = useState<WindStatusFilterMode>('simple')
  const [visibleRouteStatuses, setVisibleRouteStatuses] = useState<Set<WindDisplayStatus>>(new Set())
  const [routeWeatherMode, setRouteWeatherMode] = useState<RouteWeatherMode>('now')
  const [routeNowStatusCounts, setRouteNowStatusCounts] = useState<
    Partial<Record<WindDisplayStatus, number>> | null
  >(null)
  const [routeNowMeasuredAtIso, setRouteNowMeasuredAtIso] = useState<string | null>(null)
  const [routeVisibleStatusCounts, setRouteVisibleStatusCounts] = useState<
    Partial<Record<WindDisplayStatus, number>> | null
  >(null)
  const [overviewVisibleStatuses, setOverviewVisibleStatuses] = useState<Set<WindDisplayStatus>>(
    new Set(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES),
  )
  const [overviewActiveMode, setOverviewActiveMode] = useState<'now' | number>('now')
  const [mapVisibleHours, setMapVisibleHours] = useState<WeatherChaseVisibleHour[]>([12])
  const [overviewVegagerdinData, setOverviewVegagerdinData] = useState<VegagerdinCurrentApiData | null>(null)
  const [overviewVegagerdinLoading, setOverviewVegagerdinLoading] = useState(true)
  const [overviewVegagerdinRestricted, setOverviewVegagerdinRestricted] = useState(false)
  const [overviewVedurstofanData, setOverviewVedurstofanData] = useState<StationExplorerResponse | null>(null)
  const [overviewVedurstofanLoading, setOverviewVedurstofanLoading] = useState(true)
  const [overviewVedurstofanRestricted, setOverviewVedurstofanRestricted] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [routeCandidates, setRouteCandidates] = useState<TravelCandidate[] | null>(null)
  const [routeSlotStatusOverrides, setRouteSlotStatusOverrides] = useState<WindDisplayStatus[] | null>(null)
  const [routeForecastBuildStatus, setRouteForecastBuildStatus] = useState<RouteForecastBuildStatus>('idle')
  const [routeDepartureForecastExpanded, setRouteDepartureForecastExpanded] = useState(false)
  const [routeSurfaceChoices, setRouteSurfaceChoices] = useState<RouteSurfaceChoice[]>([])
  const [routeSurfaceChoicesStatus, setRouteSurfaceChoicesStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [routeSwitchingChoiceId, setRouteSwitchingChoiceId] = useState<string | null>(null)
  const [visibleCandidateLimit, setVisibleCandidateLimit] = useState(ROUTE_TIMELINE_INITIAL_SLOT_COUNT)
  const [routeCalculationPlaceNames, setRouteCalculationPlaceNames] = useState<{
    from: string
    to: string
  } | null>(null)
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number | null>(null)
  const [isWeatherChaseOpen, setIsWeatherChaseOpen] = useState(true)
  const [weatherChaseSelectedItems, setWeatherChaseSelectedItems] = useState<WeatherChaseItem[]>([])
  const [weatherChaseNearbyFocusId, setWeatherChaseNearbyFocusId] = useState<string | null>(null)
  const [weatherChasePreferenceItems, setWeatherChasePreferenceItems] = useState<WeatherChasePreferenceItem[] | null>(null)
  const [weatherChaseCriteria, setWeatherChaseCriteria] = useState<WeatherChaseCriteria>(DEFAULT_WEATHER_CHASE_CRITERIA)
  const [weatherChaseSaveStatus, setWeatherChaseSaveStatus] = useState<WeatherChaseSaveStatus>('idle')
  const [weatherChasePreferencesHydrated, setWeatherChasePreferencesHydrated] = useState(false)
  const [weatherChaseSelectionInitialized, setWeatherChaseSelectionInitialized] = useState(false)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [routeActive, setRouteActive] = useState(false)
  const segmentRequestRef = useRef<AbortController | null>(null)
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const routeBridgeRequestRef = useRef<AbortController | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)
  const fromSuggestAbortRef = useRef<AbortController | null>(null)
  const toSuggestAbortRef = useRef<AbortController | null>(null)
  const fromSuggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toSuggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fromBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resolvedRoutePlacesRef = useRef<ResolvedRoutePlaces | null>(null)
  // Track which input is currently focused so late API responses don't reopen the wrong dropdown.
  const fromFocusedRef = useRef(false)
  const toFocusedRef = useRef(false)
  const labelsRef = useRef<RoadMapPrototypeLabels>({
    roadFallback: (number) => t('roadMapPrototypeRoadFallback', { number }),
    unknownRoad: t('roadMapPrototypeUnknownRoad'),
    unknownCondition: t('roadMapPrototypeUnknownCondition'),
    drivingTime: (value) => t('roadMapPrototypeDrivingTime', { value }),
    routePointTitle: (index, total) => t('roadMapPrototypeRoutePointTitle', { index, total }),
    routePointDistance: (value) => t('roadMapPrototypeRoutePointDistance', { value }),
    routePointEta: (value) => t('roadMapPrototypeRoutePointEta', { value }),
    routePointWind: (value) => t('roadMapPrototypeRoutePointWind', { value }),
    routePointGust: (value) => t('roadMapPrototypeRoutePointGust', { value }),
    routePointPrecip: (value) => t('roadMapPrototypeRoutePointPrecip', { value }),
    routeStationMeasured: (value) => t('roadMapPrototypeRouteStationMeasured', { value }),
    routeStationAirTemp: (value) => t('roadMapPrototypeRouteStationAirTemp', { value }),
    routeStationRoadTemp: (value) => t('roadMapPrototypeRouteStationRoadTemp', { value }),
    routeStationNoWind: t('roadMapPrototypeRouteStationNoWind'),
    routeStationStale: t('roadMapPrototypeRouteStationStale'),
    routeMarkerWindDirection: (value) => t('roadMapPrototypeMarkerWindDirection', { value }),
    routeMarkerWind: (value) => t('roadMapPrototypeMarkerWind', { value }),
    routeMarkerTemperature: (value) => t('roadMapPrototypeMarkerTemperature', { value }),
    routeMarkerPrecipitation: (value) => t('roadMapPrototypeMarkerPrecipitation', { value }),
    routeMarkerRoadTemperature: (value) => t('roadMapPrototypeMarkerRoadTemperature', { value }),
    routeMarkerEta: (value) => t('roadMapPrototypeMarkerEta', { value }),
    routeMarkerTemperatureTitle: t('roadMapPrototypeMarkerTemperatureTitle'),
    routeMarkerPrecipitationTitle: t('roadMapPrototypeMarkerPrecipitationTitle'),
    routeMarkerRoadTemperatureTitle: t('roadMapPrototypeMarkerRoadTemperatureTitle'),
  })
  labelsRef.current = {
    roadFallback: (number) => t('roadMapPrototypeRoadFallback', { number }),
    unknownRoad: t('roadMapPrototypeUnknownRoad'),
    unknownCondition: t('roadMapPrototypeUnknownCondition'),
    drivingTime: (value) => t('roadMapPrototypeDrivingTime', { value }),
    routePointTitle: (index, total) => t('roadMapPrototypeRoutePointTitle', { index, total }),
    routePointDistance: (value) => t('roadMapPrototypeRoutePointDistance', { value }),
    routePointEta: (value) => t('roadMapPrototypeRoutePointEta', { value }),
    routePointWind: (value) => t('roadMapPrototypeRoutePointWind', { value }),
    routePointGust: (value) => t('roadMapPrototypeRoutePointGust', { value }),
    routePointPrecip: (value) => t('roadMapPrototypeRoutePointPrecip', { value }),
    routeStationMeasured: (value) => t('roadMapPrototypeRouteStationMeasured', { value }),
    routeStationAirTemp: (value) => t('roadMapPrototypeRouteStationAirTemp', { value }),
    routeStationRoadTemp: (value) => t('roadMapPrototypeRouteStationRoadTemp', { value }),
    routeStationNoWind: t('roadMapPrototypeRouteStationNoWind'),
    routeStationStale: t('roadMapPrototypeRouteStationStale'),
    routeMarkerWindDirection: (value) => t('roadMapPrototypeMarkerWindDirection', { value }),
    routeMarkerWind: (value) => t('roadMapPrototypeMarkerWind', { value }),
    routeMarkerTemperature: (value) => t('roadMapPrototypeMarkerTemperature', { value }),
    routeMarkerPrecipitation: (value) => t('roadMapPrototypeMarkerPrecipitation', { value }),
    routeMarkerRoadTemperature: (value) => t('roadMapPrototypeMarkerRoadTemperature', { value }),
    routeMarkerEta: (value) => t('roadMapPrototypeMarkerEta', { value }),
    routeMarkerTemperatureTitle: t('roadMapPrototypeMarkerTemperatureTitle'),
    routeMarkerPrecipitationTitle: t('roadMapPrototypeMarkerPrecipitationTitle'),
    routeMarkerRoadTemperatureTitle: t('roadMapPrototypeMarkerRoadTemperatureTitle'),
  }

  const {
    items: conditionsItems,
    loading: conditionsLoading,
    newSinceOpenCount,
    acknowledgeCurrentItems,
  } = useConditionsFeedPreview({ limitItems: 10, isOpen: isChatOpen })

  const overviewThresholds = useMemo<ResolvedTravelThresholds>(() => {
    const caution = Number(routeCautionWind)
    const red = Number(routeRedWind)
    if (
      !Number.isFinite(caution) ||
      !Number.isFinite(red) ||
      caution <= 0 ||
      red <= 0 ||
      caution > 40 ||
      red > 40 ||
      caution >= red
    ) {
      return DEFAULT_ROUTE_THRESHOLDS
    }
    return resolveThresholds('none', { cautionWindMs: caution, redWindMs: red })
  }, [routeCautionWind, routeRedWind])

  const overviewForecastSlots = useMemo<number[]>(() => {
    if (!overviewVedurstofanData) return []
    const timeSet = new Set<number>()
    for (const station of overviewVedurstofanData.stations) {
      for (const forecast of station.forecasts) {
        const timeMs = Date.parse(forecast.ftimeIso)
        if (Number.isFinite(timeMs)) timeSet.add(timeMs)
      }
    }
    return Array.from(timeSet).sort((a, b) => a - b)
  }, [overviewVedurstofanData])

  const overviewForecastAnchorMs =
    typeof overviewActiveMode === 'number' ? overviewActiveMode : Date.now()

  const overviewForecastSlotStatuses = useMemo<ForecastTimeScrubberSlot[]>(() => {
    if (!overviewVedurstofanData || overviewForecastSlots.length === 0) return []
    return overviewForecastSlots.map(timeMs => {
      let worst: WindDisplayStatus = 'no_data'
      for (const station of overviewVedurstofanData.stations) {
        if (station.lat === null || station.lon === null) continue
        const status = classifyForecastWindDisplayStatusAt(
          station.forecasts,
          overviewThresholds,
          timeMs,
        )
        worst = worstWindDisplayStatus(worst, status)
      }
      return {
        timeMs,
        worstStatus: worst,
        worstStatusLabel: tf(WIND_STATUS_META[worst].labelKey as 'statusWithinLimits'),
      }
    })
  }, [overviewForecastSlots, overviewThresholds, overviewVedurstofanData, tf])

  const weatherChaseVedurstofanItems = useMemo<WeatherChaseItem[]>(() => {
    if (!overviewVedurstofanData) return []

    return overviewVedurstofanData.stations
      .map((station): WeatherChaseItem | null => {
        if (!station.stationId || !station.stationName || station.forecasts.length === 0) return null

        const rows = buildRoadMapForecastDrawerRows(station.forecasts, overviewThresholds)
        if (rows.length === 0) return null

        return {
          id: `vedurstofan:${station.stationId}`,
          label: station.stationName,
          providerId: 'vedurstofan',
          providerLabel: t('roadMapPrototypeWeatherChaseProviderVedurstofan'),
          sourceLabel: overviewVedurstofanData.attribution.provider,
          rows,
          lat: station.lat ?? undefined,
          lon: station.lon ?? undefined,
        }
      })
      .filter((item): item is WeatherChaseItem => !!item)
      .sort((a, b) => a.label.localeCompare(b.label, 'is'))
  }, [overviewThresholds, overviewVedurstofanData, t])

  const weatherChaseMetnoItems = useMemo<WeatherChaseItem[]>(() => {
    return ROAD_MAP_PLACES
      .map((place): WeatherChaseItem => ({
        id: `metno:${place.id}`,
        label: place.name,
        providerId: 'metno',
        providerLabel: t('roadMapPrototypeWeatherChaseProviderMetno'),
        sourceLabel: 'Yr / met.no',
        rows: [],
        lat: place.lat,
        lon: place.lon,
        needsRowLoad: true,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'is'))
  }, [t])

  const weatherChaseItems = useMemo<WeatherChaseItem[]>(() => {
    return [...weatherChaseVedurstofanItems, ...weatherChaseMetnoItems]
      .sort((a, b) => a.label.localeCompare(b.label, 'is') || a.providerLabel.localeCompare(b.providerLabel, 'is'))
  }, [weatherChaseMetnoItems, weatherChaseVedurstofanItems])

  const loadWeatherChaseItemRows = useCallback(async (item: WeatherChaseItem): Promise<ForecastDrawerRow[]> => {
    if (
      item.providerId !== 'metno' ||
      typeof item.lat !== 'number' ||
      !Number.isFinite(item.lat) ||
      typeof item.lon !== 'number' ||
      !Number.isFinite(item.lon)
    ) {
      return item.rows
    }

    const params = new URLSearchParams({
      lat: String(item.lat),
      lon: String(item.lon),
    })
    const res = await fetch(`/api/teskeid/weather/metno/point?${params.toString()}`, {
      credentials: 'same-origin',
    })
    if (!res.ok) {
      throw new Error(`met.no point forecast failed: ${res.status}`)
    }
    const data = await res.json() as RoadMapMetnoPointForecastResponse
    if (data.status !== 'ok') {
      throw new Error(data.error ?? 'met.no point forecast unavailable')
    }
    return buildRoadMapMetnoForecastDrawerRows(data.forecasts, overviewThresholds)
  }, [overviewThresholds])

  const handleWeatherChaseSelectedItemsChange = useCallback((items: WeatherChaseItem[]) => {
    weatherChaseSelectedItemsRef.current = items
    setWeatherChaseSelectedItems(items)
    setWeatherChaseSelectionInitialized(true)
    setWeatherChaseNearbyFocusId(prev => (
      prev && items.some(item => item.id === prev) ? prev : null
    ))
  }, [])

  const handleWeatherChaseShowNearbyStations = useCallback((item: WeatherChaseItem) => {
    setWeatherChaseNearbyFocusId(prev => (prev === item.id ? null : item.id))
  }, [])

  const weatherChaseNearbyDisplayItems = useMemo<WeatherChaseItem[]>(() => {
    if (!weatherChaseNearbyFocusId) return []
    const focusItem = weatherChaseSelectedItems.find(item => item.id === weatherChaseNearbyFocusId) ?? null
    if (!focusItem || focusItem.providerId !== 'metno') return []
    if (
      typeof focusItem.lat !== 'number' ||
      !Number.isFinite(focusItem.lat) ||
      typeof focusItem.lon !== 'number' ||
      !Number.isFinite(focusItem.lon)
    ) return []
    return weatherChaseVedurstofanItems
      .filter(c =>
        typeof c.lat === 'number' &&
        Number.isFinite(c.lat) &&
        typeof c.lon === 'number' &&
        Number.isFinite(c.lon),
      )
      .map(c => ({
        item: c,
        distanceM: haversineDistanceM(
          { lat: focusItem.lat as number, lon: focusItem.lon as number },
          { lat: c.lat as number, lon: c.lon as number },
        ),
      }))
      .sort((a, b) => a.distanceM - b.distanceM || a.item.label.localeCompare(b.item.label, 'is'))
      .slice(0, 3)
      .map(c => c.item)
  }, [weatherChaseNearbyFocusId, weatherChaseSelectedItems, weatherChaseVedurstofanItems])

  const weatherChaseDefaultItemIds = useMemo(() => {
    const ids = new Set<string>()
    const itemsWithCoords = weatherChaseVedurstofanItems.filter(
      (item): item is WeatherChaseItem & { lat: number; lon: number } =>
        typeof item.lat === 'number' &&
        Number.isFinite(item.lat) &&
        typeof item.lon === 'number' &&
        Number.isFinite(item.lon),
    )

    for (const region of OVERVIEW_AGGREGATE_REGIONS) {
      const nearest = itemsWithCoords
        .map(item => ({
          item,
          distanceM: haversineDistanceM(region, { lat: item.lat, lon: item.lon }),
        }))
        .sort((a, b) => a.distanceM - b.distanceM || a.item.label.localeCompare(b.item.label, 'is'))[0]
        ?.item
      if (nearest) ids.add(nearest.id)
    }

    return Array.from(ids)
  }, [weatherChaseVedurstofanItems])

  const weatherChaseInitialSelectedIds = useMemo(() => {
    const savedIds = weatherChasePreferenceItems?.map(item => item.id).filter(Boolean) ?? []
    return savedIds.length > 0 ? savedIds : weatherChaseDefaultItemIds
  }, [weatherChaseDefaultItemIds, weatherChasePreferenceItems])

  const applyWeatherChasePreferences = useCallback((payload: WeatherChasePreferencesPayload) => {
    setWeatherChasePreferenceItems(payload.selectedItems)
    setWeatherChaseCriteria(payload.criteria)
    setMapVisibleHours(payload.visibleHours)
  }, [])

  const cleanWeatherChaseSaveParam = useCallback(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (!url.searchParams.has('saveWeatherChaseDefaults')) return
    url.searchParams.delete('saveWeatherChaseDefaults')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

  const saveWeatherChasePreferencesToApi = useCallback(async (
    payload: WeatherChasePreferencesPayload,
  ): Promise<'saved' | 'local' | 'unauthorized' | 'error'> => {
    try {
      const res = await fetch('/api/teskeid/weather/preferences/chase', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.status === 401) return 'unauthorized'
      if (res.status === 503) return 'local'
      if (!res.ok) return 'error'
      return 'saved'
    } catch {
      return 'error'
    }
  }, [])

  const handleWeatherChaseCriteriaChange = useCallback((next: WeatherChaseCriteria) => {
    setWeatherChaseCriteria(next)
    setWeatherChaseSaveStatus(prev => (prev === 'saved' || prev === 'local' || prev === 'error' ? 'idle' : prev))
  }, [])

  const handleSaveWeatherChaseDefault = useCallback(async (payload: WeatherChasePreferencesPayload) => {
    applyWeatherChasePreferences(payload)
    setWeatherChaseSaveStatus('saving')

    try {
      window.localStorage.setItem(WEATHER_CHASE_LOCAL_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Local persistence is best-effort; API persistence below is still the source of truth for signed-in users.
    }

    const result = await saveWeatherChasePreferencesToApi(payload)
    if (result === 'unauthorized') {
      try {
        window.sessionStorage.setItem(WEATHER_CHASE_PENDING_STORAGE_KEY, JSON.stringify(payload))
      } catch {
        // Continue to auth even if pending session storage is unavailable.
      }
      const returnUrl = `${window.location.pathname}?saveWeatherChaseDefaults=1`
      window.location.href = `/innskraning?next=${encodeURIComponent(returnUrl)}`
      return
    }

    setWeatherChaseSaveStatus(result)
    if (result === 'saved') {
      try {
        window.sessionStorage.removeItem(WEATHER_CHASE_PENDING_STORAGE_KEY)
      } catch {
        // No-op.
      }
    }
  }, [applyWeatherChasePreferences, saveWeatherChasePreferencesToApi])

  const flushWeatherChaseAutoSave = useCallback(async () => {
    if (weatherChaseAutoSaveRunningRef.current) return
    weatherChaseAutoSaveRunningRef.current = true

    try {
      while (weatherChaseAutoSaveQueuedRef.current) {
        const payload = weatherChaseAutoSaveQueuedRef.current
        weatherChaseAutoSaveQueuedRef.current = null
        try {
          window.localStorage.setItem(WEATHER_CHASE_LOCAL_STORAGE_KEY, JSON.stringify(payload))
        } catch {
          // API persistence remains authoritative when local storage is unavailable.
        }
        await saveWeatherChasePreferencesToApi(payload)
      }
    } finally {
      weatherChaseAutoSaveRunningRef.current = false
    }
  }, [saveWeatherChasePreferencesToApi])

  useEffect(() => {
    let cancelled = false

    function readStoredPayload(storage: Storage, key: string): WeatherChasePreferencesPayload | null {
      try {
        const raw = storage.getItem(key)
        return raw ? normalizeWeatherChasePreferences(JSON.parse(raw)) : null
      } catch {
        return null
      }
    }

    const localPayload = readStoredPayload(window.localStorage, WEATHER_CHASE_LOCAL_STORAGE_KEY)
    if (localPayload) {
      applyWeatherChasePreferences(localPayload)
    }

    const pendingPayload = readStoredPayload(window.sessionStorage, WEATHER_CHASE_PENDING_STORAGE_KEY)
    const shouldSavePending = new URLSearchParams(window.location.search).get('saveWeatherChaseDefaults') === '1'
    if (shouldSavePending && pendingPayload) {
      applyWeatherChasePreferences(pendingPayload)
      setWeatherChaseSaveStatus('saving')
      void saveWeatherChasePreferencesToApi(pendingPayload).then(result => {
        if (cancelled) return
        setWeatherChaseSaveStatus(result === 'unauthorized' ? 'error' : result)
        if (result === 'saved') {
          try {
            window.localStorage.setItem(WEATHER_CHASE_LOCAL_STORAGE_KEY, JSON.stringify(pendingPayload))
            window.sessionStorage.removeItem(WEATHER_CHASE_PENDING_STORAGE_KEY)
          } catch {
            // No-op.
          }
        }
        setWeatherChasePreferencesHydrated(true)
        cleanWeatherChaseSaveParam()
      })
      return () => {
        cancelled = true
      }
    }

    void fetch('/api/teskeid/weather/preferences/chase', { credentials: 'same-origin' })
      .then(async res => {
        if (!res.ok) return null
        return await res.json() as unknown
      })
      .then(raw => {
        if (cancelled) return
        if (!raw || typeof raw !== 'object') {
          setWeatherChasePreferencesHydrated(true)
          return
        }
        const input = raw as Record<string, unknown>
        if (input.hasPreferences !== true) {
          setWeatherChasePreferencesHydrated(true)
          return
        }
        const payload = normalizeWeatherChasePreferences({
          selectedItems: input.selectedItems,
          criteria: input.criteria,
          visibleHours: input.visibleHours,
        })
        if (!payload) {
          setWeatherChasePreferencesHydrated(true)
          return
        }
        applyWeatherChasePreferences(payload)
        try {
          window.localStorage.setItem(WEATHER_CHASE_LOCAL_STORAGE_KEY, JSON.stringify(payload))
        } catch {
          // No-op.
        }
        setWeatherChasePreferencesHydrated(true)
      })
      .catch(() => {
        // The table still works with local/browser defaults if the preference API is unavailable.
        if (!cancelled) setWeatherChasePreferencesHydrated(true)
      })

    cleanWeatherChaseSaveParam()
    return () => {
      cancelled = true
    }
  }, [applyWeatherChasePreferences, cleanWeatherChaseSaveParam, saveWeatherChasePreferencesToApi])

  useEffect(() => {
    if (!isAuthenticated || !weatherChasePreferencesHydrated || !weatherChaseSelectionInitialized) return
    clearTimerRef(weatherChaseAutoSaveTimerRef)

    const payload: WeatherChasePreferencesPayload = {
      selectedItems: weatherChaseSelectedItems.map(preferenceItemFromWeatherChaseItem),
      criteria: weatherChaseCriteria,
      visibleHours: mapVisibleHours,
    }
    weatherChaseAutoSaveTimerRef.current = setTimeout(() => {
      weatherChaseAutoSaveQueuedRef.current = payload
      void flushWeatherChaseAutoSave()
    }, 1_200)

    return () => clearTimerRef(weatherChaseAutoSaveTimerRef)
  }, [
    flushWeatherChaseAutoSave,
    isAuthenticated,
    mapVisibleHours,
    weatherChaseCriteria,
    weatherChasePreferencesHydrated,
    weatherChaseSelectedItems,
    weatherChaseSelectionInitialized,
  ])

  useEffect(() => {
    weatherChaseActiveRef.current = isWeatherChaseOpen
    if (!isWeatherChaseOpen) {
      weatherChaseBoundsKeyRef.current = null
      setWeatherChaseNearbyFocusId(null)
    }
    updateOverviewMarkerVisibility()
  }, [isWeatherChaseOpen])

  const displayOverviewForecastSlotStatuses = routeStatusFilterMode === 'simple'
    ? overviewForecastSlotStatuses.map(slot => ({
        ...slot,
        worstStatus: toSimpleWindDisplayStatus(slot.worstStatus),
      }))
    : overviewForecastSlotStatuses

  const mapForecastSlotStatuses = displayOverviewForecastSlotStatuses.filter(
    slot => mapVisibleHours.some(hour => hour === new Date(slot.timeMs).getUTCHours()),
  )

  const overviewVegagerdinNewestMeasuredAtIso = useMemo(() => {
    if (overviewVegagerdinData?.status !== 'ok') return null
    let newestMs = -Infinity
    let newestIso: string | null = null
    for (const station of overviewVegagerdinData.stations) {
      const timeMs = Date.parse(station.measuredAtIso)
      if (Number.isFinite(timeMs) && timeMs > newestMs) {
        newestMs = timeMs
        newestIso = station.measuredAtIso
      }
    }
    return newestIso
  }, [overviewVegagerdinData])

  const overviewVegagerdinWorstStatus = useMemo<WindDisplayStatus>(() => {
    if (overviewVegagerdinData?.status !== 'ok') return 'no_data'
    let worst: WindDisplayStatus = 'no_data'
    for (const station of overviewVegagerdinData.stations) {
      worst = worstWindDisplayStatus(
        worst,
        classifyVegagerdinObservationStationWindStatus(station, overviewThresholds),
      )
    }
    return worst
  }, [overviewThresholds, overviewVegagerdinData])

  const overviewStatusCounts = useMemo<Partial<Record<WindDisplayStatus, number>>>(() => {
    const counts: Partial<Record<WindDisplayStatus, number>> = {}
    const tally = (status: WindDisplayStatus) => {
      counts[status] = (counts[status] ?? 0) + 1
    }
    if (overviewActiveMode === 'now') {
      if (overviewVegagerdinData?.status === 'ok') {
        for (const station of overviewVegagerdinData.stations) {
          tally(classifyVegagerdinObservationStationWindStatus(station, overviewThresholds))
        }
      }
    } else if (overviewVedurstofanData) {
      for (const station of overviewVedurstofanData.stations) {
        if (station.lat === null || station.lon === null) continue
        tally(classifyForecastWindDisplayStatusAt(
          station.forecasts,
          overviewThresholds,
          overviewForecastAnchorMs,
        ))
      }
    }
    return counts
  }, [
    overviewActiveMode,
    overviewForecastAnchorMs,
    overviewThresholds,
    overviewVedurstofanData,
    overviewVegagerdinData,
  ])

  useEffect(() => {
    let cancelled = false
    fetch('/api/teskeid/weather/vegagerdin/current')
      .then(res => {
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          setOverviewVegagerdinRestricted(true)
          setOverviewVegagerdinLoading(false)
          return null
        }
        if (!res.ok) throw new Error('vegagerdin-current-failed')
        return res.json() as Promise<VegagerdinCurrentApiData>
      })
      .then(payload => {
        if (cancelled || !payload) return
        setOverviewVegagerdinData(payload)
        setOverviewVegagerdinLoading(false)
      })
      .catch(() => {
        if (!cancelled) setOverviewVegagerdinLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/teskeid/weather/vedurstofan/stations')
      .then(res => {
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          setOverviewVedurstofanRestricted(true)
          setOverviewVedurstofanLoading(false)
          return null
        }
        if (!res.ok) throw new Error('vedurstofan-stations-failed')
        return res.json() as Promise<StationExplorerResponse>
      })
      .then(payload => {
        if (cancelled || !payload) return
        setOverviewVedurstofanData(payload)
        setOverviewVedurstofanLoading(false)
      })
      .catch(() => {
        if (!cancelled) setOverviewVedurstofanLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    const Marker = markerConstructorRef.current
    clearOverviewMarkerSet(overviewVegagerdinMarkersRef)

    const stations = overviewVegagerdinData?.status === 'ok'
      ? overviewVegagerdinData.stations
      : []
    if (!map?.isStyleLoaded() || !Marker || stations.length === 0) {
      updateOverviewLayerVisibility()
      return
    }

    for (const station of stations) {
      const lat = toFiniteCoordinate(station.lat)
      const lon = toFiniteCoordinate(station.lon)
      if (lat === null || lon === null) continue

      const status = classifyVegagerdinObservationStationWindStatus(station, overviewThresholds)
      const coords: [number, number] = [lon, lat]
      const stationName = station.stationName ?? 'Stöð'
      const windText = station.meanWindMs != null ? formatNum(station.meanWindMs, locale) : '–'
      const gustText = station.gustLast10MinMs != null ? formatNum(station.gustLast10MinMs, locale) : null
      const overviewLabel = windText === '–' ? stationName : `${windText} m/s`
      const element = createOverviewStationDotElement({
        stationName,
        windText,
        gustText,
        directionText: station.windDirectionText,
        temperatureText: station.airTemperatureC != null
          ? formatNum(station.airTemperatureC, locale)
          : null,
        secondaryMetricText: station.roadTemperatureC != null
          ? `${formatNum(station.roadTemperatureC, locale)}°`
          : null,
        secondaryMetricTitle: labelsRef.current.routeMarkerRoadTemperatureTitle,
        secondaryMetricAriaText: station.roadTemperatureC != null
          ? labelsRef.current.routeMarkerRoadTemperature(formatNum(station.roadTemperatureC, locale))
          : null,
        weatherEmoji: null,
        overviewLabel,
        onClick: () => openOverviewVegagerdinPopup(station, coords),
      })
      const marker = new Marker({ element, anchor: 'center' })
        .setLngLat(coords)
        .addTo(map)
      overviewVegagerdinMarkersRef.current.push({
        marker,
        element,
        provider: 'vegagerdin',
        status,
        lat,
        lon,
        stationName,
        overviewLabel,
        ariaLabel: element.getAttribute('aria-label') ?? stationName,
        windMs: station.meanWindMs,
        clusterEmoji: null,
      })
    }

    updateOverviewLayerVisibility()
  }, [
    mapReady,
    overviewThresholds,
    overviewVegagerdinData,
    routeStatusFilterMode,
  ])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    const Marker = markerConstructorRef.current
    clearOverviewMarkerSet(overviewVedurstofanMarkersRef)

    const stations = overviewVedurstofanData?.stations ?? []
    if (!map?.isStyleLoaded() || !Marker || stations.length === 0) {
      updateOverviewLayerVisibility()
      return
    }

    for (const station of stations) {
      const lat = toFiniteCoordinate(station.lat)
      const lon = toFiniteCoordinate(station.lon)
      if (lat === null || lon === null) continue

      const status = classifyForecastWindDisplayStatusAt(
        station.forecasts,
        overviewThresholds,
        overviewForecastAnchorMs,
      )
      const selectedRowIdx = selectForecastRowAt(station.forecasts, overviewForecastAnchorMs)
      const selectedRow = selectedRowIdx !== null ? station.forecasts[selectedRowIdx] : null
      const coords: [number, number] = [lon, lat]
      const stationName = station.stationName ?? 'Stöð'
      const windText = selectedRow?.windSpeedMs != null
        ? formatNum(selectedRow.windSpeedMs, locale)
        : '–'
      const precipitationText = selectedRow?.precipitationMmPerHour != null
        ? formatNum(selectedRow.precipitationMmPerHour, locale)
        : null
      const weatherEmoji = weatherEmojiFromText(
        selectedRow?.weatherText ?? null,
        selectedRow?.precipitationMmPerHour ?? null,
      )
      const overviewLabel = windText === '–' ? stationName : `${windText} m/s`
      const element = createOverviewStationDotElement({
        stationName,
        windText,
        directionText: selectedRow?.windDirectionText ?? null,
        temperatureText: selectedRow?.temperatureC != null
          ? formatNum(selectedRow.temperatureC, locale)
          : null,
        precipitationText,
        weatherEmoji,
        overviewLabel,
        onClick: () => openOverviewVedurstofanPopup(station, coords, overviewForecastAnchorMs),
      })
      const marker = new Marker({ element, anchor: 'center' })
        .setLngLat(coords)
        .addTo(map)
      overviewVedurstofanMarkersRef.current.push({
        marker,
        element,
        provider: 'vedurstofan',
        status,
        lat,
        lon,
        stationName,
        overviewLabel,
        ariaLabel: element.getAttribute('aria-label') ?? stationName,
        windMs: selectedRow?.windSpeedMs ?? null,
        clusterEmoji: weatherEmoji,
      })
    }

    updateOverviewLayerVisibility()
  }, [
    mapReady,
    overviewForecastAnchorMs,
    overviewThresholds,
    overviewVedurstofanData,
    routeStatusFilterMode,
  ])

  useEffect(() => {
    if (!mapReady) return
    clearWeatherChaseMapMarkers()
    const shouldShowWeatherChaseMarkers =
      !routeActiveRef.current &&
      !isPanelOpen &&
      weatherChaseSelectedItems.length > 0
    if (!shouldShowWeatherChaseMarkers) {
      updateOverviewMarkerVisibility()
      reconcilePlaceMarkerVisibility()
      return
    }

    const map = mapRef.current
    const Marker = markerConstructorRef.current
    if (!map?.isStyleLoaded() || !Marker) return

    const focusItem = weatherChaseNearbyFocusId
      ? weatherChaseSelectedItems.find(item => item.id === weatherChaseNearbyFocusId) ?? null
      : null
    const nearbyItems = focusItem?.providerId === 'metno'
      ? nearestWeatherChaseVedurstofanItems(focusItem)
      : []
    const selectedIds = new Set(weatherChaseSelectedItems.map(item => item.id))
    const markerItems = [
      ...weatherChaseSelectedItems.map(item => ({ item, kind: 'selected' as const })),
      ...nearbyItems
        .filter(item => !selectedIds.has(item.id))
        .map(item => ({ item, kind: 'nearby-vedurstofan' as const })),
    ]

    for (const { item, kind } of markerItems) {
      if (
        typeof item.lat !== 'number' ||
        !Number.isFinite(item.lat) ||
        typeof item.lon !== 'number' ||
        !Number.isFinite(item.lon)
      ) {
        continue
      }
      const chaseTargetTimeMs = typeof overviewActiveMode === 'number' ? overviewActiveMode : null
      const row = selectWeatherChaseMarkerRow(item, chaseTargetTimeMs)
      const element = createWeatherChaseMapMarkerElement(item, row, kind)
      const marker = new Marker({ element, anchor: 'center' })
        .setLngLat([item.lon, item.lat])
        .addTo(map)
      weatherChaseMapMarkersRef.current.push({ marker, element, itemId: item.id, kind })
    }

    const boundsItems = markerItems
      .filter(({ item }) =>
        typeof item.lat === 'number' &&
        Number.isFinite(item.lat) &&
        typeof item.lon === 'number' &&
        Number.isFinite(item.lon),
      )
      .map(({ item, kind }) => ({ id: item.id, kind, lat: item.lat as number, lon: item.lon as number }))
    const boundsKey = boundsItems.map(item => `${item.kind}:${item.id}:${item.lat.toFixed(4)},${item.lon.toFixed(4)}`).join('|')
    if (boundsItems.length > 0 && boundsKey && weatherChaseBoundsKeyRef.current !== boundsKey) {
      weatherChaseBoundsKeyRef.current = boundsKey
      if (boundsItems.length === 1) {
        map.easeTo({
          center: [boundsItems[0].lon, boundsItems[0].lat],
          zoom: Math.max(map.getZoom(), 7),
          duration: 450,
        })
      } else {
        const lons = boundsItems.map(item => item.lon)
        const lats = boundsItems.map(item => item.lat)
        map.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          {
            padding: { top: 96, right: 40, bottom: 220, left: 40 },
            maxZoom: 7.5,
            duration: 450,
          },
        )
      }
    }

    hideOverviewStationMarkers()
    reconcilePlaceMarkerVisibility()

    return () => {
      clearWeatherChaseMapMarkers()
    }
  }, [
    isPanelOpen,
    mapReady,
    overviewActiveMode,
    routeActive,
    weatherChaseNearbyFocusId,
    weatherChaseSelectedItems,
    weatherChaseVedurstofanItems,
  ])

  function routeStatusLabel(status: DeterministicResult['stada']): string {
    switch (status) {
      case 'rautt':
        return t('roadMapPrototypeTravelStatusRed')
      case 'gult':
        return t('roadMapPrototypeTravelStatusYellow')
      default:
        return t('roadMapPrototypeTravelStatusGreen')
    }
  }

  function routeStatusColor(status: DeterministicResult['stada']): string {
    switch (status) {
      case 'rautt':
        return '#dc2626'
      case 'gult':
        return '#f59e0b'
      default:
        return '#2d5a27'
    }
  }

  function providerRouteAnswer(status: DeterministicResult['stada']): string {
    switch (status) {
      case 'rautt':
        return t('roadMapPrototypeProviderRouteAnswerRed')
      case 'gult':
        return t('roadMapPrototypeProviderRouteAnswerYellow')
      default:
        return t('roadMapPrototypeProviderRouteAnswerGreen')
    }
  }

  function routeSlotStatusSource(
    vegagerdinStationCount: number,
    vedurstofanStationCount: number,
  ): RouteSlotStatusSource {
    if (vegagerdinStationCount > 0 && vedurstofanStationCount > 0) return 'providers'
    if (vegagerdinStationCount > 0) return 'vegagerdin'
    if (vedurstofanStationCount > 0) return 'vedurstofan'
    return 'fallback'
  }

  function routeScrubberSubtitle(source: RouteSlotStatusSource): string {
    switch (source) {
      case 'providers':
        return t('roadMapPrototypeScrubberSourceProviders')
      case 'vegagerdin':
        return t('roadMapPrototypeScrubberSourceVegagerdin')
      case 'vedurstofan':
        return t('roadMapPrototypeScrubberSourceVedurstofan')
      default:
        return ''
    }
  }

  function formatDurationMinutes(minutes: number): string {
    const rounded = Math.max(0, Math.round(minutes))
    const hours = Math.floor(rounded / 60)
    const mins = rounded % 60
    if (hours > 0) {
      return t('roadMapPrototypeDurationHoursMinutes', { hours, minutes: mins })
    }
    return t('roadMapPrototypeDurationMinutes', { minutes: rounded })
  }

  function displayWindStatus(status: WindDisplayStatus): WindDisplayStatus {
    return routeStatusFilterModeRef.current === 'simple'
      ? toSimpleWindDisplayStatus(status)
      : status
  }

  function routeStatusIsVisible(status: WindDisplayStatus, statuses = visibleRouteStatusesRef.current): boolean {
    return statusIsVisibleInFilter(status, statuses, routeStatusFilterModeRef.current)
  }

  function removeOverviewMapLayerArtifacts(map: import('maplibre-gl').Map) {
    for (const layerId of [...OVERVIEW_FILTER_LAYER_IDS, ...LEGACY_OVERVIEW_LAYER_IDS] as const) {
      if (map.getLayer(layerId)) map.removeLayer(layerId)
    }
    for (const sourceId of [...OVERVIEW_FILTER_LAYER_IDS, ...LEGACY_OVERVIEW_LAYER_IDS] as const) {
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
  }

  function clearOverviewMarkerSet(markersRef: MutableRefObject<OverviewStationMarker[]>) {
    markersRef.current.forEach(({ marker }) => marker.remove())
    markersRef.current = []
  }

  function clearOverviewStationMarkers() {
    clearOverviewMarkerSet(overviewVegagerdinMarkersRef)
    clearOverviewMarkerSet(overviewVedurstofanMarkersRef)
  }

  function overviewDensityLevelForZoom(zoom: number): OverviewMarkerDensityLevel {
    if (zoom >= OVERVIEW_DENSITY_FULL_ZOOM) return 'full'
    if (zoom >= OVERVIEW_DENSITY_COMPACT_ZOOM) return 'compact'
    return 'aggregate'
  }

  function overviewDensityCellPxForLevel(level: OverviewMarkerDensityLevel): number {
    if (level === 'full') return OVERVIEW_DENSITY_FULL_CELL_PX
    if (level === 'compact') return OVERVIEW_DENSITY_COMPACT_CELL_PX
    return OVERVIEW_DENSITY_AGGREGATE_CELL_PX
  }

  function averageOverviewWindMs(entries: OverviewStationMarker[]): number | null {
    const values = entries
      .map(entry => entry.windMs)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    if (values.length === 0) return null
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }

  function dominantOverviewEmoji(entries: OverviewStationMarker[]): string | null {
    const counts = new Map<string, number>()
    for (const entry of entries) {
      if (!entry.clusterEmoji) continue
      counts.set(entry.clusterEmoji, (counts.get(entry.clusterEmoji) ?? 0) + 1)
    }
    let selected: string | null = null
    let selectedCount = 0
    for (const [emoji, count] of counts) {
      if (count > selectedCount) {
        selected = emoji
        selectedCount = count
      }
    }
    return selected
  }

  function buildOverviewAggregateLabel(entries: OverviewStationMarker[]): string {
    if (entries.length <= 1) return entries[0]?.overviewLabel ?? ''
    const emoji = dominantOverviewEmoji(entries)
    if (emoji) return emoji
    const averageWind = averageOverviewWindMs(entries)
    return averageWind === null ? '💨' : `${formatNum(averageWind, locale)} m/s`
  }

  function buildOverviewAggregateTitle(
    entries: OverviewStationMarker[],
    region?: OverviewAggregateRegion,
  ): string {
    const averageWind = averageOverviewWindMs(entries)
    const averageText = averageWind === null ? null : `${formatNum(averageWind, locale)} m/s`
    const stationText = t('roadMapPrototypeStationCount', { count: entries.length })
    return [region?.name, stationText, averageText].filter(Boolean).join(' · ')
  }

  function findNearestOverviewRegion(
    entry: OverviewStationMarker,
    map: import('maplibre-gl').Map,
  ): OverviewAggregateRegion {
    const point = map.project([entry.lon, entry.lat])
    let selected: OverviewAggregateRegion = OVERVIEW_AGGREGATE_REGIONS[0]
    let selectedDistance = Number.POSITIVE_INFINITY
    for (const region of OVERVIEW_AGGREGATE_REGIONS) {
      const regionPoint = map.project([region.lon, region.lat])
      const distance = (point.x - regionPoint.x) ** 2 + (point.y - regionPoint.y) ** 2
      if (distance < selectedDistance) {
        selected = region
        selectedDistance = distance
      }
    }
    return selected
  }

  function selectOverviewRepresentative(entries: OverviewStationMarker[]): OverviewStationMarker | null {
    if (entries.length === 0) return null
    return entries.reduce((selected, entry) =>
      worstWindDisplayStatus(selected.status, entry.status) === entry.status ? entry : selected,
    )
  }

  function applyOverviewMarkerDensityPresentation(
    entry: OverviewStationMarker,
    level: OverviewMarkerDensityLevel,
    aggregateLabel?: string,
    aggregateTitle?: string,
  ) {
    const stack = entry.element.querySelector<HTMLElement>('[data-route-weather-stack="true"]')
    const bottomRow = entry.element.querySelector<HTMLElement>('[data-route-weather-bottom="true"]')
    const nameLabel = entry.element.querySelector<HTMLElement>('[data-route-wind-name="true"]')
    const aggregate = entry.element.querySelector<HTMLElement>('[data-overview-weather-aggregate="true"]')

    if (level === 'aggregate') {
      if (stack) stack.style.display = 'none'
      entry.element.title = aggregateTitle ?? entry.stationName
      entry.element.setAttribute('aria-label', aggregateTitle ?? entry.ariaLabel)
      if (aggregate) {
        aggregate.textContent = aggregateLabel ?? entry.overviewLabel
        aggregate.title = aggregateTitle ?? entry.stationName
        aggregate.setAttribute('aria-label', aggregateTitle ?? entry.stationName)
        const isEmojiOnly = /^\p{Extended_Pictographic}(?:\uFE0F)?$/u.test(aggregate.textContent ?? '')
        aggregate.style.width = isEmojiOnly ? '30px' : 'auto'
        aggregate.style.height = isEmojiOnly ? '30px' : 'auto'
        aggregate.style.padding = isEmojiOnly ? '0' : '4px 7px'
        aggregate.style.font = isEmojiOnly
          ? '900 18px/1 Inter,system-ui,sans-serif'
          : '800 10px/1 Inter,system-ui,sans-serif'
        aggregate.style.display = 'inline-flex'
      }
      return
    }

    if (aggregate) aggregate.style.display = 'none'
    entry.element.title = entry.stationName
    entry.element.setAttribute('aria-label', entry.ariaLabel)
    if (stack) stack.style.display = 'flex'
    if (bottomRow) bottomRow.style.display = level === 'full' ? 'grid' : 'none'
    if (nameLabel) nameLabel.style.display = level === 'full' ? 'inline-flex' : 'none'
  }

  function updateOverviewMarkerVisibility(
    statuses = overviewVisibleStatusesRef.current,
    mode = overviewActiveModeRef.current,
    routeActive = routeActiveRef.current,
  ) {
    const map = mapRef.current
    const hasWeatherChaseSelection = weatherChaseSelectedItemsRef.current.length > 0
    const showOverview = !routeActive && !weatherChaseActiveRef.current && !hasWeatherChaseSelection
    const allEntries = [
      ...overviewVegagerdinMarkersRef.current,
      ...overviewVedurstofanMarkersRef.current,
    ]
    const eligibleEntries: OverviewStationMarker[] = []

    for (const entry of allEntries) {
      const providerIsActive =
        (entry.provider === 'vegagerdin' && mode === 'now') ||
        (entry.provider === 'vedurstofan' && mode !== 'now')
      const eligible =
        showOverview &&
        providerIsActive &&
        statusIsVisibleInFilter(entry.status, statuses, routeStatusFilterModeRef.current)
      entry.element.style.display = 'none'
      if (eligible) eligibleEntries.push(entry)
    }

    if (showOverview && map) {
      const level = overviewDensityLevelForZoom(map.getZoom())
      const cellSize = overviewDensityCellPxForLevel(level)
      const cells = new Map<string, { region?: OverviewAggregateRegion; entries: OverviewStationMarker[] }>()

      for (const entry of eligibleEntries) {
        const region = level === 'aggregate' ? findNearestOverviewRegion(entry, map) : undefined
        const point = region ? map.project([region.lon, region.lat]) : map.project([entry.lon, entry.lat])
        const key = region?.id ?? `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`
        const group = cells.get(key)
        if (group) {
          group.entries.push(entry)
        } else {
          cells.set(key, { region, entries: [entry] })
        }
      }

      for (const group of cells.values()) {
        const representative = selectOverviewRepresentative(group.entries)
        if (!representative) continue
        if (level === 'aggregate' && group.region) {
          representative.marker.setLngLat([group.region.lon, group.region.lat])
        } else {
          representative.marker.setLngLat([representative.lon, representative.lat])
        }
        representative.element.style.display = 'block'
        applyOverviewMarkerDensityPresentation(
          representative,
          level,
          buildOverviewAggregateLabel(group.entries),
          buildOverviewAggregateTitle(group.entries, group.region),
        )
      }
    }

    if (!routeActive) setStationCount(eligibleEntries.length)
  }

  function scheduleOverviewMarkerVisibilityUpdate() {
    if (overviewDensityFrameRef.current !== null) return
    overviewDensityFrameRef.current = window.requestAnimationFrame(() => {
      overviewDensityFrameRef.current = null
      updateOverviewMarkerVisibility()
    })
  }

  function hideOverviewStationMarkers() {
    for (const entry of [
      ...overviewVegagerdinMarkersRef.current,
      ...overviewVedurstofanMarkersRef.current,
    ]) {
      entry.element.style.display = 'none'
    }
  }

  function setRouteLayerLayoutVisibility(
    map: import('maplibre-gl').Map | null,
    layerId: string,
    visible: boolean,
  ) {
    if (!map?.getLayer(layerId)) return
    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
  }

  function setRouteWeatherModeState(mode: RouteWeatherMode) {
    routeWeatherModeRef.current = mode
    setRouteWeatherMode(mode)
  }

  function scheduleRouteLabelCollisionUpdate() {
    window.requestAnimationFrame(() => {
      applyRouteLabelCollisionAvoidance([
        ...routeVegagerdinLabelMarkersRef.current.map(({ element }) => element),
        ...routeVedurstofanLabelMarkersRef.current.map(({ element }) => element),
      ])
    })
  }

  function updateRouteWeatherLayerVisibility(
    mode = routeWeatherModeRef.current,
    statuses = visibleRouteStatusesRef.current,
  ) {
    const map = mapRef.current
    if (routeActiveRef.current) {
      hideOverviewStationMarkers()
    }
    if (canUseMapStyle(map)) {
      setRouteLayerLayoutVisibility(map, VEGAGERDIN_ROUTE_STATIONS_LAYER_ID, mode === 'now')
      setRouteLayerLayoutVisibility(map, VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID, mode === 'forecast')
      setRouteLayerLayoutVisibility(map, TRAVEL_METNO_LAYER_ID, false)
    }
    updateVegagerdinLabelMarkerState(statuses, mode)
    updateVedurstofanLabelMarkerState(statuses, mode)
    scheduleRouteLabelCollisionUpdate()
  }

  function createOverviewStationDotElement({
    stationName,
    windText,
    gustText,
    directionText,
    temperatureText,
    precipitationText,
    secondaryMetricText,
    secondaryMetricTitle,
    secondaryMetricAriaText,
    weatherEmoji,
    overviewLabel,
    onClick,
  }: {
    stationName: string
    windText: string
    gustText?: string | null
    directionText?: string | null
    temperatureText?: string | null
    precipitationText?: string | null
    secondaryMetricText?: string | null
    secondaryMetricTitle?: string | null
    secondaryMetricAriaText?: string | null
    weatherEmoji?: string | null
    overviewLabel: string
    onClick: () => void
  }): HTMLButtonElement {
    const element = createRouteWeatherPointMarkerElement({
      stationName,
      windText,
      gustText,
      directionText,
      temperatureText,
      precipitationText,
      secondaryMetricText,
      secondaryMetricTitle,
      secondaryMetricAriaText,
      weatherEmoji,
      color: OVERVIEW_WEATHER_MARKER_COLOR,
      compact: true,
      showNameLabel: true,
      onClick,
    })
    element.dataset.overviewWeatherMarker = 'true'

    const aggregate = document.createElement('span')
    aggregate.dataset.overviewWeatherAggregate = 'true'
    aggregate.textContent = overviewLabel
    aggregate.style.cssText = [
      'position:absolute',
      'left:50%',
      'bottom:8px',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'white-space:nowrap',
      'border:1px solid rgba(71,85,105,0.30)',
      'border-radius:999px',
      'background:rgba(255,255,255,0.95)',
      'color:#334155',
      'box-shadow:0 1px 5px rgba(15,23,42,0.18)',
      'font:800 10px/1 Inter,system-ui,sans-serif',
      'padding:4px 7px',
      'pointer-events:none',
      'transform:translateX(-50%)',
    ].join(';')
    element.appendChild(aggregate)

    return element
  }

  function selectWeatherChaseMarkerRow(item: WeatherChaseItem, targetTimeMs: number | null): ForecastDrawerRow | null {
    if (item.rows.length === 0) return null
    const t = targetTimeMs ?? Date.now()
    return [...item.rows].sort((a, b) => (
      Math.abs(Date.parse(a.timeIso) - t) - Math.abs(Date.parse(b.timeIso) - t)
    ))[0] ?? null
  }

  function nearestWeatherChaseVedurstofanItems(item: WeatherChaseItem): WeatherChaseItem[] {
    if (
      typeof item.lat !== 'number' ||
      !Number.isFinite(item.lat) ||
      typeof item.lon !== 'number' ||
      !Number.isFinite(item.lon)
    ) {
      return []
    }

    return weatherChaseVedurstofanItems
      .filter(candidate =>
        typeof candidate.lat === 'number' &&
        Number.isFinite(candidate.lat) &&
        typeof candidate.lon === 'number' &&
        Number.isFinite(candidate.lon),
      )
      .map(candidate => ({
        item: candidate,
        distanceM: haversineDistanceM(
          { lat: item.lat as number, lon: item.lon as number },
          { lat: candidate.lat as number, lon: candidate.lon as number },
        ),
      }))
      .sort((a, b) => a.distanceM - b.distanceM || a.item.label.localeCompare(b.item.label, 'is'))
      .slice(0, 3)
      .map(candidate => candidate.item)
  }

  function createWeatherChaseMapMarkerElement(
    item: WeatherChaseItem,
    row: ForecastDrawerRow | null,
    kind: WeatherChaseMapMarker['kind'],
  ): HTMLButtonElement {
    const windText = row ? formatNum(row.wind.value, locale) : '–'
    const gustText = row && Math.abs(row.gust.value - row.wind.value) >= 0.1
      ? formatNum(row.gust.value, locale)
      : null
    const element = createRouteWeatherPointMarkerElement({
      stationName: item.label,
      windText,
      gustText,
      directionText: row?.windDirectionText ?? null,
      temperatureText: row ? formatNum(row.temperature.value, locale) : null,
      precipitationText: row ? formatNum(row.precipitation.value, locale) : null,
      weatherEmoji: row?.weatherEmoji ?? null,
      color: kind === 'nearby-vedurstofan' ? '#64748b' : '#2563eb',
      compact: true,
      showNameLabel: true,
      onClick: () => {},
    })
    element.dataset.weatherChaseMapMarker = kind
    element.style.zIndex = kind === 'nearby-vedurstofan' ? '18' : '20'
    if (kind === 'nearby-vedurstofan') {
      element.style.opacity = '0.88'
    }
    return element
  }

  function openOverviewVegagerdinPopup(
    station: VegagerdinCurrentStationDto,
    coords: [number, number],
  ) {
    const Popup = popupConstructorRef.current
    const map = mapRef.current
    if (!Popup || !map) return

    const gust = station.gustLast10MinMs != null
      ? `${formatNum(station.gustLast10MinMs, locale)} m/s`
      : '–'
    const mean = station.meanWindMs != null
      ? `${formatNum(station.meanWindMs, locale)} m/s`
      : '–'
    const temp = station.airTemperatureC != null
      ? `${formatNum(station.airTemperatureC, locale)} °C`
      : '–'
    const dir = station.windDirectionText ?? ''

    const container = document.createElement('div')
    container.style.cssText = 'font-size:12px;line-height:1.5'

    const name = document.createElement('strong')
    name.style.fontSize = '13px'
    name.textContent = station.stationName ?? 'Stöð'
    container.appendChild(name)
    container.appendChild(document.createElement('br'))
    container.appendChild(document.createTextNode(`Vindur: ${mean}${dir ? ' ' + dir : ''}`))
    container.appendChild(document.createElement('br'))
    container.appendChild(document.createTextNode(`Vindhviða: ${gust}`))
    container.appendChild(document.createElement('br'))
    container.appendChild(document.createTextNode(`Lofthiti: ${temp}`))

    popupRef.current?.remove()
    const popup = new Popup({ closeButton: true, maxWidth: '220px' })
      .setLngLat(coords)
      .setDOMContent(container)
      .addTo(map)
    popupRef.current = popup
  }

  function openOverviewVedurstofanPopup(
    station: StationExplorerResponse['stations'][number],
    coords: [number, number],
    forecastAnchorMs: number,
  ) {
    const Popup = popupConstructorRef.current
    const map = mapRef.current
    if (!Popup || !map) return

    const selectedIdx = selectForecastRowAt(station.forecasts, forecastAnchorMs)
    const row = selectedIdx !== null ? station.forecasts[selectedIdx] : null
    const wind = row?.windSpeedMs != null ? `${formatNum(row.windSpeedMs, locale)} m/s` : '–'
    const temp = row?.temperatureC != null ? `${formatNum(row.temperatureC, locale)} °C` : '–'
    const dir = row?.windDirectionText ?? ''
    const time = row?.ftimeIso ? formatKlTime(row.ftimeIso) : null

    const container = document.createElement('div')
    container.style.cssText = 'font-size:12px;line-height:1.5'

    const name = document.createElement('strong')
    name.style.fontSize = '13px'
    name.textContent = station.stationName ?? 'Stöð'
    container.appendChild(name)
    container.appendChild(document.createElement('br'))
    if (time) {
      container.appendChild(document.createTextNode(`Spá kl. ${time}`))
      container.appendChild(document.createElement('br'))
    }
    container.appendChild(document.createTextNode(`Vindur: ${wind}${dir ? ' ' + dir : ''}`))
    container.appendChild(document.createElement('br'))
    container.appendChild(document.createTextNode(`Lofthiti: ${temp}`))

    popupRef.current?.remove()
    const popup = new Popup({ closeButton: true, maxWidth: '220px' })
      .setLngLat(coords)
      .setDOMContent(container)
      .addTo(map)
    popupRef.current = popup
  }

  function updateVegagerdinLabelMarkerState(
    statuses = visibleRouteStatusesRef.current,
    mode = routeWeatherModeRef.current,
  ) {
    for (const { element, point } of routeVegagerdinLabelMarkersRef.current) {
      const visible = mode === 'now' && routeStatusIsVisible(point.windDisplayStatus, statuses)
      const color = WIND_STATUS_MARKER_COLOR[displayWindStatus(point.windDisplayStatus)]
      element.style.display = visible ? 'block' : 'none'
      updateRouteWindLabelColor(element, color)
    }
  }

  function updateVedurstofanLabelMarkerState(
    statuses = visibleRouteStatusesRef.current,
    mode = routeWeatherModeRef.current,
  ) {
    for (const { element, entry } of routeVedurstofanLabelMarkersRef.current) {
      const visible = mode === 'forecast' && routeStatusIsVisible(entry.windDisplayStatus, statuses)
      const color = WIND_STATUS_MARKER_COLOR[displayWindStatus(entry.windDisplayStatus)]
      element.style.display = visible ? 'block' : 'none'
      updateRouteWindLabelColor(element, color)
    }
  }

  function handleRouteStatusFilterModeChange(mode: WindStatusFilterMode) {
    routeStatusFilterModeRef.current = mode
    setRouteStatusFilterMode(mode)
    applyRouteStatusFilterToMap(mapRef.current, visibleRouteStatusesRef.current, mode)
    updateRouteWeatherLayerVisibility()
    updateOverviewMarkerVisibility()
  }

  function setActiveRouteFieldState(field: RouteBridgeField) {
    activeRouteFieldRef.current = field
    setActiveRouteField(field)
  }

  function handleRouteStatusFilterChange(next: Set<WindDisplayStatus>) {
    visibleRouteStatusesRef.current = next
    setVisibleRouteStatuses(next)
    applyRouteStatusFilterToMap(mapRef.current, next, routeStatusFilterModeRef.current)
    updateRouteWeatherLayerVisibility(routeWeatherModeRef.current, next)
  }

  function handleOverviewStatusFilterChange(next: Set<WindDisplayStatus>) {
    overviewVisibleStatusesRef.current = next
    setOverviewVisibleStatuses(next)
    updateOverviewMarkerVisibility(next)
  }

  function handleOverviewModeChange(mode: 'now' | number) {
    overviewActiveModeRef.current = mode
    setOverviewActiveMode(mode)
    updateOverviewLayerVisibility(mode, routeActiveRef.current)
  }

  function updateOverviewLayerVisibility(
    mode = overviewActiveModeRef.current,
    routeActive = routeActiveRef.current,
  ) {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    removeOverviewMapLayerArtifacts(map)
    if (map.getLayer(OVERVIEW_VEGAGERDIN_LAYER_ID)) {
      map.setLayoutProperty(
        OVERVIEW_VEGAGERDIN_LAYER_ID,
        'visibility',
        'none',
      )
    }
    if (map.getLayer(OVERVIEW_VEDURSTOFAN_LAYER_ID)) {
      map.setLayoutProperty(
        OVERVIEW_VEDURSTOFAN_LAYER_ID,
        'visibility',
        'none',
      )
    }
    updateOverviewMarkerVisibility(overviewVisibleStatusesRef.current, mode, routeActive)
    bringWeatherLayersToFront(map)
  }

  function handleSelectRouteNow() {
    setSelectedCandidateIdx(null)
    setRouteDepartureForecastExpanded(false)
    setRouteWeatherModeState('now')
    const counts = countWindDisplayStatuses(routeVegagerdinPointsRef.current)
    setRouteNowStatusCounts(counts)
    setRouteVisibleStatusCounts(counts)
    updateRouteWeatherLayerVisibility('now')
  }

  function handleSelectCandidateIdx(idx: number | null) {
    if (idx === null) {
      handleSelectRouteNow()
      return
    }

    setSelectedCandidateIdx(idx)
    const layer = vedurstofanLayerRef.current
    const candidates = routeCandidates
    const candidate = candidates ? candidates[idx] : null

    if (!layer || !candidate) {
      handleSelectRouteNow()
      return
    }
    const newDepartureMs = candidate ? Date.parse(candidate.departureIso) : Date.now()
    const render = renderVedurstofanStations(
      layer,
      routeDurationMinutesRef.current,
      routeThresholdsRef.current,
      newDepartureMs,
    )
    setRouteWeatherModeState('forecast')
    setRouteVisibleStatusCounts(render.statusCounts)
    updateRouteWeatherLayerVisibility('forecast')
  }

  function resolveRouteThresholdInputs(): ResolvedTravelThresholds | null {
    const caution = Number(routeCautionWind)
    const red = Number(routeRedWind)
    if (
      !Number.isFinite(caution) ||
      !Number.isFinite(red) ||
      caution <= 0 ||
      red <= 0 ||
      caution > 40 ||
      red > 40
    ) {
      setRouteThresholdError(t('roadMapPrototypeThresholdError'))
      return null
    }

    const resolved = resolveThresholds('none', {
      cautionWindMs: caution,
      redWindMs: red,
    })
    if (validateResolvedThresholdOrdering(resolved)) {
      setRouteThresholdError(t('thresholdBarOrderingError'))
      return null
    }

    setRouteThresholdError(null)
    return resolved
  }

  function selectRoutePlace(place: RoadIntelligencePlaceResult, target = activeRouteFieldRef.current) {
    setRouteBridgeError(null)
    if (target === 'from') {
      setRouteFrom(place.name)
      setFromResolved(place)
      setFromSuggestions([])
      setActiveRouteFieldState('to')
      return
    }

    setRouteTo(place.name)
    setToResolved(place)
    setToSuggestions([])
    setActiveRouteFieldState('to')
  }

  selectRoutePlaceRef.current = selectRoutePlace

  function clearRouteVegagerdinLabelMarkers() {
    routeVegagerdinLabelMarkersRef.current.forEach(({ marker }) => marker.remove())
    routeVegagerdinLabelMarkersRef.current = []
    routeVegagerdinPointsRef.current = []
  }

  function clearRouteVedurstofanLabelMarkers() {
    routeVedurstofanLabelMarkersRef.current.forEach(({ marker }) => marker.remove())
    routeVedurstofanLabelMarkersRef.current = []
    routeVedurstofanEntriesRef.current = []
  }

  function clearRouteEndpointMarkers() {
    routeEndpointMarkersRef.current.forEach(({ marker }) => marker.remove())
    routeEndpointMarkersRef.current = []
  }

  function reconcilePlaceMarkerVisibility() {
    const selectionOwnsMap = weatherChaseSelectedItemsRef.current.length > 0
    if (routeActiveRef.current || selectionOwnsMap) {
      for (const { element } of placeMarkersRef.current) {
        element.style.display = 'none'
      }
      return
    }
    const zoom = mapRef.current?.getZoom() ?? 6
    for (const { element, place } of placeMarkersRef.current) {
      const isVisible =
        place.importance === 3 ||
        (place.importance === 2 && zoom >= 5.8) ||
        zoom >= 7.2
      element.style.display = isVisible ? 'block' : 'none'
    }
  }

  function clearWeatherChaseMapMarkers() {
    weatherChaseMapMarkersRef.current.forEach(({ marker }) => marker.remove())
    weatherChaseMapMarkersRef.current = []
  }

  function fetchSuggestionsFor(
    query: string,
    abortRef: MutableRefObject<AbortController | null>,
    timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
    focusedRef: MutableRefObject<boolean>,
    setSuggestions: (s: RoadIntelligencePlaceResult[]) => void,
  ) {
    if (timerRef.current) clearTimeout(timerRef.current)
    abortRef.current?.abort()
    if (query.trim().length < 2) {
      setSuggestions([])
      return
    }

    const localSuggestions = findRoadMapPlaceSuggestions(query, 5)
    if (focusedRef.current) {
      setSuggestions(localSuggestions)
    }

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch(`/api/place/search?q=${encodeURIComponent(query.trim())}`, {
          credentials: 'same-origin',
          signal: controller.signal,
        })
        if (!res.ok || controller.signal.aborted) return
        const data = await res.json().catch(() => null)
        if (controller.signal.aborted) return
        const fetchedResults = parsePlaceSearchResults(data)
        const results = mergePlaceSuggestions(fetchedResults, localSuggestions, 5)
        if (process.env.NODE_ENV !== 'production') {
          console.log('[RoadMapPrototype] suggest:', { query: query.trim(), count: results.length, focused: focusedRef.current, first: results[0] })
        }
        // Only open dropdown if the input is still focused; don't reopen after user moved away.
        if (focusedRef.current) {
          setSuggestions(results)
        }
      } catch {
        // suggestions are non-critical — ignore fetch errors silently
      }
    }, 250)
  }

  function handleClearRoute() {
    setRouteBridgeStatus('idle')
    setRouteBridgeError(null)
    setRouteThresholdError(null)
    setRouteBridgeSummary(null)
    setRouteFrom('')
    setRouteTo('')
    setFromResolved(null)
    setToResolved(null)
    setFromSuggestions([])
    setToSuggestions([])
    setRouteCandidates(null)
    setRouteSlotStatusOverrides(null)
    setRouteNowStatusCounts(null)
    setRouteNowMeasuredAtIso(null)
    setRouteVisibleStatusCounts(null)
    resetRouteDepartureForecastState()
    setRouteSurfaceChoices([])
    setRouteSurfaceChoicesStatus('idle')
    setRouteSwitchingChoiceId(null)
    setVisibleCandidateLimit(ROUTE_TIMELINE_INITIAL_SLOT_COUNT)
    setRouteCalculationPlaceNames(null)
    setSelectedCandidateIdx(null)
    setRouteWeatherModeState('now')
    routeActiveRef.current = false
    setRouteActive(false)
    vedurstofanLayerRef.current = undefined
    resolvedRoutePlacesRef.current = null
    handleRouteStatusFilterChange(new Set())
    setActiveRouteFieldState('from')
    clearRouteVedurstofanLabelMarkers()
    clearRouteVegagerdinLabelMarkers()
    clearRouteEndpointMarkers()
    const map = mapRef.current
    if (!map) return
    for (const sourceId of [
      VEGAGERDIN_ROUTE_STATIONS_LAYER_ID,
      VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID,
      TRAVEL_METNO_LAYER_ID,
      'travel-bridge-route',
    ] as const) {
      const source = map.getSource(sourceId)
      if (source) {
        ;(source as import('maplibre-gl').GeoJSONSource).setData(
          EMPTY_FEATURE_COLLECTION as never,
        )
      }
    }
    updateOverviewLayerVisibility(overviewActiveModeRef.current, false)
    reconcilePlaceMarkerVisibility()
    map.flyTo({ center: ICELAND_CENTER, zoom: ICELAND_ZOOM, duration: 600 })
  }

  async function fetchBridgePlaceResults(
    query: string,
    signal: AbortSignal,
  ): Promise<RoadIntelligencePlaceResult[]> {
    const res = await fetch(`/api/place/search?q=${encodeURIComponent(query.trim())}`, {
      credentials: 'same-origin',
      signal,
    })
    if (res.status === 401) throw new Error('auth')
    if (res.status === 429) throw new Error('rate_limited')
    if (!res.ok) throw new Error('place_search_failed')

    const data = await res.json().catch(() => null)
    const results = parsePlaceSearchResults(data)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[RoadMapPrototype] place search:', { query: query.trim(), status: res.status, rawData: data, parsed: results })
    }
    return results
  }

  async function resolveBridgePlace(
    query: string,
    signal: AbortSignal,
    localCandidates: readonly (RoadIntelligencePlaceResult | null | undefined)[] = [],
  ): Promise<RoadIntelligencePlaceResult> {
    const staticCandidates = findRoadMapPlaceSuggestions(query, 5)
    const localPlace = selectBestPlaceForQuery(query, [...localCandidates, ...staticCandidates])
    if (localPlace) return localPlace

    const results = await fetchBridgePlaceResults(query, signal)
    let place = selectBestPlaceForQuery(query, mergePlaceSuggestions(results, staticCandidates, 8), {
      allowFirstFallback: true,
    })

    if (!place && !/\b(ísland|island|iceland)\b/i.test(query)) {
      const icelandResults = await fetchBridgePlaceResults(`${query}, Ísland`, signal)
      place = selectBestPlaceForQuery(query, mergePlaceSuggestions(icelandResults, staticCandidates, 8), {
        allowFirstFallback: true,
      })
    }

    if (!place) throw new Error('place_not_found')
    return place
  }

  async function fetchVegagerdinCurrentForRoute(
    signal: AbortSignal,
  ): Promise<VegagerdinCurrentApiData | null> {
    if (overviewVegagerdinData?.status === 'ok' && overviewVegagerdinData.stations.length > 0) {
      logRoadMapDiagnostic('vegagerdin route data using overview cache', {
        stationCount: overviewVegagerdinData.stations.length,
        cacheStatus: overviewVegagerdinData.cacheStatus,
        measurementFreshness: overviewVegagerdinData.measurementFreshness,
      })
      return overviewVegagerdinData
    }

    try {
      if (!overviewVegagerdinRestricted) {
        const res = await fetch('/api/teskeid/weather/vegagerdin/current', {
          credentials: 'same-origin',
          signal,
        })
        logRoadMapDiagnostic('vegagerdin current fetch response', {
          status: res.status,
          ok: res.ok,
        })
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          setOverviewVegagerdinRestricted(true)
        } else if (res.ok) {
          const payload = await res.json().catch(() => null) as VegagerdinCurrentApiData | null
          const payloadObject = typeof payload === 'object' && payload !== null ? payload : null
          logRoadMapDiagnostic('vegagerdin current payload', {
            payloadStatus: payload?.status ?? null,
            stationCount: Array.isArray(payload?.stations) ? payload.stations.length : null,
            cacheStatus: payloadObject && 'cacheStatus' in payloadObject ? payloadObject.cacheStatus : null,
            measurementFreshness: payloadObject && 'measurementFreshness' in payloadObject ? payloadObject.measurementFreshness : null,
          })
          if (payload?.status === 'ok' && Array.isArray(payload.stations)) {
            setOverviewVegagerdinData(payload)
            setOverviewVegagerdinRestricted(false)
            if (payload.stations.length > 0) return payload
          }
        }
      }
    } catch (error) {
      if (!signal.aborted) {
        console.warn('[RoadMap] vegagerdin current route fetch failed:', error)
      }
    }

    try {
      const fallback = await fetchRoadIntelligenceVegagerdinStationsForRoute(signal)
      if (fallback?.status === 'ok') {
        setOverviewVegagerdinData(fallback)
        logRoadMapDiagnostic('vegagerdin route data using station-markers fallback', {
          stationCount: fallback.stations.length,
        })
        return fallback
      }
    } catch (error) {
      if (!signal.aborted) {
        console.warn('[RoadMap] road-intelligence station route fallback failed:', error)
      }
    } finally {
      if (!signal.aborted) {
        setOverviewVegagerdinLoading(false)
      }
    }

    return null
  }

  async function fetchRoadIntelligenceVegagerdinStationsForRoute(
    signal: AbortSignal,
  ): Promise<VegagerdinCurrentApiData | null> {
    const res = await fetch('/api/teskeid/road-intelligence/station-markers', {
      credentials: 'same-origin',
      signal,
    })
    logRoadMapDiagnostic('station-markers fallback fetch response', {
      status: res.status,
      ok: res.ok,
    })
    if (res.status === 401 || res.status === 403 || res.status === 404) return null
    if (!res.ok) return null

    const geojson = await res.json().catch(() => null) as { features?: unknown } | null
    const features = Array.isArray(geojson?.features)
      ? geojson.features as RoadIntelligenceStationMarkerFeature[]
      : []
    logRoadMapDiagnostic('station-markers fallback payload', {
      featureCount: features.length,
    })
    if (features.length === 0) return null

    const fetchedAtIso = new Date().toISOString()
    const stations = features
      .map((feature): VegagerdinCurrentStationDto | null => {
        const coords = feature.geometry?.coordinates
        if (!Array.isArray(coords) || coords.length < 2) return null
        const lon = readStationMarkerFiniteNumber(coords[0])
        const lat = readStationMarkerFiniteNumber(coords[1])
        if (lat === null || lon === null) return null

        const properties = feature.properties ?? {}
        const stationId = readStationMarkerString(properties.stationId)
        if (!stationId) return null
        const stationName = readStationMarkerString(properties.stationName) ?? stationId
        const measuredAtIso = readStationMarkerString(properties.measuredAtIso) ?? fetchedAtIso

        return {
          stationId,
          stationName,
          lat,
          lon,
          measuredAtIso,
          fetchedAtIso,
          meanWindMs: readStationMarkerFiniteNumber(properties.meanWindMs),
          gustLast10MinMs: readStationMarkerFiniteNumber(properties.gustMs),
          windDirectionDeg: readStationMarkerFiniteNumber(properties.windDirectionDeg),
          windDirectionText: null,
          airTemperatureC: readStationMarkerFiniteNumber(properties.airTemperatureC),
          roadTemperatureC: null,
          dataQuality: 'partial',
        }
      })
      .filter((station): station is VegagerdinCurrentStationDto => station !== null)
    logRoadMapDiagnostic('station-markers fallback parsed payload', {
      featureCount: features.length,
      stationCount: stations.length,
      sample: stations.slice(0, 5).map(station => ({
        id: station.stationId,
        name: station.stationName,
        hasWind: typeof station.meanWindMs === 'number',
        hasGust: typeof station.gustLast10MinMs === 'number',
      })),
    })

    if (stations.length === 0) {
      logRoadMapDiagnostic('station-markers fallback parsed zero stations', {
        featureCount: features.length,
      })
      return null
    }

    return {
      status: 'ok',
      cacheStatus: null,
      measurementFreshness: 'unknown',
      fetchedAtIso,
      oldestMeasuredAtIso: null,
      stations,
    }
  }

  function buildClientVegagerdinRouteLayer(
    result: DeterministicResult,
    thresholds: ResolvedTravelThresholds,
    currentData: VegagerdinCurrentApiData | null = overviewVegagerdinData,
  ): VegagerdinRouteLayer | undefined {
    if (currentData?.status !== 'ok') {
      logRoadMapDiagnostic('vegagerdin client layer skipped', {
        reason: 'current-data-not-ok',
        currentStatus: currentData?.status ?? null,
      })
      return undefined
    }

    const routePolyline = result.travelPlan?.route.auditPolylinePoints ?? []
    if (routePolyline.length < 2) {
      logRoadMapDiagnostic('vegagerdin client layer skipped', {
        reason: 'route-polyline-too-short',
        routePolylineCount: routePolyline.length,
        stationCount: currentData.stations.length,
      })
      return undefined
    }

    const matchableStations = currentData.stations.filter(station =>
      Number.isFinite(station.lat) &&
      Number.isFinite(station.lon) &&
      station.stationId.trim().length > 0,
    )
    logRoadMapDiagnostic('vegagerdin client layer input', {
      routePolylineCount: routePolyline.length,
      stationCount: currentData.stations.length,
      matchableStationCount: matchableStations.length,
      cacheStatus: currentData.cacheStatus,
      measurementFreshness: currentData.measurementFreshness,
    })
    if (matchableStations.length === 0) return undefined

    const measurementByStationId = new Map(
      matchableStations.map(station => [station.stationId, station]),
    )
    const matches = matchVegagerdinPointsToRoute({
      points: matchableStations.map(station => ({
        id: station.stationId,
        name: station.stationName,
        lat: station.lat,
        lon: station.lon,
      })),
      routePolyline,
      debugLabel: 'client-buildClientVegagerdinRouteLayer',
    })

    const layerPoints: VegagerdinRouteLayer['points'] = matches
      .map((match): VegagerdinRouteLayer['points'][number] | null => {
        const station = measurementByStationId.get(match.point.id)
        if (!station) return null
        const statusWindMs = station.gustLast10MinMs ?? station.meanWindMs
        return {
          routePointId: `vegagerdin_client_${station.stationId}`,
          stationId: station.stationId,
          stationName: station.stationName,
          lat: station.lat,
          lon: station.lon,
          distanceM: Math.round(match.distanceM),
          distanceFromOriginM: Math.round(match.distanceFromOriginM),
          routeFraction: match.routeFraction,
          measuredAtIso: station.measuredAtIso,
          fetchedAtIso: station.fetchedAtIso,
          meanWindMs: station.meanWindMs,
          gustLast10MinMs: station.gustLast10MinMs,
          windDirectionDeg: station.windDirectionDeg,
          windDirectionText: station.windDirectionText,
          airTemperatureC: station.airTemperatureC,
          roadTemperatureC: station.roadTemperatureC,
          dataQuality: station.dataQuality,
          windDisplayStatus: classifyObservationWindDisplayStatus(station, thresholds),
          statusWindMs,
        }
      })
      .filter((point): point is VegagerdinRouteLayer['points'][number] => point !== null)
      .sort((a, b) => {
        const af = a.distanceFromOriginM ?? Infinity
        const bf = b.distanceFromOriginM ?? Infinity
        return af !== bf ? af - bf : a.stationId.localeCompare(b.stationId)
      })

    if (layerPoints.length === 0) {
      logRoadMapDiagnostic('vegagerdin client layer empty after matches', {
        matchCount: matches.length,
      })
      return undefined
    }

    const noWindDataPointCount = layerPoints.filter(point =>
      point.windDisplayStatus === 'no_data' || point.windDisplayStatus === 'no_wind_data',
    ).length
    const measuredAtIsoValues = layerPoints.map(point => point.measuredAtIso).sort()
    const fetchedAtIsoValues = layerPoints.map(point => point.fetchedAtIso).sort()

    return {
      provider: 'vegagerdin',
      status: noWindDataPointCount > 0 ? 'partial' : 'available',
      cacheStatus: currentData.cacheStatus,
      measurementFreshness: currentData.measurementFreshness,
      measuredAtIso: measuredAtIsoValues[measuredAtIsoValues.length - 1] ?? null,
      fetchedAtIso: fetchedAtIsoValues[fetchedAtIsoValues.length - 1] ?? null,
      mappedPointCount: matches.length,
      availablePointCount: layerPoints.length - noWindDataPointCount,
      noWindDataPointCount,
      points: layerPoints,
    }
  }

  function renderTravelBridgeResult(
    result: DeterministicResult,
    thresholds: ResolvedTravelThresholds,
  ) {
    const mapData = buildTravelBridgeMapData(result)
    if (!mapData.ok) throw new Error(mapData.error)

    const map = mapRef.current
    if (!map?.isStyleLoaded()) throw new Error('map_not_ready')

    const weatherPointGeoJson = annotateRouteWeatherPointStatuses(
      mapData.weatherPointGeoJson,
      thresholds,
    )
    const statusCounts = countRouteWeatherPointStatuses(weatherPointGeoJson)

    const routeSource = map.getSource('travel-bridge-route')
    if (routeSource) {
      ;(routeSource as import('maplibre-gl').GeoJSONSource).setData(mapData.routeGeoJson as never)
    } else {
      map.addSource('travel-bridge-route', {
        type: 'geojson',
        data: mapData.routeGeoJson as never,
      })
      map.addLayer(
        {
          id: 'travel-bridge-route',
          type: 'line',
          source: 'travel-bridge-route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': TRAVEL_ROUTE_COLOR,
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5, 3,
              8, 5,
              11, 7,
            ] as unknown as number,
            'line-opacity': 0.86,
          },
        },
        map.getLayer(OVERVIEW_VEGAGERDIN_LAYER_ID) ? OVERVIEW_VEGAGERDIN_LAYER_ID : undefined,
      )
    }

    // M3B: do not render the sampled MET/Yr route points on the prototype map.
    // They still exist in the response as a fallback assessment path, but the visible
    // route weather layer is provider-station based (Vegagerðin first, Veðurstofan fallback).
    const pointSource = map.getSource(TRAVEL_METNO_LAYER_ID)
    if (pointSource) {
      ;(pointSource as import('maplibre-gl').GeoJSONSource).setData(
        EMPTY_FEATURE_COLLECTION as never,
      )
    }
    if (map.getLayer(TRAVEL_METNO_LAYER_ID)) {
      map.setLayoutProperty(TRAVEL_METNO_LAYER_ID, 'visibility', 'none')
    }
    applyRouteStatusFilterToMap(
      map,
      visibleRouteStatusesRef.current,
      routeStatusFilterModeRef.current,
    )

    const [west, south, east, north] = mapData.bbox
    map.fitBounds([[west, south], [east, north]], {
      padding: { top: 150, right: 40, bottom: 170, left: 40 },
      duration: 650,
      maxZoom: 9,
    })

    return { ...mapData, statusCounts }
  }

  function openVedurstofanRouteStationPopup(
    entry: VedurstofanRouteStatusEntry,
    coords: [number, number] = [entry.point.lon, entry.point.lat],
  ) {
    const Popup = popupConstructorRef.current
    const map = mapRef.current
    if (!Popup || !map) return

    const container = document.createElement('div')
    container.style.cssText = 'font-size:12px;line-height:1.5;min-width:160px'

    const name = document.createElement('strong')
    name.style.fontSize = '13px'
    name.textContent = entry.point.stationName
    container.appendChild(name)

    const appendLine = (text: string) => {
      container.appendChild(document.createElement('br'))
      container.appendChild(document.createTextNode(text))
    }

    if (entry.point.distanceFromOriginM != null) {
      appendLine(labelsRef.current.routePointDistance(
        formatNum(entry.point.distanceFromOriginM / 1000, locale),
      ))
    }

    if (entry.selectedRow?.windSpeedMs != null) {
      appendLine(labelsRef.current.routePointWind(formatNum(entry.selectedRow.windSpeedMs, locale)))
    }

    if (entry.selectedRow?.ftimeIso) {
      appendLine(labelsRef.current.routePointEta(formatKlTime(entry.selectedRow.ftimeIso)))
    }

    if (entry.point.status === 'stale') {
      container.appendChild(document.createElement('br'))
      const staleNote = document.createElement('span')
      staleNote.style.color = '#94a3b8'
      staleNote.textContent = labelsRef.current.routeStationStale
      container.appendChild(staleNote)
    }

    popupRef.current?.remove()
    const popup = new Popup({ closeButton: true, maxWidth: '240px' })
      .setLngLat(coords)
      .setDOMContent(container)
      .addTo(map)
    popupRef.current = popup
  }

  function routeLabelPlacementForPoint(
    points: ReadonlyArray<{ lat: number; lon: number }>,
    index: number,
  ): RouteLabelPlacement {
    void points
    void index
    return { layout: 'vertical', anchor: 'center', offset: [0, 0] }
  }

  function rectsOverlap(a: DOMRect, b: DOMRect, padding = 2): boolean {
    return !(
      a.right + padding < b.left ||
      a.left - padding > b.right ||
      a.bottom + padding < b.top ||
      a.top - padding > b.bottom
    )
  }

  function applyRouteLabelCollisionAvoidance(elements: HTMLButtonElement[]) {
    const visibleElements = elements.filter(element => element.style.display !== 'none')
    if (visibleElements.length <= 14) {
      for (const element of visibleElements) {
        const nameLabel = element.querySelector<HTMLElement>('[data-route-wind-name="true"]')
        if (nameLabel) nameLabel.style.display = 'inline-flex'
      }
      return
    }

    const valueRects = visibleElements
      .map(element => element.querySelector<HTMLElement>('[data-route-wind-value="true"]'))
      .filter((value): value is HTMLElement => Boolean(value))
      .map(value => value.getBoundingClientRect())
    const acceptedNameRects: DOMRect[] = []

    for (const element of visibleElements) {
      const nameLabel = element.querySelector<HTMLElement>('[data-route-wind-name="true"]')
      if (!nameLabel) continue
      nameLabel.style.display = 'inline-flex'
      const nameRect = nameLabel.getBoundingClientRect()
      const collidesWithValue = valueRects.some(rect => rectsOverlap(nameRect, rect, 3))
      const collidesWithName = acceptedNameRects.some(rect => rectsOverlap(nameRect, rect, 4))
      if (collidesWithValue || collidesWithName) {
        nameLabel.style.display = 'none'
      } else {
        acceptedNameRects.push(nameRect)
      }
    }
  }

  function createRouteWeatherPointMarkerElement({
    stationName,
    windText,
    gustText,
    directionText,
    temperatureText,
    precipitationText,
    secondaryMetricText,
    secondaryMetricTitle,
    secondaryMetricAriaText,
    weatherEmoji,
    etaText,
    color,
    compact = false,
    showNameLabel = true,
    placement = { layout: 'vertical', anchor: 'bottom', offset: [0, -8] },
    onClick,
  }: {
    stationName: string
    windText: string
    gustText?: string | null
    directionText?: string | null
    temperatureText?: string | null
    precipitationText?: string | null
    secondaryMetricText?: string | null
    secondaryMetricTitle?: string | null
    secondaryMetricAriaText?: string | null
    weatherEmoji?: string | null
    etaText?: string | null
    color: string
    compact?: boolean
    showNameLabel?: boolean
    placement?: RouteLabelPlacement
    onClick: () => void
  }): HTMLButtonElement {
    void placement
    const windValueText = gustText ? `${windText} (${gustText})` : windText
    const rightMetricText = secondaryMetricText ?? precipitationText ?? null
    const rightMetricTitle = secondaryMetricTitle ?? labelsRef.current.routeMarkerPrecipitationTitle
    const ariaParts = [
      stationName,
      directionText ? labelsRef.current.routeMarkerWindDirection(directionText) : null,
      labelsRef.current.routeMarkerWind(windValueText),
      temperatureText ? labelsRef.current.routeMarkerTemperature(temperatureText) : null,
      secondaryMetricAriaText ??
        (precipitationText ? labelsRef.current.routeMarkerPrecipitation(precipitationText) : null),
      etaText ? labelsRef.current.routeMarkerEta(etaText) : null,
    ].filter(Boolean)
    const element = document.createElement('button')
    element.type = 'button'
    element.title = stationName
    element.setAttribute('aria-label', ariaParts.join(', '))
    element.style.cssText = [
      'pointer-events:auto',
      'display:block',
      'width:0',
      'height:0',
      'border:0',
      'background:transparent',
      `font:700 ${compact ? '9px' : '10px'}/1.12 Inter,system-ui,sans-serif`,
      'padding:0',
      'cursor:pointer',
      'position:relative',
      'overflow:visible',
      'transform:translateZ(0)',
      'z-index:8',
    ].join(';')

    const dot = document.createElement('span')
    dot.dataset.routeWindDot = 'true'
    dot.style.cssText = [
      'position:absolute',
      'left:-5px',
      'top:-5px',
      `width:${compact ? '8px' : '10px'}`,
      `height:${compact ? '8px' : '10px'}`,
      'border:2px solid #ffffff',
      'border-radius:999px',
      `background:${color}`,
      'box-shadow:0 1px 4px rgba(15,23,42,0.24)',
    ].join(';')
    element.appendChild(dot)

    const stack = document.createElement('span')
    stack.dataset.routeWeatherStack = 'true'
    stack.style.cssText = [
      'position:absolute',
      'left:50%',
      `bottom:${compact ? '8px' : '10px'}`,
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'gap:2px',
      'max-width:136px',
      'transform:translateX(-50%)',
    ].join(';')

    if (etaText) {
      const eta = document.createElement('span')
      eta.textContent = `🚗 ${etaText}`
      eta.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'justify-content:center',
        'white-space:nowrap',
        'border:1px solid rgba(21,66,18,0.16)',
        'border-radius:999px',
        'background:rgba(255,255,255,0.94)',
        'color:#334155',
        'box-shadow:0 1px 4px rgba(15,23,42,0.12)',
        'font:700 9px/1 Inter,system-ui,sans-serif',
        'padding:2px 5px',
      ].join(';')
      stack.appendChild(eta)
    }

    if (weatherEmoji) {
      const emoji = document.createElement('span')
      emoji.textContent = weatherEmoji
      emoji.style.cssText = [
        'display:block',
        `font-size:${compact ? '12px' : '14px'}`,
        'line-height:1',
        `height:${compact ? '12px' : '14px'}`,
        'text-align:center',
        'text-shadow:0 1px 2px rgba(255,255,255,0.95),0 1px 5px rgba(15,23,42,0.18)',
      ].join(';')
      stack.appendChild(emoji)
    }

    const weatherCard = document.createElement('span')
    weatherCard.dataset.routeWindValue = 'true'
    weatherCard.style.cssText = [
      'display:flex',
      'flex-direction:column',
      `min-width:${compact ? '56px' : '64px'}`,
      'overflow:hidden',
      'white-space:nowrap',
      `border:1.5px solid ${color}`,
      'border-radius:7px',
      'background:rgba(255,255,255,0.97)',
      'color:#1f2937',
      'box-shadow:0 1px 5px rgba(15,23,42,0.20)',
    ].join(';')

    const windRow = document.createElement('span')
    windRow.style.cssText = [
      'display:flex',
      'align-items:baseline',
      'justify-content:center',
      'gap:3px',
      'border-bottom:1px solid rgba(15,23,42,0.12)',
      'padding:3px 6px',
      `font:800 ${compact ? '10px' : '11px'}/1 Inter,system-ui,sans-serif`,
    ].join(';')

    const direction = document.createElement('span')
    direction.textContent = windDirectionTextToArrow(directionText)
    direction.title = directionText ?? ''
    direction.style.cssText = [
      `font-size:${compact ? '11px' : '12px'}`,
      'line-height:1',
      'color:#475569',
    ].join(';')
    windRow.appendChild(direction)

    const wind = document.createElement('span')
    wind.dataset.routeWindSpeed = 'true'
    wind.textContent = windValueText
    wind.style.cssText = `color:${color}`
    windRow.appendChild(wind)
    weatherCard.appendChild(windRow)

    const bottomRow = document.createElement('span')
    bottomRow.dataset.routeWeatherBottom = 'true'
    bottomRow.style.cssText = [
      'display:grid',
      'grid-template-columns:1fr 1fr',
      `min-height:${compact ? '16px' : '17px'}`,
      `font:700 ${compact ? '9px' : '10px'}/1 Inter,system-ui,sans-serif`,
    ].join(';')

    const temp = document.createElement('span')
    temp.textContent = temperatureText ? `${temperatureText}°` : '–'
    temp.title = labelsRef.current.routeMarkerTemperatureTitle
    temp.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'border-right:1px solid rgba(15,23,42,0.12)',
      'padding:3px 5px',
      'color:#334155',
    ].join(';')
    bottomRow.appendChild(temp)

    const precip = document.createElement('span')
    precip.textContent = rightMetricText ?? '–'
    precip.title = rightMetricTitle
    precip.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:3px 5px',
      'color:#334155',
    ].join(';')
    bottomRow.appendChild(precip)
    weatherCard.appendChild(bottomRow)
    stack.appendChild(weatherCard)

    if (showNameLabel) {
      const name = document.createElement('span')
      name.dataset.routeWindName = 'true'
      name.textContent = stationName
      name.style.cssText = [
        'display:inline-flex',
        'max-width:120px',
        'overflow:hidden',
        'text-overflow:ellipsis',
        'white-space:nowrap',
        'font-weight:600',
        'font-size:9px',
        'line-height:1.15',
        'border:1px solid rgba(21,66,18,0.18)',
        'border-radius:999px',
        'background:rgba(255,255,255,0.92)',
        'color:#334155',
        'box-shadow:0 1px 3px rgba(15,23,42,0.12)',
        'padding:2px 5px',
      ].join(';')
      stack.appendChild(name)
    }
    element.appendChild(stack)

    element.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      onClick()
    })

    return element
  }

  function updateRouteWindLabelColor(element: HTMLElement, color: string) {
    const valueLabel = element.querySelector<HTMLElement>('[data-route-wind-value="true"]')
    if (valueLabel) {
      valueLabel.style.borderColor = color
      valueLabel.style.color = color
    }
    const windSpeed = element.querySelector<HTMLElement>('[data-route-wind-speed="true"]')
    if (windSpeed) windSpeed.style.color = color
    const dot = element.querySelector<HTMLElement>('[data-route-wind-dot="true"]')
    if (dot) dot.style.background = color
  }

  function createVedurstofanRouteLabel(
    entry: VedurstofanRouteStatusEntry,
    placement?: RouteLabelPlacement,
  ): HTMLButtonElement {
    const windText = entry.selectedRow?.windSpeedMs != null
      ? formatNum(entry.selectedRow.windSpeedMs, locale)
      : '–'
    const temperatureText = entry.selectedRow?.temperatureC != null
      ? formatNum(entry.selectedRow.temperatureC, locale)
      : null
    const precipitationText = entry.selectedRow?.precipitationMmPerHour != null
      ? formatNum(entry.selectedRow.precipitationMmPerHour, locale)
      : null
    const color = WIND_STATUS_MARKER_COLOR[displayWindStatus(entry.windDisplayStatus)]
    return createRouteWeatherPointMarkerElement({
      stationName: entry.point.stationName,
      windText,
      directionText: entry.selectedRow?.windDirectionText ?? null,
      temperatureText,
      precipitationText,
      weatherEmoji: weatherEmojiFromText(
        entry.selectedRow?.weatherText ?? null,
        entry.selectedRow?.precipitationMmPerHour ?? null,
      ),
      etaText: entry.etaIso ? formatKlTime(entry.etaIso) : null,
      color,
      placement,
      onClick: () => openVedurstofanRouteStationPopup(entry),
    })
  }

  // Render Veðurstofan station markers as the forecast fallback station display on the route.
  function renderVedurstofanStations(
    layer: VedurstofanTravelLayer | undefined,
    routeDurationMinutes: number,
    thresholds: ResolvedTravelThresholds,
    departureMsOverride?: number,
  ): { count: number; statusCounts: Partial<Record<WindDisplayStatus, number>> } {
    const map = mapRef.current
    const rawPoints = Array.isArray(layer?.points) ? layer.points : []
    const validPoints = rawPoints.filter(
      (p): p is VedurstofanRoutePoint =>
        typeof p.lat === 'number' && typeof p.lon === 'number',
    )
    const departureMs = departureMsOverride ?? Date.now()
    const routeDurationMs = Math.max(0, routeDurationMinutes) * 60_000
    const statusEntries = validPoints.map((p) => {
      const anchorMs = Number.isFinite(departureMs)
        ? departureMs + (p.routeFraction ?? 0) * routeDurationMs
        : Date.now()
      const windDisplayStatus = classifyNearestForecastWindDisplayStatusAt(
        p.forecastRows,
        thresholds,
        anchorMs,
      )
      const selectedRowIdx = selectNearestForecastRowAt(p.forecastRows, anchorMs)
      return {
        point: p,
        windDisplayStatus,
        selectedRow: selectedRowIdx !== null ? p.forecastRows[selectedRowIdx] : null,
        etaIso: Number.isFinite(anchorMs) ? new Date(anchorMs).toISOString() : null,
      }
    })
    const statusCounts = countWindDisplayStatuses(statusEntries)
    // Publish all entries to the data ref so the circle click handler can find
    // stations that have no DOM label (due to density rules).
    routeVedurstofanEntriesRef.current = statusEntries
    if (!canUseMapStyle(map)) {
      logRoadMapDiagnostic('vedurstofan render deferred', {
        reason: 'map-style-not-ready',
        rawPointCount: rawPoints.length,
        validPointCount: validPoints.length,
      })
      return { count: validPoints.length, statusCounts }
    }

    clearRouteVedurstofanLabelMarkers()

    const geojson = {
      type: 'FeatureCollection',
      features: statusEntries.map(({ point: p, windDisplayStatus, selectedRow }) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: {
          stationId: p.stationId,
          stationName: p.stationName,
          status: p.status,
          windDisplayStatus,
          distanceFromOriginKm:
            p.distanceFromOriginM != null ? p.distanceFromOriginM / 1000 : null,
          forecastTimeIso: selectedRow?.ftimeIso ?? null,
          windSpeedMs: selectedRow?.windSpeedMs ?? null,
          sourceUrl: p.sourceUrl,
        },
      })),
    }

    const existingSource = map.getSource(VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID)
    if (existingSource) {
      ;(existingSource as import('maplibre-gl').GeoJSONSource).setData(geojson as never)
    } else {
      map.addSource(VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID, { type: 'geojson', data: geojson as never })
      map.addLayer({
        id: VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID,
        type: 'circle',
        source: VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID,
        paint: {
          'circle-color': TRAVEL_POINT_COLOR_EXPRESSION as unknown as string,
          'circle-radius': 6,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.72,
        },
      })

      map.on('mouseenter', VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('click', VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID, (e) => {
        const feature = e.features?.[0]
        if (!feature) return
        const coords = (
          feature.geometry as { type: 'Point'; coordinates: [number, number] }
        ).coordinates
        const props = feature.properties as Record<string, unknown>
        const stationId = props['stationId']
        if (typeof stationId !== 'string') return
        const entry = routeVedurstofanEntriesRef.current.find(
          e => e.point.stationId === stationId,
        )
        if (!entry) return
        openVedurstofanRouteStationPopup(entry, coords)
      })
    }

    if (map.getLayer(VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID)) {
      map.moveLayer(VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID)
    }

    const Marker = markerConstructorRef.current
    if (Marker) {
      const routeOrderedEntries = [...statusEntries].sort((a, b) => {
        const aPosition = a.point.routeFraction ?? (
          a.point.distanceFromOriginM != null ? a.point.distanceFromOriginM : Number.MAX_SAFE_INTEGER
        )
        const bPosition = b.point.routeFraction ?? (
          b.point.distanceFromOriginM != null ? b.point.distanceFromOriginM : Number.MAX_SAFE_INTEGER
        )
        return aPosition - bPosition
      })
      // Route planning needs every matched station to be visible. We accept
      // some label crowding in the prototype so matching bugs are obvious.
      for (const [index, entry] of routeOrderedEntries.entries()) {
        const placement = routeLabelPlacementForPoint(routeOrderedEntries.map(({ point }) => point), index)
        const element = createVedurstofanRouteLabel(entry, placement)
        const marker = new Marker({ element, anchor: placement.anchor, offset: placement.offset })
          .setLngLat([entry.point.lon, entry.point.lat])
          .addTo(map)
        routeVedurstofanLabelMarkersRef.current.push({ marker, element, entry })
      }
      updateVedurstofanLabelMarkerState(visibleRouteStatusesRef.current, routeWeatherModeRef.current)
    }

    applyRouteStatusFilterToMap(
      map,
      visibleRouteStatusesRef.current,
      routeStatusFilterModeRef.current,
    )
    updateRouteWeatherLayerVisibility()

    return { count: validPoints.length, statusCounts }
  }

  function formatVegagerdinRouteWindValue(point: VegagerdinRouteLayerPoint): string {
    if (point.meanWindMs == null && point.gustLast10MinMs == null) return '–'
    const meanText = point.meanWindMs != null
      ? formatNum(point.meanWindMs, locale)
      : '–'
    const gustText = point.gustLast10MinMs != null
      ? `(${formatNum(point.gustLast10MinMs, locale)})`
      : ''
    return `${meanText}${gustText}`
  }

  function openVegagerdinRouteStationPopup(
    point: VegagerdinRouteLayerPoint,
    coords: [number, number] = [point.lon, point.lat],
  ) {
    const Popup = popupConstructorRef.current
    const map = mapRef.current
    if (!Popup || !map) return

    const container = document.createElement('div')
    container.style.cssText = 'font-size:12px;line-height:1.5;min-width:170px'

    const title = document.createElement('strong')
    title.style.fontSize = '13px'
    title.textContent = point.stationName
    container.appendChild(title)

    const appendLine = (text: string) => {
      container.appendChild(document.createElement('br'))
      container.appendChild(document.createTextNode(text))
    }

    if (point.distanceFromOriginM != null) {
      appendLine(labelsRef.current.routePointDistance(
        formatNum(point.distanceFromOriginM / 1000, locale),
      ))
    }
    appendLine(labelsRef.current.routeStationMeasured(formatKlTime(point.measuredAtIso)))
    if (point.meanWindMs != null || point.gustLast10MinMs != null) {
      appendLine(labelsRef.current.routePointWind(formatVegagerdinRouteWindValue(point)))
    }
    if (point.meanWindMs == null && point.gustLast10MinMs == null) {
      appendLine(labelsRef.current.routeStationNoWind)
    }
    if (point.airTemperatureC != null) {
      appendLine(labelsRef.current.routeStationAirTemp(formatNum(point.airTemperatureC, locale)))
    }
    if (point.roadTemperatureC != null) {
      appendLine(labelsRef.current.routeStationRoadTemp(formatNum(point.roadTemperatureC, locale)))
    }

    popupRef.current?.remove()
    const popup = new Popup({ closeButton: true, maxWidth: '240px' })
      .setLngLat(coords)
      .setDOMContent(container)
      .addTo(map)
    popupRef.current = popup
  }

  function createVegagerdinRouteLabel(
    point: VegagerdinRouteLayerPoint,
    placement?: RouteLabelPlacement,
  ): HTMLButtonElement {
    const windText = point.meanWindMs != null
      ? formatNum(point.meanWindMs, locale)
      : '–'
    const gustText = point.gustLast10MinMs != null
      ? formatNum(point.gustLast10MinMs, locale)
      : null
    const temperatureText = point.airTemperatureC != null
      ? formatNum(point.airTemperatureC, locale)
      : null
    const roadTemperatureText = point.roadTemperatureC != null
      ? `${formatNum(point.roadTemperatureC, locale)}°`
      : null
    const color = WIND_STATUS_MARKER_COLOR[displayWindStatus(point.windDisplayStatus)]
    return createRouteWeatherPointMarkerElement({
      stationName: point.stationName,
      windText,
      gustText,
      directionText: point.windDirectionText,
      temperatureText,
      secondaryMetricText: roadTemperatureText,
      secondaryMetricTitle: labelsRef.current.routeMarkerRoadTemperatureTitle,
      secondaryMetricAriaText: point.roadTemperatureC != null
        ? labelsRef.current.routeMarkerRoadTemperature(formatNum(point.roadTemperatureC, locale))
        : null,
      weatherEmoji: null,
      color,
      placement,
      onClick: () => openVegagerdinRouteStationPopup(point),
    })
  }

  function createRouteEndpointLabelElement(label: string, kind: 'origin' | 'destination'): HTMLDivElement {
    const element = document.createElement('div')
    element.title = label
    const accent = kind === 'origin' ? '#2563eb' : '#154212'
    element.style.cssText = [
      'pointer-events:none',
      'position:relative',
      'width:0',
      'height:0',
      'overflow:visible',
      'z-index:13',
    ].join(';')

    const dot = document.createElement('span')
    dot.style.cssText = [
      'position:absolute',
      'left:-5px',
      'top:-5px',
      'width:10px',
      'height:10px',
      `background:${accent}`,
      'border:2px solid #ffffff',
      'border-radius:999px',
      'box-shadow:0 1px 5px rgba(15,23,42,0.22)',
    ].join(';')
    element.appendChild(dot)

    const labelElement = document.createElement('span')
    labelElement.textContent = label
    labelElement.style.cssText = [
      'position:absolute',
      'left:50%',
      'bottom:10px',
      'pointer-events:none',
      `border:1px solid ${accent}`,
      'background:rgba(255,255,255,0.95)',
      `color:${accent}`,
      'border-radius:999px',
      'box-shadow:0 1px 6px rgba(15,23,42,0.22)',
      'font:800 12px/1.2 Inter,system-ui,sans-serif',
      'max-width:160px',
      'overflow:hidden',
      'padding:4px 8px',
      'text-overflow:ellipsis',
      'transform:translateX(-50%)',
      'white-space:nowrap',
      'z-index:12',
    ].join(';')
    element.appendChild(labelElement)
    return element
  }

  function renderRouteEndpointLabels(
    origin: RoadIntelligencePlaceResult,
    destination: RoadIntelligencePlaceResult,
    originLabel = origin.name,
    destinationLabel = destination.name,
  ) {
    const map = mapRef.current
    const Marker = markerConstructorRef.current
    if (!canUseMapStyle(map) || !Marker) return

    clearRouteEndpointMarkers()
    for (const [place, kind] of [
      [origin, 'origin'],
      [destination, 'destination'],
    ] as const) {
      const label = kind === 'origin' ? originLabel : destinationLabel
      const element = createRouteEndpointLabelElement(label, kind)
      const marker = new Marker({
        element,
        anchor: 'center',
        offset: [0, 0],
      })
        .setLngLat([place.lon, place.lat])
        .addTo(map)
      routeEndpointMarkersRef.current.push({ marker, element })
    }
  }

  function renderVegagerdinStations(
    layer: VegagerdinRouteLayer | undefined,
  ): { count: number; statusCounts: Partial<Record<WindDisplayStatus, number>> } {
    const map = mapRef.current
    const rawPoints = Array.isArray(layer?.points) ? layer.points : []
    const validPoints = rawPoints
      .map(normalizeVegagerdinRoutePointForRender)
      .filter((point): point is VegagerdinRouteLayerPoint => point !== null)
    routeVegagerdinPointsRef.current = validPoints
    const statusCounts = countWindDisplayStatuses(validPoints)
    logRoadMapDiagnostic('vegagerdin render input', {
      hasLayer: Boolean(layer),
      layerStatus: layer?.status ?? null,
      rawPointCount: rawPoints.length,
      validPointCount: validPoints.length,
      routeWeatherMode: routeWeatherModeRef.current,
      visibleStatuses: Array.from(visibleRouteStatusesRef.current),
      canUseMapStyle: canUseMapStyle(map),
      sample: validPoints.slice(0, 5).map(point => ({
        id: point.stationId,
        name: point.stationName,
        lat: point.lat,
        lon: point.lon,
        status: point.windDisplayStatus,
        wind: point.statusWindMs,
      })),
    })
    if (!canUseMapStyle(map)) {
      logRoadMapDiagnostic('vegagerdin render deferred', {
        reason: 'map-style-not-ready',
        validPointCount: validPoints.length,
      })
      return { count: validPoints.length, statusCounts }
    }

    clearRouteVegagerdinLabelMarkers()

    const geojson = {
      type: 'FeatureCollection',
      features: validPoints.map((point) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
        properties: {
          routePointId: point.routePointId,
          stationId: point.stationId,
          windDisplayStatus: point.windDisplayStatus,
          statusWindMs: point.statusWindMs,
        },
      })),
    }

    const existingSource = map.getSource(VEGAGERDIN_ROUTE_STATIONS_LAYER_ID)
    if (existingSource) {
      ;(existingSource as import('maplibre-gl').GeoJSONSource).setData(geojson as never)
    } else {
      map.addSource(VEGAGERDIN_ROUTE_STATIONS_LAYER_ID, {
        type: 'geojson',
        data: geojson as never,
      })
      map.addLayer({
        id: VEGAGERDIN_ROUTE_STATIONS_LAYER_ID,
        type: 'circle',
        source: VEGAGERDIN_ROUTE_STATIONS_LAYER_ID,
        paint: {
          'circle-color': TRAVEL_POINT_COLOR_EXPRESSION as unknown as string,
          'circle-radius': 4,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.7,
        },
      })

      map.on('mouseenter', VEGAGERDIN_ROUTE_STATIONS_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', VEGAGERDIN_ROUTE_STATIONS_LAYER_ID, () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('click', VEGAGERDIN_ROUTE_STATIONS_LAYER_ID, (event) => {
        const feature = event.features?.[0]
        if (!feature) return
        const stationId = (feature.properties as Record<string, unknown>)['stationId']
        if (typeof stationId !== 'string') return
        const point = routeVegagerdinPointsRef.current.find(
          p => p.stationId === stationId,
        )
        if (!point) return
        const coords = (
          feature.geometry as { type: 'Point'; coordinates: [number, number] }
        ).coordinates
        openVegagerdinRouteStationPopup(point, coords)
      })
    }

    if (map.getLayer(VEGAGERDIN_ROUTE_STATIONS_LAYER_ID)) {
      map.moveLayer(VEGAGERDIN_ROUTE_STATIONS_LAYER_ID)
    }

    const Marker = markerConstructorRef.current
    if (Marker) {
      // Vegagerðin: always show all matched route stations.
      // Stebbi needs to see measured wind values at every on-route station —
      // density rules are not applied here. These are current observations, not forecasts.
      for (const [index, point] of validPoints.entries()) {
        const placement = routeLabelPlacementForPoint(validPoints, index)
        const element = createVegagerdinRouteLabel(point, placement)
        const marker = new Marker({ element, anchor: placement.anchor, offset: placement.offset })
          .setLngLat([point.lon, point.lat])
          .addTo(map)
        routeVegagerdinLabelMarkersRef.current.push({ marker, element, point })
      }
      updateVegagerdinLabelMarkerState(visibleRouteStatusesRef.current, routeWeatherModeRef.current)
    }

    applyRouteStatusFilterToMap(
      map,
      visibleRouteStatusesRef.current,
      routeStatusFilterModeRef.current,
    )
    updateRouteWeatherLayerVisibility()
    return { count: validPoints.length, statusCounts }
  }

  function routeSurfaceChoiceLabel(route: RouteOption, index: number): string {
    if (route.description && route.description.trim().length > 0) return route.description
    if (route.labels.length > 0) return route.labels.join(' · ')
    if (route.isDefault) return t('roadMapPrototypeSurfaceRouteDefault')
    return t('roadMapPrototypeSurfaceRouteNumber', { number: index + 1 })
  }

  async function fetchRouteSurfaceSummary(
    route: RouteOption,
    signal: AbortSignal,
  ): Promise<RouteSurfaceSummary | null> {
    const routePoints = route.providerMatchingPoints?.length
      ? route.providerMatchingPoints
      : route.points
    const bbox = buildRouteSurfaceBbox(routePoints)
    if (!bbox) return null

    const res = await fetch(
      `/api/teskeid/road-intelligence/road-surface?bbox=${encodeURIComponent(bbox.join(','))}`,
      {
        credentials: 'same-origin',
        signal,
      },
    )
    if (res.status === 401) throw new Error('auth')
    if (res.status === 404 || res.status === 403) return null
    if (!res.ok) return null

    const geojson = await res.json().catch(() => null)
    if (!geojson || signal.aborted) return null
    return summarizeRouteRoadSurface({ routePoints, surfaceGeoJson: geojson })
  }

  function yieldToBrowser(): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, 0))
  }

  function waitForBrowser(ms: number): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, ms))
  }

  async function fetchRouteSurfaceChoices(
    origin: RoadIntelligencePlaceResult,
    destination: RoadIntelligencePlaceResult,
    signal: AbortSignal,
  ): Promise<RouteSurfaceChoice[]> {
    const res = await fetch('/api/teskeid/weather/travel/routes', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        origin,
        destination,
        trailerKind: 'none',
      }),
    })
    if (res.status === 401) throw new Error('auth')
    if (!res.ok) return []

    const payload = await res.json().catch(() => null)
    const routes = Array.isArray(payload?.routes) ? (payload.routes as RouteOption[]) : []
    return routes.slice(0, 6).map((route, index) => ({
      routeId: route.id,
      routeIndex: route.routeIndex,
      label: routeSurfaceChoiceLabel(route, index),
      description: route.description ?? route.labels.join(' · '),
      distanceKm: route.distanceM / 1000,
      durationMinutes: route.durationS / 60,
      surfaceSummary: null,
      route,
    }))
  }

  async function hydrateRouteSurfaceChoiceSummaries(
    choices: RouteSurfaceChoice[],
    signal: AbortSignal,
  ) {
    console.log('[RoadMap] surface hydration: starting for', choices.length, 'route choices')
    for (const [i, choice] of choices.entries()) {
      if (signal.aborted) return
      await waitForBrowser(160)
      await yieldToBrowser()
      const tHydrate = performance.now()
      const surfaceSummary = await fetchRouteSurfaceSummary(choice.route, signal).catch((e) => {
        console.warn('[RoadMap] surface hydration: fetch failed for', choice.routeId, e)
        return null
      })
      await yieldToBrowser()
      if (signal.aborted) return
      if (!surfaceSummary) {
        console.log('[RoadMap] surface hydration: [', i + 1, '/', choices.length, '] no summary —', choice.routeId)
        continue
      }
      console.log('[RoadMap] surface hydration: [', i + 1, '/', choices.length, ']', choice.routeId, 'in', Math.round(performance.now() - tHydrate), 'ms — hasGravel:', surfaceSummary.hasGravel, 'gravelLengthM:', surfaceSummary.gravelLengthM)
      setRouteSurfaceChoices(prev =>
        prev.map(route =>
          route.routeId === choice.routeId
            ? { ...route, surfaceSummary }
            : route,
        ),
      )
    }
    console.log('[RoadMap] surface hydration: complete')
  }

  function scheduleRouteSurfaceChoiceSummaries(
    choices: RouteSurfaceChoice[],
    signal: AbortSignal,
  ) {
    window.setTimeout(() => {
      if (signal.aborted) return
      void hydrateRouteSurfaceChoiceSummaries(choices, signal)
    }, 900)
  }

  function resetRouteDepartureForecastState() {
    routeForecastBuildContextRef.current = null
    setRouteDepartureForecastExpanded(false)
    setRouteForecastBuildStatus('idle')
  }

  function handleRouteDepartureForecastOptIn() {
    setRouteDepartureForecastExpanded(true)

    let context = routeForecastBuildContextRef.current
    if (!context && routeBridgeSummary) {
      const nowCounts = routeNowStatusCounts ?? routeBridgeSummary.statusCounts ?? {}
      const nowWorstStatus = worstWindDisplayStatusFromCounts(nowCounts) ?? 'innan-marka'
      context = {
        timelineCandidates: buildSyntheticRouteTimelineCandidates(
          routeBridgeSummary.durationMinutes,
          nowWorstStatus,
        ),
        thresholds: routeBridgeSummary.thresholdsUsed,
        routeDurationMinutes: routeBridgeSummary.durationMinutes,
        vedurstofanLayer: vedurstofanLayerRef.current,
        vedurstofanStationCount: routeBridgeSummary.vedurstofanStationCount,
        vegagerdinStatusCounts: nowCounts,
        vegagerdinStationCount: countStatusesTotal(nowCounts),
        nowWorstStatus,
        signal: routeBridgeRequestRef.current?.signal ?? new AbortController().signal,
      }
      routeForecastBuildContextRef.current = context
    }

    if (!context || context.timelineCandidates.length <= 1) {
      setRouteForecastBuildStatus('unavailable')
      return
    }

    if (
      routeCandidates &&
      routeCandidates.length > 1 &&
      routeSlotStatusOverrides &&
      routeSlotStatusOverrides.length > 1
    ) {
      setRouteForecastBuildStatus('ready')
      return
    }

    setRouteForecastBuildStatus('loading')
    window.setTimeout(() => {
      if (context.signal.aborted) return
      try {
        console.log(
          '[RoadMap] forecast slots: opt-in computing for',
          context.timelineCandidates.length,
          'slots, vedurstofan:',
          context.vedurstofanStationCount,
          'stations',
        )
        const tSlot = performance.now()
        if (
          (!context.vedurstofanLayer || context.vedurstofanStationCount <= 0) &&
          context.vegagerdinStationCount <= 0
        ) {
          logRoadMapDiagnostic('forecast slots using native route timeline', {
            reason: 'no-provider-route-data',
            timelineCandidateCount: context.timelineCandidates.length,
            vedurstofanStationCount: context.vedurstofanStationCount,
            vegagerdinStationCount: context.vegagerdinStationCount,
          })
          setVisibleCandidateLimit(ROUTE_TIMELINE_INITIAL_SLOT_COUNT)
          setRouteCandidates(context.timelineCandidates)
          setRouteSlotStatusOverrides(null)
          setRouteForecastBuildStatus('ready')
          return
        }

        const slotStatusOverrides = buildDepartureForecastSlotStatusOverrides(context)

        if (context.signal.aborted) return
        if (slotStatusOverrides == null) {
          logRoadMapDiagnostic('forecast slots using native route timeline', {
            reason: 'provider-overrides-unavailable',
            timelineCandidateCount: context.timelineCandidates.length,
            vedurstofanStationCount: context.vedurstofanStationCount,
            vegagerdinStationCount: context.vegagerdinStationCount,
          })
          setVisibleCandidateLimit(ROUTE_TIMELINE_INITIAL_SLOT_COUNT)
          setRouteCandidates(context.timelineCandidates)
          setRouteSlotStatusOverrides(null)
          setRouteForecastBuildStatus('ready')
          return
        }

        console.log(
          '[RoadMap] forecast slots: opt-in computed',
          slotStatusOverrides.length,
          'overrides in',
          Math.round(performance.now() - tSlot),
          'ms',
        )
        setVisibleCandidateLimit(ROUTE_TIMELINE_INITIAL_SLOT_COUNT)
        setRouteCandidates(context.timelineCandidates)
        setRouteSlotStatusOverrides(slotStatusOverrides)
        setRouteForecastBuildStatus('ready')
      } catch (e) {
        if (!context.signal.aborted) {
          console.error('[RoadMap] forecast slots: opt-in error computing overrides:', e)
          setRouteForecastBuildStatus('error')
        }
      }
    }, 0)
  }

  function waitForMapReady(timeoutMs = 6000): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const map = mapRef.current
      if (!map) {
        console.warn('[RoadMap] waitForMapReady: map not initialized')
        reject(new Error('map_not_ready'))
        return
      }
      if (map.isStyleLoaded()) {
        resolve()
        return
      }
      console.warn('[RoadMap] waitForMapReady: style not yet loaded, waiting up to', timeoutMs, 'ms')
      const timer = window.setTimeout(() => {
        console.error('[RoadMap] waitForMapReady: timed out after', timeoutMs, 'ms — throwing map_not_ready')
        reject(new Error('map_not_ready'))
      }, timeoutMs)
      map.once('styledata', () => {
        if (map.isStyleLoaded()) {
          clearTimeout(timer)
          console.log('[RoadMap] waitForMapReady: style loaded, proceeding')
          resolve()
        }
      })
    })
  }

  async function calculateResolvedRoute({
    origin,
    destination,
    thresholds,
    signal,
    selectedRouteId,
  }: {
    origin: RoadIntelligencePlaceResult
    destination: RoadIntelligencePlaceResult
    thresholds: ResolvedTravelThresholds
    signal: AbortSignal
    selectedRouteId?: string | null
  }) {
    console.log('[RoadMap] route fetch:', origin.name, '→', destination.name, selectedRouteId ? `routeId=${selectedRouteId}` : '(default)')
    const t0 = performance.now()
    const res = await fetch('/api/teskeid/weather/travel', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        origin,
        destination,
        trailerKind: 'none',
        thresholdOverrides: {
          cautionWindMs: thresholds.cautionWindMs,
          redWindMs: thresholds.redWindMs,
        },
        ...(selectedRouteId ? { selectedRouteId } : {}),
      }),
    })

    const contentType = res.headers.get('content-type') ?? ''
    if (res.status === 401 || !contentType.includes('application/json')) {
      throw new Error('auth')
    }
    if (res.status === 429) throw new Error('rate_limited')

    const data = await res.json().catch(() => null)
    if (!res.ok || !data) {
      throw new Error(typeof data?.error === 'string' ? data.error : 'travel_failed')
    }
    if (signal.aborted) return

    console.log('[RoadMap] route API:', Math.round(performance.now() - t0), 'ms, status:', res.status)
    await waitForMapReady()
    if (signal.aborted) return

    const travelResult = data as DeterministicResult
    const extra = data as Record<string, unknown>
    if (extra['roadIntelligenceDebug'] && typeof extra['roadIntelligenceDebug'] === 'object') {
      logRoadMapDiagnostic('route api debug payload', extra['roadIntelligenceDebug'] as Record<string, unknown>)
    }
    const vedurstofanLayer = isVedurstofanTravelLayer(extra['vedurstofanLayer'])
      ? extra['vedurstofanLayer']
      : undefined
    const serverVegagerdinLayer = isVegagerdinRouteLayer(extra['vegagerdinLayer'])
      ? extra['vegagerdinLayer']
      : undefined
    const mapData = renderTravelBridgeResult(travelResult, thresholds)
    logRoadMapDiagnostic('route api provider layers', {
      hasServerVegagerdinLayer: Boolean(serverVegagerdinLayer),
      serverVegagerdinPointCount: serverVegagerdinLayer?.points.length ?? null,
      serverVegagerdinStatus: serverVegagerdinLayer?.status ?? null,
      hasVedurstofanLayer: Boolean(vedurstofanLayer),
      vedurstofanPointCount: Array.isArray(vedurstofanLayer?.points) ? vedurstofanLayer.points.length : null,
      mapRoutePointCount: mapData.pointCount,
      routeDistanceKm: mapData.distanceKm,
      routeDurationMinutes: mapData.durationMinutes,
    })
    const currentVegagerdinData =
      serverVegagerdinLayer && serverVegagerdinLayer.points.length > 0
        ? null
        : await fetchVegagerdinCurrentForRoute(signal)
    if (signal.aborted) return
    const vegagerdinLayer =
      serverVegagerdinLayer && serverVegagerdinLayer.points.length > 0
        ? serverVegagerdinLayer
        : buildClientVegagerdinRouteLayer(
            travelResult,
            thresholds,
            currentVegagerdinData ?? overviewVegagerdinData,
          )
    const vedurstofanRender = renderVedurstofanStations(
      vedurstofanLayer,
      mapData.durationMinutes,
      thresholds,
    )
    const vegagerdinRender = renderVegagerdinStations(vegagerdinLayer)
    const timelineCandidates = buildRouteTimelineCandidates(travelResult, mapData.durationMinutes)
    const slotSource = routeSlotStatusSource(
      vegagerdinRender.count,
      vedurstofanRender.count,
    )
    console.log('[RoadMap] providers — vegagerdin:', vegagerdinRender.count, 'stations', vegagerdinRender.statusCounts, '| vedurstofan:', vedurstofanRender.count, '| slotSource:', slotSource, '| timeline:', timelineCandidates?.length ?? 0, 'slots')
    const nowStatusCounts =
      vegagerdinRender.count > 0
        ? vegagerdinRender.statusCounts
        : {}
    const nowMeasuredAtIso =
      vegagerdinLayer?.measuredAtIso ??
      newestVegagerdinRouteMeasuredAtIso(routeVegagerdinPointsRef.current)
    const nowWorstStatus = worstWindDisplayStatusFromCounts(nowStatusCounts) ?? 'innan-marka'
    const providerStatus = routeStatusFromCounts(nowStatusCounts)
    const providerAnswer =
      slotSource !== 'fallback'
        ? providerRouteAnswer(providerStatus)
        : travelResult.svar
    const initialRouteCandidates = timelineCandidates && timelineCandidates.length > 0
      ? timelineCandidates.slice(0, 1)
      : null
    const nowRouteMode: RouteWeatherMode = 'now'

    // Hide global station markers, chase markers, and place labels — route stations are the focus now.
    routeActiveRef.current = true
    setRouteActive(true)
    setRouteWeatherModeState(nowRouteMode)
    vedurstofanLayerRef.current = vedurstofanLayer
    routeDurationMinutesRef.current = mapData.durationMinutes
    routeThresholdsRef.current = thresholds
    updateOverviewLayerVisibility(overviewActiveModeRef.current, true)
    hideOverviewStationMarkers()
    clearWeatherChaseMapMarkers()
    for (const { element } of placeMarkersRef.current) {
      element.style.display = 'none'
    }
    renderRouteEndpointLabels(
      origin,
      destination,
      routeFrom.trim() || origin.name,
      routeTo.trim() || destination.name,
    )

    setRouteBridgeSummary({
      fromName: origin.name,
      toName: destination.name,
      selectedRouteId: selectedRouteId ?? null,
      status: providerStatus,
      distanceKm: mapData.distanceKm,
      durationMinutes: mapData.durationMinutes,
      metnoPointCount: mapData.pointCount,
      answer: providerAnswer,
      statusCounts: nowStatusCounts,
      thresholdsUsed: thresholds,
      vedurstofanStationCount: vedurstofanRender.count,
      vegagerdinStationCount: vegagerdinRender.count,
      slotStatusSource: slotSource,
    })
    setRouteNowStatusCounts(nowStatusCounts)
    setRouteNowMeasuredAtIso(nowMeasuredAtIso)
    setRouteVisibleStatusCounts(nowStatusCounts)
    setRouteCandidates(initialRouteCandidates)
    setRouteSlotStatusOverrides(null)
    setSelectedCandidateIdx(null)
    handleRouteStatusFilterChange(new Set())
    updateRouteWeatherLayerVisibility(nowRouteMode)
    setRouteBridgeStatus('success')
    console.log('[RoadMap] route success — initial candidates:', initialRouteCandidates?.length ?? 0, '| selectedCandidateIdx: null | nowCounts:', nowStatusCounts, '| nowMeasuredAtIso:', nowMeasuredAtIso)

    routeForecastBuildContextRef.current =
      timelineCandidates && timelineCandidates.length > 1
        ? {
            timelineCandidates,
            thresholds,
            routeDurationMinutes: mapData.durationMinutes,
            vedurstofanLayer,
            vedurstofanStationCount: vedurstofanRender.count,
            vegagerdinStatusCounts: nowStatusCounts,
            vegagerdinStationCount: vegagerdinRender.count,
            nowWorstStatus,
            signal,
          }
        : null
    setRouteDepartureForecastExpanded(false)
    setRouteForecastBuildStatus('idle')
  }

  async function handleRouteBridgeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (routeBridgeStatus === 'loading') return

    const fromQuery = routeFrom.trim()
    const toQuery = routeTo.trim()
    if (fromQuery.length < 2 || toQuery.length < 2) {
      setRouteBridgeStatus('error')
      setRouteBridgeError(t('roadMapPrototypeRouteInputMissing'))
      return
    }

    const thresholds = resolveRouteThresholdInputs()
    if (!thresholds) {
      setRouteBridgeStatus('error')
      setRouteBridgeError(null)
      return
    }

    console.log('[RoadMap] route submit:', fromQuery, '→', toQuery)
    routeBridgeRequestRef.current?.abort()
    const controller = new AbortController()
    routeBridgeRequestRef.current = controller
    setRouteBridgeStatus('loading')
    setRouteBridgeError(null)
    setRouteBridgeSummary(null)
    setRouteCandidates(null)
    setRouteSlotStatusOverrides(null)
    setRouteNowStatusCounts(null)
    setRouteNowMeasuredAtIso(null)
    setRouteVisibleStatusCounts(null)
    resetRouteDepartureForecastState()
    setRouteSurfaceChoices([])
    setRouteSurfaceChoicesStatus('idle')
    setRouteSwitchingChoiceId(null)
    setVisibleCandidateLimit(ROUTE_TIMELINE_INITIAL_SLOT_COUNT)
    setRouteCalculationPlaceNames({ from: fromQuery, to: toQuery })
    setSelectedCandidateIdx(null)
    setRouteWeatherModeState('now')
    setFromSuggestions([])
    setToSuggestions([])
    setIsPanelOpen(false)

    try {
      const [origin, destination] = await Promise.all([
        resolveBridgePlace(fromQuery, controller.signal, [fromResolved, ...fromSuggestions]),
        resolveBridgePlace(toQuery, controller.signal, [toResolved, ...toSuggestions]),
      ])
      if (controller.signal.aborted) return
      resolvedRoutePlacesRef.current = { origin, destination }
      setRouteCalculationPlaceNames({ from: origin.name, to: destination.name })

      // Calculate default route first — do not wait for surface alternatives.
      await calculateResolvedRoute({
        origin,
        destination,
        thresholds,
        signal: controller.signal,
        selectedRouteId: null,
      })
      if (controller.signal.aborted) return

      // Route is now visible on map. Fetch surface alternatives after the
      // browser has had a moment to paint and accept map gestures.
      window.setTimeout(() => {
        if (controller.signal.aborted) return
        setRouteSurfaceChoicesStatus('loading')
        fetchRouteSurfaceChoices(origin, destination, controller.signal)
          .then(choices => {
            if (controller.signal.aborted) return
            setRouteSurfaceChoices(choices)
            setRouteSurfaceChoicesStatus('ready')
            // Do not hydrate surface summaries automatically here.
            // summarizeRouteRoadSurface() is intentionally thorough and can be
            // CPU-heavy on long routes; running it after route-options makes the
            // interactive map feel frozen. Surface scoring belongs in the native
            // road-graph phase or behind an explicit user action.
          })
          .catch(() => {
            if (!controller.signal.aborted) setRouteSurfaceChoicesStatus('error')
          })
      }, 1200)
    } catch (err) {
      if (controller.signal.aborted) return
      const code = err instanceof Error ? err.message : 'unknown'
      console.error('[RoadMap] route failed:', code, err)
      const message =
        code === 'place_not_found'
          ? t('roadMapPrototypeRoutePlaceNotFound')
          : code === 'map_not_ready'
            ? t('roadMapPrototypeRouteMapNotReady')
            : code === 'auth'
              ? t('roadMapPrototypeRouteAuthError')
              : code === 'rate_limited'
                ? t('roadMapPrototypeRouteRateLimited')
                : t('roadMapPrototypeRouteError')
      setRouteBridgeStatus('error')
      setRouteBridgeError(message)
    }
  }

  async function handleSelectSurfaceRouteChoice(choice: RouteSurfaceChoice) {
    if (routeBridgeStatus === 'loading' || routeSwitchingChoiceId) return
    const resolvedPlaces = resolvedRoutePlacesRef.current
    const thresholds = routeBridgeSummary?.thresholdsUsed ?? routeThresholdsRef.current
    if (!resolvedPlaces || !thresholds) return

    console.log('[RoadMap] route switch to:', choice.routeId, choice.label)
    routeBridgeRequestRef.current?.abort()
    const controller = new AbortController()
    routeBridgeRequestRef.current = controller
    setRouteSwitchingChoiceId(choice.routeId)
    setRouteBridgeError(null)
    setRouteCalculationPlaceNames({
      from: resolvedPlaces.origin.name,
      to: resolvedPlaces.destination.name,
    })
    setIsPanelOpen(false)

    try {
      await calculateResolvedRoute({
        origin: resolvedPlaces.origin,
        destination: resolvedPlaces.destination,
        thresholds,
        signal: controller.signal,
        selectedRouteId: choice.routeId,
      })
      if (!controller.signal.aborted) setVisibleCandidateLimit(ROUTE_TIMELINE_INITIAL_SLOT_COUNT)
    } catch (err) {
      if (controller.signal.aborted) return
      const code = err instanceof Error ? err.message : 'unknown'
      console.error('[RoadMap] route switch failed:', code, err)
      const message =
        code === 'map_not_ready'
          ? t('roadMapPrototypeRouteMapNotReady')
          : code === 'auth'
            ? t('roadMapPrototypeRouteAuthError')
            : code === 'rate_limited'
              ? t('roadMapPrototypeRouteRateLimited')
              : t('roadMapPrototypeRouteError')
      setRouteBridgeError(message)
    } finally {
      if (!controller.signal.aborted) setRouteSwitchingChoiceId(null)
    }
  }

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    async function initMap() {
      if (!containerRef.current) return
      try {
        const maplibregl = await import('maplibre-gl')
        if (cancelled || !containerRef.current) return

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: {
            version: 8,
            sources: {
              'carto-basemap': {
                type: 'raster',
                tiles: CARTO_VOYAGER_TILES,
                tileSize: 256,
                attribution: CARTO_ATTRIBUTION,
              },
              'vegagerdin-vegakerfi': {
                type: 'raster',
                tiles: VEGAGERDIN_VEGAKERFI_TILES,
                tileSize: 256,
                attribution: VEGAGERDIN_ATTRIBUTION,
              },
            },
            layers: [
              { id: 'carto-basemap', type: 'raster', source: 'carto-basemap' },
              {
                id: 'vegagerdin-vegakerfi',
                type: 'raster',
                source: 'vegagerdin-vegakerfi',
                paint: { 'raster-opacity': 0.78 },
              },
            ],
          },
          center: ICELAND_CENTER,
          zoom: ICELAND_ZOOM,
        })

        map.addControl(new maplibregl.NavigationControl(), 'top-right')
        mapRef.current = map
        popupConstructorRef.current = maplibregl.Popup
        markerConstructorRef.current = maplibregl.Marker

        if (process.env.NODE_ENV !== 'production') {
          map.on('error', (e) => {
            console.warn('[RoadMapPrototype] MapLibre error:', e.error)
          })
        }

        // Resize after layout settles and again on load to ensure correct canvas dimensions.
        requestAnimationFrame(() => { if (!cancelled) map.resize() })

        // ResizeObserver keeps canvas in sync if the viewport is resized after mount.
        const ro = new ResizeObserver(() => {
          if (!cancelled && mapRef.current) mapRef.current.resize()
        })
        if (containerRef.current) ro.observe(containerRef.current)
        resizeObserverRef.current = ro

        map.on('load', async () => {
          if (cancelled) return
          map.resize()
          map.setLayoutProperty(
            'vegagerdin-vegakerfi',
            'visibility',
            showOverlayRef.current ? 'visible' : 'none',
          )

          placeMarkersRef.current.forEach(({ marker }) => marker.remove())
          placeMarkersRef.current = ROAD_MAP_PLACES.map((place) => {
            const element = document.createElement('button')
            element.type = 'button'
            element.textContent = place.name
            element.title = place.name
            element.style.cssText = [
              'pointer-events:auto',
              'border:1px solid rgba(21,66,18,0.28)',
              'background:rgba(255,255,255,0.9)',
              'color:#154212',
              'border-radius:999px',
              'box-shadow:0 1px 4px rgba(15,23,42,0.14)',
              'font:600 11px/1.2 Inter,system-ui,sans-serif',
              'padding:2px 6px',
              'white-space:nowrap',
              'cursor:pointer',
            ].join(';')
            element.addEventListener('click', (event) => {
              event.preventDefault()
              event.stopPropagation()
              selectRoutePlaceRef.current(place)
            })

            const marker = new maplibregl.Marker({ element, anchor: 'center' })
              .setLngLat([place.lon, place.lat])
              .addTo(map)

            return { marker, element, place }
          })

          function updateRoadMapPlaceMarkerVisibility() {
            reconcilePlaceMarkerVisibility()
          }

          updateRoadMapPlaceMarkerVisibility()
          map.on('zoom', updateRoadMapPlaceMarkerVisibility)
          map.on('zoom', scheduleOverviewMarkerVisibilityUpdate)

          // M2B-1: Vegagerðin faerd vector road segments, refreshed on pan/zoom.
          // Renders below station dots by being added first.

          async function fetchAndRenderSegments(signal: AbortSignal): Promise<number> {
            const b = map.getBounds()
            const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`
            const res = await fetch(
              `/api/teskeid/road-intelligence/road-segments?bbox=${encodeURIComponent(bbox)}`,
              { signal },
            )
            if (!res.ok) throw new Error(`road-segments ${res.status}`)
            // res.json() is `any` — cast to minimal shape we need.
            const geojson = (await res.json()) as { type: string; features: unknown[] }
            if (signal.aborted) return 0

            const existingSrc = map.getSource('road-segments')
            if (existingSrc) {
              // Source already exists — update data in place without re-adding the layer.
              ;(existingSrc as import('maplibre-gl').GeoJSONSource).setData(geojson as never)
              bringWeatherLayersToFront(map)
            } else {
              map.addSource('road-segments', { type: 'geojson', data: geojson as never })
              map.addLayer({
                id: 'road-segments',
                type: 'line',
                source: 'road-segments',
                layout: {
                  'line-cap': 'round',
                  'line-join': 'round',
                  visibility: showSegmentsRef.current ? 'visible' : 'none',
                },
                paint: {
                  // Provider road-condition color, normalized by the same-origin API.
                  'line-color': ROAD_SEGMENT_COLOR_EXPRESSION as unknown as string,
                  'line-width': ROAD_SEGMENT_WIDTH_EXPRESSION as unknown as number,
                  'line-opacity': 0.8,
                },
              })

              map.on('mouseenter', 'road-segments', () => {
                map.getCanvas().style.cursor = 'pointer'
              })
              map.on('mouseleave', 'road-segments', () => {
                map.getCanvas().style.cursor = ''
              })

              map.on('click', 'road-segments', (e) => {
                const feature = e.features?.[0]
                if (!feature) return

                const props = feature.properties as {
                  NAFN_LEIDAR?: string | null
                  NRVEGUR?: string | number | null
                  AST1_NAFN?: string | null
                  AST1_FAERD?: string | null
                  AST1_SKILTI?: string | null
                  TIMIKEYRSLA?: string | number | null
                  teskeidRoadStatusLabel?: string | null
                  teskeidRoadStatusColor?: string | null
                }

                const roadName =
                  props.NAFN_LEIDAR ??
                  (props.NRVEGUR != null
                    ? labelsRef.current.roadFallback(String(props.NRVEGUR))
                    : labelsRef.current.unknownRoad)
                const statusLabel =
                  props.teskeidRoadStatusLabel ??
                  props.AST1_NAFN ??
                  labelsRef.current.unknownCondition
                const details = [props.AST1_FAERD, props.AST1_SKILTI]
                  .filter((value): value is string => typeof value === 'string' && value.length > 0)
                  .join(' · ')
                const drivingTime =
                  props.TIMIKEYRSLA != null && String(props.TIMIKEYRSLA).trim().length > 0
                    ? String(props.TIMIKEYRSLA)
                    : null

                // Use setDOMContent to avoid XSS from upstream provider data.
                const container = document.createElement('div')
                container.style.cssText = 'font-size:12px;line-height:1.45;min-width:150px'

                const titleRow = document.createElement('div')
                titleRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:2px'

                const dot = document.createElement('span')
                dot.style.cssText =
                  'width:8px;height:8px;border-radius:999px;display:inline-block;flex:0 0 auto'
                dot.style.backgroundColor = props.teskeidRoadStatusColor ?? '#64748b'
                titleRow.appendChild(dot)

                const name = document.createElement('strong')
                name.style.fontSize = '13px'
                name.textContent = roadName
                titleRow.appendChild(name)
                container.appendChild(titleRow)

                const status = document.createElement('div')
                status.textContent = statusLabel
                container.appendChild(status)

                if (details) {
                  const detailLine = document.createElement('div')
                  detailLine.style.color = '#475569'
                  detailLine.textContent = details
                  container.appendChild(detailLine)
                }

                if (drivingTime) {
                  const timeLine = document.createElement('div')
                  timeLine.style.color = '#475569'
                  timeLine.textContent = labelsRef.current.drivingTime(drivingTime)
                  container.appendChild(timeLine)
                }

                popupRef.current?.remove()
                const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '240px' })
                  .setLngLat(e.lngLat)
                  .setDOMContent(container)
                  .addTo(map)
                popupRef.current = popup
              })
              bringWeatherLayersToFront(map)
            }
            return geojson.features.length
          }

          async function triggerSegmentLoad() {
            if (cancelled) return
            segmentRequestRef.current?.abort()
            const controller = new AbortController()
            segmentRequestRef.current = controller
            setSegmentCount('loading')
            try {
              const count = await fetchAndRenderSegments(controller.signal)
              if (!cancelled && !controller.signal.aborted) setSegmentCount(count)
            } catch {
              if (!cancelled && !controller.signal.aborted) {
                setSegmentCount('error')
                if (process.env.NODE_ENV !== 'production') {
                  console.warn('[RoadMapPrototype] road segments failed')
                }
              }
            }
          }

          // Initial load, then refresh on every pan/zoom (debounced 400 ms).
          triggerSegmentLoad()
          map.on('moveend', () => {
            if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current)
            segmentTimerRef.current = setTimeout(triggerSegmentLoad, 400)
            scheduleRouteLabelCollisionUpdate()
            scheduleOverviewMarkerVisibilityUpdate()
          })
          map.on('zoomend', scheduleRouteLabelCollisionUpdate)

          removeOverviewMapLayerArtifacts(map)

          bringWeatherLayersToFront(map)
          updateOverviewLayerVisibility()
          if (!cancelled) {
            console.log('[RoadMap] map ready — style loaded, all layers initialized')
            setMapReady(true)
          }
        })
      } catch (err) {
        if (!cancelled) {
          setMapError(err instanceof Error ? err.message : 'Map failed to initialize')
        }
      }
    }

    initMap()

    return () => {
      cancelled = true
      clearTimerRef(segmentTimerRef)
      clearTimerRef(fromSuggestTimerRef)
      clearTimerRef(toSuggestTimerRef)
      clearTimerRef(fromBlurTimerRef)
      clearTimerRef(toBlurTimerRef)
      if (overviewDensityFrameRef.current !== null) {
        window.cancelAnimationFrame(overviewDensityFrameRef.current)
        overviewDensityFrameRef.current = null
      }
      abortControllerRef(segmentRequestRef)
      abortControllerRef(routeBridgeRequestRef)
      abortControllerRef(fromSuggestAbortRef)
      abortControllerRef(toSuggestAbortRef)
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      placeMarkersRef.current.forEach(({ marker }) => marker.remove())
      placeMarkersRef.current = []
      clearOverviewStationMarkers()
      clearWeatherChaseMapMarkers()
      clearRouteVedurstofanLabelMarkers()
      clearRouteVegagerdinLabelMarkers()
      clearRouteEndpointMarkers()
      popupRef.current?.remove()
      popupRef.current = null
      popupConstructorRef.current = null
      markerConstructorRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  function handleOverlayToggle() {
    const next = !showOverlay
    showOverlayRef.current = next
    setShowOverlay(next)
    mapRef.current?.isStyleLoaded() &&
      mapRef.current.setLayoutProperty('vegagerdin-vegakerfi', 'visibility', next ? 'visible' : 'none')
  }

  function handleSegmentsToggle() {
    const next = !showSegments
    showSegmentsRef.current = next
    setShowSegments(next)
    const map = mapRef.current
    if (map?.isStyleLoaded() && map.getLayer('road-segments')) {
      map.setLayoutProperty('road-segments', 'visibility', next ? 'visible' : 'none')
    }
  }

  function renderPlaceSuggestionList(
    field: RouteBridgeField,
    suggestions: RoadIntelligencePlaceResult[],
  ) {
    if (activeRouteField !== field || suggestions.length === 0) return null

    return (
      <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-background shadow-sm">
        {suggestions.map((place) => (
          <li key={`${place.placeId ?? place.name}-${place.lat}-${place.lon}`}>
            <button
              type="button"
              className="min-h-10 w-full px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectRoutePlace(place, field)}
            >
              <span className="font-medium text-foreground">{place.name}</span>
              {place.formattedAddress && (
                <span className="block truncate text-[11px] text-muted-foreground">
                  {place.formattedAddress}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    )
  }

  function renderRouteSurfaceChoices() {
    if (!routeBridgeSummary) return null

    if (routeSurfaceChoicesStatus === 'loading') {
      return (
        <p className="mb-2 text-[10px] text-muted-foreground">
          {t('roadMapPrototypeSurfaceChoicesSearching')}
        </p>
      )
    }

    if (routeSurfaceChoices.length === 0) return null

    const selectedRouteId = routeBridgeSummary.selectedRouteId ?? routeSurfaceChoices[0]?.routeId ?? null
    const selectedChoice = routeSurfaceChoices.find(choice => choice.routeId === selectedRouteId)
      ?? routeSurfaceChoices[0]
    const hasSurfaceSummary = routeSurfaceChoices.some(choice => choice.surfaceSummary !== null)
    const selectedHasGravel = selectedChoice?.surfaceSummary?.hasGravel === true
    const hasGravelRoute = routeSurfaceChoices.some(choice => choice.surfaceSummary?.hasGravel)
    const hasPavedAlternative = routeSurfaceChoices.some(choice =>
      choice.routeId !== selectedRouteId && choice.surfaceSummary?.hasGravel === false,
    )

    if (!hasGravelRoute && routeSurfaceChoices.length <= 1) return null

    const gravelRoadNames = selectedChoice?.surfaceSummary?.gravelRoadNames ?? []
    const intro = !hasSurfaceSummary
      ? t('roadMapPrototypeSurfaceRouteChoicesFound')
      : selectedHasGravel
        ? t('roadMapPrototypeSurfaceSelectedHasGravel', {
            roads: gravelRoadNames.length > 0
              ? gravelRoadNames.join(', ')
              : t('roadMapPrototypeSurfaceUnknownRoad'),
          })
        : hasPavedAlternative
          ? t('roadMapPrototypeSurfaceSelectedAvoidsGravel')
          : t('roadMapPrototypeSurfaceRouteChoicesReady')

    return (
      <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50/95 p-2 text-[11px] text-amber-950 shadow-sm dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-100">
        <p className="mb-1.5 leading-snug">{intro}</p>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {routeSurfaceChoices.map((choice) => {
            const selected = choice.routeId === selectedRouteId
            const switching = routeSwitchingChoiceId === choice.routeId
            const hasGravel = choice.surfaceSummary?.hasGravel
            const surfaceLabel =
              hasGravel === true
                ? t('roadMapPrototypeSurfaceRouteGravel')
                : hasGravel === false
                  ? t('roadMapPrototypeSurfaceRoutePaved')
                  : t('roadMapPrototypeSurfaceRouteUnknown')
            return (
              <button
                key={choice.routeId}
                type="button"
                disabled={routeBridgeStatus === 'loading' || Boolean(routeSwitchingChoiceId) || selected}
                onClick={() => handleSelectSurfaceRouteChoice(choice)}
                className={`min-w-[150px] shrink-0 rounded-md border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default ${
                  selected
                    ? 'border-primary bg-background text-foreground'
                    : 'border-amber-300 bg-background/80 text-amber-950 hover:bg-background dark:border-amber-700 dark:text-amber-100'
                }`}
              >
                <span className="block truncate font-medium">
                  {switching ? t('roadMapPrototypeSurfaceRouteSwitching') : choice.label}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {surfaceLabel} · {formatNum(choice.distanceKm, locale)} km · {formatDurationMinutes(choice.durationMinutes)}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (mapError) {
    return (
      <div className="flex items-center justify-center w-full h-full text-muted-foreground">
        <div className="text-center space-y-2 p-4">
          <p className="text-sm font-medium text-foreground">{t('roadMapPrototypeErrorTitle')}</p>
          <p className="text-xs">{mapError}</p>
        </div>
      </div>
    )
  }

  // Derive the displayed route status + answer from the selected scrubber slot.
  // When the user selects slot N in the heatmap, the badge and answer update to
  // reflect that slot's provider status rather than the initial "Núna" status.
  const effectiveSelectedCandidateIdx =
    routeBridgeSummary && routeWeatherMode === 'forecast'
      ? selectedCandidateIdx
      : null
  const displayedRouteStatus: DeterministicResult['stada'] =
    effectiveSelectedCandidateIdx !== null &&
    routeSlotStatusOverrides != null &&
    routeSlotStatusOverrides[effectiveSelectedCandidateIdx] != null
      ? windDisplayStatusToTravelStatus(routeSlotStatusOverrides[effectiveSelectedCandidateIdx])
      : (routeBridgeSummary?.status ?? 'graent')
  const displayedRouteAnswer: string =
    routeBridgeSummary == null
      ? ''
      : effectiveSelectedCandidateIdx !== null &&
          routeSlotStatusOverrides != null &&
          routeSlotStatusOverrides[effectiveSelectedCandidateIdx] != null &&
          routeBridgeSummary.slotStatusSource !== 'fallback'
        ? providerRouteAnswer(displayedRouteStatus)
        : routeBridgeSummary.answer
  const selectedRouteCandidate =
    effectiveSelectedCandidateIdx !== null && routeCandidates?.[effectiveSelectedCandidateIdx]
      ? routeCandidates[effectiveSelectedCandidateIdx]
      : null
  const displayedRouteSlotLabel =
    routeBridgeSummary == null
      ? ''
      : selectedRouteCandidate
        ? t('roadMapPrototypeViewingDepartureAt', {
            time: formatCompactDateTime(selectedRouteCandidate.departureIso, locale),
          })
        : t('roadMapPrototypeViewingDepartureNow')
  const displayedRouteCandidates = routeCandidates ? routeCandidates.slice(0, visibleCandidateLimit) : null
  const displayedSlotStatusOverrides = routeSlotStatusOverrides ? routeSlotStatusOverrides.slice(0, visibleCandidateLimit) : null
  const hasMoreCandidates = routeCandidates !== null && routeCandidates.length > visibleCandidateLimit
  const activeRouteStatusCounts =
    routeWeatherMode === 'now'
      ? routeNowStatusCounts ?? {}
      : routeVisibleStatusCounts ?? routeBridgeSummary?.statusCounts ?? {}
  const routeNowMeasuredLabel = routeNowMeasuredAtIso
    ? t('roadMapPrototypeVegagerdinNowLabel', {
        time: formatKlTime(routeNowMeasuredAtIso),
      })
    : t('roadMapPrototypeVegagerdinNowFallback')
  const routeScrubberStatusText =
    routeForecastBuildStatus === 'loading'
      ? t('roadMapPrototypeScrubberCalculatingHourly')
      : routeBridgeSummary
        ? routeScrubberSubtitle(routeBridgeSummary.slotStatusSource)
        : ''
  const routeLoaderFrom = routeCalculationPlaceNames?.from ?? routeFrom.trim()
  const routeLoaderTo = routeCalculationPlaceNames?.to ?? routeTo.trim()
  const routeLoaderTitles = [
    t('roadMapPrototypeRouteLoaderForecast'),
    t('roadMapPrototypeRouteLoaderDistance', {
      from: routeLoaderFrom || t('roadMapPrototypeRouteFromLabel'),
      to: routeLoaderTo || t('roadMapPrototypeRouteToLabel'),
    }),
    t('roadMapPrototypeRouteLoaderNow'),
  ]

  return (
    <div className="flex h-full w-full flex-col">
      {/* Topbar */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border/60 bg-background px-3 py-2">
        <button
          type="button"
          onClick={() => { if (isWeatherChaseOpen) { setIsWeatherChaseOpen(false) } else { setIsWeatherChaseOpen(true); setIsPanelOpen(false); setIsChatOpen(false) } }}
          className={`flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-semibold shadow-sm transition-colors ${isWeatherChaseOpen ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 bg-background text-foreground hover:bg-muted'}`}
        >
          🌦️ {t('roadMapPrototypeWeatherChaseTitle')}
        </button>
        <button
          type="button"
          onClick={() => { if (isPanelOpen) { setIsPanelOpen(false) } else { setIsPanelOpen(true); setIsWeatherChaseOpen(false); setIsChatOpen(false) } }}
          className={`flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-semibold shadow-sm transition-colors ${isPanelOpen ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 bg-background text-foreground hover:bg-muted'}`}
        >
          🚗 {t('roadMapPrototypePanelRoute')}
        </button>
        <button
          type="button"
          onClick={() => { if (isChatOpen) { setIsChatOpen(false) } else { setIsChatOpen(true); setIsWeatherChaseOpen(false); setIsPanelOpen(false); acknowledgeCurrentItems() } }}
          className={`relative flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-semibold shadow-sm transition-colors ${isChatOpen ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 bg-background text-foreground hover:bg-muted'}`}
        >
          💬 {t('roadMapPrototypePanelMessages')}
          {!isChatOpen && newSinceOpenCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-[9px] font-semibold leading-4 text-destructive-foreground">{newSinceOpenCount}</span>
          )}
        </button>
        <div className="flex-1" />
        <TeskeidMenu variant="authenticated" />
      </div>
      {/* Map area */}
      <div className="relative flex-1 min-h-0">
      {/* h-full w-full — NOT absolute inset-0 — because MapLibre adds
          .maplibregl-map { position: relative } to this element, which would
          override Tailwind's `absolute` and cause inset-0 to collapse to 0px.
          h-full w-full survives the position override. */}
      <div ref={containerRef} className="h-full w-full" />

      {routeBridgeStatus === 'loading' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 px-5 backdrop-blur-sm">
          <TeskeidLoader
            ideaTitles={routeLoaderTitles}
            loadingLabel={t('roadMapPrototypeRouteLoading')}
            fallbackIdeaTitle={t('roadMapPrototypeRouteLoaderNow')}
            intervalMs={1800}
            className="min-h-[320px] w-full max-w-sm"
          />
        </div>
      )}


      {isWeatherChaseOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-sm sm:pointer-events-none sm:absolute sm:inset-x-3 sm:bottom-28 sm:top-14 sm:z-[40] sm:flex-row sm:items-start sm:bg-transparent sm:backdrop-blur-none">
          {/* Mobile-only header */}
          <div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-3 py-2 sm:hidden">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{t('roadMapPrototypeWeatherChaseTitle')}</p>
            <button
              type="button"
              onClick={() => { setIsPanelOpen(true); setIsWeatherChaseOpen(false); setIsChatOpen(false); }}
              className={`flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-semibold shadow-sm backdrop-blur-sm transition-colors ${isPanelOpen ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 bg-background/90 text-foreground hover:bg-background'}`}
            >
              🚗 {t('roadMapPrototypePanelRoute')}
            </button>
            <button
              type="button"
              onClick={() => { setIsChatOpen(true); setIsWeatherChaseOpen(false); setIsPanelOpen(false); acknowledgeCurrentItems(); }}
              className={`relative flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-semibold shadow-sm backdrop-blur-sm transition-colors ${isChatOpen ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 bg-background/90 text-foreground hover:bg-background'}`}
            >
              💬 {t('roadMapPrototypePanelMessages')}
              {!isChatOpen && newSinceOpenCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-[9px] font-semibold leading-4 text-destructive-foreground">{newSinceOpenCount}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setIsWeatherChaseOpen(false); setIsPanelOpen(false); setIsChatOpen(false); }}
              className="flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-border/70 bg-background/90 px-3 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
            >
              {t('roadMapPrototypeBackToMap')}
            </button>
            <TeskeidMenu variant="authenticated" />
          </div>
          <div className="pointer-events-auto flex-1 overflow-y-auto p-3 sm:flex-none sm:max-h-[calc(100vh-9rem)] sm:w-full sm:max-w-2xl sm:rounded-xl sm:border sm:border-border/70 sm:bg-background/95 sm:shadow-xl sm:backdrop-blur-sm">
            <WeatherChasePanel
              items={weatherChaseItems}
              initialSelectedIds={weatherChaseInitialSelectedIds}
              labels={{
                title: t('roadMapPrototypeWeatherChaseTitle'),
                subtitle: t('roadMapPrototypeWeatherChaseSubtitle'),
                loading: t('roadMapPrototypeWeatherChaseLoading'),
                emptyData: t('roadMapPrototypeWeatherChaseEmptyData'),
                searchLabel: t('roadMapPrototypeWeatherChaseSearchLabel'),
                searchPlaceholder: t('roadMapPrototypeWeatherChaseSearchPlaceholder'),
                selectedLabel: t('roadMapPrototypeWeatherChaseSelectedLabel'),
                suggestionsLabel: t('roadMapPrototypeWeatherChaseSuggestionsLabel'),
                noSuggestions: t('roadMapPrototypeWeatherChaseNoSuggestions'),
                addLabel: t('roadMapPrototypeWeatherChaseAddLabel'),
                removeLabel: t('roadMapPrototypeWeatherChaseRemoveLabel'),
                moveUpLabel: t('roadMapPrototypeWeatherChaseMoveUpLabel'),
                moveDownLabel: t('roadMapPrototypeWeatherChaseMoveDownLabel'),
                showNearbyStationsLabel: t('roadMapPrototypeWeatherChaseShowNearbyStations'),
                emptySelection: t('roadMapPrototypeWeatherChaseEmptySelection'),
                reorderTitle: t('roadMapPrototypeWeatherChaseReorderTitle'),
                noRowsLabel: t('roadMapPrototypeWeatherChaseNoRows'),
                criteriaTitle: t('roadMapPrototypeWeatherChaseCriteriaTitle'),
                criteriaHint: t('roadMapPrototypeWeatherChaseCriteriaHint'),
                minTemperatureLabel: t('roadMapPrototypeWeatherChaseMinTemperatureLabel'),
                maxWindLabel: t('roadMapPrototypeWeatherChaseMaxWindLabel'),
                maxPrecipitationLabel: t('roadMapPrototypeWeatherChaseMaxPrecipitationLabel'),
                decreasePrecipitationLabel: t('roadMapPrototypeWeatherChaseDecreasePrecipitation'),
                increasePrecipitationLabel: t('roadMapPrototypeWeatherChaseIncreasePrecipitation'),
                decreaseTemperatureLabel: t('roadMapPrototypeWeatherChaseDecreaseTemperature'),
                increaseTemperatureLabel: t('roadMapPrototypeWeatherChaseIncreaseTemperature'),
                decreaseWindLabel: t('roadMapPrototypeWeatherChaseDecreaseWind'),
                increaseWindLabel: t('roadMapPrototypeWeatherChaseIncreaseWind'),
                temperatureUnit: t('roadMapPrototypeWeatherChaseTemperatureUnit'),
                windUnit: t('roadMapPrototypeWeatherChaseWindUnit'),
                precipitationUnit: t('roadMapPrototypeWeatherChasePrecipitationUnit'),
                visibleHoursLabel: t('roadMapPrototypeWeatherChaseVisibleHoursLabel'),
                visibleHourAriaLabel: t('roadMapPrototypeWeatherChaseVisibleHourAriaLabel'),
                saveDefaultsLabel: t('roadMapPrototypeWeatherChaseSaveDefaults'),
                savingDefaultsLabel: t('roadMapPrototypeWeatherChaseSavingDefaults'),
                savedDefaultsLabel: t('roadMapPrototypeWeatherChaseSavedDefaults'),
                savedLocalDefaultsLabel: t('roadMapPrototypeWeatherChaseSavedLocalDefaults'),
                saveDefaultsFailedLabel: t('roadMapPrototypeWeatherChaseSaveDefaultsFailed'),
                settingsLabel: t('roadMapPrototypeWeatherChaseSettings'),
              }}
              locale={locale}
              thresholds={overviewThresholds}
              loading={overviewVedurstofanLoading && !overviewVedurstofanRestricted}
              onLoadItemRows={loadWeatherChaseItemRows}
              onSelectedItemsChange={handleWeatherChaseSelectedItemsChange}
              onShowNearbyStations={handleWeatherChaseShowNearbyStations}
              criteria={weatherChaseCriteria}
              onCriteriaChange={handleWeatherChaseCriteriaChange}
              onSaveDefault={isAuthenticated ? undefined : handleSaveWeatherChaseDefault}
              saveStatus={weatherChaseSaveStatus}
              nearbyStationItemId={weatherChaseNearbyFocusId}
              nearbyStationItems={weatherChaseNearbyDisplayItems}
              onHourSelect={(hour) => {
                const slot = overviewForecastSlots.find(ms => new Date(ms).getUTCHours() === hour)
                if (slot !== undefined) handleOverviewModeChange(slot)
              }}
              visibleHours={mapVisibleHours}
              onVisibleHoursChange={(hours) => setMapVisibleHours(normalizeWeatherChaseVisibleHours(hours))}
            />
          </div>
        </div>
      )}

      {isChatOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-sm sm:absolute sm:bottom-auto sm:left-3 sm:top-14 sm:z-30 sm:block sm:w-[calc(100%-1.5rem)] sm:max-w-[360px] sm:rounded-xl sm:border sm:border-border/70 sm:p-2 sm:shadow-lg">
          {/* Mobile-only header */}
          <div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-3 py-2 sm:hidden">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{t('roadMapPrototypePanelMessages')}</p>
            <button
              type="button"
              onClick={() => { setIsWeatherChaseOpen(true); setIsPanelOpen(false); setIsChatOpen(false); }}
              className={`flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-semibold shadow-sm backdrop-blur-sm transition-colors ${isWeatherChaseOpen ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 bg-background/90 text-foreground hover:bg-background'}`}
            >
              🌦️ {t('roadMapPrototypeWeatherChaseTitle')}
            </button>
            <button
              type="button"
              onClick={() => { setIsPanelOpen(true); setIsWeatherChaseOpen(false); setIsChatOpen(false); }}
              className={`flex h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-semibold shadow-sm backdrop-blur-sm transition-colors ${isPanelOpen ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 bg-background/90 text-foreground hover:bg-background'}`}
            >
              🚗 {t('roadMapPrototypePanelRoute')}
            </button>
            <button
              type="button"
              onClick={() => { setIsWeatherChaseOpen(false); setIsPanelOpen(false); setIsChatOpen(false); }}
              className="flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-border/70 bg-background/90 px-3 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
            >
              {t('roadMapPrototypeBackToMap')}
            </button>
            <TeskeidMenu variant="authenticated" />
          </div>
          {/* Desktop-only close button */}
          <div className="mb-1 hidden items-center justify-end sm:flex">
            <button
              type="button"
              onClick={() => setIsChatOpen(false)}
              className="min-h-10 rounded-full px-3 py-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t('overlayClose')}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 sm:flex-none sm:overflow-visible sm:p-0">
          <ConditionsFeedPreview
            title={t('conditionsFeedTitle')}
            items={conditionsItems}
            loading={conditionsLoading}
            emptyBehavior="message"
            emptyLabel={t('conditionsFeedEmpty')}
            deletedLabel={tPulse('pulseDeleted')}
            kindLabels={{
              field_report: tPulse('pulseKindField'),
              measurement_report: tPulse('pulseKindMeasurement'),
            }}
            viewMoreLabel={t('conditionsFeedViewMore')}
            targetHref={(target) => {
              const effectiveProvider = target.provider ?? (
                target.targetType === 'vegagerdin_station' ? 'vegagerdin' : 'vedurstofan'
              )
              return effectiveProvider === 'vegagerdin'
                ? vegagerdinPulseHref(target.targetId, '/auth-mvp/vedrid/road-map-prototype')
                : vedurstofanPulseHref(
                    target.targetId,
                    `/auth-mvp/vedrid/road-map-prototype?stationId=${target.targetId}`,
                  )
            }}
          />
          </div>
        </div>
      )}

      {/* Route panel — starts below the shared emoji controls on every viewport. */}
      <div
        className={`fixed inset-0 z-[100] flex-col overflow-hidden bg-background/90 backdrop-blur-sm sm:absolute sm:bottom-0 sm:left-3 sm:top-14 sm:z-20 sm:w-[calc(100%-1.5rem)] sm:max-w-[360px] sm:rounded-t-xl sm:border sm:border-b-0 sm:border-border/70 sm:shadow-lg sm:transition-transform sm:duration-200 ${isPanelOpen ? 'flex sm:translate-x-0' : 'hidden sm:flex sm:-translate-x-[calc(100%+0.75rem)]'}`}
      >
        {/* Panel header */}
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-3 py-2">
          <button
            type="button"
            onClick={() => setIsPanelOpen(false)}
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted sm:flex"
            aria-label="Loka"
          >
            ◀
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {routeBridgeSummary
              ? t('roadMapPrototypeRouteSummaryPlaces', {
                  from: routeBridgeSummary.fromName,
                  to: routeBridgeSummary.toName,
                })
              : t('roadMapPrototypeRouteBridgeTitle')}
          </p>
          {routeBridgeSummary && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: routeStatusColor(displayedRouteStatus) }}
            >
              {routeStatusLabel(displayedRouteStatus)}
            </span>
          )}
          {/* Mobile nav buttons */}
          <div className="flex shrink-0 items-center gap-1.5 sm:hidden">
            <button
              type="button"
              onClick={() => { setIsWeatherChaseOpen(true); setIsPanelOpen(false); setIsChatOpen(false); }}
              className={`flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-semibold shadow-sm backdrop-blur-sm transition-colors ${isWeatherChaseOpen ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 bg-background/90 text-foreground hover:bg-background'}`}
            >
              🌦️ {t('roadMapPrototypeWeatherChaseTitle')}
            </button>
            <button
              type="button"
              onClick={() => { setIsChatOpen(true); setIsPanelOpen(false); setIsWeatherChaseOpen(false); acknowledgeCurrentItems(); }}
              className={`relative flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-semibold shadow-sm backdrop-blur-sm transition-colors ${isChatOpen ? 'border-primary bg-primary/10 text-primary' : 'border-border/70 bg-background/90 text-foreground hover:bg-background'}`}
            >
              💬 {t('roadMapPrototypePanelMessages')}
              {!isChatOpen && newSinceOpenCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-[9px] font-semibold leading-4 text-destructive-foreground">{newSinceOpenCount}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setIsPanelOpen(false); setIsWeatherChaseOpen(false); setIsChatOpen(false); }}
              className="flex h-9 items-center justify-center whitespace-nowrap rounded-full border border-border/70 bg-background/90 px-3 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
            >
              {t('roadMapPrototypeBackToMap')}
            </button>
            <TeskeidMenu variant="authenticated" />
          </div>
        </div>

        {/* Panel body — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {routeBridgeSummary ? (
            /* Route active: route summary info */
            <div className="space-y-1.5 p-3 text-[11px] text-muted-foreground">
              <p>
                {t('roadMapPrototypeRouteSummaryStats', {
                  distance: formatNum(routeBridgeSummary.distanceKm, locale),
                  duration: formatDurationMinutes(routeBridgeSummary.durationMinutes),
                })}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-foreground">{displayedRouteSlotLabel}</span>
                {selectedRouteCandidate && (
                  <button
                    type="button"
                    onClick={() => handleSelectCandidateIdx(null)}
                    className="min-h-10 rounded-full border border-border bg-background px-3 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {t('roadMapPrototypeReturnToNow')}
                  </button>
                )}
              </div>
              {routeBridgeSummary.vegagerdinStationCount > 0 && (
                <p className="flex items-center gap-1">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: '#2d5a27' }}
                  />
                  {t('roadMapPrototypeVegagerdinStationCount', {
                    count: routeBridgeSummary.vegagerdinStationCount,
                  })}
                </p>
              )}
              {routeBridgeSummary.vedurstofanStationCount > 0 && (
                <p className="flex items-center gap-1">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: '#0891b2' }}
                  />
                  {t('roadMapPrototypeVedurstofanStationCount', {
                    count: routeBridgeSummary.vedurstofanStationCount,
                  })}
                </p>
              )}
              <p className="line-clamp-3">{displayedRouteAnswer}</p>
              <p>
                {t('roadMapPrototypeRouteThresholdSummary', {
                  caution: formatNum(routeBridgeSummary.thresholdsUsed.cautionWindMs, locale),
                  red: formatNum(routeBridgeSummary.thresholdsUsed.redWindMs, locale),
                })}
              </p>
              <button
                type="button"
                onClick={handleClearRoute}
                className="mt-2 min-h-10 w-full rounded-full border border-border bg-background px-3 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {t('roadMapPrototypeRouteClear')}
              </button>
            </div>
          ) : (
            /* No route: route form */
            <div className="p-3">
              <form ref={formRef} className="space-y-2" onSubmit={handleRouteBridgeSubmit}>
                <div className="grid grid-cols-1 gap-2">
                  <label className="min-w-0">
                    <span className="sr-only">{t('roadMapPrototypeRouteFromLabel')}</span>
                    <div className="relative">
                      <input
                        value={routeFrom}
                        onChange={(event) => {
                          setRouteFrom(event.target.value)
                          setFromResolved(null)
                          setActiveRouteFieldState('from')
                          fetchSuggestionsFor(
                            event.target.value,
                            fromSuggestAbortRef,
                            fromSuggestTimerRef,
                            fromFocusedRef,
                            setFromSuggestions,
                          )
                        }}
                        onFocus={() => {
                          fromFocusedRef.current = true
                          setActiveRouteFieldState('from')
                          if (fromBlurTimerRef.current) clearTimeout(fromBlurTimerRef.current)
                          if (routeFrom.trim().length >= 2) {
                            setFromSuggestions(findRoadMapPlaceSuggestions(routeFrom, 5))
                          }
                        }}
                        onBlur={() => {
                          fromFocusedRef.current = false
                          if (fromBlurTimerRef.current) clearTimeout(fromBlurTimerRef.current)
                          fromBlurTimerRef.current = setTimeout(() => {
                            // Only close if focus left the form entirely (not just moved to another field).
                            if (!formRef.current?.contains(document.activeElement)) {
                              setFromSuggestions([])
                            }
                          }, 150)
                        }}
                        placeholder={t('roadMapPrototypeRouteFromPlaceholder')}
                        autoComplete="off"
                        className={`h-10 w-full rounded-md border bg-background px-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground ${activeRouteField === 'from' ? 'border-primary ring-1 ring-primary/30' : 'border-border focus:border-primary'}`}
                      />
                      {renderPlaceSuggestionList('from', fromSuggestions)}
                    </div>
                  </label>
                  <label className="min-w-0">
                    <span className="sr-only">{t('roadMapPrototypeRouteToLabel')}</span>
                    <div className="relative">
                      <input
                        value={routeTo}
                        onChange={(event) => {
                          setRouteTo(event.target.value)
                          setToResolved(null)
                          setActiveRouteFieldState('to')
                          fetchSuggestionsFor(
                            event.target.value,
                            toSuggestAbortRef,
                            toSuggestTimerRef,
                            toFocusedRef,
                            setToSuggestions,
                          )
                        }}
                        onFocus={() => {
                          toFocusedRef.current = true
                          setActiveRouteFieldState('to')
                          if (toBlurTimerRef.current) clearTimeout(toBlurTimerRef.current)
                          // Switching to Til: close Frá suggestions explicitly.
                          setFromSuggestions([])
                          if (routeTo.trim().length >= 2) {
                            setToSuggestions(findRoadMapPlaceSuggestions(routeTo, 5))
                          }
                        }}
                        onBlur={() => {
                          toFocusedRef.current = false
                          if (toBlurTimerRef.current) clearTimeout(toBlurTimerRef.current)
                          toBlurTimerRef.current = setTimeout(() => {
                            if (!formRef.current?.contains(document.activeElement)) {
                              setToSuggestions([])
                            }
                          }, 150)
                        }}
                        placeholder={t('roadMapPrototypeRouteToPlaceholder')}
                        autoComplete="off"
                        className={`h-10 w-full rounded-md border bg-background px-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground ${activeRouteField === 'to' ? 'border-primary ring-1 ring-primary/30' : 'border-border focus:border-primary'}`}
                      />
                      {renderPlaceSuggestionList('to', toSuggestions)}
                    </div>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="min-w-0">
                    <span className="mb-0.5 block text-[10px] text-muted-foreground">
                      {t('thresholdBarCautionLabel')}
                    </span>
                    <span className="flex h-10 items-center rounded-md border border-border bg-background focus-within:border-primary">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.1"
                        max="40"
                        step="0.1"
                        value={routeCautionWind}
                        onChange={(event) => {
                          setRouteCautionWind(event.target.value)
                          setRouteThresholdError(null)
                        }}
                        className="min-w-0 flex-1 bg-transparent px-2 text-base text-foreground outline-none"
                      />
                      <span className="shrink-0 pr-2 text-[11px] text-muted-foreground">
                        {t('thresholdBarUnit')}
                      </span>
                    </span>
                  </label>
                  <label className="min-w-0">
                    <span className="mb-0.5 block text-[10px] text-muted-foreground">
                      {t('thresholdBarDangerLabel')}
                    </span>
                    <span className="flex h-10 items-center rounded-md border border-border bg-background focus-within:border-primary">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.1"
                        max="40"
                        step="0.1"
                        value={routeRedWind}
                        onChange={(event) => {
                          setRouteRedWind(event.target.value)
                          setRouteThresholdError(null)
                        }}
                        className="min-w-0 flex-1 bg-transparent px-2 text-base text-foreground outline-none"
                      />
                      <span className="shrink-0 pr-2 text-[11px] text-muted-foreground">
                        {t('thresholdBarUnit')}
                      </span>
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={routeBridgeStatus === 'loading'}
                  className="h-10 w-full rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity disabled:cursor-wait disabled:opacity-70"
                >
                  {routeBridgeStatus === 'loading'
                    ? t('roadMapPrototypeRouteLoading')
                    : t('roadMapPrototypeRouteSubmit')}
                </button>
              </form>

              {routeThresholdError && (
                <p className="mt-2 text-xs text-destructive">{routeThresholdError}</p>
              )}
              {routeBridgeError && (
                <p className="mt-2 text-xs text-destructive">{routeBridgeError}</p>
              )}
            </div>
          )}
        </div>

        {/* Layer controls — fixed at bottom of panel */}
        <div className="shrink-0 border-t border-border/50 p-3 space-y-2">
          {/* Toggle buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleOverlayToggle}
              className="min-h-10 rounded-full border border-border bg-background/80 px-3 py-2 text-[11px] text-foreground/80 transition-colors hover:bg-muted"
            >
              {showOverlay ? t('roadMapPrototypeHideRoadNetwork') : t('roadMapPrototypeShowRoadNetwork')}
            </button>
            <button
              type="button"
              onClick={handleSegmentsToggle}
              className="min-h-10 rounded-full border border-border bg-background/80 px-3 py-2 text-[11px] text-foreground/80 transition-colors hover:bg-muted"
            >
              {showSegments
                ? t('roadMapPrototypeHideConditionSegments')
                : t('roadMapPrototypeShowConditionSegments')}
            </button>
          </div>

          {/* Road condition legend */}
          <div className="flex flex-wrap items-center gap-1.5">
            {ROAD_CONDITION_LEGEND.map(({ color, label }) => (
              <span key={label} className="flex items-center gap-0.5">
                <span
                  className="inline-block w-2 h-2 rounded-full border border-border/60 shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </span>
            ))}
            {segmentCount !== null && (
              <span className="text-[10px] text-muted-foreground">
                {segmentCount === 'loading'
                  ? `· ${t('roadMapPrototypeSegmentCountLoading')}`
                  : segmentCount === 'error'
                    ? `· ${t('roadMapPrototypeSegmentCountError')}`
                    : `· ${t('roadMapPrototypeSegmentCount', { count: segmentCount })}`}
              </span>
            )}
          </div>

          {/* Overview station count */}
          {!routeBridgeSummary && !isWeatherChaseOpen && stationCount !== null && (
            <p className="text-[10px] text-muted-foreground">
              {overviewActiveMode === 'now'
                ? t('vegagerdinProviderLabel')
                : t('sourceForecastGroupLabel')}
              {' · '}
              {t('roadMapPrototypeStationCount', { count: stationCount })}
            </p>
          )}
        </div>
      </div>

      {/* Bottom strip — overview source selector or route departure scrubber. */}
      <div className="absolute bottom-0 left-0 right-0 z-10 border-t border-border/50 bg-background/90 pb-5 backdrop-blur-sm">
        {routeBridgeStatus === 'loading' ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            {t('roadMapPrototypeScrubberCalculatingHourly')}
          </div>
        ) : routeBridgeSummary ? (
          <div className="px-3 pb-2 pt-2">
            {renderRouteSurfaceChoices()}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-full border border-border bg-background/80 p-0.5">
                {(['simple', 'detailed'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={routeStatusFilterMode === mode}
                    onClick={() => handleRouteStatusFilterModeChange(mode)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                      routeStatusFilterMode === mode
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {mode === 'simple' ? t('statusFilterModeSimple') : t('statusFilterModeDetailed')}
                  </button>
                ))}
              </div>
              <WindStatusFilterPills
                counts={activeRouteStatusCounts}
                visibleStatuses={visibleRouteStatuses}
                onVisibleStatusesChange={handleRouteStatusFilterChange}
                showAllLabel=""
                alwaysShowWithinLimits
                mode={routeStatusFilterMode}
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={routeWeatherMode === 'now'}
                onClick={handleSelectRouteNow}
                className={`min-h-10 rounded-lg border px-3 py-1.5 text-left text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  routeWeatherMode === 'now'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background/85 text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="flex items-center gap-1.5 font-semibold">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: routeStatusColor(routeBridgeSummary.status) }}
                  />
                  {routeNowMeasuredLabel}
                </span>
              </button>

              {!routeDepartureForecastExpanded && (
                <button
                  type="button"
                  onClick={handleRouteDepartureForecastOptIn}
                  className="min-h-10 rounded-lg border border-border bg-background/85 px-3 py-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <span className="block font-semibold text-foreground">
                    {t('roadMapPrototypeDepartureDrawerTitle')}
                  </span>
                  <span className="block text-[10px]">
                    {t('roadMapPrototypeDepartureOptInButton')}
                  </span>
                </button>
              )}
            </div>

            {routeDepartureForecastExpanded && (
              <div className="mt-2 rounded-lg border border-border/70 bg-background/70 p-2">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      {t('roadMapPrototypeDepartureDrawerTitle')}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {routeForecastBuildStatus === 'loading'
                        ? t('roadMapPrototypeScrubberCalculatingHourly')
                        : routeForecastBuildStatus === 'unavailable' || routeForecastBuildStatus === 'error'
                          ? t('roadMapPrototypeDepartureOptInUnavailable')
                          : t('roadMapPrototypeDepartureOptInDescription')}
                    </p>
                  </div>
                  {(routeForecastBuildStatus === 'unavailable' || routeForecastBuildStatus === 'error') && (
                    <button
                      type="button"
                      onClick={handleRouteDepartureForecastOptIn}
                      className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {t('roadMapPrototypeDepartureOptInRetry')}
                    </button>
                  )}
                </div>

                {displayedRouteCandidates && displayedRouteCandidates.length > 1 && (
                  <>
                    <DepartureHeatmap
                      candidates={displayedRouteCandidates}
                      bestWindow={undefined}
                      originName={routeBridgeSummary.fromName}
                      selectedIdx={effectiveSelectedCandidateIdx}
                      onSelectIdx={handleSelectCandidateIdx}
                      visibleStatuses={visibleRouteStatuses}
                      onVisibleStatusesChange={handleRouteStatusFilterChange}
                      thresholdsUsed={routeBridgeSummary.thresholdsUsed}
                      subtitle={routeScrubberStatusText}
                      title={null}
                      showSelectedDetail={false}
                      slotStatusOverrides={displayedSlotStatusOverrides ?? undefined}
                      mode={routeStatusFilterMode}
                      firstSlotLabel={t('roadMapPrototypeScrubberNow')}
                      selectFirstSlotWhenNone={false}
                      showBestWindowHint={false}
                    />
                    {hasMoreCandidates && (
                      <div className="mt-1 pb-1 text-right">
                        <button
                          type="button"
                          onClick={() => setVisibleCandidateLimit(prev => prev + 24)}
                          className="text-[10px] text-primary underline-offset-2 hover:underline focus-visible:outline-none"
                        >
                          {t('roadMapPrototypeLoadMoreCandidates')}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Default overview: time selector + Einfalt/Nánar inline with pills */
          <div className="flex flex-col gap-2 px-3 pb-1 pt-2">
            <WeatherSourceTimeSelector
              vegagerdinGroupLabel={t('vegagerdinProviderLabel')}
              nowLabel={t('sourceNowLabel')}
              nowMeasuredAtLabel={
                overviewVegagerdinNewestMeasuredAtIso
                  ? t('sourceMeasuredAt', { time: formatKlTime(overviewVegagerdinNewestMeasuredAtIso) })
                  : undefined
              }
              nowStatusColor={WIND_STATUS_MARKER_COLOR[
                routeStatusFilterMode === 'simple'
                  ? toSimpleWindDisplayStatus(overviewVegagerdinWorstStatus)
                  : overviewVegagerdinWorstStatus
              ]}
              nowStatusLabel={tf(WIND_STATUS_META[overviewVegagerdinWorstStatus].labelKey as 'statusWithinLimits')}
              nowLoading={overviewVegagerdinLoading}
              nowLoadingLabel={t('sourceLoadingNow')}
              nowDisabled={overviewVegagerdinRestricted}
              forecastGroupLabel={t('sourceForecastGroupLabel')}
              forecastLabel={t('sourceForecastLabel')}
              forecastSlots={mapForecastSlotStatuses}
              forecastLoading={overviewVedurstofanLoading && !overviewVedurstofanRestricted}
              forecastLoadingLabel={t('sourceLoadingForecast')}
              activeMode={overviewActiveMode}
              onModeChange={handleOverviewModeChange}
              prevLabel={t('sourceTimePrevious')}
              nextLabel={t('sourceTimeNext')}
              neutralStatusColors
            />
            {isPanelOpen && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-full border border-border bg-background/80 p-0.5">
                {(['simple', 'detailed'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={routeStatusFilterMode === mode}
                    onClick={() => handleRouteStatusFilterModeChange(mode)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                      routeStatusFilterMode === mode
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {mode === 'simple' ? t('statusFilterModeSimple') : t('statusFilterModeDetailed')}
                  </button>
                ))}
              </div>
              <WindStatusFilterPills
                counts={overviewStatusCounts}
                visibleStatuses={overviewVisibleStatuses}
                onVisibleStatusesChange={handleOverviewStatusFilterChange}
                showAllLabel=""
                mode={routeStatusFilterMode}
                neutralColors
              />
            </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
