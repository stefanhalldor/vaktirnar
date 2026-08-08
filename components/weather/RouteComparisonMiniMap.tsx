'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DriveRouteMap,
  type DriveRouteMapAnnotation,
  type DriveRouteMapRoute,
} from './DriveRouteMap'

export const ROUTE_MAP_LABEL_SCALE_STORAGE_KEY = 'teskeid:route-map-label-scale'

const ROUTE_MAP_LABEL_SCALE_EVENT = 'teskeid:route-map-label-scale-change'
const ROUTE_MAP_LABEL_SCALES = [0.85, 1, 1.25, 1.5] as const
type RouteMapLabelScale = (typeof ROUTE_MAP_LABEL_SCALES)[number]

function parseRouteMapLabelScale(value: string | null): RouteMapLabelScale {
  const parsed = Number(value)
  return ROUTE_MAP_LABEL_SCALES.find(scale => scale === parsed) ?? 1
}

function useRouteMapLabelScale() {
  const [scale, setScale] = useState<RouteMapLabelScale>(1)

  useEffect(() => {
    const applyStoredScale = () => {
      try {
        setScale(parseRouteMapLabelScale(window.localStorage.getItem(ROUTE_MAP_LABEL_SCALE_STORAGE_KEY)))
      } catch {
        setScale(1)
      }
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === ROUTE_MAP_LABEL_SCALE_STORAGE_KEY) {
        setScale(parseRouteMapLabelScale(event.newValue))
      }
    }
    const handleLocalChange = (event: Event) => {
      const nextScale = (event as CustomEvent<number>).detail
      setScale(parseRouteMapLabelScale(String(nextScale)))
    }

    applyStoredScale()
    window.addEventListener('storage', handleStorage)
    window.addEventListener(ROUTE_MAP_LABEL_SCALE_EVENT, handleLocalChange)
    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener(ROUTE_MAP_LABEL_SCALE_EVENT, handleLocalChange)
    }
  }, [])

  const saveScale = useCallback((nextScale: RouteMapLabelScale) => {
    setScale(nextScale)
    try {
      window.localStorage.setItem(ROUTE_MAP_LABEL_SCALE_STORAGE_KEY, String(nextScale))
    } catch {
      // The visual preference still applies for this session when storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent(ROUTE_MAP_LABEL_SCALE_EVENT, { detail: nextScale }))
  }, [])

  return { scale, saveScale }
}

export type RouteComparisonMiniMapItem = {
  id: string
  label: string
  provider: 'google' | 'mapbox' | 'teskeid'
  points: Array<{ lat: number; lon: number }>
  selected: boolean
  color?: string
  detail?: string
  meta?: string
  durationLabel?: string
  durationMinutes?: number
  distanceKm?: number
  weatherScore?: number | null
  originalIndex?: number
  caution?: boolean
  gravelKm?: number
  unknownSurfaceKm?: number
  mountainRoad?: boolean
  weatherCoverageConcern?: boolean
  notice?: string
  cautionDrawerLabel?: string
  cautionVehicleNote?: string
  cautionDetails?: Array<{ id: string; text: string }>
  badges?: Array<{ label: string; tone: 'warning' | 'positive' | 'neutral' }>
  facts?: string[]
  surfaceSegments?: Array<{ tone: 'paved' | 'gravel' | 'unknown'; percent: number }>
  surfaceLabel?: string
  sectionOverlays?: Array<{
    id: string
    kind: 'gravel' | 'inferred_direction' | 'weather_coverage_gap'
    label: string
    points: Array<{ lat: number; lon: number }>
    distanceKm?: number
  }>
}

export type RouteComparisonSortMode = 'default' | 'duration' | 'distance' | 'weather'
export type RouteGravelGeometryStatus = 'loading' | 'slow' | 'unavailable' | 'ready'

const EARTH_RADIUS_M = 6_371_000

function distanceBetweenPointsM(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
) {
  const toRadians = (degrees: number) => degrees * Math.PI / 180
  const fromLat = toRadians(from.lat)
  const toLat = toRadians(to.lat)
  const latitudeDelta = toLat - fromLat
  const longitudeDelta = toRadians(to.lon - from.lon)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(haversine))
}

