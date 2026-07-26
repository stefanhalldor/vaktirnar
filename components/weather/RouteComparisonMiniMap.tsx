'use client'

import { useMemo } from 'react'
import { DriveRouteMap, type DriveRouteMapRoute } from './DriveRouteMap'

export type RouteComparisonMiniMapItem = {
  id: string
  label: string
  provider: 'google' | 'mapbox' | 'teskeid'
  points: Array<{ lat: number; lon: number }>
  selected: boolean
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
}: {
  routes: RouteComparisonMiniMapItem[]
  ariaLabel: string
}) {
  const drawable = useMemo(
    () => routes.filter(route => route.points.length >= 2),
    [routes],
  )
  const mapRoutes = useMemo<DriveRouteMapRoute[]>(
    () => drawable.map((route, index) => ({
      id: route.id,
      points: route.points,
      color: routeComparisonColor(index),
      offset: index % 2 === 0 ? -1.5 : 1.5,
      opacity: route.selected ? 0.98 : 0.78,
      width: route.selected ? 5 : 4,
    })),
    [drawable],
  )
  if (drawable.length < 2) return null

  return (
    <figure className="mb-2 overflow-hidden rounded-md border border-amber-200 bg-background/90 dark:border-amber-800">
      <DriveRouteMap
        routes={mapRoutes}
        interactive={false}
        ariaLabel={ariaLabel}
        className="h-[120px] w-full"
      />
      <figcaption className="flex flex-wrap gap-x-3 gap-y-1 border-t border-amber-200 px-2 py-1.5 text-[10px] text-muted-foreground dark:border-amber-800">
        {drawable.map(route => (
          <span key={route.id} className="inline-flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-0.5 w-4 shrink-0 rounded-full"
              style={{ backgroundColor: routeComparisonColor(drawable.indexOf(route)) }}
            />
            <span className="max-w-[150px] truncate">{route.label}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
