'use client'

// MapLibre CSS is loaded by route layout (app/auth-mvp/vedrid/road-map-prototype/layout.tsx).
import { type FormEvent, type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowUp, ChevronDown, LocateFixed, Pencil, X } from 'lucide-react'
import { VEGAGERDIN_ATTRIBUTION } from '@/lib/iceland-routes/openDataSources'
import type { RouteOptionEnvelopeV1 } from '@/lib/iceland-routes/routeOptionEnvelope.server'
import { findFreshRouteEnvelope } from '@/lib/iceland-routes/routeEnvelopeClient'
import {
  parseRouteSectionsResponse,
  routeSectionsPresentationHashMatches,
  type RouteSectionsOfficialRoadPortionV1,
  type RouteSectionsReadyResponseV1,
} from '@/lib/iceland-routes/routeSections'
import {
  parseRouteAssessmentScope,
  type RouteAssessmentScope,
} from '@/lib/iceland-routes/routeAssessmentScope'
import type { RouteWeatherCoverage } from '@/lib/iceland-routes/trustedRouteCoverage'
import type { RouteOption } from '@/lib/weather/provider.types'
import type {
  DeterministicResult,
  ForecastDrawerRow,
  ResolvedTravelThresholds,
  RouteAssessmentCompleteness,
  TravelCandidate,
  WeatherStatus,
} from '@/lib/weather/types'
import {
  getMedalEmoji,
  normalizeWeatherChaseVisibleHours,
  type WeatherChaseVisibleHour,
} from '@/lib/weather/chasePreferences'
import type { StationExplorerResponse } from '@/lib/weather/providers/vedurstofanStationExplorer'
import type { VegagerdinCurrentStationDto } from '@/lib/weather/providers/vegagerdinCurrentTypes'
import type { VegagerdinStationDetail } from '@/lib/weather/providers/vegagerdinStationDetailTypes'
import { buildTravelBridgeMapData } from '@/lib/road-intelligence/travelBridgeMapData'
import {
  resolveLiveLocationCameraOffset,
  resolveLiveRouteMapPresentation,
  shouldShowRouteEndpointMarker,
} from '@/lib/road-intelligence/liveRouteMapPresentation'
import {
  buildRouteWindArrowField,
  resolveWindTowardBearingDeg,
} from '@/lib/road-intelligence/routeWindArrowField'
import {
  parsePlaceSearchResults,
  selectBestPlaceForQuery,
  type RoadIntelligencePlaceResult,
} from '@/lib/road-intelligence/placeSearchBridge'
import {
  isCurrentRouteWeatherRequest,
  resolveRouteResultsDisplayState,
  resolveRouteResultsVisibility,
  shouldRecalculateRouteChoice,
} from '@/lib/road-intelligence/routeResultsDisplayState'
import { isAtomicTeskeidCandidateArtifact } from '@/lib/road-intelligence/teskeidCandidateArtifact'
import {
  buildAssessmentTravelRequest,
  resolveAssessmentClientEndpoints,
  type ReadyRouteAssessmentClientPlaces,
} from '@/lib/road-intelligence/routeAssessmentClientFlow'
import {
  ROAD_MAP_PLACES,
  findRoadMapPlaceSuggestions,
  findNearestKnownRoadMapPlace,
  mergePlaceSuggestions,
  type RoadMapPlace,
} from '@/lib/road-intelligence/roadMapPlaces'
import {
  ROAD_SEGMENT_STATUS_COLORS,
} from '@/lib/road-intelligence/vegagerdinSegments'
import {
  VEGAGERDIN_PROVIDER_ROUTE_MAX_DISTANCE_M,
  ROUTE_WEATHER_STATION_CONFIDENCE_DISTANCE_KM,
  matchProviderPointsToRoute,
  maximumRouteDistanceToMatchedStationKm,
  pointToPolylineDistanceM,
  routeMeasurementGaps,
  sliceRoutePolylineByFractions,
  type ProviderRouteMatch,
  type ProviderRoutePoint,
} from '@/lib/weather/providerRouteMatching'
import {
  buildRouteSurfaceBbox,
  summarizeRouteRoadSurface,
  type RouteSurfaceSummary,
} from '@/lib/road-intelligence/vegagerdinRoadSurface'
import { formatCompactDateTime, formatKlTime, formatNum } from './travelAuditMap.helpers'
import {
  resolveThresholds,
  validateResolvedThresholdOrdering,
  windThresholdInputsMatchSaved,
} from '@/lib/weather/thresholds'
import { validateIcelandicCoords } from '@/lib/weather/coords'
import {
  ALL_WIND_DISPLAY_STATUSES,
  DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES,
  WIND_STATUS_META,
  classifyCandidateWindDisplayStatus,
  classifyForecastWindDisplayStatusAt,
  classifyNearestForecastWindDisplayStatusAt,
  classifyPointWindDisplayStatus,
  selectForecastRowAt,
  selectNearestForecastRowAt,
  toSimpleWindDisplayStatus,
  worstWindDisplayStatus,
  weatherStatusToWindDisplayStatus,
  WIND_STATUS_MARKER_COLOR,
  type WindDisplayStatus,
} from '@/lib/weather/windDisplayStatus'
import { resolveRouteForecastEtaMs } from '@/lib/weather/routeForecastTiming'
import type { ForecastTimeScrubberSlot } from '@/components/weather/ForecastTimeScrubber'
import {
  filterForecastSlotsFromToday,
  resolveForecastMapActiveTime,
} from '@/lib/weather/forecastSlotHelpers'
import { resolveMapNotePresentation } from '@/lib/weather/mapNotePresentation'
import { routeOptionLabelMessageKey } from '@/lib/weather/routeOptionLabels'
import { consumeWeatherOverviewProviderFetchGate } from '@/lib/weather/overviewProviderFetch'
import { curatedRouteLabelMessageKey } from '@/lib/weather/curatedRouteLabel'
import { WeatherChaseTimeSelector } from './WeatherChaseTimeSelector'
import { MobileForecastMapNotice } from './MobileForecastMapNotice'
import { WindStatusFilterPills, type WindStatusFilterMode } from './WindStatusFilterPills'
import { DepartureHeatmap } from './DepartureHeatmap'
import {
  DriveJourneyPanel,
  selectAssessmentEndpointForecastRows,
} from './DriveJourneyPanel'
import {
  formatRouteCoverageBoundaryLabel,
  RouteNavigationHandoff,
} from './RouteNavigationHandoff'
import {
  RouteComparisonFullscreenMap,
  RouteComparisonMiniMap,
  routeComparisonColor,
} from './RouteComparisonMiniMap'
import {
  DriveRouteMap,
  DRIVE_MAP_CARTO_ATTRIBUTION,
  DRIVE_MAP_CARTO_TILES,
  DRIVE_MAP_ROAD_NETWORK_TILES,
  DRIVE_MAP_ROUTE_COLOR,
  DRIVE_MAP_SEGMENT_COLOR_EXPRESSION,
  DRIVE_MAP_SEGMENT_WIDTH_EXPRESSION,
} from './DriveRouteMap'
import { LiveLocationControls } from './LiveLocationControls'
import { LiveDriveMapControls } from './LiveDriveMapControls'
import { LiveDriveThresholdFields } from './LiveDriveThresholdFields'
import { VegagerdinStaleNotice } from './VegagerdinStaleNotice'
import { VegagerdinStationDetail as VegagerdinStationDetailPanel } from './VegagerdinStationDetail'
import { MapNotesPanel } from './MapNotesPanel'
import { PlaceSearch } from './PlaceSearch'
import { CurrentLocationPermissionHelp } from './CurrentLocationPermissionHelp'
import {
  WeatherChasePanel,
  addCustomMetnoPreferenceItem,
  preferenceItemFromWeatherChaseItem,
  type WeatherChaseCriteria,
  type WeatherChaseHistoryLoadResult,
  type WeatherChaseItem,
  type WeatherChasePreferenceItem,
  type WeatherChaseSaveStatus,
} from './WeatherChasePanel'
import type {
  WeatherChaseHistoryResponse,
  WeatherChaseHistoryRow,
} from '@/lib/weather/weatherChaseHistory.types'
import { TeskeidLoader } from '@/components/teskeid/TeskeidLoader'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
import { vedurstofanPulseHref, vegagerdinPulseHref } from '@/lib/weather/pulseTarget'
import { haversineDistanceM } from '@/lib/weather/nearestStations'
import type { MapNoteAnchor, MapNoteDto, MapRouteFeedbackContext } from '@/lib/map-notes/contracts'
import {
  freeDriveStationIsVeryStale,
  freeDriveStationFreshness,
  type LiveDriveMode,
} from '@/lib/weather/freeDrive'
import {
  FREE_DRIVE_AGGREGATE_MARKER_OFFSETS,
  FREE_DRIVE_WIND_STATUS_FILTER_MODE,
  createDefaultFreeDriveVisibleWindStatuses,
  freeDriveAggregateStationCountLabel,
  freeDriveAggregateStatus,
  freeDriveShowsIndividualStationMarkers,
  isFreeDriveWindStatusVisible,
  overviewStationClusterKey,
  routeOriginFromLiveLocation,
  type FreeDriveStationDensityLevel,
} from '@/lib/weather/freeDriveMapPresentation'
import {
  LIVE_DRIVE_TEMPERATURE_MAX_C,
  classifyLiveVegagerdinStationWindStatus,
  liveDriveTemperatureValue,
  liveVegagerdinStationFromCurrent,
  liveVegagerdinStationFromRoutePoint,
  type LiveVegagerdinStation,
} from '@/lib/weather/liveVegagerdinStation'
import {
  formatVegagerdinStationCompactTimestamp,
  shouldOpenVegagerdinStationExternally,
  vegagerdinStationUrl,
} from '@/lib/weather/vegagerdinStationPresentation'
import { makeWeatherPlaceKey, type SavedWeatherPlace } from '@/lib/weather/savedPlaces'
import {
  clampLiveLocationFollowZoom,
  LIVE_LOCATION_FOLLOW_ZOOM_DEFAULT,
  LIVE_LOCATION_FOLLOW_ZOOM_MAX,
  LIVE_LOCATION_FOLLOW_ZOOM_MIN,
  LIVE_LOCATION_FOLLOW_ZOOM_STORAGE_KEY,
  nearestEquivalentHeadingDegrees,
  normalizeHeadingDegrees,
  reduceLiveLocationFollowMode,
  resolveLiveLocationCameraBearing,
  shouldPresentLiveLocationPoint,
  watchLiveLocation,
  type LiveLocationErrorCode,
  type LiveLocationFollowMode,
  type LiveLocationOrientationMode,
  type LiveLocationPoint,
} from '@/lib/places/liveLocation.client'
import {
  ROAD_MAP_PROTOTYPE_NAVIGATION,
  buildRoadMapFreeDriveSignInReturnHref,
  buildRoadMapLiveLocationSignInReturnHref,
  buildRoadMapRouteReturnHref,
  buildRoadMapRouteSignInReturnHref,
  buildRoadMapSignInReturnHref,
  buildRoadMapStationReturnHref,
  type RoadMapNavigation,
} from '@/lib/weather/roadMapNavigation'
import type { VedurstofanTravelLayer } from '@/lib/weather/providers/vedurstofanBlend'
import type {
  VegagerdinRouteLayer,
  VegagerdinRouteLayerPoint,
} from '@/lib/road-intelligence/vegagerdinRouteLayer'
import {
  buildProviderSlotAssessments,
  conservativelyCombineWindDisplayStatuses,
  worstWindDisplayStatusFromCounts,
  windDisplayStatusToTravelStatus,
} from '@/lib/road-intelligence/routeSlotStatuses'

// CartoDB Voyager basemap (XYZ tiles, CORS open, no proxy needed).
// LMI_Island_einfalt was too simplified at zoom 6 — can be revisited with a better LMÍ layer.
const STAMEN_TERRAIN_BACKGROUND_TILES = [
  'https://tiles-eu.stadiamaps.com/tiles/stamen_terrain_background/{z}/{x}/{y}@2x.png',
]
const STAMEN_TERRAIN_LINE_TILES = [
  'https://tiles-eu.stadiamaps.com/tiles/stamen_terrain_lines/{z}/{x}/{y}@2x.png',
]
const STAMEN_TERRAIN_ATTRIBUTION =
  '© Stadia Maps | © Stamen Design | © OpenMapTiles'

function collapseMapAttribution(container: HTMLElement | null) {
  const attribution = container?.querySelector('.maplibregl-ctrl-attrib')
  attribution?.classList.remove('maplibregl-compact-show')
  attribution?.removeAttribute('open')
}

// Vegagerðin road network via same-origin allowlisted proxy (CORS not open to browser).
const ICELAND_CENTER: [number, number] = [-18.9, 64.9]
const ICELAND_ZOOM = 6
const DEFAULT_ROUTE_THRESHOLDS = resolveThresholds('none')

function validateRouteThresholdInputs(
  cautionInput: string,
  redInput: string,
): { thresholds: ResolvedTravelThresholds | null; error: 'value' | 'ordering' | null } {
  const caution = Number(cautionInput)
  const red = Number(redInput)
  if (
    !Number.isFinite(caution) ||
    !Number.isFinite(red) ||
    caution <= 0 ||
    red <= 0 ||
    caution > 40 ||
    red > 40
  ) {
    return { thresholds: null, error: 'value' }
  }
  const thresholds = resolveThresholds('none', {
    cautionWindMs: caution,
    redWindMs: red,
  })
  return validateResolvedThresholdOrdering(thresholds)
    ? { thresholds: null, error: 'ordering' }
    : { thresholds, error: null }
}

const WIND_DISPLAY_STATUS_SET = new Set<string>(ALL_WIND_DISPLAY_STATUSES)
const VEGAGERDIN_ROUTE_FALLBACK_MAX_DISTANCE_M = 12_000
const VEGAGERDIN_ROUTE_FALLBACK_MAX_POINTS = 40
const LEGACY_WEATHER_CHASE_LOCAL_STORAGE_KEY = 'teskeid_weather_chase_preferences_v1'
const WEATHER_CHASE_PENDING_STORAGE_KEY = 'teskeid_weather_chase_preferences_pending_v1'
const WEATHER_CHASE_AUTH_PENDING_STORAGE_PREFIX = 'teskeid_weather_chase_auth_pending_v1'
const PUBLIC_WEATHER_CHASE_SESSION_STORAGE_KEY = 'teskeid_weather_chase_public_session_v1'
const PUBLIC_WEATHER_CHASE_SESSION_TTL_MS = 30 * 60 * 1_000
const PUBLIC_WEATHER_CHASE_PROMPT_DELAY_MS = 25 * 60 * 1_000
const ROAD_MAP_ROUTE_RETURN_STORAGE_KEY = 'teskeid_road_map_route_return_v1'
const ROAD_MAP_ROUTE_RETURN_TTL_MS = 2 * 60 * 60 * 1_000
const PUBLIC_SAVED_PLACES_STORAGE_KEY = 'teskeid_public_saved_places_v1'
const PUBLIC_SAVED_PLACES_LIMIT = 50
const LEGACY_FORECAST_CARD_SCALE_LOCAL_STORAGE_KEY = 'teskeid_forecast_card_scale_v1'
const FORECAST_CARD_SCALE_LEVELS = [1, 1.2, 1.4, 1.6] as const
const DEFAULT_WEATHER_CHASE_CRITERIA: WeatherChaseCriteria = {
  minTemperatureC: null,
  maxWindMs: null,
  maxPrecipitationMmPerHour: null,
}

function readPublicSavedPlaces(storage: Storage): SavedWeatherPlace[] {
  try {
    const raw = storage.getItem(PUBLIC_SAVED_PLACES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item): SavedWeatherPlace | null => {
        const name = typeof item.name === 'string' ? item.name.trim() : ''
        const lat = typeof item.lat === 'number' ? item.lat : Number.NaN
        const lon = typeof item.lon === 'number' ? item.lon : Number.NaN
        if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
        const key = makeWeatherPlaceKey(lat, lon)
        return {
          id: `session:${key}`,
          name,
          formattedAddress: typeof item.formattedAddress === 'string' ? item.formattedAddress : '',
          lat,
          lon,
          usageCount: typeof item.usageCount === 'number' ? item.usageCount : 1,
          lastUsedAt: typeof item.lastUsedAt === 'string' ? item.lastUsedAt : new Date(0).toISOString(),
        }
      })
      .filter((item): item is SavedWeatherPlace => item !== null)
      .slice(0, PUBLIC_SAVED_PLACES_LIMIT)
  } catch {
    return []
  }
}

function writePublicSavedPlaces(storage: Storage, places: SavedWeatherPlace[]) {
  storage.setItem(PUBLIC_SAVED_PLACES_STORAGE_KEY, JSON.stringify(places.slice(0, PUBLIC_SAVED_PLACES_LIMIT)))
}
const DEFAULT_WEATHER_CHASE_PREFERENCE_ITEMS = [
  {
    id: 'vedurstofan:6315',
    providerId: 'vedurstofan',
    label: 'Hella',
    lat: 63.8257,
    lon: -20.3654,
  },
  {
    id: 'vedurstofan:1475',
    providerId: 'vedurstofan',
    label: 'Reykjavík',
    lat: 64.1275,
    lon: -21.902,
  },
  {
    id: 'vedurstofan:6015',
    providerId: 'vedurstofan',
    label: 'Vestmannaeyjabær',
    lat: 63.4359,
    lon: -20.2758,
  },
  {
    id: 'metno:egilsstadir',
    providerId: 'metno',
    label: 'Egilsstaðir',
    lat: 65.2674,
    lon: -14.3948,
  },
  {
    id: 'metno:isafjordur',
    providerId: 'metno',
    label: 'Ísafjörður',
    lat: 66.0748,
    lon: -23.125,
  },
] satisfies WeatherChasePreferenceItem[]
const DEFAULT_WEATHER_CHASE_ITEM_IDS = DEFAULT_WEATHER_CHASE_PREFERENCE_ITEMS.map(item => item.id)

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
// Curated prototype catalogue of Iceland's principal glaciers. Areas are
// approximate and are used only for label hierarchy, not as live measurements.
// Sources: Náttúrufræðistofnun, Veðurstofa Íslands and the Icelandic
// Glaciological Society.
const FORECAST_GLACIER_LABELS = [
  { id: 'snaefellsjokull', name: 'Snæfellsjökull', lon: -23.78, lat: 64.80, areaKm2: 11, minZoom: 6.4 },
  { id: 'torfajokull', name: 'Torfajökull', lon: -19.10, lat: 63.92, areaKm2: 15, minZoom: 6.7 },
  { id: 'tindfjallajokull', name: 'Tindfjallajökull', lon: -19.57, lat: 63.78, areaKm2: 19, minZoom: 6.8 },
  { id: 'thrandarjokull', name: 'Þrándarjökull', lon: -14.66, lat: 64.70, areaKm2: 22, minZoom: 6.8 },
  { id: 'eiriksjokull', name: 'Eiríksjökull', lon: -20.40, lat: 64.77, areaKm2: 22, minZoom: 6.7 },
  { id: 'thorisjokull', name: 'Þórisjökull', lon: -20.72, lat: 64.54, areaKm2: 32, minZoom: 6.7 },
  { id: 'tungnafellsjokull', name: 'Tungnafellsjökull', lon: -17.92, lat: 64.73, areaKm2: 48, minZoom: 6.5 },
  { id: 'eyjafjallajokull', name: 'Eyjafjallajökull', lon: -19.62, lat: 63.63, areaKm2: 78, minZoom: 6.3 },
  { id: 'drangajokull', name: 'Drangajökull', lon: -22.17, lat: 66.16, areaKm2: 142, minZoom: 5.8 },
  { id: 'myrdalsjokull', name: 'Mýrdalsjökull', lon: -19.12, lat: 63.67, areaKm2: 560, minZoom: 5.4 },
  { id: 'hofsjokull', name: 'Hofsjökull', lon: -18.82, lat: 64.82, areaKm2: 890, minZoom: 5.2 },
  { id: 'langjokull', name: 'Langjökull', lon: -20.18, lat: 64.67, areaKm2: 900, minZoom: 5.2 },
  { id: 'vatnajokull', name: 'Vatnajökull', lon: -16.78, lat: 64.48, areaKm2: 7_600, minZoom: 4.8 },
] as const
const FORECAST_GLACIER_DETAIL_ZOOM = 7.2
// Curated prototype catalogue of prominent and recognisable mountains around
// Iceland. Elevation is the hierarchy metric; minZoom keeps the country view
// intentionally sparse. A canonical LMÍ dataset can replace this catalogue.
const FORECAST_MOUNTAIN_LABELS = [
  { id: 'eldfell', name: 'Eldfell', lon: -20.25, lat: 63.43, elevationM: 200, minZoom: 6.7 },
  { id: 'reynisfjall', name: 'Reynisfjall', lon: -19.02, lat: 63.42, elevationM: 340, minZoom: 7.0 },
  { id: 'keilir', name: 'Keilir', lon: -22.17, lat: 63.94, elevationM: 379, minZoom: 6.7 },
  { id: 'fagradalsfjall', name: 'Fagradalsfjall', lon: -22.27, lat: 63.89, elevationM: 385, minZoom: 6.5 },
  { id: 'vestrahorn', name: 'Vestrahorn', lon: -14.99, lat: 64.27, elevationM: 454, minZoom: 6.6 },
  { id: 'kirkjufell', name: 'Kirkjufell', lon: -23.31, lat: 64.94, elevationM: 463, minZoom: 6.4 },
  { id: 'bolafjall', name: 'Bolafjall', lon: -23.26, lat: 66.15, elevationM: 636, minZoom: 6.8 },
  { id: 'akrafjall', name: 'Akrafjall', lon: -21.94, lat: 64.32, elevationM: 643, minZoom: 6.0 },
  { id: 'lomagnupur', name: 'Lómagnúpur', lon: -17.52, lat: 63.95, elevationM: 764, minZoom: 6.5 },
  { id: 'maelifell', name: 'Mælifell', lon: -18.93, lat: 63.80, elevationM: 791, minZoom: 6.9 },
  { id: 'hengill', name: 'Hengill', lon: -21.31, lat: 64.09, elevationM: 803, minZoom: 6.5 },
  { id: 'brennisteinsalda', name: 'Brennisteinsalda', lon: -19.10, lat: 63.98, elevationM: 881, minZoom: 7.0 },
  { id: 'esja', name: 'Esja', lon: -21.66, lat: 64.25, elevationM: 914, minZoom: 6.0 },
  { id: 'baula', name: 'Baula', lon: -21.44, lat: 64.86, elevationM: 934, minZoom: 6.7 },
  { id: 'blahnukur', name: 'Bláhnjúkur', lon: -19.07, lat: 63.98, elevationM: 945, minZoom: 7.0 },
  { id: 'kaldbakur-vestfirdir', name: 'Kaldbakur', lon: -23.07, lat: 65.75, elevationM: 998, minZoom: 6.6 },
  { id: 'bulandstindur', name: 'Búlandstindur', lon: -14.35, lat: 64.67, elevationM: 1_069, minZoom: 6.6 },
  { id: 'hraundrangi', name: 'Hraundrangi', lon: -18.66, lat: 65.55, elevationM: 1_075, minZoom: 6.7 },
  { id: 'botnsulur', name: 'Botnsúlur', lon: -21.18, lat: 64.30, elevationM: 1_093, minZoom: 6.8 },
  { id: 'dyrfjoll', name: 'Dyrfjöll', lon: -13.94, lat: 65.53, elevationM: 1_136, minZoom: 6.5 },
  { id: 'sulur', name: 'Súlur', lon: -18.10, lat: 65.57, elevationM: 1_213, minZoom: 6.4 },
  { id: 'hekla', name: 'Hekla', lon: -19.67, lat: 63.99, elevationM: 1_491, minZoom: 6.3 },
  { id: 'kerling', name: 'Kerling', lon: -18.12, lat: 65.49, elevationM: 1_538, minZoom: 6.7 },
  { id: 'herdubreid', name: 'Herðubreið', lon: -16.35, lat: 65.17, elevationM: 1_682, minZoom: 6.4 },
  { id: 'snaefell', name: 'Snæfell', lon: -15.64, lat: 64.80, elevationM: 1_833, minZoom: 6.5 },
  { id: 'kverkfjoll', name: 'Kverkfjöll', lon: -16.72, lat: 64.65, elevationM: 1_936, minZoom: 6.6 },
  { id: 'bardarbunga', name: 'Bárðarbunga', lon: -17.53, lat: 64.64, elevationM: 2_000, minZoom: 6.4 },
  { id: 'hvannadalshnukur', name: 'Hvannadalshnúkur', lon: -16.64, lat: 64.01, elevationM: 2_110, minZoom: 6.2 },
] as const
const FORECAST_MOUNTAIN_DETAIL_ZOOM = 7.5
const EMPTY_FEATURE_COLLECTION = { type: 'FeatureCollection', features: [] } as const
const TRAVEL_METNO_LAYER_ID = 'travel-bridge-weather-points'
const VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID = 'vedurstofan-route-stations'
const VEGAGERDIN_ROUTE_STATIONS_LAYER_ID = 'vegagerdin-route-stations'
const ROUTE_WIND_ARROW_IMAGE_ID = 'teskeid-route-wind-arrow'
const VEGAGERDIN_ROUTE_WIND_ARROWS_SOURCE_ID = 'vegagerdin-route-wind-arrows-source'
const VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID = 'vegagerdin-route-wind-arrows'
const OVERVIEW_VEGAGERDIN_LAYER_ID = 'overview-vegagerdin-stations'
const OVERVIEW_VEDURSTOFAN_LAYER_ID = 'overview-vedurstofan-stations'
const ROUTE_GRAVEL_SECTIONS_SOURCE_ID = 'travel-route-gravel-sections'
const ROUTE_GRAVEL_SECTIONS_LAYER_ID = 'travel-route-gravel-sections-line'
const ROUTE_DIRECTION_SECTIONS_SOURCE_ID = 'travel-route-direction-sections'
const ROUTE_DIRECTION_SECTIONS_LAYER_ID = 'travel-route-direction-sections-line'
const ROUTE_FILTER_LAYER_IDS = [
  TRAVEL_METNO_LAYER_ID,
  VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID,
  VEGAGERDIN_ROUTE_STATIONS_LAYER_ID,
  VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID,
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
  fromAreaName: string
  toAreaName: string
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
  origin: { lat: number; lon: number }
  destination: { lat: number; lon: number }
  weatherCoverage: RouteWeatherCoverage
  assessmentCompleteness: RouteAssessmentCompleteness
  navigationOrigin: RoadIntelligencePlaceResult
  navigationDestination: RoadIntelligencePlaceResult
  navigationOriginName: string
  navigationDestinationName: string
}

function routeAssessmentAreaName(place: RoadIntelligencePlaceResult): string {
  return place.postalLocality?.trim()
    || place.municipality?.trim()
    || place.name.trim()
}

function formatEndpointAccessDistance(distanceM: number, locale: string): string {
  if (distanceM < 1_000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(distanceM)} m`
  }
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(distanceM / 1_000)} km`
}

type RouteSurfaceChoice = {
  identity: string
  routeId: string
  routeIndex: number
  label: string
  description: string
  distanceKm: number
  durationMinutes: number
  surfaceSummary: RouteSurfaceSummary | null
  route: RouteOption
  routeEnvelope: RouteOptionEnvelopeV1 | null
}

type TeskeidCandidateStatus =
  | 'idle'
  | 'loading'
  | 'pending'
  | 'slow'
  | 'ready'
  | 'no_route'
  | 'unavailable'
  | 'envelope_unavailable'
  | 'rate_limited'
type TeskeidCandidateSearchMode = 'quick' | 'extended'

type TeskeidCandidateResult = {
  status: TeskeidCandidateStatus
  choices: RouteSurfaceChoice[]
  assessmentScope: ReadyRouteAssessmentScope | null
  recommendedRouteId: string | null
  cacheable?: false
}

type RouteSectionsUiState =
  | { status: 'idle'; routeIdentity: null; response: null }
  | { status: 'loading' | 'slow' | 'unavailable'; routeIdentity: string; response: null }
  | { status: 'ready'; routeIdentity: string; response: RouteSectionsReadyResponseV1 }

type RouteSectionHighlight = 'gravel' | 'inferred_direction' | null

function routeSectionsGeoJson(portions: readonly RouteSectionsOfficialRoadPortionV1[]) {
  return {
    type: 'FeatureCollection' as const,
    features: portions.map((portion, sectionIndex) => ({
      type: 'Feature' as const,
      properties: {
        sectionIndex,
        startDistanceM: portion.startDistanceM,
        endDistanceM: portion.endDistanceM,
        roadNumber: portion.roadNumber ?? null,
        roadName: portion.roadName ?? null,
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: portion.geometry.map(point => [point.lon, point.lat]),
      },
    })),
  }
}

type TeskeidClientCandidateCacheEntry = {
  expiresAtMs: number
  assessmentScope: ReadyRouteAssessmentScope
  recommendedRouteId: string
  envelopes: RouteOptionEnvelopeV1[]
}

type RouteSectionsCacheEntry = {
  expiresAtMs: number
  response: RouteSectionsReadyResponseV1
}

const ROUTE_SCOPE_RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000] as const
const TESKEID_CLIENT_CANDIDATE_CACHE_MAX_ENTRIES = 16
const TESKEID_CLIENT_CANDIDATE_CACHE_MIN_TTL_MS = 60_000
const ROUTE_SECTIONS_CLIENT_CACHE_MAX_ENTRIES = 8
const ROUTE_SECTIONS_LOADING_BUDGET_MS = 60_000
const ROUTE_SECTIONS_PENDING_RETRY_DELAYS_MS = [1_500, 2_500, 4_000, 6_000, 8_000] as const

function waitForRouteSectionsRetry(delayMs: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false)
  return new Promise(resolve => {
    const finish = (shouldRetry: boolean) => {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', handleAbort)
      resolve(shouldRetry)
    }
    const handleAbort = () => finish(false)
    const timer = window.setTimeout(() => finish(true), delayMs)
    signal.addEventListener('abort', handleAbort, { once: true })
  })
}

function teskeidClientCandidateCacheKey(
  origin: RoadIntelligencePlaceResult,
  destination: RoadIntelligencePlaceResult,
  assessmentScopeId: string | null,
  alternatives: boolean,
  searchMode: TeskeidCandidateSearchMode,
): string {
  return [
    assessmentScopeId ?? 'resolve-scope',
    origin.lat.toFixed(6),
    origin.lon.toFixed(6),
    destination.lat.toFixed(6),
    destination.lon.toFixed(6),
    alternatives ? 'alternatives' : 'single',
    searchMode,
  ].join(':')
}

type RouteLabelAnchor = 'center' | 'top' | 'bottom' | 'left' | 'right'

type RouteLabelPlacement = {
  layout: 'vertical' | 'horizontal'
  anchor: RouteLabelAnchor
  offset: [number, number]
}

type ReadyRouteAssessmentScope = Extract<RouteAssessmentScope, { status: 'ready' }>

type ResolvedRoutePlaces = ReadyRouteAssessmentClientPlaces<
  RoadIntelligencePlaceResult,
  ReadyRouteAssessmentScope
>

function canRequestTeskeidCandidate(places: ResolvedRoutePlaces): boolean {
  const { assessmentScope, assessmentOrigin, assessmentDestination } = places
  return assessmentScope.scopeId.length > 0
    && assessmentOrigin.source === 'official'
    && assessmentDestination.source === 'official'
    && assessmentOrigin.lat === assessmentScope.origin.lat
    && assessmentOrigin.lon === assessmentScope.origin.lon
    && assessmentDestination.lat === assessmentScope.destination.lat
    && assessmentDestination.lon === assessmentScope.destination.lon
}

type RouteHandoffOnlySummary = {
  navigationOrigin: RoadIntelligencePlaceResult
  navigationDestination: RoadIntelligencePlaceResult
  navigationOriginName: string
  navigationDestinationName: string
  assessment: {
    originName: string
    destinationName: string
  } | null
  reason: 'assessment_unavailable' | 'same_area' | 'weather_unavailable'
}

type RouteSurfaceChoiceResult = {
  assessmentScope: RouteAssessmentScope
  choices: RouteSurfaceChoice[]
}

type VegagerdinCurrentApiData =
  | {
      status: 'ok'
      cacheStatus: VegagerdinRouteLayer['cacheStatus']
      measurementFreshness: VegagerdinRouteLayer['measurementFreshness']
      fetchedAtIso: string
      lastAttemptedAtIso?: string | null
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
const ROUTE_WIND_STATUS_FILTER_MODE: WindStatusFilterMode = 'detailed'
const VEGAGERDIN_ROUTE_REFRESH_INTERVAL_MS = 60_000

type RouteLiveLocationStatus = 'idle' | 'waiting' | 'active' | 'error'
type RouteForecastBuildContext = {
  timelineCandidates: TravelCandidate[]
  thresholds: ResolvedTravelThresholds
  routeDurationMinutes: number
  vedurstofanLayer: VedurstofanTravelLayer | undefined
  vedurstofanStationCount: number
  signal: AbortSignal
}

type RouteForecastRetryContext = Readonly<{
  places: ResolvedRoutePlaces
  thresholds: ResolvedTravelThresholds
  selectedRouteId: string | null
  routeEnvelope: RouteOptionEnvelopeV1 | null
}>

export function isRouteForecastBuildCurrent(
  builtContext: object | null,
  activeContext: object | null,
): boolean {
  return builtContext !== null && builtContext === activeContext
}

export function formatRouteReferenceLabel({
  providerLabel,
  providerIndex,
  providerCount,
  routeName,
}: {
  providerLabel: string
  providerIndex: number
  providerCount: number
  routeName?: string | null
}): string {
  const numberedProviderLabel = providerCount > 1
    ? `${providerLabel} ${providerIndex + 1}`
    : providerLabel
  const normalizedRouteName = routeName?.trim()
  return normalizedRouteName &&
    normalizedRouteName !== providerLabel &&
    normalizedRouteName !== numberedProviderLabel
    ? `${numberedProviderLabel} (${normalizedRouteName})`
    : numberedProviderLabel
}

export function PublicWeatherMapCta({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="mb-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {label}
    </a>
  )
}

function getRouteDepartureCandidates(result: DeterministicResult): TravelCandidate[] | null {
  const outbound = result.travelPlan?.outbound
  if (!outbound) return null
  const candidates = outbound.windowMode
    ? outbound.candidates
    : outbound.timelineCandidates ?? outbound.candidates
  return candidates.length > 0 ? candidates : null
}

function getRouteCurrentCandidate(result: DeterministicResult): TravelCandidate | null {
  const outbound = result.travelPlan?.outbound
  return outbound?.leavingAt ?? outbound?.candidates[0] ?? null
}

function readStationMarkerFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readStationMarkerString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function buildRouteTimelineCandidates(
  result: DeterministicResult,
  _durationMinutes: number,
): TravelCandidate[] | null {
  const candidates = getRouteDepartureCandidates(result)
  const currentCandidate = getRouteCurrentCandidate(result)
  if (!candidates || !currentCandidate) return null

  const currentDepartureMs = Date.parse(currentCandidate.departureIso)
  const futureWholeHours = candidates.filter(candidate => {
    const departureMs = Date.parse(candidate.departureIso)
    if (!Number.isFinite(departureMs) || departureMs <= currentDepartureMs) return false
    const departure = new Date(departureMs)
    return departure.getUTCMinutes() === 0
      && departure.getUTCSeconds() === 0
      && departure.getUTCMilliseconds() === 0
  })
  return futureWholeHours.length > 0 ? futureWholeHours : null
}

function countStatusesTotal(counts: Partial<Record<WindDisplayStatus, number>>): number {
  return ALL_WIND_DISPLAY_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0)
}

function countUsableWindStatuses(counts: Partial<Record<WindDisplayStatus, number>>): number {
  return countStatusesTotal(counts) - (counts.no_data ?? 0) - (counts.no_wind_data ?? 0)
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
type RoutePlanningStep = 'idle' | 'destination' | 'origin' | 'thresholds'

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function weatherEmojiFromText(
  text: string | null | undefined,
  precipitationMmPerHour?: number | null,
): string {
  const normalized = text?.trim().toLocaleLowerCase('is') ?? ''
  if (normalized.includes('þrum')) return '🌩️'
  if (normalized.includes('snjó') || normalized.includes('él') || normalized.includes('hríð')) return '🌨️'
  if (normalized.includes('lítils háttar') || normalized.includes('súld') || normalized.includes('skúr')) return '🌦️'
  if (normalized.includes('rign') || normalized.includes('úrkoma')) return '🌧️'
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

function buildWeatherChaseHistoryDrawerRows(
  forecasts: WeatherChaseHistoryRow[],
  thresholds: ResolvedTravelThresholds,
): ForecastDrawerRow[] {
  const rows: ForecastDrawerRow[] = []
  for (const forecast of forecasts) {
    const windMs = forecast.windSpeedMs
    const gustMs = forecast.windGustMs
    const temperatureC = forecast.temperatureC
    const precipitationMmPerHour = forecast.precipitationMmPerHour
    if (![windMs, gustMs, temperatureC, precipitationMmPerHour].every(Number.isFinite)) continue
    const previous = rows.at(-1)
    const metric = (
      value: number,
      previousValue: number | undefined,
      epsilon: number,
      lowerIsBetter: boolean,
    ) => {
      const delta = previousValue === undefined ? undefined : +(value - previousValue).toFixed(2)
      const direction = roadMapForecastDirection(delta, epsilon)
      return { value, delta, direction, tone: roadMapForecastTone(direction, lowerIsBetter) }
    }
    const wind = metric(windMs, previous?.wind.value, 0.5, true)
    const gust = metric(gustMs, previous?.gust.value, 0.5, true)
    rows.push({
      timeIso: forecast.timeIso,
      status: classifyRoadMapForecastStatus(windMs, precipitationMmPerHour, thresholds),
      temperature: metric(temperatureC, previous?.temperature.value, 0.5, false),
      wind,
      gust: { ...gust, severity: 'none' },
      precipitation: metric(
        precipitationMmPerHour,
        previous?.precipitation.value,
        0.1,
        true,
      ),
      windDirectionText: forecast.windDirectionText,
      weatherEmoji: forecast.symbolCode
        ? metnoSymbolToEmoji(forecast.symbolCode)
        : weatherEmojiFromText(forecast.weatherText, precipitationMmPerHour),
    })
  }
  return rows
}

function isWindDisplayStatus(value: unknown): value is WindDisplayStatus {
  return typeof value === 'string' && WIND_DISPLAY_STATUS_SET.has(value)
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

function createDefaultRouteVisibleWindStatuses(): Set<WindDisplayStatus> {
  return new Set(
    ALL_WIND_DISPLAY_STATUSES.filter(
      status => status !== 'no_data' && status !== 'no_wind_data',
    ),
  )
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

function ensureNorthPointingRouteWindArrowImage(
  map: import('maplibre-gl').Map,
): boolean {
  if (map.hasImage(ROUTE_WIND_ARROW_IMAGE_ID)) return true
  if (typeof document === 'undefined') return false

  const size = 48
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return false

  // The image points north/up at 0°. MapLibre rotates it clockwise using the
  // true geographic wind-toward bearing and compensates for camera rotation.
  context.beginPath()
  context.moveTo(size * 0.5, size * 0.06)
  context.lineTo(size * 0.84, size * 0.42)
  context.lineTo(size * 0.64, size * 0.42)
  context.lineTo(size * 0.64, size * 0.92)
  context.lineTo(size * 0.36, size * 0.92)
  context.lineTo(size * 0.36, size * 0.42)
  context.lineTo(size * 0.16, size * 0.42)
  context.closePath()
  context.lineJoin = 'round'
  context.lineWidth = 5
  context.strokeStyle = 'rgba(255,255,255,0.96)'
  // Neutral slate communicates direction without borrowing the green/orange
  // safety semantics used by the station status markers.
  context.fillStyle = '#334155'
  context.stroke()
  context.fill()

  map.addImage(
    ROUTE_WIND_ARROW_IMAGE_ID,
    context.getImageData(0, 0, size, size),
    { pixelRatio: 2 },
  )
  return true
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
    VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID,
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

type ForecastGlacierLabelMarker = {
  marker: import('maplibre-gl').Marker
  element: HTMLDivElement
  glacier: (typeof FORECAST_GLACIER_LABELS)[number]
}

type ForecastMountainLabelMarker = {
  marker: import('maplibre-gl').Marker
  element: HTMLDivElement
  mountain: (typeof FORECAST_MOUNTAIN_LABELS)[number]
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
  kind: 'origin' | 'destination' | 'coverage-start' | 'coverage-end'
}

type OverviewStationMarker = {
  marker: import('maplibre-gl').Marker
  element: HTMLButtonElement
  stationId?: string
  provider: 'vegagerdin' | 'vedurstofan'
  status: WindDisplayStatus
  freeDriveStatus?: WindDisplayStatus
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
  forecastCardScaleIndex?: number
}

type RoutePlaceFallbackSuggestion = {
  field: RouteBridgeField
  originalName: string
  nearbyPlace: RoadIntelligencePlaceResult
  distanceKm: number
}

type OverviewMarkerDensityLevel = FreeDriveStationDensityLevel
type OverviewAggregateRegion = (typeof OVERVIEW_AGGREGATE_REGIONS)[number]

function clearTimerRef(timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  if (timerRef.current) clearTimeout(timerRef.current)
  timerRef.current = null
}

function weatherChaseAuthPendingStorageKey(ownerId: string): string {
  return `${WEATHER_CHASE_AUTH_PENDING_STORAGE_PREFIX}:${ownerId}`
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
    forecastCardScaleIndex:
      typeof input.forecastCardScaleIndex === 'number' &&
      Number.isInteger(input.forecastCardScaleIndex) &&
      input.forecastCardScaleIndex >= 0 &&
      input.forecastCardScaleIndex < FORECAST_CARD_SCALE_LEVELS.length
        ? input.forecastCardScaleIndex
        : 1,
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
 * Optional user GPS is browser-local, opt-in and limited to an authenticated
 * route or free-drive map session. No coordinates are sent or stored.
 * No Supabase writes. No routing advice.
 * The route tools are available to eligible authenticated and public weather
 * users while the server-side Teskeið route-candidate switch remains the
 * emergency gate.
 */
export function RoadMapPrototypeMap({
  isAuthenticated = false,
  preferenceOwnerId = null,
  hasRoadIntelligence,
  teskeidRouteCandidateEnabled,
  navigation = ROAD_MAP_PROTOTYPE_NAVIGATION,
}: {
  isAuthenticated?: boolean
  /** Server-authenticated owner used only to scope unsent local autosave recovery. */
  preferenceOwnerId?: string | null
  /**
   * Controls optional Vegagerðin road-network, condition-segment and surface
   * features. API routes remain the security boundary; this prevents expected
   * denied requests and dead controls when the capability is unavailable.
   *
   * Required — callers must pass an explicit server-derived access result.
   */
  hasRoadIntelligence: boolean
  /** Server-derived exact opt-in for the experimental route candidate. */
  teskeidRouteCandidateEnabled: boolean
  navigation?: RoadMapNavigation
}) {
  const t = useTranslations('teskeid.vedrid.overview')
  const tPlaceSearch = useTranslations('teskeid.vedrid.placeSearch')
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const tPulse = useTranslations('teskeid.vedrid.eltaVedrid')
  const formatDurationMinutes = useCallback((minutes: number): string => {
    const rounded = Math.max(0, Math.round(minutes))
    const hours = Math.floor(rounded / 60)
    const mins = rounded % 60
    if (hours > 0) {
      return t('roadMapPrototypeDurationHoursMinutes', { hours, minutes: mins })
    }
    return t('roadMapPrototypeDurationMinutes', { minutes: rounded })
  }, [t])
  const locale = useLocale()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const setMapContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node
  }, [])
  const mapRef = useRef<import('maplibre-gl').Map | null>(null)
  const mapInitializationReadyRef = useRef(false)
  const popupRef = useRef<import('maplibre-gl').Popup | null>(null)
  const popupConstructorRef = useRef<typeof import('maplibre-gl').Popup | null>(null)
  const markerConstructorRef = useRef<typeof import('maplibre-gl').Marker | null>(null)
  const mapNoteMarkersRef = useRef<import('maplibre-gl').Marker[]>([])
  const mapNoteTriggerElementsRef = useRef<Map<string, HTMLButtonElement>>(new Map())
  const communityTabButtonRef = useRef<HTMLButtonElement | null>(null)
  const selectedCommunityNoteCloseButtonRef = useRef<HTMLButtonElement | null>(null)
  const selectedCommunityNoteReturnFocusRef = useRef<
    { kind: 'map'; noteId: string } | { kind: 'community' } | null
  >(null)
  const pendingCommunityNoteFocusRef = useRef<
    { kind: 'map'; noteId: string } | { kind: 'community' } | null
  >(null)
  const placeMarkersRef = useRef<RoadMapPlaceMarker[]>([])
  const forecastGlacierLabelMarkersRef = useRef<ForecastGlacierLabelMarker[]>([])
  const forecastMountainLabelMarkersRef = useRef<ForecastMountainLabelMarker[]>([])
  const overviewVegagerdinMarkersRef = useRef<OverviewStationMarker[]>([])
  const overviewVedurstofanMarkersRef = useRef<OverviewStationMarker[]>([])
  const weatherChaseMapMarkersRef = useRef<WeatherChaseMapMarker[]>([])
  const routeVedurstofanLabelMarkersRef = useRef<RouteVedurstofanLabelMarker[]>([])
  const routeVedurstofanEntriesRef = useRef<VedurstofanRouteStatusEntry[]>([])
  const routeVegagerdinLabelMarkersRef = useRef<RouteVegagerdinLabelMarker[]>([])
  const routeVegagerdinPointsRef = useRef<VegagerdinRouteLayerPoint[]>([])
  const routeVegagerdinCacheStatusRef = useRef<VegagerdinRouteLayer['cacheStatus']>(null)
  const routeAuditPolylinePointsRef = useRef<Array<{ lat: number; lon: number }>>([])
  const routeEndpointMarkersRef = useRef<RouteEndpointMarker[]>([])
  const routeEndpointMarkersAreCurrentRef = useRef(false)
  const routeBottomStripRef = useRef<HTMLDivElement | null>(null)
  const routeLiveLocationMarkerRef = useRef<import('maplibre-gl').Marker | null>(null)
  const routeLiveLocationPuckDirectionRef = useRef<HTMLDivElement | null>(null)
  const routeLiveLocationPuckVisualAngleRef = useRef<number | null>(null)
  const routeMapCompassDirectionRef = useRef<HTMLSpanElement | null>(null)
  const routeMapCompassVisualAngleRef = useRef<number | null>(null)
  const updateRouteMapCompassDirection = useCallback(() => {
    const map = mapRef.current
    const direction = routeMapCompassDirectionRef.current
    if (!map || !direction) return

    const viewportNorth = normalizeHeadingDegrees(-map.getBearing())
    const visualHeading = nearestEquivalentHeadingDegrees(
      routeMapCompassVisualAngleRef.current,
      viewportNorth,
    )
    routeMapCompassVisualAngleRef.current = visualHeading
    direction.style.transform = `rotate(${visualHeading}deg)`
  }, [])
  const setRouteMapCompassDirection = useCallback((node: HTMLSpanElement | null) => {
    routeMapCompassDirectionRef.current = node
    if (!node) {
      routeMapCompassVisualAngleRef.current = null
      return
    }
    updateRouteMapCompassDirection()
  }, [updateRouteMapCompassDirection])
  const routeLiveLocationStopRef = useRef<(() => void) | null>(null)
  const routeLiveLocationMapListenersCleanupRef = useRef<(() => void) | null>(null)
  const routeLiveLocationPointRef = useRef<LiveLocationPoint | null>(null)
  const routeLiveLocationLastPresentedPointRef = useRef<LiveLocationPoint | null>(null)
  const routeLiveLocationFollowModeRef = useRef<LiveLocationFollowMode>('follow')
  const routeLiveLocationOrientationModeRef = useRef<LiveLocationOrientationMode>('heading-up')
  const routeLiveLocationFollowZoomRef = useRef(LIVE_LOCATION_FOLLOW_ZOOM_DEFAULT)
  const routeLiveMapPresentationActiveRef = useRef(false)
  const applyLiveRouteMapPresentationRef = useRef<(active: boolean) => void>(() => {})
  const overviewDensityFrameRef = useRef<number | null>(null)
  const overviewMarkerReconcileFrameRef = useRef<number | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const showOverlayRef = useRef(hasRoadIntelligence)
  const showSegmentsRef = useRef(hasRoadIntelligence)
  const showForecastStationsRef = useRef(true)
  const showAllForecastGlaciersRef = useRef(false)
  const showAllForecastMountainsRef = useRef(false)
  const visibleRouteStatusesRef = useRef<Set<WindDisplayStatus>>(
    createDefaultRouteVisibleWindStatuses(),
  )
  const routeStatusFilterModeRef = useRef<WindStatusFilterMode>('simple')
  const routeWeatherModeRef = useRef<RouteWeatherMode>('now')
  const routeActiveRef = useRef(false)
  const liveDriveModeRef = useRef<LiveDriveMode>('off')
  const lastMapContextRef = useRef<'weather' | 'route'>('weather')
  // The URL context effect runs after mount. Keep the two overview provider
  // effects from racing it on a direct route entry; they may load later if
  // the user explicitly switches to the weather overview.
  const directRouteEntry = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('context') === 'route'
  const skipInitialVegagerdinOverviewFetchRef = useRef(directRouteEntry)
  const skipInitialVedurstofanOverviewFetchRef = useRef(directRouteEntry)
  const weatherChaseActiveRef = useRef(false)
  const weatherChaseSelectedItemsRef = useRef<WeatherChaseItem[]>([])
  const weatherChaseMetnoRowsCacheRef = useRef<Map<string, ForecastDrawerRow[]>>(new Map())
  const weatherChaseMetnoRowsInFlightRef = useRef<Map<string, Promise<ForecastDrawerRow[]>>>(new Map())
  const weatherChaseAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const weatherChaseAutoSaveRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const weatherChaseAutoSaveQueuedRef = useRef<WeatherChasePreferencesPayload | null>(null)
  const weatherChaseAutoSaveRunningRef = useRef(false)
  const weatherChaseAutoSaveRetryCountRef = useRef(0)
  const flushWeatherChaseAutoSaveRef = useRef<() => void>(() => {})
  const routeContextViewRef = useRef<'information' | 'map'>('information')
  const pendingRouteRestoreViewRef = useRef<'information' | 'map' | null>(null)
  const pendingRouteRestoreSubmitRef = useRef(false)
  const overviewActiveModeRef = useRef<'now' | number>('now')
  const overviewVisibleStatusesRef = useRef<Set<WindDisplayStatus>>(
    new Set(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES),
  )
  const freeDriveVisibleStatusesRef = useRef<Set<WindDisplayStatus>>(
    createDefaultFreeDriveVisibleWindStatuses(),
  )
  const weatherChaseBoundsKeyRef = useRef<string | null>(null)
  const vedurstofanLayerRef = useRef<VedurstofanTravelLayer | undefined>(undefined)
  const routeDurationMinutesRef = useRef<number>(0)
  const routeThresholdsRef = useRef<ResolvedTravelThresholds>(DEFAULT_ROUTE_THRESHOLDS)
  const routeForecastBuildContextRef = useRef<RouteForecastBuildContext | null>(null)
  const builtRouteForecastContextRef = useRef<RouteForecastBuildContext | null>(null)
  const activeRouteFieldRef = useRef<RouteBridgeField>('to')
  const routeFromInputRef = useRef<HTMLInputElement | null>(null)
  const routeToInputRef = useRef<HTMLInputElement | null>(null)
  const selectRoutePlaceRef = useRef<
    (place: RoadIntelligencePlaceResult, target?: RouteBridgeField) => void
  >(() => {})
  const [showForecastStations, setShowForecastStations] = useState(true)
  const [showAllForecastGlaciers, setShowAllForecastGlaciers] = useState(false)
  const [showAllForecastMountains, setShowAllForecastMountains] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [routeFrom, setRouteFrom] = useState('')
  const [routeTo, setRouteTo] = useState('')
  const [routePlanningStep, setRoutePlanningStep] = useState<RoutePlanningStep>('idle')
  const [routeBridgeStatus, setRouteBridgeStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [routeBridgeError, setRouteBridgeError] = useState<string | null>(null)
  const [routePlaceFallbackSuggestion, setRoutePlaceFallbackSuggestion] =
    useState<RoutePlaceFallbackSuggestion | null>(null)
  const [routeBridgeSummary, setRouteBridgeSummary] = useState<RouteBridgeSummary | null>(null)
  const [routeHandoffOnlySummary, setRouteHandoffOnlySummary] = useState<RouteHandoffOnlySummary | null>(null)
  const [routeTravelResult, setRouteTravelResult] = useState<DeterministicResult | null>(null)
  const [routeVedurstofanLayer, setRouteVedurstofanLayer] = useState<VedurstofanTravelLayer | null>(null)
  const [fromSuggestions, setFromSuggestions] = useState<RoadIntelligencePlaceResult[]>([])
  const [toSuggestions, setToSuggestions] = useState<RoadIntelligencePlaceResult[]>([])
  const [fromResolved, setFromResolved] = useState<RoadIntelligencePlaceResult | null>(null)
  const [toResolved, setToResolved] = useState<RoadIntelligencePlaceResult | null>(null)
  const [savedPlaces, setSavedPlaces] = useState<SavedWeatherPlace[]>([])
  const [routeCautionWind, setRouteCautionWind] = useState('')
  const [routeRedWind, setRouteRedWind] = useState('')
  const [routePlanningCautionWind, setRoutePlanningCautionWind] = useState('')
  const [routePlanningRedWind, setRoutePlanningRedWind] = useState('')
  const [savedRouteThresholds, setSavedRouteThresholds] = useState<{ cautionWindMs: number; redWindMs: number } | null>(null)
  const [routeThresholdPreferencesLoaded, setRouteThresholdPreferencesLoaded] = useState(false)
  const [routeThresholdError, setRouteThresholdError] = useState<string | null>(null)
  const [freeDriveSetupOpen, setFreeDriveSetupOpen] = useState(false)
  const [freeDriveThresholdSaveStatus, setFreeDriveThresholdSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const freeDriveThresholdValidation = validateRouteThresholdInputs(
    routeCautionWind,
    routeRedWind,
  )
  const freeDriveThresholdsMatchSaved = windThresholdInputsMatchSaved(
    routeCautionWind,
    routeRedWind,
    savedRouteThresholds,
  )
  const routePlanningThresholdsMatchSaved = windThresholdInputsMatchSaved(
    routePlanningCautionWind,
    routePlanningRedWind,
    savedRouteThresholds,
  )
  const freeDriveThresholdInputsValid = freeDriveThresholdValidation.thresholds !== null
  const freeDriveThresholdValidationMessage = routeThresholdError ?? (
    routeThresholdPreferencesLoaded
    && (routeCautionWind !== '' || routeRedWind !== '')
    && freeDriveThresholdValidation.error === 'ordering'
      ? t('thresholdBarOrderingError')
      : routeThresholdPreferencesLoaded
        && (routeCautionWind !== '' || routeRedWind !== '')
        && freeDriveThresholdValidation.error === 'value'
        ? t('roadMapPrototypeThresholdError')
        : null
  )
  const [routeStatusFilterMode, setRouteStatusFilterMode] = useState<WindStatusFilterMode>('simple')
  const [visibleRouteStatuses, setVisibleRouteStatuses] = useState<Set<WindDisplayStatus>>(
    createDefaultRouteVisibleWindStatuses,
  )
  const [routeWeatherMode, setRouteWeatherMode] = useState<RouteWeatherMode>('now')
  const [routeNowStatusCounts, setRouteNowStatusCounts] = useState<
    Partial<Record<WindDisplayStatus, number>> | null
  >(null)
  const [routeNowMeasuredAtIso, setRouteNowMeasuredAtIso] = useState<string | null>(null)
  const [routeNowMeasurementFreshness, setRouteNowMeasurementFreshness] = useState<
    VegagerdinRouteLayer['measurementFreshness']
  >(null)
  const [routeWindArrowCount, setRouteWindArrowCount] = useState(0)
  const [routeVisibleStatusCounts, setRouteVisibleStatusCounts] = useState<
    Partial<Record<WindDisplayStatus, number>> | null
  >(null)
  const [overviewVisibleStatuses, setOverviewVisibleStatuses] = useState<Set<WindDisplayStatus>>(
    new Set(DEFAULT_OVERVIEW_VISIBLE_WIND_STATUSES),
  )
  const [freeDriveVisibleStatuses, setFreeDriveVisibleStatuses] = useState<Set<WindDisplayStatus>>(
    createDefaultFreeDriveVisibleWindStatuses,
  )
  const [overviewActiveMode, setOverviewActiveMode] = useState<'now' | number>('now')
  // Increments at every UTC midnight to re-filter past-day forecast slots.
  const [dateBoundaryTick, setDateBoundaryTick] = useState(0)
  const [mapVisibleHours, setMapVisibleHours] = useState<WeatherChaseVisibleHour[]>([12])
  const [showMedals, setShowMedals] = useState(false)
  const [overviewVegagerdinData, setOverviewVegagerdinData] = useState<VegagerdinCurrentApiData | null>(null)
  const [selectedVegagerdinStation, setSelectedVegagerdinStation] = useState<VegagerdinCurrentStationDto | null>(null)
  const [selectedVegagerdinDetail, setSelectedVegagerdinDetail] = useState<VegagerdinStationDetail | null>(null)
  const [selectedVegagerdinDetailLoading, setSelectedVegagerdinDetailLoading] = useState(false)
  const selectedVegagerdinOriginRef = useRef<HTMLElement | null>(null)
  const closeVegagerdinStationDetail = useCallback((restoreFocus = true) => {
    setSelectedVegagerdinStation(null)
    setSelectedVegagerdinDetail(null)
    setSelectedVegagerdinDetailLoading(false)
    const origin = selectedVegagerdinOriginRef.current
    selectedVegagerdinOriginRef.current = null
    if (restoreFocus && origin?.isConnected) {
      requestAnimationFrame(() => origin.focus({ preventScroll: true }))
    }
  }, [])
  const overviewVegagerdinDataRef = useRef<VegagerdinCurrentApiData | null>(null)
  const applyRefreshedRouteVegagerdinDataRef = useRef<
    (payload: Extract<VegagerdinCurrentApiData, { status: 'ok' }>) => void
  >(() => {})
  const [overviewVegagerdinLoading, setOverviewVegagerdinLoading] = useState(true)
  const [overviewVegagerdinRestricted, setOverviewVegagerdinRestricted] = useState(false)
  const [overviewVedurstofanData, setOverviewVedurstofanData] = useState<StationExplorerResponse | null>(null)
  const [overviewVedurstofanLoading, setOverviewVedurstofanLoading] = useState(true)
  const [overviewVedurstofanRestricted, setOverviewVedurstofanRestricted] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [overviewMarkerReconcileVersion, setOverviewMarkerReconcileVersion] = useState(0)
  overviewVegagerdinDataRef.current = overviewVegagerdinData
  const [routeCandidates, setRouteCandidates] = useState<TravelCandidate[] | null>(null)
  const [routeForecastBuildStatus, setRouteForecastBuildStatus] = useState<RouteForecastBuildStatus>('idle')
  const [routeForecastRetryPending, setRouteForecastRetryPending] = useState(false)
  const [routeDepartureForecastExpanded, setRouteDepartureForecastExpanded] = useState(false)
  const [routeSurfaceChoices, setRouteSurfaceChoices] = useState<RouteSurfaceChoice[]>([])
  const [routeSurfaceChoicesStatus, setRouteSurfaceChoicesStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [routeSwitchingChoiceId, setRouteSwitchingChoiceId] = useState<string | null>(null)
  const [teskeidCandidateStatus, setTeskeidCandidateStatus] = useState<TeskeidCandidateStatus>('idle')
  const [routeGuestQuotaReached, setRouteGuestQuotaReached] = useState(false)
  const [routeQuotaSignInPending, setRouteQuotaSignInPending] = useState(false)
  const [previewRouteChoiceId, setPreviewRouteChoiceId] = useState<string | null>(null)
  const [routeSectionsState, setRouteSectionsState] = useState<RouteSectionsUiState>({
    status: 'idle',
    routeIdentity: null,
    response: null,
  })
  const [routeSectionHighlight, setRouteSectionHighlight] = useState<RouteSectionHighlight>(null)
  const [routeComparisonFullscreen, setRouteComparisonFullscreen] = useState(false)
  const [routeComparisonOpening, setRouteComparisonOpening] = useState(false)
  const [routeComparisonApplyPending, setRouteComparisonApplyPending] = useState(false)
  const routeComparisonApplyPendingRef = useRef(false)
  const routeComparisonAutoOpenedRunIdRef = useRef<number | null>(null)

  // A discovered route is only a preview. It becomes applied after the user
  // explicitly asks for conditions and /travel succeeds.
  const appliedRouteChoiceId = routeBridgeSummary?.selectedRouteId ?? null
  const selectedRouteChoiceId = previewRouteChoiceId ?? appliedRouteChoiceId
  const selectedRouteHasAppliedWeather = selectedRouteChoiceId !== null
    && selectedRouteChoiceId === appliedRouteChoiceId
  const selectedRouteSectionsChoice = routeSurfaceChoices.find(
    choice => choice.routeId === selectedRouteChoiceId,
  ) ?? null
  const selectedRouteSectionsEnvelope = selectedRouteSectionsChoice?.route.provider === 'teskeid'
    ? selectedRouteSectionsChoice.routeEnvelope
    : null
  const selectedRouteGravelGeometryStatus = selectedRouteSectionsEnvelope
    ? routeSectionsState.routeIdentity === selectedRouteSectionsEnvelope.signature
      ? routeSectionsState.status
      : 'loading'
    : undefined

  useEffect(() => () => {
    routeSectionsRefreshRequestRef.current?.abort()
  }, [selectedRouteSectionsEnvelope?.signature])

  useEffect(() => {
    const envelope = selectedRouteSectionsEnvelope
    setRouteSectionHighlight(null)
    if (!envelope) {
      setRouteSectionsState({ status: 'idle', routeIdentity: null, response: null })
      return
    }

    const routeIdentity = envelope.signature
    const expiresAtMs = Date.parse(envelope.expiresAt)
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      routeSectionsCacheRef.current.delete(routeIdentity)
      setRouteSectionsState({ status: 'unavailable', routeIdentity, response: null })
      return
    }
    const cached = routeSectionsCacheRef.current.get(routeIdentity)
    if (
      cached
      && cached.expiresAtMs > Date.now()
      && cached.response.data.coverage.routeDistanceM === envelope.route.distanceM
    ) {
      routeSectionsCacheRef.current.delete(routeIdentity)
      routeSectionsCacheRef.current.set(routeIdentity, cached)
      setRouteSectionsState({ status: 'ready', routeIdentity, response: cached.response })
      const expiryTimer = window.setTimeout(() => {
        routeSectionsCacheRef.current.delete(routeIdentity)
        setRouteSectionsState(current => (
          current.routeIdentity === routeIdentity
            ? { status: 'unavailable', routeIdentity, response: null }
            : current
        ))
      }, Math.max(0, expiresAtMs - Date.now()))
      return () => window.clearTimeout(expiryTimer)
    }
    if (cached) routeSectionsCacheRef.current.delete(routeIdentity)

    const controller = new AbortController()
    setRouteSectionsState({ status: 'loading', routeIdentity, response: null })
    const loadingDeadlineAtMs = Math.min(
      expiresAtMs,
      Date.now() + ROUTE_SECTIONS_LOADING_BUDGET_MS,
    )
    const slowTimer = window.setTimeout(() => {
      setRouteSectionsState(current => (
        current.routeIdentity === routeIdentity && current.status === 'loading'
          ? { status: 'slow', routeIdentity, response: null }
          : current
      ))
    }, 1_500)
    const expiryTimer = window.setTimeout(() => {
      controller.abort()
      routeSectionsCacheRef.current.delete(routeIdentity)
      setRouteSectionsState(current => (
        current.routeIdentity === routeIdentity
          ? { status: 'unavailable', routeIdentity, response: null }
          : current
      ))
    }, Math.max(0, loadingDeadlineAtMs - Date.now()))

    void (async () => {
      try {
        let pendingAttempt = 0
        while (!controller.signal.aborted && Date.now() < loadingDeadlineAtMs) {
          const response = await fetch('/api/teskeid/weather/travel/route-sections', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({ routeEnvelope: envelope }),
          })
          const payload = await response.json().catch(() => null)
          if (controller.signal.aborted) return
          if (response.status === 202 || payload?.status === 'pending') {
            setRouteSectionsState({ status: 'slow', routeIdentity, response: null })
            const configuredDelay = ROUTE_SECTIONS_PENDING_RETRY_DELAYS_MS[
              Math.min(pendingAttempt, ROUTE_SECTIONS_PENDING_RETRY_DELAYS_MS.length - 1)
            ]
            const remainingMs = loadingDeadlineAtMs - Date.now()
            if (remainingMs <= 0) break
            const shouldRetry = await waitForRouteSectionsRetry(
              Math.min(configuredDelay, remainingMs),
              controller.signal,
            )
            if (!shouldRetry) return
            pendingAttempt += 1
            continue
          }
          const parsed = response.ok
            ? parseRouteSectionsResponse(payload, routeIdentity)
            : null
          const hashMatches = parsed
            ? await routeSectionsPresentationHashMatches(parsed).catch(() => false)
            : false
          if (controller.signal.aborted) return
          if (
            !parsed
            || !hashMatches
            || parsed.data.coverage.routeDistanceM !== envelope.route.distanceM
          ) {
            setRouteSectionsState({ status: 'unavailable', routeIdentity, response: null })
            return
          }
          routeSectionsCacheRef.current.delete(routeIdentity)
          routeSectionsCacheRef.current.set(routeIdentity, {
            expiresAtMs,
            response: parsed,
          })
          while (routeSectionsCacheRef.current.size > ROUTE_SECTIONS_CLIENT_CACHE_MAX_ENTRIES) {
            const oldestKey = routeSectionsCacheRef.current.keys().next().value
            if (typeof oldestKey !== 'string') break
            routeSectionsCacheRef.current.delete(oldestKey)
          }
          setRouteSectionsState({ status: 'ready', routeIdentity, response: parsed })
          return
        }
        if (!controller.signal.aborted) {
          setRouteSectionsState({ status: 'unavailable', routeIdentity, response: null })
        }
      } catch {
        if (!controller.signal.aborted) {
          setRouteSectionsState({ status: 'unavailable', routeIdentity, response: null })
        }
      } finally {
        window.clearTimeout(slowTimer)
      }
    })()

    return () => {
      window.clearTimeout(slowTimer)
      window.clearTimeout(expiryTimer)
      controller.abort()
    }
  }, [selectedRouteSectionsEnvelope])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !map.isStyleLoaded()) return
    const readyResponse = routeSectionsState.status === 'ready'
      && selectedRouteSectionsEnvelope?.signature === routeSectionsState.routeIdentity
      ? routeSectionsState.response
      : null
    const gravelSections = readyResponse?.data.surface.gravelSections ?? []
    const inferredSections = readyResponse?.data.direction.status === 'verified'
      ? readyResponse.data.direction.inferredSections
      : []

    const updateLayer = ({
      sourceId,
      layerId,
      sections,
      color,
      dashArray,
      highlighted,
      dimmed,
    }: {
      sourceId: string
      layerId: string
      sections: readonly RouteSectionsOfficialRoadPortionV1[]
      color: string
      dashArray: number[]
      highlighted: boolean
      dimmed: boolean
    }) => {
      const data = routeSectionsGeoJson(sections)
      const source = map.getSource(sourceId) as import('maplibre-gl').GeoJSONSource | undefined
      if (source) source.setData(data as never)
      else map.addSource(sourceId, { type: 'geojson', data: data as never })
      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': color,
            'line-width': highlighted ? 8 : 6,
            'line-opacity': dimmed ? 0.28 : 0.96,
            'line-dasharray': dashArray,
          },
        })
      } else {
        map.setPaintProperty(layerId, 'line-width', highlighted ? 8 : 6)
        map.setPaintProperty(layerId, 'line-opacity', dimmed ? 0.28 : 0.96)
      }
      map.setLayoutProperty(
        layerId,
        'visibility',
        sections.length > 0 && lastMapContextRef.current === 'route' ? 'visible' : 'none',
      )
    }

    updateLayer({
      sourceId: ROUTE_GRAVEL_SECTIONS_SOURCE_ID,
      layerId: ROUTE_GRAVEL_SECTIONS_LAYER_ID,
      sections: gravelSections,
      color: '#d97706',
      dashArray: [1.2, 1.5],
      highlighted: routeSectionHighlight === 'gravel',
      dimmed: routeSectionHighlight === 'inferred_direction',
    })
    updateLayer({
      sourceId: ROUTE_DIRECTION_SECTIONS_SOURCE_ID,
      layerId: ROUTE_DIRECTION_SECTIONS_LAYER_ID,
      sections: inferredSections,
      color: '#7e22ce',
      dashArray: [0.4, 1.4],
      highlighted: routeSectionHighlight === 'inferred_direction',
      dimmed: routeSectionHighlight === 'gravel',
    })
  }, [mapReady, routeSectionHighlight, routeSectionsState, selectedRouteSectionsEnvelope])

  const routeWeatherEvidence = useMemo(() => {
    if (overviewVegagerdinData?.status !== 'ok' || routeSurfaceChoices.length < 1) return []
    const thresholds = routeBridgeSummary?.thresholdsUsed ?? DEFAULT_ROUTE_THRESHOLDS
    const severity: Record<WindDisplayStatus, number> = {
      'innan-marka': 0,
      'nalgast-othaegindi': 1,
      'othaegilegt': 2,
      'nalgast-haettumork': 3,
      'haettulegt': 4,
      'no_data': 5,
      'no_wind_data': 5,
    }
    const stations = overviewVegagerdinData.stations.map(station => ({
      id: station.stationId,
      lat: station.lat,
      lon: station.lon,
      station,
    }))
    return routeSurfaceChoices.map(choice => {
      const routePolyline = choice.route.providerMatchingPoints?.length
        ? choice.route.providerMatchingPoints
        : choice.route.points
      const matches = matchProviderPointsToRoute({
        points: stations,
        routePolyline,
        maxDistanceM: VEGAGERDIN_PROVIDER_ROUTE_MAX_DISTANCE_M,
      })
      const usableMatches = matches
        .map(match => ({
          match,
          status: classifyLiveVegagerdinStationWindStatus(match.point.station, thresholds),
        }))
        .filter(({ status }) => status !== 'no_data' && status !== 'no_wind_data')
      const values = usableMatches.map(({ status }) => severity[status])
      const usableRouteFractions = usableMatches.map(({ match }) => match.routeFraction)
      return {
        routeId: choice.routeId,
        score: values.length > 0
          ? Math.max(...values) * 1_000 + values.reduce((sum, value) => sum + value, 0)
          : null,
        stationIds: usableMatches.map(({ match }) => match.point.id),
        usableStationCount: usableMatches.length,
        maximumStationDistanceKm: maximumRouteDistanceToMatchedStationKm(
          choice.distanceKm,
          usableRouteFractions,
        ),
        measurementGaps: routeMeasurementGaps(choice.distanceKm, usableRouteFractions),
      }
    })
  }, [overviewVegagerdinData, routeBridgeSummary?.thresholdsUsed, routeSurfaceChoices])

  const weatherCoverageConcernRouteIds = useMemo(() => new Set(
    routeWeatherEvidence
      .filter(evidence =>
        evidence.usableStationCount === 0 ||
        (evidence.maximumStationDistanceKm ?? 0) > ROUTE_WEATHER_STATION_CONFIDENCE_DISTANCE_KM,
      )
      .map(evidence => evidence.routeId),
  ), [routeWeatherEvidence])

  // Route-card station matches are useful coverage diagnostics, but they are
  // not a complete, server-attested assessment for every candidate. Do not
  // rank routes or award a "best weather" badge from a partial subset.
  const bestWeatherRouteIds = useMemo(() => new Set<string>(), [])

  const routeComparisonItems = useMemo(() => {
    const weatherEvidenceByRouteId = new Map(routeWeatherEvidence.map(evidence => [evidence.routeId, evidence]))
    const durationOrder = [...routeSurfaceChoices].sort((a, b) => a.durationMinutes - b.durationMinutes)
    return routeSurfaceChoices.map((choice, index) => {
      const sameProvider = routeSurfaceChoices.filter(route => route.route.provider === choice.route.provider)
      const providerNumber = sameProvider.findIndex(route => route.routeId === choice.routeId) + 1
      const baseLabel = choice.route.provider === 'teskeid'
        ? t('roadMapPrototypeTeskeidRouteLabel')
        : t('roadMapPrototypeGoogleRouteLabel')
      const translatedDetail = choice.route.labels.flatMap(label => {
        if (label === 'CURATED_VIA_HOLMAVIK' && choice.route.provider !== 'teskeid') return []
        const key = routeOptionLabelMessageKey(label)
        return key ? [t(key)] : []
      }).join(' · ')
      const experimentalSurface = choice.route.experimental?.surface
      const uncertainSurfaceM = experimentalSurface
        ? experimentalSurface.mixedM + experimentalSurface.unknownM
        : 0
      const surfaceTotalM = experimentalSurface
        ? experimentalSurface.pavedM + experimentalSurface.gravelM + uncertainSurfaceM
        : 0
      const durationRank = durationOrder.findIndex(route => route.routeId === choice.routeId) + 1
      const usesTeskeidRouteIntelligence = choice.route.provider === 'teskeid'
      const isCautionRoute = usesTeskeidRouteIntelligence
        && (choice.route.cautions?.length ?? 0) > 0
      const routeCautionDetails = usesTeskeidRouteIntelligence
        ? choice.route.cautions?.flatMap(caution => caution.summaryKey
          ? [{
              id: caution.id,
              text: tf(caution.summaryKey as Parameters<typeof tf>[0]),
            }]
          : []) ?? []
        : []
      const gravelKm = (experimentalSurface?.gravelM ?? 0) / 1000
      const unknownSurfaceKm = uncertainSurfaceM / 1000
      const mountainRoadM = choice.route.experimental?.fRoad?.distanceM ?? 0
      const isMountainRoad = mountainRoadM > 0
      const weatherEvidence = weatherEvidenceByRouteId.get(choice.routeId)
      const hasNoUsableWeatherStations = weatherEvidence?.usableStationCount === 0
      const hasWeatherCoverageConcern = weatherCoverageConcernRouteIds.has(choice.routeId)
      const weatherCoverageGapKm = weatherEvidence?.measurementGaps.reduce(
        (sum, gap) => sum + gap.distanceKm,
        0,
      ) ?? 0
      const weatherCoverageDetail = hasWeatherCoverageConcern
        ? {
            id: 'weather-station-coverage',
            text: hasNoUsableWeatherStations
              ? t('roadMapPrototypeRouteWeatherCoverageNoneDetail')
              : t('roadMapPrototypeRouteWeatherCoverageDistanceDetail', {
                  distance: formatNum(weatherCoverageGapKm, locale),
                }),
          }
        : null
      const cautionDetails = [
        ...routeCautionDetails,
        ...(weatherCoverageDetail ? [weatherCoverageDetail] : []),
      ]
      const routeSections = routeSectionsState.status === 'ready'
        && choice.routeEnvelope?.signature === routeSectionsState.routeIdentity
        ? routeSectionsState.response.data
        : null
      const routePolyline = choice.route.providerMatchingPoints?.length
        ? choice.route.providerMatchingPoints
        : choice.route.points
      const sectionOverlays = [
        ...(routeSections
          ? [
              ...routeSections.surface.gravelSections.map((section, sectionIndex) => ({
                id: `gravel-${sectionIndex}`,
                kind: 'gravel' as const,
                label: t('roadMapPrototypeRouteGravelLegend'),
                points: section.geometry.map(point => ({ lat: point.lat, lon: point.lon })),
              })),
              ...(routeSections.direction.status === 'verified'
                ? routeSections.direction.inferredSections.map((section, sectionIndex) => ({
                    id: `direction-${sectionIndex}`,
                    kind: 'inferred_direction' as const,
                    label: t('roadMapPrototypeRouteDirectionLegend'),
                    points: section.geometry.map(point => ({ lat: point.lat, lon: point.lon })),
                  }))
                : []),
            ].filter(section => routeSectionHighlight === null || section.kind === routeSectionHighlight)
          : []),
        ...(weatherEvidence?.measurementGaps ?? []).flatMap((gap, gapIndex) => {
          const points = sliceRoutePolylineByFractions(
            routePolyline,
            gap.startFraction,
            gap.endFraction,
          )
          return points.length >= 2
            ? [{
                id: `weather-coverage-gap-${gapIndex}`,
                kind: 'weather_coverage_gap' as const,
                label: t('roadMapPrototypeRouteWindCoverageGapLegend'),
                points,
                distanceKm: gap.distanceKm,
              }]
            : []
        }),
      ]
      const pavedTeskeidChoices = routeSurfaceChoices
        .filter(route => route.route.provider === 'teskeid')
        .filter(route => (route.route.cautions?.length ?? 0) === 0)
        .filter(route => (route.route.experimental?.surface.gravelM ?? 0) === 0)
        .filter(route => (route.route.experimental?.fRoad?.distanceM ?? 0) === 0)
        .sort((a, b) => a.distanceKm - b.distanceKm)
      const pavedTeskeidRank = pavedTeskeidChoices.findIndex(route => route.routeId === choice.routeId)
      const curatedLabelKey = curatedRouteLabelMessageKey(
        choice.route.labels,
        choice.route.cautions?.map(caution => caution.id),
      )
      const teskeidDisplayLabel = curatedLabelKey
        ? tf(curatedLabelKey)
        : choice.route.cautions?.some(caution => caution.id === 'oxi-axarvegur-939')
          ? t('roadMapPrototypeTeskeidRouteNameOxi')
        : isMountainRoad
          ? t('roadMapPrototypeRouteMountainRoad')
        : isCautionRoute
          ? t('roadMapPrototypeTeskeidRouteNameCaution')
          : gravelKm > 0
            ? t('roadMapPrototypeTeskeidRouteNameGravel')
            : pavedTeskeidRank <= 0
              ? t('roadMapPrototypeTeskeidRouteNamePaved')
              : t('roadMapPrototypeTeskeidRouteNameLongerPaved')
      return {
        id: choice.routeId,
        label: choice.route.provider === 'teskeid'
          ? teskeidDisplayLabel
          : sameProvider.length > 1 ? `${baseLabel} ${providerNumber}` : baseLabel,
        // Teskeið's experimental/derived/surface/long-snap labels are useful
        // diagnostics but read like a trust warning when concatenated in the
        // route card. The compact facts and badges below carry the user-facing
        // information. Keep human provider descriptions for non-Teskeið routes.
        detail: choice.route.provider === 'teskeid'
          ? undefined
          : choice.route.description?.trim()
            || translatedDetail
            || (choice.label !== baseLabel ? choice.label : undefined),
        meta: `${formatNum(choice.distanceKm, locale)} km`,
        durationLabel: t('roadMapPrototypeRouteDurationRank', {
          duration: formatDurationMinutes(choice.durationMinutes),
          rank: durationRank,
          total: routeSurfaceChoices.length,
        }),
        durationMinutes: choice.durationMinutes,
        distanceKm: choice.distanceKm,
        weatherScore: null,
        originalIndex: index,
        caution: isCautionRoute,
        gravelKm,
        unknownSurfaceKm,
        mountainRoad: isMountainRoad,
        weatherCoverageConcern: hasWeatherCoverageConcern,
        notice: choice.route.provider === 'teskeid'
          ? t('roadMapPrototypeTeskeidSystemInProgress')
          : undefined,
        cautionDrawerLabel: routeCautionDetails.length > 0
          ? t('roadMapPrototypeRouteCautionWhy')
          : hasWeatherCoverageConcern
            ? t('roadMapPrototypeRouteWeatherCoverageWhy')
            : undefined,
        cautionVehicleNote: routeCautionDetails.length > 0
          ? tf('routeCautionTrailerDetail')
          : undefined,
        cautionDetails,
        provider: choice.route.provider,
        points: routePolyline,
        selected: choice.routeId === selectedRouteChoiceId,
        color: routeComparisonColor(index),
        badges: [
          ...[...new Set(usesTeskeidRouteIntelligence
            ? choice.route.cautions?.map(caution =>
                tf(caution.labelKey as Parameters<typeof tf>[0]),
              ) ?? []
            : [])].map(label => ({ label, tone: 'warning' as const })),
          ...((experimentalSurface?.gravelM ?? 0) > 0
            ? [{
                label: t('roadMapPrototypeRouteGravelMetric', {
                  distance: formatNum((experimentalSurface?.gravelM ?? 0) / 1000, locale),
                }),
                tone: 'warning' as const,
              }]
            : []),
          ...(uncertainSurfaceM > 0
            ? [{
                label: t('roadMapPrototypeRouteUnknownSurfaceMetric', {
                  distance: formatNum(uncertainSurfaceM / 1000, locale),
                }),
                tone: 'warning' as const,
              }]
            : []),
          ...(bestWeatherRouteIds.has(choice.routeId)
            ? [{ label: t('roadMapPrototypeRouteBestWeatherNow'), tone: 'positive' as const }]
            : []),
          ...(hasWeatherCoverageConcern
            ? [{ label: t('roadMapPrototypeRouteWeatherCoverageBadge'), tone: 'warning' as const }]
            : []),
          ...(isMountainRoad
            ? [{
                label: t('roadMapPrototypeRouteMountainRoadMetric', {
                  distance: formatNum(mountainRoadM / 1000, locale),
                }),
                tone: 'warning' as const,
              }]
            : []),
        ],
        surfaceSegments: experimentalSurface && surfaceTotalM > 0
          ? [
              { tone: 'paved' as const, percent: experimentalSurface.pavedM / surfaceTotalM * 100 },
              { tone: 'gravel' as const, percent: experimentalSurface.gravelM / surfaceTotalM * 100 },
              { tone: 'unknown' as const, percent: uncertainSurfaceM / surfaceTotalM * 100 },
            ]
          : undefined,
        surfaceLabel: experimentalSurface
          ? t('roadMapPrototypeSurfaceBreakdown', {
              paved: formatNum(experimentalSurface.pavedM / 1000, locale),
              gravel: formatNum(experimentalSurface.gravelM / 1000, locale),
              uncertain: formatNum(uncertainSurfaceM / 1000, locale),
            })
          : undefined,
        sectionOverlays: sectionOverlays.length > 0 ? sectionOverlays : undefined,
      }
    })
  }, [bestWeatherRouteIds, formatDurationMinutes, locale, routeSectionHighlight, routeSectionsState, routeSurfaceChoices, routeWeatherEvidence, selectedRouteChoiceId, t, tf, weatherCoverageConcernRouteIds])
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
  const [weatherChasePlacesChanged, setWeatherChasePlacesChanged] = useState(false)
  const [weatherChasePreferencesHydrated, setWeatherChasePreferencesHydrated] = useState(false)
  const [weatherChaseSelectionInitialized, setWeatherChaseSelectionInitialized] = useState(false)
  const [publicSavePromptOpen, setPublicSavePromptOpen] = useState(false)
  const [publicSavePromptDueAt, setPublicSavePromptDueAt] = useState<number | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const isChatOpenRef = useRef(false)
  isChatOpenRef.current = isChatOpen
  const [communitySheetCollapsed, setCommunitySheetCollapsed] = useState(false)
  const [communitySheetExpanded, setCommunitySheetExpanded] = useState(false)
  const [communityFitRequestId, setCommunityFitRequestId] = useState(0)
  const [mapNoteAnchor, setMapNoteAnchor] = useState<MapNoteAnchor | null>(null)
  const [communityMapNotes, setCommunityMapNotes] = useState<MapNoteDto[]>([])
  const [communityMapNotesLoading, setCommunityMapNotesLoading] = useState(true)
  const [selectedCommunityNoteId, setSelectedCommunityNoteId] = useState<string | null>(null)
  const openCommunityNoteDetail = useCallback((noteId: string, origin: 'map' | 'community') => {
    selectedCommunityNoteReturnFocusRef.current = origin === 'map'
      ? { kind: 'map', noteId }
      : { kind: 'community' }
    setSelectedCommunityNoteId(noteId)
  }, [])
  const closeCommunityNoteDetail = useCallback(() => {
    pendingCommunityNoteFocusRef.current = selectedCommunityNoteReturnFocusRef.current
    selectedCommunityNoteReturnFocusRef.current = null
    setSelectedCommunityNoteId(null)
  }, [])
  const dismissCommunityNoteDetail = useCallback(() => {
    selectedCommunityNoteReturnFocusRef.current = null
    pendingCommunityNoteFocusRef.current = null
    setSelectedCommunityNoteId(null)
  }, [])
  const [routeFeedbackContext, setRouteFeedbackContext] = useState<MapRouteFeedbackContext | null>(null)
  const [routeFeedbackRequestId, setRouteFeedbackRequestId] = useState(0)
  const handleCommunityItemsChange = useCallback((items: MapNoteDto[]) => {
    setCommunityMapNotes(items)
    setCommunityMapNotesLoading(false)
  }, [])
  const [lastMapContext, setLastMapContext] = useState<'weather' | 'route'>('weather')
  const [weatherContextView, setWeatherContextView] = useState<'information' | 'map'>('information')
  const [routeContextView, setRouteContextView] = useState<'information' | 'map'>('information')
  const [isRouteMapSettingsCollapsed, setIsRouteMapSettingsCollapsed] = useState(false)
  const [forecastCardScaleIndex, setForecastCardScaleIndex] = useState(1)
  const [forecastCardScaleChanged, setForecastCardScaleChanged] = useState(false)
  const [forecastCardGuideOpen, setForecastCardGuideOpen] = useState(true)
  const [hiddenForecastCardCount, setHiddenForecastCardCount] = useState(0)
  const [routeActive, setRouteActive] = useState(false)
  const [liveDriveMode, setLiveDriveMode] = useState<LiveDriveMode>('off')
  const [freeDrivePaused, setFreeDrivePaused] = useState(false)
  const [freeDriveWithoutLocation, setFreeDriveWithoutLocation] = useState(false)
  const [freeDriveStationFeedError, setFreeDriveStationFeedError] = useState(false)
  const [routeLiveLocationStatus, setRouteLiveLocationStatus] = useState<RouteLiveLocationStatus>('idle')
  const [routeLiveLocationPoint, setRouteLiveLocationPoint] = useState<LiveLocationPoint | null>(null)
  const [routeLiveLocationError, setRouteLiveLocationError] = useState<LiveLocationErrorCode | null>(null)
  const [routeLiveLocationFollowMode, setRouteLiveLocationFollowMode] = useState<LiveLocationFollowMode>('follow')
  const [routeLiveLocationFollowZoom, setRouteLiveLocationFollowZoom] = useState(
    LIVE_LOCATION_FOLLOW_ZOOM_DEFAULT,
  )
  const [routeVegagerdinLastRefreshIso, setRouteVegagerdinLastRefreshIso] = useState<string | null>(null)
  const segmentRequestRef = useRef<AbortController | null>(null)
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const routeBridgeRequestRef = useRef<AbortController | null>(null)
  const routeDiscoveryRequestRef = useRef<AbortController | null>(null)
  const teskeidClientCandidateCacheRef = useRef(new Map<string, TeskeidClientCandidateCacheEntry>())
  const routeSectionsCacheRef = useRef(new Map<string, RouteSectionsCacheEntry>())
  const routeSectionsRefreshRequestRef = useRef<AbortController | null>(null)
  const routeBridgeRunIdRef = useRef(0)
  const formRef = useRef<HTMLFormElement | null>(null)
  const routePanelScrollRef = useRef<HTMLDivElement | null>(null)
  const weatherResultsRef = useRef<HTMLDivElement | null>(null)
  const pendingWeatherResultsFocusRunIdRef = useRef<number | null>(null)
  const resolvedRoutePlacesRef = useRef<ResolvedRoutePlaces | null>(null)
  const routeForecastRetryContextRef = useRef<RouteForecastRetryContext | null>(null)
  const stopRouteLiveLocation = useCallback((resetState = true) => {
    routeLiveLocationStopRef.current?.()
    routeLiveLocationStopRef.current = null
    routeLiveLocationMapListenersCleanupRef.current?.()
    routeLiveLocationMapListenersCleanupRef.current = null
    routeLiveLocationMarkerRef.current?.remove()
    routeLiveLocationMarkerRef.current = null
    routeLiveLocationPuckDirectionRef.current = null
    routeLiveLocationPuckVisualAngleRef.current = null
    routeLiveLocationPointRef.current = null
    routeLiveLocationLastPresentedPointRef.current = null
    routeLiveLocationFollowModeRef.current = 'follow'
    routeLiveLocationOrientationModeRef.current = 'heading-up'
    applyLiveRouteMapPresentationRef.current(false)
    if (resetState) {
      setRouteLiveLocationPoint(null)
      setRouteLiveLocationError(null)
      setRouteLiveLocationStatus('idle')
      setRouteLiveLocationFollowMode('follow')
    }
  }, [])
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

  // Scheduler: increment dateBoundaryTick at every UTC midnight to re-filter past-day slots.
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    function scheduleNext() {
      const now = Date.now()
      const d = new Date(now)
      const nextMidnightMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
      timeoutId = setTimeout(() => {
        setDateBoundaryTick(tick => tick + 1)
        scheduleNext()
      }, nextMidnightMs - now)
    }

    scheduleNext()
    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId)
    }
  }, [])

  const overviewForecastSlots = useMemo<number[]>(() => {
    if (!overviewVedurstofanData) return []
    const timeSet = new Set<number>()
    for (const station of overviewVedurstofanData.stations) {
      for (const forecast of station.forecasts) {
        const timeMs = Date.parse(forecast.ftimeIso)
        if (Number.isFinite(timeMs)) timeSet.add(timeMs)
      }
    }
    return filterForecastSlotsFromToday(
      Array.from(timeSet, timeMs => ({ timeMs })),
      Date.now(),
    )
      .map(slot => slot.timeMs)
      .sort((a, b) => a - b)
    // dateBoundaryTick listed to re-run at midnight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overviewVedurstofanData, dateBoundaryTick])

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
    const availableItems = [...weatherChaseVedurstofanItems, ...weatherChaseMetnoItems]
    const availableIds = new Set(availableItems.map(item => item.id))
    const preferencePlaceholders =
      weatherChasePreferenceItems && weatherChasePreferenceItems.length > 0
        ? weatherChasePreferenceItems
        : DEFAULT_WEATHER_CHASE_PREFERENCE_ITEMS
    const savedPlaceholders = preferencePlaceholders
      .filter(item => !availableIds.has(item.id))
      .map((item): WeatherChaseItem => ({
        id: item.id,
        label: item.label,
        providerId: item.providerId,
        providerLabel:
          item.providerId === 'vedurstofan'
            ? t('roadMapPrototypeWeatherChaseProviderVedurstofan')
            : item.providerId === 'metno'
              ? t('roadMapPrototypeWeatherChaseProviderMetno')
              : 'Vegagerðin',
        sourceLabel:
          item.providerId === 'vedurstofan'
            ? 'Veðurstofa Íslands'
            : item.providerId === 'metno'
              ? item.id.startsWith('metno:custom:')
                ? t('roadMapPrototypeWeatherChaseCustomMetnoSource')
                : 'Yr / met.no'
              : 'Vegagerðin',
        rows: [],
        lat: item.lat,
        lon: item.lon,
        needsRowLoad: item.providerId === 'metno',
        supportsHistory: !item.id.startsWith('metno:custom:'),
      }))

    return [...availableItems, ...savedPlaceholders]
      .sort((a, b) => a.label.localeCompare(b.label, 'is') || a.providerLabel.localeCompare(b.providerLabel, 'is'))
  }, [t, weatherChaseMetnoItems, weatherChasePreferenceItems, weatherChaseVedurstofanItems])

  const loadWeatherChaseItemRows = useCallback(async (item: WeatherChaseItem): Promise<ForecastDrawerRow[]> => {
    if (item.providerId !== 'metno') {
      return item.rows
    }
    const placeId = item.id.startsWith('metno:') ? item.id.slice('metno:'.length) : ''
    const canonicalPlace = ROAD_MAP_PLACES.find(place => place.id === placeId)
    const customCoordinatesValid =
      item.id.startsWith('metno:custom:')
      && typeof item.lat === 'number'
      && typeof item.lon === 'number'
      && validateIcelandicCoords(item.lat, item.lon)
    if (!canonicalPlace && !customCoordinatesValid) {
      throw new Error('Unknown met.no place')
    }

    const requestKey =
      `${item.id}:${overviewThresholds.cautionWindMs}:${overviewThresholds.redWindMs}`
    const cachedRows = weatherChaseMetnoRowsCacheRef.current.get(requestKey)
    if (cachedRows) return cachedRows

    const existingRequest = weatherChaseMetnoRowsInFlightRef.current.get(requestKey)
    if (existingRequest) return existingRequest

    const params = canonicalPlace
      ? new URLSearchParams({ placeId })
      : new URLSearchParams({
          lat: String(item.lat),
          lon: String(item.lon),
        })
    const fetchRows = async () => {
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
      const rows = buildRoadMapMetnoForecastDrawerRows(data.forecasts, overviewThresholds)
      if (rows.length === 0) {
        throw new Error('met.no point forecast returned no usable rows')
      }
      weatherChaseMetnoRowsCacheRef.current.set(requestKey, rows)
      return rows
    }
    const request = (async () => {
      try {
        return await fetchRows()
      } catch {
        return fetchRows()
      }
    })()
      .then(rows => {
        if (rows.length === 0) {
          throw new Error('met.no point forecast returned no usable rows')
        }
        return rows
      })
      .catch(error => {
        if (shouldLogRoadMapDiagnostics()) {
          console.error('[RoadMap] met.no place forecast failed', { placeId, error })
        }
        throw error
      })
      .finally(() => {
        weatherChaseMetnoRowsInFlightRef.current.delete(requestKey)
      })

    weatherChaseMetnoRowsInFlightRef.current.set(requestKey, request)
    return request
  }, [overviewThresholds])

  const loadWeatherChaseHistoryDay = useCallback(async (
    day: string,
    items: WeatherChaseItem[],
  ): Promise<WeatherChaseHistoryLoadResult> => {
    const requestItems = items
      .filter((item): item is WeatherChaseItem & { providerId: 'vedurstofan' | 'metno' } => (
        item.providerId === 'metno'
        || (item.providerId === 'vedurstofan'
          && !overviewVedurstofanLoading
          && !overviewVedurstofanRestricted)
      ))
      .map(item => ({ id: item.id, providerId: item.providerId }))
    const providerRequests = (['vedurstofan', 'metno'] as const)
      .map(providerId => requestItems.filter(item => item.providerId === providerId))
      .filter(providerItems => providerItems.length > 0)
    const rowsByItemId: Record<string, ForecastDrawerRow[]> = Object.fromEntries(
      requestItems.map(item => [item.id, []]),
    )
    if (providerRequests.length === 0) {
      return {
        requestedDay: day,
        availableFromDay: day,
        availableToDay: day,
        rowsByItemId,
      }
    }
    const successful = await Promise.all(providerRequests.map(async providerItems => {
      const response = await fetch('/api/teskeid/weather/forecast-history', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, items: providerItems }),
      })
      if (!response.ok) throw new Error(`forecast history failed: ${response.status}`)
      const data = await response.json() as WeatherChaseHistoryResponse
      if (data.status !== 'ok' || data.requestedDay !== day) {
        throw new Error('forecast history response invalid')
      }
      return data
    }))
    for (const data of successful) {
      for (const [itemId, rows] of Object.entries(data.rowsByItemId)) {
        rowsByItemId[itemId] = buildWeatherChaseHistoryDrawerRows(rows, overviewThresholds)
      }
    }
    return {
      requestedDay: day,
      availableFromDay: successful.map(data => data.availableFromDay).sort()[0],
      availableToDay: successful.map(data => data.availableToDay).sort().at(-1) ?? day,
      rowsByItemId,
    }
  }, [overviewThresholds, overviewVedurstofanLoading, overviewVedurstofanRestricted])

  const handleWeatherChaseSelectedItemsChange = useCallback((items: WeatherChaseItem[]) => {
    weatherChaseSelectedItemsRef.current = items
    setWeatherChaseSelectedItems(items)
    if (!isAuthenticated) {
      const selectedItems = items.map(preferenceItemFromWeatherChaseItem)
      // Keep the public selection stable when the information panel unmounts
      // while switching to the map. sessionStorage deliberately scopes this
      // draft to the current browser tab; the timestamp prevents stale reloads.
      setWeatherChasePreferenceItems(previous => {
        const previousKey = previous?.map(item => item.id).join('|') ?? ''
        const nextKey = selectedItems.map(item => item.id).join('|')
        return previousKey === nextKey ? previous : selectedItems
      })
      const now = Date.now()
      setPublicSavePromptDueAt(now + PUBLIC_WEATHER_CHASE_PROMPT_DELAY_MS)
      try {
        window.sessionStorage.setItem(PUBLIC_WEATHER_CHASE_SESSION_STORAGE_KEY, JSON.stringify({
          updatedAt: now,
          selectedItems,
        }))
      } catch {
        // Storage can be blocked; parent state still preserves the live view switch.
      }
    }
    if (weatherChasePreferencesHydrated) {
      setWeatherChaseSelectionInitialized(true)
    }
    setWeatherChaseNearbyFocusId(prev => (
      prev && items.some(item => item.id === prev) ? prev : null
    ))
  }, [isAuthenticated, weatherChasePreferencesHydrated])

  const handleAddCustomMetnoPlace = useCallback((item: WeatherChasePreferenceItem) => {
    setWeatherChasePreferenceItems(previous => {
      const selected = weatherChaseSelectedItemsRef.current.map(preferenceItemFromWeatherChaseItem)
      const base = selected.length > 0 ? selected : (previous ?? [])
      // Put the new point inside the seven visible comparison slots immediately.
      // The selected-items callback then feeds the same list into authenticated autosave.
      return addCustomMetnoPreferenceItem(base, item)
    })
  }, [])

  const handleWeatherChaseShowNearbyStations = useCallback((item: WeatherChaseItem) => {
    setWeatherChaseNearbyFocusId(prev => (prev === item.id ? null : item.id))
  }, [])

  const weatherChaseNearbyDisplayItems = useMemo<WeatherChaseItem[]>(() => {
    if (!weatherChaseNearbyFocusId) return []
    const focusItem = weatherChaseSelectedItems.find(item => item.id === weatherChaseNearbyFocusId) ?? null
    if (!focusItem || (focusItem.providerId !== 'metno' && focusItem.providerId !== 'vedurstofan')) return []
    if (
      typeof focusItem.lat !== 'number' ||
      !Number.isFinite(focusItem.lat) ||
      typeof focusItem.lon !== 'number' ||
      !Number.isFinite(focusItem.lon)
    ) return []
    const candidates =
      focusItem.providerId === 'metno'
        ? weatherChaseVedurstofanItems
        : weatherChaseMetnoItems
    return candidates
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
      .slice(0, 5)
      .map(c => ({
        ...c.item,
        nearbyDistanceM: c.distanceM,
        nearbyDistanceFromProviderId: focusItem.providerId as 'vedurstofan' | 'metno',
      }))
  }, [
    weatherChaseMetnoItems,
    weatherChaseNearbyFocusId,
    weatherChaseSelectedItems,
    weatherChaseVedurstofanItems,
  ])

  const weatherChaseInitialSelectedIds = useMemo(() => {
    if (weatherChasePreferenceItems === null) return null
    const savedIds = weatherChasePreferenceItems.map(item => item.id).filter(Boolean)
    return savedIds.length > 0 ? savedIds : DEFAULT_WEATHER_CHASE_ITEM_IDS
  }, [weatherChasePreferenceItems])

  const applyWeatherChasePreferences = useCallback((payload: WeatherChasePreferencesPayload) => {
    setWeatherChasePreferenceItems(payload.selectedItems)
    setWeatherChaseCriteria(payload.criteria)
    setMapVisibleHours(payload.visibleHours)
    setForecastCardScaleIndex(payload.forecastCardScaleIndex ?? 1)
    setForecastCardScaleChanged(false)
  }, [])

  const cleanWeatherChaseSaveParam = useCallback(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (!url.searchParams.has('saveWeatherChaseDefaults')) return
    url.searchParams.delete('saveWeatherChaseDefaults')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])

  const authenticatedWeatherChasePendingStorageKey = useMemo(() => (
    isAuthenticated && preferenceOwnerId
      ? weatherChaseAuthPendingStorageKey(preferenceOwnerId)
      : null
  ), [isAuthenticated, preferenceOwnerId])

  const persistAuthenticatedWeatherChasePending = useCallback((
    payload: WeatherChasePreferencesPayload,
  ) => {
    if (!authenticatedWeatherChasePendingStorageKey) return
    try {
      window.localStorage.setItem(
        authenticatedWeatherChasePendingStorageKey,
        JSON.stringify(payload),
      )
    } catch {
      // Autosave still proceeds when browser storage is unavailable.
    }
  }, [authenticatedWeatherChasePendingStorageKey])

  const clearAuthenticatedWeatherChasePending = useCallback(() => {
    if (!authenticatedWeatherChasePendingStorageKey) return
    try {
      window.localStorage.removeItem(authenticatedWeatherChasePendingStorageKey)
    } catch {
      // A successful server save is authoritative even if local cleanup fails.
    }
  }, [authenticatedWeatherChasePendingStorageKey])

  const saveWeatherChasePreferencesToApi = useCallback(async (
    payload: WeatherChasePreferencesPayload,
    options: { keepalive?: boolean } = {},
  ): Promise<'saved' | 'unauthorized' | 'error'> => {
    try {
      const res = await fetch('/api/teskeid/weather/preferences/chase', {
        method: 'PUT',
        credentials: 'same-origin',
        keepalive: options.keepalive === true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.status === 401) return 'unauthorized'
      if (!res.ok) return 'error'
      return 'saved'
    } catch {
      return 'error'
    }
  }, [])

  const handleWeatherChaseCriteriaChange = useCallback((next: WeatherChaseCriteria) => {
    setWeatherChaseCriteria(next)
    setWeatherChaseSaveStatus(prev => (prev === 'saved' || prev === 'error' ? 'idle' : prev))
  }, [])

  const handleSaveWeatherChaseDefault = useCallback(async (payload: WeatherChasePreferencesPayload) => {
    const payloadWithScale = { ...payload, forecastCardScaleIndex }
    applyWeatherChasePreferences(payloadWithScale)
    setWeatherChaseSaveStatus('saving')

    if (!isAuthenticated) {
      try {
        window.sessionStorage.setItem(WEATHER_CHASE_PENDING_STORAGE_KEY, JSON.stringify(payloadWithScale))
      } catch {
        // Continue to auth even if pending session storage is unavailable.
      }
      const returnUrl = `${window.location.pathname}?saveWeatherChaseDefaults=1`
      window.location.href = `/innskraning?next=${encodeURIComponent(returnUrl)}`
      return
    }

    const result = await saveWeatherChasePreferencesToApi(payloadWithScale)
    if (result === 'unauthorized') {
      try {
        window.sessionStorage.setItem(WEATHER_CHASE_PENDING_STORAGE_KEY, JSON.stringify(payloadWithScale))
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
  }, [applyWeatherChasePreferences, forecastCardScaleIndex, isAuthenticated, saveWeatherChasePreferencesToApi])

  const continuePublicWeatherChaseSession = useCallback(() => {
    const selectedItems = weatherChaseSelectedItemsRef.current.map(preferenceItemFromWeatherChaseItem)
    const now = Date.now()
    setPublicSavePromptOpen(false)
    setPublicSavePromptDueAt(now + PUBLIC_WEATHER_CHASE_PROMPT_DELAY_MS)
    try {
      window.sessionStorage.setItem(PUBLIC_WEATHER_CHASE_SESSION_STORAGE_KEY, JSON.stringify({
        updatedAt: now,
        selectedItems,
      }))
    } catch {
      // Parent state still preserves the current live session.
    }
  }, [])

  const savePublicWeatherChaseSession = useCallback(() => {
    setPublicSavePromptOpen(false)
    void handleSaveWeatherChaseDefault({
      selectedItems: weatherChaseSelectedItemsRef.current.map(preferenceItemFromWeatherChaseItem),
      criteria: weatherChaseCriteria,
      visibleHours: mapVisibleHours,
      forecastCardScaleIndex,
    })
  }, [
    forecastCardScaleIndex,
    handleSaveWeatherChaseDefault,
    mapVisibleHours,
    weatherChaseCriteria,
  ])

  useEffect(() => {
    if (isAuthenticated || publicSavePromptDueAt === null || publicSavePromptOpen) return
    const delay = Math.max(0, publicSavePromptDueAt - Date.now())
    const timer = window.setTimeout(() => setPublicSavePromptOpen(true), delay)
    return () => window.clearTimeout(timer)
  }, [isAuthenticated, publicSavePromptDueAt, publicSavePromptOpen])

  const flushWeatherChaseAutoSave = useCallback(async () => {
    if (weatherChaseAutoSaveRunningRef.current) return
    clearTimerRef(weatherChaseAutoSaveRetryTimerRef)
    weatherChaseAutoSaveRunningRef.current = true

    try {
      while (weatherChaseAutoSaveQueuedRef.current) {
        const payload = weatherChaseAutoSaveQueuedRef.current
        weatherChaseAutoSaveQueuedRef.current = null
        setWeatherChaseSaveStatus('saving')
        const result = await saveWeatherChasePreferencesToApi(payload)
        if (result === 'saved') {
          weatherChaseAutoSaveRetryCountRef.current = 0
          if (!weatherChaseAutoSaveQueuedRef.current) {
            clearAuthenticatedWeatherChasePending()
            setWeatherChaseSaveStatus('saved')
          }
          continue
        }

        weatherChaseAutoSaveQueuedRef.current ??= payload
        setWeatherChaseSaveStatus('error')
        if (result === 'error') {
          const attempt = weatherChaseAutoSaveRetryCountRef.current
          weatherChaseAutoSaveRetryCountRef.current += 1
          const retryDelayMs = Math.min(30_000, 2_000 * (2 ** Math.min(attempt, 4)))
          weatherChaseAutoSaveRetryTimerRef.current = setTimeout(() => {
            flushWeatherChaseAutoSaveRef.current()
          }, retryDelayMs)
        }
        break
      }
    } finally {
      weatherChaseAutoSaveRunningRef.current = false
    }
  }, [clearAuthenticatedWeatherChasePending, saveWeatherChasePreferencesToApi])

  useEffect(() => {
    flushWeatherChaseAutoSaveRef.current = () => {
      void flushWeatherChaseAutoSave()
    }
  }, [flushWeatherChaseAutoSave])

  const retryWeatherChaseAutoSave = useCallback(() => {
    weatherChaseAutoSaveRetryCountRef.current = 0
    setWeatherChaseSaveStatus('saving')
    flushWeatherChaseAutoSaveRef.current()
  }, [])

  useEffect(() => {
    if (lastMapContext !== 'weather') return
    let cancelled = false
    let restoredPublicSessionDraft = false

    // Remove browser-persisted settings from earlier builds. From this point on,
    // authenticated preferences live only in the user's server-side settings.
    try {
      window.localStorage.removeItem(LEGACY_WEATHER_CHASE_LOCAL_STORAGE_KEY)
      window.localStorage.removeItem(LEGACY_FORECAST_CARD_SCALE_LOCAL_STORAGE_KEY)
    } catch {
      // Storage can be unavailable in privacy-restricted browsers.
    }

    function readPendingPayload(storage: Storage, key: string): WeatherChasePreferencesPayload | null {
      try {
        const raw = storage.getItem(key)
        return raw ? normalizeWeatherChasePreferences(JSON.parse(raw)) : null
      } catch {
        return null
      }
    }

    const pendingPayload = readPendingPayload(window.sessionStorage, WEATHER_CHASE_PENDING_STORAGE_KEY)
    const authenticatedPendingPayload = authenticatedWeatherChasePendingStorageKey
      ? readPendingPayload(window.localStorage, authenticatedWeatherChasePendingStorageKey)
      : null
    if (!isAuthenticated) {
      try {
        const raw = window.sessionStorage.getItem(PUBLIC_WEATHER_CHASE_SESSION_STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, unknown>
          const updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0
          const selectedItems = normalizeWeatherChasePreferenceItems(parsed.selectedItems)
          if (
            selectedItems.length > 0 &&
            updatedAt > 0 &&
            Date.now() - updatedAt <= PUBLIC_WEATHER_CHASE_SESSION_TTL_MS
          ) {
            setWeatherChasePreferenceItems(selectedItems)
            setPublicSavePromptDueAt(updatedAt + PUBLIC_WEATHER_CHASE_PROMPT_DELAY_MS)
            restoredPublicSessionDraft = true
          } else {
            window.sessionStorage.removeItem(PUBLIC_WEATHER_CHASE_SESSION_STORAGE_KEY)
          }
        }
      } catch {
        try {
          window.sessionStorage.removeItem(PUBLIC_WEATHER_CHASE_SESSION_STORAGE_KEY)
        } catch {
          // Storage is unavailable; continue with in-memory defaults.
        }
      }
    }
    const shouldSavePending = new URLSearchParams(window.location.search).get('saveWeatherChaseDefaults') === '1'
    if (shouldSavePending && pendingPayload) {
      applyWeatherChasePreferences(pendingPayload)
      setWeatherChaseSaveStatus('saving')
      void saveWeatherChasePreferencesToApi(pendingPayload).then(result => {
        if (cancelled) return
        setWeatherChaseSaveStatus(result === 'unauthorized' ? 'error' : result)
        if (result === 'saved') {
          try {
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

    if (isAuthenticated && authenticatedPendingPayload) {
      applyWeatherChasePreferences(authenticatedPendingPayload)
      weatherChaseAutoSaveQueuedRef.current = authenticatedPendingPayload
      setWeatherChaseSaveStatus('saving')
      setWeatherChasePreferencesHydrated(true)
      flushWeatherChaseAutoSaveRef.current()
      cleanWeatherChaseSaveParam()
      return () => {
        cancelled = true
      }
    }

    if (!isAuthenticated) {
      if (!restoredPublicSessionDraft) {
        setWeatherChasePreferenceItems([])
      }
      setWeatherChasePreferencesHydrated(true)
      cleanWeatherChaseSaveParam()
      return () => {
        cancelled = true
      }
    }

    void fetch('/api/teskeid/weather/preferences/chase', { credentials: 'same-origin' })
      .then(async res => {
        if (!res.ok) return { ok: false as const, raw: null }
        return { ok: true as const, raw: await res.json() as unknown }
      })
      .then(result => {
        if (cancelled) return
        if (!result.ok) {
          // A signed-out visitor needs usable in-memory defaults after the
          // expected 401. An authenticated transient failure must not be
          // interpreted as "no saved preferences" and then autosaved.
          if (!isAuthenticated && !restoredPublicSessionDraft) setWeatherChasePreferenceItems([])
          setWeatherChasePreferencesHydrated(true)
          return
        }
        const raw = result.raw
        if (!raw || typeof raw !== 'object') {
          if (!isAuthenticated && !restoredPublicSessionDraft) setWeatherChasePreferenceItems([])
          setWeatherChasePreferencesHydrated(true)
          return
        }
        const input = raw as Record<string, unknown>
        if (input.hasPreferences !== true) {
          if (isAuthenticated || !restoredPublicSessionDraft) setWeatherChasePreferenceItems([])
          setWeatherChasePreferencesHydrated(true)
          return
        }
        const payload = normalizeWeatherChasePreferences({
          selectedItems: input.selectedItems,
          criteria: input.criteria,
          visibleHours: input.visibleHours,
          forecastCardScaleIndex: input.forecastCardScaleIndex,
        })
        if (!payload) {
          if (isAuthenticated || !restoredPublicSessionDraft) setWeatherChasePreferenceItems([])
          setWeatherChasePreferencesHydrated(true)
          return
        }
        applyWeatherChasePreferences(payload)
        setWeatherChasePreferencesHydrated(true)
      })
      .catch(() => {
        // Public users use in-memory defaults. Authenticated failures stay
        // unresolved so autosave cannot overwrite an existing server choice.
        if (!cancelled) {
          if (!isAuthenticated && !restoredPublicSessionDraft) setWeatherChasePreferenceItems([])
          setWeatherChasePreferencesHydrated(true)
        }
      })

    cleanWeatherChaseSaveParam()
    return () => {
      cancelled = true
    }
  }, [
    applyWeatherChasePreferences,
    authenticatedWeatherChasePendingStorageKey,
    cleanWeatherChaseSaveParam,
    isAuthenticated,
    saveWeatherChasePreferencesToApi,
  ])

  useEffect(() => {
    if (!isAuthenticated) {
      setRouteThresholdPreferencesLoaded(true)
      return
    }
    setRouteThresholdPreferencesLoaded(false)
    let cancelled = false
    void fetch('/api/teskeid/weather/preferences/thresholds', { credentials: 'same-origin' })
      .then(async res => {
        if (!res.ok) return
        const data = await res.json() as Record<string, unknown>
        if (cancelled) return
        if (data.hasPreferences !== true) return
        const c = Number(data.cautionWindMs)
        const r = Number(data.redWindMs)
        if (Number.isFinite(c) && Number.isFinite(r) && c > 0 && r > 0 && c < r) {
          setSavedRouteThresholds({ cautionWindMs: c, redWindMs: r })
        }
        if (data.statusFilterMode === 'simple' || data.statusFilterMode === 'detailed') {
          routeStatusFilterModeRef.current = data.statusFilterMode
          setRouteStatusFilterMode(data.statusFilterMode)
        }
      })
      .catch(() => { /* no-op */ })
      .finally(() => {
        if (!cancelled) setRouteThresholdPreferencesLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated || !weatherChasePreferencesHydrated || !weatherChaseSelectionInitialized) return
    clearTimerRef(weatherChaseAutoSaveTimerRef)

    const payload: WeatherChasePreferencesPayload = {
      selectedItems: weatherChaseSelectedItems.map(preferenceItemFromWeatherChaseItem),
      criteria: weatherChaseCriteria,
      visibleHours: mapVisibleHours,
      forecastCardScaleIndex,
    }
    weatherChaseAutoSaveQueuedRef.current = payload
    persistAuthenticatedWeatherChasePending(payload)
    setWeatherChaseSaveStatus('saving')
    weatherChaseAutoSaveTimerRef.current = setTimeout(() => {
      flushWeatherChaseAutoSaveRef.current()
    }, 500)

    return () => clearTimerRef(weatherChaseAutoSaveTimerRef)
  }, [
    flushWeatherChaseAutoSave,
    isAuthenticated,
    mapVisibleHours,
    weatherChaseCriteria,
    forecastCardScaleIndex,
    persistAuthenticatedWeatherChasePending,
    weatherChasePreferencesHydrated,
    weatherChaseSelectedItems,
    weatherChaseSelectionInitialized,
  ])

  useEffect(() => {
    if (!isAuthenticated || !authenticatedWeatherChasePendingStorageKey) return

    const flushPendingOnExit = () => {
      const payload = weatherChaseAutoSaveQueuedRef.current
      if (!payload) return
      clearTimerRef(weatherChaseAutoSaveTimerRef)
      persistAuthenticatedWeatherChasePending(payload)
      void saveWeatherChasePreferencesToApi(payload, { keepalive: true }).then(result => {
        if (result === 'saved' && weatherChaseAutoSaveQueuedRef.current === payload) {
          weatherChaseAutoSaveQueuedRef.current = null
          clearAuthenticatedWeatherChasePending()
          setWeatherChaseSaveStatus('saved')
        } else if (result !== 'saved') {
          setWeatherChaseSaveStatus('error')
        }
      })
    }
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingOnExit()
      } else if (weatherChaseAutoSaveQueuedRef.current) {
        flushWeatherChaseAutoSaveRef.current()
      }
    }

    window.addEventListener('pagehide', flushPendingOnExit)
    document.addEventListener('visibilitychange', flushWhenHidden)
    return () => {
      flushPendingOnExit()
      window.removeEventListener('pagehide', flushPendingOnExit)
      document.removeEventListener('visibilitychange', flushWhenHidden)
      clearTimerRef(weatherChaseAutoSaveRetryTimerRef)
    }
  }, [
    authenticatedWeatherChasePendingStorageKey,
    clearAuthenticatedWeatherChasePending,
    isAuthenticated,
    persistAuthenticatedWeatherChasePending,
    saveWeatherChasePreferencesToApi,
  ])

  useEffect(() => {
    weatherChaseActiveRef.current = isWeatherChaseOpen
    if (!isWeatherChaseOpen) {
      weatherChaseBoundsKeyRef.current = null
      setWeatherChaseNearbyFocusId(null)
    }
    updateOverviewMarkerVisibility()
  }, [isWeatherChaseOpen])

  useEffect(() => {
    showForecastStationsRef.current = showForecastStations
    for (const { element } of weatherChaseMapMarkersRef.current) {
      element.style.display = showForecastStations ? '' : 'none'
    }
    if (showForecastStations) {
      window.requestAnimationFrame(() => applyWeatherChaseCardCollisionAvoidance())
    } else {
      setHiddenForecastCardCount(0)
    }
  }, [showForecastStations])

  useEffect(() => {
    showAllForecastGlaciersRef.current = showAllForecastGlaciers
    updateForecastGlacierLabelPresentation()
  }, [showAllForecastGlaciers])

  useEffect(() => {
    showAllForecastMountainsRef.current = showAllForecastMountains
    updateForecastMountainLabelPresentation()
  }, [showAllForecastMountains])

  useEffect(() => {
    const scale = FORECAST_CARD_SCALE_LEVELS[forecastCardScaleIndex] ?? 1.2
    containerRef.current?.style.setProperty('--teskeid-forecast-card-scale', String(scale))
    window.requestAnimationFrame(() => {
      applyWeatherChaseCardCollisionAvoidance()
      scheduleRouteLabelCollisionUpdate()
    })
  }, [forecastCardScaleIndex])

  useEffect(() => {
    if (hiddenForecastCardCount <= 0) return
    window.requestAnimationFrame(() => applyWeatherChaseCardCollisionAvoidance())
  }, [hiddenForecastCardCount])

  useEffect(() => {
    if (lastMapContext !== 'weather') return
    let cancelled = false
    ;(async () => {
      if (!isAuthenticated) {
        const sessionPlaces = readPublicSavedPlaces(window.sessionStorage)
        if (!cancelled) setSavedPlaces(sessionPlaces)
        return
      }

      try {
        const res = await fetch('/api/teskeid/weather/saved-places', { credentials: 'same-origin' })
        if (!cancelled && res.ok) {
          const data = await res.json()
          setSavedPlaces(Array.isArray(data?.places) ? (data.places as SavedWeatherPlace[]) : [])
        }

        const pending = readPublicSavedPlaces(window.sessionStorage)
        if (pending.length === 0) return
        const remaining: SavedWeatherPlace[] = []
        for (const place of pending) {
          const promoteRes = await fetch('/api/teskeid/weather/saved-places', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: place.name,
              formattedAddress: place.formattedAddress,
              lat: place.lat,
              lon: place.lon,
              mergeOnly: true,
            }),
          })
          if (!promoteRes.ok) remaining.push(place)
        }
        if (remaining.length > 0) {
          writePublicSavedPlaces(window.sessionStorage, remaining)
        } else {
          window.sessionStorage.removeItem(PUBLIC_SAVED_PLACES_STORAGE_KEY)
        }
        const refreshed = await fetch('/api/teskeid/weather/saved-places', { credentials: 'same-origin' })
        if (!cancelled && refreshed.ok) {
          const data = await refreshed.json()
          setSavedPlaces(Array.isArray(data?.places) ? (data.places as SavedWeatherPlace[]) : [])
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [isAuthenticated])

  const displayOverviewForecastSlotStatuses = routeStatusFilterMode === 'simple'
    ? overviewForecastSlotStatuses.map(slot => ({
        ...slot,
        worstStatus: toSimpleWindDisplayStatus(slot.worstStatus),
      }))
    : overviewForecastSlotStatuses

  const mapForecastSlotStatuses = displayOverviewForecastSlotStatuses.filter(
    slot => mapVisibleHours.some(hour => hour === new Date(slot.timeMs).getUTCHours()),
  )
  const resolvedWeatherMapActiveMode = resolveForecastMapActiveTime(
    overviewActiveMode,
    mapForecastSlotStatuses,
  )

  useEffect(() => {
    const weatherMapIsVisible =
      lastMapContext === 'weather' &&
      !isWeatherChaseOpen &&
      !isPanelOpen &&
      !isChatOpen &&
      !routeBridgeSummary
    if (!weatherMapIsVisible && !isWeatherChaseOpen) return
    if (overviewActiveMode === resolvedWeatherMapActiveMode) return
    overviewActiveModeRef.current = resolvedWeatherMapActiveMode
    setOverviewActiveMode(resolvedWeatherMapActiveMode)
  }, [
    isChatOpen,
    isPanelOpen,
    isWeatherChaseOpen,
    lastMapContext,
    overviewActiveMode,
    resolvedWeatherMapActiveMode,
    routeBridgeSummary,
  ])

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
        classifyLiveVegagerdinStationWindStatus(station, overviewThresholds),
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
          tally(classifyLiveVegagerdinStationWindStatus(station, overviewThresholds))
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

  const freeDriveStatusCounts = useMemo<Partial<Record<WindDisplayStatus, number>>>(() => {
    const counts: Partial<Record<WindDisplayStatus, number>> = {}
    if (liveDriveMode !== 'free-drive') return counts
    if (overviewVegagerdinData?.status !== 'ok') return counts
    for (const station of overviewVegagerdinData.stations) {
      const status = liveVegagerdinStationFromCurrent(station, overviewThresholds).displayStatus
      counts[status] = (counts[status] ?? 0) + 1
    }
    return counts
  }, [liveDriveMode, overviewThresholds, overviewVegagerdinData])
  const freeDriveWorstStatus = worstWindDisplayStatusFromCounts(freeDriveStatusCounts) ?? 'no_data'
  const freeDriveNewestFreshness = overviewVegagerdinNewestMeasuredAtIso
    ? freeDriveStationFreshness(overviewVegagerdinNewestMeasuredAtIso)
    : 'unknown'
  const freeDriveStaleDetails = freeDriveNewestFreshness === 'stale' &&
    overviewVegagerdinNewestMeasuredAtIso &&
    overviewVegagerdinData?.status === 'ok'
    ? {
        measuredAtIso: overviewVegagerdinNewestMeasuredAtIso,
        fetchedAtIso: overviewVegagerdinData.fetchedAtIso,
        attemptedAtIso:
          overviewVegagerdinData.lastAttemptedAtIso ?? overviewVegagerdinData.fetchedAtIso,
      }
    : null
  const freeDriveStaleTimes = freeDriveStaleDetails
    ? t('roadMapPrototypeVegagerdinDataStaleTimes', {
        measuredTime: formatKlTime(freeDriveStaleDetails.measuredAtIso),
        fetchedTime: formatKlTime(freeDriveStaleDetails.fetchedAtIso),
        attemptedTime: formatKlTime(freeDriveStaleDetails.attemptedAtIso),
      })
    : null
  const freeDriveDataIsVeryStale = freeDriveStaleDetails
    ? freeDriveStationIsVeryStale(freeDriveStaleDetails.measuredAtIso)
    : false
  const freeDriveStaleMessage = freeDriveStaleTimes
    ? freeDriveDataIsVeryStale
      ? t('roadMapPrototypeVegagerdinDataVeryStale')
      : t('roadMapPrototypeVegagerdinDataStale', {
          measuredTime: formatKlTime(freeDriveStaleDetails!.measuredAtIso),
          fetchedTime: formatKlTime(freeDriveStaleDetails!.fetchedAtIso),
          attemptedTime: formatKlTime(freeDriveStaleDetails!.attemptedAtIso),
        })
    : null
  const freeDriveStaleNotice = freeDriveStaleMessage && freeDriveStaleTimes
    ? (
        <VegagerdinStaleNotice
          message={freeDriveStaleMessage}
          isVeryStale={freeDriveDataIsVeryStale}
          timeDetails={freeDriveStaleTimes}
          statusLabel={t('roadMapPrototypeVegagerdinDataStaleShort')}
          linkLabel={t('roadMapPrototypeVegagerdinOpenUmferdin')}
          linkAriaLabel={t('roadMapPrototypeVegagerdinOpenUmferdinNewTab')}
        />
      )
    : null
  const freeDriveMeasuredLabel = overviewVegagerdinNewestMeasuredAtIso
    ? t('roadMapPrototypeVegagerdinNowLabel', {
        time: formatKlTime(overviewVegagerdinNewestMeasuredAtIso),
      })
    : t('roadMapPrototypeVegagerdinNowFallback')
  const freeDriveFreshnessLabel = freeDriveStaleMessage
    ? t('roadMapPrototypeVegagerdinDataStaleShort')
    : freeDriveNewestFreshness === 'fresh'
      ? t('vegagerdinFreshnessFresh')
      : null

  useEffect(() => {
    if (!consumeWeatherOverviewProviderFetchGate(
      lastMapContext,
      skipInitialVegagerdinOverviewFetchRef,
    )) return
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
  }, [lastMapContext])

  useEffect(() => {
    try {
      const storedZoom = window.localStorage.getItem(LIVE_LOCATION_FOLLOW_ZOOM_STORAGE_KEY)
      if (storedZoom === null) return
      const zoom = clampLiveLocationFollowZoom(storedZoom)
      routeLiveLocationFollowZoomRef.current = zoom
      setRouteLiveLocationFollowZoom(zoom)
    } catch {
      // Live tracking remains usable when browser storage is unavailable.
    }
  }, [])

  useEffect(() => {
    const routeSessionIsValid =
      liveDriveMode === 'route' &&
      routeActive &&
      routeWeatherMode === 'now'
    const freeDriveSessionIsValid = liveDriveMode === 'free-drive'
    if (
      !isAuthenticated ||
      isChatOpen ||
      lastMapContext !== 'route' ||
      routeContextView !== 'map' ||
      (!routeSessionIsValid && !freeDriveSessionIsValid)
    ) {
      stopRouteLiveLocation()
    }
  }, [
    isAuthenticated,
    isChatOpen,
    lastMapContext,
    liveDriveMode,
    routeActive,
    routeContextView,
    routeWeatherMode,
    stopRouteLiveLocation,
  ])

  useEffect(() => {
    if (isAuthenticated || liveDriveModeRef.current !== 'free-drive') return
    stopRouteLiveLocation()
    setLiveDriveModeState('off')
    setFreeDrivePaused(false)
    setFreeDriveWithoutLocation(false)
  }, [isAuthenticated, stopRouteLiveLocation])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return
      if (!routeLiveLocationStopRef.current && !routeLiveLocationMarkerRef.current) return
      if (
        liveDriveModeRef.current === 'free-drive' &&
        routeLiveLocationStopRef.current
      ) {
        setFreeDrivePaused(true)
      }
      stopRouteLiveLocation()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopRouteLiveLocation(false)
    }
  }, [stopRouteLiveLocation])

  useEffect(() => {
    if (routeLiveLocationStatus !== 'active') return
    const frame = window.requestAnimationFrame(() => moveRouteLiveLocationCamera())
    return () => window.cancelAnimationFrame(frame)
    // The camera helper intentionally reads the latest map and location refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRouteMapSettingsCollapsed, routeLiveLocationStatus])

  useEffect(() => {
    if (!consumeWeatherOverviewProviderFetchGate(
      lastMapContext,
      skipInitialVedurstofanOverviewFetchRef,
    )) return
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
  }, [lastMapContext])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    const Marker = markerConstructorRef.current
    const useLivePresentation = liveDriveMode === 'free-drive'
    const stations = overviewVegagerdinData?.status === 'ok'
      ? overviewVegagerdinData.stations
      : []
    if (!map?.isStyleLoaded() || !Marker) {
      if (useLivePresentation && stations.length > 0) {
        const retryWhenReady = () => scheduleOverviewMarkerReconciliation()
        map?.once('idle', retryWhenReady)
        updateOverviewLayerVisibility()
        return () => {
          map?.off('idle', retryWhenReady)
        }
      }
      updateOverviewLayerVisibility()
      return
    }
    if (stations.length === 0) {
      clearOverviewMarkerSet(overviewVegagerdinMarkersRef)
      updateOverviewLayerVisibility()
      return
    }
    const canReconcileLiveMarkers = useLivePresentation && overviewVegagerdinMarkersRef.current.every(
      entry => Boolean(entry.stationId && entry.element.dataset.liveVegagerdinStation === 'true'),
    )
    if (!canReconcileLiveMarkers) clearOverviewMarkerSet(overviewVegagerdinMarkersRef)
    const currentMarkersByStationId = new Map(
      overviewVegagerdinMarkersRef.current.flatMap(entry => (
        entry.stationId ? [[entry.stationId, entry] as const] : []
      )),
    )
    const nextMarkers: OverviewStationMarker[] = []

    for (const station of stations) {
      const lat = toFiniteCoordinate(station.lat)
      const lon = toFiniteCoordinate(station.lon)
      if (lat === null || lon === null) continue

      const status = classifyLiveVegagerdinStationWindStatus(station, overviewThresholds)
      const liveStation = liveVegagerdinStationFromCurrent(station, overviewThresholds)
      const freeDriveStatus = liveStation.displayStatus
      const coords: [number, number] = [lon, lat]
      const stationName = station.stationName ?? 'Stöð'
      const windText = station.meanWindMs != null ? formatNum(station.meanWindMs, locale) : '–'
      const gustText = station.gustLast10MinMs != null ? formatNum(station.gustLast10MinMs, locale) : null
      const overviewLabel = windText === '–' ? stationName : `${windText} m/s`
      const element = useLivePresentation
        ? createLiveVegagerdinStationLabel(liveStation, {
            liveTrackingActive: true,
            onClick: () => openOverviewVegagerdinPopup(station, coords),
          })
        : createOverviewStationDotElement({
            stationName,
            windText,
            gustText,
            directionText: station.windDirectionText,
            directionDegrees: station.windDirectionDeg,
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
      if (useLivePresentation) {
        appendOverviewAggregate(element, overviewLabel)
      }
      const current = canReconcileLiveMarkers
        ? currentMarkersByStationId.get(station.stationId)
        : undefined
      if (current) {
        updateLiveVegagerdinStationLabelInPlace(current.element, element)
        currentMarkersByStationId.delete(station.stationId)
        nextMarkers.push({
          ...current,
          stationId: station.stationId,
          status,
          freeDriveStatus,
          lat,
          lon,
          stationName,
          overviewLabel,
          ariaLabel: current.element.getAttribute('aria-label') ?? stationName,
          windMs: station.meanWindMs,
        })
        continue
      }
      const marker = new Marker({ element, anchor: 'center' })
        .setLngLat(coords)
        .addTo(map)
      nextMarkers.push({
        marker,
        element,
        stationId: station.stationId,
        provider: 'vegagerdin',
        status,
        freeDriveStatus,
        lat,
        lon,
        stationName,
        overviewLabel,
        ariaLabel: element.getAttribute('aria-label') ?? stationName,
        windMs: station.meanWindMs,
        clusterEmoji: null,
      })
    }
    currentMarkersByStationId.forEach(({ marker }) => marker.remove())
    overviewVegagerdinMarkersRef.current = nextMarkers

    updateOverviewLayerVisibility()
  }, [
    mapReady,
    liveDriveMode,
    overviewMarkerReconcileVersion,
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
      !isChatOpen &&
      lastMapContext === 'weather' &&
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

    const chaseTargetTimeMs = typeof overviewActiveMode === 'number' ? overviewActiveMode : null
    const selectedItemRows = new Map(
      weatherChaseSelectedItems.map(item => [item.id, selectWeatherChaseMarkerRow(item, chaseTargetTimeMs)]),
    )
    const allSelectedTemps = Array.from(selectedItemRows.values())
      .filter((r): r is ForecastDrawerRow => r !== null)
      .map(r => r.temperature.value)
    const allSelectedWinds = Array.from(selectedItemRows.values())
      .filter((r): r is ForecastDrawerRow => r !== null)
      .map(r => r.wind.value)

    for (const { item, kind } of markerItems) {
      if (
        typeof item.lat !== 'number' ||
        !Number.isFinite(item.lat) ||
        typeof item.lon !== 'number' ||
        !Number.isFinite(item.lon)
      ) {
        continue
      }
      const row = kind === 'selected'
        ? (selectedItemRows.get(item.id) ?? null)
        : selectWeatherChaseMarkerRow(item, chaseTargetTimeMs)
      const medal = kind === 'selected' && row && showMedals
        ? (getMedalEmoji(row.temperature.value, allSelectedTemps, 'desc') ?? getMedalEmoji(row.wind.value, allSelectedWinds, 'asc'))
        : null
      const element = createWeatherChaseMapMarkerElement(item, row, kind, medal)
      element.style.display = showForecastStationsRef.current ? '' : 'none'
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
    const showDesktopInformationMap =
      isWeatherChaseOpen &&
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 1200px)').matches
    const showDesktopMapControls =
      !isWeatherChaseOpen &&
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 1024px)').matches
    const boundsKey = `${
      showDesktopInformationMap
        ? 'desktop-iceland'
        : showDesktopMapControls
          ? 'desktop-controls'
          : 'selected'
    }:${
      boundsItems.map(item => `${item.kind}:${item.id}:${item.lat.toFixed(4)},${item.lon.toFixed(4)}`).join('|')
    }`
    if (boundsItems.length > 0 && boundsKey && weatherChaseBoundsKeyRef.current !== boundsKey) {
      weatherChaseBoundsKeyRef.current = boundsKey
      if (showDesktopInformationMap) {
        map.fitBounds(
          [
            [-24.8, 63.25],
            [-13.1, 66.75],
          ],
          {
            padding: {
              top: 48,
              right: 48,
              bottom: 96,
              left: Math.min(700, Math.round(window.innerWidth * 0.48)),
            },
            maxZoom: 6.5,
            duration: 450,
          },
        )
      } else if (boundsItems.length === 1) {
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
            padding: showDesktopMapControls
              ? { top: 190, right: 48, bottom: 260, left: 230 }
              : { top: 96, right: 40, bottom: 220, left: 40 },
            maxZoom: 7.5,
            duration: 450,
          },
        )
      }
    }

    hideOverviewStationMarkers()
    reconcilePlaceMarkerVisibility()

    let collisionFrame: number | null = null
    const scheduleWeatherChaseCollisionUpdate = () => {
      if (collisionFrame !== null) window.cancelAnimationFrame(collisionFrame)
      collisionFrame = window.requestAnimationFrame(() => {
        collisionFrame = null
        applyWeatherChaseCardCollisionAvoidance()
      })
    }
    map.on('moveend', scheduleWeatherChaseCollisionUpdate)
    map.on('zoomend', scheduleWeatherChaseCollisionUpdate)
    window.addEventListener('resize', scheduleWeatherChaseCollisionUpdate)
    scheduleWeatherChaseCollisionUpdate()

    return () => {
      map.off('moveend', scheduleWeatherChaseCollisionUpdate)
      map.off('zoomend', scheduleWeatherChaseCollisionUpdate)
      window.removeEventListener('resize', scheduleWeatherChaseCollisionUpdate)
      if (collisionFrame !== null) window.cancelAnimationFrame(collisionFrame)
      clearWeatherChaseMapMarkers()
    }
  }, [
    isChatOpen,
    isPanelOpen,
    isWeatherChaseOpen,
    lastMapContext,
    mapReady,
    overviewActiveMode,
    routeActive,
    showMedals,
    weatherChaseNearbyFocusId,
    weatherChaseSelectedItems,
    weatherChaseVedurstofanItems,
  ])

  useEffect(() => {
    if (!isChatOpen || !mapReady) return
    const hideCommunityWeatherMarkers = () => {
      for (const entry of [
        ...overviewVegagerdinMarkersRef.current,
        ...overviewVedurstofanMarkersRef.current,
      ]) {
        entry.element.style.display = 'none'
      }
      clearWeatherChaseMapMarkers()
    }
    hideCommunityWeatherMarkers()
    const frame = window.requestAnimationFrame(hideCommunityWeatherMarkers)
    return () => window.cancelAnimationFrame(frame)
  }, [
    isChatOpen,
    mapReady,
    overviewMarkerReconcileVersion,
    overviewVegagerdinData,
    overviewVedurstofanData,
  ])

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

  function providerRouteAnswer(status: WindDisplayStatus): string {
    if (status === 'no_data' || status === 'no_wind_data') {
      return t('roadMapPrototypeProviderRouteAnswerUnavailable')
    }
    switch (windDisplayStatusToTravelStatus(status)) {
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

  function routeStatusIsVisible(status: WindDisplayStatus, statuses = visibleRouteStatusesRef.current): boolean {
    return statusIsVisibleInFilter(status, statuses, ROUTE_WIND_STATUS_FILTER_MODE)
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

  function buildOverviewAggregateLabel(
    entries: OverviewStationMarker[],
    freeDrive = false,
  ): string {
    if (freeDrive) return freeDriveAggregateStationCountLabel(entries.length)
    if (entries.length <= 1) return entries[0]?.overviewLabel ?? ''
    const emoji = dominantOverviewEmoji(entries)
    if (emoji) return emoji
    const averageWind = averageOverviewWindMs(entries)
    return averageWind === null ? '💨' : `${formatNum(averageWind, locale)} m/s`
  }

  function buildOverviewAggregateTitle(
    entries: OverviewStationMarker[],
    region?: OverviewAggregateRegion,
    freeDrive = false,
    aggregateStatus?: WindDisplayStatus,
  ): string {
    const averageWind = freeDrive ? null : averageOverviewWindMs(entries)
    const averageText = averageWind === null ? null : `${formatNum(averageWind, locale)} m/s`
    const stationText = t('roadMapPrototypeStationCount', { count: entries.length })
    const freeDriveStatusText = freeDrive
      ? tf(WIND_STATUS_META[aggregateStatus ?? entries.reduce<WindDisplayStatus>(
          (worst, entry) => worstWindDisplayStatus(worst, overviewMarkerStatus(entry, true)),
          'no_data',
        )].labelKey as 'statusWithinLimits')
      : null
    return [region?.name, stationText, freeDriveStatusText, averageText].filter(Boolean).join(' · ')
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

  function overviewMarkerStatus(entry: OverviewStationMarker, freeDrive: boolean): WindDisplayStatus {
    return freeDrive ? entry.freeDriveStatus ?? 'no_data' : entry.status
  }

  function selectOverviewRepresentative(
    entries: OverviewStationMarker[],
    freeDrive = false,
  ): OverviewStationMarker | null {
    if (entries.length === 0) return null
    return entries.reduce((selected, entry) =>
      worstWindDisplayStatus(
        overviewMarkerStatus(selected, freeDrive),
        overviewMarkerStatus(entry, freeDrive),
      ) === overviewMarkerStatus(entry, freeDrive) ? entry : selected,
    )
  }

  function applyOverviewMarkerDensityPresentation(
    entry: OverviewStationMarker,
    level: OverviewMarkerDensityLevel,
    aggregateLabel?: string,
    aggregateTitle?: string,
    aggregateStatus?: WindDisplayStatus,
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
        if (aggregateStatus) {
          const color = WIND_STATUS_MARKER_COLOR[aggregateStatus]
          aggregate.style.borderColor = color
          aggregate.style.color = color
        }
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
    const freeDrive =
      lastMapContextRef.current === 'route' &&
      liveDriveModeRef.current === 'free-drive'
    const effectiveStatuses = freeDrive ? freeDriveVisibleStatusesRef.current : statuses
    const hasWeatherChaseSelection = weatherChaseSelectedItemsRef.current.length > 0
    const showOverview = !isChatOpenRef.current && (freeDrive || (
      lastMapContextRef.current === 'weather' &&
      !weatherChaseActiveRef.current &&
      !hasWeatherChaseSelection
    ))
    const allEntries = [
      ...overviewVegagerdinMarkersRef.current,
      ...overviewVedurstofanMarkersRef.current,
    ]
    const eligibleEntries: OverviewStationMarker[] = []

    for (const entry of allEntries) {
      const status = overviewMarkerStatus(entry, freeDrive)
      const providerIsActive = freeDrive
        ? entry.provider === 'vegagerdin'
        : (entry.provider === 'vegagerdin' && mode === 'now') ||
          (entry.provider === 'vedurstofan' && mode !== 'now')
      const eligible =
        showOverview &&
        providerIsActive &&
        (freeDrive
          ? isFreeDriveWindStatusVisible(status, effectiveStatuses)
          : statusIsVisibleInFilter(status, effectiveStatuses, routeStatusFilterModeRef.current))
      entry.element.style.display = 'none'
      if (entry.provider === 'vegagerdin') {
        updateRouteWindLabelColor(
          entry.element,
          freeDrive ? WIND_STATUS_MARKER_COLOR[status] : OVERVIEW_WEATHER_MARKER_COLOR,
        )
      }
      if (eligible) eligibleEntries.push(entry)
    }

    if (showOverview && map) {
      const level = overviewDensityLevelForZoom(map.getZoom())
      const cellSize = overviewDensityCellPxForLevel(level)

      if (freeDrive && freeDriveShowsIndividualStationMarkers(level)) {
        for (const entry of eligibleEntries) {
          entry.marker.setLngLat([entry.lon, entry.lat])
          entry.marker.setOffset([0, 0])
          entry.element.style.display = 'block'
          applyOverviewMarkerDensityPresentation(
            entry,
            level,
            undefined,
            undefined,
            overviewMarkerStatus(entry, true),
          )
        }
        return
      }

      const cells = new Map<string, {
        region?: OverviewAggregateRegion
        status?: WindDisplayStatus
        entries: OverviewStationMarker[]
      }>()

      for (const entry of eligibleEntries) {
        const region = level === 'aggregate' ? findNearestOverviewRegion(entry, map) : undefined
        const point = region ? map.project([region.lon, region.lat]) : map.project([entry.lon, entry.lat])
        const spatialKey = region?.id ?? `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`
        const rawStatus = overviewMarkerStatus(entry, freeDrive)
        const status = freeDrive ? freeDriveAggregateStatus(rawStatus) : rawStatus
        const key = overviewStationClusterKey(spatialKey, status, freeDrive)
        const group = cells.get(key)
        if (group) {
          group.entries.push(entry)
        } else {
          cells.set(key, { region, status: freeDrive ? status : undefined, entries: [entry] })
        }
      }

      for (const group of cells.values()) {
        const representative = selectOverviewRepresentative(group.entries, freeDrive)
        if (!representative) continue
        if (level === 'aggregate' && group.region) {
          representative.marker.setLngLat([group.region.lon, group.region.lat])
          representative.marker.setOffset(
            freeDrive && group.status
              ? FREE_DRIVE_AGGREGATE_MARKER_OFFSETS[group.status]
              : [0, 0],
          )
        } else {
          representative.marker.setLngLat([representative.lon, representative.lat])
          representative.marker.setOffset([0, 0])
        }
        representative.element.style.display = 'block'
        applyOverviewMarkerDensityPresentation(
          representative,
          level,
          buildOverviewAggregateLabel(group.entries, freeDrive),
          buildOverviewAggregateTitle(group.entries, group.region, freeDrive, group.status),
          freeDrive ? overviewMarkerStatus(representative, true) : undefined,
        )
      }
    }

  }

  function scheduleOverviewMarkerVisibilityUpdate() {
    if (overviewDensityFrameRef.current !== null) return
    overviewDensityFrameRef.current = window.requestAnimationFrame(() => {
      overviewDensityFrameRef.current = null
      updateOverviewMarkerVisibility()
    })
  }

  function scheduleOverviewMarkerReconciliation() {
    if (overviewMarkerReconcileFrameRef.current !== null) return
    overviewMarkerReconcileFrameRef.current = window.requestAnimationFrame(() => {
      overviewMarkerReconcileFrameRef.current = null
      if (liveDriveModeRef.current !== 'free-drive') return
      const liveMarkersAreReady = overviewVegagerdinMarkersRef.current.some(
        entry => Boolean(entry.stationId && entry.element.dataset.liveVegagerdinStation === 'true'),
      )
      if (liveMarkersAreReady) {
        updateOverviewMarkerVisibility(
          freeDriveVisibleStatusesRef.current,
          'now',
          false,
        )
        return
      }
      setOverviewMarkerReconcileVersion(current => current + 1)
    })
  }

  function hideOverviewStationMarkers() {
    if (liveDriveModeRef.current === 'free-drive') {
      scheduleOverviewMarkerReconciliation()
      return
    }
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

  function setLiveDriveModeState(mode: LiveDriveMode) {
    liveDriveModeRef.current = mode
    setLiveDriveMode(mode)
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
    if (liveDriveModeRef.current === 'free-drive') {
      if (canUseMapStyle(map)) {
        setRouteLayerLayoutVisibility(map, VEGAGERDIN_ROUTE_STATIONS_LAYER_ID, false)
        setRouteLayerLayoutVisibility(map, VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID, false)
        setRouteLayerLayoutVisibility(map, VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID, false)
        setRouteLayerLayoutVisibility(map, TRAVEL_METNO_LAYER_ID, false)
      }
      for (const { element } of [
        ...routeVegagerdinLabelMarkersRef.current,
        ...routeVedurstofanLabelMarkersRef.current,
        ...routeEndpointMarkersRef.current,
      ]) {
        element.style.display = 'none'
      }
      updateOverviewMarkerVisibility(
        freeDriveVisibleStatusesRef.current,
        'now',
        false,
      )
      return
    }
    if (routeActiveRef.current) {
      hideOverviewStationMarkers()
    }
    if (canUseMapStyle(map)) {
      setRouteLayerLayoutVisibility(map, VEGAGERDIN_ROUTE_STATIONS_LAYER_ID, mode === 'now')
      setRouteLayerLayoutVisibility(map, VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID, mode === 'now')
      setRouteLayerLayoutVisibility(map, VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID, mode === 'forecast')
      setRouteLayerLayoutVisibility(map, TRAVEL_METNO_LAYER_ID, false)
    }
    updateVegagerdinLabelMarkerState(statuses, mode)
    updateVedurstofanLabelMarkerState(statuses, mode)
    scheduleRouteLabelCollisionUpdate()
  }

  function updateForecastGlacierLabelPresentation() {
    const map = mapRef.current
    if (!map) return

    const zoom = map.getZoom()
    const glacierAreas = FORECAST_GLACIER_LABELS.map(({ areaKm2 }) => areaKm2)
    const minimumAreaLog = Math.log(Math.min(...glacierAreas))
    const maximumAreaLog = Math.log(Math.max(...glacierAreas))
    const areaLogRange = Math.max(1, maximumAreaLog - minimumAreaLog)
    const zoomAdjustment = Math.max(-0.5, Math.min(2, (zoom - ICELAND_ZOOM) * 0.55))
    const areaFormatter =
      showAllForecastGlaciersRef.current || zoom >= FORECAST_GLACIER_DETAIL_ZOOM
        ? new Intl.NumberFormat(locale)
        : null

    for (const { element, glacier } of forecastGlacierLabelMarkersRef.current) {
      const visible =
        lastMapContextRef.current === 'weather' &&
        (showAllForecastGlaciersRef.current || zoom >= glacier.minZoom)
      element.style.display = visible ? '' : 'none'
      if (!visible) continue

      const areaWeight =
        (Math.log(glacier.areaKm2) - minimumAreaLog) / areaLogRange
      element.style.fontSize = `${(10 + areaWeight * 6 + zoomAdjustment).toFixed(1)}px`
      element.textContent =
        areaFormatter
          ? `${glacier.name}\n≈ ${areaFormatter.format(glacier.areaKm2)} km²`
          : glacier.name
    }
  }

  function updateForecastMountainLabelPresentation() {
    const map = mapRef.current
    if (!map) return

    const zoom = map.getZoom()
    const mountainElevations = FORECAST_MOUNTAIN_LABELS.map(({ elevationM }) => elevationM)
    const minimumElevation = Math.min(...mountainElevations)
    const maximumElevation = Math.max(...mountainElevations)
    const elevationRange = Math.max(1, maximumElevation - minimumElevation)
    const zoomAdjustment = Math.max(-0.4, Math.min(1.5, (zoom - 7) * 0.45))
    const elevationFormatter =
      showAllForecastMountainsRef.current || zoom >= FORECAST_MOUNTAIN_DETAIL_ZOOM
        ? new Intl.NumberFormat(locale)
        : null

    for (const { element, mountain } of forecastMountainLabelMarkersRef.current) {
      const visible =
        lastMapContextRef.current === 'weather' &&
        (showAllForecastMountainsRef.current || zoom >= mountain.minZoom)
      element.style.display = visible ? '' : 'none'
      if (!visible) continue

      const elevationWeight =
        (mountain.elevationM - minimumElevation) / elevationRange
      element.style.fontSize = `${(10 + elevationWeight * 4 + zoomAdjustment).toFixed(1)}px`
      element.textContent =
        elevationFormatter
          ? `▲ ${mountain.name}\n${elevationFormatter.format(mountain.elevationM)} m`
          : `▲ ${mountain.name}`
    }
  }

  function updateRouteEndpointMarkerVisibility() {
    for (const { element, kind } of routeEndpointMarkersRef.current) {
      const visible = shouldShowRouteEndpointMarker({
        routeContextVisible:
          lastMapContextRef.current === 'route' &&
          liveDriveModeRef.current !== 'free-drive',
        endpointMarkersCurrent: routeEndpointMarkersAreCurrentRef.current,
        livePuckVisible: routeLiveLocationMarkerRef.current !== null,
        kind,
      })
      element.style.display = visible ? '' : 'none'
    }
  }

  function applyLiveRouteMapPresentation(active: boolean) {
    routeLiveMapPresentationActiveRef.current = active
    const map = mapRef.current
    if (canUseMapStyle(map)) {
      const routeVisible =
        lastMapContextRef.current === 'route' &&
        liveDriveModeRef.current !== 'free-drive' &&
        hasRoadIntelligence
      const presentation = resolveLiveRouteMapPresentation({
        liveTrackingActive: active && routeVisible,
        configuredVegagerdinRasterVisibility:
          routeVisible && showOverlayRef.current ? 'visible' : 'none',
        configuredRoadSegmentsVisibility:
          routeVisible && showSegmentsRef.current ? 'visible' : 'none',
      })
      setRouteLayerLayoutVisibility(
        map,
        'vegagerdin-vegakerfi',
        presentation.vegagerdinRasterVisibility === 'visible',
      )
      setRouteLayerLayoutVisibility(
        map,
        'road-segments',
        presentation.roadSegmentsVisibility === 'visible',
      )
      if (map.getLayer('road-segments')) {
        map.setFilter(
          'road-segments',
          presentation.roadSegmentsFilter as Parameters<typeof map.setFilter>[1],
        )
      }
    }
    for (const { element } of routeVegagerdinLabelMarkersRef.current) {
      updateLiveDriveTemperaturePresentation(element, active)
    }
    updateRouteEndpointMarkerVisibility()
  }
  applyLiveRouteMapPresentationRef.current = applyLiveRouteMapPresentation

  function applyMapContextVisibility(context: 'weather' | 'route') {
    lastMapContextRef.current = context
    const map = mapRef.current
    if (!canUseMapStyle(map)) return

    if (context === 'weather') {
      updateForecastGlacierLabelPresentation()
      updateForecastMountainLabelPresentation()
      setRouteLayerLayoutVisibility(map, 'carto-basemap', false)
      setRouteLayerLayoutVisibility(map, 'vegagerdin-vegakerfi', false)
      setRouteLayerLayoutVisibility(map, 'road-segments', false)
      if (map.getLayer('road-segments')) map.setFilter('road-segments', null)
      setRouteLayerLayoutVisibility(map, 'travel-bridge-route', false)
      setRouteLayerLayoutVisibility(map, ROUTE_GRAVEL_SECTIONS_LAYER_ID, false)
      setRouteLayerLayoutVisibility(map, ROUTE_DIRECTION_SECTIONS_LAYER_ID, false)
      setRouteLayerLayoutVisibility(map, TRAVEL_METNO_LAYER_ID, false)
      setRouteLayerLayoutVisibility(map, VEGAGERDIN_ROUTE_STATIONS_LAYER_ID, false)
      setRouteLayerLayoutVisibility(map, VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID, false)
      setRouteLayerLayoutVisibility(map, VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID, false)
      for (const { element } of [
        ...routeVegagerdinLabelMarkersRef.current,
        ...routeVedurstofanLabelMarkersRef.current,
        ...routeEndpointMarkersRef.current,
      ]) {
        element.style.display = 'none'
      }
      updateOverviewLayerVisibility(overviewActiveModeRef.current, false)
      updateOverviewMarkerVisibility(
        overviewVisibleStatusesRef.current,
        overviewActiveModeRef.current,
        false,
      )
      return
    }

    if (liveDriveModeRef.current === 'free-drive') {
      clearWeatherChaseMapMarkers()
      for (const { element } of placeMarkersRef.current) {
        element.style.display = 'none'
      }
      for (const { element } of [
        ...routeVegagerdinLabelMarkersRef.current,
        ...routeVedurstofanLabelMarkersRef.current,
        ...routeEndpointMarkersRef.current,
        ...forecastGlacierLabelMarkersRef.current,
        ...forecastMountainLabelMarkersRef.current,
      ]) {
        element.style.display = 'none'
      }
      setRouteLayerLayoutVisibility(map, 'carto-basemap', true)
      setRouteLayerLayoutVisibility(map, 'vegagerdin-vegakerfi', false)
      setRouteLayerLayoutVisibility(map, 'road-segments', false)
      if (map.getLayer('road-segments')) map.setFilter('road-segments', null)
      setRouteLayerLayoutVisibility(map, 'travel-bridge-route', false)
      setRouteLayerLayoutVisibility(map, ROUTE_GRAVEL_SECTIONS_LAYER_ID, false)
      setRouteLayerLayoutVisibility(map, ROUTE_DIRECTION_SECTIONS_LAYER_ID, false)
      setRouteLayerLayoutVisibility(map, TRAVEL_METNO_LAYER_ID, false)
      setRouteLayerLayoutVisibility(map, VEGAGERDIN_ROUTE_STATIONS_LAYER_ID, false)
      setRouteLayerLayoutVisibility(map, VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID, false)
      setRouteLayerLayoutVisibility(map, VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID, false)
      updateOverviewMarkerVisibility(
        overviewVisibleStatusesRef.current,
        'now',
        false,
      )
      return
    }

    clearWeatherChaseMapMarkers()
    hideOverviewStationMarkers()
    for (const { element } of forecastGlacierLabelMarkersRef.current) {
      element.style.display = 'none'
    }
    for (const { element } of forecastMountainLabelMarkersRef.current) {
      element.style.display = 'none'
    }
    setRouteLayerLayoutVisibility(map, 'carto-basemap', true)
    applyLiveRouteMapPresentation(routeLiveMapPresentationActiveRef.current)
    setRouteLayerLayoutVisibility(
      map,
      'travel-bridge-route',
      Boolean(routeBridgeSummary) || routeSurfaceChoices.length > 0,
    )
    setRouteLayerLayoutVisibility(
      map,
      ROUTE_GRAVEL_SECTIONS_LAYER_ID,
      routeSectionsState.status === 'ready'
        && routeSectionsState.response.data.surface.gravelSections.length > 0,
    )
    setRouteLayerLayoutVisibility(
      map,
      ROUTE_DIRECTION_SECTIONS_LAYER_ID,
      routeSectionsState.status === 'ready'
        && routeSectionsState.response.data.direction.status === 'verified'
        && routeSectionsState.response.data.direction.inferredSections.length > 0,
    )
    updateRouteEndpointMarkerVisibility()
    updateRouteWeatherLayerVisibility(
      routeWeatherModeRef.current,
      visibleRouteStatusesRef.current,
    )
  }

  function createOverviewStationDotElement({
    stationName,
    windText,
    gustText,
    directionText,
    directionDegrees,
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
    directionDegrees?: number | null
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
      directionDegrees,
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
    appendOverviewAggregate(element, overviewLabel)
    return element
  }

  function appendOverviewAggregate(
    element: HTMLButtonElement,
    overviewLabel: string,
  ) {
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

  function applyWeatherChaseCardCollisionAvoidance() {
    const mapBounds = containerRef.current?.getBoundingClientRect() ?? null
    const stacks = weatherChaseMapMarkersRef.current
      .filter(marker => marker.kind === 'selected')
      .map(({ element }) => element.querySelector<HTMLElement>('[data-route-weather-stack="true"]'))
      .filter((stack): stack is HTMLElement => Boolean(stack))
    const obstacleRects = Array.from(
      containerRef.current?.parentElement?.querySelectorAll<HTMLElement>(
        '[data-weather-card-obstacle="true"]',
      ) ?? [],
    )
      .filter(element => {
        const style = window.getComputedStyle(element)
        return style.display !== 'none' && style.visibility !== 'hidden'
      })
      .map(element => element.getBoundingClientRect())
    const nearbyLabelRects = weatherChaseMapMarkersRef.current
      .filter(marker => marker.kind === 'nearby-vedurstofan')
      .map(({ element }) =>
        element.querySelector<HTMLElement>('[data-route-weather-stack="true"]')
          ?.getBoundingClientRect() ?? null,
      )
      .filter((rect): rect is DOMRect => rect !== null)
    const acceptedRects: DOMRect[] = []
    let hiddenCount = 0

    for (const stack of stacks) {
      stack.style.display = 'flex'
      stack.style.visibility = 'hidden'
      stack.style.transform = 'translateX(-50%)'
      const baseRect = stack.getBoundingClientRect()
      const stepX = Math.max(54, baseRect.width + 10)
      const stepY = Math.max(48, baseRect.height + 10)
      const candidateOffsets: ReadonlyArray<readonly [number, number]> = [
        [0, 0],
        [stepX, 0],
        [-stepX, 0],
        [0, stepY],
        [0, -stepY],
        [stepX, stepY],
        [-stepX, stepY],
        [stepX, -stepY],
        [-stepX, -stepY],
        [stepX * 2, 0],
        [-stepX * 2, 0],
        [0, stepY * 2],
        [0, -stepY * 2],
        [stepX * 2, stepY],
        [-stepX * 2, stepY],
        [stepX * 2, -stepY],
        [-stepX * 2, -stepY],
      ]
      const ownDot = stack.parentElement?.querySelector<HTMLElement>('[data-route-wind-dot="true"]')
      const otherPointRects = weatherChaseMapMarkersRef.current
        .map(({ element }) => element.querySelector<HTMLElement>('[data-route-wind-dot="true"]'))
        .filter((dot): dot is HTMLElement => Boolean(dot) && dot !== ownDot)
        .map(dot => dot.getBoundingClientRect())
      let placed = false
      for (const [x, y] of candidateOffsets) {
        stack.style.transform = `translateX(-50%) translate(${x}px, ${y}px)`
        const rect = stack.getBoundingClientRect()
        const staysInsideMap = !mapBounds || (
          rect.left >= mapBounds.left + 6 &&
          rect.right <= mapBounds.right - 6 &&
          rect.top >= mapBounds.top + 6 &&
          rect.bottom <= mapBounds.bottom - 6
        )
        const overlapsCard = acceptedRects.some(accepted => rectsOverlap(rect, accepted, 6))
        const overlapsInterface = obstacleRects.some(obstacle => rectsOverlap(rect, obstacle, 6))
        const overlapsNearbyLabel = nearbyLabelRects.some(label => rectsOverlap(rect, label, 4))
        const overlapsOtherPoint = otherPointRects.some(point => rectsOverlap(rect, point, 4))
        if (
          staysInsideMap &&
          !overlapsCard &&
          !overlapsInterface &&
          !overlapsNearbyLabel &&
          !overlapsOtherPoint
        ) {
          acceptedRects.push(rect)
          stack.style.visibility = 'visible'
          updateWeatherChaseCardConnector(stack.parentElement)
          const connector = stack.parentElement?.querySelector<HTMLElement>(
            '[data-weather-card-connector="true"]',
          )
          if (connector) connector.style.display = ''
          placed = true
          break
        }
      }
      if (!placed) {
        hiddenCount += 1
        stack.style.display = 'none'
        stack.style.visibility = 'visible'
        const connector = stack.parentElement?.querySelector<HTMLElement>(
          '[data-weather-card-connector="true"]',
        )
        if (connector) connector.style.display = 'none'
      }
    }
    setHiddenForecastCardCount(current => current === hiddenCount ? current : hiddenCount)
  }

  function updateWeatherChaseCardConnector(
    markerElement: HTMLElement | null,
  ) {
    const connector = markerElement?.querySelector<HTMLElement>('[data-weather-card-connector="true"]')
    const stack = markerElement?.querySelector<HTMLElement>('[data-route-weather-stack="true"]')
    if (!connector || !stack || !markerElement) return

    const markerRect = markerElement.getBoundingClientRect()
    const originX = markerRect.left
    const originY = markerRect.top
    const connectableRects = Array.from(
      stack.querySelectorAll<HTMLElement>(
        '[data-route-wind-value="true"], [data-route-wind-name="true"]',
      ),
    ).map(element => element.getBoundingClientRect())
    const targetRects = connectableRects.length > 0
      ? connectableRects
      : [stack.getBoundingClientRect()]

    const closestTarget = targetRects
      .map(rect => {
        let x = Math.min(Math.max(originX, rect.left), rect.right)
        let y = Math.min(Math.max(originY, rect.top), rect.bottom)
        const pointInside = (
          originX >= rect.left &&
          originX <= rect.right &&
          originY >= rect.top &&
          originY <= rect.bottom
        )
        if (!pointInside) {
          return { x, y, distance: Math.hypot(x - originX, y - originY) }
        }

        // If the station point falls inside the target, connect it to the
        // nearest side instead of drawing a zero-length line through it.
      const sideDistances = [
          { side: 'left' as const, distance: originX - rect.left },
          { side: 'right' as const, distance: rect.right - originX },
          { side: 'top' as const, distance: originY - rect.top },
          { side: 'bottom' as const, distance: rect.bottom - originY },
      ].sort((a, b) => a.distance - b.distance)
      switch (sideDistances[0]?.side) {
        case 'left':
            x = rect.left
          break
        case 'right':
            x = rect.right
          break
        case 'top':
            y = rect.top
          break
        case 'bottom':
            y = rect.bottom
          break
      }
        return { x, y, distance: Math.hypot(x - originX, y - originY) }
      })
      .sort((a, b) => a.distance - b.distance)[0]
    if (!closestTarget) return

    const deltaX = closestTarget.x - originX
    const deltaY = closestTarget.y - originY
    const length = Math.max(1, Math.hypot(deltaX, deltaY))
    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI)
    connector.style.width = `${length}px`
    connector.style.transform = `rotate(${angle}deg)`
  }

  function createWeatherChaseMapMarkerElement(
    item: WeatherChaseItem,
    row: ForecastDrawerRow | null,
    kind: WeatherChaseMapMarker['kind'],
    medal?: string | null,
  ): HTMLButtonElement {
    const windText = row ? formatNum(row.wind.value, locale) : '–'
    const gustText = row && Math.abs(row.gust.value - row.wind.value) >= 0.1
      ? formatNum(row.gust.value, locale)
      : null
    const compactProviderLabel =
      item.providerId === 'vedurstofan'
        ? 'IS'
        : item.providerId === 'metno'
          ? 'NO'
          : item.providerLabel
    const element = createRouteWeatherPointMarkerElement({
      stationName: item.label,
      windText,
      gustText,
      directionText: row?.windDirectionText ?? null,
      temperatureText: row ? formatNum(row.temperature.value, locale) : null,
      precipitationText: row ? formatNum(row.precipitation.value, locale) : null,
      weatherEmoji: row?.weatherEmoji ?? null,
      providerLabel: compactProviderLabel,
      color: kind === 'nearby-vedurstofan' ? '#64748b' : '#2563eb',
      compact: true,
      showNameLabel: true,
      showWeatherCard: kind === 'selected',
      showConnectorLine: kind === 'selected',
      onClick: () => {},
    })
    element.dataset.weatherChaseMapMarker = kind
    const providerElement = element.querySelector<HTMLElement>('[data-weather-provider="true"]')
    if (providerElement) {
      providerElement.title = item.providerLabel
      providerElement.setAttribute('aria-label', item.providerLabel)
    }
    element.style.zIndex = kind === 'nearby-vedurstofan' ? '18' : '20'
    if (kind === 'nearby-vedurstofan') {
      element.style.opacity = '0.88'
    }
    if (medal) {
      element.style.position = 'relative'
      const badge = document.createElement('span')
      badge.style.cssText = 'position:absolute;top:-7px;right:-7px;font-size:13px;line-height:1;pointer-events:none;z-index:1'
      badge.textContent = medal
      element.appendChild(badge)
    }
    return element
  }

  function openOverviewVegagerdinPopup(
    station: VegagerdinCurrentStationDto,
    _coords: [number, number],
  ) {
    popupRef.current?.remove()
    const externalHref = vegagerdinStationUrl(station.stationId)
    if (externalHref && shouldOpenVegagerdinStationExternally(station.measuredAtIso)) {
      window.open(externalHref, '_blank', 'noopener,noreferrer')
      return
    }
    selectedVegagerdinOriginRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    setSelectedVegagerdinStation(station)
    setSelectedVegagerdinDetail(null)
    setSelectedVegagerdinDetailLoading(true)
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

  useEffect(() => {
    if (!selectedVegagerdinStation) return
    let cancelled = false
    const controller = new AbortController()
    fetch(`/api/teskeid/weather/vegagerdin/stations/${selectedVegagerdinStation.stationId}`, {
      signal: controller.signal,
    })
      .then(response => response.ok ? response.json() : null)
      .then((detail: VegagerdinStationDetail | null) => {
        if (!cancelled) setSelectedVegagerdinDetail(detail)
      })
      .catch(() => {
        if (!cancelled) setSelectedVegagerdinDetail(null)
      })
      .finally(() => {
        if (!cancelled) setSelectedVegagerdinDetailLoading(false)
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [selectedVegagerdinStation])

  function updateVegagerdinLabelMarkerState(
    statuses = visibleRouteStatusesRef.current,
    mode = routeWeatherModeRef.current,
  ) {
    for (const { element, point } of routeVegagerdinLabelMarkersRef.current) {
      const visible = mode === 'now' && routeStatusIsVisible(point.windDisplayStatus, statuses)
      const color = WIND_STATUS_MARKER_COLOR[point.windDisplayStatus]
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
      const color = WIND_STATUS_MARKER_COLOR[entry.windDisplayStatus]
      element.style.display = visible ? 'block' : 'none'
      updateRouteWindLabelColor(element, color)
    }
  }

  function handleRouteStatusFilterModeChange(mode: WindStatusFilterMode) {
    routeStatusFilterModeRef.current = mode
    setRouteStatusFilterMode(mode)
    updateRouteWeatherLayerVisibility()
    updateOverviewMarkerVisibility()
  }

  function setActiveRouteFieldState(field: RouteBridgeField) {
    activeRouteFieldRef.current = field
  }

  function invalidateRouteRequests() {
    routeBridgeRunIdRef.current += 1
    abortControllerRef(routeBridgeRequestRef)
    abortControllerRef(routeDiscoveryRequestRef)
    abortControllerRef(routeSectionsRefreshRequestRef)
  }

  function openRoutePlanningDestination() {
    setFreeDriveSetupOpen(false)
    setRouteBridgeError(null)
    setRouteThresholdError(null)
    setRoutePlaceFallbackSuggestion(null)
    setRouteFrom('')
    setRouteTo('')
    setFromResolved(null)
    setToResolved(null)
    setFromSuggestions([])
    setToSuggestions([])
    setRoutePlanningCautionWind('')
    setRoutePlanningRedWind('')
    setRoutePlanningStep('destination')
    setActiveRouteFieldState('to')
  }

  function goToRoutePlanningStep(target: Exclude<RoutePlanningStep, 'idle'>) {
    if (target === routePlanningStep) return
    if (target === 'destination') {
      setRouteBridgeError(null)
      setRoutePlaceFallbackSuggestion(null)
      setRoutePlanningStep('destination')
      setActiveRouteFieldState('to')
      return
    }
    if (!toResolved) {
      setRouteBridgeError(t('roadMapPrototypeRouteDestinationMissing'))
      return
    }
    if (target === 'origin') {
      setRouteBridgeError(null)
      setRoutePlaceFallbackSuggestion(null)
      setRoutePlanningStep('origin')
      setActiveRouteFieldState('from')
      return
    }
    if (!fromResolved) {
      setRouteBridgeError(t('roadMapPrototypeRouteOriginMissing'))
      return
    }
    setRouteBridgeError(null)
    setRoutePlaceFallbackSuggestion(null)
    setRoutePlanningStep('thresholds')
    setActiveRouteFieldState('from')
  }

  function handleRoutePlanningContinue() {
    if (routePlanningStep === 'destination') {
      goToRoutePlanningStep('origin')
      return
    }
    if (routePlanningStep === 'origin') {
      goToRoutePlanningStep('thresholds')
    }
  }

  function handleRoutePlanningBack() {
    setRouteBridgeError(null)
    setRoutePlaceFallbackSuggestion(null)
    if (routePlanningStep === 'thresholds') {
      setRoutePlanningStep('origin')
      setActiveRouteFieldState('from')
      return
    }
    if (routePlanningStep === 'origin') {
      setRoutePlanningStep('destination')
      setActiveRouteFieldState('to')
      return
    }
    setRoutePlanningStep('idle')
    setActiveRouteFieldState('to')
  }

  function handleRouteStatusFilterChange(next: Set<WindDisplayStatus>) {
    visibleRouteStatusesRef.current = next
    setVisibleRouteStatuses(next)
    applyRouteStatusFilterToMap(mapRef.current, next, ROUTE_WIND_STATUS_FILTER_MODE)
    updateRouteWeatherLayerVisibility(routeWeatherModeRef.current, next)
  }

  function handleOverviewStatusFilterChange(next: Set<WindDisplayStatus>) {
    overviewVisibleStatusesRef.current = next
    setOverviewVisibleStatuses(next)
    updateOverviewMarkerVisibility(next)
  }

  function handleFreeDriveStatusFilterChange(next: Set<WindDisplayStatus>) {
    freeDriveVisibleStatusesRef.current = next
    setFreeDriveVisibleStatuses(next)
    updateOverviewMarkerVisibility(
      next,
      'now',
      false,
    )
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

    const layer = vedurstofanLayerRef.current
    const candidates = routeCandidates
    const candidate = candidates ? candidates[idx] : null

    if (!candidate) {
      handleSelectRouteNow()
      return
    }
    setSelectedCandidateIdx(idx)
    if (layer) {
      const newDepartureMs = Date.parse(candidate.departureIso)
      const render = renderVedurstofanStations(
        layer,
        routeDurationMinutesRef.current,
        routeThresholdsRef.current,
        newDepartureMs,
      )
      setRouteVisibleStatusCounts(render.statusCounts)
    } else {
      setRouteVisibleStatusCounts({})
    }
    setRouteWeatherModeState('forecast')
    updateRouteWeatherLayerVisibility('forecast')
  }

  function resolveRouteThresholdInputs(
    cautionValue = routeCautionWind,
    redValue = routeRedWind,
  ): ResolvedTravelThresholds | null {
    const validation = validateRouteThresholdInputs(cautionValue, redValue)
    if (validation.error === 'value') {
      setRouteThresholdError(t('roadMapPrototypeThresholdError'))
      return null
    }
    if (validation.error === 'ordering') {
      setRouteThresholdError(t('thresholdBarOrderingError'))
      return null
    }
    setRouteThresholdError(null)
    return validation.thresholds
  }

  async function savePlaceBestEffort(place: RoadIntelligencePlaceResult) {
    // Device GPS and hand-picked points are precise personal data. Never turn
    // either into a recent/saved place as a side effect of route selection.
    if (place.source === 'device' || place.source === 'map') return
    if (!isAuthenticated) {
      try {
        const key = makeWeatherPlaceKey(place.lat, place.lon)
        const current = readPublicSavedPlaces(window.sessionStorage)
        const existing = current.find(item => makeWeatherPlaceKey(item.lat, item.lon) === key)
        const nextPlace: SavedWeatherPlace = {
          id: `session:${key}`,
          name: place.name,
          formattedAddress: place.formattedAddress ?? '',
          lat: place.lat,
          lon: place.lon,
          usageCount: (existing?.usageCount ?? 0) + 1,
          lastUsedAt: new Date().toISOString(),
        }
        const next = [
          nextPlace,
          ...current.filter(item => makeWeatherPlaceKey(item.lat, item.lon) !== key),
        ].slice(0, PUBLIC_SAVED_PLACES_LIMIT)
        writePublicSavedPlaces(window.sessionStorage, next)
        setSavedPlaces(next.slice(0, 12))
      } catch {}
      return
    }
    try {
      await fetch('/api/teskeid/weather/saved-places', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: place.name, formattedAddress: place.formattedAddress, lat: place.lat, lon: place.lon }),
      })
      const listRes = await fetch('/api/teskeid/weather/saved-places', { credentials: 'same-origin' })
      if (listRes.ok) {
        const data = await listRes.json()
        setSavedPlaces(Array.isArray(data?.places) ? (data.places as SavedWeatherPlace[]) : [])
      }
    } catch {}
  }

  function deleteSavedPlace(placeId: string) {
    setSavedPlaces(prev => {
      const next = prev.filter(place => place.id !== placeId)
      if (!isAuthenticated) {
        try {
          const allSessionPlaces = readPublicSavedPlaces(window.sessionStorage)
          writePublicSavedPlaces(
            window.sessionStorage,
            allSessionPlaces.filter(place => place.id !== placeId),
          )
        } catch {}
      }
      return next
    })
    if (isAuthenticated) {
      void fetch(`/api/teskeid/weather/saved-places/${placeId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
    }
  }

  function selectRoutePlace(place: RoadIntelligencePlaceResult, target = activeRouteFieldRef.current) {
    setRouteBridgeError(null)
    setRoutePlaceFallbackSuggestion(null)
    const oppositePlace = target === 'from' ? toResolved : fromResolved
    if (
      oppositePlace &&
      (
        (
          place.source && oppositePlace.source &&
          place.sourceId && oppositePlace.sourceId &&
          place.source === oppositePlace.source &&
          place.sourceId === oppositePlace.sourceId
        ) ||
        (
          place.googlePlaceId && oppositePlace.googlePlaceId &&
          place.googlePlaceId === oppositePlace.googlePlaceId
        ) ||
        (place.placeId && oppositePlace.placeId && place.placeId === oppositePlace.placeId) ||
        makeWeatherPlaceKey(place.lat, place.lon) === makeWeatherPlaceKey(oppositePlace.lat, oppositePlace.lon)
      )
    ) {
      return
    }
    if (target === 'from') {
      setRouteFrom(place.name)
      setFromResolved(place)
      setFromSuggestions([])
      setActiveRouteFieldState(routePlanningStep === 'origin' ? 'from' : 'to')
      void savePlaceBestEffort(place)
      if (routePlanningStep !== 'origin' && !toResolved) {
        requestAnimationFrame(() => routeToInputRef.current?.focus())
      }
      return
    }

    setRouteTo(place.name)
    setToResolved(place)
    setToSuggestions([])
    setActiveRouteFieldState('to')
    void savePlaceBestEffort(place)
  }

  function applyNearbyRouteFallback() {
    const suggestion = routePlaceFallbackSuggestion
    if (!suggestion) return
    if (suggestion.field === 'from') {
      setRouteFrom(suggestion.nearbyPlace.name)
      setFromResolved(suggestion.nearbyPlace)
      setFromSuggestions([])
    } else {
      setRouteTo(suggestion.nearbyPlace.name)
      setToResolved(suggestion.nearbyPlace)
      setToSuggestions([])
    }
    setRouteBridgeError(null)
    setRoutePlaceFallbackSuggestion(null)
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
    routeEndpointMarkersAreCurrentRef.current = false
  }

  function clearRouteOwnedMapPresentation() {
    clearRouteVedurstofanLabelMarkers()
    clearRouteVegagerdinLabelMarkers()
    clearRouteEndpointMarkers()
    const map = mapRef.current
    if (!map) return
    for (const sourceId of [
      VEGAGERDIN_ROUTE_STATIONS_LAYER_ID,
      VEGAGERDIN_ROUTE_WIND_ARROWS_SOURCE_ID,
      VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID,
      TRAVEL_METNO_LAYER_ID,
      'travel-bridge-route',
      ROUTE_GRAVEL_SECTIONS_SOURCE_ID,
      ROUTE_DIRECTION_SECTIONS_SOURCE_ID,
    ] as const) {
      const source = map.getSource(sourceId)
      if (source) {
        ;(source as import('maplibre-gl').GeoJSONSource).setData(
          EMPTY_FEATURE_COLLECTION as never,
        )
      }
    }
    for (const layerId of [
      VEGAGERDIN_ROUTE_STATIONS_LAYER_ID,
      VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID,
      VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID,
      TRAVEL_METNO_LAYER_ID,
      'travel-bridge-route',
      ROUTE_GRAVEL_SECTIONS_LAYER_ID,
      ROUTE_DIRECTION_SECTIONS_LAYER_ID,
    ] as const) {
      setRouteLayerLayoutVisibility(map, layerId, false)
    }
  }

  function resetRouteOwnedState() {
    routeActiveRef.current = false
    setRouteActive(false)
    setRouteBridgeStatus('idle')
    setRouteBridgeError(null)
    setRoutePlaceFallbackSuggestion(null)
    setRouteThresholdError(null)
    setRouteBridgeSummary(null)
    setRouteHandoffOnlySummary(null)
    routeForecastRetryContextRef.current = null
    setRouteForecastRetryPending(false)
    setRouteTravelResult(null)
    setRouteVedurstofanLayer(null)
    setRouteFrom('')
    setRouteTo('')
    setRoutePlanningCautionWind('')
    setRoutePlanningRedWind('')
    setFromResolved(null)
    setToResolved(null)
    setFromSuggestions([])
    setToSuggestions([])
    setRouteCandidates(null)
    setRouteNowStatusCounts(null)
    setRouteNowMeasuredAtIso(null)
    setRouteNowMeasurementFreshness(null)
    setRouteWindArrowCount(0)
    setRouteVegagerdinLastRefreshIso(null)
    setRouteVisibleStatusCounts(null)
    resetRouteDepartureForecastState()
    setRouteSurfaceChoices([])
    setRouteSurfaceChoicesStatus('idle')
    setRouteSwitchingChoiceId(null)
    setTeskeidCandidateStatus('idle')
    setRouteGuestQuotaReached(false)
    setRouteQuotaSignInPending(false)
    setPreviewRouteChoiceId(null)
    setRouteSectionsState({ status: 'idle', routeIdentity: null, response: null })
    setRouteSectionHighlight(null)
    setRouteComparisonFullscreen(false)
    setRouteComparisonOpening(false)
    routeComparisonApplyPendingRef.current = false
    setRouteComparisonApplyPending(false)
    pendingWeatherResultsFocusRunIdRef.current = null
    routeComparisonAutoOpenedRunIdRef.current = null
    setVisibleCandidateLimit(ROUTE_TIMELINE_INITIAL_SLOT_COUNT)
    setRouteCalculationPlaceNames(null)
    setSelectedCandidateIdx(null)
    setRouteWeatherModeState('now')
    setRoutePlanningStep('idle')
    setActiveRouteFieldState('to')
    vedurstofanLayerRef.current = undefined
    routeAuditPolylinePointsRef.current = []
    routeVegagerdinCacheStatusRef.current = null
    routeDurationMinutesRef.current = 0
    resolvedRoutePlacesRef.current = null
  }

  function updateViewportWindDirectionMarkers() {
    const mapBearing = mapRef.current?.getBearing() ?? 0
    containerRef.current
      ?.querySelectorAll<HTMLElement>('[data-wind-toward-bearing]')
      .forEach(direction => {
        const windTowardBearing = Number(direction.dataset.windTowardBearing)
        if (!Number.isFinite(windTowardBearing)) return
        direction.style.transform = `rotate(${normalizeHeadingDegrees(
          windTowardBearing - mapBearing,
        )}deg)`
      })
  }

  function updateRouteLiveLocationPuckDirection() {
    const map = mapRef.current
    const direction = routeLiveLocationPuckDirectionRef.current
    const point = routeLiveLocationPointRef.current
    if (!map || !direction) return
    if (point?.headingDeg === null || point?.headingDeg === undefined) {
      direction.style.display = 'none'
      routeLiveLocationPuckVisualAngleRef.current = null
      return
    }

    direction.style.display = 'block'
    const viewportHeading = normalizeHeadingDegrees(point.headingDeg - map.getBearing())
    const visualHeading = nearestEquivalentHeadingDegrees(
      routeLiveLocationPuckVisualAngleRef.current,
      viewportHeading,
    )
    routeLiveLocationPuckVisualAngleRef.current = visualHeading
    direction.style.transform = `rotate(${visualHeading}deg)`
  }

  function moveRouteLiveLocationCamera(point = routeLiveLocationPointRef.current) {
    const map = mapRef.current
    if (!map || !point || routeLiveLocationFollowModeRef.current !== 'follow') return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const bottomOverlayHeight = routeBottomStripRef.current?.getBoundingClientRect().height ?? 0
    const offset = resolveLiveLocationCameraOffset(
      bottomOverlayHeight,
      map.getContainer().clientHeight,
    )
    const bearing = resolveLiveLocationCameraBearing(
      routeLiveLocationOrientationModeRef.current,
      point.headingDeg,
    )
    map.easeTo({
      center: [point.lon, point.lat],
      zoom: routeLiveLocationFollowZoomRef.current,
      offset,
      ...(bearing !== null ? { bearing } : {}),
      duration: reduceMotion ? 0 : 350,
    })
  }

  function attachRouteLiveLocationMapListeners() {
    const map = mapRef.current
    if (!map) return
    routeLiveLocationMapListenersCleanupRef.current?.()

    const leaveFollowForUserGesture = (event: { originalEvent?: unknown }) => {
      const decision = reduceLiveLocationFollowMode(
        routeLiveLocationFollowModeRef.current,
        event.originalEvent ? 'user_camera' : 'programmatic_camera',
      )
      if (decision.mode === routeLiveLocationFollowModeRef.current) return
      routeLiveLocationFollowModeRef.current = decision.mode
      setRouteLiveLocationFollowMode(decision.mode)
    }
    const syncMapDirections = () => {
      updateRouteLiveLocationPuckDirection()
      updateViewportWindDirectionMarkers()
    }

    map.on('dragstart', leaveFollowForUserGesture)
    map.on('zoomstart', leaveFollowForUserGesture)
    map.on('rotatestart', leaveFollowForUserGesture)
    map.on('pitchstart', leaveFollowForUserGesture)
    map.on('rotate', syncMapDirections)
    routeLiveLocationMapListenersCleanupRef.current = () => {
      map.off('dragstart', leaveFollowForUserGesture)
      map.off('zoomstart', leaveFollowForUserGesture)
      map.off('rotatestart', leaveFollowForUserGesture)
      map.off('pitchstart', leaveFollowForUserGesture)
      map.off('rotate', syncMapDirections)
    }
  }

  function updateRouteLiveLocationMarker(point: LiveLocationPoint) {
    const map = mapRef.current
    const Marker = markerConstructorRef.current
    if (!map || !Marker) return

    let marker = routeLiveLocationMarkerRef.current
    if (!marker) {
      const element = document.createElement('div')
      element.setAttribute('role', 'img')
      element.setAttribute('aria-label', t('roadMapPrototypeLiveLocationMarkerLabel'))
      element.title = t('roadMapPrototypeLiveLocationMarkerLabel')
      element.style.cssText = [
        'display:grid',
        'place-items:center',
        'width:28px',
        'height:28px',
        'border:3px solid rgba(255,255,255,0.96)',
        'border-radius:999px',
        'background:#2563eb',
        'box-shadow:0 1px 7px rgba(15,23,42,0.38)',
        'z-index:50',
        'pointer-events:none',
      ].join(';')
      const direction = document.createElement('div')
      direction.setAttribute('aria-hidden', 'true')
      direction.style.cssText = [
        'display:none',
        'width:11px',
        'height:16px',
        'background:rgba(255,255,255,0.98)',
        'clip-path:polygon(50% 0,100% 100%,50% 78%,0 100%)',
        'transform-origin:center',
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'transition:none'
          : 'transition:transform 160ms linear',
      ].join(';')
      element.appendChild(direction)
      marker = new Marker({ element, anchor: 'center' })
        .setLngLat([point.lon, point.lat])
        .addTo(map)
      routeLiveLocationMarkerRef.current = marker
      routeLiveLocationPuckDirectionRef.current = direction
      updateRouteEndpointMarkerVisibility()
    } else {
      marker.setLngLat([point.lon, point.lat])
    }
    updateRouteLiveLocationPuckDirection()
    moveRouteLiveLocationCamera(point)
  }

  function handleRecenterRouteLiveLocation() {
    if (!routeLiveLocationPointRef.current) return
    const decision = reduceLiveLocationFollowMode(
      routeLiveLocationFollowModeRef.current,
      'recenter',
    )
    routeLiveLocationFollowModeRef.current = decision.mode
    setRouteLiveLocationFollowMode(decision.mode)
    if (decision.moveCamera) moveRouteLiveLocationCamera()
  }

  function handleRouteMapCompassClick() {
    const map = mapRef.current
    if (!map) return

    const liveTracking =
      routeLiveLocationStatus === 'waiting' || routeLiveLocationStatus === 'active'
    if (liveTracking) {
      routeLiveLocationOrientationModeRef.current = 'north-up'
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    map.easeTo({
      bearing: 0,
      duration: reduceMotion ? 0 : 300,
    })
  }

  function handleRouteLiveLocationZoomChange(delta: -1 | 1) {
    const nextZoom = clampLiveLocationFollowZoom(
      routeLiveLocationFollowZoomRef.current + delta,
    )
    routeLiveLocationFollowZoomRef.current = nextZoom
    setRouteLiveLocationFollowZoom(nextZoom)
    try {
      window.localStorage.setItem(LIVE_LOCATION_FOLLOW_ZOOM_STORAGE_KEY, String(nextZoom))
    } catch {
      // The in-memory zoom still applies when browser storage is unavailable.
    }
    const decision = reduceLiveLocationFollowMode(
      routeLiveLocationFollowModeRef.current,
      'zoom_changed',
    )
    if (decision.moveCamera) moveRouteLiveLocationCamera()
  }

  function liveLocationContextIsCurrent(mode: Exclude<LiveDriveMode, 'off'>): boolean {
    if (
      !isAuthenticated ||
      lastMapContextRef.current !== 'route' ||
      routeContextViewRef.current !== 'map' ||
      liveDriveModeRef.current !== mode
    ) return false
    if (mode === 'free-drive') return true
    return routeActiveRef.current && routeWeatherModeRef.current === 'now'
  }

  function startRouteLiveLocation(mode: Exclude<LiveDriveMode, 'off'> = 'route') {
    if (routeLiveLocationStatus === 'waiting' || routeLiveLocationStatus === 'active') return
    if (!liveLocationContextIsCurrent(mode)) return

    stopRouteLiveLocation()
    routeLiveLocationFollowModeRef.current = 'follow'
    routeLiveLocationOrientationModeRef.current = 'heading-up'
    setRouteLiveLocationFollowMode('follow')
    setRouteLiveLocationStatus('waiting')
    setRouteLiveLocationError(null)
    if (mode === 'route') applyLiveRouteMapPresentation(true)
    else applyLiveRouteMapPresentation(false)
    attachRouteLiveLocationMapListeners()
    let failedSynchronously = false
    const stop = watchLiveLocation({
      onPosition: point => {
        if (!liveLocationContextIsCurrent(mode)) {
          stopRouteLiveLocation()
          return
        }
        if (!shouldPresentLiveLocationPoint(routeLiveLocationLastPresentedPointRef.current, point)) {
          return
        }
        routeLiveLocationLastPresentedPointRef.current = point
        routeLiveLocationPointRef.current = point
        setRouteLiveLocationPoint(point)
        setRouteLiveLocationError(null)
        setRouteLiveLocationStatus('active')
        updateRouteLiveLocationMarker(point)
      },
      onError: error => {
        failedSynchronously = true
        stopRouteLiveLocation(false)
        routeLiveLocationOrientationModeRef.current = 'heading-up'
        setRouteLiveLocationPoint(null)
        setRouteLiveLocationError(error)
        setRouteLiveLocationStatus('error')
        if (mode === 'free-drive') {
          setFreeDrivePaused(false)
          if (error === 'permission_denied') setIsRouteMapSettingsCollapsed(false)
        }
      },
      enableHighAccuracy: true,
      maximumAgeMs: 0,
    })
    if (failedSynchronously) {
      stop()
    } else {
      routeLiveLocationStopRef.current = stop
    }
  }

  function handleToggleRouteLiveLocation() {
    if (routeLiveLocationStatus === 'waiting' || routeLiveLocationStatus === 'active') {
      stopRouteLiveLocation()
      return
    }
    setLiveDriveModeState('route')
    startRouteLiveLocation('route')
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
    const freeDriveCountryOverview =
      liveDriveModeRef.current === 'free-drive' &&
      overviewDensityLevelForZoom(zoom) === 'aggregate'
    for (const { element, place } of placeMarkersRef.current) {
      const isVisible =
        !freeDriveCountryOverview && (
          place.importance === 3 ||
          (place.importance === 2 && zoom >= 5.8) ||
          zoom >= 7.2
        )
      element.style.display = isVisible ? 'block' : 'none'
    }
  }

  function clearWeatherChaseMapMarkers() {
    weatherChaseMapMarkersRef.current.forEach(({ marker }) => marker.remove())
    weatherChaseMapMarkersRef.current = []
    setHiddenForecastCardCount(0)
  }

  function handleClearRoute() {
    invalidateRouteRequests()
    resetRouteOwnedState()
    stopRouteLiveLocation()
    setLiveDriveModeState('off')
    handleRouteStatusFilterChange(createDefaultRouteVisibleWindStatuses())
    clearRouteOwnedMapPresentation()
    const map = mapRef.current
    if (!map) return
    updateOverviewLayerVisibility(overviewActiveModeRef.current, false)
    reconcilePlaceMarkerVisibility()
    map.flyTo({ center: ICELAND_CENTER, zoom: ICELAND_ZOOM, duration: 600 })
  }

  function handleEditRoute() {
    const resolvedPlaces = resolvedRoutePlacesRef.current
    const navigationOrigin = resolvedPlaces?.navigationOrigin ?? routeHandoffOnlySummary?.navigationOrigin ?? null
    const navigationDestination = resolvedPlaces?.navigationDestination ?? routeHandoffOnlySummary?.navigationDestination ?? null
    const preservedThresholds = routeBridgeSummary?.thresholdsUsed ?? routeThresholdsRef.current
    const preservedFrom = routeFrom.trim()
      || resolvedPlaces?.navigationOriginName
      || routeHandoffOnlySummary?.navigationOriginName
      || ''
    const preservedTo = routeTo.trim()
      || resolvedPlaces?.navigationDestinationName
      || routeHandoffOnlySummary?.navigationDestinationName
      || ''

    handleClearRoute()

    setRouteFrom(preservedFrom)
    setRouteTo(preservedTo)
    setFromResolved(navigationOrigin)
    setToResolved(navigationDestination)
    setRoutePlanningCautionWind(String(preservedThresholds.cautionWindMs))
    setRoutePlanningRedWind(String(preservedThresholds.redWindMs))
    // Assessment scope is derived again on submit; never restore a stale binding.
    resolvedRoutePlacesRef.current = null
    setRoutePlanningStep('destination')
    setActiveRouteFieldState('to')
    setIsPanelOpen(true)
  }

  async function fetchBridgePlaceResults(
    query: string,
    signal: AbortSignal,
  ): Promise<RoadIntelligencePlaceResult[]> {
    const res = await fetch('/api/place/search', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.trim() }),
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
    if (!hasRoadIntelligence) return null

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
      lastAttemptedAtIso: fetchedAtIso,
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
          windDisplayStatus: classifyLiveVegagerdinStationWindStatus(station, thresholds),
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

    const travelPlan = result.travelPlan
    routeAuditPolylinePointsRef.current = (
      travelPlan?.route.auditPolylinePoints && travelPlan.route.auditPolylinePoints.length >= 2
        ? travelPlan.route.auditPolylinePoints
        : (travelPlan?.routeWeatherPoints ?? []).map(point => ({ lat: point.lat, lon: point.lon }))
    ).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon))

    const map = mapRef.current
    if (!map || !mapInitializationReadyRef.current) throw new Error('map_not_ready')

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
            'line-color': DRIVE_MAP_ROUTE_COLOR,
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

    const pointSource = map.getSource(TRAVEL_METNO_LAYER_ID)
    if (pointSource) {
      ;(pointSource as import('maplibre-gl').GeoJSONSource).setData(EMPTY_FEATURE_COLLECTION as never)
    }
    if (map.getLayer(TRAVEL_METNO_LAYER_ID)) {
      map.setLayoutProperty(TRAVEL_METNO_LAYER_ID, 'visibility', 'none')
    }
    applyRouteStatusFilterToMap(
      map,
      visibleRouteStatusesRef.current,
      ROUTE_WIND_STATUS_FILTER_MODE,
    )

    const [west, south, east, north] = mapData.bbox
    map.fitBounds([[west, south], [east, north]], {
      padding: { top: 150, right: 40, bottom: 170, left: 40 },
      duration: 650,
      maxZoom: 9,
    })

    return { ...mapData, statusCounts }
  }

  function routeReturnHref(view = routeContextViewRef.current): string {
    return buildRoadMapRouteReturnHref(navigation, view)
  }

  function stationReturnHref(stationId?: string): string {
    return buildRoadMapStationReturnHref(navigation, stationId)
  }

  function signInReturnHref(context: 'weather' | 'route' = 'route'): string {
    return buildRoadMapSignInReturnHref(navigation, context)
  }

  function routeQuotaSignInHref(): string {
    return `/innskraning?next=${encodeURIComponent(buildRoadMapRouteSignInReturnHref(navigation))}`
  }

  function persistRouteReturnSnapshot(view = routeContextViewRef.current) {
    try {
      const resolvedPlaces = resolvedRoutePlacesRef.current
      window.sessionStorage.setItem(ROAD_MAP_ROUTE_RETURN_STORAGE_KEY, JSON.stringify({
        updatedAt: Date.now(),
        from: routeFrom,
        to: routeTo,
        origin: resolvedPlaces?.navigationOrigin ?? routeHandoffOnlySummary?.navigationOrigin ?? null,
        destination: resolvedPlaces?.navigationDestination ?? routeHandoffOnlySummary?.navigationDestination ?? null,
        cautionWind: routeCautionWind,
        redWind: routeRedWind,
        view,
      }))
    } catch {
      // The in-page back button still preserves live state when storage is unavailable.
    }
  }

  function openVedurstofanRouteStationPage(
    entry: VedurstofanRouteStatusEntry,
    coords?: [number, number],
  ) {
    void coords
    popupRef.current?.remove()
    persistRouteReturnSnapshot()
    const returnHref = routeReturnHref()
    window.history.replaceState(window.history.state, '', returnHref)
    window.location.href = vedurstofanPulseHref(entry.point.stationId, returnHref)
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
    directionDegrees,
    temperatureText,
    temperatureValueC,
    precipitationText,
    secondaryMetricText,
    secondaryMetricTemperatureValueC,
    secondaryMetricTitle,
    secondaryMetricAriaText,
    weatherEmoji,
    etaText,
    providerLabel,
    measurementTimeText,
    measurementTimeTitle,
    additionalAriaParts = [],
    color,
    compact = false,
    showNameLabel = true,
    showWeatherCard = false,
    showConnectorLine = false,
    liveTemperatureMetrics = false,
    placement = { layout: 'vertical', anchor: 'bottom', offset: [0, -8] },
    onClick,
  }: {
    stationName: string
    windText: string
    gustText?: string | null
    directionText?: string | null
    directionDegrees?: number | null
    temperatureText?: string | null
    temperatureValueC?: number | null
    precipitationText?: string | null
    secondaryMetricText?: string | null
    secondaryMetricTemperatureValueC?: number | null
    secondaryMetricTitle?: string | null
    secondaryMetricAriaText?: string | null
    weatherEmoji?: string | null
    etaText?: string | null
    providerLabel?: string | null
    measurementTimeText?: string | null
    measurementTimeTitle?: string | null
    additionalAriaParts?: ReadonlyArray<string | null>
    color: string
    compact?: boolean
    showNameLabel?: boolean
    showWeatherCard?: boolean
    showConnectorLine?: boolean
    liveTemperatureMetrics?: boolean
    placement?: RouteLabelPlacement
    onClick: () => void
  }): HTMLButtonElement {
    void placement
    void compact
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
      ...additionalAriaParts,
    ].filter(Boolean)
    const element = document.createElement('button')
    element.type = 'button'
    element.title = stationName
    element.setAttribute('aria-label', ariaParts.join(', '))
    element.dataset.routeWeatherAriaParts = JSON.stringify(ariaParts)
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
      `left:${compact ? '-5px' : '-7px'}`,
      `top:${compact ? '-5px' : '-7px'}`,
      `width:${compact ? '10px' : '14px'}`,
      `height:${compact ? '10px' : '14px'}`,
      'border:2px solid #ffffff',
      'border-radius:999px',
      `background:${color}`,
      'box-shadow:0 1px 4px rgba(15,23,42,0.24)',
      'z-index:2',
    ].join(';')
    element.appendChild(dot)

    if (showConnectorLine) {
      const connectorBaseOffset = compact ? 8 : 10
      const connector = document.createElement('span')
      connector.dataset.weatherCardConnector = 'true'
      connector.setAttribute('aria-hidden', 'true')
      connector.style.cssText = [
        'position:absolute',
        'left:0',
        'top:0',
        `width:${connectorBaseOffset}px`,
        'height:1.5px',
        `background:${color}`,
        'opacity:0.55',
        'pointer-events:none',
        'transform:rotate(-90deg)',
        'transform-origin:0 50%',
        'z-index:0',
      ].join(';')
      element.appendChild(connector)
    }

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
      'z-index:1',
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

    if (showWeatherCard && weatherEmoji) {
      const emoji = document.createElement('span')
      emoji.textContent = weatherEmoji
      emoji.style.cssText = [
        'display:block',
        `font-size:${compact ? '18px' : '21px'}`,
        'line-height:1',
        `height:${compact ? '18px' : '21px'}`,
        'text-align:center',
        'text-shadow:0 1px 2px rgba(255,255,255,0.95),0 1px 5px rgba(15,23,42,0.18)',
      ].join(';')
      stack.appendChild(emoji)
    }

    if (showWeatherCard) {
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

      if (providerLabel) {
        const provider = document.createElement('span')
        provider.dataset.weatherProvider = 'true'
        provider.style.cssText = [
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'gap:4px',
          'max-width:124px',
          'border-bottom:1px solid rgba(15,23,42,0.12)',
          'padding:3px 6px 2px',
          'color:#64748b',
          `font:700 ${compact ? '8px' : '9px'}/1.1 Inter,system-ui,sans-serif`,
          'text-align:center',
        ].join(';')
        const providerName = document.createElement('span')
        providerName.textContent = providerLabel
        providerName.style.cssText = [
          'min-width:0',
          'overflow:hidden',
          'text-overflow:ellipsis',
          'white-space:nowrap',
        ].join(';')
        provider.appendChild(providerName)
        if (measurementTimeText) {
          const measurementTime = document.createElement('span')
          measurementTime.dataset.vegagerdinStationTimestamp = 'true'
          measurementTime.textContent = measurementTimeText
          measurementTime.title = measurementTimeTitle ?? ''
          measurementTime.setAttribute('aria-label', measurementTimeTitle ?? measurementTimeText)
          measurementTime.style.cssText = [
            'flex:none',
            'white-space:nowrap',
            'font-weight:800',
            'color:#475569',
          ].join(';')
          provider.appendChild(measurementTime)
        }
        weatherCard.appendChild(provider)
      }

      const windRow = document.createElement('span')
      windRow.style.cssText = [
        'display:flex',
        'align-items:baseline',
        'justify-content:center',
        'gap:3px',
        'border-bottom:1px solid rgba(15,23,42,0.12)',
        'padding:3px 6px',
        `font:800 calc(${compact ? '10px' : '11px'} * var(--teskeid-forecast-card-scale, 1.2))/1 Inter,system-ui,sans-serif`,
      ].join(';')

      const direction = document.createElement('span')
      const windTowardBearing = resolveWindTowardBearingDeg(
        directionDegrees,
        directionText,
      )
      direction.textContent = windTowardBearing === null ? '•' : '↑'
      direction.title = directionText ?? ''
      if (windTowardBearing !== null) {
        direction.dataset.windTowardBearing = String(windTowardBearing)
      }
      direction.style.cssText = [
        'display:inline-block',
        `font-size:calc(${compact ? '11px' : '12px'} * var(--teskeid-forecast-card-scale, 1.2))`,
        'line-height:1',
        'color:#475569',
        'transform-origin:center',
        windTowardBearing === null
          ? 'transform:none'
          : `transform:rotate(${normalizeHeadingDegrees(
              windTowardBearing - (mapRef.current?.getBearing() ?? 0),
            )}deg)`,
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
      if (liveTemperatureMetrics) {
        bottomRow.dataset.liveRouteTemperatureRow = 'true'
      }
      bottomRow.style.cssText = [
        'display:grid',
        'grid-template-columns:1fr 1fr',
        `min-height:${compact ? '16px' : '17px'}`,
        `font:700 calc(${compact ? '9px' : '10px'} * var(--teskeid-forecast-card-scale, 1.2))/1 Inter,system-ui,sans-serif`,
      ].join(';')

      const temperature = document.createElement('span')
      temperature.textContent = temperatureText ? `${temperatureText}°` : '–'
      temperature.title = labelsRef.current.routeMarkerTemperatureTitle
      if (liveTemperatureMetrics) {
        temperature.dataset.liveRouteTemperatureMetric = 'true'
      }
      if (temperatureValueC != null && Number.isFinite(temperatureValueC)) {
        temperature.dataset.liveRouteTemperatureC = String(temperatureValueC)
        temperature.dataset.liveRouteTemperatureText = temperature.textContent
        temperature.dataset.liveRouteTemperatureTitle = temperature.title
        temperature.dataset.liveRouteTemperatureAria = labelsRef.current.routeMarkerTemperature(
          temperatureText ?? formatNum(temperatureValueC, locale),
        )
      }
      temperature.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'border-right:1px solid rgba(15,23,42,0.12)',
        'padding:3px 5px',
        'color:#334155',
      ].join(';')
      bottomRow.appendChild(temperature)

      const secondaryMetric = document.createElement('span')
      secondaryMetric.textContent = rightMetricText ?? '–'
      secondaryMetric.title = rightMetricTitle
      if (liveTemperatureMetrics) {
        secondaryMetric.dataset.liveRouteTemperatureMetric = 'true'
      }
      if (
        secondaryMetricTemperatureValueC != null
        && Number.isFinite(secondaryMetricTemperatureValueC)
      ) {
        secondaryMetric.dataset.liveRouteTemperatureC = String(secondaryMetricTemperatureValueC)
        secondaryMetric.dataset.liveRouteTemperatureText = secondaryMetric.textContent
        secondaryMetric.dataset.liveRouteTemperatureTitle = secondaryMetric.title
        if (secondaryMetricAriaText) {
          secondaryMetric.dataset.liveRouteTemperatureAria = secondaryMetricAriaText
        }
      }
      secondaryMetric.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'padding:3px 5px',
        'color:#334155',
      ].join(';')
      bottomRow.appendChild(secondaryMetric)
      weatherCard.appendChild(bottomRow)
      stack.appendChild(weatherCard)
    }

    if (showWeatherCard && showNameLabel) {
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

    element.onclick = (event) => {
      event.preventDefault()
      event.stopPropagation()
      onClick()
    }

    return element
  }

  function updateLiveDriveTemperaturePresentation(
    element: HTMLElement,
    liveTrackingActive: boolean,
  ) {
    const suppressedAriaParts = new Set<string>()
    const temperatureMetrics = element.querySelectorAll<HTMLElement>(
      '[data-live-route-temperature-metric="true"]',
    )
    const visibleMetrics: HTMLElement[] = []
    for (const metric of temperatureMetrics) {
      const rawValueC = metric.dataset.liveRouteTemperatureC
      const valueC = rawValueC === undefined ? null : Number(rawValueC)
      const suppressed = liveTrackingActive && liveDriveTemperatureValue(valueC) === null
      metric.style.display = suppressed ? 'none' : 'flex'
      metric.textContent = suppressed
        ? ''
        : metric.dataset.liveRouteTemperatureText ?? '–'
      metric.title = suppressed ? '' : metric.dataset.liveRouteTemperatureTitle ?? ''
      metric.setAttribute('aria-hidden', suppressed ? 'true' : 'false')
      metric.style.borderRight = 'none'
      if (!suppressed) visibleMetrics.push(metric)
      const ariaPart = metric.dataset.liveRouteTemperatureAria
      if (suppressed && ariaPart) suppressedAriaParts.add(ariaPart)
    }

    const temperatureRow = element.querySelector<HTMLElement>(
      '[data-live-route-temperature-row="true"]',
    )
    if (temperatureRow) {
      if (liveTrackingActive && visibleMetrics.length === 0) {
        temperatureRow.style.display = 'none'
      } else {
        temperatureRow.style.display = 'grid'
        temperatureRow.style.gridTemplateColumns = liveTrackingActive
          ? `repeat(${visibleMetrics.length}, minmax(0, 1fr))`
          : '1fr 1fr'
        const borderedMetrics = liveTrackingActive
          ? visibleMetrics.slice(0, -1)
          : Array.from(temperatureMetrics).slice(0, -1)
        for (const metric of borderedMetrics) {
          metric.style.borderRight = '1px solid rgba(15,23,42,0.12)'
        }
      }
    }

    const rawAriaParts = element.dataset.routeWeatherAriaParts
    if (!rawAriaParts) return
    try {
      const ariaParts = JSON.parse(rawAriaParts) as unknown
      if (!Array.isArray(ariaParts)) return
      element.setAttribute(
        'aria-label',
        ariaParts
          .filter((part: unknown): part is string => (
            typeof part === 'string' && !suppressedAriaParts.has(part)
          ))
          .join(', '),
      )
    } catch {
      // Keep the original accessible label if marker metadata is malformed.
    }
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
    const color = WIND_STATUS_MARKER_COLOR[entry.windDisplayStatus]
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
      onClick: () => openVedurstofanRouteStationPage(entry),
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
    const routeDurationMs = routeDurationMinutes * 60_000
    const statusEntries = validPoints.map((p) => {
      const anchorMs = resolveRouteForecastEtaMs(
        departureMs,
        routeDurationMs,
        p.routeFraction,
      )
      const windDisplayStatus = anchorMs === null
        ? 'no_data'
        : classifyNearestForecastWindDisplayStatusAt(
            p.forecastRows,
            thresholds,
            anchorMs,
          )
      const selectedRowIdx = anchorMs === null
        ? null
        : selectNearestForecastRowAt(p.forecastRows, anchorMs)
      return {
        point: p,
        windDisplayStatus,
        selectedRow: selectedRowIdx !== null ? p.forecastRows[selectedRowIdx] : null,
        etaIso: anchorMs === null ? null : new Date(anchorMs).toISOString(),
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
        openVedurstofanRouteStationPage(entry, coords)
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
      ROUTE_WIND_STATUS_FILTER_MODE,
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

  function openVegagerdinRouteStationPage(
    point: VegagerdinRouteLayerPoint,
    coords?: [number, number],
  ) {
    openOverviewVegagerdinPopup({
      stationId: point.stationId,
      stationName: point.stationName,
      lat: point.lat,
      lon: point.lon,
      measuredAtIso: point.measuredAtIso,
      fetchedAtIso: point.fetchedAtIso,
      meanWindMs: point.meanWindMs,
      gustLast10MinMs: point.gustLast10MinMs,
      windDirectionDeg: point.windDirectionDeg,
      windDirectionText: point.windDirectionText,
      airTemperatureC: point.airTemperatureC,
      roadTemperatureC: point.roadTemperatureC,
      dataQuality: point.dataQuality,
    }, coords ?? [point.lon, point.lat])
  }

  function createLiveVegagerdinStationLabel(
    station: LiveVegagerdinStation,
    {
      placement,
      liveTrackingActive,
      onClick,
    }: {
      placement?: RouteLabelPlacement
      liveTrackingActive: boolean
      onClick: () => void
    },
  ): HTMLButtonElement {
    const windText = station.meanWindMs != null
      ? formatNum(station.meanWindMs, locale)
      : '–'
    const gustText = station.gustLast10MinMs != null
      ? formatNum(station.gustLast10MinMs, locale)
      : null
    const temperatureText = station.airTemperatureC != null
      ? formatNum(station.airTemperatureC, locale)
      : null
    const roadTemperatureText = station.roadTemperatureC != null
      ? `${formatNum(station.roadTemperatureC, locale)}°`
      : null
    const measuredAtLabel = Number.isFinite(Date.parse(station.measuredAtIso))
      ? formatCompactDateTime(station.measuredAtIso, locale)
      : t('roadMapPrototypeFreeDriveUnknownAge')
    const compactMeasurementTimestamp = formatVegagerdinStationCompactTimestamp(
      station.measuredAtIso,
      locale,
    )
    const freshnessLabel = station.freshness === 'fresh'
      ? t('roadMapPrototypeFreeDriveFresh')
      : station.freshness === 'stale'
        ? t('roadMapPrototypeFreeDriveStale')
        : t('roadMapPrototypeFreeDriveUnknownAge')
    const color = WIND_STATUS_MARKER_COLOR[station.displayStatus]
    const element = createRouteWeatherPointMarkerElement({
      stationName: station.stationName,
      windText,
      gustText,
      directionText: station.windDirectionText,
      directionDegrees: station.windDirectionDeg,
      temperatureText,
      temperatureValueC: station.airTemperatureC,
      secondaryMetricText: roadTemperatureText,
      secondaryMetricTemperatureValueC: station.roadTemperatureC,
      secondaryMetricTitle: labelsRef.current.routeMarkerRoadTemperatureTitle,
      secondaryMetricAriaText: station.roadTemperatureC != null
        ? labelsRef.current.routeMarkerRoadTemperature(formatNum(station.roadTemperatureC, locale))
        : null,
      weatherEmoji: null,
      providerLabel: station.stationName,
      measurementTimeText: compactMeasurementTimestamp,
      measurementTimeTitle: compactMeasurementTimestamp
        ? t('roadMapPrototypeVegagerdinStationTimestamp', {
            time: compactMeasurementTimestamp,
          })
        : null,
      additionalAriaParts: [
        t('roadMapPrototypeFreeDriveProvider'),
        t('roadMapPrototypeFreeDriveMeasured', {
          time: measuredAtLabel,
          freshness: freshnessLabel,
        }),
      ],
      color,
      showWeatherCard: true,
      showNameLabel: false,
      liveTemperatureMetrics: true,
      placement,
      onClick,
    })
    element.dataset.liveVegagerdinStation = 'true'
    updateLiveDriveTemperaturePresentation(
      element,
      liveTrackingActive,
    )
    return element
  }

  function createVegagerdinRouteLabel(
    point: VegagerdinRouteLayerPoint,
    placement?: RouteLabelPlacement,
  ): HTMLButtonElement {
    return createLiveVegagerdinStationLabel(
      liveVegagerdinStationFromRoutePoint(point, routeThresholdsRef.current),
      {
        placement,
        liveTrackingActive: routeLiveMapPresentationActiveRef.current,
        onClick: () => openVegagerdinRouteStationPage(point),
      },
    )
  }

  function updateLiveVegagerdinStationLabelInPlace(
    current: HTMLButtonElement,
    next: HTMLButtonElement,
  ) {
    current.title = next.title
    current.style.cssText = next.style.cssText
    const ariaLabel = next.getAttribute('aria-label')
    if (ariaLabel) current.setAttribute('aria-label', ariaLabel)
    else current.removeAttribute('aria-label')
    if (next.dataset.routeWeatherAriaParts) {
      current.dataset.routeWeatherAriaParts = next.dataset.routeWeatherAriaParts
    } else {
      delete current.dataset.routeWeatherAriaParts
    }
    current.onclick = next.onclick
    current.replaceChildren(...Array.from(next.childNodes))
  }

  function createRouteEndpointLabelElement(
    label: string,
    kind: RouteEndpointMarker['kind'],
  ): HTMLDivElement {
    const element = document.createElement('div')
    element.title = label
    const accent = kind === 'origin'
      ? '#2563eb'
      : kind === 'destination'
        ? '#154212'
        : '#b45309'
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
      `font:800 ${kind.startsWith('coverage') ? '10px' : '12px'}/1.2 Inter,system-ui,sans-serif`,
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
    coverage?: RouteWeatherCoverage,
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
      routeEndpointMarkersRef.current.push({ marker, element, kind })
    }

    if (coverage?.status === 'partial') {
      for (const [boundary, kind] of [
        [coverage.start, 'coverage-start'],
        [coverage.end, 'coverage-end'],
      ] as const) {
        if (boundary.kind === 'exact') continue
        const boundaryName = formatRouteCoverageBoundaryLabel(boundary, {
          boundaryFallback: t('roadMapPrototypeCoverageBoundaryFallback'),
          settlementBoundary: t('roadMapPrototypeCoverageSettlementBoundary'),
          officialRoadBoundary: t('roadMapPrototypeCoverageOfficialRoadBoundary'),
        })
        const label = kind === 'coverage-start'
          ? t('roadMapPrototypeCoverageStartMarker', { place: boundaryName })
          : t('roadMapPrototypeCoverageEndMarker', { place: boundaryName })
        const element = createRouteEndpointLabelElement(label, kind)
        const marker = new Marker({ element, anchor: 'center', offset: [0, 0] })
          .setLngLat([boundary.point.lon, boundary.point.lat])
          .addTo(map)
        routeEndpointMarkersRef.current.push({ marker, element, kind })
      }
    }
    routeEndpointMarkersAreCurrentRef.current = true
    updateRouteEndpointMarkerVisibility()
  }

  function renderRouteWindArrows(
    points: ReadonlyArray<VegagerdinRouteLayerPoint>,
    cacheStatus: VegagerdinRouteLayer['cacheStatus'],
  ): number {
    const geojson = buildRouteWindArrowField({
      routePoints: routeAuditPolylinePointsRef.current,
      stations: points,
      cacheStatus,
      nowMs: Date.now(),
    })
    setRouteWindArrowCount(geojson.features.length)

    const map = mapRef.current
    if (!canUseMapStyle(map) || !ensureNorthPointingRouteWindArrowImage(map)) {
      return geojson.features.length
    }

    const existingSource = map.getSource(VEGAGERDIN_ROUTE_WIND_ARROWS_SOURCE_ID)
    if (existingSource) {
      ;(existingSource as import('maplibre-gl').GeoJSONSource).setData(geojson as never)
    } else {
      map.addSource(VEGAGERDIN_ROUTE_WIND_ARROWS_SOURCE_ID, {
        type: 'geojson',
        data: geojson as never,
      })
    }

    if (!map.getLayer(VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID)) {
      map.addLayer({
        id: VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID,
        type: 'symbol',
        source: VEGAGERDIN_ROUTE_WIND_ARROWS_SOURCE_ID,
        minzoom: 5.2,
        layout: {
          'symbol-placement': 'point',
          'icon-image': ROUTE_WIND_ARROW_IMAGE_ID,
          'icon-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5, 0.52,
            8, 0.68,
            11, 0.84,
          ] as unknown as number,
          'icon-rotate': ['get', 'windTowardDeg'] as unknown as number,
          'icon-offset': [
            'array',
            'number',
            2,
            ['get', 'iconOffset'],
          ] as unknown as [number, number],
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
          'icon-keep-upright': false,
          'icon-allow-overlap': false,
          'icon-ignore-placement': true,
          'icon-padding': 1,
          visibility:
            lastMapContextRef.current === 'route' && routeWeatherModeRef.current === 'now'
              ? 'visible'
              : 'none',
        },
        paint: {
          'icon-opacity': ['get', 'opacity'] as unknown as number,
        },
      }, map.getLayer(VEGAGERDIN_ROUTE_STATIONS_LAYER_ID)
        ? VEGAGERDIN_ROUTE_STATIONS_LAYER_ID
        : undefined)
    }

    if (
      map.getLayer(VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID) &&
      map.getLayer(VEGAGERDIN_ROUTE_STATIONS_LAYER_ID)
    ) {
      map.moveLayer(
        VEGAGERDIN_ROUTE_WIND_ARROWS_LAYER_ID,
        VEGAGERDIN_ROUTE_STATIONS_LAYER_ID,
      )
    }

    return geojson.features.length
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
    routeVegagerdinCacheStatusRef.current = layer?.cacheStatus ?? null
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

    renderRouteWindArrows(validPoints, routeVegagerdinCacheStatusRef.current)

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
        openVegagerdinRouteStationPage(point, coords)
      })
    }

    if (map.getLayer(VEGAGERDIN_ROUTE_STATIONS_LAYER_ID)) {
      map.moveLayer(VEGAGERDIN_ROUTE_STATIONS_LAYER_ID)
    }

    const Marker = markerConstructorRef.current
    if (Marker) {
      const currentMarkersByStationId = new Map(
        routeVegagerdinLabelMarkersRef.current.map(marker => [marker.point.stationId, marker]),
      )
      const nextMarkers: RouteVegagerdinLabelMarker[] = []
      // Vegagerðin: always show all matched route stations.
      // Stebbi needs to see measured wind values at every on-route station —
      // density rules are not applied here. These are current observations, not forecasts.
      for (const [index, point] of validPoints.entries()) {
        const placement = routeLabelPlacementForPoint(validPoints, index)
        const nextElement = createVegagerdinRouteLabel(point, placement)
        const current = currentMarkersByStationId.get(point.stationId)
        if (current) {
          // Keep the MapLibre marker and its geographic anchor stable while
          // measurements refresh. Replacing only its children avoids a visible
          // blink and prevents small provider-coordinate changes from moving
          // the station card while the user is following live location.
          updateLiveVegagerdinStationLabelInPlace(current.element, nextElement)
          current.point = point
          nextMarkers.push(current)
          currentMarkersByStationId.delete(point.stationId)
          continue
        }
        const marker = new Marker({
          element: nextElement,
          anchor: placement.anchor,
          offset: placement.offset,
        })
          .setLngLat([point.lon, point.lat])
          .addTo(map)
        nextMarkers.push({ marker, element: nextElement, point })
      }
      currentMarkersByStationId.forEach(({ marker }) => marker.remove())
      routeVegagerdinLabelMarkersRef.current = nextMarkers
      updateVegagerdinLabelMarkerState(visibleRouteStatusesRef.current, routeWeatherModeRef.current)
    }

    applyRouteStatusFilterToMap(
      map,
      visibleRouteStatusesRef.current,
      ROUTE_WIND_STATUS_FILTER_MODE,
    )
    updateRouteWeatherLayerVisibility()
    return { count: validPoints.length, statusCounts }
  }

  function routeSurfaceChoiceLabel(route: RouteOption, index: number): string {
    if (route.provider === 'teskeid') {
      const curatedLabelKey = curatedRouteLabelMessageKey(
        route.labels,
        route.cautions?.map(caution => caution.id),
      )
      return curatedLabelKey
        ? tf(curatedLabelKey)
        : t('roadMapPrototypeTeskeidRouteLabel')
    }
    if (route.description && route.description.trim().length > 0) return route.description
    const translatedLabels = translatedRouteOptionLabels(route)
    if (translatedLabels.length > 0) return translatedLabels.join(' · ')
    if (route.isDefault) return t('roadMapPrototypeSurfaceRouteDefault')
    return t('roadMapPrototypeSurfaceRouteNumber', { number: index + 1 })
  }

  function translatedRouteOptionLabels(route: RouteOption): string[] {
    return route.labels.flatMap(label => {
      // Hólmavík is a named Teskeið route, not a public label for a Google
      // alternative. Keep the legacy provider label internal to that adapter.
      if (label === 'CURATED_VIA_HOLMAVIK' && route.provider !== 'teskeid') return []
      const key = routeOptionLabelMessageKey(label)
      return key ? [t(key)] : []
    })
  }

  function routeSurfaceChoiceDescription(route: RouteOption, index: number): string {
    if (route.description?.trim()) return route.description.trim()
    const curatedLabelKey = route.provider === 'teskeid'
      ? curatedRouteLabelMessageKey(
          route.labels,
          route.cautions?.map(caution => caution.id),
        )
      : null
    if (curatedLabelKey) {
      return tf(curatedLabelKey)
    }
    const translatedLabels = translatedRouteOptionLabels(route)
    return translatedLabels.length > 0
      ? translatedLabels.join(' · ')
      : routeSurfaceChoiceLabel(route, index)
  }

  function routeOptionToSurfaceChoice(
    route: RouteOption,
    index: number,
    routeEnvelope: RouteOptionEnvelopeV1 | null = null,
  ): RouteSurfaceChoice {
    const experimentalSurface = route.experimental?.surface
    const hasUncertainSurface = experimentalSurface
      ? experimentalSurface.mixedM > 0 || experimentalSurface.unknownM > 0
      : false
    const surfaceSummary: RouteSurfaceSummary | null = experimentalSurface && !hasUncertainSurface
      ? {
          checked: true,
          hasGravel: experimentalSurface.gravelM > 0,
          gravelIssueCount: experimentalSurface.gravelM > 0 ? 1 : 0,
          gravelLengthM: experimentalSurface.gravelM,
          nearestGravelDistanceM: null,
          gravelRoadNames: [],
          issues: [],
        }
      : null
    return {
      // The server route id is intentionally stable API identity. React and
      // asynchronous client hydration also need the signed envelope identity,
      // otherwise the primary Teskeið id collides across assessment scopes.
      identity: routeEnvelope?.signature
        ?? `${route.id}:${route.routeIndex}:${route.distanceM}:${route.durationS}`,
      routeId: route.id,
      routeIndex: route.routeIndex,
      label: routeSurfaceChoiceLabel(route, index),
      description: routeSurfaceChoiceDescription(route, index),
      distanceKm: route.distanceM / 1000,
      durationMinutes: route.durationS / 60,
      surfaceSummary,
      route,
      routeEnvelope,
    }
  }

  function mergeProviderRouteChoices(
    current: RouteSurfaceChoice[],
    provider: 'teskeid',
    incoming: RouteSurfaceChoice[],
  ): RouteSurfaceChoice[] {
    if (incoming.length === 0) return current
    const existingIndex = current.findIndex(choice => choice.route.provider === provider)
    const withoutProvider = current.filter(choice => choice.route.provider !== provider)
    if (existingIndex < 0) return [...current, ...incoming]
    return [
      ...withoutProvider.slice(0, existingIndex),
      ...incoming,
      ...withoutProvider.slice(existingIndex),
    ]
  }

  function parseRouteEnvelopes(payload: unknown): RouteOptionEnvelopeV1[] {
    if (!payload || typeof payload !== 'object') return []
    const envelopes = (payload as { routeEnvelopes?: unknown }).routeEnvelopes
    if (!Array.isArray(envelopes)) return []
    return envelopes.filter((value): value is RouteOptionEnvelopeV1 => {
      if (!value || typeof value !== 'object') return false
      const envelope = value as Partial<RouteOptionEnvelopeV1>
      return envelope.version === 1
        && typeof envelope.signature === 'string'
        && envelope.route !== null
        && typeof envelope.route === 'object'
        && typeof envelope.route.id === 'string'
    })
  }

  async function fetchRouteSurfaceSummary(
    route: RouteOption,
    signal: AbortSignal,
  ): Promise<RouteSurfaceSummary | null> {
    if (!hasRoadIntelligence) return null

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

  function waitForAbortableBrowser(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      const timer = window.setTimeout(() => {
        signal.removeEventListener('abort', handleAbort)
        resolve()
      }, ms)
      const handleAbort = () => {
        window.clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      signal.addEventListener('abort', handleAbort, { once: true })
    })
  }

  async function fetchTeskeidCandidate(
    origin: RoadIntelligencePlaceResult,
    destination: RoadIntelligencePlaceResult,
    expectedAssessmentScopeId: string | null,
    signal: AbortSignal,
    alternatives: boolean,
    searchMode: TeskeidCandidateSearchMode = 'quick',
    retryAttempt = 0,
  ): Promise<TeskeidCandidateResult> {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

    const cacheKey = teskeidClientCandidateCacheKey(
      origin,
      destination,
      expectedAssessmentScopeId,
      alternatives,
      searchMode,
    )
    const cached = teskeidClientCandidateCacheRef.current.get(cacheKey)
    const cachedScopeMatches = cached !== undefined
      && (expectedAssessmentScopeId === null
        || cached.assessmentScope.scopeId === expectedAssessmentScopeId)
    const cachedArtifactIsAtomic = cached !== undefined
      && isAtomicTeskeidCandidateArtifact({
        scopeId: cached.assessmentScope.scopeId,
        recommendedRouteId: cached.recommendedRouteId,
        envelopes: cached.envelopes,
      })
    if (
      cached
      && cachedScopeMatches
      && cachedArtifactIsAtomic
      && cached.expiresAtMs > Date.now() + TESKEID_CLIENT_CANDIDATE_CACHE_MIN_TTL_MS
    ) {
      // Refresh insertion order so the bounded Map behaves as an LRU cache.
      teskeidClientCandidateCacheRef.current.delete(cacheKey)
      teskeidClientCandidateCacheRef.current.set(cacheKey, cached)
      if (process.env.NODE_ENV !== 'production') {
        console.log('[RoadMap] Teskeið candidate client cache: hit')
      }
      return {
        status: 'ready',
        assessmentScope: cached.assessmentScope,
        recommendedRouteId: cached.recommendedRouteId,
        choices: cached.envelopes.map((envelope, index) => routeOptionToSurfaceChoice(
          envelope.route,
          index,
          envelope,
        )),
      }
    }
    if (cached) teskeidClientCandidateCacheRef.current.delete(cacheKey)

    const startedAt = performance.now()
    const res = await fetch('/api/teskeid/weather/travel/route-candidate', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        origin,
        destination,
        resolveAssessmentScope: true,
        ...(expectedAssessmentScopeId
          ? { expectedAssessmentScopeId }
          : {}),
        alternatives,
        searchMode,
        retryAttempt,
        includeRouteEnvelopes: true,
        compactRouteEnvelopes: true,
      }),
    })
    if (process.env.NODE_ENV !== 'production') {
      console.log(
        '[RoadMap] Teskeið candidate API:',
        `${Math.round(performance.now() - startedAt)} ms`,
        `status=${res.status}`,
        `graph=${res.headers.get('X-Teskeid-Graph-Cache') ?? 'unknown'}`,
        res.headers.get('Server-Timing') ?? '',
      )
    }
    const payload = await res.json().catch(() => null)
    if (res.status === 429) {
      return {
        status: 'rate_limited',
        choices: [],
        assessmentScope: null,
        recommendedRouteId: null,
      }
    }
    const parsedAssessmentScope = parseRouteAssessmentScope(payload?.assessmentScope)
    const assessmentScope = parsedAssessmentScope?.status === 'ready'
      ? parsedAssessmentScope
      : null
    const resolvedAssessmentScopeId = assessmentScope?.scopeId ?? expectedAssessmentScopeId
    const status: TeskeidCandidateStatus =
      res.status === 503 && payload?.error === 'route_envelope_unavailable'
        ? 'envelope_unavailable'
        : payload?.status === 'ready'
        || payload?.status === 'pending'
        || payload?.status === 'no_route'
        || payload?.status === 'rate_limited'
        ? payload.status
        : 'unavailable'
    const envelopes = parseRouteEnvelopes(payload).filter(envelope => (
      resolvedAssessmentScopeId !== null
      && envelope.assessmentScopeId === resolvedAssessmentScopeId
    ))
    const routes = envelopes.length > 0
      ? envelopes.map(envelope => envelope.route)
      : Array.isArray(payload?.routes)
        ? payload.routes as RouteOption[]
        : payload?.route
          ? [payload.route as RouteOption]
          : []
    const envelopesByRouteId = new Map(envelopes.map(envelope => [envelope.route.id, envelope]))
    const recommendedRouteId = typeof payload?.recommendedRouteId === 'string'
      && payload.recommendedRouteId.length > 0
      ? payload.recommendedRouteId
      : null
    const recommendedEnvelope = recommendedRouteId === null
      ? null
      : envelopesByRouteId.get(recommendedRouteId) ?? null
    const readyArtifactIsAtomic = status === 'ready'
      && assessmentScope !== null
      && recommendedEnvelope !== null
      && isAtomicTeskeidCandidateArtifact({
        scopeId: assessmentScope.scopeId,
        recommendedRouteId,
        envelopes,
      })
    if (readyArtifactIsAtomic && payload?.cacheable !== false) {
      const expiresAtMs = Math.min(...envelopes.map(envelope => Date.parse(envelope.expiresAt)))
      if (Number.isFinite(expiresAtMs) && expiresAtMs > Date.now() + TESKEID_CLIENT_CANDIDATE_CACHE_MIN_TTL_MS) {
        teskeidClientCandidateCacheRef.current.delete(cacheKey)
        teskeidClientCandidateCacheRef.current.set(cacheKey, {
          expiresAtMs,
          assessmentScope,
          recommendedRouteId,
          envelopes,
        })
        while (teskeidClientCandidateCacheRef.current.size > TESKEID_CLIENT_CANDIDATE_CACHE_MAX_ENTRIES) {
          const oldestKey = teskeidClientCandidateCacheRef.current.keys().next().value
          if (oldestKey === undefined) break
          teskeidClientCandidateCacheRef.current.delete(oldestKey)
        }
      }
    }
    return {
      status,
      assessmentScope,
      recommendedRouteId: readyArtifactIsAtomic ? recommendedRouteId : null,
      ...(payload?.cacheable === false ? { cacheable: false as const } : {}),
      choices: readyArtifactIsAtomic
        ? routes
            .map((route, index) => routeOptionToSurfaceChoice(
              route,
              index,
              envelopesByRouteId.get(route.id) ?? null,
            ))
            .filter(choice => choice.routeEnvelope !== null)
        : [],
    }
  }

  async function refreshRouteChoiceEnvelope(
    choice: RouteSurfaceChoice,
    places: ResolvedRoutePlaces,
    signal: AbortSignal,
  ): Promise<RouteSurfaceChoice> {
    if (choice.route.provider !== 'teskeid' || !canRequestTeskeidCandidate(places)) {
      throw new Error('route_unavailable')
    }
    setTeskeidCandidateStatus('loading')
    // This function is only used after expiry or an explicit server rejection.
    // Do not hand the caller the same cached signature it is trying to replace.
    teskeidClientCandidateCacheRef.current.delete(teskeidClientCandidateCacheKey(
      places.navigationOrigin,
      places.navigationDestination,
      places.assessmentScope.scopeId,
      true,
      'extended',
    ))
    const result = await fetchTeskeidCandidate(
      places.navigationOrigin,
      places.navigationDestination,
      places.assessmentScope.scopeId,
      signal,
      true,
      'extended',
      0,
    )
    const refreshedChoices = result.status === 'ready' ? result.choices : []
    setTeskeidCandidateStatus(result.status)
    if (signal.aborted || refreshedChoices.length === 0) {
      throw new Error('route_unavailable')
    }

    const exactRefreshedChoice = refreshedChoices.find(candidate => (
      candidate.routeId === choice.routeId
    ))
    const refreshedChoice = exactRefreshedChoice
    if (!refreshedChoice) throw new Error('route_unavailable')
    setRouteSurfaceChoices(current => mergeProviderRouteChoices(
      current,
      'teskeid',
      refreshedChoices,
    ))
    return refreshedChoice
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
          route.identity === choice.identity
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
    builtRouteForecastContextRef.current = null
    setRouteDepartureForecastExpanded(false)
    setRouteForecastBuildStatus('idle')
  }

  function handleRouteDepartureForecastOptIn() {
    setRouteDepartureForecastExpanded(true)

    let context = routeForecastBuildContextRef.current
    if (!context && routeBridgeSummary && routeTravelResult) {
      const timelineCandidates = buildRouteTimelineCandidates(
        routeTravelResult,
        routeBridgeSummary.durationMinutes,
      )
      if (timelineCandidates) {
        context = {
          timelineCandidates,
          thresholds: routeBridgeSummary.thresholdsUsed,
          routeDurationMinutes: routeBridgeSummary.durationMinutes,
          vedurstofanLayer: vedurstofanLayerRef.current,
          vedurstofanStationCount: routeBridgeSummary.vedurstofanStationCount,
          signal: routeBridgeRequestRef.current?.signal ?? new AbortController().signal,
        }
        routeForecastBuildContextRef.current = context
      }
    }

    if (!context || context.timelineCandidates.length === 0) {
      setRouteForecastBuildStatus('unavailable')
      return
    }

    if (isRouteForecastBuildCurrent(builtRouteForecastContextRef.current, context)) {
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
        // Candidate timestamps remain the route-timing carrier. Future slot
        // safety is classified later from ETA-matched Veðurstofan forecasts.
        logRoadMapDiagnostic('forecast slots using Veðurstofan-only future status', {
          reason: 'vedurstofan-only-future-slots',
          timelineCandidateCount: context.timelineCandidates.length,
          vedurstofanStationCount: context.vedurstofanStationCount,
        })
        setVisibleCandidateLimit(ROUTE_TIMELINE_INITIAL_SLOT_COUNT)
        setRouteCandidates(context.timelineCandidates)
        const firstCandidate = context.timelineCandidates[0]
        if (context.vedurstofanLayer && firstCandidate) {
          const firstDepartureMs = Date.parse(firstCandidate.departureIso)
          const render = renderVedurstofanStations(
            context.vedurstofanLayer,
            context.routeDurationMinutes,
            context.thresholds,
            firstDepartureMs,
          )
          setRouteVisibleStatusCounts(render.statusCounts)
        } else {
          setRouteVisibleStatusCounts({})
        }
        setSelectedCandidateIdx(0)
        setRouteWeatherModeState('forecast')
        updateRouteWeatherLayerVisibility('forecast')
        builtRouteForecastContextRef.current = context
        setRouteForecastBuildStatus('ready')
      } catch (e) {
        if (!context.signal.aborted) {
          console.error('[RoadMap] forecast slots: opt-in error:', e)
          setRouteForecastBuildStatus('error')
        }
      }
    }, 0)
  }

  function waitForMapReady(
    timeoutMs = 20_000,
    signal?: AbortSignal,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const startedAt = performance.now()
      let timer: number | null = null
      let settled = false

      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        signal?.removeEventListener('abort', handleAbort)
        if (error) reject(error)
        else resolve()
      }
      const handleAbort = () => finish(new DOMException('Aborted', 'AbortError'))
      const check = () => {
        if (signal?.aborted) {
          handleAbort()
          return
        }
        if (mapInitializationReadyRef.current && mapRef.current) {
          console.log('[RoadMap] waitForMapReady: initialized map available')
          finish()
          return
        }
        if (performance.now() - startedAt >= timeoutMs) {
          console.error('[RoadMap] waitForMapReady: timed out after', timeoutMs, 'ms')
          finish(new Error('map_not_ready'))
          return
        }
        timer = window.setTimeout(check, 50)
      }

      signal?.addEventListener('abort', handleAbort, { once: true })
      check()
    })
  }

  function showRouteHandoffOnly(summary: RouteHandoffOnlySummary) {
    routeDiscoveryRequestRef.current?.abort()
    routeSectionsRefreshRequestRef.current?.abort()
    routeActiveRef.current = false
    setRouteActive(false)
    setRouteBridgeSummary(null)
    setRouteTravelResult(null)
    setRouteVedurstofanLayer(null)
    setRouteCandidates(null)
    setRouteNowStatusCounts(null)
    setRouteNowMeasuredAtIso(null)
    setRouteNowMeasurementFreshness(null)
    setRouteWindArrowCount(0)
    setRouteVegagerdinLastRefreshIso(null)
    setRouteVisibleStatusCounts(null)
    resetRouteDepartureForecastState()
    setRouteSurfaceChoices([])
    setRouteSurfaceChoicesStatus('idle')
    setRouteSwitchingChoiceId(null)
    setTeskeidCandidateStatus('idle')
    setRouteGuestQuotaReached(false)
    setRouteQuotaSignInPending(false)
    setPreviewRouteChoiceId(null)
    setRouteComparisonFullscreen(false)
    setRouteComparisonOpening(false)
    routeComparisonApplyPendingRef.current = false
    setRouteComparisonApplyPending(false)
    pendingWeatherResultsFocusRunIdRef.current = null
    routeComparisonAutoOpenedRunIdRef.current = null
    stopRouteLiveLocation()
    setLiveDriveModeState('off')
    vedurstofanLayerRef.current = undefined
    routeAuditPolylinePointsRef.current = []
    routeVegagerdinCacheStatusRef.current = null
    resolvedRoutePlacesRef.current = null
    routeForecastRetryContextRef.current = null
    setRouteForecastRetryPending(false)
    clearRouteVedurstofanLabelMarkers()
    clearRouteVegagerdinLabelMarkers()
    setRouteHandoffOnlySummary(summary)
    setRouteCalculationPlaceNames({
      from: summary.navigationOriginName,
      to: summary.navigationDestinationName,
    })
    clearRouteEndpointMarkers()
    const map = mapRef.current
    for (const sourceId of [
      VEGAGERDIN_ROUTE_STATIONS_LAYER_ID,
      VEGAGERDIN_ROUTE_WIND_ARROWS_SOURCE_ID,
      VEDURSTOFAN_ROUTE_STATIONS_LAYER_ID,
      TRAVEL_METNO_LAYER_ID,
      'travel-bridge-route',
      ROUTE_GRAVEL_SECTIONS_SOURCE_ID,
      ROUTE_DIRECTION_SECTIONS_SOURCE_ID,
    ] as const) {
      const source = map?.getSource(sourceId)
      if (source) {
        ;(source as import('maplibre-gl').GeoJSONSource).setData(
          EMPTY_FEATURE_COLLECTION as never,
        )
      }
    }
    updateOverviewLayerVisibility(overviewActiveModeRef.current, false)
    reconcilePlaceMarkerVisibility()
    setRouteBridgeStatus('success')
  }

  async function calculateResolvedRoute({
    places,
    thresholds,
    signal,
    selectedRouteId,
    routeEnvelope,
    openComparisonOnSuccess = false,
  }: {
    places: ResolvedRoutePlaces
    thresholds: ResolvedTravelThresholds
    signal: AbortSignal
    selectedRouteId?: string | null
    routeEnvelope?: RouteOptionEnvelopeV1 | null
    openComparisonOnSuccess?: boolean
  }): Promise<boolean> {
    const endpoints = resolveAssessmentClientEndpoints(places)
    const origin = endpoints.assessment.origin
    const destination = endpoints.assessment.destination
    const effectiveSelectedRouteId = routeEnvelope?.route.id ?? selectedRouteId ?? null
    logRoadMapDiagnostic('route fetch', {
      selectedRouteId: effectiveSelectedRouteId,
      assessmentScopeId: places.assessmentScope.scopeId,
    })
    const t0 = performance.now()
    const mapReadyPromise = waitForMapReady(20_000, signal)
      .then(() => null)
      .catch((error: unknown) => error)
    const res = await fetch('/api/teskeid/weather/travel', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify(buildAssessmentTravelRequest(places, {
        trailerKind: 'none',
        thresholdOverrides: {
          cautionWindMs: thresholds.cautionWindMs,
          redWindMs: thresholds.redWindMs,
        },
        ...(routeEnvelope
          ? { routeEnvelope }
          : effectiveSelectedRouteId
            ? { selectedRouteId: effectiveSelectedRouteId }
            : {}),
      })),
    })

    const contentType = res.headers.get('content-type') ?? ''
    if (res.status === 401 || !contentType.includes('application/json')) {
      throw new Error('auth')
    }
    if (res.status === 429) throw new Error('rate_limited')

    const data = await res.json().catch(() => null)
    const requestIsStale = () => (
      !isCurrentRouteWeatherRequest(signal, routeBridgeRequestRef.current?.signal)
    )
    // A newer preview/apply aborts the previous request. In particular, an
    // old weather 503 must not install its retry context over the newer
    // selection after the response body has already arrived.
    if (requestIsStale()) return false
    if (res.status === 503 && data?.error === 'forecast_unavailable') {
      routeForecastRetryContextRef.current = {
        places,
        thresholds,
        selectedRouteId: effectiveSelectedRouteId,
        routeEnvelope: routeEnvelope ?? null,
      }
      setRouteForecastRetryPending(false)
      // Route discovery succeeded. Weather failure must not replace or hide
      // the ordered Teskeið route artifact.
      setRouteHandoffOnlySummary(null)
      setRouteBridgeError(t('roadMapPrototypeAssessmentWeatherUnavailable'))
      setRouteBridgeStatus('success')
      setRouteComparisonOpening(false)
      return false
    }
    if (!res.ok || !data) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[RoadMap] route API error payload:', data)
      }
      throw new Error(typeof data?.error === 'string' ? data.error : 'travel_failed')
    }
    if (requestIsStale()) return false

    const travelResult = data as DeterministicResult
    const weatherCoverage = travelResult.travelPlan?.route.weatherCoverage ?? {
      status: 'unavailable' as const,
      reason: 'road_graph_unavailable' as const,
    }
    const assessmentCompleteness = travelResult.travelPlan?.route.assessmentCompleteness
    const hasGeometricWeatherCoverage =
      weatherCoverage.status === 'full' || weatherCoverage.status === 'partial'
    const hasAssessedWeatherCoverage = hasGeometricWeatherCoverage && (
      assessmentCompleteness?.status === 'complete'
      || assessmentCompleteness?.status === 'partial'
    )
    if (!hasAssessedWeatherCoverage || !assessmentCompleteness) {
      routeForecastRetryContextRef.current = {
        places,
        thresholds,
        selectedRouteId: effectiveSelectedRouteId,
        routeEnvelope: routeEnvelope ?? null,
      }
      setRouteForecastRetryPending(false)
      setRouteHandoffOnlySummary(null)
      setRouteBridgeError(t('roadMapPrototypeAssessmentWeatherUnavailable'))
      setRouteBridgeStatus('success')
      setRouteComparisonOpening(false)
      return false
    }
    console.log('[RoadMap] route API:', Math.round(performance.now() - t0), 'ms, status:', res.status)
    const mapReadyError = await mapReadyPromise
    if (mapReadyError) throw mapReadyError
    if (requestIsStale()) return false

    const extra = data as Record<string, unknown>
    if (extra['roadIntelligenceDebug'] && typeof extra['roadIntelligenceDebug'] === 'object') {
      logRoadMapDiagnostic('route api debug payload', extra['roadIntelligenceDebug'] as Record<string, unknown>)
    }
    const vedurstofanLayer = hasAssessedWeatherCoverage && isVedurstofanTravelLayer(extra['vedurstofanLayer'])
      ? extra['vedurstofanLayer']
      : undefined
    const serverVegagerdinLayer = hasAssessedWeatherCoverage && isVegagerdinRouteLayer(extra['vegagerdinLayer'])
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
      !hasAssessedWeatherCoverage || (serverVegagerdinLayer && serverVegagerdinLayer.points.length > 0)
        ? null
        : await fetchVegagerdinCurrentForRoute(signal)
    if (requestIsStale()) return false
    const vegagerdinLayer =
      !hasAssessedWeatherCoverage
        ? undefined
        : serverVegagerdinLayer && serverVegagerdinLayer.points.length > 0
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
      countUsableWindStatuses(vegagerdinRender.statusCounts),
      vedurstofanRender.count,
    )
    console.log('[RoadMap] providers — vegagerdin:', vegagerdinRender.count, 'stations', vegagerdinRender.statusCounts, '| vedurstofan:', vedurstofanRender.count, '| slotSource:', slotSource, '| timeline:', timelineCandidates?.length ?? 0, 'slots')
    const nowStatusCounts =
      vegagerdinRender.count > 0
        ? vegagerdinRender.statusCounts
        : {}
    const hasUsableVegagerdinNow = countUsableWindStatuses(nowStatusCounts) > 0
    const nowMeasuredAtIso =
      vegagerdinLayer?.measuredAtIso ??
      newestVegagerdinRouteMeasuredAtIso(routeVegagerdinPointsRef.current)
    const nowMeasurementFreshness = freeDriveStationFreshness(nowMeasuredAtIso)
    // Station providers are display-only evidence. Even a complete station
    // read does not prove complete spatial coverage and must never override
    // the route-wide forecast assessment.
    const providerStatus = travelResult.stada
    const providerAnswer = travelResult.svar
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
      origin.name,
      destination.name,
      weatherCoverage,
    )

    if (openComparisonOnSuccess) {
      const runId = routeBridgeRunIdRef.current
      routeComparisonAutoOpenedRunIdRef.current = runId
      setRouteComparisonFullscreen(true)
      setRouteComparisonOpening(false)
    }
    setRouteHandoffOnlySummary(null)
    routeForecastRetryContextRef.current = null
    setRouteForecastRetryPending(false)
    setRouteBridgeSummary({
      fromName: origin.name,
      toName: destination.name,
      fromAreaName: routeAssessmentAreaName(origin),
      toAreaName: routeAssessmentAreaName(destination),
      selectedRouteId: effectiveSelectedRouteId,
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
      origin: { lat: origin.lat, lon: origin.lon },
      destination: { lat: destination.lat, lon: destination.lon },
      weatherCoverage,
      assessmentCompleteness,
      navigationOrigin: endpoints.navigation.origin,
      navigationDestination: endpoints.navigation.destination,
      navigationOriginName: endpoints.navigation.originName,
      navigationDestinationName: endpoints.navigation.destinationName,
    })
    setRouteTravelResult(travelResult)
    setRouteVedurstofanLayer(vedurstofanLayer ?? null)
    setRouteNowStatusCounts(nowStatusCounts)
    setRouteNowMeasuredAtIso(nowMeasuredAtIso)
    setRouteNowMeasurementFreshness(nowMeasurementFreshness)
    setRouteVegagerdinLastRefreshIso(vegagerdinLayer?.fetchedAtIso ?? null)
    setRouteVisibleStatusCounts(nowStatusCounts)
    setRouteCandidates(initialRouteCandidates)
    setSelectedCandidateIdx(null)
    handleRouteStatusFilterChange(createDefaultRouteVisibleWindStatuses())
    updateRouteWeatherLayerVisibility(nowRouteMode)
    setRouteBridgeStatus('success')
    console.log('[RoadMap] route success — initial candidates:', initialRouteCandidates?.length ?? 0, '| selectedCandidateIdx: null | nowCounts:', nowStatusCounts, '| nowMeasuredAtIso:', nowMeasuredAtIso)

    routeForecastBuildContextRef.current =
      timelineCandidates && timelineCandidates.length > 0
        ? {
            timelineCandidates,
            thresholds,
            routeDurationMinutes: mapData.durationMinutes,
            vedurstofanLayer,
            vedurstofanStationCount: vedurstofanRender.count,
            signal,
          }
        : null
    setRouteDepartureForecastExpanded(false)
    setRouteForecastBuildStatus('idle')
    // Auto-build departure forecast so DriveJourneyPanel scrubber is ready
    handleRouteDepartureForecastOptIn()
    return true
  }

  async function handleRetryRouteForecast() {
    const context = routeForecastRetryContextRef.current
    const currentPlaces = resolvedRoutePlacesRef.current
    if (
      !context
      || !currentPlaces
      || routeForecastRetryPending
      || currentPlaces.assessmentScope.scopeId !== context.places.assessmentScope.scopeId
    ) return

    routeBridgeRequestRef.current?.abort()
    const controller = new AbortController()
    routeBridgeRequestRef.current = controller
    setRouteForecastRetryPending(true)
    setRouteBridgeError(null)
    try {
      const currentChoice = routeSurfaceChoices.find(choice => (
        choice.routeId === (selectedRouteChoiceId ?? context.selectedRouteId)
      ))
      let choice = currentChoice
      const envelopeExpiresAtMs = Date.parse(choice?.routeEnvelope?.expiresAt ?? '')
      if (choice && (!Number.isFinite(envelopeExpiresAtMs) || envelopeExpiresAtMs <= Date.now() + 5_000)) {
        choice = await refreshRouteChoiceEnvelope(choice, currentPlaces, controller.signal)
      }
      if (controller.signal.aborted) return
      const selectedRouteId = choice?.routeId ?? context.selectedRouteId
      const routeEnvelope = choice?.routeEnvelope ?? context.routeEnvelope
      if (choice) {
        setPreviewRouteChoiceId(choice.routeId)
        previewSurfaceRouteChoice(choice, true)
      }
      await calculateResolvedRoute({
        places: currentPlaces,
        thresholds: context.thresholds,
        signal: controller.signal,
        selectedRouteId,
        routeEnvelope,
      })
    } catch (error) {
      if (controller.signal.aborted) return
      const code = error instanceof Error ? error.message : 'unknown'
      setRouteBridgeError(
        code === 'auth'
          ? t('roadMapPrototypeRouteAuthError')
          : code === 'rate_limited'
            ? t('roadMapPrototypeRouteRateLimited')
            : t('roadMapPrototypeAssessmentWeatherUnavailable'),
      )
    } finally {
      if (!controller.signal.aborted) setRouteForecastRetryPending(false)
      if (routeBridgeRequestRef.current === controller) routeBridgeRequestRef.current = null
    }
  }

  function handleRetryUnavailableRoute() {
    const summary = routeHandoffOnlySummary
    if (!summary || summary.reason === 'same_area' || routeBridgeStatus === 'loading') return
    setRouteFrom(summary.navigationOriginName)
    setRouteTo(summary.navigationDestinationName)
    setFromResolved(summary.navigationOrigin)
    setToResolved(summary.navigationDestination)
    setRouteBridgeError(null)
    setRouteHandoffOnlySummary(null)
    setRouteBridgeStatus('idle')
    setIsPanelOpen(true)
    pendingRouteRestoreSubmitRef.current = true
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

    const isPlanningSubmission = routePlanningStep === 'thresholds'
    const thresholds = resolveRouteThresholdInputs(
      isPlanningSubmission ? routePlanningCautionWind : routeCautionWind,
      isPlanningSubmission ? routePlanningRedWind : routeRedWind,
    )
    if (!thresholds) {
      setRouteBridgeStatus('error')
      setRouteBridgeError(null)
      return
    }
    if (isPlanningSubmission) {
      setRouteCautionWind(routePlanningCautionWind)
      setRouteRedWind(routePlanningRedWind)
    }

    routeBridgeRequestRef.current?.abort()
    routeDiscoveryRequestRef.current?.abort()
    routeSectionsRefreshRequestRef.current?.abort()
    const runId = routeBridgeRunIdRef.current + 1
    routeBridgeRunIdRef.current = runId
    const controller = new AbortController()
    const discoveryController = new AbortController()
    routeBridgeRequestRef.current = controller
    routeDiscoveryRequestRef.current = discoveryController
    setRouteBridgeStatus('loading')
    setRouteBridgeError(null)
    setRouteGuestQuotaReached(false)
    setRouteQuotaSignInPending(false)
    setRoutePlaceFallbackSuggestion(null)
    clearRouteEndpointMarkers()
    setRouteBridgeSummary(null)
    setRouteHandoffOnlySummary(null)
    routeForecastRetryContextRef.current = null
    setRouteForecastRetryPending(false)
    setRouteTravelResult(null)
    setRouteVedurstofanLayer(null)
    setRouteCandidates(null)
    setRouteNowStatusCounts(null)
    setRouteNowMeasuredAtIso(null)
    setRouteVisibleStatusCounts(null)
    resetRouteDepartureForecastState()
    setRouteSurfaceChoices([])
    setRouteSurfaceChoicesStatus('idle')
    setRouteSwitchingChoiceId(null)
    setTeskeidCandidateStatus('idle')
    setPreviewRouteChoiceId(null)
    setRouteComparisonFullscreen(false)
    setRouteComparisonOpening(true)
    routeComparisonApplyPendingRef.current = false
    setRouteComparisonApplyPending(false)
    pendingWeatherResultsFocusRunIdRef.current = null
    setVisibleCandidateLimit(ROUTE_TIMELINE_INITIAL_SLOT_COUNT)
    setRouteCalculationPlaceNames({ from: fromQuery, to: toQuery })
    setSelectedCandidateIdx(null)
    setRouteWeatherModeState('now')
    setFromSuggestions([])
    setToSuggestions([])
    setRouteContextView('information')
    setIsPanelOpen(true)

    let attemptedOrigin: RoadIntelligencePlaceResult | null = null
    let attemptedDestination: RoadIntelligencePlaceResult | null = null
    try {
      const [origin, destination] = await Promise.all([
        resolveBridgePlace(fromQuery, controller.signal, [fromResolved, ...fromSuggestions]),
        resolveBridgePlace(toQuery, controller.signal, [toResolved, ...toSuggestions]),
      ])
      if (controller.signal.aborted) return
      attemptedOrigin = origin
      attemptedDestination = destination
      void savePlaceBestEffort(origin)
      void savePlaceBestEffort(destination)

      if (!teskeidRouteCandidateEnabled) throw new Error('route_unavailable')
      setRouteSurfaceChoicesStatus('loading')
      setTeskeidCandidateStatus('loading')
      let result = await fetchTeskeidCandidate(
        origin,
        destination,
        null,
        discoveryController.signal,
        true,
        'extended',
        0,
      )
      for (
        let retryIndex = 0;
        result.status === 'pending' && retryIndex < ROUTE_SCOPE_RETRY_DELAYS_MS.length;
        retryIndex += 1
      ) {
        setTeskeidCandidateStatus('pending')
        await waitForAbortableBrowser(
          ROUTE_SCOPE_RETRY_DELAYS_MS[retryIndex],
          discoveryController.signal,
        )
        result = await fetchTeskeidCandidate(
          origin,
          destination,
          result.assessmentScope?.scopeId ?? null,
          discoveryController.signal,
          true,
          'extended',
          retryIndex + 1,
        )
      }
      if (
        controller.signal.aborted
        || discoveryController.signal.aborted
        || routeBridgeRunIdRef.current !== runId
      ) return
      if (result.status !== 'ready' || result.choices.length === 0 || !result.assessmentScope) {
        setTeskeidCandidateStatus(result.status === 'pending' ? 'slow' : result.status)
        setRouteSurfaceChoicesStatus('error')
        throw new Error(result.status === 'rate_limited' ? 'rate_limited' : 'route_unavailable')
      }

      const places: ResolvedRoutePlaces = {
        navigationOrigin: origin,
        navigationDestination: destination,
        navigationOriginName: fromQuery,
        navigationDestinationName: toQuery,
        assessmentOrigin: result.assessmentScope.origin,
        assessmentDestination: result.assessmentScope.destination,
        assessmentScope: result.assessmentScope,
      }
      resolvedRoutePlacesRef.current = places
      setRouteCalculationPlaceNames({
        from: places.assessmentOrigin.name,
        to: places.assessmentDestination.name,
      })
      setRouteSurfaceChoices(result.choices)
      setRouteSurfaceChoicesStatus('ready')
      setTeskeidCandidateStatus('ready')
      const recommendedChoice = result.choices.find(
        choice => choice.routeId === result.recommendedRouteId,
      ) ?? result.choices[0]
      setPreviewRouteChoiceId(recommendedChoice.routeId)
      previewSurfaceRouteChoice(recommendedChoice, true)
      setRouteBridgeStatus('success')
      routeComparisonAutoOpenedRunIdRef.current = runId
      setRouteComparisonFullscreen(true)
      setRouteComparisonOpening(false)
    } catch (err) {
      if (controller.signal.aborted) return
      discoveryController.abort()
      const code = err instanceof Error ? err.message : 'unknown'
      console.error('[RoadMap] route failed:', code, err)
      if (
        code === 'assessment_scope_invalid'
        && attemptedOrigin
        && attemptedDestination
      ) {
        showRouteHandoffOnly({
          navigationOrigin: attemptedOrigin,
          navigationDestination: attemptedDestination,
          navigationOriginName: fromQuery,
          navigationDestinationName: toQuery,
          assessment: null,
          reason: 'assessment_unavailable',
        })
        return
      }
      if (
        code !== 'auth' &&
        code !== 'rate_limited' &&
        code !== 'rate_limited_guest' &&
        code !== 'map_not_ready'
      ) {
        const fallbackCandidate = (
          [
            { field: 'from' as const, place: attemptedOrigin },
            { field: 'to' as const, place: attemptedDestination },
          ] as const
        )
          .filter(candidate => candidate.place !== null)
          .map(candidate => ({
            ...candidate,
            nearest: findNearestKnownRoadMapPlace(candidate.place!, 30_000),
          }))
          .filter(candidate =>
            candidate.nearest !== null &&
            makeWeatherPlaceKey(candidate.place!.lat, candidate.place!.lon) !==
              makeWeatherPlaceKey(candidate.nearest.place.lat, candidate.nearest.place.lon),
          )
          .sort((a, b) => a.nearest!.distanceM - b.nearest!.distanceM)[0]
        if (fallbackCandidate?.place && fallbackCandidate.nearest) {
          setRoutePlaceFallbackSuggestion({
            field: fallbackCandidate.field,
            originalName: fallbackCandidate.place.name,
            nearbyPlace: fallbackCandidate.nearest.place,
            distanceKm: fallbackCandidate.nearest.distanceM / 1000,
          })
        }
      }
      const message =
        code === 'rate_limited_guest'
          ? null
          : code === 'place_not_found'
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
      setRouteGuestQuotaReached(code === 'rate_limited_guest')
      setRouteComparisonOpening(false)
    }
  }

  function previewSurfaceRouteChoice(choice: RouteSurfaceChoice, force = false) {
    if (routeSwitchingChoiceId && !force) return
    setPreviewRouteChoiceId(choice.routeId)
    const previewHasAppliedWeather = choice.routeId === routeBridgeSummary?.selectedRouteId
    if (!previewHasAppliedWeather) {
      const weatherMap = mapRef.current
      for (const layerId of ROUTE_FILTER_LAYER_IDS) {
        setRouteLayerLayoutVisibility(weatherMap, layerId, false)
      }
      for (const { element } of [
        ...routeVegagerdinLabelMarkersRef.current,
        ...routeVedurstofanLabelMarkersRef.current,
      ]) {
        element.style.display = 'none'
      }
    } else {
      updateRouteWeatherLayerVisibility()
    }
    const points = choice.route.providerMatchingPoints?.length
      ? choice.route.providerMatchingPoints
      : choice.route.points
    const map = mapRef.current
    const source = map?.getSource('travel-bridge-route')
    if (!map || !source || points.length < 2) return
    ;(source as import('maplibre-gl').GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: points.map(point => [point.lon, point.lat]) },
      }],
    } as never)
    if (map.getLayer('travel-bridge-route')) {
      map.setLayoutProperty('travel-bridge-route', 'visibility', 'visible')
      map.setPaintProperty(
        'travel-bridge-route',
        'line-color',
        routeComparisonColor(Math.max(0, routeSurfaceChoices.findIndex(route => route.routeId === choice.routeId))),
      )
    }
    const lons = points.map(point => point.lon)
    const lats = points.map(point => point.lat)
    map.fitBounds(
      [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: { top: 150, right: 40, bottom: 170, left: 40 }, duration: 0, maxZoom: 9 },
    )
  }

  async function handleSelectSurfaceRouteChoice(choice: RouteSurfaceChoice): Promise<boolean> {
    if (routeBridgeStatus === 'loading' || routeSwitchingChoiceId) return false
    const resolvedPlaces = resolvedRoutePlacesRef.current
    const thresholds = routeBridgeSummary?.thresholdsUsed ?? routeThresholdsRef.current
    if (!resolvedPlaces || !thresholds) return false

    console.log('[RoadMap] route switch to:', choice.routeId, choice.label)
    routeBridgeRequestRef.current?.abort()
    const controller = new AbortController()
    routeBridgeRequestRef.current = controller
    setRouteSwitchingChoiceId(choice.routeId)
    setRouteBridgeError(null)
    routeForecastRetryContextRef.current = null
    setRouteForecastRetryPending(false)
    setRouteCalculationPlaceNames({
      from: resolvedPlaces.assessmentOrigin.name,
      to: resolvedPlaces.assessmentDestination.name,
    })
    setRouteContextView('information')
    setIsPanelOpen(true)

    try {
      const freshEnvelope = choice.routeEnvelope
        ? findFreshRouteEnvelope([choice.routeEnvelope], choice.routeId)
        : null
      let choiceToApply = freshEnvelope
        && freshEnvelope.assessmentScopeId === resolvedPlaces.assessmentScope.scopeId
        ? choice
        : await refreshRouteChoiceEnvelope(
            choice,
            resolvedPlaces,
            controller.signal,
          )
      if (controller.signal.aborted) return false
      setRouteSwitchingChoiceId(choiceToApply.routeId)
      setPreviewRouteChoiceId(choiceToApply.routeId)
      previewSurfaceRouteChoice(choiceToApply, true)

      const applyChoice = (selectedChoice: RouteSurfaceChoice) => calculateResolvedRoute({
        places: resolvedPlaces,
        thresholds,
        signal: controller.signal,
        selectedRouteId: selectedChoice.routeId,
        routeEnvelope: selectedChoice.routeEnvelope,
      })
      let applied: boolean
      try {
        applied = await applyChoice(choiceToApply)
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'route_envelope_invalid') throw error
        choiceToApply = await refreshRouteChoiceEnvelope(
          choiceToApply,
          resolvedPlaces,
          controller.signal,
        )
        if (controller.signal.aborted) return false
        setRouteSwitchingChoiceId(choiceToApply.routeId)
        setPreviewRouteChoiceId(choiceToApply.routeId)
        previewSurfaceRouteChoice(choiceToApply, true)
        applied = await applyChoice(choiceToApply)
      }
      if (!controller.signal.aborted) setVisibleCandidateLimit(ROUTE_TIMELINE_INITIAL_SLOT_COUNT)
      return applied && !controller.signal.aborted
    } catch (err) {
      if (controller.signal.aborted) return false
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
      return false
    } finally {
      if (!controller.signal.aborted) setRouteSwitchingChoiceId(null)
    }
  }

  function requestWeatherResultsFocus(runId: number) {
    if (routeBridgeRunIdRef.current !== runId) return
    pendingWeatherResultsFocusRunIdRef.current = runId
    setRouteContextView('information')
    setIsPanelOpen(true)
    setRouteComparisonFullscreen(false)
    setRouteComparisonOpening(false)
  }

  async function handleApplyRouteComparison() {
    if (routeComparisonApplyPendingRef.current) return
    const choice = routeSurfaceChoices.find(route => route.routeId === selectedRouteChoiceId)
    if (!choice) return
    const runId = routeBridgeRunIdRef.current

    if (!shouldRecalculateRouteChoice(choice.routeId, appliedRouteChoiceId)) {
      if (routeHasAssessedWeatherCoverage && routeBridgeSummary && routeTravelResult) {
        requestWeatherResultsFocus(runId)
      }
      return
    }

    routeComparisonApplyPendingRef.current = true
    setRouteComparisonApplyPending(true)
    try {
      const applied = await handleSelectSurfaceRouteChoice(choice)
      if (applied && routeBridgeRunIdRef.current === runId) {
        requestWeatherResultsFocus(runId)
      }
    } finally {
      if (routeBridgeRunIdRef.current === runId) {
        routeComparisonApplyPendingRef.current = false
        setRouteComparisonApplyPending(false)
      }
    }
  }

  function restoreAppliedSurfaceRoutePreview() {
    const appliedChoice = routeSurfaceChoices.find(
      route => route.routeId === appliedRouteChoiceId,
    )
    if (appliedChoice) previewSurfaceRouteChoice(appliedChoice, true)
    else {
      const recommendedChoice = routeSurfaceChoices[0]
      if (recommendedChoice) previewSurfaceRouteChoice(recommendedChoice, true)
      else setPreviewRouteChoiceId(null)
    }
  }

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    async function initMap() {
      if (!containerRef.current) return
      try {
        mapInitializationReadyRef.current = false
        const maplibregl = await import('maplibre-gl')
        if (cancelled || !containerRef.current) return

        const map = new maplibregl.Map({
          container: containerRef.current,
          // The forecast context uses Stamen Terrain's hillshaded background
          // and cartographic lines, without the provider's place-label layer.
          // These are separate from the raw
          // Vegagerðin road-network and condition overlays used only in Akstur.
          style: {
            version: 8,
            sources: {
              // Always keep a no-auth fallback below Stadia. The terrain layers
              // cover it when available; if production domain auth or the tile
              // provider fails, users still get a usable map instead of white.
              'forecast-fallback': {
                type: 'raster',
                tiles: DRIVE_MAP_CARTO_TILES,
                tileSize: 256,
                attribution: DRIVE_MAP_CARTO_ATTRIBUTION,
              },
              'forecast-terrain-background': {
                type: 'raster',
                tiles: STAMEN_TERRAIN_BACKGROUND_TILES,
                tileSize: 256,
                attribution: STAMEN_TERRAIN_ATTRIBUTION,
              },
              'forecast-terrain-lines': {
                type: 'raster',
                tiles: STAMEN_TERRAIN_LINE_TILES,
                tileSize: 256,
              },
            },
            layers: [
              {
                id: 'forecast-fallback',
                type: 'raster',
                source: 'forecast-fallback',
              },
              {
                id: 'forecast-terrain-background',
                type: 'raster',
                source: 'forecast-terrain-background',
              },
              {
                id: 'forecast-terrain-lines',
                type: 'raster',
                source: 'forecast-terrain-lines',
              },
            ],
          },
          center: ICELAND_CENTER,
          zoom: ICELAND_ZOOM,
          attributionControl: false,
        })

        map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')
        collapseMapAttribution(containerRef.current)

        mapRef.current = map
        popupConstructorRef.current = maplibregl.Popup
        markerConstructorRef.current = maplibregl.Marker

        const reportedMapErrors = new Set<string>()
        map.on('error', (event) => {
          const error = event.error
          const message = error instanceof Error ? error.message : String(error)
          if (reportedMapErrors.has(message)) return
          reportedMapErrors.add(message)
          console.warn('[RoadMapPrototype] MapLibre source error; fallback remains active:', error)
        })

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
          collapseMapAttribution(containerRef.current)

          map.addSource('carto-basemap', {
            type: 'raster',
            tiles: DRIVE_MAP_CARTO_TILES,
            tileSize: 256,
            attribution: DRIVE_MAP_CARTO_ATTRIBUTION,
          })
          map.addLayer({
            id: 'carto-basemap',
            type: 'raster',
            source: 'carto-basemap',
            layout: {
              visibility: lastMapContextRef.current === 'route' ? 'visible' : 'none',
            },
          })

          if (hasRoadIntelligence) {
            map.addSource('vegagerdin-vegakerfi', {
              type: 'raster',
              tiles: DRIVE_MAP_ROAD_NETWORK_TILES,
              tileSize: 256,
              attribution: VEGAGERDIN_ATTRIBUTION,
            })
            map.addLayer({
              id: 'vegagerdin-vegakerfi',
              type: 'raster',
              source: 'vegagerdin-vegakerfi',
              layout: {
                visibility:
                  lastMapContextRef.current === 'route'
                    && showOverlayRef.current
                    && !routeLiveMapPresentationActiveRef.current
                    ? 'visible'
                    : 'none',
              },
              paint: { 'raster-opacity': 0.78 },
            })
          }

          forecastGlacierLabelMarkersRef.current.forEach(({ marker }) => marker.remove())
          forecastGlacierLabelMarkersRef.current = FORECAST_GLACIER_LABELS.map((glacier) => {
            const element = document.createElement('div')
            element.textContent = glacier.name
            element.setAttribute('aria-hidden', 'true')
            element.style.cssText = [
              'pointer-events:none',
              'color:#49697a',
              'font:italic 600 12px/1.1 Inter,system-ui,sans-serif',
              'letter-spacing:0.025em',
              'text-align:center',
              'white-space:pre-line',
              'text-shadow:-1px -1px 0 rgba(255,255,255,0.9),1px -1px 0 rgba(255,255,255,0.9),-1px 1px 0 rgba(255,255,255,0.9),1px 1px 0 rgba(255,255,255,0.9),0 1px 3px rgba(15,23,42,0.2)',
              lastMapContextRef.current === 'weather' ? '' : 'display:none',
            ].filter(Boolean).join(';')

            const marker = new maplibregl.Marker({ element, anchor: 'center' })
              .setLngLat([glacier.lon, glacier.lat])
              .addTo(map)

            return { marker, element, glacier }
          })
          updateForecastGlacierLabelPresentation()
          map.on('zoom', updateForecastGlacierLabelPresentation)

          forecastMountainLabelMarkersRef.current.forEach(({ marker }) => marker.remove())
          forecastMountainLabelMarkersRef.current = FORECAST_MOUNTAIN_LABELS.map((mountain) => {
            const element = document.createElement('div')
            element.textContent = `▲ ${mountain.name}`
            element.setAttribute('aria-hidden', 'true')
            element.style.cssText = [
              'pointer-events:none',
              'color:#665747',
              'font:600 11px/1.1 Inter,system-ui,sans-serif',
              'letter-spacing:0.01em',
              'text-align:center',
              'white-space:pre-line',
              'text-shadow:-1px -1px 0 rgba(255,255,255,0.88),1px -1px 0 rgba(255,255,255,0.88),-1px 1px 0 rgba(255,255,255,0.88),1px 1px 0 rgba(255,255,255,0.88),0 1px 3px rgba(15,23,42,0.18)',
              'display:none',
            ].join(';')

            const marker = new maplibregl.Marker({ element, anchor: 'center' })
              .setLngLat([mountain.lon, mountain.lat])
              .addTo(map)

            return { marker, element, mountain }
          })
          updateForecastMountainLabelPresentation()
          map.on('zoom', updateForecastMountainLabelPresentation)

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
              const livePresentation = resolveLiveRouteMapPresentation({
                liveTrackingActive:
                  routeLiveMapPresentationActiveRef.current
                  && lastMapContextRef.current === 'route',
                configuredVegagerdinRasterVisibility:
                  lastMapContextRef.current === 'route' && showOverlayRef.current
                    ? 'visible'
                    : 'none',
                configuredRoadSegmentsVisibility:
                  lastMapContextRef.current === 'route' && showSegmentsRef.current
                    ? 'visible'
                    : 'none',
              })
              map.addSource('road-segments', { type: 'geojson', data: geojson as never })
              map.addLayer({
                id: 'road-segments',
                type: 'line',
                source: 'road-segments',
                layout: {
                  'line-cap': 'round',
                  'line-join': 'round',
                  visibility: livePresentation.roadSegmentsVisibility,
                },
                ...(livePresentation.roadSegmentsFilter
                  ? { filter: livePresentation.roadSegmentsFilter as never }
                  : {}),
                paint: {
                  // Provider road-condition color, normalized by the same-origin API.
                  'line-color': DRIVE_MAP_SEGMENT_COLOR_EXPRESSION as unknown as string,
                  'line-width': DRIVE_MAP_SEGMENT_WIDTH_EXPRESSION as unknown as number,
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
            try {
              await fetchAndRenderSegments(controller.signal)
            } catch {
              if (!cancelled && !controller.signal.aborted) {
                if (process.env.NODE_ENV !== 'production') {
                  console.warn('[RoadMapPrototype] road segments failed')
                }
              }
            }
          }

          // Road condition segments are optional capability data. Do not use
          // denied endpoint responses as client-side feature detection.
          if (hasRoadIntelligence) triggerSegmentLoad()
          map.on('moveend', () => {
            if (hasRoadIntelligence) {
              if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current)
              segmentTimerRef.current = setTimeout(triggerSegmentLoad, 400)
            }
            scheduleRouteLabelCollisionUpdate()
            scheduleOverviewMarkerVisibilityUpdate()
          })
          map.on('zoomend', scheduleRouteLabelCollisionUpdate)
          map.on('rotate', updateViewportWindDirectionMarkers)
          map.on('rotate', updateRouteMapCompassDirection)
          map.on('idle', scheduleOverviewMarkerReconciliation)

          removeOverviewMapLayerArtifacts(map)

          bringWeatherLayersToFront(map)
          updateOverviewLayerVisibility()
          if (!cancelled) {
            console.log('[RoadMap] map ready — style loaded, all layers initialized')
            mapInitializationReadyRef.current = true
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
      mapInitializationReadyRef.current = false
      clearTimerRef(segmentTimerRef)
      if (overviewDensityFrameRef.current !== null) {
        window.cancelAnimationFrame(overviewDensityFrameRef.current)
        overviewDensityFrameRef.current = null
      }
      if (overviewMarkerReconcileFrameRef.current !== null) {
        window.cancelAnimationFrame(overviewMarkerReconcileFrameRef.current)
        overviewMarkerReconcileFrameRef.current = null
      }
      abortControllerRef(segmentRequestRef)
      abortControllerRef(routeBridgeRequestRef)
      abortControllerRef(routeDiscoveryRequestRef)
      abortControllerRef(routeSectionsRefreshRequestRef)
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      placeMarkersRef.current.forEach(({ marker }) => marker.remove())
      placeMarkersRef.current = []
      forecastGlacierLabelMarkersRef.current.forEach(({ marker }) => marker.remove())
      forecastGlacierLabelMarkersRef.current = []
      forecastMountainLabelMarkersRef.current.forEach(({ marker }) => marker.remove())
      forecastMountainLabelMarkersRef.current = []
      clearOverviewStationMarkers()
      clearWeatherChaseMapMarkers()
      clearRouteVedurstofanLabelMarkers()
      clearRouteVegagerdinLabelMarkers()
      clearRouteEndpointMarkers()
      stopRouteLiveLocation(false)
      popupRef.current?.remove()
      popupRef.current = null
      popupConstructorRef.current = null
      markerConstructorRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [stopRouteLiveLocation, updateRouteMapCompassDirection])

  function changeForecastCardScale(delta: -1 | 1) {
    setForecastCardScaleIndex(index =>
      Math.max(0, Math.min(FORECAST_CARD_SCALE_LEVELS.length - 1, index + delta)),
    )
    if (!isAuthenticated) setForecastCardScaleChanged(true)
  }

  function handleForecastCardScaleSignIn() {
    const payload: WeatherChasePreferencesPayload = {
      selectedItems: weatherChaseSelectedItems.map(preferenceItemFromWeatherChaseItem),
      criteria: weatherChaseCriteria,
      visibleHours: mapVisibleHours,
      forecastCardScaleIndex,
    }
    try {
      window.sessionStorage.setItem(WEATHER_CHASE_PENDING_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Continue to sign-in even if session storage is unavailable.
    }
    const returnUrl = `${window.location.pathname}?saveWeatherChaseDefaults=1`
    window.location.href = `/innskraning?next=${encodeURIComponent(returnUrl)}`
  }

  function renderRouteSurfaceChoices() {
    if (!hasRoadIntelligence && !teskeidRouteCandidateEnabled) return null

    if (routeSurfaceChoicesStatus === 'loading') {
      return (
        <p className="mb-2 text-[10px] text-muted-foreground">
          {t('roadMapPrototypeSurfaceChoicesSearching')}
        </p>
      )
    }

    if (routeSurfaceChoices.length === 0) return null

    const appliedRouteId = appliedRouteChoiceId
    const selectedRouteId = selectedRouteChoiceId
    const selectedChoice = routeSurfaceChoices.find(choice => choice.routeId === selectedRouteId)
      ?? routeSurfaceChoices[0]
    const appliedChoice = routeSurfaceChoices.find(choice => choice.routeId === appliedRouteId)
      ?? routeSurfaceChoices[0]
    const hasSurfaceSummary = routeSurfaceChoices.some(choice => choice.surfaceSummary !== null)
    const selectedHasGravel = selectedChoice?.surfaceSummary?.hasGravel === true
    const hasGravelRoute = routeSurfaceChoices.some(choice => choice.surfaceSummary?.hasGravel)
    const hasPavedAlternative = routeSurfaceChoices.some(choice =>
      choice.routeId !== selectedRouteId && choice.surfaceSummary?.hasGravel === false,
    )

    if (!hasGravelRoute && routeSurfaceChoices.length <= 1 && teskeidCandidateStatus === 'idle') return null

    const gravelRoadNames = selectedChoice?.surfaceSummary?.gravelRoadNames ?? []
    const hasTeskeidSurface = routeSurfaceChoices.some(choice => Boolean(choice.route.experimental?.surface))
    const teskeidRouteCount = routeSurfaceChoices.filter(choice => choice.route.provider === 'teskeid').length
    const routeReferenceLabel = (choice: RouteSurfaceChoice | undefined): string => {
      if (!choice) return t('roadMapPrototypeGoogleRouteLabel')
      const providerChoices = routeSurfaceChoices.filter(route =>
        route.route.provider === choice.route.provider,
      )
      const providerLabel = choice.route.provider === 'teskeid'
        ? t('roadMapPrototypeTeskeidRouteLabel')
        : t('roadMapPrototypeGoogleRouteLabel')
      const routeName = choice.label !== providerLabel
        ? choice.label
        : choice.description
      return formatRouteReferenceLabel({
        providerLabel,
        providerIndex: Math.max(0, providerChoices.findIndex(route => route.routeId === choice.routeId)),
        providerCount: providerChoices.length,
        routeName,
      })
    }
    const intro = teskeidCandidateStatus === 'loading'
      ? t('roadMapPrototypeTeskeidCandidateLoading')
      : teskeidCandidateStatus === 'pending'
        ? t('roadMapPrototypeTeskeidCandidatePending')
        : teskeidCandidateStatus === 'slow'
          ? t('roadMapPrototypeTeskeidCandidateSlow')
        : teskeidCandidateStatus === 'no_route'
          ? t('roadMapPrototypeTeskeidCandidateNoRoute')
        : teskeidCandidateStatus === 'unavailable'
          ? t('roadMapPrototypeTeskeidCandidateUnavailable')
          : teskeidCandidateStatus === 'envelope_unavailable'
            ? t('roadMapPrototypeTeskeidCandidateEnvelopeUnavailable')
            : teskeidCandidateStatus === 'rate_limited'
              ? t('roadMapPrototypeTeskeidCandidateRateLimited')
            : hasTeskeidSurface
      ? null
      : !hasSurfaceSummary
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
        {intro ? <p className="mb-1.5 leading-snug">{intro}</p> : null}
        <RouteComparisonMiniMap
          ariaLabel={t('roadMapPrototypeRouteComparisonMapLabel')}
          routes={routeComparisonItems}
          onEnlarge={() => setRouteComparisonFullscreen(true)}
          enlargeLabel={tf('enlargeMap')}
        />
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
            const experimentalSurface = choice.route.experimental?.surface
            const uncertainSurfaceM = experimentalSurface
              ? experimentalSurface.mixedM + experimentalSurface.unknownM
              : 0
            const surfaceTotalM = experimentalSurface
              ? experimentalSurface.pavedM + experimentalSurface.gravelM + uncertainSurfaceM
              : 0
            const baseProviderLabel = choice.route.provider === 'teskeid'
              ? t('roadMapPrototypeTeskeidRouteLabel')
              : t('roadMapPrototypeGoogleRouteLabel')
            const sameProviderChoices = routeSurfaceChoices.filter(route => route.route.provider === choice.route.provider)
            const providerNumber = sameProviderChoices.findIndex(route => route.routeId === choice.routeId) + 1
            const providerLabel = sameProviderChoices.length > 1
              ? `${baseProviderLabel} ${providerNumber}`
              : baseProviderLabel
            const durationRank = [...routeSurfaceChoices]
              .sort((a, b) => a.durationMinutes - b.durationMinutes)
              .findIndex(route => route.routeId === choice.routeId) + 1
            const isCautionRoute = choice.route.provider === 'teskeid'
              && (choice.route.cautions?.length ?? 0) > 0
            const hasBestWeatherNow = bestWeatherRouteIds.has(choice.routeId)
            return (
              <button
                key={choice.identity}
                type="button"
                disabled={routeBridgeStatus === 'loading' || Boolean(routeSwitchingChoiceId)}
                onClick={() => previewSurfaceRouteChoice(choice)}
                aria-pressed={selected}
                className={`min-w-[205px] shrink-0 rounded-md border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default ${
                  selected
                    ? 'border-primary bg-background text-foreground'
                    : 'border-amber-300 bg-background/80 text-amber-950 hover:bg-background dark:border-amber-700 dark:text-amber-100'
                }`}
              >
                <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide">
                  <span
                    aria-hidden="true"
                    className="inline-block h-0.5 w-5 shrink-0 rounded-full"
                    style={{ backgroundColor: routeComparisonColor(routeSurfaceChoices.indexOf(choice)) }}
                  />
                  {providerLabel}
                </span>
                {choice.label !== baseProviderLabel && (
                  <span className="block truncate font-medium">
                    {switching ? t('roadMapPrototypeSurfaceRouteSwitching') : choice.label}
                  </span>
                )}
                <span className="block truncate text-[10px] text-muted-foreground">
                  {formatNum(choice.distanceKm, locale)} km
                </span>
                <span className="mt-1 block text-[10px] font-medium">
                  {t('roadMapPrototypeRouteDurationRank', {
                    duration: formatDurationMinutes(choice.durationMinutes),
                    rank: durationRank,
                    total: routeSurfaceChoices.length,
                  })}
                </span>
                {(isCautionRoute || hasBestWeatherNow || (experimentalSurface?.gravelM ?? 0) > 0) && (
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    {isCautionRoute && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">
                        {t('roadMapPrototypeRouteCautionMetric')}
                      </span>
                    )}
                    {(experimentalSurface?.gravelM ?? 0) > 0 && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        {t('roadMapPrototypeRouteGravelMetric', {
                          distance: formatNum((experimentalSurface?.gravelM ?? 0) / 1000, locale),
                        })}
                      </span>
                    )}
                    {hasBestWeatherNow && (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                        {t('roadMapPrototypeRouteBestWeatherNow')}
                      </span>
                    )}
                  </span>
                )}
                {experimentalSurface && surfaceTotalM > 0 ? (
                  <span className="mt-1.5 block">
                    <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <span className="bg-emerald-600" style={{ width: `${experimentalSurface.pavedM / surfaceTotalM * 100}%` }} />
                      <span className="bg-amber-600" style={{ width: `${experimentalSurface.gravelM / surfaceTotalM * 100}%` }} />
                      <span className="bg-slate-400" style={{ width: `${uncertainSurfaceM / surfaceTotalM * 100}%` }} />
                    </span>
                    <span className="mt-1 block whitespace-normal text-[10px] leading-snug text-muted-foreground">
                      {t('roadMapPrototypeSurfaceBreakdown', {
                        paved: formatNum(experimentalSurface.pavedM / 1000, locale),
                        gravel: formatNum(experimentalSurface.gravelM / 1000, locale),
                        uncertain: formatNum(uncertainSurfaceM / 1000, locale),
                      })}
                    </span>
                  </span>
                ) : choice.route.provider === 'teskeid' ? (
                  <span className="mt-1 block text-[10px] text-muted-foreground">{surfaceLabel}</span>
                ) : null}
              </button>
            )
          })}
          {teskeidRouteCandidateEnabled && teskeidCandidateStatus !== 'ready' && (
            <div className="min-w-[205px] shrink-0 rounded-md border border-dashed border-orange-300 bg-background/60 px-2.5 py-2 text-left dark:border-orange-700">
              <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-orange-800 dark:text-orange-200">
                <span
                  aria-hidden="true"
                  className="inline-block h-0.5 w-5 shrink-0 rounded-full"
                  style={{ backgroundColor: routeComparisonColor(routeSurfaceChoices.length) }}
                />
                {t('roadMapPrototypeTeskeidRouteLabel')}
              </span>
              <span className="block text-[10px] leading-snug text-muted-foreground">
                {teskeidCandidateStatus === 'loading'
                  ? t('roadMapPrototypeTeskeidCandidateCardLoading')
                  : teskeidCandidateStatus === 'pending'
                    ? t('roadMapPrototypeTeskeidCandidateCardPending')
                    : teskeidCandidateStatus === 'slow'
                      ? t('roadMapPrototypeTeskeidCandidateCardSlow')
                    : teskeidCandidateStatus === 'no_route'
                      ? t('roadMapPrototypeTeskeidCandidateCardNoRoute')
                      : teskeidCandidateStatus === 'rate_limited'
                        ? t('roadMapPrototypeTeskeidCandidateRateLimited')
                      : teskeidCandidateStatus === 'envelope_unavailable'
                        ? t('roadMapPrototypeTeskeidCandidateCardEnvelopeUnavailable')
                      : t('roadMapPrototypeTeskeidCandidateCardUnavailable')}
              </span>
            </div>
          )}
        </div>
        {teskeidCandidateStatus === 'rate_limited' && (
          <p role="status" className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {t('roadMapPrototypeTeskeidCandidateRateLimited')}
          </p>
        )}
        {teskeidCandidateStatus === 'ready' && teskeidRouteCount > 1 && (
          <p className="mt-2 text-[10px] font-medium text-orange-900 dark:text-orange-100">
            {t('roadMapPrototypeTeskeidAlternativesFound', { count: teskeidRouteCount })}
          </p>
        )}
        {selectedChoice && selectedRouteId !== appliedRouteId && (
          <div className="mt-2 border-t border-amber-200 pt-2 dark:border-amber-800">
            <p className="mb-2 text-[10px] leading-snug text-amber-900 dark:text-amber-100">
              {t('roadMapPrototypeRoutePreviewNotice', {
                preview: routeReferenceLabel(selectedChoice),
                applied: routeReferenceLabel(appliedChoice),
              })}
            </p>
            <button
              type="button"
              disabled={Boolean(routeSwitchingChoiceId)}
              onClick={() => void handleSelectSurfaceRouteChoice(selectedChoice)}
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {routeSwitchingChoiceId ? (
                <>
                  <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
                  {t('roadMapPrototypeRouteConditionsLoading')}
                </>
              ) : t('roadMapPrototypeRouteViewConditions')}
            </button>
          </div>
        )}
      </div>
    )
  }

  applyRefreshedRouteVegagerdinDataRef.current = payload => {
    const travelResult = routeTravelResult
    if (!travelResult || !routeActiveRef.current || routeWeatherModeRef.current !== 'now') return

    const layer = buildClientVegagerdinRouteLayer(
      travelResult,
      routeThresholdsRef.current,
      payload,
    )
    const render = renderVegagerdinStations(layer)
    const nowStatusCounts = render.statusCounts
    const nowMeasuredAtIso =
      layer?.measuredAtIso ?? newestVegagerdinRouteMeasuredAtIso(routeVegagerdinPointsRef.current)
    const nowMeasurementFreshness = freeDriveStationFreshness(nowMeasuredAtIso)

    setRouteNowStatusCounts(nowStatusCounts)
    setRouteVisibleStatusCounts(nowStatusCounts)
    setRouteNowMeasuredAtIso(nowMeasuredAtIso)
    setRouteNowMeasurementFreshness(nowMeasurementFreshness)
    setRouteVegagerdinLastRefreshIso(payload.fetchedAtIso)
    setRouteBridgeSummary(current => {
      if (!current || !routeActiveRef.current) return current
      const slotSource = routeSlotStatusSource(
        countUsableWindStatuses(nowStatusCounts),
        current.vedurstofanStationCount,
      )
      return {
        ...current,
        statusCounts: nowStatusCounts,
        vegagerdinStationCount: render.count,
        slotStatusSource: slotSource,
      }
    })

    updateRouteWeatherLayerVisibility('now')
  }

  useEffect(() => {
    if (liveDriveMode !== 'free-drive' || overviewVegagerdinRestricted) return

    let disposed = false
    let inFlight = false
    let requestController: AbortController | null = null

    const refresh = async () => {
      if (disposed || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      const controller = new AbortController()
      requestController = controller
      try {
        const response = await fetch('/api/teskeid/weather/vegagerdin/current', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        })
        const payload = response.ok
          ? await response.json().catch(() => null) as VegagerdinCurrentApiData | null
          : null
        if (
          disposed ||
          controller.signal.aborted ||
          liveDriveModeRef.current !== 'free-drive' ||
          payload?.status !== 'ok' ||
          payload.stations.length === 0
        ) {
          if (!disposed && !controller.signal.aborted) setFreeDriveStationFeedError(true)
          return
        }
        overviewVegagerdinDataRef.current = payload
        setOverviewVegagerdinData(payload)
        setOverviewVegagerdinLoading(false)
        setFreeDriveStationFeedError(false)
      } catch {
        if (!disposed && !controller.signal.aborted) setFreeDriveStationFeedError(true)
      } finally {
        inFlight = false
        if (requestController === controller) requestController = null
      }
    }

    const intervalId = window.setInterval(
      () => void refresh(),
      VEGAGERDIN_ROUTE_REFRESH_INTERVAL_MS,
    )
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    void refresh()

    return () => {
      disposed = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      requestController?.abort()
    }
  }, [liveDriveMode, overviewVegagerdinRestricted])

  useEffect(() => {
    const coverage = routeTravelResult?.travelPlan?.route.weatherCoverage
    if (
      !routeActive ||
      routeWeatherMode !== 'now' ||
      !routeTravelResult ||
      (coverage?.status !== 'full' && coverage?.status !== 'partial') ||
      overviewVegagerdinRestricted
    ) {
      return
    }

    const routeRunId = routeBridgeRunIdRef.current
    let disposed = false
    let inFlight = false
    let requestController: AbortController | null = null

    const refresh = async () => {
      if (disposed || inFlight || document.visibilityState === 'hidden') return
      inFlight = true
      // Age the visual field against wall clock even when the provider cache
      // returns the same fetchedAtIso. Stale arrows must disappear on time.
      renderRouteWindArrows(
        routeVegagerdinPointsRef.current,
        routeVegagerdinCacheStatusRef.current,
      )
      const controller = new AbortController()
      requestController = controller
      try {
        const response = await fetch('/api/teskeid/weather/vegagerdin/current', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) return
        const payload = await response.json().catch(() => null) as VegagerdinCurrentApiData | null
        if (
          disposed ||
          controller.signal.aborted ||
          routeBridgeRunIdRef.current !== routeRunId ||
          !routeActiveRef.current ||
          routeWeatherModeRef.current !== 'now' ||
          payload?.status !== 'ok' ||
          payload.stations.length === 0
        ) {
          return
        }

        const current = overviewVegagerdinDataRef.current
        if (current?.status === 'ok') {
          if (current.fetchedAtIso === payload.fetchedAtIso) {
            const routeMeasuredAtIso = newestVegagerdinRouteMeasuredAtIso(
              routeVegagerdinPointsRef.current,
            )
            setRouteNowMeasuredAtIso(routeMeasuredAtIso)
            setRouteNowMeasurementFreshness(
              freeDriveStationFreshness(routeMeasuredAtIso),
            )
            if (
              current.measurementFreshness !== payload.measurementFreshness ||
              current.cacheStatus !== payload.cacheStatus ||
              current.lastAttemptedAtIso !== payload.lastAttemptedAtIso
            ) {
              overviewVegagerdinDataRef.current = payload
              setOverviewVegagerdinData(payload)
            }
            return
          }
          const currentIsProviderCache = current.cacheStatus !== null
          const currentFetchedMs = Date.parse(current.fetchedAtIso)
          const nextFetchedMs = Date.parse(payload.fetchedAtIso)
          if (
            currentIsProviderCache &&
            Number.isFinite(currentFetchedMs) &&
            Number.isFinite(nextFetchedMs) &&
            nextFetchedMs <= currentFetchedMs
          ) {
            return
          }
        }

        overviewVegagerdinDataRef.current = payload
        setOverviewVegagerdinData(payload)
        applyRefreshedRouteVegagerdinDataRef.current(payload)
      } catch {
        // Keep the last successful provider payload and route rendering intact.
      } finally {
        inFlight = false
        if (requestController === controller) requestController = null
      }
    }

    const intervalId = window.setInterval(() => void refresh(), VEGAGERDIN_ROUTE_REFRESH_INTERVAL_MS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    void refresh()

    return () => {
      disposed = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      requestController?.abort()
    }
  }, [
    overviewVegagerdinRestricted,
    routeActive,
    routeTravelResult,
    routeWeatherMode,
  ])

  const routeSlotAssessments = useMemo(() => {
    if (!routeBridgeSummary || !routeCandidates) return null
    return buildProviderSlotAssessments({
      candidates: routeCandidates,
      thresholds: routeBridgeSummary.thresholdsUsed,
      routeDurationMinutes: routeBridgeSummary.durationMinutes,
      routeDistanceKm: routeBridgeSummary.distanceKm,
      vedurstofanLayer: routeVedurstofanLayer ?? undefined,
      vedurstofanStationCount: routeBridgeSummary.vedurstofanStationCount,
    })
  }, [
    routeBridgeSummary,
    routeCandidates,
    routeVedurstofanLayer,
  ])
  const routeSlotStatusOverrides = useMemo(
    () => routeSlotAssessments?.map(assessment => assessment.displayStatus) ?? null,
    [routeSlotAssessments],
  )

  // Derive the displayed route status + answer from the selected scrubber slot.
  // When the user selects slot N in the heatmap, the badge and answer update to
  // reflect that future whole-hour slot's provider status.
  const effectiveSelectedCandidateIdx =
    routeBridgeSummary && routeWeatherMode === 'forecast'
      ? selectedCandidateIdx
      : null
  const selectedRouteCandidate =
    effectiveSelectedCandidateIdx !== null && routeCandidates?.[effectiveSelectedCandidateIdx]
      ? routeCandidates[effectiveSelectedCandidateIdx]
      : null
  const selectedRouteSlotAssessment =
    effectiveSelectedCandidateIdx !== null
      ? routeSlotAssessments?.[effectiveSelectedCandidateIdx] ?? null
      : null
  const currentRouteCandidate = routeTravelResult
    ? getRouteCurrentCandidate(routeTravelResult)
    : null
  const baselineNowRouteWindStatus = currentRouteCandidate && routeBridgeSummary
    ? classifyCandidateWindDisplayStatus(
        currentRouteCandidate,
        routeBridgeSummary.thresholdsUsed,
      )
    : weatherStatusToWindDisplayStatus(routeBridgeSummary?.status ?? 'graent')
  const currentStationWorstStatus = worstWindDisplayStatusFromCounts(
    routeNowStatusCounts ?? {},
  )
  const nowRouteWindStatus = conservativelyCombineWindDisplayStatuses(
    baselineNowRouteWindStatus,
    currentStationWorstStatus,
  )
  const selectedRouteKnownWarning =
    selectedRouteSlotAssessment?.hazardStatus
    && selectedRouteSlotAssessment.hazardStatus !== 'innan-marka'
      ? selectedRouteSlotAssessment.hazardStatus
      : null
  const displayedRouteWindStatus = effectiveSelectedCandidateIdx !== null
    ? selectedRouteKnownWarning
      ?? selectedRouteSlotAssessment?.displayStatus
      ?? 'no_data'
    : nowRouteWindStatus
  const displayedRouteStatus: DeterministicResult['stada'] =
    windDisplayStatusToTravelStatus(displayedRouteWindStatus)
  const displayedRouteAnswer: string =
    routeBridgeSummary == null
      ? ''
      : selectedRouteCandidate
        ? providerRouteAnswer(displayedRouteWindStatus)
        : routeBridgeSummary.answer
  const displayedRouteSlotLabel =
    routeBridgeSummary == null
      ? ''
      : selectedRouteCandidate
        ? t('roadMapPrototypeViewingDepartureAt', {
            time: formatCompactDateTime(selectedRouteCandidate.departureIso, locale),
          })
        : t('roadMapPrototypeViewingDepartureNow')
  const displayedRouteCandidates = routeCandidates ? routeCandidates.slice(0, visibleCandidateLimit) : null
  const hasMoreCandidates = routeCandidates !== null && routeCandidates.length > visibleCandidateLimit
  const isDepartureForecastLoading = routeForecastBuildStatus === 'loading'
  const isRouteLoading = routeBridgeStatus === 'loading'
  const routeResultsDisplayState = resolveRouteResultsDisplayState({
    bridgeStatus: routeBridgeStatus,
    hasSummary: selectedRouteHasAppliedWeather && routeBridgeSummary !== null,
    hasTravelResult: selectedRouteHasAppliedWeather && routeTravelResult !== null,
    hasRouteChoices: routeSurfaceChoices.length > 0,
    hasHandoffOnly: routeHandoffOnlySummary !== null,
    switchingChoiceId: routeSwitchingChoiceId,
    comparisonOpening: routeComparisonOpening,
  })
  const routeResultsLoadingLabel = (
    isDepartureForecastLoading
  )
    ? t('roadMapPrototypeRouteLoaderNow')
    : (
      routeResultsDisplayState === 'route-switching'
    || routeResultsDisplayState === 'comparison-opening'
    )
      ? t('roadMapPrototypeRouteConditionsLoading')
      : t('roadMapPrototypeRouteLoading')
  const firstReadyRouteChoice = routeSurfaceChoices.find(
    choice => choice.routeId === previewRouteChoiceId,
  ) ?? routeSurfaceChoices[0] ?? null
  const firstReadyRouteLoadingLabel = isDepartureForecastLoading
    ? t('roadMapPrototypeRouteLoaderNow')
    : firstReadyRouteChoice?.route.provider === 'teskeid'
      ? t('roadMapPrototypeRouteProviderReady', {
          provider: t('roadMapPrototypeTeskeidRouteLabel'),
        })
      : firstReadyRouteChoice
        ? t('roadMapPrototypeRouteReady')
        : t('roadMapPrototypeRouteLoading')
  const activeRouteStatusCounts =
    routeWeatherMode === 'now'
      ? routeNowStatusCounts ?? {}
      : routeVisibleStatusCounts ?? routeBridgeSummary?.statusCounts ?? {}
  const routeNowMeasuredLabel = routeNowMeasuredAtIso
    ? t('roadMapPrototypeVegagerdinNowLabel', {
        time: formatKlTime(routeNowMeasuredAtIso),
      })
    : t('roadMapPrototypeVegagerdinNowFallback')
  const routeNowSuccessfulFetchAtIso = routeVegagerdinLastRefreshIso ?? (
    overviewVegagerdinData?.status === 'ok' ? overviewVegagerdinData.fetchedAtIso : null
  )
  const routeNowAttemptedFetchAtIso = overviewVegagerdinData?.status === 'ok'
    ? overviewVegagerdinData.lastAttemptedAtIso ?? overviewVegagerdinData.fetchedAtIso
    : routeNowSuccessfulFetchAtIso
  const routeNowStaleDetails = routeNowMeasurementFreshness === 'stale' &&
    routeNowMeasuredAtIso &&
    routeNowSuccessfulFetchAtIso &&
    routeNowAttemptedFetchAtIso
    ? {
        measuredAtIso: routeNowMeasuredAtIso,
        fetchedAtIso: routeNowSuccessfulFetchAtIso,
        attemptedAtIso: routeNowAttemptedFetchAtIso,
      }
    : null
  const routeNowStaleTimes = routeNowStaleDetails
    ? t('roadMapPrototypeVegagerdinDataStaleTimes', {
        measuredTime: formatKlTime(routeNowStaleDetails.measuredAtIso),
        fetchedTime: formatKlTime(routeNowStaleDetails.fetchedAtIso),
        attemptedTime: formatKlTime(routeNowStaleDetails.attemptedAtIso),
      })
    : null
  const routeNowDataIsVeryStale = routeNowStaleDetails
    ? freeDriveStationIsVeryStale(routeNowStaleDetails.measuredAtIso)
    : false
  const routeNowStaleMessage = routeNowStaleTimes
    ? routeNowDataIsVeryStale
      ? t('roadMapPrototypeVegagerdinDataVeryStale')
      : t('roadMapPrototypeVegagerdinDataStale', {
          measuredTime: formatKlTime(routeNowStaleDetails!.measuredAtIso),
          fetchedTime: formatKlTime(routeNowStaleDetails!.fetchedAtIso),
          attemptedTime: formatKlTime(routeNowStaleDetails!.attemptedAtIso),
        })
    : null
  const routeNowStaleNotice = routeNowStaleMessage && routeNowStaleTimes
    ? (
        <VegagerdinStaleNotice
          message={routeNowStaleMessage}
          isVeryStale={routeNowDataIsVeryStale}
          timeDetails={routeNowStaleTimes}
          statusLabel={t('roadMapPrototypeVegagerdinDataStaleShort')}
          linkLabel={t('roadMapPrototypeVegagerdinOpenUmferdin')}
          linkAriaLabel={t('roadMapPrototypeVegagerdinOpenUmferdinNewTab')}
        />
      )
    : null
  const routeNowFreshnessLabel = routeNowStaleMessage
    ? t('roadMapPrototypeVegagerdinDataStaleShort')
    : routeNowMeasurementFreshness === 'fresh'
      ? t('vegagerdinFreshnessFresh')
      : null
  const hasUsableRouteNowMeasurements = countUsableWindStatuses(routeNowStatusCounts ?? {}) > 0
  const routeWeatherCoverage = routeBridgeSummary?.weatherCoverage ?? null
  const routeAssessmentCompleteness = routeBridgeSummary?.assessmentCompleteness ?? null
  const activeAssessmentScope = resolvedRoutePlacesRef.current?.assessmentScope ?? null
  const routeEndpointAccessNotices = activeAssessmentScope
    ? [
        ...(typeof activeAssessmentScope.origin.accessDistanceM === 'number'
          && activeAssessmentScope.origin.accessDistanceM >= 10
          ? [t('roadMapPrototypeRouteAccessFrom', {
              distance: formatEndpointAccessDistance(activeAssessmentScope.origin.accessDistanceM, locale),
              place: routeBridgeSummary?.navigationOriginName
                ?? resolvedRoutePlacesRef.current?.navigationOriginName
                ?? activeAssessmentScope.origin.name,
            })]
          : []),
        ...(typeof activeAssessmentScope.destination.accessDistanceM === 'number'
          && activeAssessmentScope.destination.accessDistanceM >= 10
          ? [t('roadMapPrototypeRouteAccessTo', {
              distance: formatEndpointAccessDistance(activeAssessmentScope.destination.accessDistanceM, locale),
              place: routeBridgeSummary?.navigationDestinationName
                ?? resolvedRoutePlacesRef.current?.navigationDestinationName
                ?? activeAssessmentScope.destination.name,
            })]
          : []),
      ]
    : []
  const routeEndpointForecastRows = selectAssessmentEndpointForecastRows(
    routeTravelResult?.travelPlan?.routeWeatherPoints,
    routeWeatherCoverage,
  )
  const routeHasAssessedWeatherCoverage = (
    routeWeatherCoverage?.status === 'full'
    || routeWeatherCoverage?.status === 'partial'
  ) && (
    routeAssessmentCompleteness?.status === 'complete'
    || routeAssessmentCompleteness?.status === 'partial'
  )
  const routeAssessmentIsPartial = routeWeatherCoverage?.status === 'partial'
    || routeAssessmentCompleteness?.status === 'partial'
  const selectedRouteSlotCoverageIsIncomplete =
    selectedRouteSlotAssessment?.coverage.status === 'incomplete'
  const routeResultsVisibility = resolveRouteResultsVisibility({
    displayState: routeResultsDisplayState,
    hasSummary: selectedRouteHasAppliedWeather && routeBridgeSummary !== null,
    hasTravelResult: selectedRouteHasAppliedWeather && routeTravelResult !== null,
    hasAssessedWeatherCoverage: selectedRouteHasAppliedWeather && routeHasAssessedWeatherCoverage,
    routeChoiceCount: routeSurfaceChoices.length,
  })
  const routeNavigationHandoffLabels = {
    assessmentTitle: t('roadMapPrototypeCoverageAssessmentTitle'),
    navigationTitle: t('roadMapPrototypeCoverageNavigationTitle'),
    boundaryFallback: t('roadMapPrototypeCoverageBoundaryFallback'),
    settlementBoundary: t('roadMapPrototypeCoverageSettlementBoundary'),
    officialRoadBoundary: t('roadMapPrototypeCoverageOfficialRoadBoundary'),
    openDirections: t('roadMapPrototypeCoverageGoogleDirections'),
  }
  const routeHandoffOnlyMessage = routeHandoffOnlySummary?.reason === 'same_area'
    ? t('roadMapPrototypeAssessmentSameArea')
    : routeHandoffOnlySummary?.reason === 'weather_unavailable'
      ? t('roadMapPrototypeAssessmentWeatherUnavailable')
      : t('roadMapPrototypeAssessmentUnavailable')
  const routeLiveLocationStatusLabel = routeLiveLocationStatus === 'waiting'
    ? t('roadMapPrototypeLiveLocationLoading')
    : routeLiveLocationStatus === 'active' && routeLiveLocationPoint
      ? routeLiveLocationPoint.accuracyM === null
        ? routeLiveLocationFollowMode === 'free'
          ? t('roadMapPrototypeLiveLocationFreeUnknownAccuracy')
          : t('roadMapPrototypeLiveLocationActiveUnknownAccuracy')
        : routeLiveLocationFollowMode === 'free'
          ? t('roadMapPrototypeLiveLocationFree', {
              accuracy: Math.max(0, Math.round(routeLiveLocationPoint.accuracyM)),
            })
          : t('roadMapPrototypeLiveLocationActive', {
              accuracy: Math.max(0, Math.round(routeLiveLocationPoint.accuracyM)),
            })
      : routeLiveLocationError === 'permission_denied'
        ? t('roadMapPrototypeLiveLocationPermissionDenied')
        : routeLiveLocationError === 'timeout'
          ? t('roadMapPrototypeLiveLocationTimeout')
          : routeLiveLocationError === 'outside_iceland'
            ? t('roadMapPrototypeLiveLocationOutsideIceland')
            : routeLiveLocationError === 'insecure_context'
              ? t('roadMapPrototypeLiveLocationInsecureContext')
              : routeLiveLocationError
                ? t('roadMapPrototypeLiveLocationUnavailable')
                : null
  const freeDriveLiveLocationStatusLabel = freeDrivePaused
    ? t('roadMapPrototypeFreeDrivePaused')
    : freeDriveWithoutLocation
      ? t('roadMapPrototypeFreeDriveWithoutLocationActive')
      : routeLiveLocationStatusLabel ?? t('roadMapPrototypeFreeDriveStationsVisible')
  const routeLiveLocationIsTracking =
    routeLiveLocationStatus === 'waiting' || routeLiveLocationStatus === 'active'
  const routeMapCompassActionLabel = t('roadMapPrototypeCompassNorthUp')
  const routeScrubberStatusText =
    routeForecastBuildStatus === 'loading'
      ? t('roadMapPrototypeScrubberCalculatingHourly')
      : routeBridgeSummary
        ? routeScrubberSubtitle(routeBridgeSummary.slotStatusSource)
        : ''
  const routeLoaderTitles = [
    t('roadMapPrototypeTeskeidRouteLoaderBuild'),
    t('roadMapPrototypeTeskeidRouteLoaderSurface'),
    t('roadMapPrototypeTeskeidRouteLoaderSort'),
  ]
  const selectedCommunityNote = selectedCommunityNoteId
    ? communityMapNotes.find(note => note.id === selectedCommunityNoteId) ?? null
    : null
  const mapNotePresentation = resolveMapNotePresentation({
    isCommunityOpen: isChatOpen,
    hasSelectedNote: selectedCommunityNote !== null,
  })
  const weatherTabActive = !isChatOpen && lastMapContext === 'weather'
  const routeTabActive = !isChatOpen && lastMapContext === 'route'
  const mapViewVisible =
    !isChatOpen &&
    (
      (lastMapContext === 'weather' && !isWeatherChaseOpen) ||
      (lastMapContext === 'route' && !isPanelOpen)
    )
  const forecastMapViewActive =
    mapViewVisible &&
    lastMapContext === 'weather' &&
    weatherContextView === 'map'

  function openWeatherContext(view = weatherContextView) {
    dismissCommunityNoteDetail()
    closeVegagerdinStationDetail(false)
    if (liveDriveModeRef.current === 'free-drive') {
      stopRouteLiveLocation()
      setLiveDriveModeState('off')
      setFreeDrivePaused(false)
      setFreeDriveWithoutLocation(false)
    }
    setWeatherContextView(view)
    setLastMapContext('weather')
    isChatOpenRef.current = false
    setIsChatOpen(false)
    setIsPanelOpen(false)
    setIsWeatherChaseOpen(view === 'information')
    applyMapContextVisibility('weather')
    if (view === 'map' && typeof overviewActiveMode !== 'number' && mapForecastSlotStatuses[0]) {
      handleOverviewModeChange(mapForecastSlotStatuses[0].timeMs)
    }
  }

  function openRouteContext(view = routeContextView) {
    dismissCommunityNoteDetail()
    closeVegagerdinStationDetail(false)
    if (view === 'information' && liveDriveModeRef.current === 'free-drive') {
      stopRouteLiveLocation()
      setLiveDriveModeState('off')
      setFreeDrivePaused(false)
      setFreeDriveWithoutLocation(false)
    }
    routeContextViewRef.current = view
    setRouteContextView(view)
    setLastMapContext('route')
    isChatOpenRef.current = false
    setIsChatOpen(false)
    setIsWeatherChaseOpen(false)
    setIsPanelOpen(view === 'information')
    applyMapContextVisibility('route')
    if (
      view === 'information' &&
      routeBridgeSummary &&
      routeForecastBuildStatus === 'idle'
    ) {
      handleRouteDepartureForecastOptIn()
    }
  }

  function handleStartDrivingWithTeskeid() {
    setLiveDriveModeState('route')
    handleSelectRouteNow()
    openRouteContext('map')
    startRouteLiveLocation('route')
  }

  function handlePlanRoute() {
    const planningFromFreeDrive = liveDriveModeRef.current === 'free-drive'
    const hasExistingRoute = routeBridgeSummary !== null || routeHandoffOnlySummary !== null
    const freeDriveOrigin = planningFromFreeDrive
      && routeLiveLocationPointRef.current
      ? routeOriginFromLiveLocation(
          routeLiveLocationPointRef.current,
          tPlaceSearch('currentLocationName'),
        )
      : null
    const freeDriveThresholds = planningFromFreeDrive
      ? validateRouteThresholdInputs(routeCautionWind, routeRedWind).thresholds
      : null
    stopRouteLiveLocation()
    setLiveDriveModeState('off')
    setFreeDriveSetupOpen(false)
    setFreeDrivePaused(false)
    setFreeDriveWithoutLocation(false)
    if (hasExistingRoute) {
      handleEditRoute()
    } else {
      openRoutePlanningDestination()
      if (freeDriveOrigin) {
        setRouteFrom(freeDriveOrigin.name)
        setFromResolved(freeDriveOrigin)
      }
      if (freeDriveThresholds) {
        setRoutePlanningCautionWind(String(freeDriveThresholds.cautionWindMs))
        setRoutePlanningRedWind(String(freeDriveThresholds.redWindMs))
      }
    }
    openRouteContext('information')
  }

  function handleOpenFreeDriveSetup() {
    if (!isAuthenticated) return
    setRouteCautionWind('')
    setRouteRedWind('')
    setRouteThresholdError(null)
    setFreeDriveSetupOpen(true)
  }

  function beginFreeDrive() {
    if (!isAuthenticated) return
    invalidateRouteRequests()
    resetRouteOwnedState()
    clearRouteOwnedMapPresentation()
    setLiveDriveModeState('free-drive')
    setFreeDrivePaused(false)
    setFreeDriveWithoutLocation(false)
    setFreeDriveStationFeedError(false)
    const defaultVisibleStatuses = createDefaultFreeDriveVisibleWindStatuses()
    freeDriveVisibleStatusesRef.current = defaultVisibleStatuses
    setFreeDriveVisibleStatuses(defaultVisibleStatuses)
    overviewActiveModeRef.current = 'now'
    setOverviewActiveMode('now')
    openRouteContext('map')
    reconcilePlaceMarkerVisibility()
    scheduleOverviewMarkerReconciliation()
    startRouteLiveLocation('free-drive')
  }

  function handleStartFreeDrive() {
    const thresholds = resolveRouteThresholdInputs()
    if (!thresholds || !isAuthenticated) return

    setFreeDriveSetupOpen(false)
    setFreeDriveThresholdSaveStatus('saving')
    beginFreeDrive()

    void fetch('/api/teskeid/weather/preferences/thresholds', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cautionWindMs: thresholds.cautionWindMs,
        redWindMs: thresholds.redWindMs,
        statusFilterMode: routeStatusFilterMode,
      }),
    })
      .then(response => {
        if (!response.ok) throw new Error('threshold-save-failed')
        setSavedRouteThresholds({
          cautionWindMs: thresholds.cautionWindMs,
          redWindMs: thresholds.redWindMs,
        })
        setFreeDriveThresholdSaveStatus('saved')
      })
      .catch(() => setFreeDriveThresholdSaveStatus('error'))
  }

  function handleResumeFreeDrive() {
    if (liveDriveModeRef.current !== 'free-drive') return
    setFreeDrivePaused(false)
    setFreeDriveWithoutLocation(false)
    startRouteLiveLocation('free-drive')
  }

  function handleFreeDriveWithoutLocation() {
    stopRouteLiveLocation()
    setFreeDrivePaused(false)
    setFreeDriveWithoutLocation(true)
    applyMapContextVisibility('route')
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const requestedContext = params.get('context')
    if (requestedContext === 'weather') {
      const requestedView = params.get('view') === 'map' ? 'map' : 'information'
      openWeatherContext(requestedView)
      return
    }
    if (requestedContext !== 'route') return
    const requestedView = params.get('view') === 'map' ? 'map' : 'information'
    routeContextViewRef.current = requestedView
    if (params.get('drive') === '1') {
      params.delete('drive')
      const remainingQuery = params.toString()
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ''}${window.location.hash}`,
      )
      setRouteCautionWind('')
      setRouteRedWind('')
      setFreeDriveSetupOpen(true)
      openRouteContext('information')
      return
    }
    if (params.get('restoreRoute') !== '1') {
      openRouteContext(requestedView)
      return
    }

    try {
      const raw = window.sessionStorage.getItem(ROAD_MAP_ROUTE_RETURN_STORAGE_KEY)
      if (!raw) {
        openRouteContext(requestedView)
        return
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const updatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0
      const from = typeof parsed.from === 'string' ? parsed.from.trim() : ''
      const to = typeof parsed.to === 'string' ? parsed.to.trim() : ''
      const cautionWind = typeof parsed.cautionWind === 'string' ? parsed.cautionWind : ''
      const redWind = typeof parsed.redWind === 'string' ? parsed.redWind : ''
      const parseStoredPlace = (value: unknown): RoadIntelligencePlaceResult | null => {
        return parsePlaceSearchResults([value])[0] ?? null
      }
      const origin = parseStoredPlace(parsed.origin)
      const destination = parseStoredPlace(parsed.destination)
      if (
        updatedAt <= 0 ||
        Date.now() - updatedAt > ROAD_MAP_ROUTE_RETURN_TTL_MS ||
        from.length < 2 ||
        to.length < 2
      ) {
        window.sessionStorage.removeItem(ROAD_MAP_ROUTE_RETURN_STORAGE_KEY)
        openRouteContext(requestedView)
        return
      }

      pendingRouteRestoreViewRef.current = requestedView
      setRouteFrom(from)
      setRouteTo(to)
      setRouteCautionWind(cautionWind)
      setRouteRedWind(redWind)
      if (origin && destination) {
        setFromResolved(origin)
        setToResolved(destination)
      }
      openRouteContext('information')
      pendingRouteRestoreSubmitRef.current = true
    } catch {
      openRouteContext(requestedView)
    }
  // One-time return hydration. Re-running MapLibre route restoration would duplicate requests.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (
      !isAuthenticated ||
      !teskeidRouteCandidateEnabled ||
      liveDriveModeRef.current === 'free-drive'
    ) return
    const controller = new AbortController()
    const startedAt = performance.now()
    void fetch('/api/teskeid/weather/travel/route-candidate', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ warmOnly: true }),
    }).then(async response => {
      if (process.env.NODE_ENV === 'production' || controller.signal.aborted) return
      const payload = await response.json().catch(() => null)
      console.log(
        '[RoadMap] Teskeið graph warm:',
        `${Math.round(performance.now() - startedAt)} ms`,
        `status=${payload?.status ?? response.status}`,
        `graph=${response.headers.get('X-Teskeid-Graph-Cache') ?? 'unknown'}`,
        response.headers.get('Server-Timing') ?? '',
      )
    }).catch(() => undefined)
    return () => controller.abort()
  }, [isAuthenticated, liveDriveMode, teskeidRouteCandidateEnabled])

  useEffect(() => {
    const pendingRunId = pendingWeatherResultsFocusRunIdRef.current
    const coverage = routeBridgeSummary?.weatherCoverage
    if (
      pendingRunId === null
      || pendingRunId !== routeBridgeRunIdRef.current
      || routeComparisonFullscreen
      || !routeBridgeSummary
      || !routeTravelResult
      || (coverage?.status !== 'full' && coverage?.status !== 'partial')
    ) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      if (
        pendingWeatherResultsFocusRunIdRef.current !== pendingRunId
        || routeBridgeRunIdRef.current !== pendingRunId
      ) return
      const scrollContainer = routePanelScrollRef.current
      const target = weatherResultsRef.current
      if (!scrollContainer || !target) return
      pendingWeatherResultsFocusRunIdRef.current = null
      const containerRect = scrollContainer.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      scrollContainer.scrollTo({
        top: Math.max(0, scrollContainer.scrollTop + targetRect.top - containerRect.top),
        behavior: 'auto',
      })
      target.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [routeBridgeSummary, routeComparisonFullscreen, routeTravelResult])

  useEffect(() => {
    if (
      !pendingRouteRestoreSubmitRef.current ||
      routeFrom.trim().length < 2 ||
      routeTo.trim().length < 2
    ) {
      return
    }
    pendingRouteRestoreSubmitRef.current = false
    formRef.current?.requestSubmit()
  }, [routeFrom, routeTo, fromResolved, toResolved, routeHandoffOnlySummary])

  useEffect(() => {
    if (routeBridgeStatus !== 'success' || !pendingRouteRestoreViewRef.current) return
    const restoredView = pendingRouteRestoreViewRef.current
    pendingRouteRestoreViewRef.current = null
    openRouteContext(restoredView)
  // openRouteContext intentionally reflects the current live route state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeBridgeStatus])

  useEffect(() => {
    mapNoteMarkersRef.current.forEach(marker => marker.remove())
    mapNoteMarkersRef.current = []
    const triggerElements = mapNoteTriggerElementsRef.current
    triggerElements.clear()
    const map = mapRef.current
    const Marker = markerConstructorRef.current
    if (!mapReady || !map || !Marker) return
    const markers: import('maplibre-gl').Marker[] = []
    for (const note of communityMapNotes) {
      if (!note.anchor) continue
      const element = document.createElement('button')
      element.type = 'button'
      element.setAttribute('aria-label', note.body)
      element.title = note.body
      triggerElements.set(note.id, element)
      const selected = selectedCommunityNoteId === note.id
      element.style.cssText = selected
        ? 'width:34px;height:34px;border-radius:999px;border:4px solid white;background:#f59e0b;color:#17201f;box-shadow:0 0 0 8px rgba(245,158,11,.28),0 3px 12px rgba(0,0,0,.32);cursor:pointer;'
        : 'width:28px;height:28px;border-radius:999px;border:2px solid white;background:#0f766e;color:white;box-shadow:0 2px 8px rgba(0,0,0,.28);cursor:pointer;'
      element.textContent = '•'
      element.addEventListener('click', event => {
        event.stopPropagation()
        if (selected) {
          closeCommunityNoteDetail()
        } else {
          const communityWasOpen = isChatOpenRef.current
          openCommunityNoteDetail(note.id, communityWasOpen ? 'community' : 'map')
          if (communityWasOpen) setCommunitySheetExpanded(false)
        }
      })
      markers.push(new Marker({ element }).setLngLat([note.anchor.lon, note.anchor.lat]).addTo(map))
    }
    if (mapNoteAnchor) {
      const element = document.createElement('div')
      element.setAttribute('aria-hidden', 'true')
      element.style.cssText = 'width:22px;height:22px;border-radius:999px;border:3px solid white;background:#b91c1c;box-shadow:0 2px 8px rgba(0,0,0,.28);'
      markers.push(new Marker({ element }).setLngLat([mapNoteAnchor.lon, mapNoteAnchor.lat]).addTo(map))
    }
    mapNoteMarkersRef.current = markers
    return () => {
      markers.forEach(marker => marker.remove())
      mapNoteMarkersRef.current = []
      triggerElements.clear()
    }
  }, [closeCommunityNoteDetail, communityMapNotes, mapNoteAnchor, mapReady, openCommunityNoteDetail, selectedCommunityNoteId])

  useEffect(() => {
    if (selectedCommunityNoteId !== null) return
    const pendingFocus = pendingCommunityNoteFocusRef.current
    if (!pendingFocus) return
    const frame = window.requestAnimationFrame(() => {
      const focusTarget = pendingFocus.kind === 'map'
        ? mapNoteTriggerElementsRef.current.get(pendingFocus.noteId) ?? null
        : communityTabButtonRef.current
      focusTarget?.focus()
      pendingCommunityNoteFocusRef.current = null
    })
    return () => window.cancelAnimationFrame(frame)
  }, [communityMapNotes, selectedCommunityNoteId])

  useEffect(() => {
    if (selectedCommunityNoteId === null) return
    const frame = window.requestAnimationFrame(() => {
      selectedCommunityNoteCloseButtonRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [selectedCommunityNoteId])

  useEffect(() => {
    if (selectedCommunityNoteId === null) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeCommunityNoteDetail()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeCommunityNoteDetail, selectedCommunityNoteId])

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/auth-mvp/map-notes?kind=community&hours=all&q=', {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async response => {
        if (!response.ok) throw new Error('community-notes-unavailable')
        return response.json() as Promise<{ items?: MapNoteDto[] }>
      })
      .then(payload => {
        if (!controller.signal.aborted) handleCommunityItemsChange(payload.items ?? [])
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setCommunityMapNotesLoading(false)
      })
    return () => controller.abort()
  }, [handleCommunityItemsChange])

  useEffect(() => {
    if (!mapReady || communityFitRequestId < 1) return
    let fitFrame: number | null = null
    const resizeFrame = window.requestAnimationFrame(() => {
      const map = mapRef.current
      if (!map) return
      map.resize()
      fitFrame = window.requestAnimationFrame(() => {
        map.fitBounds(
          [[-25, 63], [-12, 67]],
          {
            padding: window.innerWidth >= 640
              ? { top: 72, right: 32, bottom: 48, left: 420 }
              : { top: 72, right: 20, bottom: 210, left: 20 },
            maxZoom: 5.8,
            duration: 600,
          },
        )
      })
    })
    return () => {
      window.cancelAnimationFrame(resizeFrame)
      if (fitFrame !== null) window.cancelAnimationFrame(fitFrame)
    }
  }, [communityFitRequestId, mapReady])

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

  function handleMessagesToggle() {
    if (isChatOpen) {
      if (lastMapContext === 'weather') {
        openWeatherContext(weatherContextView)
      } else {
        openRouteContext(routeContextView)
      }
      return
    }

    if (liveDriveModeRef.current === 'free-drive') {
      stopRouteLiveLocation()
      setLiveDriveModeState('off')
      setFreeDrivePaused(false)
      setFreeDriveWithoutLocation(false)
    }
    dismissCommunityNoteDetail()
    collapseMapAttribution(containerRef.current)
    setCommunitySheetCollapsed(false)
    setCommunitySheetExpanded(false)
    setCommunityFitRequestId(value => value + 1)
    isChatOpenRef.current = true
    setIsChatOpen(true)
    setIsWeatherChaseOpen(false)
    setIsPanelOpen(false)
    updateOverviewLayerVisibility(overviewActiveModeRef.current, false)
    hideOverviewStationMarkers()
  }

  function focusMapNoteAnchor(anchor: MapNoteAnchor) {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ center: [anchor.lon, anchor.lat], zoom: Math.max(map.getZoom(), 10) })
  }

  function handleRouteFeedbackRequest() {
    const choice = routeSurfaceChoices.find(item => item.routeId === selectedRouteChoiceId) ?? null
    const from = routeCalculationPlaceNames?.from ?? routeBridgeSummary?.fromName ?? routeFrom.trim()
    const to = routeCalculationPlaceNames?.to ?? routeBridgeSummary?.toName ?? routeTo.trim()
    setRouteFeedbackContext({
      from,
      to,
      routeId: choice?.identity ?? selectedRouteChoiceId ?? null,
      provider: choice?.route.provider === 'teskeid' ? 'teskeid' : choice ? 'google' : 'unknown',
      distanceKm: choice?.distanceKm ?? routeBridgeSummary?.distanceKm ?? null,
      durationMinutes: choice?.durationMinutes ?? routeBridgeSummary?.durationMinutes ?? null,
    })
    setMapNoteAnchor(null)
    dismissCommunityNoteDetail()
    setRouteFeedbackRequestId(value => value + 1)
    setRouteComparisonFullscreen(false)
    setRouteComparisonOpening(false)
    setIsPanelOpen(false)
    setIsChatOpen(true)
  }

  function renderContextTab(context: 'weather' | 'route') {
    const isWeather = context === 'weather'
    const expanded = lastMapContext === context
    const active = isWeather ? weatherTabActive : routeTabActive
    const selectedView = isWeather ? weatherContextView : routeContextView
    const label = isWeather
      ? t('roadMapPrototypeWeatherChaseTitle')
      : t('roadMapPrototypePanelRoute')
    const openContext = isWeather ? openWeatherContext : openRouteContext
    const selectedLabel = isWeather
      ? selectedView === 'information'
        ? t('roadMapPrototypeWeatherData')
        : t('roadMapPrototypeWeatherMap')
      : selectedView === 'information'
        ? t('roadMapPrototypeRouteData')
        : t('roadMapPrototypeRouteMap')
    const alternativeView = selectedView === 'information' ? 'map' : 'information'
    const alternativeLabel =
      alternativeView === 'map'
        ? t('roadMapPrototypeBackToMap')
        : t('roadMapPrototypeData')

    if (!expanded) {
      return (
        <button
          type="button"
          onClick={() => openContext()}
          aria-pressed={active}
          className="flex h-10 items-center justify-center whitespace-nowrap rounded-full border border-border/70 bg-background px-2 text-[11px] font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {label}
        </button>
      )
    }

    return (
      <div
        className={`flex h-10 items-center overflow-hidden rounded-full border shadow-sm transition-colors ${
          active
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-border/70 bg-background text-foreground'
        }`}
      >
        <button
          type="button"
          onClick={() => openContext(selectedView)}
          aria-pressed={active}
          className={`flex h-full items-center px-2 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
            active
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground hover:bg-muted/80'
          }`}
        >
          {selectedLabel}
        </button>
        <span aria-hidden="true" className="h-5 w-px bg-border/80" />
        <button
          type="button"
          onClick={() => openContext(alternativeView)}
          aria-label={alternativeLabel}
          title={alternativeLabel}
          className="flex h-full items-center px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {alternativeLabel}
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden">
      {/* Topbar */}
      <div
        className="sticky top-0 z-[110] flex shrink-0 items-center gap-1 border-b border-border/60 bg-background px-2 pb-2 pt-[env(safe-area-inset-top,0px)] sm:pt-2"
      >
        {renderContextTab('weather')}
        {renderContextTab('route')}
        <button
          ref={communityTabButtonRef}
          type="button"
          onClick={handleMessagesToggle}
          aria-pressed={isChatOpen}
          className={`relative flex h-10 items-center justify-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11px] font-semibold shadow-sm transition-colors ${
            isChatOpen
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border/70 bg-background text-foreground hover:bg-muted'
          }`}
        >
          {t('roadMapPrototypePanelMessages')}
        </button>
        <div className="min-w-0 flex-1" />
        <TeskeidMenu variant={isAuthenticated ? 'authenticated' : 'public'} />
      </div>

      {!isAuthenticated && publicSavePromptOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/35 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-16 sm:items-center"
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-weather-save-title"
            className="w-full max-w-sm rounded-2xl border border-border bg-background p-4 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="public-weather-save-title" className="text-base font-semibold text-foreground">
                  {t('roadMapPrototypePublicSavePromptTitle')}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {t('roadMapPrototypePublicSavePromptBody')}
                </p>
              </div>
              <button
                type="button"
                onClick={continuePublicWeatherChaseSession}
                aria-label={t('roadMapPrototypePublicSavePromptClose')}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ×
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={savePublicWeatherChaseSession}
                className="min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('roadMapPrototypePublicSavePromptSave')}
              </button>
              <button
                type="button"
                onClick={continuePublicWeatherChaseSession}
                className="min-h-11 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('roadMapPrototypePublicSavePromptContinue')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map area */}
      <div className="relative flex-1 min-h-0">
      {/* h-full w-full — NOT absolute inset-0 — because MapLibre adds
          .maplibregl-map { position: relative } to this element, which would
          override Tailwind's `absolute` and cause inset-0 to collapse to 0px.
          h-full w-full survives the position override. */}
      <div className={`h-full w-full ${forecastMapViewActive ? 'hidden lg:block' : ''}`}>
        <DriveRouteMap
          externalContainer={setMapContainer}
          className={`h-full w-full ${mapNotePresentation.repositionMapAttribution
            ? '[&_.maplibregl-ctrl-bottom-right]:!bottom-auto [&_.maplibregl-ctrl-bottom-right]:!top-2'
            : ''}`}
        />
      </div>

      {/* Mobile-only overlay: forecast map not available on small screens */}
      {forecastMapViewActive && (
        <div className="absolute inset-0 z-[95] flex items-center justify-center bg-background/80 p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] backdrop-blur-sm lg:hidden">
          <MobileForecastMapNotice
            onViewData={() => openWeatherContext('information')}
          />
        </div>
      )}

      {mapReady && mapViewVisible && lastMapContext === 'route' && !isRouteLoading && (
        <div
          data-weather-card-obstacle="true"
          className="absolute right-3 top-3 z-[90] flex max-w-[calc(100%_-_1.5rem)] flex-col items-end gap-2"
        >
          <button
            type="button"
            aria-label={routeMapCompassActionLabel}
            title={routeMapCompassActionLabel}
            onClick={handleRouteMapCompassClick}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/80 bg-background/95 text-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              ref={setRouteMapCompassDirection}
              aria-hidden="true"
              className="flex h-8 w-8 flex-col items-center justify-center"
            >
              <span className="text-[9px] font-black leading-none">N</span>
              <ArrowUp className="-mt-0.5 h-4 w-4" />
            </span>
          </button>

          {isAuthenticated &&
            routeWeatherMode === 'now' &&
            routeLiveLocationIsTracking && (
              routeLiveLocationStatus === 'active' && routeLiveLocationFollowMode === 'free' ? (
                <button
                  type="button"
                  onClick={handleRecenterRouteLiveLocation}
                  className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-primary bg-background/95 px-3 py-2 text-xs font-semibold text-primary shadow-md backdrop-blur-sm transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <LocateFixed className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{t('roadMapPrototypeLiveLocationRecenter')}</span>
                  <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
                    {t('roadMapPrototypeLiveLocationTrial')}
                  </span>
                </button>
              ) : (
                <div
                  aria-hidden="true"
                  className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-full border border-primary/60 bg-background/95 px-3 py-2 text-xs font-semibold text-primary shadow-md backdrop-blur-sm"
                >
                  <LocateFixed className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {routeLiveLocationStatus === 'waiting'
                      ? t('roadMapPrototypeLiveLocationLoadingCompact')
                      : t('roadMapPrototypeLiveLocationFollowing')}
                  </span>
                  <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
                    {t('roadMapPrototypeLiveLocationTrial')}
                  </span>
                </div>
              )
            )}
        </div>
      )}

      {selectedVegagerdinStation && (
        <VegagerdinStationDetailPanel
          detail={selectedVegagerdinDetail}
          loading={selectedVegagerdinDetailLoading}
          fallbackStationId={selectedVegagerdinStation.stationId}
          fallbackName={selectedVegagerdinStation.stationName}
          fallbackMeasuredAtIso={selectedVegagerdinStation.measuredAtIso}
          onClose={closeVegagerdinStationDetail}
        />
      )}

      {mapViewVisible && lastMapContext === 'weather' && (
        <div
          data-weather-card-obstacle="true"
          className="hidden"
          role="group"
          aria-label={t('roadMapPrototypeForecastCardTextSize')}
        >
          <button
            type="button"
            onClick={() => changeForecastCardScale(-1)}
            disabled={forecastCardScaleIndex === 0}
            aria-label={t('roadMapPrototypeForecastCardTextSmaller')}
            className="flex h-10 min-w-11 items-center justify-center px-2 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            A−
          </button>
          <span aria-hidden="true" className="w-px bg-border" />
          <button
            type="button"
            onClick={() => changeForecastCardScale(1)}
            disabled={forecastCardScaleIndex === FORECAST_CARD_SCALE_LEVELS.length - 1}
            aria-label={t('roadMapPrototypeForecastCardTextLarger')}
            className="flex h-10 min-w-11 items-center justify-center px-2 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            A+
          </button>
        </div>
      )}

      {mapViewVisible && lastMapContext === 'weather' && (
        <div
          data-weather-card-obstacle="true"
          className="absolute left-3 top-3 z-[90] hidden max-w-[calc(100%-5rem)] flex-row items-start gap-2 lg:flex"
        >
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={showForecastStations}
              onClick={() => setShowForecastStations(value => !value)}
              className={`min-h-9 rounded-full border px-3 text-[11px] font-semibold shadow-sm backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                showForecastStations
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/80 bg-background/95 text-foreground hover:bg-muted'
              }`}
            >
              {showForecastStations
                ? t('roadMapPrototypeHideForecastStations')
                : t('roadMapPrototypeShowForecastStations')}
            </button>
            <button
              type="button"
              aria-pressed={showAllForecastGlaciers}
              onClick={() => setShowAllForecastGlaciers(value => !value)}
              className={`min-h-9 rounded-full border px-3 text-[11px] font-semibold shadow-sm backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                showAllForecastGlaciers
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/80 bg-background/95 text-foreground hover:bg-muted'
              }`}
            >
              {t('roadMapPrototypeShowMoreGlaciers')}
            </button>
            <button
              type="button"
              aria-pressed={showAllForecastMountains}
              onClick={() => setShowAllForecastMountains(value => !value)}
              className={`min-h-9 rounded-full border px-3 text-[11px] font-semibold shadow-sm backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                showAllForecastMountains
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/80 bg-background/95 text-foreground hover:bg-muted'
              }`}
            >
              {t('roadMapPrototypeShowMoreMountains')}
            </button>
          </div>

          {forecastCardGuideOpen ? (
            <div
              className="order-first shrink-0 overflow-hidden rounded-lg border-[1.5px] border-blue-600 bg-white/95 text-slate-700 shadow-md backdrop-blur-sm"
              style={{ fontSize: `${10 * (FORECAST_CARD_SCALE_LEVELS[forecastCardScaleIndex] ?? 1.2)}px` }}
            >
            <div className="flex items-center border-b border-slate-200 font-semibold text-slate-600">
              <span className="flex-1 px-2 py-1 text-center text-[0.9em]">
                {t('roadMapPrototypeForecastCardGuideProviders')}
              </span>
              <span aria-hidden="true" className="h-5 w-px bg-slate-200" />
              <span
                className="flex self-stretch"
                role="group"
                aria-label={t('roadMapPrototypeForecastCardTextSize')}
              >
                <button
                  type="button"
                  onClick={() => changeForecastCardScale(-1)}
                  disabled={forecastCardScaleIndex === 0}
                  aria-label={t('roadMapPrototypeForecastCardTextSmaller')}
                  className="min-h-7 min-w-8 px-1 font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-default disabled:opacity-35 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-600"
                >
                  A−
                </button>
                <span aria-hidden="true" className="w-px bg-slate-200" />
                <button
                  type="button"
                  onClick={() => changeForecastCardScale(1)}
                  disabled={forecastCardScaleIndex === FORECAST_CARD_SCALE_LEVELS.length - 1}
                  aria-label={t('roadMapPrototypeForecastCardTextLarger')}
                  className="min-h-7 min-w-8 px-1 font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-default disabled:opacity-35 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-600"
                >
                  A+
                </button>
                <span aria-hidden="true" className="w-px bg-slate-200" />
                <button
                  type="button"
                  onClick={() => setForecastCardGuideOpen(false)}
                  aria-label={t('roadMapPrototypeForecastCardGuideHide')}
                  title={t('roadMapPrototypeForecastCardGuideHide')}
                  className="min-h-7 min-w-8 px-1 font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-600"
                >
                  ×
                </button>
              </span>
            </div>
            <div className="grid grid-cols-2 border-b border-slate-200 font-semibold">
              <span className="border-r border-slate-200 px-2 py-1 text-center">
                ↓ {t('roadMapPrototypeForecastCardGuideDirection')}
              </span>
              <span className="px-2 py-1 text-center">
                5 m/s · {t('roadMapPrototypeForecastCardGuideWind')}
              </span>
            </div>
            <div className="grid grid-cols-2 font-semibold">
              <span className="border-r border-slate-200 px-2 py-1 text-center">
                12° · {t('roadMapPrototypeForecastCardGuideTemperature')}
              </span>
              <span className="px-2 py-1 text-center">
                0 mm · {t('roadMapPrototypeForecastCardGuidePrecipitation')}
              </span>
            </div>
            <p className="border-t border-slate-200 px-2 py-1 text-center text-[0.9em] font-medium text-slate-500">
              {t('roadMapPrototypeForecastCardGuideNorthWind')}
            </p>
            {!isAuthenticated && forecastCardScaleChanged && (
              <button
                type="button"
                onClick={handleForecastCardScaleSignIn}
                className="block w-full border-t border-slate-200 px-2 py-1 text-center text-[0.85em] font-semibold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-blue-600"
              >
                {t('roadMapPrototypeForecastCardSignInToRemember')}
              </button>
            )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setForecastCardGuideOpen(true)}
              aria-label={t('roadMapPrototypeForecastCardGuideShow')}
              title={t('roadMapPrototypeForecastCardGuideShow')}
              className="order-first flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-blue-600 bg-white/95 text-sm font-bold text-blue-700 shadow-md backdrop-blur-sm transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              i
            </button>
          )}
        </div>
      )}

      {isWeatherChaseOpen && lastMapContext === 'weather' && (
        <button
          type="button"
          onClick={() => openWeatherContext('map')}
          className="absolute right-14 top-3 z-[90] hidden min-h-10 rounded-full border border-border/80 bg-background/95 px-4 text-xs font-semibold text-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:block"
        >
          {t('roadMapPrototypeViewMap')}
        </button>
      )}

      {mapViewVisible && lastMapContext === 'weather' && hiddenForecastCardCount > 0 && (
        <div
          data-weather-card-obstacle="true"
          className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+7.5rem)] left-3 right-3 z-[125] hidden rounded-xl border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs leading-relaxed text-amber-900 shadow-md backdrop-blur-sm sm:left-1/2 sm:right-auto sm:max-w-md sm:-translate-x-1/2 lg:block"
          role="status"
        >
          {t('roadMapPrototypeHiddenForecastCards', { count: hiddenForecastCardCount })}
        </div>
      )}

      {lastMapContext === 'route' && isRouteLoading && !isPanelOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 px-5 backdrop-blur-sm">
          <TeskeidLoader
            ideaTitles={routeLoaderTitles}
            loadingLabel={t('roadMapPrototypeTeskeidCandidateSearchLoading')}
            fallbackIdeaTitle={t('roadMapPrototypeTeskeidCandidateSearchLoading')}
            intervalMs={1800}
            className="min-h-[320px] w-full max-w-sm"
          />
        </div>
      )}


      {isWeatherChaseOpen && (
        <div className="absolute inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-sm sm:pointer-events-none sm:inset-x-3 sm:bottom-28 sm:top-14 sm:z-[40] sm:flex-row sm:items-start sm:bg-transparent sm:backdrop-blur-none">
          <div className="pointer-events-auto flex-1 overflow-y-auto p-3 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:flex-none sm:max-h-[calc(100vh-9rem)] sm:w-full sm:max-w-2xl sm:rounded-xl sm:border sm:border-border/70 sm:bg-background/95 sm:pb-3 sm:shadow-xl sm:backdrop-blur-sm">
            {!isAuthenticated && (
              <PublicWeatherMapCta
                href={`/innskraning?next=${encodeURIComponent(signInReturnHref('weather'))}`}
                label={t('roadMapPrototypePublicWeatherMapSignIn')}
              />
            )}
            <WeatherChasePanel
              items={weatherChaseItems}
              initialSelectedIds={weatherChaseInitialSelectedIds}
              labels={{
                title: t('roadMapPrototypeWeatherChaseTitle'),
                subtitle: t('roadMapPrototypeWeatherChaseSubtitle'),
                loading: t('roadMapPrototypeWeatherChaseLoading'),
                stillLoading: t('roadMapPrototypeWeatherChaseStillLoading'),
                missingHistoryValue: t('roadMapPrototypeWeatherChaseMissingHistoryValue'),
                customHistoryUnavailable: t('roadMapPrototypeWeatherChaseCustomHistoryUnavailable'),
                missingForecastValue: t('roadMapPrototypeWeatherChaseMissingForecastValue'),
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
                showNearbyMetnoPointsLabel: t('roadMapPrototypeWeatherChaseShowNearbyMetnoPoints'),
                nearbyDistanceFromMetnoLabel: t('roadMapPrototypeWeatherChaseNearbyDistance'),
                nearbyDistanceFromVedurstofanLabel: t('roadMapPrototypeWeatherChaseNearbyDistanceFromVedurstofan'),
                emptySelection: t('roadMapPrototypeWeatherChaseEmptySelection'),
                reorderTitle: t('roadMapPrototypeWeatherChaseReorderTitle'),
                noRowsLabel: t('roadMapPrototypeWeatherChaseNoRows'),
                rowLoadFailedLabel: t('roadMapPrototypeWeatherChaseRowLoadFailed'),
                retryRowLoadLabel: t('roadMapPrototypeWeatherChaseRetryRowLoad'),
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
                saveDefaultsFailedLabel: t('roadMapPrototypeWeatherChaseSaveDefaultsFailed'),
                savePlacesLabel: t('roadMapPrototypeWeatherChaseSavePlaces'),
                stationsTitle: t('roadMapPrototypeWeatherChaseStationsTitle'),
                settingsLabel: t('roadMapPrototypeWeatherChaseSettings'),
                historyLabel: t('roadMapPrototypeWeatherChaseHistoryLabel'),
                historyShowOlderLabel: t('roadMapPrototypeWeatherChaseHistoryShowOlder'),
                historyLoadingLabel: t('roadMapPrototypeWeatherChaseHistoryLoading'),
                historyLoadFailedLabel: t('roadMapPrototypeWeatherChaseHistoryLoadFailed'),
                historyRetryLabel: t('roadMapPrototypeWeatherChaseHistoryRetry'),
                addCustomMetnoLabel: t('roadMapPrototypeWeatherChaseAddCustomMetno'),
                customMetnoNameTitle: t('roadMapPrototypeWeatherChaseCustomMetnoNameTitle'),
                customMetnoNameLabel: t('roadMapPrototypeWeatherChaseCustomMetnoNameLabel'),
                customMetnoNamePlaceholder: t('roadMapPrototypeWeatherChaseCustomMetnoNamePlaceholder'),
                customMetnoNameCancel: t('roadMapPrototypeWeatherChaseCustomMetnoNameCancel'),
                customMetnoNameSave: t('roadMapPrototypeWeatherChaseCustomMetnoNameSave'),
                placeFlow: {
                  chooseTitle: t('roadMapPrototypeWeatherChasePlaceChooseTitle'),
                  chooseHint: t('roadMapPrototypeWeatherChasePlaceChooseHint'),
                  searchPlaceholder: t('roadMapPrototypeWeatherChaseSearchPlaceholder'),
                  confirmTitle: t('roadMapPrototypeWeatherChasePlaceConfirmTitle'),
                  selectedPointLabel: t('roadMapPrototypeWeatherChasePlaceSelectedPoint'),
                  nearbyTitle: t('roadMapPrototypeWeatherChasePlaceNearbyTitle'),
                  distanceLabel: t('roadMapPrototypeWeatherChasePlaceDistance'),
                  noVedurstofanLabel: t('roadMapPrototypeWeatherChasePlaceNoVedurstofan'),
                  backLabel: t('roadMapPrototypeWeatherChasePlaceBack'),
                  cancelLabel: t('roadMapPrototypeWeatherChasePlaceCancel'),
                  saveLabel: t('roadMapPrototypeWeatherChasePlaceSave'),
                  nameTitle: t('roadMapPrototypeWeatherChaseCustomMetnoNameTitle'),
                  nameLabel: t('roadMapPrototypeWeatherChaseCustomMetnoNameLabel'),
                  namePlaceholder: t('roadMapPrototypeWeatherChaseCustomMetnoNamePlaceholder'),
                  nameRequired: t('roadMapPrototypeWeatherChaseCustomMetnoNameRequired'),
                  mapLoadingLabel: t('roadMapPrototypeWeatherChasePlaceMapLoading'),
                  mapErrorLabel: t('roadMapPrototypeWeatherChasePlaceMapError'),
                  metnoProviderLabel: t('roadMapPrototypeWeatherChaseProviderMetno'),
                  addNearbyPrompt: place => t('roadMapPrototypeWeatherChasePlaceAddNearbyPrompt', { place }),
                  addNearbyCancelLabel: t('roadMapPrototypeWeatherChasePlaceAddNearbyCancel'),
                  addNearbyConfirmLabel: t('roadMapPrototypeWeatherChasePlaceAddNearbyConfirm'),
                },
                autoSaveSavingLabel: t('roadMapPrototypeWeatherChaseAutoSaveSaving'),
                autoSaveSavedLabel: t('roadMapPrototypeWeatherChaseAutoSaveSaved'),
                autoSaveFailedLabel: t('roadMapPrototypeWeatherChaseAutoSaveFailed'),
                autoSaveRetryLabel: t('roadMapPrototypeWeatherChaseAutoSaveRetry'),
              }}
              locale={locale}
              thresholds={overviewThresholds}
              loading={overviewVedurstofanLoading && !overviewVedurstofanRestricted}
              onLoadItemRows={loadWeatherChaseItemRows}
              onLoadHistoryDay={loadWeatherChaseHistoryDay}
              historyDataVersion={[
                overviewThresholds.cautionWindMs,
                overviewThresholds.redWindMs,
                overviewThresholds.redGustMs,
                overviewThresholds.cautionPrecipMmPerHour,
                overviewVedurstofanLoading
                  ? 'vedur-loading'
                  : overviewVedurstofanRestricted
                    ? 'vedur-restricted'
                    : 'vedur-ready',
              ].join(':')}
              onSelectedItemsChange={handleWeatherChaseSelectedItemsChange}
              onShowNearbyStations={handleWeatherChaseShowNearbyStations}
              criteria={weatherChaseCriteria}
              onCriteriaChange={handleWeatherChaseCriteriaChange}
              onSaveDefault={isAuthenticated ? undefined : handleSaveWeatherChaseDefault}
              saveStatus={weatherChaseSaveStatus}
              placesChanged={weatherChasePlacesChanged}
              onPlacesChangedChange={setWeatherChasePlacesChanged}
              nearbyStationItemId={weatherChaseNearbyFocusId}
              nearbyStationItems={weatherChaseNearbyDisplayItems}
              onHourSelect={(hour) => {
                const slot = overviewForecastSlots.find(ms => new Date(ms).getUTCHours() === hour)
                if (slot !== undefined) handleOverviewModeChange(slot)
              }}
              visibleHours={mapVisibleHours}
              onVisibleHoursChange={(hours) => setMapVisibleHours(normalizeWeatherChaseVisibleHours(hours))}
              showMedals={showMedals}
              onShowMedalsChange={setShowMedals}
              defaultSettingsOpen={!isAuthenticated}
              hideSettingsToggle={!isAuthenticated}
              onAddCustomMetnoPlace={handleAddCustomMetnoPlace}
              onRetrySave={isAuthenticated ? retryWeatherChaseAutoSave : undefined}
            />
          </div>
        </div>
      )}

      {mapNotePresentation.surface !== 'hidden' && (
        <div className={`pointer-events-none absolute inset-0 z-[100] flex px-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] pt-16 sm:justify-start sm:p-3 sm:pt-14 ${selectedCommunityNote ? 'items-end' : communitySheetCollapsed ? 'items-end justify-end' : 'items-end sm:items-start'}`}>
          {selectedCommunityNote ? (
            <article
              role="dialog"
              aria-labelledby="selected-map-note-title"
              className="pointer-events-auto flex max-h-[75dvh] w-full flex-col overflow-hidden rounded-2xl border border-amber-400/70 bg-background/95 shadow-xl backdrop-blur-sm sm:max-w-[390px]"
            >
              <header className="flex min-h-12 items-center justify-between gap-2 border-b border-border/60 px-3 py-1">
                <h2 id="selected-map-note-title" className="flex h-10 items-center text-sm font-semibold leading-none text-foreground">{t('mapNotesSelectedTitle')}</h2>
                <button
                  ref={selectedCommunityNoteCloseButtonRef}
                  type="button"
                  onClick={closeCommunityNoteDetail}
                  aria-label={t('mapNotesCloseDetail')}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X size={18} aria-hidden />
                </button>
              </header>
              <div className="min-h-0 overscroll-contain overflow-y-auto p-4">
                <div className="min-w-0">
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{selectedCommunityNote.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {[selectedCommunityNote.authorName, formatCompactDateTime(selectedCommunityNote.createdAt, locale), selectedCommunityNote.anchor?.label].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            </article>
          ) : communitySheetCollapsed ? (
            <button
              type="button"
              onClick={() => setCommunitySheetCollapsed(false)}
              aria-label={t('mapNotesExpand')}
              className="pointer-events-auto mb-20 min-h-11 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:mb-0"
            >
              {t('mapNotesActions')}
            </button>
          ) : (
          <div className={`pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-background/95 shadow-xl backdrop-blur-sm sm:max-w-[390px] ${communitySheetExpanded ? 'max-h-[75dvh]' : 'max-h-[46dvh]'}`}>
          <div className="flex min-h-12 items-center justify-between gap-2 border-b border-border/60 px-3 py-1">
            <h2 className="flex h-10 items-center text-sm font-semibold leading-none text-foreground">{t('mapNotesActions')}</h2>
            <button
              type="button"
              onClick={() => { setCommunitySheetCollapsed(true); setCommunitySheetExpanded(false) }}
              aria-expanded="true"
              aria-label={t('mapNotesMinimize')}
              className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronDown size={18} aria-hidden />
            </button>
          </div>
          {!communitySheetCollapsed && <div className="min-h-0 overscroll-contain overflow-y-auto p-3">
          {communityMapNotesLoading && (
            <div role="status" aria-live="polite" className="mb-3 flex min-h-10 items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary">
              <span aria-hidden="true" className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent" />
              <span>{t('mapNotesLoading')}</span>
            </div>
          )}
          <MapNotesPanel
            isAuthenticated={isAuthenticated}
            anchor={mapNoteAnchor}
            routeFeedbackContext={routeFeedbackContext}
            routeFeedbackRequestId={routeFeedbackRequestId}
            onAnchorSelected={(anchor) => {
              setMapNoteAnchor(anchor)
              focusMapNoteAnchor(anchor)
            }}
            onClearAnchor={() => setMapNoteAnchor(null)}
            onClearRouteContext={() => setRouteFeedbackContext(null)}
            onCommunityItemsChange={handleCommunityItemsChange}
            onCommunityLoadingChange={setCommunityMapNotesLoading}
            onFocusAnchor={focusMapNoteAnchor}
            onExpandedChange={setCommunitySheetExpanded}
            onSelectCommunityItem={(item) => {
              if (!item.anchor) return
              openCommunityNoteDetail(item.id, 'community')
              setCommunitySheetExpanded(false)
              mapRef.current?.easeTo({
                center: [item.anchor.lon, item.anchor.lat],
                zoom: mapRef.current.getZoom(),
                duration: 350,
              })
            }}
          />
          </div>}
          </div>
          )}
        </div>
      )}

      {/* Route panel — starts below the shared emoji controls on every viewport. */}
      <div
        className={`absolute inset-0 z-[100] flex-col overflow-hidden bg-background/90 backdrop-blur-sm sm:bottom-0 sm:left-3 sm:top-14 sm:z-20 sm:w-[calc(100%-1.5rem)] sm:max-w-[360px] sm:rounded-t-xl sm:border sm:border-b-0 sm:border-border/70 sm:shadow-lg sm:transition-transform sm:duration-200 ${isPanelOpen ? 'flex sm:translate-x-0' : 'hidden sm:flex sm:-translate-x-[calc(100%+0.75rem)]'}`}
      >
        {/* Panel header */}
        <div className="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-3 py-2">
          <button
            type="button"
            onClick={() => openRouteContext('map')}
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
              : routeHandoffOnlySummary
                ? t('roadMapPrototypeRouteSummaryPlaces', {
                    from: routeHandoffOnlySummary.navigationOriginName,
                    to: routeHandoffOnlySummary.navigationDestinationName,
                  })
              : routeCalculationPlaceNames && (
                  routeResultsDisplayState === 'route-ready'
                  || routeResultsDisplayState === 'route-switching'
                )
                ? t('roadMapPrototypeRouteSummaryPlaces', {
                    from: routeCalculationPlaceNames.from,
                    to: routeCalculationPlaceNames.to,
                  })
              : isRouteLoading
                ? t('roadMapPrototypeTeskeidCandidateSearchLoading')
              : routePlanningStep === 'destination'
                ? t('roadMapPrototypeRoutePlanningDestinationTitle')
                : routePlanningStep === 'origin'
                  ? t('roadMapPrototypeRoutePlanningOriginTitle')
                  : routePlanningStep === 'thresholds'
                    ? t('roadMapPrototypeRoutePlanningThresholdsTitle')
                    : t('roadMapPrototypeRouteBridgeTitle')}
          </p>
          {(routeResultsDisplayState === 'summary'
            || routeResultsDisplayState === 'route-ready'
            || routeResultsDisplayState === 'handoff-only') && (
            <button
              type="button"
              onClick={handleEditRoute}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('roadMapPrototypeEditRoute')}
              title={t('roadMapPrototypeEditRoute')}
            >
              <Pencil size={16} aria-hidden />
            </button>
          )}
          {routeResultsVisibility.showWeather && routeBridgeSummary && (
            <span className="flex shrink-0 flex-col items-end gap-0.5">
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                style={{ backgroundColor: WIND_STATUS_MARKER_COLOR[displayedRouteWindStatus] }}
              >
                {tf(WIND_STATUS_META[displayedRouteWindStatus].labelKey as 'statusWithinLimits')}
              </span>
              {routeAssessmentIsPartial && !selectedRouteSlotAssessment && (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[9px] font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                  {t('roadMapPrototypeAssessmentPartialBadge')}
                </span>
              )}
              {selectedRouteSlotCoverageIsIncomplete && selectedRouteKnownWarning && (
                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[9px] font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                  {t('roadMapPrototypeDepartureCoverageIncompleteBadge')}
                </span>
              )}
            </span>
          )}
        </div>

        {/* Panel body — scrollable */}
        <div ref={routePanelScrollRef} className="flex-1 overflow-y-auto">
          {(routeResultsDisplayState === 'route-ready'
            || routeResultsDisplayState === 'route-switching') ? (
            <div className="px-3 pb-4 pt-3">
              {routeBridgeError && (
                <p role="alert" className="mb-2 text-xs text-destructive">
                  {routeBridgeError}
                </p>
              )}
              {routeResultsVisibility.showRouteCards && renderRouteSurfaceChoices()}
              {routeForecastRetryContextRef.current && (
                <button
                  type="button"
                  disabled={routeForecastRetryPending}
                  onClick={() => void handleRetryRouteForecast()}
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-primary bg-background px-4 py-2 text-sm font-semibold text-primary disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {routeForecastRetryPending && (
                    <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                  )}
                  {routeForecastRetryPending
                    ? t('roadMapPrototypeRouteConditionsLoading')
                    : t('roadMapPrototypeAssessmentWeatherRetry')}
                </button>
              )}
              {routeEndpointAccessNotices.length > 0 && (
                <div
                  role="status"
                  className="mt-2 space-y-1 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
                >
                  {routeEndpointAccessNotices.map(notice => (
                    <p key={notice}>{notice}</p>
                  ))}
                </div>
              )}
            </div>
          ) : routeResultsVisibility.showSummary && routeBridgeSummary && routeTravelResult ? (
            <>
              <div className="px-3 pt-3">
                {routeBridgeError && (
                  <p role="alert" className="mb-2 text-xs text-destructive">
                    {routeBridgeError}
                  </p>
                )}
                {routeResultsVisibility.showRouteCards && renderRouteSurfaceChoices()}
                {routeEndpointAccessNotices.length > 0 && (
                  <div
                    role="status"
                    className="mt-2 space-y-1 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
                  >
                    {routeEndpointAccessNotices.map(notice => (
                      <p key={notice}>{notice}</p>
                    ))}
                  </div>
                )}
              </div>
              {routeResultsVisibility.showWeather && (
                <div
                  ref={weatherResultsRef}
                  tabIndex={-1}
                  data-route-weather-results="true"
                  className="scroll-mt-3 focus:outline-none"
                >
                  <DriveJourneyPanel
                    layer={routeVedurstofanLayer}
                    candidates={displayedRouteCandidates ?? []}
                    currentCandidate={currentRouteCandidate}
                    selectedCandidateIdx={effectiveSelectedCandidateIdx}
                    onSelectCandidateIdx={handleSelectCandidateIdx}
                    slotStatusOverrides={routeSlotStatusOverrides ?? undefined}
                    slotAssessments={routeSlotAssessments ?? undefined}
                    routeAssessmentStatus={displayedRouteWindStatus}
                    thresholds={routeBridgeSummary.thresholdsUsed}
                    durationMinutes={routeBridgeSummary.durationMinutes}
                    distanceKm={routeBridgeSummary.distanceKm}
                    originName={routeBridgeSummary.fromName}
                    destinationName={routeBridgeSummary.toName}
                    endpointForecastRows={routeEndpointForecastRows}
                    onClearRoute={handleClearRoute}
                    routePoints={routeTravelResult.travelPlan?.route.auditPolylinePoints ?? []}
                    hasMoreCandidates={hasMoreCandidates}
                    onLoadMore={() => setVisibleCandidateLimit(prev => prev + 24)}
                    onEnlargeMap={() => openRouteContext('map')}
                    stationReturnTo={routeReturnHref('information')}
                    routeSelectionContextKey={routeTravelResult.id ?? 'none'}
                  />
                </div>
              )}
              {selectedRouteChoiceId === routeBridgeSummary.selectedRouteId && (
                <div className="px-3 pb-4 pt-3">
                  <RouteNavigationHandoff
                    assessment={{
                      originName: routeBridgeSummary.fromName,
                      destinationName: routeBridgeSummary.toName,
                    }}
                    navigation={{
                      origin: routeBridgeSummary.navigationOrigin,
                      destination: routeBridgeSummary.navigationDestination,
                      originName: routeBridgeSummary.navigationOriginName,
                      destinationName: routeBridgeSummary.navigationDestinationName,
                    }}
                    labels={routeNavigationHandoffLabels}
                  />
                </div>
              )}
            </>
          ) : routeResultsDisplayState === 'handoff-only' && routeHandoffOnlySummary ? (
            <div className="px-3 pb-4 pt-4">
              {routeHandoffOnlySummary.reason === 'weather_unavailable' && (
                <div className="mb-3">{renderRouteSurfaceChoices()}</div>
              )}
              <p role="status" className="text-sm leading-relaxed text-muted-foreground">
                {routeHandoffOnlyMessage}
              </p>
              {routeBridgeError && (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  {routeBridgeError}
                </p>
              )}
              {routeHandoffOnlySummary.reason === 'assessment_unavailable' && (
                <button
                  type="button"
                  onClick={handleRetryUnavailableRoute}
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-md border border-primary bg-background px-4 py-2 text-sm font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t('roadMapPrototypeRouteRetry')}
                </button>
              )}
              {routeHandoffOnlySummary.reason === 'weather_unavailable' && (
                <button
                  type="button"
                  disabled={routeForecastRetryPending}
                  onClick={() => void handleRetryRouteForecast()}
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-primary bg-background px-4 py-2 text-sm font-semibold text-primary disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {routeForecastRetryPending && (
                    <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                  )}
                  {routeForecastRetryPending
                    ? t('roadMapPrototypeRouteConditionsLoading')
                    : t('roadMapPrototypeAssessmentWeatherRetry')}
                </button>
              )}
              <RouteNavigationHandoff
                assessment={routeHandoffOnlySummary.assessment}
                navigation={{
                  origin: routeHandoffOnlySummary.navigationOrigin,
                  destination: routeHandoffOnlySummary.navigationDestination,
                  originName: routeHandoffOnlySummary.navigationOriginName,
                  destinationName: routeHandoffOnlySummary.navigationDestinationName,
                }}
                labels={routeNavigationHandoffLabels}
                className="mt-4"
              />
            </div>
          ) : routeResultsDisplayState === 'route-loading' && isRouteLoading && firstReadyRouteChoice ? (
            <>
              <p className="px-5 pt-5 text-center text-sm font-medium text-foreground">
                {firstReadyRouteLoadingLabel}
              </p>
              <TeskeidLoader
                ideaTitles={routeLoaderTitles}
                loadingLabel={firstReadyRouteLoadingLabel}
                fallbackIdeaTitle={firstReadyRouteLoadingLabel}
                intervalMs={1800}
                className="min-h-[240px] px-5 py-8"
              />
            </>
          ) : routeResultsDisplayState !== 'form' ? (
            <TeskeidLoader
              ideaTitles={routeLoaderTitles}
              loadingLabel={routeResultsLoadingLabel}
              fallbackIdeaTitle={routeResultsLoadingLabel}
              intervalMs={1800}
              className="min-h-[320px] px-5 py-10"
            />
          ) : (
            /* No route: route form */
            <div className="p-3">
              {routePlanningStep === 'idle' && (
                <section
                  aria-labelledby="road-map-free-drive-title"
                  className="mb-4 rounded-xl border border-primary/25 bg-primary/5 p-3"
                >
                <h2 id="road-map-free-drive-title" className="text-sm font-semibold text-foreground">
                  {freeDriveSetupOpen
                    ? t('roadMapPrototypeFreeDriveThresholdTitle')
                    : t('roadMapPrototypeFreeDriveTitle')}
                </h2>
                <p
                  id="road-map-free-drive-description"
                  className="mt-1 text-xs leading-relaxed text-muted-foreground"
                >
                  {freeDriveSetupOpen
                    ? t('roadMapPrototypeFreeDriveThresholdDescription')
                    : t('roadMapPrototypeFreeDriveDescription')}
                </p>
                {isAuthenticated && freeDriveSetupOpen ? (
                  <div className="mt-3 space-y-3">
                    <LiveDriveThresholdFields
                      idPrefix="free-drive"
                      cautionLabel={t('thresholdBarCautionLabel')}
                      dangerLabel={t('thresholdBarDangerLabel')}
                      unitLabel={t('thresholdBarUnit')}
                      cautionValue={routeCautionWind}
                      dangerValue={routeRedWind}
                      disabled={!routeThresholdPreferencesLoaded}
                      onCautionChange={(value) => {
                        setRouteCautionWind(value)
                        setRouteThresholdError(null)
                      }}
                      onDangerChange={(value) => {
                        setRouteRedWind(value)
                        setRouteThresholdError(null)
                      }}
                    />
                    {savedRouteThresholds && !freeDriveThresholdsMatchSaved && (
                      <button
                        type="button"
                        onClick={() => {
                          setRouteCautionWind(String(savedRouteThresholds.cautionWindMs))
                          setRouteRedWind(String(savedRouteThresholds.redWindMs))
                          setRouteThresholdError(null)
                        }}
                        className="inline-flex min-h-10 items-center text-left text-xs font-medium text-primary underline underline-offset-2 transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {t('roadMapPrototypeRoutePlanningUseSavedThresholds', {
                          caution: savedRouteThresholds.cautionWindMs,
                          danger: savedRouteThresholds.redWindMs,
                        })}
                      </button>
                    )}
                    {freeDriveThresholdValidationMessage && (
                      <p id="free-drive-threshold-error" role="alert" className="text-xs text-destructive">
                        {freeDriveThresholdValidationMessage}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFreeDriveSetupOpen(false)
                          setRouteThresholdError(null)
                        }}
                        className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {t('roadMapPrototypeFreeDriveThresholdBack')}
                      </button>
                      <button
                        type="button"
                        disabled={!routeThresholdPreferencesLoaded || !freeDriveThresholdInputsValid}
                        aria-describedby="road-map-free-drive-description road-map-free-drive-safety free-drive-threshold-error"
                        onClick={handleStartFreeDrive}
                        className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <LocateFixed className="h-4 w-4" aria-hidden="true" />
                        {routeThresholdPreferencesLoaded
                          ? t('roadMapPrototypeFreeDriveThresholdStart')
                          : t('roadMapPrototypeFreeDriveThresholdLoading')}
                      </button>
                    </div>
                  </div>
                ) : isAuthenticated ? (
                  <button
                    type="button"
                    aria-describedby="road-map-free-drive-description road-map-free-drive-safety"
                    onClick={handleOpenFreeDriveSetup}
                    className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <LocateFixed className="h-4 w-4" aria-hidden="true" />
                    {t('roadMapPrototypeFreeDriveStart')}
                  </button>
                ) : (
                  <a
                    href={`/innskraning?next=${encodeURIComponent(buildRoadMapFreeDriveSignInReturnHref(navigation))}`}
                    aria-describedby="road-map-free-drive-description road-map-free-drive-safety"
                    className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <LocateFixed className="h-4 w-4" aria-hidden="true" />
                    {t('roadMapPrototypeFreeDriveSignIn')}
                  </a>
                )}
                <p
                  id="road-map-free-drive-safety"
                  className="mt-2 text-[11px] leading-relaxed text-muted-foreground"
                >
                  {t('roadMapPrototypeFreeDrivePrivacySafety')}
                </p>
                </section>
              )}

              {!freeDriveSetupOpen && (<>
              <form ref={formRef} className="space-y-3" onSubmit={handleRouteBridgeSubmit}>
                {routePlanningStep === 'idle' ? (
                  <section
                    aria-labelledby="road-map-plan-trip-title"
                    className="mb-4 rounded-xl border border-primary/25 bg-primary/5 p-3"
                  >
                    <h2 id="road-map-plan-trip-title" className="text-sm font-semibold text-foreground">
                      {t('roadMapPrototypeFreeDrivePlanInstead')}
                    </h2>
                    <button
                      type="button"
                      onClick={openRoutePlanningDestination}
                      className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {t('roadMapPrototypeFreeDrivePlanStart')}
                    </button>
                  </section>
                ) : (
                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={handleRoutePlanningBack}
                      className="inline-flex min-h-10 items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t('roadMapPrototypeRoutePlanningBack')}
                    </button>

                    <ol
                      aria-label={t('roadMapPrototypeRoutePlanningStepsLabel')}
                      className="grid grid-cols-3 gap-1"
                    >
                      <li>
                        <button
                          type="button"
                          aria-current={routePlanningStep === 'destination' ? 'step' : undefined}
                          onClick={() => goToRoutePlanningStep('destination')}
                          className={`min-h-10 w-full rounded-full px-2 py-1.5 text-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${routePlanningStep === 'destination' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'}`}
                        >
                          {t('roadMapPrototypeRoutePlanningDestinationStep')}
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          aria-current={routePlanningStep === 'origin' ? 'step' : undefined}
                          disabled={!toResolved}
                          onClick={() => goToRoutePlanningStep('origin')}
                          className={`min-h-10 w-full rounded-full px-2 py-1.5 text-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted/60 disabled:text-muted-foreground/50 disabled:opacity-70 ${routePlanningStep === 'origin' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground enabled:hover:bg-muted/80'}`}
                        >
                          {t('roadMapPrototypeRoutePlanningOriginStep')}
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          aria-current={routePlanningStep === 'thresholds' ? 'step' : undefined}
                          disabled={!toResolved || !fromResolved}
                          onClick={() => goToRoutePlanningStep('thresholds')}
                          className={`min-h-10 w-full rounded-full px-2 py-1.5 text-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted/60 disabled:text-muted-foreground/50 disabled:opacity-70 ${routePlanningStep === 'thresholds' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground enabled:hover:bg-muted/80'}`}
                        >
                          {t('roadMapPrototypeRoutePlanningThresholdsStep')}
                        </button>
                      </li>
                    </ol>

                    {routePlanningStep === 'destination' && (
                      <>
                        <div
                          className="min-w-0"
                          onFocusCapture={() => setActiveRouteFieldState('to')}
                        >
                          <span className="sr-only">{t('roadMapPrototypeRouteToLabel')}</span>
                          <PlaceSearch
                            inputRef={routeToInputRef}
                            value={routeTo}
                            onValueChange={(nextValue) => {
                              setRouteTo(nextValue)
                              setToResolved(null)
                              setRoutePlaceFallbackSuggestion(null)
                              setActiveRouteFieldState('to')
                            }}
                            onPlaceSelected={(place) => selectRoutePlace(place, 'to')}
                            onResultsChange={setToSuggestions}
                            selectedPlace={toResolved}
                            onClearSelectedPlace={() => {
                              setRouteTo('')
                              setToResolved(null)
                              setToSuggestions([])
                              setRoutePlaceFallbackSuggestion(null)
                              setActiveRouteFieldState('to')
                            }}
                            savedPlaces={savedPlaces}
                            onDeleteSavedPlace={deleteSavedPlace}
                            excludePlaces={fromResolved ? [fromResolved] : []}
                            allowCurrentLocation
                            showCurrentLocationOnAllViewports
                            autoFocus={false}
                            ariaLabel={t('roadMapPrototypeRouteToLabel')}
                            placeholder={t('roadMapPrototypeRouteToPlaceholder')}
                            variant="compact"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={!toResolved}
                          onClick={handleRoutePlanningContinue}
                          className="min-h-11 w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {t('roadMapPrototypeRoutePlanningContinue')}
                        </button>
                      </>
                    )}

                    {routePlanningStep === 'origin' && (
                      <>
                        <div
                          className="min-w-0"
                          onFocusCapture={() => setActiveRouteFieldState('from')}
                        >
                          <span className="sr-only">{t('roadMapPrototypeRouteFromLabel')}</span>
                          <PlaceSearch
                            inputRef={routeFromInputRef}
                            value={routeFrom}
                            onValueChange={(nextValue) => {
                              setRouteFrom(nextValue)
                              setFromResolved(null)
                              setRoutePlaceFallbackSuggestion(null)
                              setActiveRouteFieldState('from')
                            }}
                            onPlaceSelected={(place) => selectRoutePlace(place, 'from')}
                            onResultsChange={setFromSuggestions}
                            selectedPlace={fromResolved}
                            onClearSelectedPlace={() => {
                              setRouteFrom('')
                              setFromResolved(null)
                              setFromSuggestions([])
                              setRoutePlaceFallbackSuggestion(null)
                              setActiveRouteFieldState('from')
                            }}
                            savedPlaces={savedPlaces}
                            onDeleteSavedPlace={deleteSavedPlace}
                            excludePlaces={toResolved ? [toResolved] : []}
                            allowCurrentLocation
                            showCurrentLocationOnAllViewports
                            autoFocus={false}
                            ariaLabel={t('roadMapPrototypeRouteFromLabel')}
                            placeholder={t('roadMapPrototypeRouteFromPlaceholder')}
                            variant="compact"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={!fromResolved}
                          onClick={handleRoutePlanningContinue}
                          className="min-h-11 w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {t('roadMapPrototypeRoutePlanningContinue')}
                        </button>
                      </>
                    )}

                    {routePlanningStep === 'thresholds' && (
                      <>
                        <LiveDriveThresholdFields
                          idPrefix="route-planning"
                          cautionLabel={t('thresholdBarCautionLabel')}
                          dangerLabel={t('thresholdBarDangerLabel')}
                          unitLabel={t('thresholdBarUnit')}
                          cautionValue={routePlanningCautionWind}
                          dangerValue={routePlanningRedWind}
                          onCautionChange={(value) => {
                            setRoutePlanningCautionWind(value)
                            setRouteThresholdError(null)
                          }}
                          onDangerChange={(value) => {
                            setRoutePlanningRedWind(value)
                            setRouteThresholdError(null)
                          }}
                        />

                        {isAuthenticated && savedRouteThresholds && !routePlanningThresholdsMatchSaved && (
                          <button
                            type="button"
                            onClick={() => {
                              setRoutePlanningCautionWind(String(savedRouteThresholds.cautionWindMs))
                              setRoutePlanningRedWind(String(savedRouteThresholds.redWindMs))
                              setRouteThresholdError(null)
                            }}
                            className="inline-flex min-h-10 items-center text-left text-xs font-medium text-primary underline underline-offset-2 transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {t('roadMapPrototypeRoutePlanningUseSavedThresholds', {
                              caution: savedRouteThresholds.cautionWindMs,
                              danger: savedRouteThresholds.redWindMs,
                            })}
                          </button>
                        )}

                        <button
                          type="submit"
                          disabled={routeBridgeStatus === 'loading'}
                          className="min-h-11 w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          {routeBridgeStatus === 'loading'
                            ? t('roadMapPrototypeRouteLoading')
                            : t('roadMapPrototypeRouteSubmit')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </form>

              {routeThresholdError && (
                <p className="mt-2 text-xs text-destructive">{routeThresholdError}</p>
              )}
              {routeBridgeError && (
                <p className="mt-2 text-xs text-destructive">{routeBridgeError}</p>
              )}
              {routeGuestQuotaReached && (
                <div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                  <p className="text-xs leading-relaxed">
                    {t('roadMapPrototypeRouteGuestQuota')}
                  </p>
                  <a
                    href={routeQuotaSignInHref()}
                    aria-disabled={routeQuotaSignInPending}
                    onClick={() => {
                      persistRouteReturnSnapshot('information')
                      setRouteQuotaSignInPending(true)
                    }}
                    className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity aria-disabled:pointer-events-none aria-disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {routeQuotaSignInPending
                      ? t('roadMapPrototypeRouteGuestQuotaSignInPending')
                      : t('roadMapPrototypeRouteGuestQuotaSignIn')}
                  </a>
                </div>
              )}
              {routePlaceFallbackSuggestion && (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-amber-950">
                  <p className="text-xs leading-relaxed">
                    {t('roadMapPrototypeNearbyKnownPlaceSuggestion', {
                      original: routePlaceFallbackSuggestion.originalName,
                      nearby: routePlaceFallbackSuggestion.nearbyPlace.name,
                      distance: formatNum(routePlaceFallbackSuggestion.distanceKm, locale),
                    })}
                  </p>
                  <button
                    type="button"
                    onClick={applyNearbyRouteFallback}
                    className="mt-2 min-h-10 rounded-full border border-amber-500 bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t('roadMapPrototypeUseNearbyKnownPlace', {
                      place: routePlaceFallbackSuggestion.nearbyPlace.name,
                    })}
                  </button>
                </div>
              )}
              </>)}
            </div>
          )}
        </div>

        {routeResultsVisibility.showWeather && routeBridgeSummary && routeTravelResult && (
          <div className="shrink-0 border-t border-border/70 bg-background/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={handleStartDrivingWithTeskeid}
                className="flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t('roadMapPrototypeStartDriving')}
              </button>
            ) : (
              <a
                href={`/innskraning?next=${encodeURIComponent(buildRoadMapLiveLocationSignInReturnHref(navigation))}`}
                onClick={() => persistRouteReturnSnapshot('map')}
                className="flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t('roadMapPrototypeStartDriving')}
              </a>
            )}
            <p className="mt-1.5 text-center text-[10px] leading-snug text-muted-foreground">
              {t('roadMapPrototypeStartDrivingPrivacy')}
            </p>
          </div>
        )}

      </div>

      {routeComparisonFullscreen && routeComparisonItems.length >= 1 && (
        <RouteComparisonFullscreenMap
          routes={routeComparisonItems}
          selectedRouteId={selectedRouteChoiceId}
          title={t('roadMapPrototypeRouteComparisonFullscreenTitle')}
          applyLabel={routeComparisonApplyPending
            ? t('roadMapPrototypeRouteConditionsLoading')
            : t('roadMapPrototypeRouteViewConditions')}
          applyPending={routeComparisonApplyPending}
          applyPendingLoadingLabel={t('roadMapPrototypeRouteWeatherLoadingDetail')}
          routeCountLabel={t('roadMapPrototypeRouteComparisonCount', { count: routeComparisonItems.length })}
          sortLabel={t('roadMapPrototypeRouteSortLabel')}
          sortDefaultLabel={t('roadMapPrototypeRouteSortDefault')}
          sortDurationLabel={t('roadMapPrototypeRouteSortDuration')}
          sortDistanceLabel={t('roadMapPrototypeRouteSortDistance')}
          sortWeatherLabel={t('roadMapPrototypeRouteSortWeather')}
          cautionCloseLabel={t('roadMapPrototypeRouteCautionClose')}
          closeLabel={t('roadMapPrototypeRouteComparisonFullscreenClose')}
          mapLabelScaleGroupLabel={t('roadMapPrototypeRouteMapLabelScale')}
          mapLabelScaleDecreaseLabel={t('roadMapPrototypeRouteMapLabelScaleDecrease')}
          mapLabelScaleResetLabel={t('roadMapPrototypeRouteMapLabelScaleReset')}
          mapLabelScaleIncreaseLabel={t('roadMapPrototypeRouteMapLabelScaleIncrease')}
          googleSectionAnalysisOnlyLabel={t('roadMapPrototypeGoogleSectionAnalysisOnly')}
          gravelGeometryStatus={selectedRouteGravelGeometryStatus}
          gravelGeometryLoadingLabel={t('roadMapPrototypeGravelGeometryLoading')}
          gravelGeometrySlowLabel={t('roadMapPrototypeGravelGeometrySlow')}
          gravelGeometryUnavailableLabel={t('roadMapPrototypeGravelGeometryUnavailable')}
          feedbackLabel={t('mapNotesRouteFeedbackAction')}
          onFeedback={handleRouteFeedbackRequest}
          onSelectRouteId={(routeId) => {
            if (routeComparisonApplyPendingRef.current) return
            const choice = routeSurfaceChoices.find(route => route.routeId === routeId)
            if (choice) previewSurfaceRouteChoice(choice)
          }}
          onClose={() => {
            // Closing the chooser is always available. During a weather
            // request keep its exact preview selected; the route cards remain
            // visible in the side panel with their bounded inline pending UI.
            if (!routeComparisonApplyPendingRef.current) {
              restoreAppliedSurfaceRoutePreview()
            }
            setRouteComparisonFullscreen(false)
            setRouteComparisonOpening(false)
          }}
          onApply={() => void handleApplyRouteComparison()}
        />
      )}

      {/* Bottom strip — overview source selector or route departure scrubber. */}
      <div
        ref={routeBottomStripRef}
        data-weather-card-obstacle="true"
        className={`absolute bottom-0 left-0 right-0 z-[120] border-t border-border/50 bg-background pb-[max(1.25rem,env(safe-area-inset-bottom))] ${forecastMapViewActive ? 'hidden lg:block' : ''} ${
          mapNotePresentation.hideContextBottomStrip
          || Boolean(selectedVegagerdinStation)
          || isPanelOpen
          || (lastMapContext === 'weather' && isWeatherChaseOpen)
          || (lastMapContext === 'route' && routeBridgeSummary && !routeHasAssessedWeatherCoverage)
          || (lastMapContext === 'route' && routeHandoffOnlySummary)
            ? 'hidden'
            : ''
        }`}
      >
        {routeBridgeStatus === 'loading' ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            {t('roadMapPrototypeScrubberCalculatingHourly')}
          </div>
        ) : lastMapContext === 'route' && liveDriveMode === 'free-drive' ? (
          <LiveDriveMapControls
            collapsed={isRouteMapSettingsCollapsed}
            onCollapsedChange={setIsRouteMapSettingsCollapsed}
            expandLabel={t('roadMapPrototypeRouteSettingsExpand')}
            collapseLabel={t('roadMapPrototypeRouteSettingsCollapse')}
            currentLabel={t('roadMapPrototypeDrivingNow')}
            currentColor={WIND_STATUS_MARKER_COLOR[freeDriveWorstStatus]}
            currentActive
            onSelectCurrent={() => {}}
            planLabel={t('roadMapPrototypePlanRoute')}
            onPlan={handlePlanRoute}
            collapsedAlert={freeDriveStaleNotice}
            footer={(
              <button
                type="button"
                onClick={handlePlanRoute}
                className="mt-1 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {t('roadMapPrototypeFreeDriveAddDestination')}
              </button>
            )}
          >

            {(freeDrivePaused || routeLiveLocationStatus === 'error') && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleResumeFreeDrive}
                  className="min-h-11 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {freeDrivePaused
                    ? t('roadMapPrototypeFreeDriveResume')
                    : t('roadMapPrototypeFreeDriveRetryLocation')}
                </button>
                <button
                  type="button"
                  onClick={handleFreeDriveWithoutLocation}
                  className="min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t('roadMapPrototypeFreeDriveStationsWithoutLocation')}
                </button>
              </div>
            )}

            {routeLiveLocationError === 'permission_denied' && (
              <CurrentLocationPermissionHelp />
            )}

            <LiveLocationControls
              status={routeLiveLocationStatus}
              statusLabel={freeDriveLiveLocationStatusLabel}
              zoom={routeLiveLocationFollowZoom}
              zoomMin={LIVE_LOCATION_FOLLOW_ZOOM_MIN}
              zoomMax={LIVE_LOCATION_FOLLOW_ZOOM_MAX}
              zoomGroupLabel={t('roadMapPrototypeLiveLocationZoomGroup')}
              zoomOutLabel={t('roadMapPrototypeLiveLocationZoomOut')}
              zoomInLabel={t('roadMapPrototypeLiveLocationZoomIn')}
              zoomValueLabel={t('roadMapPrototypeLiveLocationZoomValue', {
                zoom: routeLiveLocationFollowZoom,
              })}
              onZoomChange={handleRouteLiveLocationZoomChange}
            />

            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              <span>{freeDriveMeasuredLabel}</span>
              {freeDriveFreshnessLabel && (
                <span className="rounded-full border border-border bg-background/80 px-2 py-0.5 font-medium">
                  {freeDriveFreshnessLabel}
                </span>
              )}
            </div>

            <span className="block text-[10px] text-muted-foreground">
              {overviewVegagerdinData?.status === 'ok'
                ? t('roadMapPrototypeFreeDriveStationCount', {
                    count: overviewVegagerdinData.stations.length,
                  })
                : overviewVegagerdinRestricted
                  ? t('roadMapPrototypeFreeDriveStationFeedError')
                  : t('roadMapPrototypeFreeDriveStationFeedLoading')}
            </span>

            {freeDriveStaleNotice}

            {(overviewVegagerdinRestricted || (
              freeDriveStationFeedError && overviewVegagerdinData?.status !== 'ok'
            )) && (
              <p role="status" className="text-[10px] leading-snug text-muted-foreground">
                {t('roadMapPrototypeFreeDriveStationFeedError')}
              </p>
            )}

            <WindStatusFilterPills
              counts={freeDriveStatusCounts}
              visibleStatuses={freeDriveVisibleStatuses}
              onVisibleStatusesChange={handleFreeDriveStatusFilterChange}
              showAllLabel=""
              mode={FREE_DRIVE_WIND_STATUS_FILTER_MODE}
              combineNoWindDataStatuses
            />

            <p className="text-[10px] leading-snug text-muted-foreground">
              {t('roadMapPrototypeFreeDriveSafety')}
            </p>
            {freeDriveThresholdSaveStatus === 'error' && (
              <p role="status" className="text-[10px] leading-snug text-amber-800 dark:text-amber-200">
                {t('roadMapPrototypeFreeDriveThresholdSaveError')}
              </p>
            )}
          </LiveDriveMapControls>
        ) : lastMapContext === 'route' && routeBridgeSummary ? (
          <LiveDriveMapControls
            collapsed={isRouteMapSettingsCollapsed}
            onCollapsedChange={setIsRouteMapSettingsCollapsed}
            expandLabel={t('roadMapPrototypeRouteSettingsExpand')}
            collapseLabel={t('roadMapPrototypeRouteSettingsCollapse')}
            currentLabel={t('roadMapPrototypeDrivingNow')}
            currentColor={WIND_STATUS_MARKER_COLOR[nowRouteWindStatus]}
            currentActive={routeWeatherMode === 'now'}
            onSelectCurrent={handleSelectRouteNow}
            planLabel={t('roadMapPrototypePlanRoute')}
            onPlan={handlePlanRoute}
            collapsedAlert={routeWeatherMode === 'now' ? routeNowStaleNotice : null}
          >
                {routeWeatherMode === 'now' && (
              <div className="space-y-1">
                {hasUsableRouteNowMeasurements ? (
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>{routeNowMeasuredLabel}</span>
                    {routeNowFreshnessLabel && (
                      <span className="rounded-full border border-border bg-background/80 px-2 py-0.5 font-medium">
                        {routeNowFreshnessLabel}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    {t('roadMapPrototypeVegagerdinNoRouteStations')}
                  </p>
                )}

                {routeNowStaleNotice}

                {routeWindArrowCount > 0 && (
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    {t('roadMapPrototypeWindArrowsExplanation')}
                  </p>
                )}

                {isAuthenticated ? (
                  <div className="space-y-1.5 border-t border-border/50 pt-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-foreground">
                        {t('roadMapPrototypeLiveLocationTitle')}
                      </span>
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                        {t('roadMapPrototypeLiveLocationTrial')}
                      </span>
                    </div>
                    <LiveLocationControls
                      status={routeLiveLocationStatus}
                      statusLabel={routeLiveLocationStatusLabel}
                      actionLabel={routeLiveLocationIsTracking
                        ? t('roadMapPrototypeLiveLocationHide')
                        : t('roadMapPrototypeLiveLocationShow')}
                      actionPressed={routeLiveLocationIsTracking}
                      onAction={handleToggleRouteLiveLocation}
                      zoom={routeLiveLocationFollowZoom}
                      zoomMin={LIVE_LOCATION_FOLLOW_ZOOM_MIN}
                      zoomMax={LIVE_LOCATION_FOLLOW_ZOOM_MAX}
                      zoomGroupLabel={t('roadMapPrototypeLiveLocationZoomGroup')}
                      zoomOutLabel={t('roadMapPrototypeLiveLocationZoomOut')}
                      zoomInLabel={t('roadMapPrototypeLiveLocationZoomIn')}
                      zoomValueLabel={t('roadMapPrototypeLiveLocationZoomValue', {
                        zoom: routeLiveLocationFollowZoom,
                      })}
                      onZoomChange={handleRouteLiveLocationZoomChange}
                    />
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      {t('roadMapPrototypeLiveLocationPrivacy')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 border-t border-border/50 pt-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-foreground">
                        {t('roadMapPrototypeLiveLocationTitle')}
                      </span>
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                        {t('roadMapPrototypeLiveLocationTrial')}
                      </span>
                    </div>
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      {t('roadMapPrototypeLiveLocationPublicDescription')}
                    </p>
                    <a
                      href={`/innskraning?next=${encodeURIComponent(buildRoadMapLiveLocationSignInReturnHref(navigation))}`}
                      onClick={() => persistRouteReturnSnapshot('map')}
                      className="inline-flex min-h-10 items-center justify-center rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t('roadMapPrototypeLiveLocationPublicCta')}
                    </a>
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      {t('roadMapPrototypeLiveLocationPrivacy')}
                    </p>
                  </div>
                )}

                <span className="sr-only" aria-live="polite">
                  {routeVegagerdinLastRefreshIso
                    ? t('roadMapPrototypeVegagerdinDataRefreshed', {
                        time: formatKlTime(routeVegagerdinLastRefreshIso),
                      })
                    : ''}
                </span>
              </div>
            )}

                <WindStatusFilterPills
                  counts={activeRouteStatusCounts}
                  visibleStatuses={visibleRouteStatuses}
                  onVisibleStatusesChange={handleRouteStatusFilterChange}
                  showAllLabel=""
                  mode={ROUTE_WIND_STATUS_FILTER_MODE}
                  combineNoWindDataStatuses
                />
          </LiveDriveMapControls>
        ) : (
          /* Default overview: time selector + Einfalt/Nánar inline with pills */
          <div className="flex flex-col gap-2 px-3 pb-1 pt-2">
            {lastMapContext === 'weather' && (
              <div className="hidden lg:block">
                <WeatherChaseTimeSelector
                  slots={mapForecastSlotStatuses}
                  loading={overviewVedurstofanLoading && !overviewVedurstofanRestricted}
                  loadingLabel={t('sourceLoadingForecast')}
                  activeTimeMs={typeof overviewActiveMode === 'number' ? overviewActiveMode : null}
                  onTimeChange={handleOverviewModeChange}
                  previousLabel={t('sourceTimePrevious')}
                  nextLabel={t('sourceTimeNext')}
                  forecastLabel={t('sourceForecastLabel')}
                />
              </div>
            )}
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