function measureSectionGeometry(points: Array<{ lat: number; lon: number }>) {
  const segmentLengths = points.slice(1).map((point, index) => (
    distanceBetweenPointsM(points[index], point)
  ))
  const distanceM = segmentLengths.reduce((sum, distance) => sum + distance, 0)
  if (distanceM <= 0) return null

  const targetDistance = distanceM / 2
  let traversed = 0
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index]
    if (traversed + segmentLength < targetDistance) {
      traversed += segmentLength
      continue
    }
    const ratio = segmentLength === 0 ? 0 : (targetDistance - traversed) / segmentLength
    const from = points[index]
    const to = points[index + 1]
    return {
      distanceKm: distanceM / 1_000,
      midpoint: {
        lat: from.lat + ((to.lat - from.lat) * ratio),
        lon: from.lon + ((to.lon - from.lon) * ratio),
      },
    }
  }

  return { distanceKm: distanceM / 1_000, midpoint: points[points.length - 1] }
}

function comparisonMapAnnotations(
  drawable: readonly RouteComparisonMiniMapItem[],
  selectedRouteId: string | null,
): DriveRouteMapAnnotation[] {
  return drawable.flatMap(route => {
    const selected = selectedRouteId === null ? route.selected : route.id === selectedRouteId
    if (!selected) return []
    return (route.sectionOverlays ?? []).flatMap((overlay): DriveRouteMapAnnotation[] => {
      if (
        (overlay.kind !== 'gravel' && overlay.kind !== 'weather_coverage_gap')
        || overlay.points.length < 2
      ) return []
      const measured = measureSectionGeometry(overlay.points)
      if (!measured) return []
      return [{
        id: `${route.id}:annotation:${overlay.id}`,
        kind: overlay.kind,
        label: overlay.label,
        point: measured.midpoint,
        focusPoints: overlay.points,
        distanceKm: overlay.distanceKm ?? measured.distanceKm,
      }]
    })
  })
}

function comparisonMapRoutes(
  drawable: readonly RouteComparisonMiniMapItem[],
  allRoutes: readonly RouteComparisonMiniMapItem[],
  selectedRouteId: string | null,
  selectedWidth: number,
): DriveRouteMapRoute[] {
  const baseRoutes: DriveRouteMapRoute[] = drawable.map((route, index) => {
    const selected = selectedRouteId === null ? route.selected : route.id === selectedRouteId
    return {
      id: route.id,
      points: route.points,
      color: route.color ?? routeComparisonColor(allRoutes.indexOf(route)),
      offset: index % 2 === 0 ? -1.5 : 1.5,
      opacity: selected ? 0.98 : 0.56,
      width: selected ? selectedWidth : 4,
    }
  })
  const overlays = drawable.flatMap(route => {
    const selected = selectedRouteId === null ? route.selected : route.id === selectedRouteId
    if (!selected) return []
    return (route.sectionOverlays ?? []).flatMap((overlay): DriveRouteMapRoute[] => {
      if (overlay.points.length < 2) return []
      const style = overlay.kind === 'gravel'
        ? { color: '#d97706', width: 7, offset: 0, dashArray: [1.2, 1.5] }
        : overlay.kind === 'weather_coverage_gap'
          ? { color: '#475569', width: 7, offset: 0, dashArray: [0.5, 1.4] }
          : { color: '#7e22ce', width: 5, offset: 1.5, dashArray: [0.4, 1.4] }
      return [{
        id: `${route.id}:section:${overlay.id}`,
        selectRouteId: route.id,
        points: overlay.points,
        color: style.color,
        opacity: 0.98,
        width: style.width,
        offset: style.offset,
        dashArray: style.dashArray,
      }]
    })
  })
  return [...baseRoutes, ...overlays]
}

