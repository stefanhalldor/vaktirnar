'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DriveRouteMap, type DriveRouteMapRoute } from './DriveRouteMap'

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
}

export type RouteComparisonSortMode = 'default' | 'duration' | 'distance' | 'weather'

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
          aria-expanded={cautionExpanded}
          aria-haspopup="dialog"
          className="flex min-h-10 w-full items-center border-t border-amber-200 bg-amber-50/70 px-2.5 py-2 text-left text-[10px] font-semibold text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"
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
  const drawable = useMemo(
    () => routes.filter(route => route.points.length >= 2),
    [routes],
  )
  const mapRoutes = useMemo<DriveRouteMapRoute[]>(
    () => drawable.map((route, index) => ({
      id: route.id,
      points: route.points,
      color: route.color ?? routeComparisonColor(routes.indexOf(route)),
      offset: index % 2 === 0 ? -1.5 : 1.5,
      opacity: route.selected ? 0.98 : 0.78,
      width: route.selected ? 5 : 4,
    })),
    [drawable, routes],
  )
  if (drawable.length < 2) return null

  return (
    <figure className="mb-2 overflow-hidden rounded-md border border-amber-200 bg-background/90 dark:border-amber-800">
      <div className="relative">
        <DriveRouteMap
          routes={mapRoutes}
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
      </figcaption>
    </figure>
  )
}

export function RouteComparisonFullscreenMap({
  routes,
  selectedRouteId,
  title,
  applyLabel,
  routeCountLabel,
  findMoreLabel,
  findingMoreLabel,
  findMoreCompleteLabel,
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
}: {
  routes: RouteComparisonMiniMapItem[]
  selectedRouteId: string | null
  title: string
  applyLabel: string
  routeCountLabel: string
  findMoreLabel?: string
  findingMoreLabel?: string
  findMoreCompleteLabel?: string
  sortLabel: string
  sortDefaultLabel: string
  sortDurationLabel: string
  sortDistanceLabel: string
  sortWeatherLabel: string
  alternativesMessage?: string
  alternativesStatus?: 'idle' | 'loading' | 'ready' | 'none' | 'unavailable'
  onSelectRouteId: (routeId: string) => void
  onClose: () => void
  onApply: () => void
  onFindMore?: () => void
  cautionCloseLabel: string
}) {
  const [sortMode, setSortMode] = useState<RouteComparisonSortMode>('default')
  const sortedRoutes = useMemo(() => sortRouteComparisonItems(routes, sortMode), [routes, sortMode])
  const weatherSortingAvailable = routes.some(route => route.weatherScore !== null && route.weatherScore !== undefined)
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
    setExpandedCautionRouteId(routeId)
  }

  useEffect(() => {
    if (!expandedCautionRouteId) return
    cautionCloseButtonRef.current?.focus({ preventScroll: true })
  }, [expandedCautionRouteId])

  const handleMapRouteSelect = (routeId: string) => {
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
    () => drawable.map(route => ({
      id: route.id,
      points: route.points,
      color: route.color ?? routeComparisonColor(routes.indexOf(route)),
      offset: routes.indexOf(route) % 2 === 0 ? -1.5 : 1.5,
      opacity: route.id === selectedRouteId ? 1 : 0.56,
      width: route.id === selectedRouteId ? 7 : 4,
    })),
    [drawable, routes, selectedRouteId],
  )

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (expandedCautionRouteId) closeCautionDrawer()
      else onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [closeCautionDrawer, expandedCautionRouteId, onClose])

  return (
    <div
      className="fixed inset-0 z-[300] flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-background"
      role="dialog"
      aria-modal="true"
      aria-labelledby="route-comparison-title"
    >
      <header className="flex min-h-14 shrink-0 items-center border-b border-border bg-background px-3 pt-[env(safe-area-inset-top,0px)]">
        <h2 id="route-comparison-title" className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</h2>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <DriveRouteMap
          routes={mapRoutes}
          onSelectRoute={handleMapRouteSelect}
          ariaLabel={title}
          className="h-full w-full"
        />
      </div>

      <section className="flex min-h-0 max-h-[48dvh] shrink-0 flex-col overflow-hidden border-t border-border bg-background/98 shadow-[0_-8px_24px_rgba(15,23,42,0.10)]">
        <div
          data-route-comparison-scroll-region="true"
          className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-3 pb-3 pt-3"
        >
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">{routeCountLabel}</p>
          {onFindMore && findMoreLabel && (
            <button
              type="button"
              onClick={onFindMore}
              disabled={alternativesStatus === 'loading' || alternativesStatus === 'ready'}
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
                disabled={mode === 'weather' && !weatherSortingAvailable}
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
        <div ref={routeCardsScrollRef} className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1">
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
          <button
            type="button"
            onClick={onApply}
            disabled={!selectedRouteId}
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
