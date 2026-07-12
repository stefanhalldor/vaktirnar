'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { RouteWeatherPoint, TravelIssue, CandidatePointStatus, TravelCandidate, ResolvedTravelThresholds, WeatherStatus } from '@/lib/weather/types'
import { resolveThresholds } from '@/lib/weather/thresholds'
import {
  type WindDisplayStatus,
  ALL_WIND_DISPLAY_STATUSES,
  WIND_STATUS_MARKER_COLOR,
  classifyPointWindDisplayStatus,
} from '@/lib/weather/windDisplayStatus'
import { WIND_STATUS_UI_META as WIND_STATUS_META } from './windStatusUi'
import { loadMapsLibrary, loadMarkerLibrary, loadCoreLibrary } from '@/lib/weather/googleMaps.client'
import { resolvePlaceLabel } from '@/lib/weather/reverseGeocode.client'
import {
  toLngLat,
  getRoutePointLatLng,
  getForecastPointLatLng,
  isSameCoordinatePair,
  shouldShowForecastPointMarker,
  initialSelectedIndex,
  buildPointSummary,
  markerStyleForStatus,
  formatKlTime,
  estimatePointEtaIso,
  type PointSummary,
} from './travelAuditMap.helpers'
import { RouteWeatherPointDetailCard } from './RouteWeatherPointDetailCard'

/** Returns the wind speed (m/s) from the forecast row nearest to etaIso, or undefined if unavailable. */
function getPointWindMsForCandidate(
  pt: RouteWeatherPoint,
  activeCandidate: TravelCandidate,
  activeLeg: 'outbound' | 'return',
): number | undefined {
  const etaIso = estimatePointEtaIso(activeCandidate, pt, activeLeg)
  if (!etaIso || !pt.forecastRows?.length) return undefined
  const etaMs = new Date(etaIso).getTime()
  let best = pt.forecastRows[0]
  let bestDelta = Math.abs(new Date(best.timeIso).getTime() - etaMs)
  for (const row of pt.forecastRows) {
    const d = Math.abs(new Date(row.timeIso).getTime() - etaMs)
    if (d < bestDelta) { bestDelta = d; best = row }
  }
  return best.wind.value
}

export type TravelAuditMapProps = {
  originName: string
  destinationName: string
  /** Sampled route polyline points (auditPolylinePoints). */
  routePoints: Array<{ lat: number; lon: number }>
  weatherPoints: RouteWeatherPoint[]
  highlightedIssue?: TravelIssue
  /** Static map URL used as fallback when Google Maps JS fails to load. */
  staticMapUrl?: string
  /**
   * Per-point statuses from the selected heatmap candidate (delta-encoded: only non-green entries).
   * When defined (even as []), uses per-candidate coloring instead of summaryForWindow.
   * Undefined = no slot selected, use server-computed summaryForWindow.
   */
  selectedCandidatePointStatuses?: CandidatePointStatus[]
  /** Optional content rendered between the map canvas and the selected point detail panel. */
  belowMap?: ReactNode
  /** Active departure candidate — used for dynamic ETA in panel and time chip labels. */
  activeCandidate?: TravelCandidate
  /** Which leg the active candidate belongs to. */
  activeLeg?: 'outbound' | 'return'
  /** Resolved thresholds — required for fine-grained wind display status on pills and markers. */
  thresholdsUsed?: ResolvedTravelThresholds
  /** Map-specific visible statuses — empty means show all, non-empty means show only those. */
  visibleStatuses?: Set<WindDisplayStatus>
  /** Called when user toggles a map visibility pill. */
  onVisibleStatusesChange?: (next: Set<WindDisplayStatus>) => void
  /** Incrementing signal from parent — when this changes, clear manual point selection. */
  selectionResetSignal?: number
  /** Called when user taps Spá 🥄 on the selected point panel. */
  onOpenForecastDrawer?: (routeIndex: number) => void
}