export function sortRouteComparisonItems(
  routes: readonly RouteComparisonMiniMapItem[],
  mode: RouteComparisonSortMode,
): RouteComparisonMiniMapItem[] {
  return [...routes].sort((a, b) => {
    const originalDifference = (a.originalIndex ?? 0) - (b.originalIndex ?? 0)
    if (mode === 'duration') {
      return (a.durationMinutes ?? Number.POSITIVE_INFINITY)
        - (b.durationMinutes ?? Number.POSITIVE_INFINITY)
        || originalDifference
    }
    if (mode === 'distance') {
      return (a.distanceKm ?? Number.POSITIVE_INFINITY)
        - (b.distanceKm ?? Number.POSITIVE_INFINITY)
        || originalDifference
    }
    if (mode === 'weather') {
      const weatherCoverageDifference = Number(a.weatherCoverageConcern ?? false) - Number(b.weatherCoverageConcern ?? false)
      if (weatherCoverageDifference !== 0) return weatherCoverageDifference
      return (a.weatherScore ?? Number.POSITIVE_INFINITY)
        - (b.weatherScore ?? Number.POSITIVE_INFINITY)
        || (a.durationMinutes ?? Number.POSITIVE_INFINITY)
        - (b.durationMinutes ?? Number.POSITIVE_INFINITY)
        || originalDifference
    }
    const googleProviderDifference = Number(a.provider === 'google') - Number(b.provider === 'google')
    if (googleProviderDifference !== 0) return googleProviderDifference
    const aUnknownSurfaceKm = Number.isFinite(a.unknownSurfaceKm) ? Math.max(0, a.unknownSurfaceKm ?? 0) : 0
    const bUnknownSurfaceKm = Number.isFinite(b.unknownSurfaceKm) ? Math.max(0, b.unknownSurfaceKm ?? 0) : 0
    const unknownSurfaceDifference = Number(aUnknownSurfaceKm > 0) - Number(bUnknownSurfaceKm > 0)
    if (unknownSurfaceDifference !== 0) return unknownSurfaceDifference
    const unknownSurfaceDistanceDifference = aUnknownSurfaceKm - bUnknownSurfaceKm
    if (unknownSurfaceDistanceDifference !== 0) return unknownSurfaceDistanceDifference
    const mountainDifference = Number(a.mountainRoad ?? false) - Number(b.mountainRoad ?? false)
    if (mountainDifference !== 0) return mountainDifference
    const cautionDifference = Number(a.caution ?? false) - Number(b.caution ?? false)
    if (cautionDifference !== 0) return cautionDifference
    const weatherCoverageDifference = Number(a.weatherCoverageConcern ?? false) - Number(b.weatherCoverageConcern ?? false)
    if (weatherCoverageDifference !== 0) return weatherCoverageDifference
    return (a.gravelKm ?? 0) - (b.gravelKm ?? 0) || originalDifference
  })
}

export function RouteComparisonCompactCard({
  route,
  selected,
  onSelect,
  disabled = false,
  className = '',
  cautionExpanded = false,
  onOpenCaution,
  cautionTriggerRef,
}: {
  route: RouteComparisonMiniMapItem
  selected: boolean
  onSelect: () => void
  disabled?: boolean
  className?: string
  cautionExpanded?: boolean
  onOpenCaution?: () => void
  cautionTriggerRef?: (element: HTMLButtonElement | null) => void
}) {
  return (
    <div
      className={`min-w-[205px] shrink-0 overflow-hidden rounded-md border text-left transition-colors ${
        selected
          ? 'border-primary bg-primary/10 text-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
      } ${className}`}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={selected}
        className="block w-full px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default"
      >
        <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide">
          <span aria-hidden="true" className="h-0.5 w-5 shrink-0 rounded-full" style={{ backgroundColor: route.color }} />
          {route.label}
        </span>
        {route.notice && (
          <span className="mb-1 block text-[9px] font-medium leading-snug text-amber-800 dark:text-amber-200">
            {route.notice}
          </span>
        )}
        {route.detail && <span className="block truncate text-[11px] font-medium">{route.detail}</span>}
        {route.meta && <span className="block truncate text-[10px] text-muted-foreground">{route.meta}</span>}
        {route.durationLabel && <span className="mt-1 block text-[10px] font-medium">{route.durationLabel}</span>}
        {route.badges && route.badges.length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {route.badges.map(badge => (
              <span
                key={`${route.id}-${badge.label}`}
                className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                  badge.tone === 'warning'
                    ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100'
                    : badge.tone === 'positive'
                      ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {badge.label}
              </span>
            ))}
          </span>
        )}
        {route.surfaceSegments && route.surfaceSegments.length > 0 && (
          <span className="mt-1.5 block">
            <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
              {route.surfaceSegments.map(segment => (
                <span
                  key={`${route.id}-${segment.tone}`}
                  className={segment.tone === 'paved' ? 'bg-emerald-600' : segment.tone === 'gravel' ? 'bg-amber-600' : 'bg-slate-400'}
                  style={{ width: `${segment.percent}%` }}
                />
              ))}
            </span>
            {route.surfaceLabel && <span className="mt-1 block text-[10px] leading-snug text-muted-foreground">{route.surfaceLabel}</span>}
          </span>
        )}
        {(!route.surfaceSegments || route.surfaceSegments.length === 0) && route.facts && route.facts.length > 0 && (
          <span className="mt-1.5 block">
            {route.facts.map(fact => (
              <span key={`${route.id}-${fact}`} className="block text-[10px] leading-snug text-muted-foreground">{fact}</span>
            ))}
          </span>
        )}
      </button>
      {route.cautionDrawerLabel && route.cautionDetails && route.cautionDetails.length > 0 && (
        <button
          ref={cautionTriggerRef}
          type="button"
          onClick={onOpenCaution}
          disabled={disabled}
          aria-expanded={cautionExpanded}
          aria-haspopup="dialog"
          className="flex min-h-10 w-full items-center border-t border-amber-200 bg-amber-50/70 px-2.5 py-2 text-left text-[10px] font-semibold text-amber-950 disabled:cursor-default disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
        >
            <span className="flex-1">{route.cautionDrawerLabel}</span>
            <span aria-hidden="true" className="ml-2 text-xs">›</span>
        </button>
      )}
    </div>
  )
}

