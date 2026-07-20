'use client'

import { useEffect, useRef, useState } from 'react'
import type { ProviderMapLayer, ProviderMapMarkerTone, ProviderMapMarkerCallout, SelectedProviderMarker } from '@/lib/weather/types'
import {
  loadMapsLibrary,
  loadMarkerLibrary,
  loadCoreLibrary,
} from '@/lib/weather/googleMaps.client'

const TONE_COLOR: Record<ProviderMapMarkerTone, string> = {
  ok:          '#16a34a',
  warning:     '#d97706',
  danger:      '#dc2626',
  muted:       '#9ca3af',
  unavailable: '#9ca3af',
}

const TONE_ZINDEX: Record<ProviderMapMarkerTone, number> = {
  ok:          10,
  warning:     9,
  danger:      11,
  muted:       8,
  unavailable: 8,
}

function makeMarkerIcon(tone: ProviderMapMarkerTone, selected: boolean, colorOverride?: string): google.maps.Symbol {
  return {
    path: 0 as google.maps.SymbolPath, // CIRCLE
    scale: selected ? 11 : 8,
    fillColor: colorOverride ?? TONE_COLOR[tone],
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: selected ? 3 : 2,
  }
}

function markerTitle(label: string, statusLabel?: string): string {
  return statusLabel ? `${label} (${statusLabel})` : label
}

interface IcelandOverviewMapProps {
  layers: ProviderMapLayer[]
  selected: SelectedProviderMarker | null
  onSelect: (s: SelectedProviderMarker | null) => void
  loadingLabel?: string
  errorLabel?: string
  /** Tailwind classes for the map container div. */
  className?: string
  /**
   * When provided, an InfoWindow is shown anchored to the currently selected marker.
   * The callout is identified by layerId + markerId so the map can anchor it correctly.
   * When null or undefined, any open InfoWindow is closed.
   */
  selectedCallout?: ProviderMapMarkerCallout | null
}

/**
 * Reusable Iceland-wide Google Maps overview component.
 *
 * Accepts one or more provider layers. Each layer provides markers with
 * display-ready `tone` values. The parent controls which markers appear by
 * setting `visible: false` on filtered-out markers (the component does not
 * filter internally). Markers whose keys are no longer present in `layers`
 * are hidden automatically.
 *
 * The map initializes once on mount. Markers are reconciled on every `layers`
 * change: new markers are created, existing markers are updated, and markers
 * removed from `layers` are hidden. Bounds are refit whenever new markers are
 * added to the registry.
 *
 * Selection state is managed by the parent. The map calls `onSelect` when a
 * marker is clicked. Toggle (deselect by clicking again) is the parent's
 * responsibility.
 */
