'use client'

// MapLibre CSS is loaded by route layout (app/auth-mvp/vedrid/road-map-prototype/layout.tsx).
import { type FormEvent, type MutableRefObject, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { VEGAGERDIN_ATTRIBUTION, OPENSTREETMAP_ATTRIBUTION } from '@/lib/iceland-routes/openDataSources'
import type { DeterministicResult, ResolvedTravelThresholds, TravelCandidate, TravelWindow } from '@/lib/weather/types'
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
  ROAD_SEGMENT_FALLBACK_COLOR,
  ROAD_SEGMENT_STATUS_COLORS,
} from '@/lib/road-intelligence/vegagerdinSegments'
import { formatCompactDateTime, formatKlTime, formatNum } from './travelAuditMap.helpers'
import { resolveThresholds, validateResolvedThresholdOrdering } from '@/lib/weather/thresholds'
import {
  ALL_WIND_DISPLAY_STATUSES,
  DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES,
  WIND_STATUS_META,
  classifyForecastWindDisplayStatusAt,
  classifyObservationWindDisplayStatus,
  classifyPointWindDisplayStatus,
  selectForecastRowAt,
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
import { useConditionsFeedPreview } from '@/lib/weather/useConditionsFeedPreview'
import { vedurstofanPulseHref, vegagerdinPulseHref } from '@/lib/weather/pulseTarget'
import type { VedurstofanTravelLayer } from '@/lib/weather/providers/vedurstofanBlend'
import type {
  VegagerdinRouteLayer,
  VegagerdinRouteLayerPoint,
} from '@/lib/road-intelligence/vegagerdinRouteLayer'
import {
  worstWindDisplayStatusFromCounts,
  countVedurstofanForecastStatusesAt,
  buildProviderSlotStatusOverrides,
  buildProviderBestWindow,
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

// Route station DOM label density rules (applied to both providers).
// Danger/uncomfortable stations always get a label; quiet routes keep first/last anchors.
const ROUTE_LABEL_ALWAYS_STATUSES = new Set<WindDisplayStatus>([
  'haettulegt',
  'nalgast-haettumork',
  'othaegilegt',
  'nalgast-othaegindi',
])
const ROUTE_LABEL_DENSITY_THRESHOLD = 6

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
const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] } as const
const TRAVEL_METNO_LAYER_ID = 'travel-bridge-weather-points'
const VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID = 'vedurstofan-route-stations'
const VEGAGERDIN_ROUTE_STATIONS_LAYER_ID = 'vegagerdin-route-stations'
const OVERVIEW_VEGAGERDIN_LAYER_ID = 'station-markers'
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

type VegagerdinCurrentApiData =
  | {
      status: 'ok'
      cacheStatus: 'fresh' | 'stale' | 'history_fallback'
      measurementFreshness: string
      fetchedAtIso: string
      oldestMeasuredAtIso: string | null
      stations: VegagerdinCurrentStationDto[]
    }
  | {
      status: 'unavailable'
      stations: []
    }

type RouteSlotStatusSource = 'providers' | 'vegagerdin' | 'vedurstofan' | 'fallback'

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

