'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PlaceSearch, type PlaceResult } from './PlaceSearch'
import { loadMapsLibrary, loadMarkerLibrary, loadCoreLibrary } from '@/lib/weather/googleMaps.client'
import { toLngLat } from './travelAuditMap.helpers'

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
  onConfirm: () => void
  confirmLabel: string
  confirmDisabled?: boolean
}

type ActiveField = 'origin' | 'destination' | null

/** Google Maps-like single-screen origin + destination selection with interactive map. */
export function RouteSelectionStep({
  origin,
  destination,
  onOriginSelected,
  onDestinationSelected,
  onClearOrigin,
  onClearDestination,
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
  const routeLineRef = useRef<google.maps.Polyline | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

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
        // Map fails gracefully; mapLoaded stays false
      }
    }
    init()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Effect 2: Origin marker only — not responsible for route line
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

  // Effect 3: Destination marker only — not responsible for route line
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

  // Effect 4: Route line + map bounds — always in sync with BOTH origin and destination.
  // Clearing and redrawing here (not in effects 2/3) ensures the line is never stale when
  // only one of the two points changes.
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return

    // Always remove the old route line first
    if (routeLineRef.current) {
      routeLineRef.current.setMap(null)
      routeLineRef.current = null
    }

    if (!origin && !destination) return

    let cancelled = false

    async function updateLineAndBounds() {
      if (!mapRef.current) return

      if (origin && destination) {
        const [mapsLib, coreLib] = await Promise.all([loadMapsLibrary(), loadCoreLibrary()])
        if (cancelled || !mapRef.current) return
        routeLineRef.current = new mapsLib.Polyline({
          path: [toLngLat(origin), toLngLat(destination)],
          geodesic: true,
          strokeColor: '#4A90E2',
          strokeOpacity: 0.7,
          strokeWeight: 3,
          map: mapRef.current,
        })
        const bounds = new coreLib.LatLngBounds()
        bounds.extend(toLngLat(origin))
        bounds.extend(toLngLat(destination))
        mapRef.current.fitBounds(bounds, { top: 48, bottom: 48, left: 48, right: 48 })
      } else if (origin) {
        if (cancelled) return
        mapRef.current.setCenter(toLngLat(origin))
        mapRef.current.setZoom(10)
      } else if (destination) {
        if (cancelled) return
        mapRef.current.setCenter(toLngLat(destination))
        mapRef.current.setZoom(10)
      }
    }

    updateLineAndBounds()
    return () => { cancelled = true }
  }, [origin?.lat, origin?.lon, destination?.lat, destination?.lon, mapLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

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
        {!mapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/40">
            <p className="text-xs text-muted-foreground">{tf('interactiveMapLoading')}</p>
          </div>
        )}
      </div>

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