export function IcelandOverviewMap({
  layers,
  selected,
  onSelect,
  loadingLabel = 'Hleður kort...',
  errorLabel = 'Kort ekki tiltækt',
  className = 'h-[280px] sm:h-[360px] w-full',
  selectedCallout,
}: IcelandOverviewMapProps) {
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markerLibRef = useRef<google.maps.MarkerLibrary | null>(null)
  const coreLibRef = useRef<google.maps.CoreLibrary | null>(null)
  // Registry keyed by `${layerId}:${markerId}`
  const markerRegistryRef = useRef<Map<string, google.maps.Marker>>(new Map())
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState(false)
  const [latestNote, setLatestNote] = useState<string | null>(null)

  // Always-fresh ref so click listeners never have stale closures
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // Initialize the Google Maps instance once on mount.
  // Markers are NOT created here — they are created in the reconciliation effect
  // so that layers arriving after mount are handled the same way.
  useEffect(() => {
    let cancelled = false

    async function init() {
      if (!mapDivRef.current) return
      try {
        const [mapsLib, markerLib, coreLib] = await Promise.all([
          loadMapsLibrary(),
          loadMarkerLibrary(),
          loadCoreLibrary(),
        ])
        if (cancelled || !mapDivRef.current) return

        const map = new mapsLib.Map(mapDivRef.current, {
          center: { lat: 64.9, lng: -18.8 },
          zoom: 5,
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

        if (!cancelled) setMapReady(true)
      } catch {
        if (!cancelled) setMapError(true)
      }
    }

    init()

    return () => {
      cancelled = true
      markerRegistryRef.current.forEach(marker => marker.setMap(null))
      markerRegistryRef.current.clear()
      mapRef.current = null
    }
  }, [])

  // Reconcile markers whenever layers or selection changes.
  // - Creates markers that are new in `layers`.
  // - Updates visibility, icon, zIndex, and title for all existing markers.
  // - Hides markers whose keys are no longer in `layers`.
  // - Refits bounds when new markers are added.
  useEffect(() => {
    const map = mapRef.current
    const markerLib = markerLibRef.current
    if (!mapReady || !map || !markerLib) return

    // Compute the desired key set from current layers
    const desiredKeys = new Set<string>()
    for (const layer of layers) {
      for (const m of layer.markers) {
        desiredKeys.add(`${layer.layerId}:${m.id}`)
      }
    }

    // Create markers that are new (not yet in the registry)
    let newMarkersAdded = false
    for (const layer of layers) {
      for (const m of layer.markers) {
        const key = `${layer.layerId}:${m.id}`
        if (markerRegistryRef.current.has(key)) continue
        const isSelected = selected?.layerId === layer.layerId && selected?.markerId === m.id
        const marker = new markerLib.Marker({
          position: { lat: m.lat, lng: m.lon },
          map,
          icon: makeMarkerIcon(m.tone, isSelected, m.markerColor),
          title: markerTitle(m.label, m.statusLabel),
          visible: m.visible !== false,
          zIndex: isSelected ? 20 : TONE_ZINDEX[m.tone],
        })
        const capturedLayerId = layer.layerId
        const capturedMarkerId = m.id
        marker.addListener('click', () => {
          onSelectRef.current({ layerId: capturedLayerId, markerId: capturedMarkerId })
        })
        markerRegistryRef.current.set(key, marker)
        newMarkersAdded = true
      }
    }

    // Refit bounds when new markers were added.
    // Currently fits to ALL markers in layers (including visible:false).
    // For single-provider use (Veðurstofan) this is correct: we always want
    // the full Iceland overview on initial load.
    // TODO: before adding multi-provider show/hide layer toggles, decide
    // whether to fit only visible markers or add a `fitBoundsStrategy` prop.
    if (newMarkersAdded && coreLibRef.current) {
      const bounds = new coreLibRef.current.LatLngBounds()
      let hasPoints = false
      for (const layer of layers) {
        for (const m of layer.markers) {
          bounds.extend({ lat: m.lat, lng: m.lon })
          hasPoints = true
        }
      }
      if (hasPoints) map.fitBounds(bounds, { top: 32, bottom: 32, left: 32, right: 32 })
    }

    // Update all desired markers (handles visibility, icon, selection changes)
    for (const layer of layers) {
      for (const m of layer.markers) {
        const key = `${layer.layerId}:${m.id}`
        const marker = markerRegistryRef.current.get(key)
        if (!marker) continue
        const isSelected = selected?.layerId === layer.layerId && selected?.markerId === m.id
        marker.setVisible(m.visible !== false)
        marker.setIcon(makeMarkerIcon(m.tone, isSelected, m.markerColor))
        marker.setZIndex(isSelected ? 20 : TONE_ZINDEX[m.tone])
        marker.setTitle(markerTitle(m.label, m.statusLabel))
      }
    }

    // Hide registry markers whose keys are no longer in the desired set
    for (const [key, marker] of markerRegistryRef.current) {
      if (!desiredKeys.has(key)) {
        marker.setVisible(false)
      }
    }
  }, [layers, selected, mapReady])

  // Fetch the latest note from notePreviewUrl when the callout changes.
  // Clears on deselect. Uses msgs.at(-1) since preview returns oldest-first.
  useEffect(() => {
    setLatestNote(null)
    if (!selectedCallout?.notePreviewUrl) return
    let cancelled = false
    const ctrl = new AbortController()
    fetch(selectedCallout.notePreviewUrl, { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : [])
      .then((msgs: Array<{ body: string }>) => {
        if (!cancelled) setLatestNote(msgs.at(-1)?.body ?? null)
      })
      .catch(() => {
        if (!cancelled) setLatestNote(null)
      })
    return () => { cancelled = true; ctrl.abort() }
  }, [selectedCallout?.notePreviewUrl])

  // Manage InfoWindow for the selected marker callout.
  // Opens/updates when selectedCallout matches the selected marker; closes otherwise.
  // Rebuilds content when latestNote arrives.
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return

    if (!selectedCallout || !selected ||
        selectedCallout.layerId !== selected.layerId ||
        selectedCallout.markerId !== selected.markerId) {
      infoWindowRef.current?.close()
      return
    }

    const key = `${selectedCallout.layerId}:${selectedCallout.markerId}`
    const anchor = markerRegistryRef.current.get(key)
    if (!anchor || !anchor.getVisible()) {
      infoWindowRef.current?.close()
      return
    }

    // Build InfoWindow content using DOM nodes (no innerHTML with user content).
    const container = document.createElement('div')
    container.style.cssText = 'font-size:13px;max-width:200px;padding:2px 0'

    const nameEl = document.createElement('p')
    nameEl.style.cssText = 'font-weight:600;margin:0 0 4px'
    nameEl.textContent = selectedCallout.stationName
    container.appendChild(nameEl)

    if (selectedCallout.windMs !== null || selectedCallout.gustMs !== null) {
      const windEl = document.createElement('p')
      windEl.style.cssText = 'margin:0 0 4px;color:#555'
      const parts: string[] = []
      if (selectedCallout.windMs !== null) parts.push(`${selectedCallout.windMs} m/s`)
      if (selectedCallout.gustMs !== null) parts.push(`${selectedCallout.gustLabel} ${selectedCallout.gustMs} m/s`)
      windEl.textContent = parts.join(' · ')
      container.appendChild(windEl)
    }

    if (latestNote) {
      const noteEl = document.createElement('p')
      noteEl.style.cssText = 'margin:0 0 4px;color:#666;font-style:italic;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical'
      noteEl.textContent = latestNote
      container.appendChild(noteEl)
    }

    const linkEl = document.createElement('a')
    linkEl.href = selectedCallout.detailsHref
    const primaryHsl = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
    linkEl.style.color = primaryHsl ? `hsl(${primaryHsl})` : '#1a4a16'
    linkEl.style.textDecoration = 'underline'
    linkEl.textContent = selectedCallout.detailsLabel
    container.appendChild(linkEl)

    if (!infoWindowRef.current) {
      infoWindowRef.current = new google.maps.InfoWindow()
      infoWindowRef.current.addListener('closeclick', () => {
        onSelectRef.current(null)
      })
    }
    infoWindowRef.current.setContent(container)
    infoWindowRef.current.open({ map, anchor })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCallout, selected, mapReady, latestNote])

  return (
    <div className="relative overflow-hidden rounded-xl border border-border">
      <div ref={mapDivRef} className={className} />
      {!mapReady && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/40">
          <p className="text-xs text-muted-foreground">{loadingLabel}</p>
        </div>
      )}
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/40">
          <p className="text-xs text-muted-foreground">{errorLabel}</p>
        </div>
      )}
    </div>
  )
}
