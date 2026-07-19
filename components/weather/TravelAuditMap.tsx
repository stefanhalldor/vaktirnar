'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import type { RouteWeatherPoint, TravelIssue, CandidatePointStatus, TravelCandidate, ResolvedTravelThresholds, WeatherStatus } from '@/lib/weather/types'
import { resolveThresholds } from '@/lib/weather/thresholds'
import {
  type WindDisplayStatus,
  WIND_STATUS_MARKER_COLOR,
  classifyPointWindDisplayStatus,
} from '@/lib/weather/windDisplayStatus'
import { WIND_STATUS_UI_META as WIND_STATUS_META } from './windStatusUi'
import { WindStatusBadge } from './WindStatusBadge'
import { WindStatusFilterPills } from './WindStatusFilterPills'
import { loadMapsLibrary, loadMarkerLibrary, loadCoreLibrary } from '@/lib/weather/googleMaps.client'
import { type WeatherProviderKey } from '@/lib/weather/providerComparator'
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
  resolveRoutePointWindDisplayStatus,
  type PointSummary,
} from './travelAuditMap.helpers'
import { RouteWeatherPointDetailCard } from './RouteWeatherPointDetailCard'
import { VedurstofanPointCard } from './VedurstofanPointCard'

/** A generic weather provider map point for overlay markers (non-MET/Yr providers). */
export type ProviderMapPoint = {
  provider: WeatherProviderKey
  lat: number
  lon: number
  /** Stable point id (e.g. stationId for Veðurstofan). */
  id: string
  /** Display label shown in marker title (e.g. station name). */
  label: string
  status: WindDisplayStatus
  windMs: number | null
  /** ISO timestamp of the decisive forecast row (provider-independent name). */
  forecastTimeIso: string | null
  etaIso: string | null
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
  /** Non-MET/Yr provider overlay points (e.g. Veðurstofan stations), shown as status-colored markers. */
  providerOverlayPoints?: ProviderMapPoint[]
  /** Id of the overlay point to auto-select as "worst" (e.g. worstVedurstofanData.station.stationId). */
  highlightedOverlayPointId?: string
  /** Full Veðurstofan layer points for rich station detail in OverlayPointDetailsPanel. */
  vedurstofanLayerPoints?: import('@/lib/weather/providers/vedurstofanBlend').VedurstofanTravelLayer['points']
  /** Reference departure ISO for ETA computation in overlay detail panel. */
  referenceDepartureIso?: string | null
  /** Reference arrival ISO for ETA computation in overlay detail panel. */
  referenceArrivalIso?: string | null
  /** returnTo value forwarded to VedurstofanPointCard in the overlay panel so pulse CTAs carry trip context. */
  vedurstofanReturnTo?: string
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

/** Returns true when a provider overlay point should be shown given the active visibility filter. */
function overlayIsVisible(p: ProviderMapPoint, filter: Set<WindDisplayStatus> | undefined): boolean {
  return (filter?.size ?? 0) === 0 || filter!.has(p.status)
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
  providerOverlayPoints,
  highlightedOverlayPointId,
  vedurstofanLayerPoints,
  referenceDepartureIso,
  referenceArrivalIso,
  vedurstofanReturnTo,
}: TravelAuditMapProps) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')

  const mapDivRef = useRef<HTMLDivElement>(null)
  // Route point markers (classic google.maps.Marker — no mapId requirement)
  const markersRef = useRef<google.maps.Marker[]>([])
  // met.no forecast grid point markers (shown when forecast point differs from route point)
  const forecastMarkersRef = useRef<google.maps.Marker[]>([])
  // Connector polylines between route and forecast points when they are far apart
  const connectorsRef = useRef<google.maps.Polyline[]>([])
  // Veðurstofan station overlay markers (shown when vedurstofanStationPoints is non-empty)
  const vedurstofanMarkersRef = useRef<google.maps.Marker[]>([])
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
  const [selectedOverlayPoint, setSelectedOverlayPoint] = useState<ProviderMapPoint | null>(null)

  // Initialize map once on mount. Component remounts when result changes via key={result.id}.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const hasAnyPoints = weatherPoints.length > 0 || (providerOverlayPoints?.length ?? 0) > 0
    if (!mapDivRef.current || !hasAnyPoints) return

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
          zoom: 4,
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

        // Fit map to full route bounds (include both route points and Veðurstofan stations)
        const bounds = new coreLib.LatLngBounds()
        const boundsSource = routePoints.length > 0 ? routePoints : weatherPoints
        boundsSource.forEach(p => bounds.extend(toLngLat(p)))
        providerOverlayPoints?.forEach(sp => bounds.extend({ lat: sp.lat, lng: sp.lon }))
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
            setSelectedOverlayPoint(null)
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
              setSelectedOverlayPoint(null)
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
      vedurstofanMarkersRef.current.forEach((m) => m.setMap(null))
      vedurstofanMarkersRef.current = []
      if (polylineRef.current) {
        polylineRef.current.setMap(null)
        polylineRef.current = null
      }
      mapRef.current = null
      markerLibRef.current = null
      coreLibRef.current = null
    }
  }, [])

  // Update provider overlay markers when providerOverlayPoints changes (e.g. scrubber slot change).
  // Runs after mapLoaded becomes true and whenever overlay points or visibility filter are updated.
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !markerLibRef.current) return
    const markerLib = markerLibRef.current
    const map = mapRef.current

    vedurstofanMarkersRef.current.forEach(m => m.setMap(null))
    vedurstofanMarkersRef.current = []

    const newMarkers: google.maps.Marker[] = []
    for (const sp of (providerOverlayPoints ?? [])) {
      const isVisible = overlayIsVisible(sp, visibleStatuses)
      const markerColor = WIND_STATUS_MARKER_COLOR[sp.status]
      const titleParts = [sp.label]
      if (sp.windMs !== null) titleParts.push(`${sp.windMs} m/s`)
      if (sp.forecastTimeIso) titleParts.push(`spá kl. ${formatKlTime(sp.forecastTimeIso)}`)
      let markerLabel: google.maps.MarkerLabel | string = ''
      if (sp.status === 'innan-marka') {
        markerLabel = { text: '✓', color: '#ffffff', fontSize: '9px', fontWeight: 'bold' }
      } else if (sp.status === 'haettulegt' || sp.status === 'nalgast-haettumork') {
        markerLabel = { text: '!', color: '#ffffff', fontSize: '11px', fontWeight: 'bold' }
      }
      const m = new markerLib.Marker({
        position: { lat: sp.lat, lng: sp.lon },
        map,
        icon: {
          path: 0 as google.maps.SymbolPath,
          scale: 9,
          fillColor: markerColor,
          fillOpacity: 0.9,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        label: markerLabel,
        title: titleParts.join(' · '),
        zIndex: 15,
        visible: isVisible,
      })
      m.addListener('click', () => {
        userSelectedRef.current = true
        setIsManualSelection(true)
        setSelectedOverlayPoint(sp)
        setSelectedIndex(null)
      })
      newMarkers.push(m)
    }
    vedurstofanMarkersRef.current = newMarkers
  }, [providerOverlayPoints, mapLoaded, visibleStatuses])

  // Auto-select the highlighted overlay point when not user-selected.
  // When a highlighted overlay point exists and is visible, it takes precedence as the "worst" selection.
  // If the highlighted point is hidden by the filter, falls back to the first visible overlay point.
  useEffect(() => {
    if (userSelectedRef.current) return
    if (!highlightedOverlayPointId || !providerOverlayPoints?.length) {
      setSelectedOverlayPoint(null)
      return
    }
    const highlighted = providerOverlayPoints.find(p => p.id === highlightedOverlayPointId) ?? null
    // visibleStatuses read from closure (fresh on dep change); not in deps — toggleMapStatus owns filter changes.
    const toSelect = highlighted && overlayIsVisible(highlighted, visibleStatuses)
      ? highlighted
      : (providerOverlayPoints.find(p => overlayIsVisible(p, visibleStatuses)) ?? null)
    setSelectedOverlayPoint(toSelect)
    if (toSelect) setSelectedIndex(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedOverlayPointId, providerOverlayPoints])

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
    // Respect the active visibility filter: prefer highlighted overlay if visible, then first visible overlay.
    const toSelectOverlay = (() => {
      if (!highlightedOverlayPointId || !providerOverlayPoints?.length) return null
      const highlighted = providerOverlayPoints.find(p => p.id === highlightedOverlayPointId) ?? null
      if (highlighted && overlayIsVisible(highlighted, visibleStatuses)) return highlighted
      return providerOverlayPoints.find(p => overlayIsVisible(p, visibleStatuses)) ?? null
    })()
    setSelectedOverlayPoint(toSelectOverlay)
    if (toSelectOverlay) {
      setSelectedIndex(null)
    } else {
      setSelectedIndex(initialSelectedIndex(weatherPoints, highlightedIssue, activeCandidate))
    }
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
      const { status: windDisplayStatus } = resolveRoutePointWindDisplayStatus({
        point: pt,
        activeCandidate,
        activeLeg,
        thresholds: thresholdsForClassify,
      })
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

  // Status counts for map visibility pills — uses active-candidate ETA when a slot is selected.
  // Includes both MET/Yr route points and overlay provider points.
  const mapStatusCounts = useMemo(() => {
    const counts: Partial<Record<WindDisplayStatus, number>> = {}
    const th = thresholdsUsed ?? resolveThresholds('none')
    weatherPoints.forEach(pt => {
      const { status } = resolveRoutePointWindDisplayStatus({
        point: pt,
        activeCandidate,
        activeLeg,
        thresholds: th,
      })
      counts[status] = (counts[status] ?? 0) + 1
    })
    providerOverlayPoints?.forEach(pt => {
      counts[pt.status] = (counts[pt.status] ?? 0) + 1
    })
    return counts
  }, [weatherPoints, thresholdsUsed, activeCandidate, activeLeg, providerOverlayPoints])

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

  if (weatherPoints.length === 0 && (providerOverlayPoints?.length ?? 0) === 0) return null

  // Handle status filter change from WindStatusFilterPills.
  // Receives the already-toggled Set; applies selection side effects before propagating.
  function handleVisibleStatusesChange(next: Set<WindDisplayStatus>) {
    if (!onVisibleStatusesChange) return
    // If the selected overlay point is no longer visible, clear/replace it
    if (selectedOverlayPoint && !overlayIsVisible(selectedOverlayPoint, next)) {
      userSelectedRef.current = false
      setIsManualSelection(false)
      const highlighted = highlightedOverlayPointId
        ? (providerOverlayPoints?.find(p => p.id === highlightedOverlayPointId) ?? null)
        : null
      const replacement = (highlighted && overlayIsVisible(highlighted, next))
        ? highlighted
        : (providerOverlayPoints?.find(p => overlayIsVisible(p, next)) ?? null)
      setSelectedOverlayPoint(replacement)
      if (replacement) setSelectedIndex(null)
    }
    // If the selected MET/Yr point's status is no longer visible, clear/replace it
    if (selectedPoint && next.size > 0) {
      const th = thresholdsUsed ?? resolveThresholds('none')
      const { status: selStatus } = resolveRoutePointWindDisplayStatus({
        point: selectedPoint,
        activeCandidate,
        activeLeg,
        thresholds: th,
      })
      if (!next.has(selStatus)) {
        userSelectedRef.current = false
        setIsManualSelection(false)
        const firstVisible = weatherPoints.findIndex(pt => {
          const { status } = resolveRoutePointWindDisplayStatus({
            point: pt,
            activeCandidate,
            activeLeg,
            thresholds: th,
          })
          return next.size === 0 || next.has(status)
        })
        setSelectedIndex(firstVisible >= 0 ? firstVisible : null)
      }
    }
    onVisibleStatusesChange(next)
  }

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

      {/* Map point visibility pills — shown when any provider has points */}
      {onVisibleStatusesChange && mapLoaded && (weatherPoints.length > 0 || (providerOverlayPoints?.length ?? 0) > 0) && (
        <WindStatusFilterPills
          counts={mapStatusCounts}
          visibleStatuses={visibleStatuses ?? new Set()}
          onVisibleStatusesChange={handleVisibleStatusesChange}
          showAllLabel={tf('mapFilterShowAll')}
          showAllButton
        />
      )}

      {/* Timeline scrubber (inserted by parent between map canvas and point details) */}
      {belowMap}

      {/* Jump to worst point button — shown when user has manually selected a different MET/Yr point */}
      {!selectedOverlayPoint && autoHighlightIdx >= 0 && selectedIndex !== autoHighlightIdx && mapLoaded && (
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

      {/* Selected overlay provider point details */}
      {selectedOverlayPoint && mapLoaded && (
        <OverlayPointDetailsPanel
          point={selectedOverlayPoint}
          isManualSelection={isManualSelection}
          vedurstofanLayerPoints={vedurstofanLayerPoints}
          referenceDepartureIso={referenceDepartureIso}
          referenceArrivalIso={referenceArrivalIso}
          originName={originName}
          vedurstofanReturnTo={vedurstofanReturnTo}
        />
      )}

      {/* Selected MET/Yr point details */}
      {!selectedOverlayPoint && selectedSummary && mapLoaded && (
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

function OverlayPointDetailsPanel({
  point,
  isManualSelection,
  vedurstofanLayerPoints,
  referenceDepartureIso,
  referenceArrivalIso,
  originName,
  vedurstofanReturnTo,
}: {
  point: ProviderMapPoint
  isManualSelection: boolean
  vedurstofanLayerPoints?: import('@/lib/weather/providers/vedurstofanBlend').VedurstofanTravelLayer['points']
  referenceDepartureIso?: string | null
  referenceArrivalIso?: string | null
  originName: string
  vedurstofanReturnTo?: string
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')

  const panelTitle = isManualSelection
    ? tf('manualSelectedPointTitle')
    : tf('worstPointTitle')

  // Try to find the full station data for a rich card
  const station = vedurstofanLayerPoints?.find(p => p.stationId === point.id)
  if (station) {
    // Compute ETA for this station from reference dep/arr ISOs and routeFraction
    let etaIso: string | null = point.etaIso
    if (!etaIso && station.routeFraction !== null && referenceDepartureIso && referenceArrivalIso) {
      const depMs = Date.parse(referenceDepartureIso)
      const arrMs = Date.parse(referenceArrivalIso)
      if (!isNaN(depMs) && !isNaN(arrMs)) {
        etaIso = new Date(depMs + station.routeFraction * (arrMs - depMs)).toISOString()
      }
    }
    return (
      <VedurstofanPointCard
        station={station}
        status={point.status}
        etaIso={etaIso}
        departureIso={referenceDepartureIso ?? null}
        originName={originName}
        isManualSelection={isManualSelection}
        panelTitle={panelTitle}
        returnTo={vedurstofanReturnTo}
      />
    )
  }

  // Fallback for non-Veðurstofan overlay points (sparse card)
  const meta = WIND_STATUS_META[point.status]
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
      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-foreground text-sm">{point.label}</span>
        <div className="flex items-center gap-2 flex-wrap">
          <WindStatusBadge status={point.status} variant="chip" />
          {point.windMs !== null && (
            <span>{point.windMs} m/s</span>
          )}
        </div>
        {point.etaIso && (
          <div className="flex items-center gap-1">
            <span>{tf('pointEtaLabel')}:</span>
            <span className="text-foreground">{formatKlTime(point.etaIso)}</span>
          </div>
        )}
      </div>
    </div>
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

  const windDisplayStatus = classifyPointWindDisplayStatus(summary.windMs, summary.hasData, thresholdsUsed ?? resolveThresholds('none'))

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
        <WindStatusBadge status={windDisplayStatus} variant="chip" />
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