const ROUTE_COMPARISON_COLORS = ['#2563eb', '#ea580c', '#0f766e', '#c026d3', '#4d7c0f', '#be123c'] as const

export function routeComparisonColor(index: number): string {
  return ROUTE_COMPARISON_COLORS[index % ROUTE_COMPARISON_COLORS.length]
}

export type RouteWeatherScore = {
  routeId: string
  score: number
  stationIds: readonly string[]
}

function stationSetKey(stationIds: readonly string[]): string {
  return [...new Set(stationIds)].sort().join('\u0000')
}

/**
 * Selects one deterministic best-weather route. Other routes may share the
 * badge only when they have the same minimum score and the exact same set of
 * matched weather stations as the first minimum-score route.
 */
export function selectBestWeatherRouteIds(scores: readonly RouteWeatherScore[]): Set<string> {
  if (scores.length === 0) return new Set()
  const minimum = Math.min(...scores.map(score => score.score))
  const tied = scores.filter(score => score.score === minimum)
  const winner = tied[0]
  const winnerStations = stationSetKey(winner.stationIds)
  return new Set(
    tied
      .filter(score => stationSetKey(score.stationIds) === winnerStations)
      .map(score => score.routeId),
  )
}

export function RouteComparisonMiniMap({
  routes,
  ariaLabel,
  onEnlarge,
  enlargeLabel,
}: {
  routes: RouteComparisonMiniMapItem[]
  ariaLabel: string
  onEnlarge?: () => void
  enlargeLabel?: string
}) {
  const { scale: mapLabelScale } = useRouteMapLabelScale()
  const drawable = useMemo(
    () => routes.filter(route => route.points.length >= 2),
    [routes],
  )
  const mapRoutes = useMemo<DriveRouteMapRoute[]>(
    () => comparisonMapRoutes(drawable, routes, null, 5),
    [drawable, routes],
  )
  const mapAnnotations = useMemo<DriveRouteMapAnnotation[]>(
    () => comparisonMapAnnotations(drawable, null),
    [drawable],
  )
  if (drawable.length < 2) return null

  return (
    <figure className="mb-2 overflow-hidden rounded-md border border-amber-200 bg-background/90 dark:border-amber-800">
      <div className="relative">
        <DriveRouteMap
          routes={mapRoutes}
          annotations={mapAnnotations}
          annotationScale={mapLabelScale}
          interactive={false}
          ariaLabel={ariaLabel}
          className="h-[120px] w-full"
        />
        {onEnlarge && enlargeLabel && (
          <button
            type="button"
            onClick={onEnlarge}
            className="absolute right-2 top-2 z-10 flex min-h-10 items-center rounded-full border border-border bg-background/95 px-3 py-2 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {enlargeLabel}
          </button>
        )}
      </div>
      <figcaption className="flex flex-wrap gap-x-3 gap-y-1 border-t border-amber-200 px-2 py-1.5 text-[10px] text-muted-foreground dark:border-amber-800">
        {drawable.map(route => (
          <span key={route.id} className="inline-flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-0.5 w-4 shrink-0 rounded-full"
              style={{ backgroundColor: route.color ?? routeComparisonColor(routes.indexOf(route)) }}
            />
            <span className="max-w-[150px] truncate">{route.label}</span>
          </span>
        ))}
        {[...new Map(
          drawable
            .filter(route => route.selected)
            .flatMap(route => route.sectionOverlays ?? [])
            .map(overlay => [overlay.kind, overlay] as const),
        ).values()].map(overlay => (
          <span key={overlay.kind} className="inline-flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`w-4 shrink-0 border-t-2 ${
                overlay.kind === 'gravel'
                  ? 'border-dashed border-amber-600'
                  : overlay.kind === 'weather_coverage_gap'
                    ? 'border-dashed border-slate-600'
                    : 'border-dotted border-purple-700'
              }`}
            />
            <span>{overlay.label}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  )
}

export function RouteComparisonFullscreenMap({
  routes,
  selectedRouteId,
  title,
  applyLabel,
  applyPending = false,
  routeCountLabel,
  findMoreLabel,
  findingMoreLabel,
  findMoreCompleteLabel,
  findMoreProminent = false,
  sortLabel,
  sortDefaultLabel,
  sortDurationLabel,
  sortDistanceLabel,
  sortWeatherLabel,
  alternativesMessage,
  alternativesStatus = 'idle',
  onSelectRouteId,
  onClose,
  onApply,
  onFindMore,
  cautionCloseLabel,
  closeLabel,
  mapLabelScaleGroupLabel,
  mapLabelScaleDecreaseLabel,
  mapLabelScaleResetLabel,
  mapLabelScaleIncreaseLabel,
  googleSectionAnalysisOnlyLabel,
  gravelGeometryStatus,
  gravelGeometryLoadingLabel,
  gravelGeometrySlowLabel,
  gravelGeometryUnavailableLabel,
  feedbackLabel,
  onFeedback,
}: {
  routes: RouteComparisonMiniMapItem[]
  selectedRouteId: string | null
  title: string
  applyLabel: string
  applyPending?: boolean
  routeCountLabel: string
  findMoreLabel?: string
  findingMoreLabel?: string
  findMoreCompleteLabel?: string
  findMoreProminent?: boolean
  sortLabel: string
  sortDefaultLabel: string
  sortDurationLabel: string
  sortDistanceLabel: string
  sortWeatherLabel: string
  alternativesMessage?: string
  alternativesStatus?: 'idle' | 'loading' | 'slow' | 'ready' | 'none' | 'unavailable'
  onSelectRouteId: (routeId: string) => void
  onClose: () => void
  onApply: () => void
  onFindMore?: () => void
  cautionCloseLabel: string
  closeLabel: string
  mapLabelScaleGroupLabel?: string
  mapLabelScaleDecreaseLabel?: string
  mapLabelScaleResetLabel?: string
  mapLabelScaleIncreaseLabel?: string
  googleSectionAnalysisOnlyLabel?: string
  gravelGeometryStatus?: RouteGravelGeometryStatus
  gravelGeometryLoadingLabel?: string
  gravelGeometrySlowLabel?: string
  gravelGeometryUnavailableLabel?: string
  feedbackLabel?: string
  onFeedback?: () => void
}) {
  const [sortMode, setSortMode] = useState<RouteComparisonSortMode>('default')
  const { scale: mapLabelScale, saveScale: saveMapLabelScale } = useRouteMapLabelScale()
  const mapLabelScaleIndex = ROUTE_MAP_LABEL_SCALES.indexOf(mapLabelScale)
  const sortedRoutes = useMemo(() => sortRouteComparisonItems(routes, sortMode), [routes, sortMode])
  const weatherSortingAvailable = routes.some(route => route.weatherScore !== null && route.weatherScore !== undefined)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const routeCardsScrollRef = useRef<HTMLDivElement | null>(null)
  const routeCardRefs = useRef(new Map<string, HTMLDivElement>())
  const routeCautionTriggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const cautionCloseButtonRef = useRef<HTMLButtonElement | null>(null)
  const [expandedCautionRouteId, setExpandedCautionRouteId] = useState<string | null>(null)
  const expandedCautionRoute = routes.find(route => route.id === expandedCautionRouteId) ?? null

  const closeCautionDrawer = useCallback(() => {
    const trigger = expandedCautionRouteId
      ? routeCautionTriggerRefs.current.get(expandedCautionRouteId)
      : null
    setExpandedCautionRouteId(null)
    window.requestAnimationFrame(() => trigger?.focus({ preventScroll: true }))
  }, [expandedCautionRouteId])

  const openCautionDrawer = (routeId: string) => {
    if (applyPending) return
    setExpandedCautionRouteId(routeId)
  }

  useEffect(() => {
    if (!expandedCautionRouteId) return
    cautionCloseButtonRef.current?.focus({ preventScroll: true })
  }, [expandedCautionRouteId])

  const handleMapRouteSelect = (routeId: string) => {
    if (applyPending) return
    onSelectRouteId(routeId)
    window.requestAnimationFrame(() => {
      const card = routeCardRefs.current.get(routeId)
      if (!card || typeof card.scrollIntoView !== 'function') return
      card.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    })
  }

  useEffect(() => {
    const scroller = routeCardsScrollRef.current
    if (!scroller) return
    if (typeof scroller.scrollTo === 'function') {
      scroller.scrollTo({ left: 0, behavior: 'smooth' })
    } else {
      scroller.scrollLeft = 0
    }
  }, [sortMode])
  const drawable = useMemo(
    () => routes.filter(route => route.points.length >= 2),
    [routes],
  )
  const mapRoutes = useMemo<DriveRouteMapRoute[]>(
    () => comparisonMapRoutes(drawable, routes, selectedRouteId, 7),
    [drawable, routes, selectedRouteId],
  )
  const mapAnnotations = useMemo<DriveRouteMapAnnotation[]>(
    () => comparisonMapAnnotations(drawable, selectedRouteId),
    [drawable, selectedRouteId],
  )
  const selectedMapRoute = routes.find(route => (
    selectedRouteId === null ? route.selected : route.id === selectedRouteId
  )) ?? null
  const selectedHasGravelGeometry = mapAnnotations.some(annotation => annotation.kind === 'gravel')
  const selectedNeedsGravelGeometry = selectedMapRoute?.provider === 'teskeid'
    && (selectedMapRoute.gravelKm ?? 0) > 0
    && !selectedHasGravelGeometry
  const effectiveGravelGeometryStatus = gravelGeometryStatus ?? 'unavailable'
  const mapScopeNotice = selectedMapRoute?.provider === 'google'
    ? googleSectionAnalysisOnlyLabel
    : selectedNeedsGravelGeometry
      ? effectiveGravelGeometryStatus === 'loading'
        ? gravelGeometryLoadingLabel
        : effectiveGravelGeometryStatus === 'slow'
          ? gravelGeometrySlowLabel
          : gravelGeometryUnavailableLabel
      : undefined
  const gravelGeometryPending = selectedNeedsGravelGeometry
    && (effectiveGravelGeometryStatus === 'loading' || effectiveGravelGeometryStatus === 'slow')

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    document.body.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true })
    })
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (expandedCautionRouteId) closeCautionDrawer()
        else if (!applyPending) onClose()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter(element => element.getAttribute('aria-hidden') !== 'true')
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [applyPending, closeCautionDrawer, expandedCautionRouteId, onClose])

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[300] flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-background"
      role="dialog"
      aria-modal="true"
      aria-busy={applyPending || undefined}
      aria-labelledby="route-comparison-title"
    >
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 pt-[env(safe-area-inset-top,0px)]">
        <h2 id="route-comparison-title" className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</h2>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          disabled={applyPending}
          aria-label={closeLabel}
          title={closeLabel}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <DriveRouteMap
          routes={mapRoutes}
          annotations={mapAnnotations}
          annotationScale={mapLabelScale}
          onSelectRoute={applyPending ? undefined : handleMapRouteSelect}
          ariaLabel={title}
          className="h-full w-full"
        />
        {(mapAnnotations.length > 0 || mapScopeNotice) && (
          <div
            aria-label={[
              ...mapAnnotations.map(annotation => annotation.label),
              mapScopeNotice,
            ].filter(Boolean).join(', ')}
            className="pointer-events-none absolute left-3 top-3 z-20 flex max-w-[calc(100%-10.5rem)] flex-wrap gap-1.5"
          >
            {[...new Map(
              mapAnnotations.map(annotation => [annotation.kind, annotation] as const),
            ).values()].map(annotation => (
              <span
                key={annotation.kind}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border bg-background/95 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm backdrop-blur-sm"
              >
                {annotation.kind === 'gravel' ? (
                  <span
                    aria-hidden="true"
                    data-route-annotation-legend-icon="gravel"
                    className="relative h-4 w-5 shrink-0"
                  >
                    <span className="absolute left-0.5 top-1.5 h-2 w-2 -rotate-12 rounded-[45%_55%_50%_45%] border border-amber-900 bg-amber-600" />
                    <span className="absolute left-2.5 top-0.5 h-2.5 w-2.5 rotate-12 rounded-[55%_45%_45%_55%] border border-amber-900 bg-amber-600" />
                  </span>
                ) : (
                  <span aria-hidden="true" className="text-slate-600">≋̸</span>
                )}
                <span>{annotation.label}</span>
              </span>
            ))}
            {mapScopeNotice && (
              <div
                role="status"
                className="inline-flex min-h-8 items-center gap-2 rounded-full border border-border bg-background/95 px-2.5 py-1 text-[11px] font-medium leading-snug text-muted-foreground shadow-sm backdrop-blur-sm"
              >
                {gravelGeometryPending && (
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
                  />
                )}
                <span>{mapScopeNotice}</span>
              </div>
            )}
          </div>
        )}
        {mapLabelScaleGroupLabel
          && mapLabelScaleDecreaseLabel
          && mapLabelScaleResetLabel
          && mapLabelScaleIncreaseLabel && (
            <div
              role="group"
              aria-label={mapLabelScaleGroupLabel}
              className="absolute right-3 top-3 z-20 flex overflow-hidden rounded-full border border-border bg-background/95 shadow-md backdrop-blur-sm"
            >
              <button
                type="button"
                onClick={() => saveMapLabelScale(
                  ROUTE_MAP_LABEL_SCALES[mapLabelScaleIndex - 1] ?? mapLabelScale,
                )}
                disabled={mapLabelScaleIndex <= 0}
                aria-label={mapLabelScaleDecreaseLabel}
                title={mapLabelScaleDecreaseLabel}
                className="inline-flex h-10 min-h-10 w-10 min-w-10 items-center justify-center border-r border-border text-sm font-semibold text-foreground disabled:opacity-35 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span aria-hidden="true">A−</span>
              </button>
              <button
                type="button"
                onClick={() => saveMapLabelScale(1)}
                disabled={mapLabelScale === 1}
                aria-label={mapLabelScaleResetLabel}
                title={mapLabelScaleResetLabel}
                className="inline-flex h-10 min-h-10 w-10 min-w-10 items-center justify-center border-r border-border text-base font-semibold text-foreground disabled:opacity-35 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span aria-hidden="true">A</span>
              </button>
              <button
                type="button"
                onClick={() => saveMapLabelScale(
                  ROUTE_MAP_LABEL_SCALES[mapLabelScaleIndex + 1] ?? mapLabelScale,
                )}
                disabled={mapLabelScaleIndex >= ROUTE_MAP_LABEL_SCALES.length - 1}
                aria-label={mapLabelScaleIncreaseLabel}
                title={mapLabelScaleIncreaseLabel}
                className="inline-flex h-10 min-h-10 w-10 min-w-10 items-center justify-center text-lg font-semibold text-foreground disabled:opacity-35 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span aria-hidden="true">A+</span>
              </button>
            </div>
          )}
      </div>

      <section className="flex min-h-0 max-h-[48dvh] shrink-0 flex-col overflow-hidden border-t border-border bg-background/98 shadow-[0_-8px_24px_rgba(15,23,42,0.10)]">
        <div
          data-route-comparison-scroll-region="true"
          className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-3 pb-3 pt-3"
        >
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">{routeCountLabel}</p>
          {!findMoreProminent && onFindMore && findMoreLabel && (
            <button
              type="button"
              onClick={onFindMore}
              disabled={applyPending || alternativesStatus === 'loading' || alternativesStatus === 'ready'}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-orange-300 bg-background px-3 py-2 text-xs font-semibold text-orange-900 disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-orange-700 dark:text-orange-100"
            >
              {alternativesStatus === 'loading' && (
                <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
              )}
              {alternativesStatus === 'loading' && findingMoreLabel
                ? findingMoreLabel
                : alternativesStatus === 'ready' && findMoreCompleteLabel
                  ? findMoreCompleteLabel
                  : findMoreLabel}
            </button>
          )}
        </div>
        {findMoreProminent && onFindMore && findMoreLabel && (
          <button
            type="button"
            onClick={onFindMore}
            disabled={applyPending || alternativesStatus === 'loading' || alternativesStatus === 'ready'}
            className="mb-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-orange-400 bg-background px-4 py-2 text-sm font-semibold text-orange-900 disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-orange-700 dark:text-orange-100"
          >
            {alternativesStatus === 'loading' && (
              <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
            )}
            {alternativesStatus === 'loading' && findingMoreLabel
              ? findingMoreLabel
              : alternativesStatus === 'ready' && findMoreCompleteLabel
                ? findMoreCompleteLabel
                : findMoreLabel}
          </button>
        )}
        <div className="mb-2" aria-label={sortLabel}>
          <p className="mb-1 text-[10px] font-medium text-muted-foreground">{sortLabel}</p>
          <div className="grid grid-cols-2 rounded-md border border-border bg-muted/40 p-0.5 min-[420px]:grid-cols-4">
            {([
              ['default', sortDefaultLabel],
              ['duration', sortDurationLabel],
              ['distance', sortDistanceLabel],
              ['weather', sortWeatherLabel],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                disabled={applyPending || (mode === 'weather' && !weatherSortingAvailable)}
                aria-pressed={sortMode === mode}
                className={`min-h-10 rounded px-2 py-1.5 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  sortMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {alternativesMessage && (
          <p role="status" className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-snug text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            {alternativesMessage}
          </p>
        )}
        <div
          ref={routeCardsScrollRef}
          data-route-comparison-cards="true"
          className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1"
        >
          {sortedRoutes.map(route => {
            const selected = route.id === selectedRouteId
            return (
              <div
                key={route.id}
                ref={element => {
                  if (element) routeCardRefs.current.set(route.id, element)
                  else routeCardRefs.current.delete(route.id)
                }}
                className="min-w-[min(72vw,245px)] shrink-0 snap-center"
              >
                <RouteComparisonCompactCard
                  route={route}
                  selected={selected}
                  disabled={applyPending}
                  onSelect={() => onSelectRouteId(route.id)}
                  className="w-full min-w-0"
                  cautionExpanded={expandedCautionRouteId === route.id}
                  onOpenCaution={() => openCautionDrawer(route.id)}
                  cautionTriggerRef={element => {
                    if (element) routeCautionTriggerRefs.current.set(route.id, element)
                    else routeCautionTriggerRefs.current.delete(route.id)
                  }}
                />
              </div>
            )
          })}
        </div>
        </div>
        <footer
          data-route-comparison-action-footer="true"
          className="relative z-20 shrink-0 border-t border-border/70 bg-background px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-2 shadow-[0_-6px_16px_rgba(15,23,42,0.08)]"
        >
          {feedbackLabel && onFeedback && (
            <button
              type="button"
              onClick={onFeedback}
              disabled={applyPending}
              className="mb-2 flex min-h-10 w-full items-center justify-center rounded-lg border border-border px-4 py-2 text-xs font-semibold text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {feedbackLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onApply}
            disabled={!selectedRouteId || applyPending}
            aria-busy={applyPending || undefined}
            className="flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {applyLabel}
          </button>
        </footer>
      </section>

      {expandedCautionRoute?.cautionDrawerLabel && expandedCautionRoute.cautionDetails && expandedCautionRoute.cautionDetails.length > 0 && (
        <div className="fixed inset-0 z-[340]" role="presentation">
          <div
            className="absolute inset-0 bg-black/45"
            aria-hidden="true"
            onClick={closeCautionDrawer}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="route-caution-dialog-title"
            className="absolute inset-x-0 bottom-0 max-h-[72dvh] overflow-y-auto rounded-t-2xl border-t border-amber-200 bg-background pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-16px_40px_rgba(15,23,42,0.24)] dark:border-amber-800"
            onKeyDown={event => {
              if (event.key === 'Tab') {
                event.preventDefault()
                cautionCloseButtonRef.current?.focus()
              }
            }}
          >
            <div className="mx-auto w-full max-w-2xl">
              <header className="sticky top-0 flex min-h-14 items-center gap-3 border-b border-amber-200 bg-background/95 px-4 backdrop-blur dark:border-amber-800">
                <h3 id="route-caution-dialog-title" className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                  {expandedCautionRoute.cautionDrawerLabel}
                </h3>
                <button
                  ref={cautionCloseButtonRef}
                  type="button"
                  onClick={closeCautionDrawer}
                  aria-label={cautionCloseLabel}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xl leading-none text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </header>
              <div className="space-y-3 px-4 py-4 text-sm leading-relaxed text-foreground">
                {expandedCautionRoute.cautionVehicleNote && (
                  <p className="font-medium">{expandedCautionRoute.cautionVehicleNote}</p>
                )}
                {expandedCautionRoute.cautionDetails.map(detail => <p key={detail.id}>{detail.text}</p>)}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
