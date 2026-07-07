'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PlaceSearch, type PlaceResult } from './PlaceSearch'
import { loadMapsLibrary, loadMarkerLibrary, loadCoreLibrary } from '@/lib/weather/googleMaps.client'
import { toLngLat } from './travelAuditMap.helpers'
import type { RouteOption } from '@/lib/weather/provider.types'

export type RoutePlace = {
  name: string
  lat: number
  lon: number
  formattedAddress?: string
}

type RouteSelectionStepProps = {
  origin: RoutePlace | null
  destination: RoutePlace | null
  onOriginSelected: (p: RoutePlace) => void
  onDestinationSelected: (p: RoutePlace) => void
  onClearOrigin: () => void
  onClearDestination: () => void
  routeOptions: RouteOption[] | null
  routeOptionsLoading: boolean
  routeOptionsError: string | null
  onRetryRoutes: () => void
  routeFallback: boolean
  onUseFallback: () => void
  selectedRouteId: string | null
  onRouteSelected: (id: string) => void
  onConfirm: () => void
  confirmLabel: string
  confirmDisabled?: boolean
}

type ActiveField = 'origin' | 'destination' | null

function formatDuration(tf: ReturnType<typeof useTranslations>, totalS: number): string {
  const hours = Math.floor(totalS / 3600)
  const minutes = Math.floor((totalS % 3600) / 60)
  if (hours > 0) return tf('routeOptionDuration', { hours, minutes })
  return tf('routeOptionDurationMinutes', { minutes })
}

