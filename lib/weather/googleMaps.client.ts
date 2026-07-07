// Browser-only helper for loading the Google Maps JavaScript API.
// Must only be imported from 'use client' components.
// Uses v2 functional API: setOptions() + importLibrary() (not new Loader()).

import { setOptions, importLibrary } from '@googlemaps/js-api-loader'

let initialized = false

function ensureInitialized(): void {
  if (typeof window === 'undefined') {
    throw new Error('googleMaps.client.ts must only be used in browser context')
  }
  if (!initialized) {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? ''
    if (!key) throw new Error('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY not set')
    setOptions({ key, language: 'is', region: 'IS' })
    initialized = true
  }
}

/**
 * Load the Places library using importLibrary (v2-style).
 * Returns the PlacesLibrary — call on demand, not at module load time.
 */
export async function loadPlacesLibrary(): Promise<google.maps.PlacesLibrary> {
  ensureInitialized()
  return importLibrary('places')
}

/**
 * Load the Maps library.
 * Returns the MapsLibrary (Map, Polyline, etc.).
 */
export async function loadMapsLibrary(): Promise<google.maps.MapsLibrary> {
  ensureInitialized()
  return importLibrary('maps') as Promise<google.maps.MapsLibrary>
}

/**
 * Load the Marker library.
 * Returns the MarkerLibrary (Marker, AdvancedMarkerElement, PinElement, ...).
 */
export async function loadMarkerLibrary(): Promise<google.maps.MarkerLibrary> {
  ensureInitialized()
  return importLibrary('marker') as Promise<google.maps.MarkerLibrary>
}

/**
 * Load the Core library.
 * Returns the CoreLibrary (LatLng, LatLngBounds, etc.).
 */
export async function loadCoreLibrary(): Promise<google.maps.CoreLibrary> {
  ensureInitialized()
  return importLibrary('core') as Promise<google.maps.CoreLibrary>
}