/** Creates a Google Maps Symbol icon for a route weather point marker. */
function makeRouteSymbolIcon(color: string, scale: number, selected: boolean): google.maps.Symbol {
  return {
    path: 0 as google.maps.SymbolPath, // CIRCLE
    scale: Math.round(scale * 7),
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: selected ? 3 : 1.5,
  }
}

/** Creates a smaller outlined circle for the met.no forecast grid point. */
function makeForecastSymbolIcon(selected: boolean): google.maps.Symbol {
  return {
    path: 0 as google.maps.SymbolPath, // CIRCLE
    scale: selected ? 5 : 4,
    fillColor: '#9ca3af',
    fillOpacity: 0,
    strokeColor: '#6b7280',
    strokeWeight: selected ? 2 : 1.5,
  }
}

export function TravelAuditMap({
  originName,
  destinationName,
  routePoints,
  weatherPoints,
  highlightedIssue,
  staticMapUrl,
  selectedCandidatePointStatuses,
  belowMap,
  activeCandidate,
  activeLeg,
  thresholdsUsed,
  visibleStatuses,
  onVisibleStatusesChange,
  selectionResetSignal,
  onOpenForecastDrawer,
}: TravelAuditMapProps) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')

  const mapDivRef = useRef<HTMLDivElement>(null)
  // Route point markers (classic google.maps.Marker — no mapId requirement)
  const markersRef = useRef<google.maps.Marker[]>([])
  // met.no forecast grid point markers (shown when forecast point differs from route point)
  const forecastMarkersRef = useRef<google.maps.Marker[]>([])
  // Connector polylines between route and forecast points when they are far apart
  const connectorsRef = useRef<google.maps.Polyline[]>([])
  const polylineRef = useRef<google.maps.Polyline | null>(null)
  // Library and map refs for use in subsequent effects
  const mapRef = useRef<google.maps.Map | null>(null)
  const markerLibRef = useRef<google.maps.MarkerLibrary | null>(null)
  const coreLibRef = useRef<google.maps.CoreLibrary | null>(null)

  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapError, setMapError] = useState(false)
  const [staticMapFailed, setStaticMapFailed] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(() =>
    initialSelectedIndex(weatherPoints, highlightedIssue, activeCandidate),
  )
  const userSelectedRef = useRef(false)
  const [isManualSelection, setIsManualSelection] = useState(false)

  // Initialize map once on mount. Component remounts when result changes via key={result.id}.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!mapDivRef.current || weatherPoints.length === 0) return

    let cancelled = false

    async function init() {
      try {
        const [mapsLib, markerLib, coreLib] = await Promise.all([
          loadMapsLibrary(),
          loadMarkerLibrary(),
          loadCoreLibrary(),
        ])
        if (cancelled || !mapDivRef.current) return

        const map = new mapsLib.Map(mapDivRef.current, {
          zoom: 7,
          mapTypeId: 'roadmap',
          gestureHandling: 'cooperative',
          zoomControl: true,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        })
        mapRef.current = map
        markerLibRef.current = markerLib
        coreLibRef.current = coreLib

        // Draw route polyline
        const pathSource = routePoints.length >= 2 ? routePoints : weatherPoints
        if (pathSource.length >= 2) {
          const polyline = new mapsLib.Polyline({
            path: pathSource.map(toLngLat),
            geodesic: true,
            strokeColor: '#4A90E2',
            strokeOpacity: 0.85,
            strokeWeight: 4,
            map,
          })
          polylineRef.current = polyline
        }

        // Fit map to full route bounds
        const bounds = new coreLib.LatLngBounds()
        const boundsSource = routePoints.length > 0 ? routePoints : weatherPoints
        boundsSource.forEach(p => bounds.extend(toLngLat(p)))
        map.fitBounds(bounds, { top: 32, bottom: 32, left: 32, right: 32 })

        // Create weather point markers and forecast point markers
        const initIdx = initialSelectedIndex(weatherPoints, highlightedIssue, activeCandidate)
        const newRouteMarkers: google.maps.Marker[] = []
        const newForecastMarkers: google.maps.Marker[] = []
        const newConnectors: google.maps.Polyline[] = []

        weatherPoints.forEach((pt, idx) => {
          const style = markerStyleForStatus(
            pt.summaryForWindow?.status,
            pt.isHighlightedIssue ?? false,
          )
          const isSelected = idx === initIdx

          let label: google.maps.MarkerLabel | undefined
          if (pt.isOrigin) {
            label = { text: tf('originMarkerLabel'), color: '#fff', fontSize: '8px', fontWeight: 'bold' }
          } else if (pt.isDestinationClosest && !pt.isOrigin) {
            label = { text: tf('destinationMarkerLabel'), color: '#fff', fontSize: '8px', fontWeight: 'bold' }
          }

          // Route point marker
          const routeMarker = new markerLib.Marker({
            position: getRoutePointLatLng(pt),
            map,
            icon: makeRouteSymbolIcon(style.color, style.scale, isSelected),
            label,
            zIndex: isSelected ? 20 : style.zIndex,
            title: `${tf('pointLabel')} ${pt.routeIndex + 1}`,
          })
          routeMarker.addListener('click', () => {
            userSelectedRef.current = true
            setIsManualSelection(true)
            setSelectedIndex(prev => prev === idx ? null : idx)
          })
          newRouteMarkers.push(routeMarker)

          // Forecast point marker — shown when forecast grid differs from road point
          if (shouldShowForecastPointMarker(pt)) {
            const forecastLatLng = getForecastPointLatLng(pt)
            const forecastMarker = new markerLib.Marker({
              position: forecastLatLng,
              map,
              icon: makeForecastSymbolIcon(isSelected),
              zIndex: isSelected ? 19 : style.zIndex - 1,
              title: `${tf('metnoCoordLabel')} ${pt.routeIndex + 1}`,
            })
            forecastMarker.addListener('click', () => {
              userSelectedRef.current = true
              setIsManualSelection(true)
              setSelectedIndex(prev => prev === idx ? null : idx)
            })
            newForecastMarkers[idx] = forecastMarker

            // Connector line when route and forecast points are more than 500m apart
            if (!isSameCoordinatePair(getRoutePointLatLng(pt), forecastLatLng, 500)) {
              const connector = new mapsLib.Polyline({
                path: [getRoutePointLatLng(pt), forecastLatLng],
                geodesic: false,
                strokeColor: '#9ca3af',
                strokeOpacity: 0.5,
                strokeWeight: 1,
                map,
              })
              newConnectors[idx] = connector
            }
          }
        })

        markersRef.current = newRouteMarkers
        forecastMarkersRef.current = newForecastMarkers
        connectorsRef.current = newConnectors
        setMapLoaded(true)
      } catch {
        if (!cancelled) setMapError(true)
      }
    }

    init()

    return () => {
      cancelled = true
      markersRef.current.forEach((m) => m.setMap(null))
      markersRef.current = []
      forecastMarkersRef.current.forEach((m) => m?.setMap(null))
      forecastMarkersRef.current = []
      connectorsRef.current.forEach((c) => c?.setMap(null))
      connectorsRef.current = []
      if (polylineRef.current) {
        polylineRef.current.setMap(null)
        polylineRef.current = null
      }
      mapRef.current = null
      markerLibRef.current = null
      coreLibRef.current = null
    }
  }, [])

  // Sync selectedIndex when highlightedIssue changes, unless user has manually selected a point
  useEffect(() => {
    if (userSelectedRef.current) return
    if (!highlightedIssue?.lat || !highlightedIssue?.lon) return
    const idx = weatherPoints.findIndex(
      p => p.lat === highlightedIssue.lat && p.lon === highlightedIssue.lon,
    )
    if (idx >= 0) setSelectedIndex(idx)
  }, [highlightedIssue, weatherPoints])

  // Reset manual selection when parent signals a departure change
  useEffect(() => {
    if (selectionResetSignal === undefined) return
    userSelectedRef.current = false
    setIsManualSelection(false)
    setSelectedIndex(initialSelectedIndex(weatherPoints, highlightedIssue, activeCandidate))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionResetSignal])

  // Update marker icons, opacity (filter de-emphasis) when state changes
  useEffect(() => {
    if (!mapLoaded || markersRef.current.length === 0) return

    markersRef.current.forEach((marker, idx) => {
      const pt = weatherPoints[idx]
      if (!pt) return

      let markerStatus: WeatherStatus | undefined
      let isHighlighted: boolean

      if (selectedCandidatePointStatuses !== undefined) {
        // Timeline slot selected: color by per-candidate status (delta: absent = green)
        const ptEntry = selectedCandidatePointStatuses.find(s => s.routeIndex === pt.routeIndex)
        markerStatus = ptEntry && ptEntry.status !== 'no_data'
          ? ptEntry.status as WeatherStatus
          : ptEntry?.status === 'no_data'
            ? undefined
            : 'graent'
        isHighlighted = idx === selectedIndex && !!markerStatus && markerStatus !== 'graent'
      } else {
        markerStatus = pt.summaryForWindow?.status
        isHighlighted = pt.isHighlightedIssue ?? false
      }

      // Visibility: endpoints always visible; others shown only if no filter or their status matches
      const isEndpoint = pt.isOrigin || pt.isDestinationClosest
      const thresholdsForClassify = thresholdsUsed ?? resolveThresholds('none')
      const isSlotMode = activeCandidate !== undefined && selectedCandidatePointStatuses !== undefined
      const ptWindMs = isSlotMode
        ? getPointWindMsForCandidate(pt, activeCandidate!, activeLeg ?? 'outbound')
        : pt.summaryForWindow?.worstWindMs
      const ptHasData = isSlotMode ? (pt.forecastRows?.length ?? 0) > 0 : pt.summaryForWindow !== undefined
      const windDisplayStatus: WindDisplayStatus = classifyPointWindDisplayStatus(ptWindMs, ptHasData, thresholdsForClassify)
      const markerVisible = isEndpoint || (visibleStatuses?.size ?? 0) === 0 || visibleStatuses!.has(windDisplayStatus)
      marker.setVisible(markerVisible)

      const style = markerStyleForStatus(markerStatus, isHighlighted)
      const isSelected = idx === selectedIndex
      // Use fine-grained wind color for the route point dot
      const markerColor = WIND_STATUS_MARKER_COLOR[windDisplayStatus]
      marker.setIcon(makeRouteSymbolIcon(isHighlighted ? style.color : markerColor, style.scale, isSelected))
      marker.setZIndex(isSelected ? 20 : style.zIndex)
      // Add non-color icon label for best/worst statuses on non-endpoint markers
      if (!isEndpoint) {
        if (windDisplayStatus === 'innan-marka') {
          marker.setLabel({ text: '✓', color: '#ffffff', fontSize: '9px', fontWeight: 'bold' })
        } else if (windDisplayStatus === 'haettulegt') {
          marker.setLabel({ text: '!', color: '#ffffff', fontSize: '11px', fontWeight: 'bold' })
        } else {
          marker.setLabel('' as unknown as google.maps.MarkerLabel)
        }
      }

      const forecastMarker = forecastMarkersRef.current[idx]
      if (forecastMarker) {
        forecastMarker.setIcon(makeForecastSymbolIcon(isSelected))
        forecastMarker.setZIndex(isSelected ? 19 : style.zIndex - 1)
        forecastMarker.setVisible(markerVisible)
      }

    })
  }, [selectedIndex, mapLoaded, weatherPoints, selectedCandidatePointStatuses, activeCandidate, activeLeg, visibleStatuses])

  const selectedPoint = selectedIndex !== null ? weatherPoints[selectedIndex] : undefined
  const selectedSummary = selectedPoint
    ? buildPointSummary(selectedPoint, highlightedIssue, activeCandidate, activeLeg)
    : null

  const autoHighlightIdx = highlightedIssue?.lat !== undefined && highlightedIssue?.lon !== undefined
    ? weatherPoints.findIndex(p => p.lat === highlightedIssue.lat && p.lon === highlightedIssue.lon)
    : -1

  // Status counts for map visibility pills — uses active-candidate ETA when a slot is selected
  const mapStatusCounts = useMemo(() => {
    const counts: Partial<Record<WindDisplayStatus, number>> = {}
    const th = thresholdsUsed ?? resolveThresholds('none')
    const isSlotMode = activeCandidate !== undefined && selectedCandidatePointStatuses !== undefined
    weatherPoints.forEach(pt => {
      let windMs: number | undefined
      let hasData: boolean
      if (isSlotMode) {
        windMs = getPointWindMsForCandidate(pt, activeCandidate!, activeLeg ?? 'outbound')
        hasData = (pt.forecastRows?.length ?? 0) > 0
      } else {
        windMs = pt.summaryForWindow?.worstWindMs
        hasData = pt.summaryForWindow !== undefined
      }
      const st = classifyPointWindDisplayStatus(windMs, hasData, th)
      counts[st] = (counts[st] ?? 0) + 1
    })
    return counts
  }, [weatherPoints, thresholdsUsed, activeCandidate, selectedCandidatePointStatuses, activeLeg])

  // Fallback: static map or text
  if (mapError) {
    if (staticMapUrl && !staticMapFailed) {
      return (
        <div className="rounded-xl overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={staticMapUrl}
            alt={tf('auditMapAlt', { origin: originName, destination: destinationName })}
            className="w-full block"
            style={{ height: 'auto', maxWidth: '100%' }}
            onError={() => setStaticMapFailed(true)}
          />
        </div>
      )
    }
    return (
      <p className="text-xs text-muted-foreground">{tf('auditMapUnavailable')}</p>
    )
  }

  if (weatherPoints.length === 0) return null

  // Map visibility pill toggle — selected pills = "show this status"
  function toggleMapStatus(st: WindDisplayStatus) {
    if (!onVisibleStatusesChange) return
    const next = new Set(visibleStatuses ?? [])
    if (next.has(st)) {
      next.delete(st)
    } else {
      next.add(st)
    }
    // If the selected point's status is no longer visible, clear selection
    if (selectedPoint && next.size > 0) {
      const th = thresholdsUsed ?? resolveThresholds('none')
      const isSlotMode = activeCandidate !== undefined && selectedCandidatePointStatuses !== undefined
      const selWindMs = isSlotMode
        ? getPointWindMsForCandidate(selectedPoint, activeCandidate!, activeLeg ?? 'outbound')
        : selectedPoint.summaryForWindow?.worstWindMs
      const selHasData = isSlotMode ? (selectedPoint.forecastRows?.length ?? 0) > 0 : selectedPoint.summaryForWindow !== undefined
      const selStatus = classifyPointWindDisplayStatus(selWindMs, selHasData, th)
      if (!next.has(selStatus)) {
        userSelectedRef.current = false
        setIsManualSelection(false)
        const firstVisible = weatherPoints.findIndex((pt) => {
          const windMs = isSlotMode
            ? getPointWindMsForCandidate(pt, activeCandidate!, activeLeg ?? 'outbound')
            : pt.summaryForWindow?.worstWindMs
          const hasData = isSlotMode ? (pt.forecastRows?.length ?? 0) > 0 : pt.summaryForWindow !== undefined
          const s = classifyPointWindDisplayStatus(windMs, hasData, th)
          return next.size === 0 || next.has(s)
        })
        setSelectedIndex(firstVisible >= 0 ? firstVisible : null)
      }
    }
    onVisibleStatusesChange(next)
  }
  const mapHasActiveFilter = !!(onVisibleStatusesChange && (visibleStatuses?.size ?? 0) > 0)

  return (
    <section className="flex flex-col gap-2">
      {/* Map container */}
      <div className="relative overflow-hidden rounded-xl border border-border">
        <div ref={mapDivRef} className="h-[260px] sm:h-[320px] w-full" />
        {!mapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/40">
            <p className="text-xs text-muted-foreground">{tf('interactiveMapLoading')}</p>
          </div>
        )}
      </div>

      {/* Map point visibility pills */}
      {onVisibleStatusesChange && mapLoaded && (
        <div className="flex flex-wrap gap-1.5">
          {ALL_WIND_DISPLAY_STATUSES.filter(st => (mapStatusCounts[st] ?? 0) > 0).map(st => {
            const isActive = visibleStatuses?.has(st) ?? false
            const noFilter = (visibleStatuses?.size ?? 0) === 0
            const meta = WIND_STATUS_META[st]
            return (
              <button
                key={st}
                type="button"
                onClick={() => toggleMapStatus(st)}
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  isActive
                    ? meta.chipActiveClass
                    : noFilter
                      ? 'border-border bg-transparent text-muted-foreground'
                      : 'border-border bg-transparent text-muted-foreground/30'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${!isActive && !noFilter ? 'opacity-30' : ''} ${meta.dotClass}`} aria-hidden />
                <span aria-hidden>{meta.icon}</span>
                {tf(meta.labelKey as 'statusWithinLimits')} ({mapStatusCounts[st] ?? 0})
              </button>
            )
          })}
          {mapHasActiveFilter && (
            <button
              type="button"
              onClick={() => onVisibleStatusesChange(new Set())}
              className="text-[10px] px-2 py-1 rounded-full border border-primary/40 text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {tf('mapFilterShowAll')}
            </button>
          )}
        </div>
      )}

      {/* Timeline scrubber (inserted by parent between map canvas and point details) */}
      {belowMap}

      {/* Jump to worst point button — shown when user has manually selected a different point */}
      {autoHighlightIdx >= 0 && selectedIndex !== autoHighlightIdx && mapLoaded && (
        <button
          type="button"
          onClick={() => {
            userSelectedRef.current = false
            setIsManualSelection(false)
            setSelectedIndex(autoHighlightIdx)
          }}
          className="text-xs text-primary underline self-start focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
        >
          {tf('showWorstPoint')}
        </button>
      )}

      {/* Selected point details */}
      {selectedSummary && mapLoaded && (
        <PointDetailsPanel
          summary={selectedSummary}
          highlightedIssue={highlightedIssue}
          thresholdsUsed={thresholdsUsed}
          originName={originName}
          destinationName={destinationName}
          isManualSelection={isManualSelection}
          onOpenForecast={
            onOpenForecastDrawer && selectedPoint?.forecastRows?.length
              ? () => onOpenForecastDrawer(selectedPoint!.routeIndex)
              : undefined
          }
        />
      )}
    </section>
  )
}

function PointDetailsPanel({
  summary,
  highlightedIssue,
  thresholdsUsed,
  originName,
  destinationName,
  isManualSelection,
  onOpenForecast,
}: {
  summary: PointSummary
  highlightedIssue?: TravelIssue
  thresholdsUsed?: ResolvedTravelThresholds
  originName: string
  destinationName: string
  isManualSelection: boolean
  onOpenForecast?: () => void
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')

  // Lazy place label — origin/destination use known names; other points use Nominatim.
  const [placeLabel, setPlaceLabel] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (summary.isOrigin) { setPlaceLabel(originName); return }
    if (summary.isDestination) { setPlaceLabel(destinationName); return }
    setPlaceLabel(null)
    resolvePlaceLabel(summary.forecastLat, summary.forecastLon)
      .then(name => { if (!cancelled) setPlaceLabel(name) })
    return () => { cancelled = true }
  }, [
    summary.routeIndex,
    summary.isOrigin,
    summary.isDestination,
    summary.forecastLat,
    summary.forecastLon,
    originName,
    destinationName,
  ])

  const panelTitle = isManualSelection
    ? tf('manualSelectedPointTitle')
    : tf('worstPointTitle')

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3 flex flex-col gap-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-2 flex-wrap">
        {!isManualSelection ? (
          <span className="bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-medium">
            {panelTitle}
          </span>
        ) : (
          <span className="font-medium text-foreground">{panelTitle}</span>
        )}
      </div>
      <RouteWeatherPointDetailCard
        summary={summary}
        thresholdsUsed={thresholdsUsed}
        highlightedIssue={highlightedIssue}
        originName={originName}
        placeLabel={placeLabel}
        onOpenForecast={onOpenForecast}
      />
    </div>
  )
}