/** Google Maps-like single-screen origin + destination selection with interactive map. */
export function RouteSelectionStep({
  origin,
  destination,
  onOriginSelected,
  onDestinationSelected,
  onClearOrigin,
  onClearDestination,
  routeOptions,
  routeOptionsLoading,
  routeOptionsError,
  onRetryRoutes,
  routeFallback,
  onUseFallback,
  selectedRouteId,
  onRouteSelected,
  onConfirm,
  confirmLabel,
  confirmDisabled,
}: RouteSelectionStepProps) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')

  const [activeField, setActiveField] = useState<ActiveField>(() => {
    if (!origin) return 'origin'
    if (!destination) return 'destination'
    return null
  })

  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const originMarkerRef = useRef<google.maps.Marker | null>(null)
  const destMarkerRef = useRef<google.maps.Marker | null>(null)
  const routeLinesRef = useRef<google.maps.Polyline[]>([])
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapError, setMapError] = useState(false)

  // Effect 1: Initialize map (mount only)
  useEffect(() => {
    if (!mapDivRef.current) return
    let cancelled = false
    async function init() {
      try {
        const mapsLib = await loadMapsLibrary()
        if (cancelled || !mapDivRef.current) return
        mapRef.current = new mapsLib.Map(mapDivRef.current, {
          center: { lat: 64.9, lng: -18.8 }, // Iceland center
          zoom: 6,
          mapTypeId: 'roadmap',
          gestureHandling: 'cooperative',
          zoomControl: true,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        })
        setMapLoaded(true)
      } catch {
        if (!cancelled) setMapError(true)
      }
    }
    init()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: Origin marker only
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return
    let cancelled = false
    if (originMarkerRef.current) {
      originMarkerRef.current.setMap(null)
      originMarkerRef.current = null
    }
    if (!origin) return
    loadMarkerLibrary().then(markerLib => {
      if (cancelled || !mapRef.current) return
      originMarkerRef.current = new markerLib.Marker({
        position: toLngLat(origin),
        map: mapRef.current!,
        label: { text: tf('originMarkerLabel'), color: '#fff', fontSize: '8px', fontWeight: 'bold' },
        icon: makeIcon('#2d5a27'),
        title: origin.name,
      })
    })
    return () => { cancelled = true }
  }, [origin?.lat, origin?.lon, mapLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 3: Destination marker only
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return
    let cancelled = false
    if (destMarkerRef.current) {
      destMarkerRef.current.setMap(null)
      destMarkerRef.current = null
    }
    if (!destination) return
    loadMarkerLibrary().then(markerLib => {
      if (cancelled || !mapRef.current) return
      destMarkerRef.current = new markerLib.Marker({
        position: toLngLat(destination),
        map: mapRef.current!,
        label: { text: tf('destinationMarkerLabel'), color: '#fff', fontSize: '8px', fontWeight: 'bold' },
        icon: makeIcon('#4A90E2'),
        title: destination.name,
      })
    })
    return () => { cancelled = true }
  }, [destination?.lat, destination?.lon, mapLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 4a: Draw all route polylines (or fallback straight line) and fit bounds.
  // Does NOT depend on selectedRouteId — initial styles use selectedRouteId at closure time,
  // and Effect 4b handles style updates when selection changes without refitting the map.
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return

    // Clear all previous route lines
    routeLinesRef.current.forEach(l => l.setMap(null))
    routeLinesRef.current = []

    if (!origin && !destination) return

    let cancelled = false

    async function updateLines() {
      if (!mapRef.current) return
      const [mapsLib, coreLib] = await Promise.all([loadMapsLibrary(), loadCoreLibrary()])
      if (cancelled || !mapRef.current) return

      const bounds = new coreLib.LatLngBounds()

      if (routeOptions && routeOptions.length > 0) {
        // Draw all returned route polylines simultaneously
        routeOptions.forEach((ro, idx) => {
          const isSelected = ro.id === selectedRouteId
          const path = ro.points.map(p => ({ lat: p.lat, lng: p.lon }))
          const line = new mapsLib.Polyline({
            path,
            geodesic: true,
            strokeColor: isSelected ? '#4A90E2' : '#9CA3AF',
            strokeOpacity: isSelected ? 0.9 : 0.45,
            strokeWeight: isSelected ? 5 : 2,
            zIndex: isSelected ? 2 : 1,
            map: mapRef.current!,
          })
          routeLinesRef.current[idx] = line
          path.forEach(p => bounds.extend(p))
        })
      } else if (origin && destination) {
        // Fallback: thin straight line while routes are loading or unavailable
        const line = new mapsLib.Polyline({
          path: [toLngLat(origin), toLngLat(destination)],
          geodesic: true,
          strokeColor: '#4A90E2',
          strokeOpacity: 0.4,
          strokeWeight: 2,
          map: mapRef.current!,
        })
        routeLinesRef.current[0] = line
        bounds.extend(toLngLat(origin))
        bounds.extend(toLngLat(destination))
      }

      if (origin) bounds.extend(toLngLat(origin))
      if (destination) bounds.extend(toLngLat(destination))

      if (!bounds.isEmpty()) {
        if (origin && destination) {
          mapRef.current!.fitBounds(bounds, { top: 48, bottom: 48, left: 48, right: 48 })
        } else if (origin) {
          mapRef.current!.setCenter(toLngLat(origin))
          mapRef.current!.setZoom(10)
        } else if (destination) {
          mapRef.current!.setCenter(toLngLat(destination))
          mapRef.current!.setZoom(10)
        }
      }
    }

    updateLines()
    return () => { cancelled = true }
  }, [origin?.lat, origin?.lon, destination?.lat, destination?.lon, routeOptions, mapLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 4b: Update polyline styles when selection changes — no refit, no redraw.
  useEffect(() => {
    if (!mapLoaded || !routeOptions || routeLinesRef.current.length === 0) return
    routeOptions.forEach((ro, idx) => {
      const line = routeLinesRef.current[idx]
      if (!line) return
      const isSelected = ro.id === selectedRouteId
      line.setOptions({
        strokeColor: isSelected ? '#4A90E2' : '#9CA3AF',
        strokeOpacity: isSelected ? 0.9 : 0.45,
        strokeWeight: isSelected ? 5 : 2,
        zIndex: isSelected ? 2 : 1,
      })
    })
  }, [selectedRouteId, routeOptions, mapLoaded])

  function handleOriginSelected(p: PlaceResult) {
    onOriginSelected({ name: p.name, lat: p.lat, lon: p.lon, formattedAddress: p.formattedAddress })
    setActiveField('destination')
  }

  function handleDestinationSelected(p: PlaceResult) {
    onDestinationSelected({ name: p.name, lat: p.lat, lon: p.lon, formattedAddress: p.formattedAddress })
    setActiveField(null)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Origin field */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#2d5a27] shrink-0" aria-hidden />
          <span className="text-xs font-medium text-foreground">{tf('originLabel')}</span>
        </div>
        {origin && activeField !== 'origin' ? (
          <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin size={13} className="text-muted-foreground shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm text-foreground font-medium truncate">{origin.name}</p>
                {origin.formattedAddress && origin.formattedAddress !== origin.name && (
                  <p className="text-xs text-muted-foreground truncate">{origin.formattedAddress}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => { onClearOrigin(); setActiveField('origin') }}
              className="ml-3 shrink-0 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              aria-label={tf('changeOrigin')}
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        ) : (
          <PlaceSearch
            onPlaceSelected={handleOriginSelected}
            autoFocus={activeField === 'origin'}
            placeholder={tf('routeSelectOriginPrompt')}
          />
        )}
      </div>

      {/* Destination field */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#4A90E2] shrink-0" aria-hidden />
          <span className="text-xs font-medium text-foreground">{tf('destinationLabel')}</span>
        </div>
        {destination && activeField !== 'destination' ? (
          <div className="flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin size={13} className="text-muted-foreground shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm text-foreground font-medium truncate">{destination.name}</p>
                {destination.formattedAddress && destination.formattedAddress !== destination.name && (
                  <p className="text-xs text-muted-foreground truncate">{destination.formattedAddress}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => { onClearDestination(); setActiveField('destination') }}
              className="ml-3 shrink-0 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              aria-label={tf('changeDestination')}
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        ) : (
          <PlaceSearch
            onPlaceSelected={handleDestinationSelected}
            autoFocus={activeField === 'destination'}
            placeholder={tf('routeSelectDestinationPrompt')}
          />
        )}
      </div>

      {/* Interactive map */}
      <div className="relative overflow-hidden rounded-xl border border-border">
        <div ref={mapDivRef} className="h-[220px] sm:h-[280px] w-full" />
        {!mapLoaded && !mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/40">
            <p className="text-xs text-muted-foreground">{tf('interactiveMapLoading')}</p>
          </div>
        )}
        {mapError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/20 p-4">
            <p className="text-xs text-muted-foreground text-center">{tf('routeMapUnavailable')}</p>
          </div>
        )}
      </div>

      {/* Route options — shown once both origin and destination are selected */}
      {origin && destination && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">{tf('routeOptionsTitle')}</p>

          {routeOptionsLoading && (
            <p className="text-xs text-muted-foreground py-2">{tf('routeOptionsLoading')}</p>
          )}

          {routeOptionsError && !routeOptionsLoading && !routeFallback && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-destructive">{routeOptionsError}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onRetryRoutes}
                  className="text-xs text-primary underline underline-offset-2 hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  {tf('routeOptionsRetry')}
                </button>
                <button
                  type="button"
                  onClick={onUseFallback}
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  {tf('routeOptionsFallback')}
                </button>
              </div>
            </div>
          )}
          {routeFallback && (
            <p className="text-xs text-muted-foreground py-1">{tf('routeOptionsFallbackNote')}</p>
          )}

          {routeOptions && routeOptions.map((ro, idx) => {
            const isSelected = ro.id === selectedRouteId
            const label = idx === 0
              ? tf('routeOptionShortest')
              : ro.isDefault
                ? tf('routeOptionDefault')
                : tf('routeOptionOther')
            const km = (ro.distanceM / 1000).toFixed(0)
            const duration = formatDuration(tf, ro.durationS)
            return (
              <button
                key={ro.id}
                type="button"
                onClick={() => onRouteSelected(ro.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors min-h-[52px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-primary/40'
                }`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                    {label}
                  </span>
                  <span className="text-xs text-muted-foreground">{km} km</span>
                </div>
                <span className={`text-sm font-semibold shrink-0 ml-3 ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                  {duration}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Confirm button */}
      {origin && destination && (
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      )}
    </div>
  )
}

function makeIcon(color: string): google.maps.Symbol {
  return {
    path: 0 as google.maps.SymbolPath, // CIRCLE
    scale: 9,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
  }
}