function mergeWindDisplayStatusCounts(
  ...countsList: Array<Partial<Record<WindDisplayStatus, number>>>
): Partial<Record<WindDisplayStatus, number>> {
  const merged: Partial<Record<WindDisplayStatus, number>> = {}
  for (const counts of countsList) {
    for (const status of ALL_WIND_DISPLAY_STATUSES) {
      const count = counts[status] ?? 0
      if (count > 0) merged[status] = (merged[status] ?? 0) + count
    }
  }
  return merged
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

function applyOverviewStatusFilterToMap(
  map: import('maplibre-gl').Map | null,
  statuses: ReadonlySet<WindDisplayStatus>,
  mode: WindStatusFilterMode,
) {
  if (!map) return
  const filter = buildRouteStatusFilter(statuses, mode)
  for (const layerId of OVERVIEW_FILTER_LAYER_IDS) {
    if (!map.getLayer(layerId)) continue
    map.setFilter(layerId, filter as Parameters<typeof map.setFilter>[1])
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

function clearTimerRef(timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  if (timerRef.current) clearTimeout(timerRef.current)
  timerRef.current = null
}

function abortControllerRef(abortRef: MutableRefObject<AbortController | null>) {
  abortRef.current?.abort()
  abortRef.current = null
}

/**
 * MapLibre GL JS map for the Road Intelligence M2A prototype.
 *
 * Layers:
 *  1. CartoDB Voyager raster basemap (public XYZ, CORS open)
 *  2. Vegagerðin road network raster overlay (same-origin proxy)
 *  3. Vegagerðin weather station dots, colored by current wind speed
 *
 * Container note: containerRef uses h-full w-full (not absolute inset-0) because
 * MapLibre adds .maplibregl-map { position: relative } to the container element,
 * which would override Tailwind's `absolute` and collapse inset-0 to zero height.
 * h-full w-full survives that override.
 *
 * No user GPS. No Supabase writes. No routing advice.
 * Visible only to users with road-intelligence-v1 feature flag.
 */
export function RoadMapPrototypeMap() {
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
  const routeVedurstofanLabelMarkersRef = useRef<RouteVedurstofanLabelMarker[]>([])
  const routeVedurstofanEntriesRef = useRef<VedurstofanRouteStatusEntry[]>([])
  const routeVegagerdinLabelMarkersRef = useRef<RouteVegagerdinLabelMarker[]>([])
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const showOverlayRef = useRef(true)
  const showSegmentsRef = useRef(true)
  const visibleRouteStatusesRef = useRef<Set<WindDisplayStatus>>(new Set())
  const routeStatusFilterModeRef = useRef<WindStatusFilterMode>('simple')
  const routeActiveRef = useRef(false)
  const overviewActiveModeRef = useRef<'now' | number>('now')
  const overviewVisibleStatusesRef = useRef<Set<WindDisplayStatus>>(
    new Set(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES),
  )
  const vedurstofanLayerRef = useRef<VedurstofanTravelLayer | undefined>(undefined)
  const routeDurationMinutesRef = useRef<number>(0)
  const routeThresholdsRef = useRef<ResolvedTravelThresholds>(DEFAULT_ROUTE_THRESHOLDS)
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
  const [overviewVisibleStatuses, setOverviewVisibleStatuses] = useState<Set<WindDisplayStatus>>(
    new Set(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES),
  )
  const [overviewActiveMode, setOverviewActiveMode] = useState<'now' | number>('now')
  const [overviewVegagerdinData, setOverviewVegagerdinData] = useState<VegagerdinCurrentApiData | null>(null)
  const [overviewVegagerdinLoading, setOverviewVegagerdinLoading] = useState(true)
  const [overviewVegagerdinRestricted, setOverviewVegagerdinRestricted] = useState(false)
  const [overviewVedurstofanData, setOverviewVedurstofanData] = useState<StationExplorerResponse | null>(null)
  const [overviewVedurstofanLoading, setOverviewVedurstofanLoading] = useState(true)
  const [overviewVedurstofanRestricted, setOverviewVedurstofanRestricted] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [departureAt, setDepartureAt] = useState('')
  const [routeCandidates, setRouteCandidates] = useState<TravelCandidate[] | null>(null)
  const [routeBestWindow, setRouteBestWindow] = useState<TravelWindow | undefined>(undefined)
  const [routeSlotStatusOverrides, setRouteSlotStatusOverrides] = useState<WindDisplayStatus[] | null>(null)
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
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

  const displayOverviewForecastSlotStatuses = routeStatusFilterMode === 'simple'
    ? overviewForecastSlotStatuses.map(slot => ({
        ...slot,
        worstStatus: toSimpleWindDisplayStatus(slot.worstStatus),
      }))
    : overviewForecastSlotStatuses

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
    const source = map?.getSource(OVERVIEW_VEGAGERDIN_LAYER_ID)
    if (!map?.isStyleLoaded() || !source) return

    const stations = overviewVegagerdinData?.status === 'ok'
      ? overviewVegagerdinData.stations
      : []
    const geojson = {
      type: 'FeatureCollection',
      features: stations.map((station) => {
        const status = classifyVegagerdinObservationStationWindStatus(station, overviewThresholds)
        const displayStatus = routeStatusFilterMode === 'simple'
          ? toSimpleWindDisplayStatus(status)
          : status
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [station.lon, station.lat] },
          properties: {
            stationId: station.stationId,
            stationName: station.stationName,
            meanWindMs: station.meanWindMs,
            gustMs: station.gustLast10MinMs,
            airTemperatureC: station.airTemperatureC,
            windDirectionText: station.windDirectionText,
            measuredAtIso: station.measuredAtIso,
            windDisplayStatus: displayStatus,
            rawWindDisplayStatus: status,
          },
        }
      }),
    }

    ;(source as import('maplibre-gl').GeoJSONSource).setData(geojson as never)
    if (overviewActiveMode === 'now') setStationCount(stations.length)
    applyOverviewStatusFilterToMap(map, overviewVisibleStatusesRef.current, routeStatusFilterModeRef.current)
    updateOverviewLayerVisibility()
  }, [mapReady, overviewActiveMode, overviewThresholds, overviewVegagerdinData, routeStatusFilterMode])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    const source = map?.getSource(OVERVIEW_VEDURSTOFAN_LAYER_ID)
    if (!map?.isStyleLoaded() || !source) return

    const stations = overviewVedurstofanData?.stations ?? []
    const geojson = {
      type: 'FeatureCollection',
      features: stations
        .filter(station => station.lat !== null && station.lon !== null)
        .map((station) => {
          const status = classifyForecastWindDisplayStatusAt(
            station.forecasts,
            overviewThresholds,
            overviewForecastAnchorMs,
          )
          const displayStatus = routeStatusFilterMode === 'simple'
            ? toSimpleWindDisplayStatus(status)
            : status
          const selectedIdx = selectForecastRowAt(station.forecasts, overviewForecastAnchorMs)
          const row = selectedIdx !== null ? station.forecasts[selectedIdx] : null
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [station.lon, station.lat] },
            properties: {
              stationId: station.stationId,
              stationName: station.stationName,
              windSpeedMs: row?.windSpeedMs ?? null,
              forecastTimeIso: row?.ftimeIso ?? null,
              windDirectionText: row?.windDirectionText ?? null,
              airTemperatureC: row?.temperatureC ?? null,
              windDisplayStatus: displayStatus,
              rawWindDisplayStatus: status,
            },
          }
        }),
    }

    ;(source as import('maplibre-gl').GeoJSONSource).setData(geojson as never)
    if (overviewActiveMode !== 'now') setStationCount(geojson.features.length)
    applyOverviewStatusFilterToMap(map, overviewVisibleStatusesRef.current, routeStatusFilterModeRef.current)
    updateOverviewLayerVisibility()
  }, [
    mapReady,
    overviewActiveMode,
    overviewForecastAnchorMs,
    overviewThresholds,
    overviewVedurstofanData,
    routeStatusFilterMode,
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
        return t('roadMapPrototypeScrubberSourceFallback')
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

  function updateVegagerdinLabelMarkerState(statuses = visibleRouteStatusesRef.current) {
    for (const { element, point } of routeVegagerdinLabelMarkersRef.current) {
      const visible = routeStatusIsVisible(point.windDisplayStatus, statuses)
      const color = WIND_STATUS_MARKER_COLOR[displayWindStatus(point.windDisplayStatus)]
      element.style.display = visible ? 'flex' : 'none'
      element.style.borderColor = color
      element.style.color = color
    }
  }

  function updateVedurstofanLabelMarkerState(statuses = visibleRouteStatusesRef.current) {
    for (const { element, entry } of routeVedurstofanLabelMarkersRef.current) {
      const visible = routeStatusIsVisible(entry.windDisplayStatus, statuses)
      const color = WIND_STATUS_MARKER_COLOR[displayWindStatus(entry.windDisplayStatus)]
      element.style.display = visible ? 'flex' : 'none'
      element.style.borderColor = color
      element.style.color = color
    }
  }

  function handleRouteStatusFilterModeChange(mode: WindStatusFilterMode) {
    routeStatusFilterModeRef.current = mode
    setRouteStatusFilterMode(mode)
    applyRouteStatusFilterToMap(mapRef.current, visibleRouteStatusesRef.current, mode)
    applyOverviewStatusFilterToMap(mapRef.current, overviewVisibleStatusesRef.current, mode)
    updateVedurstofanLabelMarkerState()
    updateVegagerdinLabelMarkerState()
  }

  function setActiveRouteFieldState(field: RouteBridgeField) {
    activeRouteFieldRef.current = field
    setActiveRouteField(field)
  }

  function handleRouteStatusFilterChange(next: Set<WindDisplayStatus>) {
    visibleRouteStatusesRef.current = next
    setVisibleRouteStatuses(next)
    applyRouteStatusFilterToMap(mapRef.current, next, routeStatusFilterModeRef.current)
    updateVedurstofanLabelMarkerState(next)
    updateVegagerdinLabelMarkerState(next)
  }

  function handleOverviewStatusFilterChange(next: Set<WindDisplayStatus>) {
    overviewVisibleStatusesRef.current = next
    setOverviewVisibleStatuses(next)
    applyOverviewStatusFilterToMap(mapRef.current, next, routeStatusFilterModeRef.current)
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
    const showOverview = !routeActive
    if (map.getLayer(OVERVIEW_VEGAGERDIN_LAYER_ID)) {
      map.setLayoutProperty(
        OVERVIEW_VEGAGERDIN_LAYER_ID,
        'visibility',
        showOverview && mode === 'now' ? 'visible' : 'none',
      )
    }
    if (map.getLayer(OVERVIEW_VEDURSTOFAN_LAYER_ID)) {
      map.setLayoutProperty(
        OVERVIEW_VEDURSTOFAN_LAYER_ID,
        'visibility',
        showOverview && mode !== 'now' ? 'visible' : 'none',
      )
    }
  }

  function handleSelectCandidateIdx(idx: number | null) {
    setSelectedCandidateIdx(idx)
    const layer = vedurstofanLayerRef.current
    if (!layer) return
    const candidates = routeCandidates
    const candidate = idx !== null && candidates ? candidates[idx] : null
    const newDepartureMs = candidate ? Date.parse(candidate.departureIso) : Date.now()
    renderVedurstofanStations(
      layer,
      routeDurationMinutesRef.current,
      routeThresholdsRef.current,
      newDepartureMs,
    )
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
  }

  function clearRouteVedurstofanLabelMarkers() {
    routeVedurstofanLabelMarkersRef.current.forEach(({ marker }) => marker.remove())
    routeVedurstofanLabelMarkersRef.current = []
    routeVedurstofanEntriesRef.current = []
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
    setDepartureAt('')
    setRouteCandidates(null)
    setRouteBestWindow(undefined)
    setRouteSlotStatusOverrides(null)
    setSelectedCandidateIdx(null)
    routeActiveRef.current = false
    vedurstofanLayerRef.current = undefined
    handleRouteStatusFilterChange(new Set())
    setActiveRouteFieldState('from')
    clearRouteVedurstofanLabelMarkers()
    clearRouteVegagerdinLabelMarkers()
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
    // Restore place markers based on current zoom
    const zoom = map.getZoom()
    for (const { element, place } of placeMarkersRef.current) {
      const isVisible =
        place.importance === 3 ||
        (place.importance === 2 && zoom >= 5.8) ||
        zoom >= 7.2
      element.style.display = isVisible ? 'block' : 'none'
    }
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
        map.getLayer('station-markers') ? 'station-markers' : undefined,
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

  function createRouteWindLabelElement({
    stationName,
    valueText,
    color,
    onClick,
  }: {
    stationName: string
    valueText: string
    color: string
    onClick: () => void
  }): HTMLButtonElement {
    const element = document.createElement('button')
    element.type = 'button'
    element.title = stationName
    element.setAttribute('aria-label', `${stationName}: ${valueText} m/s`)
    element.style.cssText = [
      'pointer-events:auto',
      'display:flex',
      'align-items:center',
      'gap:3px',
      `border:1.5px solid ${color}`,
      'border-radius:99px',
      'background:rgba(255,255,255,0.96)',
      `color:${color}`,
      'box-shadow:0 1px 4px rgba(15,23,42,0.18)',
      'font:700 11px/1.15 Inter,system-ui,sans-serif',
      'min-height:22px',
      'padding:2px 6px',
      'white-space:nowrap',
      'cursor:pointer',
    ].join(';')

    const value = document.createElement('span')
    value.textContent = valueText
    element.appendChild(value)

    const unit = document.createElement('span')
    unit.textContent = 'm/s'
    unit.style.cssText = 'font-weight:500;font-size:9px;color:#475569'
    element.appendChild(unit)

    element.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      onClick()
    })

    return element
  }

  function createVedurstofanRouteLabel(entry: VedurstofanRouteStatusEntry): HTMLButtonElement {
    const valueText = entry.selectedRow?.windSpeedMs != null
      ? formatNum(entry.selectedRow.windSpeedMs, locale)
      : '–'
    const color = WIND_STATUS_MARKER_COLOR[displayWindStatus(entry.windDisplayStatus)]
    return createRouteWindLabelElement({
      stationName: entry.point.stationName,
      valueText,
      color,
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
    if (!map?.isStyleLoaded()) return { count: 0, statusCounts: {} }

    clearRouteVedurstofanLabelMarkers()
    const rawPoints = Array.isArray(layer?.points) ? layer.points : []
    const validPoints = rawPoints.filter(
      (p): p is VedurstofanRoutePoint =>
        typeof p.lat === 'number' && typeof p.lon === 'number',
    )
    const departureMs = departureMsOverride ?? (departureAt ? Date.parse(departureAt) : Date.now())
    const routeDurationMs = Math.max(0, routeDurationMinutes) * 60_000
    const statusEntries = validPoints.map((p) => {
      const anchorMs = Number.isFinite(departureMs)
        ? departureMs + (p.routeFraction ?? 0) * routeDurationMs
        : Date.now()
      const windDisplayStatus = classifyForecastWindDisplayStatusAt(
        p.forecastRows,
        thresholds,
        anchorMs,
      )
      const selectedRowIdx = selectForecastRowAt(p.forecastRows, anchorMs)
      return {
        point: p,
        windDisplayStatus,
        selectedRow: selectedRowIdx !== null ? p.forecastRows[selectedRowIdx] : null,
      }
    })
    const statusCounts = countWindDisplayStatuses(statusEntries)
    // Publish all entries to the data ref so the circle click handler can find
    // stations that have no DOM label (due to density rules).
    routeVedurstofanEntriesRef.current = statusEntries

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
      // Density rule: danger/uncomfortable always get a label.
      // Long quiet routes keep true first/last route anchors for orientation.
      let entriesToLabel: typeof statusEntries
      const routeOrderedEntries = [...statusEntries].sort((a, b) => {
        const aPosition = a.point.routeFraction ?? (
          a.point.distanceFromOriginM != null ? a.point.distanceFromOriginM : Number.MAX_SAFE_INTEGER
        )
        const bPosition = b.point.routeFraction ?? (
          b.point.distanceFromOriginM != null ? b.point.distanceFromOriginM : Number.MAX_SAFE_INTEGER
        )
        return aPosition - bPosition
      })
      if (routeOrderedEntries.length <= ROUTE_LABEL_DENSITY_THRESHOLD) {
        entriesToLabel = routeOrderedEntries
      } else {
        const entriesByKey = new Map<string, typeof statusEntries[number]>()
        const addLabelEntry = (entry: typeof statusEntries[number] | undefined) => {
          if (!entry) return
          entriesByKey.set(`${entry.point.stationId}:${entry.point.routePointId}`, entry)
        }
        addLabelEntry(routeOrderedEntries[0])
        addLabelEntry(routeOrderedEntries[routeOrderedEntries.length - 1])
        for (const entry of routeOrderedEntries) {
          if (ROUTE_LABEL_ALWAYS_STATUSES.has(entry.windDisplayStatus)) {
            addLabelEntry(entry)
          }
        }
        entriesToLabel = [...entriesByKey.values()].sort((a, b) =>
          routeOrderedEntries.indexOf(a) - routeOrderedEntries.indexOf(b),
        )
      }
      for (const entry of entriesToLabel) {
        const element = createVedurstofanRouteLabel(entry)
        const marker = new Marker({ element, anchor: 'bottom', offset: [0, -8] })
          .setLngLat([entry.point.lon, entry.point.lat])
          .addTo(map)
        routeVedurstofanLabelMarkersRef.current.push({ marker, element, entry })
      }
      updateVedurstofanLabelMarkerState()
    }

    applyRouteStatusFilterToMap(
      map,
      visibleRouteStatusesRef.current,
      routeStatusFilterModeRef.current,
    )
    updateVedurstofanLabelMarkerState()

    return { count: validPoints.length, statusCounts }
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
    if (point.meanWindMs != null) {
      appendLine(labelsRef.current.routePointWind(formatNum(point.meanWindMs, locale)))
    }
    if (point.gustLast10MinMs != null) {
      appendLine(labelsRef.current.routePointGust(formatNum(point.gustLast10MinMs, locale)))
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

  function createVegagerdinRouteLabel(point: VegagerdinRouteLayerPoint): HTMLButtonElement {
    const valueText = point.gustLast10MinMs != null && point.meanWindMs != null
      ? `${formatNum(point.meanWindMs, locale)} / ${formatNum(point.gustLast10MinMs, locale)}`
      : point.gustLast10MinMs != null
        ? formatNum(point.gustLast10MinMs, locale)
        : point.meanWindMs != null
          ? formatNum(point.meanWindMs, locale)
          : '–'
    const color = WIND_STATUS_MARKER_COLOR[displayWindStatus(point.windDisplayStatus)]
    return createRouteWindLabelElement({
      stationName: point.stationName,
      valueText,
      color,
      onClick: () => openVegagerdinRouteStationPopup(point),
    })
  }

  function renderVegagerdinStations(
    layer: VegagerdinRouteLayer | undefined,
  ): { count: number; statusCounts: Partial<Record<WindDisplayStatus, number>> } {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return { count: 0, statusCounts: {} }

    clearRouteVegagerdinLabelMarkers()
    const rawPoints = Array.isArray(layer?.points) ? layer.points : []
    const validPoints = rawPoints.filter(
      (p): p is VegagerdinRouteLayerPoint =>
        Number.isFinite(p.lat) && Number.isFinite(p.lon),
    )
    const statusCounts = countWindDisplayStatuses(validPoints)

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
        const point = routeVegagerdinLabelMarkersRef.current.find(
          marker => marker.point.stationId === stationId,
        )?.point
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
      for (const point of validPoints) {
        const element = createVegagerdinRouteLabel(point)
        const marker = new Marker({ element, anchor: 'bottom', offset: [0, -8] })
          .setLngLat([point.lon, point.lat])
          .addTo(map)
        routeVegagerdinLabelMarkersRef.current.push({ marker, element, point })
      }
      updateVegagerdinLabelMarkerState()
    }

    applyRouteStatusFilterToMap(
      map,
      visibleRouteStatusesRef.current,
      routeStatusFilterModeRef.current,
    )
    return { count: validPoints.length, statusCounts }
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

    routeBridgeRequestRef.current?.abort()
    const controller = new AbortController()
    routeBridgeRequestRef.current = controller
    setRouteBridgeStatus('loading')
    setRouteBridgeError(null)
    setRouteBridgeSummary(null)
    setRouteCandidates(null)
    setRouteBestWindow(undefined)
    setRouteSlotStatusOverrides(null)
    setSelectedCandidateIdx(null)
    setFromSuggestions([])
    setToSuggestions([])

    try {
      const [origin, destination] = await Promise.all([
        resolveBridgePlace(fromQuery, controller.signal, [fromResolved, ...fromSuggestions]),
        resolveBridgePlace(toQuery, controller.signal, [toResolved, ...toSuggestions]),
      ])
      if (controller.signal.aborted) return

      const res = await fetch('/api/teskeid/weather/travel', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          origin,
          destination,
          trailerKind: 'none',
          thresholdOverrides: {
            cautionWindMs: thresholds.cautionWindMs,
            redWindMs: thresholds.redWindMs,
          },
          ...(departureAt ? { earliestDepartureAt: departureAt } : {}),
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
      if (controller.signal.aborted) return

      const travelResult = data as DeterministicResult
      const extra = data as Record<string, unknown>
      const vedurstofanLayer = isVedurstofanTravelLayer(extra['vedurstofanLayer'])
        ? extra['vedurstofanLayer']
        : undefined
      const vegagerdinLayer = isVegagerdinRouteLayer(extra['vegagerdinLayer'])
        ? extra['vegagerdinLayer']
        : undefined
      const mapData = renderTravelBridgeResult(travelResult, thresholds)
      const vedurstofanRender = renderVedurstofanStations(
        vedurstofanLayer,
        mapData.durationMinutes,
        thresholds,
      )
      const vegagerdinRender = renderVegagerdinStations(vegagerdinLayer)
      const candidates = travelResult.travelPlan?.outbound.candidates ?? null
      const slotStatusOverrides = candidates
        ? buildProviderSlotStatusOverrides({
            candidates,
            thresholds,
            routeDurationMinutes: mapData.durationMinutes,
            vedurstofanLayer,
            vedurstofanStationCount: vedurstofanRender.count,
            vegagerdinStatusCounts: vegagerdinRender.statusCounts,
            vegagerdinStationCount: vegagerdinRender.count,
          })
        : null
      const slotSource = routeSlotStatusSource(
        vegagerdinRender.count,
        vedurstofanRender.count,
      )
      const providerBestWindow =
        candidates && slotStatusOverrides
          ? buildProviderBestWindow(candidates, slotStatusOverrides)
          : undefined
      const providerStatusCounts =
        vegagerdinRender.count > 0 && vedurstofanRender.count > 0
          ? mergeWindDisplayStatusCounts(
              vegagerdinRender.statusCounts,
              vedurstofanRender.statusCounts,
            )
          : vegagerdinRender.count > 0
            ? vegagerdinRender.statusCounts
            : vedurstofanRender.count > 0
              ? vedurstofanRender.statusCounts
              : mapData.statusCounts
      const providerStatus =
        slotStatusOverrides?.[0]
          ? windDisplayStatusToTravelStatus(slotStatusOverrides[0])
          : routeStatusFromCounts(providerStatusCounts)
      const providerAnswer =
        slotSource !== 'fallback'
          ? providerRouteAnswer(providerStatus)
          : travelResult.svar

      // Hide global station markers and place labels — route stations are the focus now
      routeActiveRef.current = true
      vedurstofanLayerRef.current = vedurstofanLayer
      routeDurationMinutesRef.current = mapData.durationMinutes
      routeThresholdsRef.current = thresholds
      const map = mapRef.current
      updateOverviewLayerVisibility(overviewActiveModeRef.current, true)
      for (const { element } of placeMarkersRef.current) {
        element.style.display = 'none'
      }

      setRouteBridgeSummary({
        fromName: origin.name,
        toName: destination.name,
        status: providerStatus,
        distanceKm: mapData.distanceKm,
        durationMinutes: mapData.durationMinutes,
        metnoPointCount: mapData.pointCount,
        answer: providerAnswer,
        statusCounts: providerStatusCounts,
        thresholdsUsed: thresholds,
        vedurstofanStationCount: vedurstofanRender.count,
        vegagerdinStationCount: vegagerdinRender.count,
        slotStatusSource: slotSource,
      })
      setRouteCandidates(candidates)
      setRouteBestWindow(slotStatusOverrides ? providerBestWindow : travelResult.travelPlan?.outbound.bestWindow)
      setRouteSlotStatusOverrides(slotStatusOverrides)
      setSelectedCandidateIdx(null)
      setRouteBridgeStatus('success')
    } catch (err) {
      if (controller.signal.aborted) return
      const code = err instanceof Error ? err.message : 'unknown'
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
            if (routeActiveRef.current) return
            const zoom = map.getZoom()
            for (const { element, place } of placeMarkersRef.current) {
              const isVisible =
                place.importance === 3 ||
                (place.importance === 2 && zoom >= 5.8) ||
                zoom >= 7.2
              element.style.display = isVisible ? 'block' : 'none'
            }
          }

          updateRoadMapPlaceMarkerVisibility()
          map.on('zoom', updateRoadMapPlaceMarkerVisibility)

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
          })

          map.addSource(OVERVIEW_VEGAGERDIN_LAYER_ID, {
            type: 'geojson',
            data: EMPTY_FEATURE_COLLECTION as never,
          })
          map.addLayer({
            id: OVERVIEW_VEGAGERDIN_LAYER_ID,
            type: 'circle',
            source: OVERVIEW_VEGAGERDIN_LAYER_ID,
            paint: {
              'circle-color': TRAVEL_POINT_COLOR_EXPRESSION as unknown as string,
              'circle-radius': 6,
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.9,
            },
          })
          map.addSource(OVERVIEW_VEDURSTOFAN_LAYER_ID, {
            type: 'geojson',
            data: EMPTY_FEATURE_COLLECTION as never,
          })
          map.addLayer({
            id: OVERVIEW_VEDURSTOFAN_LAYER_ID,
            type: 'circle',
            source: OVERVIEW_VEDURSTOFAN_LAYER_ID,
            layout: { visibility: 'none' },
            paint: {
              'circle-color': TRAVEL_POINT_COLOR_EXPRESSION as unknown as string,
              'circle-radius': 6,
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.86,
            },
          })

          for (const layerId of [OVERVIEW_VEGAGERDIN_LAYER_ID, OVERVIEW_VEDURSTOFAN_LAYER_ID] as const) {
            map.on('mouseenter', layerId, () => {
              map.getCanvas().style.cursor = 'pointer'
            })
            map.on('mouseleave', layerId, () => {
              map.getCanvas().style.cursor = ''
            })
          }

          map.on('click', OVERVIEW_VEGAGERDIN_LAYER_ID, (e) => {
            if (!e.features?.length) return
            const feature = e.features[0]
            const coords = (feature.geometry as { type: 'Point'; coordinates: [number, number] })
              .coordinates
            const props = feature.properties as {
              stationName?: string
              gustMs?: number | null
              meanWindMs?: number | null
              airTemperatureC?: number | null
              windDirectionText?: string | null
            }

            const gust = props.gustMs != null ? `${props.gustMs.toFixed(1)} m/s` : '—'
            const mean = props.meanWindMs != null ? `${props.meanWindMs.toFixed(1)} m/s` : '—'
            const temp =
              props.airTemperatureC != null ? `${props.airTemperatureC.toFixed(1)} °C` : '—'
            const dir = props.windDirectionText ?? ''

            const container = document.createElement('div')
            container.style.cssText = 'font-size:12px;line-height:1.5'

            const name = document.createElement('strong')
            name.style.fontSize = '13px'
            name.textContent = props.stationName ?? 'Stöð'
            container.appendChild(name)
            container.appendChild(document.createElement('br'))
            container.appendChild(document.createTextNode(`Vindur: ${mean}${dir ? ' ' + dir : ''}`))
            container.appendChild(document.createElement('br'))
            container.appendChild(document.createTextNode(`Vindhviða: ${gust}`))
            container.appendChild(document.createElement('br'))
            container.appendChild(document.createTextNode(`Lofthiti: ${temp}`))

            popupRef.current?.remove()
            const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '220px' })
              .setLngLat(coords)
              .setDOMContent(container)
              .addTo(map)
            popupRef.current = popup
          })

          map.on('click', OVERVIEW_VEDURSTOFAN_LAYER_ID, (e) => {
            if (!e.features?.length) return
            const feature = e.features[0]
            const coords = (feature.geometry as { type: 'Point'; coordinates: [number, number] })
              .coordinates
            const props = feature.properties as {
              stationName?: string
              windSpeedMs?: number | null
              airTemperatureC?: number | null
              windDirectionText?: string | null
              forecastTimeIso?: string | null
            }

            const wind = props.windSpeedMs != null ? `${props.windSpeedMs.toFixed(1)} m/s` : '—'
            const temp =
              props.airTemperatureC != null ? `${props.airTemperatureC.toFixed(1)} °C` : '—'
            const dir = props.windDirectionText ?? ''
            const time = props.forecastTimeIso ? formatKlTime(props.forecastTimeIso) : null

            const container = document.createElement('div')
            container.style.cssText = 'font-size:12px;line-height:1.5'

            const name = document.createElement('strong')
            name.style.fontSize = '13px'
            name.textContent = props.stationName ?? 'Stöð'
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
            const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '220px' })
              .setLngLat(coords)
              .setDOMContent(container)
              .addTo(map)
            popupRef.current = popup
          })

          if (map.getLayer('travel-bridge-weather-points')) {
            map.moveLayer('travel-bridge-weather-points')
          }
          if (map.getLayer(VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID)) {
            map.moveLayer(VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID)
          }
          if (map.getLayer(VEGAGERDIN_ROUTE_STATIONS_LAYER_ID)) {
            map.moveLayer(VEGAGERDIN_ROUTE_STATIONS_LAYER_ID)
          }
          updateOverviewLayerVisibility()
          if (!cancelled) setMapReady(true)
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
      abortControllerRef(segmentRequestRef)
      abortControllerRef(routeBridgeRequestRef)
      abortControllerRef(fromSuggestAbortRef)
      abortControllerRef(toSuggestAbortRef)
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      placeMarkersRef.current.forEach(({ marker }) => marker.remove())
      placeMarkersRef.current = []
      clearRouteVedurstofanLabelMarkers()
      clearRouteVegagerdinLabelMarkers()
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
  const displayedRouteStatus: DeterministicResult['stada'] =
    selectedCandidateIdx !== null &&
    routeSlotStatusOverrides != null &&
    routeSlotStatusOverrides[selectedCandidateIdx] != null
      ? windDisplayStatusToTravelStatus(routeSlotStatusOverrides[selectedCandidateIdx])
      : (routeBridgeSummary?.status ?? 'graent')
  const displayedRouteAnswer: string =
    routeBridgeSummary == null
      ? ''
      : selectedCandidateIdx !== null &&
          routeSlotStatusOverrides != null &&
          routeSlotStatusOverrides[selectedCandidateIdx] != null &&
          routeBridgeSummary.slotStatusSource !== 'fallback'
        ? providerRouteAnswer(displayedRouteStatus)
        : routeBridgeSummary.answer
  const selectedRouteCandidate =
    selectedCandidateIdx !== null && routeCandidates?.[selectedCandidateIdx]
      ? routeCandidates[selectedCandidateIdx]
      : null
  const displayedRouteSlotLabel =
    routeBridgeSummary == null
      ? ''
      : selectedRouteCandidate
        ? t('roadMapPrototypeViewingDepartureAt', {
            time: formatCompactDateTime(selectedRouteCandidate.departureIso, locale),
          })
        : t('roadMapPrototypeViewingDepartureNow')

  return (
    <div className="absolute inset-0">
      {/* h-full w-full — NOT absolute inset-0 — because MapLibre adds
          .maplibregl-map { position: relative } to this element, which would
          override Tailwind's `absolute` and cause inset-0 to collapse to 0px.
          h-full w-full survives the position override. */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Top-left: 🚗 (route panel) + 💬 (conditions feed) emoji buttons */}
      <div className="absolute left-3 top-3 z-20 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setIsPanelOpen(prev => !prev)}
          aria-label={t('roadMapPrototypeRouteBridgeTitle')}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-background/90 text-lg shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
          style={{ color: routeBridgeSummary ? '#16a34a' : '#9ca3af' }}
        >
          🚗
        </button>
        <button
          type="button"
          onClick={() => {
            setIsChatOpen(prev => {
              const next = !prev
              if (next) acknowledgeCurrentItems()
              return next
            })
          }}
          aria-label={t('conditionsFeedTitle')}
          className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-background/90 text-lg shadow-sm backdrop-blur-sm transition-colors hover:bg-background"
        >
          💬
          {!isChatOpen && newSinceOpenCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-[9px] font-semibold leading-4 text-destructive-foreground">
              {newSinceOpenCount}
            </span>
          )}
        </button>
      </div>

      {isChatOpen && (
        <div className="absolute left-3 top-14 z-30 w-[calc(100%-1.5rem)] max-w-[360px] rounded-xl border border-border/70 bg-background/95 p-2 shadow-lg backdrop-blur-sm">
          <div className="mb-1 flex items-center justify-end">
            <button
              type="button"
              onClick={() => setIsChatOpen(false)}
              className="rounded-full px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t('overlayClose')}
            </button>
          </div>
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
      )}

      {/* Left drawer panel — slides in from left on 🚗 click */}
      <div
        className={`absolute bottom-0 left-0 top-0 z-20 flex w-80 flex-col overflow-hidden border-r border-border/70 bg-background/90 shadow-lg backdrop-blur-sm transition-transform duration-200 ${isPanelOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Panel header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border/50 p-3">
          <button
            type="button"
            onClick={() => setIsPanelOpen(false)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
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
                    className="min-h-7 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                className="mt-2 min-h-8 w-full rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                    <span className="flex h-9 items-center rounded-md border border-border bg-background focus-within:border-primary">
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
                    <span className="flex h-9 items-center rounded-md border border-border bg-background focus-within:border-primary">
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
                  <label className="col-span-2 min-w-0">
                    <span className="mb-0.5 block text-[10px] text-muted-foreground">
                      {t('roadMapPrototypeDepartureLabel')}
                    </span>
                    <input
                      type="datetime-local"
                      value={departureAt}
                      onChange={(e) => setDepartureAt(e.target.value)}
                      className="h-9 w-full rounded-md border border-border bg-background px-2 text-base text-foreground outline-none focus:border-primary"
                    />
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
      </div>

      {/* Layer controls — bottom-left, offset above bottom strip when route is active */}
      <div className="absolute bottom-44 left-3 z-10 flex flex-col items-start gap-1.5">
        {/* Toggle buttons — raster road network and vector condition segments are independent */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleOverlayToggle}
            className="text-[11px] px-2.5 py-1.5 rounded-full border border-border bg-background/90 backdrop-blur-sm text-foreground/80 shadow-sm hover:bg-background transition-colors"
          >
            {showOverlay ? t('roadMapPrototypeHideRoadNetwork') : t('roadMapPrototypeShowRoadNetwork')}
          </button>
          <button
            type="button"
            onClick={handleSegmentsToggle}
            className="text-[11px] px-2.5 py-1.5 rounded-full border border-border bg-background/90 backdrop-blur-sm text-foreground/80 shadow-sm hover:bg-background transition-colors"
          >
            {showSegments
              ? t('roadMapPrototypeHideConditionSegments')
              : t('roadMapPrototypeShowConditionSegments')}
          </button>
        </div>

        {/* Road condition legend */}
        <div className="flex flex-wrap items-center gap-1.5 px-2 py-1 rounded-full bg-background/80 backdrop-blur-sm shadow-sm">
          {ROAD_CONDITION_LEGEND.map(({ color, label }) => (
            <span key={label} className="flex items-center gap-0.5">
              <span
                className="inline-block w-2 h-2 rounded-full border border-white/60 shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-[9px] text-muted-foreground">{label}</span>
            </span>
          ))}
          {segmentCount !== null && (
            <span className="text-[9px] text-muted-foreground ml-0.5">
              {segmentCount === 'loading'
                ? `· ${t('roadMapPrototypeSegmentCountLoading')}`
                : segmentCount === 'error'
                  ? `· ${t('roadMapPrototypeSegmentCountError')}`
                  : `· ${t('roadMapPrototypeSegmentCount', { count: segmentCount })}`}
            </span>
          )}
        </div>

        {/* Overview station count — status colors are explained by the bottom filter pills. */}
        {!routeBridgeSummary && (
          <div className="flex items-center gap-1.5 rounded-full bg-background/80 px-2 py-1 text-[9px] text-muted-foreground shadow-sm backdrop-blur-sm">
            <span>
              {overviewActiveMode === 'now'
                ? t('vegagerdinProviderLabel')
                : t('sourceForecastGroupLabel')}
            </span>
            {stationCount !== null && (
              <span>
                · {t('roadMapPrototypeStationCount', { count: stationCount })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bottom strip — overview source selector or route departure scrubber. */}
      <div className="absolute bottom-0 left-0 right-0 z-10 border-t border-border/50 bg-background/90 pb-5 backdrop-blur-sm">
        {/* Filter mode toggle */}
        <div className="flex items-center gap-2 px-3 pb-1 pt-2">
          <div className="inline-flex min-h-7 overflow-hidden rounded-full border border-border bg-background/80 p-0.5">
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
                {mode === 'simple'
                  ? t('statusFilterModeSimple')
                  : t('statusFilterModeDetailed')}
              </button>
            ))}
          </div>
        </div>

        {routeBridgeSummary ? (
          routeCandidates && routeCandidates.length > 0 ? (
          <div className="px-3">
            <DepartureHeatmap
              candidates={routeCandidates}
              bestWindow={routeBestWindow}
              originName={routeBridgeSummary.fromName}
              selectedIdx={selectedCandidateIdx}
              onSelectIdx={handleSelectCandidateIdx}
              visibleStatuses={visibleRouteStatuses}
              onVisibleStatusesChange={handleRouteStatusFilterChange}
              thresholdsUsed={routeBridgeSummary.thresholdsUsed}
              subtitle={routeScrubberSubtitle(routeBridgeSummary.slotStatusSource)}
              title={null}
              showSelectedDetail={false}
              slotStatusOverrides={routeSlotStatusOverrides ?? undefined}
              mode={routeStatusFilterMode}
              firstSlotLabel={t('roadMapPrototypeScrubberNow')}
            />
          </div>
          ) : (
          <div className="px-3 pb-1">
            <WindStatusFilterPills
              counts={routeBridgeSummary.statusCounts}
              visibleStatuses={visibleRouteStatuses}
              onVisibleStatusesChange={handleRouteStatusFilterChange}
              showAllLabel={t('roadMapPrototypeShowAll')}
              showAllButton
              alwaysShowWithinLimits
              mode={routeStatusFilterMode}
            />
          </div>
          )
        ) : (
          <div className="flex flex-col gap-2 px-3 pb-1">
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
              forecastSlots={displayOverviewForecastSlotStatuses}
              forecastLoading={overviewVedurstofanLoading && !overviewVedurstofanRestricted}
              forecastLoadingLabel={t('sourceLoadingForecast')}
              activeMode={overviewActiveMode}
              onModeChange={handleOverviewModeChange}
              prevLabel={t('sourceTimePrevious')}
              nextLabel={t('sourceTimeNext')}
            />
            <WindStatusFilterPills
              counts={overviewStatusCounts}
              visibleStatuses={overviewVisibleStatuses}
              onVisibleStatusesChange={handleOverviewStatusFilterChange}
              showAllLabel={t('roadMapPrototypeShowAll')}
              showAllButton
              mode={routeStatusFilterMode}
            />
          </div>
        )}
      </div>
    </div>
  )
}
