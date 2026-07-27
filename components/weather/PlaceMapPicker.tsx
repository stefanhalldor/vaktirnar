'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { Check, MapPin, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { PlaceResult } from './PlaceSearch'
import {
  DRIVE_MAP_CARTO_ATTRIBUTION,
  DRIVE_MAP_CARTO_TILES,
} from './DriveRouteMap'
import {
  CurrentLocationError,
  getLocationFromCoordinates,
} from '@/lib/places/currentLocation.client'

type PlaceMapPickerProps = {
  places: readonly PlaceResult[]
  onSelect: (place: PlaceResult) => void
  onClose: () => void
}

type ResultMarker = {
  key: string
  element: HTMLButtonElement
  marker: import('maplibre-gl').Marker
}

function placeKey(place: PlaceResult): string {
  return place.id ?? `${place.source}:${place.lat.toFixed(6)}:${place.lon.toFixed(6)}`
}

function placeLabel(place: PlaceResult): string {
  return place.formattedAddress && place.formattedAddress !== place.name
    ? `${place.name}, ${place.formattedAddress}`
    : place.name
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

export function PlaceMapPicker({ places, onSelect, onClose }: PlaceMapPickerProps) {
  const t = useTranslations('teskeid.vedrid.placeSearch')
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('maplibre-gl').Map | null>(null)
  const maplibreRef = useRef<typeof import('maplibre-gl') | null>(null)
  const resultMarkersRef = useRef<ResultMarker[]>([])
  const pickedMarkerRef = useRef<import('maplibre-gl').Marker | null>(null)
  const reverseAbortRef = useRef<AbortController | null>(null)
  const mapClickRef = useRef<(lat: number, lon: number) => void>(() => {})
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([])
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState(false)
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null)
  const [resolvingPoint, setResolvingPoint] = useState(false)
  const [pointError, setPointError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let map: import('maplibre-gl').Map | null = null
    let resizeObserver: ResizeObserver | null = null

    void (async () => {
      try {
        const maplibregl = await import('maplibre-gl')
        if (cancelled || !mapDivRef.current) return
        maplibreRef.current = maplibregl
        map = new maplibregl.Map({
          container: mapDivRef.current,
          style: {
            version: 8,
            sources: {
              'place-picker-basemap': {
                type: 'raster',
                tiles: DRIVE_MAP_CARTO_TILES,
                tileSize: 256,
                attribution: DRIVE_MAP_CARTO_ATTRIBUTION,
              },
            },
            layers: [{
              id: 'place-picker-basemap',
              type: 'raster',
              source: 'place-picker-basemap',
            }],
          },
          center: [-18.8, 64.9],
          zoom: 5.3,
          attributionControl: false,
        })
        mapRef.current = map
        map.addControl(
          new maplibregl.AttributionControl({ compact: true }),
          'bottom-left',
        )
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
        map.on('click', event => {
          mapClickRef.current(event.lngLat.lat, event.lngLat.lng)
        })
        map.on('error', () => {
          // Search results and confirmation remain usable if a raster tile fails.
        })
        setMapReady(true)

        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => map?.resize())
          resizeObserver.observe(mapDivRef.current)
        }
      } catch {
        if (!cancelled) setMapError(true)
      }
    })()

    return () => {
      cancelled = true
      reverseAbortRef.current?.abort()
      resizeObserver?.disconnect()
      resultMarkersRef.current.forEach(item => item.marker.remove())
      resultMarkersRef.current = []
      pickedMarkerRef.current?.remove()
      pickedMarkerRef.current = null
      map?.remove()
      if (mapRef.current === map) mapRef.current = null
      maplibreRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const maplibregl = maplibreRef.current
    if (!mapReady || !map || !maplibregl) return

    resultMarkersRef.current.forEach(item => item.marker.remove())
    resultMarkersRef.current = []
    const finitePlaces = places.filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lon))

    resultMarkersRef.current = finitePlaces.map((place, index) => {
      const key = placeKey(place)
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'flex size-10 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      element.setAttribute('aria-label', placeLabel(place))
      element.setAttribute('aria-pressed', 'false')
      const pin = document.createElement('span')
      pin.className = 'flex size-7 items-center justify-center rounded-full border-[3px] border-white bg-primary text-xs font-bold text-primary-foreground shadow-md'
      pin.textContent = finitePlaces.length <= 9 ? String(index + 1) : '•'
      element.appendChild(pin)
      element.addEventListener('click', event => {
        event.stopPropagation()
        selectCandidate(place, index)
      })
      return {
        key,
        element,
        marker: new maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat([place.lon, place.lat])
          .addTo(map),
      }
    })

    if (finitePlaces.length === 1) {
      map.jumpTo({ center: [finitePlaces[0].lon, finitePlaces[0].lat], zoom: 13 })
    } else if (finitePlaces.length > 1) {
      const bounds = new maplibregl.LngLatBounds()
      finitePlaces.forEach(place => bounds.extend([place.lon, place.lat]))
      map.fitBounds(bounds, {
        padding: { top: 54, right: 42, bottom: 54, left: 42 },
        duration: 0,
        maxZoom: 13,
      })
    }

    return () => {
      resultMarkersRef.current.forEach(item => item.marker.remove())
      resultMarkersRef.current = []
    }
  }, [mapReady, places])

  useEffect(() => {
    const selectedKey = selectedPlace ? placeKey(selectedPlace) : null
    resultMarkersRef.current.forEach(item => {
      const active = item.key === selectedKey
      item.element.setAttribute('aria-pressed', String(active))
      const pin = item.element.firstElementChild as HTMLElement | null
      pin?.classList.toggle('ring-4', active)
      pin?.classList.toggle('ring-primary/30', active)
    })
  }, [selectedPlace])

  function selectCandidate(place: PlaceResult, index: number) {
    reverseAbortRef.current?.abort()
    setResolvingPoint(false)
    setPointError(null)
    pickedMarkerRef.current?.remove()
    pickedMarkerRef.current = null
    setSelectedPlace(place)
    mapRef.current?.easeTo({
      center: [place.lon, place.lat],
      duration: prefersReducedMotion() ? 0 : 280,
    })
    rowRefs.current[index]?.scrollIntoView({
      block: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }

  function showPickedMarker(lat: number, lon: number) {
    const map = mapRef.current
    const maplibregl = maplibreRef.current
    if (!map || !maplibregl) return
    pickedMarkerRef.current?.remove()
    const element = document.createElement('div')
    element.className = 'size-5 rounded-full border-[3px] border-white bg-blue-600 shadow-md'
    element.setAttribute('role', 'img')
    element.setAttribute('aria-label', t('mapPickerSelectedPoint'))
    pickedMarkerRef.current = new maplibregl.Marker({ element, anchor: 'center' })
      .setLngLat([lon, lat])
      .addTo(map)
  }

  async function selectMapPoint(lat: number, lon: number) {
    reverseAbortRef.current?.abort()
    const controller = new AbortController()
    reverseAbortRef.current = controller
    setResolvingPoint(true)
    setPointError(null)
    setSelectedPlace(null)
    showPickedMarker(lat, lon)

    try {
      const place = await getLocationFromCoordinates(lat, lon, {
        fallbackName: t('mapPickerSelectedPoint'),
        formatNearbyLabel: nearby => t('currentLocationNear', { place: nearby }),
        signal: controller.signal,
      })
      if (!controller.signal.aborted) setSelectedPlace(place)
    } catch (error) {
      if (controller.signal.aborted) return
      pickedMarkerRef.current?.remove()
      pickedMarkerRef.current = null
      setPointError(
        error instanceof CurrentLocationError && error.code === 'outside_iceland'
          ? t('mapPickerOutsideIceland')
          : t('mapPickerPointError'),
      )
    } finally {
      if (!controller.signal.aborted) setResolvingPoint(false)
    }
  }

  mapClickRef.current = (lat, lon) => {
    void selectMapPoint(lat, lon)
  }

  const selectedKey = selectedPlace ? placeKey(selectedPlace) : null

  return (
    <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[359] bg-black/45" />
        <Dialog.Content
          aria-describedby="place-map-picker-hint"
          className="fixed inset-0 z-[360] flex max-h-[100dvh] w-full flex-col overflow-hidden bg-background outline-none sm:inset-4 sm:m-auto sm:max-h-[760px] sm:max-w-xl sm:rounded-xl sm:border sm:border-border sm:shadow-xl"
          onOpenAutoFocus={event => {
            event.preventDefault()
            closeButtonRef.current?.focus()
          }}
        >
          <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-3 pt-[env(safe-area-inset-top)]">
            <Dialog.Title className="min-w-0 flex-1 truncate text-sm font-semibold">
              {t('mapPickerTitle')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label={t('mapPickerClose')}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={18} aria-hidden />
              </button>
            </Dialog.Close>
          </header>

          <div className="relative min-h-[38dvh] flex-1" role="region" aria-label={t('mapPickerMapAriaLabel')}>
            <div ref={mapDivRef} className="h-full w-full" />
            {!mapReady && !mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
                <p role="status" className="text-sm text-muted-foreground">{t('mapPickerLoading')}</p>
              </div>
            )}
            {mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/30 px-5">
                <p role="alert" className="text-center text-sm text-muted-foreground">
                  {t('mapPickerUnavailable')}
                </p>
              </div>
            )}
          </div>

          <section className="max-h-[46dvh] shrink-0 overflow-y-auto border-t border-border bg-background px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.10)]">
            <Dialog.Description id="place-map-picker-hint" className="mb-2 text-xs text-muted-foreground">
              {places.length > 0
                ? t('mapPickerResultsHint', { count: places.length })
                : t('mapPickerEmptyHint')}
            </Dialog.Description>

            {places.length > 0 && (
              <ul className="mb-3 flex max-h-32 flex-col overflow-y-auto rounded-lg border border-border">
                {places.map((place, index) => {
                  const active = selectedKey === placeKey(place)
                  return (
                    <li key={placeKey(place)}>
                      <button
                        ref={element => { rowRefs.current[index] = element }}
                        type="button"
                        onClick={() => selectCandidate(place, index)}
                        aria-pressed={active}
                        className={`flex min-h-11 w-full items-start gap-2 border-b border-border px-3 py-2 text-left last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active ? 'bg-primary/5' : 'bg-background'}`}
                      >
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{place.name}</span>
                          {place.formattedAddress && place.formattedAddress !== place.name && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {place.formattedAddress}
                            </span>
                          )}
                        </span>
                        {active && <Check size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {resolvingPoint && (
              <p role="status" className="mb-3 text-xs text-muted-foreground">
                {t('mapPickerResolving')}
              </p>
            )}
            {pointError && <p role="alert" className="mb-3 text-xs text-destructive">{pointError}</p>}

            {selectedPlace && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
                <MapPin size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selectedPlace.name}</p>
                  {selectedPlace.formattedAddress && selectedPlace.formattedAddress !== selectedPlace.name && (
                    <p className="truncate text-xs text-muted-foreground">
                      {selectedPlace.formattedAddress}
                    </p>
                  )}
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={!selectedPlace || resolvingPoint}
              onClick={() => selectedPlace && onSelect(selectedPlace)}
              className="flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('mapPickerConfirm')}
            </button>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
