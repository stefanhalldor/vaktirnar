import 'server-only'

import type {
  PlaceCandidate,
  StaticMapParams,
  WeatherMapProvider,
} from './provider.types'

type GeoResponse = {
  status: string
  results: Array<{
    place_id: string
    formatted_address: string
    address_components: Array<{ long_name: string }>
    geometry: { location: { lat: number; lng: number } }
  }>
}

async function geocodePlace(query: string): Promise<PlaceCandidate[]> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY
  if (!key) throw new Error('GOOGLE_MAPS_SERVER_KEY not set')

  const url = 'https://maps.googleapis.com/maps/api/geocode/json'
    + `?address=${encodeURIComponent(query)}&region=is&language=is&key=${key}`
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Geocoding API HTTP ${response.status}`)

  const data = await response.json() as GeoResponse
  if (data.status === 'ZERO_RESULTS') return []
  if (data.status !== 'OK') throw new Error('google_geocode_upstream_status')
  return data.results.slice(0, 5).map(result => ({
    placeId: result.place_id,
    displayName: result.address_components[0]?.long_name ?? result.formatted_address,
    formattedAddress: result.formatted_address,
    lat: result.geometry.location.lat,
    lon: result.geometry.location.lng,
  }))
}

function staticMapUrl(params: StaticMapParams): string {
  const { lat, lon, zoom = 12, width = 600, height = 300 } = params
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
  if (!key) throw new Error('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY not set')

  const center = `${lat},${lon}`
  const marker = `color:red|label:•|${lat},${lon}`
  return 'https://maps.googleapis.com/maps/api/staticmap'
    + `?center=${encodeURIComponent(center)}`
    + `&zoom=${zoom}`
    + `&size=${width}x${height}`
    + `&markers=${encodeURIComponent(marker)}`
    + `&key=${key}`
}

/** Google is retained for places/static imagery only; routing is Teskeið-owned. */
export const googlePlacesProvider: WeatherMapProvider = {
  geocodePlace,
  staticMapUrl,
}
