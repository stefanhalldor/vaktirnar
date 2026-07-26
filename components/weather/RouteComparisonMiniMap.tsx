'use client'

import { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
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
  closeLabel,
  applyLabel,
  onSelectRouteId,
  onClose,
  onApply,
}: {
  routes: RouteComparisonMiniMapItem[]
  selectedRouteId: string | null
  title: string
  closeLabel: string
  applyLabel: string
  onSelectRouteId: (routeId: string) => void
  onClose: () => void
  onApply: () => void
}) {
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
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 pt-[env(safe-area-inset-top)]">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <DriveRouteMap
          routes={mapRoutes}
          onSelectRoute={onSelectRouteId}
          ariaLabel={title}
          className="h-full w-full"
        />
      </div>

      <div className="shrink-0 border-t border-border bg-background/98 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.10)]">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {routes.map(route => {
            const selected = route.id === selectedRouteId
            return (
              <button
                key={route.id}
                type="button"
                onClick={() => onSelectRouteId(route.id)}
                aria-pressed={selected}
                className={`min-h-16 min-w-[180px] shrink-0 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selected
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-background text-muted-foreground'
                }`}
              >
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
                  <span
                    aria-hidden="true"
                    className="h-0.5 w-5 shrink-0 rounded-full"
                    style={{ backgroundColor: route.color ?? routeComparisonColor(routes.indexOf(route)) }}
                  />
                  {route.label}
                </span>
                {route.detail && <span className="mt-1 block truncate text-xs font-medium">{route.detail}</span>}
                {route.meta && <span className="mt-0.5 block text-[11px] text-muted-foreground">{route.meta}</span>}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={onApply}
          disabled={!selectedRouteId}
          className="flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {applyLabel}
        </button>
      </div>
    </div>
  )
}
