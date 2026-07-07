'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
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
  /** Currently hidden statuses from the departure filter. Used to de-emphasize filtered markers. */
  hiddenStatuses?: Set<WeatherStatus | 'no_data'>
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
  hiddenStatuses,
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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(() =>
    initialSelectedIndex(weatherPoints, highlightedIssue),
  )
  const userSelectedRef = useRef(false)

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
        const initIdx = initialSelectedIndex(weatherPoints, highlightedIssue)
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

      // Filter de-emphasis: origin and destination always stay full opacity
      const isEndpoint = pt.isOrigin || pt.isDestinationClosest
      const effectiveStatus: WeatherStatus | 'no_data' = markerStatus ?? (
        selectedCandidatePointStatuses !== undefined &&
        selectedCandidatePointStatuses.find(s => s.routeIndex === pt.routeIndex)?.status === 'no_data'
          ? 'no_data' : 'graent'
      )
      const isFiltered = !isEndpoint && (hiddenStatuses?.size ?? 0) > 0 && hiddenStatuses!.has(effectiveStatus)
      marker.setOpacity(isFiltered ? 0.2 : 1.0)

      const style = markerStyleForStatus(markerStatus, isHighlighted)
      const isSelected = idx === selectedIndex
      marker.setIcon(makeRouteSymbolIcon(style.color, style.scale, isSelected))
      marker.setZIndex(isSelected ? 20 : style.zIndex)

      const forecastMarker = forecastMarkersRef.current[idx]
      if (forecastMarker) {
        forecastMarker.setIcon(makeForecastSymbolIcon(isSelected))
        forecastMarker.setZIndex(isSelected ? 19 : style.zIndex - 1)
        forecastMarker.setOpacity(isFiltered ? 0.2 : 1.0)
      }

      // Time chip: show for selected point or non-filtered warning points
      if (!mapRef.current || !markerLibRef.current || !coreLibRef.current) return
      const isWarning = markerStatus === 'gult' || markerStatus === 'rautt'
      if (!isSelected && (!isWarning || isFiltered)) return

      // Compute ETA time for chip label
      let timeIso: string | undefined
      if (isSelected && activeCandidate) {
        timeIso = estimatePointEtaIso(activeCandidate, pt, activeLeg ?? 'outbound')
      } else {
        timeIso = pt.summaryForWindow?.etaIso
      }
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
        setSelectedIndex(prev => prev === idx ? null : idx)
      })
      newChips.push(chip)
    })

    chipMarkersRef.current = newChips
  }, [selectedIndex, mapLoaded, weatherPoints, selectedCandidatePointStatuses, activeCandidate, activeLeg, hiddenStatuses])

  const selectedPoint = selectedIndex !== null ? weatherPoints[selectedIndex] : undefined
  const selectedSummary = selectedPoint
    ? buildPointSummary(selectedPoint, highlightedIssue, activeCandidate, activeLeg)
    : null

  const autoHighlightIdx = highlightedIssue?.lat !== undefined && highlightedIssue?.lon !== undefined
    ? weatherPoints.findIndex(p => p.lat === highlightedIssue.lat && p.lon === highlightedIssue.lon)
    : -1

  // Fallback: static map or nothing
  if (mapError) {
    if (staticMapUrl) {
      return (
        <div className="rounded-xl overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={staticMapUrl}
            alt={tf('auditMapAlt', { origin: originName, destination: destinationName })}
            className="w-full block"
            style={{ height: 'auto', maxWidth: '100%' }}
          />
        </div>
      )
    }
    return (
      <p className="text-xs text-muted-foreground">{tf('interactiveMapUnavailable')}</p>
    )
  }

  if (weatherPoints.length === 0) return null

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

      {/* Timeline scrubber (inserted by parent between map canvas and point details) */}
      {belowMap}

      {/* Jump to worst point button — shown when user has manually selected a different point */}
      {autoHighlightIdx >= 0 && selectedIndex !== autoHighlightIdx && mapLoaded && (
        <button
          type="button"
          onClick={() => {
            userSelectedRef.current = false
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
}: {
  summary: PointSummary
  highlightedIssue?: TravelIssue
  originName: string
  destinationName: string
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

  const placeName =
    summary.isHighlighted && highlightedIssue?.legStartName
      ? highlightedIssue.legStartName
      : originName

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

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3 flex flex-col gap-2 text-xs text-muted-foreground">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        {summary.isHighlighted && (
          <span className="bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-medium">
            {tf('worstPointTitle')}
          </span>
        )}
        <span className="font-medium text-foreground">
          {tf('pointLabel')} {summary.routeIndex + 1}/{summary.totalPoints}
        </span>
      </div>

      {/* Distance and decisive time */}
      <div className="flex flex-wrap gap-x-4 gap-y-0.5">
        <span>{distanceKm} {tf('kmFrom')} {placeName}</span>
        {decisiveTime && (
          <span>{tf('pointTimeLine', { time: decisiveTime })}</span>
        )}
      </div>

      {/* ETA and forecast time */}
      {summary.etaIso && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          <span>{tf('pointEtaLabel')}: {formatKlTime(summary.etaIso)}</span>
          {summary.forecastTimeIso && summary.forecastTimeIso !== summary.etaIso && (
            <span>{tf('pointForecastTimeLabel')}: {formatKlTime(summary.forecastTimeIso)}</span>
          )}
        </div>
      )}
      {summary.nextForecast && (
        <span>
          {tf('pointNextForecastLabel')}: {
            summary.nextForecast.trend === 'better' ? tf('forecastTrendBetter')
            : summary.nextForecast.trend === 'worse' ? tf('forecastTrendWorse')
            : tf('forecastTrendSame')
          } {tf('pointTimeLine', { time: formatKlTime(summary.nextForecast.timeIso) })}
        </span>
      )}

      {/* Weather values — use issue values when a heatmap slot is highlighted */}
      {hasIssueValues ? (
        <p>
          {issueMetricLabel}: {formatNum(highlightedIssue!.value!, locale)} {highlightedIssue!.unit ?? ''}
          {highlightedIssue!.thresholdValue !== undefined && (
            <> {tf('aboveThresholdWithExcess', { excess: formatNum(highlightedIssue!.value! - highlightedIssue!.thresholdValue, locale), threshold: formatNum(highlightedIssue!.thresholdValue, locale), unit: highlightedIssue!.thresholdUnit ?? '' })}</>
          )}
        </p>
      ) : (
        (summary.windMs > 0 || summary.precipMmPerHour > 0) && (
          <p>
            {tf('metricWind')}: {formatNum(summary.windMs, locale)} m/s
            {summary.gustMs > summary.windMs && (
              <>{' '}· {tf('metricGust')}: {formatNum(summary.gustMs, locale)} m/s
                {summary.decisiveMetric === 'gust' && (
                  <span className="ml-1 text-[10px] font-medium opacity-80">↑</span>
                )}
              </>
            )}
            {summary.precipMmPerHour > 0 && (
              <>{' '}· {tf('metricPrecip')}: {formatNum(summary.precipMmPerHour, locale)} mm/klst</>
            )}
          </p>
        )
      )}

      {/* Coordinates and forecast point identity */}
      <div className="flex flex-col gap-0.5">
        {/* Place label for all non-origin/destination points */}
        {!summary.isOrigin && !summary.isDestination && (
          <span>
            {placeLabel
              ? tf('forecastPointNear', { place: placeLabel })
              : tf('metnoCoordLabel')}
          </span>
        )}
        <span className="text-muted-foreground/60">
          {tf('routePointCoord', { lat: summary.routeLat.toFixed(4), lon: summary.routeLon.toFixed(4) })}
        </span>
        {summary.hasSeparateForecastPoint && (
          <>
            <span className="text-muted-foreground/60">
              {tf('forecastPointCoord', { lat: summary.forecastLat.toFixed(4), lon: summary.forecastLon.toFixed(4) })}
            </span>
            <span className="text-muted-foreground/50 leading-relaxed">
              {summary.forecastDistanceFromRouteM < 50
                ? tf('forecastPointOnRoute')
                : summary.forecastDistanceFromRouteM < 1000
                ? tf('forecastPointDistanceMeters', { meters: summary.forecastDistanceFromRouteM })
                : tf('forecastPointDistanceKilometers', { kilometers: formatNum(summary.forecastDistanceFromRouteM / 1000, locale) })}
            </span>
          </>
        )}
        {placeLabel && !summary.isOrigin && !summary.isDestination && (
          <span className="text-muted-foreground/40 text-[10px]">© OpenStreetMap contributors</span>
        )}
      </div>

      {/* Links */}
      <div className="flex flex-wrap gap-3">
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
