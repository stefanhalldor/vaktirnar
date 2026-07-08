'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { RouteWeatherPoint, TravelIssue, CandidatePointStatus, WeatherStatus, TravelCandidate } from '@/lib/weather/types'
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
  formatNum,
  estimatePointEtaIso,
  getOriginDisplay,
  type PointSummary,
} from './travelAuditMap.helpers'

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
  /** Map-specific visible statuses — empty means show all, non-empty means show only those. */
  visibleStatuses?: Set<WeatherStatus | 'no_data'>
  /** Called when user toggles a map visibility pill. */
  onVisibleStatusesChange?: (next: Set<WeatherStatus | 'no_data'>) => void
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

/** Creates a compact time label chip as an SVG data-URI for use as a classic Marker icon. */
function makeTimeLabelSvg(time: string): string {
  const w = 48
  const h = 18
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect rx="3" width="${w}" height="${h}" fill="#1e293b" fill-opacity="0.88"/><text x="${w / 2}" y="13" text-anchor="middle" fill="white" font-family="system-ui,sans-serif" font-size="9" font-weight="bold">${time}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
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
  // Time chip markers for selected and warning points
  const chipMarkersRef = useRef<google.maps.Marker[]>([])
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
      chipMarkersRef.current.forEach((m) => m.setMap(null))
      chipMarkersRef.current = []
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

  // Update marker icons, opacity (filter de-emphasis), and time chips when state changes
  useEffect(() => {
    if (!mapLoaded || markersRef.current.length === 0) return

    // Clear existing chip markers
    chipMarkersRef.current.forEach(m => m.setMap(null))
    chipMarkersRef.current = []

    const newChips: google.maps.Marker[] = []

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

      // Visibility: endpoints always visible; others shown only if no filter or their status is selected
      const isEndpoint = pt.isOrigin || pt.isDestinationClosest
      const effectiveStatus: WeatherStatus | 'no_data' = markerStatus ?? (
        selectedCandidatePointStatuses !== undefined &&
        selectedCandidatePointStatuses.find(s => s.routeIndex === pt.routeIndex)?.status === 'no_data'
          ? 'no_data' : 'graent'
      )
      const markerVisible = isEndpoint || (visibleStatuses?.size ?? 0) === 0 || visibleStatuses!.has(effectiveStatus)
      marker.setVisible(markerVisible)

      const style = markerStyleForStatus(markerStatus, isHighlighted)
      const isSelected = idx === selectedIndex
      marker.setIcon(makeRouteSymbolIcon(style.color, style.scale, isSelected))
      marker.setZIndex(isSelected ? 20 : style.zIndex)

      const forecastMarker = forecastMarkersRef.current[idx]
      if (forecastMarker) {
        forecastMarker.setIcon(makeForecastSymbolIcon(isSelected))
        forecastMarker.setZIndex(isSelected ? 19 : style.zIndex - 1)
        forecastMarker.setVisible(markerVisible)
      }

      // Time chip: show for selected point or visible warning points
      if (!mapRef.current || !markerLibRef.current || !coreLibRef.current) return
      const isWarning = markerStatus === 'gult' || markerStatus === 'rautt'
      if (!isSelected && (!isWarning || !markerVisible)) return

      // Compute ETA time for chip label — always use activeCandidate ETA when a slot is selected
      const timeIso = activeCandidate
        ? estimatePointEtaIso(activeCandidate, pt, activeLeg ?? 'outbound')
        : pt.summaryForWindow?.etaIso
      if (!timeIso) return

      const chip = new markerLibRef.current.Marker({
        position: getRoutePointLatLng(pt),
        map: mapRef.current,
        icon: {
          url: makeTimeLabelSvg(formatKlTime(timeIso)),
          scaledSize: new coreLibRef.current.Size(48, 18),
          // Anchor below the chip so it floats above the dot marker
          anchor: new coreLibRef.current.Point(24, 28),
        },
        zIndex: 25,
        clickable: true,
        title: formatKlTime(timeIso),
      })
      chip.addListener('click', () => {
        userSelectedRef.current = true
        setIsManualSelection(true)
        setSelectedIndex(prev => prev === idx ? null : idx)
      })
      newChips.push(chip)
    })

    chipMarkersRef.current = newChips
  }, [selectedIndex, mapLoaded, weatherPoints, selectedCandidatePointStatuses, activeCandidate, activeLeg, visibleStatuses])

  const selectedPoint = selectedIndex !== null ? weatherPoints[selectedIndex] : undefined
  const selectedSummary = selectedPoint
    ? buildPointSummary(selectedPoint, highlightedIssue, activeCandidate, activeLeg)
    : null

  const autoHighlightIdx = highlightedIssue?.lat !== undefined && highlightedIssue?.lon !== undefined
    ? weatherPoints.findIndex(p => p.lat === highlightedIssue.lat && p.lon === highlightedIssue.lon)
    : -1

  // Status counts for map visibility pills
  const mapStatusCounts = useMemo(() => {
    const counts: Record<WeatherStatus | 'no_data', number> = { graent: 0, gult: 0, rautt: 0, no_data: 0 }
    weatherPoints.forEach(pt => {
      let status: WeatherStatus | 'no_data'
      if (selectedCandidatePointStatuses !== undefined) {
        const entry = selectedCandidatePointStatuses.find(s => s.routeIndex === pt.routeIndex)
        if (entry?.status === 'no_data') {
          status = 'no_data'
        } else {
          status = (entry?.status as WeatherStatus) ?? 'graent'
        }
      } else {
        status = pt.summaryForWindow?.status ?? 'graent'
      }
      counts[status]++
    })
    return counts
  }, [weatherPoints, selectedCandidatePointStatuses])

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
  function toggleMapStatus(st: WeatherStatus | 'no_data') {
    if (!onVisibleStatusesChange) return
    const next = new Set(visibleStatuses ?? [])
    if (next.has(st)) {
      next.delete(st)
    } else {
      next.add(st)
    }
    // If the selected point's status is no longer visible, clear selection
    if (selectedPoint && next.size > 0) {
      let selStatus: WeatherStatus | 'no_data'
      if (selectedCandidatePointStatuses !== undefined) {
        const entry = selectedCandidatePointStatuses.find(s => s.routeIndex === selectedPoint.routeIndex)
        selStatus = (entry?.status as WeatherStatus | 'no_data') ?? 'graent'
      } else {
        selStatus = selectedPoint.summaryForWindow?.status ?? 'graent'
      }
      if (!next.has(selStatus)) {
        userSelectedRef.current = false
        setIsManualSelection(false)
        const firstVisible = weatherPoints.findIndex((pt) => {
          let s: WeatherStatus | 'no_data'
          if (selectedCandidatePointStatuses !== undefined) {
            const e = selectedCandidatePointStatuses.find(x => x.routeIndex === pt.routeIndex)
            s = (e?.status as WeatherStatus | 'no_data') ?? 'graent'
          } else {
            s = pt.summaryForWindow?.status ?? 'graent'
          }
          return next.size === 0 || next.has(s)
        })
        setSelectedIndex(firstVisible >= 0 ? firstVisible : null)
      }
    }
    onVisibleStatusesChange(next)
  }

  const MAP_PILL_STATUSES: Array<WeatherStatus | 'no_data'> = ['graent', 'gult', 'rautt', 'no_data']
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
          {MAP_PILL_STATUSES.filter(st => mapStatusCounts[st] > 0).map(st => {
            const isActive = visibleStatuses?.has(st) ?? false
            const noFilter = (visibleStatuses?.size ?? 0) === 0
            const label = st === 'graent' ? tf('heatmapLegendGreen')
              : st === 'gult' ? tf('heatmapLegendYellow')
              : st === 'rautt' ? tf('heatmapLegendRed')
              : tf('heatmapNotAssessed')
            const dotClass = st === 'graent' ? 'bg-[#2d5a27]'
              : st === 'gult' ? 'bg-amber-500'
              : st === 'rautt' ? 'bg-destructive'
              : 'bg-muted-foreground/30'
            const borderClass = st === 'graent' ? 'border-[#2d5a27]'
              : st === 'gult' ? 'border-amber-500'
              : st === 'rautt' ? 'border-destructive'
              : 'border-muted-foreground/30'
            return (
              <button
                key={st}
                type="button"
                onClick={() => toggleMapStatus(st)}
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  isActive
                    ? `${borderClass} bg-muted/50 text-foreground`
                    : noFilter
                      ? 'border-border bg-transparent text-muted-foreground'
                      : 'border-border bg-transparent text-muted-foreground/30'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${!isActive && !noFilter ? 'opacity-30' : ''} ${dotClass}`} aria-hidden />
                {label} ({mapStatusCounts[st]})
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
  originName,
  destinationName,
  isManualSelection,
  onOpenForecast,
}: {
  summary: PointSummary
  highlightedIssue?: TravelIssue
  originName: string
  destinationName: string
  isManualSelection: boolean
  onOpenForecast?: () => void
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const locale = useLocale()

  // Lazy place label for forecast point.
  // Origin/destination use known names directly; other points use Nominatim.
  const [placeLabel, setPlaceLabel] = useState<string | null>(null)
  const [placeLoading, setPlaceLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    if (summary.isOrigin) {
      setPlaceLabel(originName)
      setPlaceLoading(false)
      return
    }
    if (summary.isDestination) {
      setPlaceLabel(destinationName)
      setPlaceLoading(false)
      return
    }

    // Lazy geocode for all non-origin/destination points via BFF
    setPlaceLabel(null)
    setPlaceLoading(true)
    resolvePlaceLabel(summary.forecastLat, summary.forecastLon)
      .then(name => { if (!cancelled) setPlaceLabel(name) })
      .finally(() => { if (!cancelled) setPlaceLoading(false) })

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

  const distanceKm =
    summary.isHighlighted && highlightedIssue?.distanceFromLegStartM !== undefined
      ? Math.round(highlightedIssue.distanceFromLegStartM / 1000)
      : summary.distanceFromOriginKm

  const legStartName =
    summary.isHighlighted && highlightedIssue?.legStartName
      ? highlightedIssue.legStartName
      : originName
  const originDisplay = getOriginDisplay(legStartName, locale, tf('slotDetailOriginFallback'))

  // When a heatmap slot is selected (isHighlighted), use the issue's time and metric values
  // so the panel matches the slot detail exactly. summaryForWindow reflects the default
  // departure window, which may differ from the selected slot's window.
  const hasIssueValues =
    summary.isHighlighted &&
    highlightedIssue?.value !== undefined &&
    highlightedIssue.metric !== 'data'
  const issueTime =
    summary.isHighlighted && highlightedIssue?.timeIso
      ? formatKlTime(highlightedIssue.timeIso)
      : null
  const decisiveTime = issueTime ?? summary.decisiveTimeFormatted
  const issueMetricLabel =
    highlightedIssue?.metric === 'precipitation' ? tf('metricPrecip')
    : highlightedIssue?.metric === 'gust' ? tf('metricGust')
    : tf('metricWind')

  // Semantic title for the panel
  const panelTitle = isManualSelection
    ? tf('manualSelectedPointTitle')
    : tf('worstPointTitle')

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3 flex flex-col gap-2 text-xs text-muted-foreground">
      {/* 1. Semantic title */}
      <div className="flex items-center gap-2 flex-wrap">
        {!isManualSelection ? (
          <span className="bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-medium">
            {panelTitle}
          </span>
        ) : (
          <span className="font-medium text-foreground">{panelTitle}</span>
        )}
      </div>

      {/* 2. Punktur x/y */}
      <span className="font-medium text-foreground">
        {tf('pointLabel')} {summary.routeIndex + 1}/{summary.totalPoints}
      </span>

      {/* 3. Brottfarartími (departure from active candidate) */}
      {summary.departureIso && (
        <span>{tf('pointDepartureLabel')}: {tf('pointTimeLine', { time: formatKlTime(summary.departureIso) })}</span>
      )}

      {/* 4. ETA with distance context */}
      {summary.etaIso && (
        <span>
          {tf('pointEtaLabel')}
          {distanceKm > 0 && ` ${distanceKm} ${tf('kmFrom')} ${originDisplay}`}
          {': '}
          {tf('pointTimeLine', { time: formatKlTime(summary.etaIso) })}
        </span>
      )}

      {/* 5. Forecast point distance from road */}
      <span>
        {summary.forecastDistanceFromRouteM < 1000
          ? tf('forecastPointDistanceMeters', { meters: summary.forecastDistanceFromRouteM })
          : tf('forecastPointDistanceKilometers', { kilometers: formatNum(summary.forecastDistanceFromRouteM / 1000, locale) })}
      </span>

      {/* 6. Forecast time at this point */}
      {decisiveTime && (
        <span>{tf('pointForecastHereAt', { time: decisiveTime })}</span>
      )}

      {/* 7. Weather values — use issue values when a heatmap slot is highlighted */}
      {hasIssueValues ? (
        <p>
          {issueMetricLabel}: {formatNum(highlightedIssue!.value!, locale)} {highlightedIssue!.unit ?? ''}
          {highlightedIssue!.thresholdValue !== undefined && highlightedIssue!.value! > highlightedIssue!.thresholdValue && (
            <> {tf('aboveThresholdWithExcess', { excess: formatNum(highlightedIssue!.value! - highlightedIssue!.thresholdValue, locale), threshold: formatNum(highlightedIssue!.thresholdValue, locale), unit: highlightedIssue!.thresholdUnit ?? '' })}</>
          )}
        </p>
      ) : (
        (summary.windMs > 0 || summary.precipMmPerHour > 0 || summary.decisiveTempC !== undefined) && (
          <p>
            {tf('metricWind')}: {formatNum(summary.windMs, locale)} m/s
            {summary.gustMs > summary.windMs && (
              <>{' · '}{tf('metricGust')}: {formatNum(summary.gustMs, locale)} m/s</>
            )}
            {' · '}{tf('metricPrecip')}: {formatNum(summary.precipMmPerHour, locale)} mm/klst
            {summary.decisiveTempC !== undefined && (
              <>{' · '}{tf('metricTemp')}: {formatNum(summary.decisiveTempC, locale)}°C</>
            )}
          </p>
        )
      )}
      {summary.forecastTimeIso && summary.forecastTimeIso !== summary.etaIso && (
        <span>{tf('pointForecastTimeLabel')}: {formatKlTime(summary.forecastTimeIso)}</span>
      )}

      {/* 9. Forecast point coordinate and place context */}
      <div className="flex flex-col gap-0.5">
        {placeLabel && !summary.isOrigin && !summary.isDestination && (
          <span>{tf('forecastPointNear', { place: placeLabel })}</span>
        )}
        {summary.hasSeparateForecastPoint && (
          <span className="text-muted-foreground/60">
            {tf('forecastPointCoord', { lat: summary.forecastLat.toFixed(4), lon: summary.forecastLon.toFixed(4) })}
          </span>
        )}
        {placeLabel && !summary.isOrigin && !summary.isDestination && (
          <span className="text-muted-foreground/40 text-[10px]">© OpenStreetMap contributors</span>
        )}
      </div>

      {/* 8. Links */}
      <div className="flex flex-wrap gap-3">
        {onOpenForecast && (
          <button
            type="button"
            onClick={onOpenForecast}
            className="underline hover:text-foreground transition-colors text-left"
          >
            {tf('spaSpoon')}
          </button>
        )}
        <a
          href={summary.yrnoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground transition-colors"
        >
          {tf('viewForecast')}
        </a>
        <a
          href={summary.googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground transition-colors"
        >
          {tf('openOnMap')}
        </a>
        <a
          href={summary.metnoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground transition-colors text-muted-foreground/60"
        >
          {tf('viewMetnoRaw')}
        </a>
      </div>
    </div>
  )
}
