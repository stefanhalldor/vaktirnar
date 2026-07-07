import 'server-only'
import type { PlaceCandidate, RouteGeometry, RouteOption, StaticMapParams, WeatherMapProvider } from './provider.types'

// Maximum sampled route points sent to met.no. Keeps API calls bounded.
const MAX_ROUTE_POINTS = 80

// ── Types for Google REST API responses ──────────────────────────────────────

type GeoResult = {
  place_id: string
  formatted_address: string
  address_components: Array<{ long_name: string; short_name: string; types: string[] }>
  geometry: { location: { lat: number; lng: number } }
}

type GeoResponse = {
  status: string
  results: GeoResult[]
}

type RoutesResponse = {
  routes?: Array<{
    polyline: {
      geoJsonLinestring: {
        coordinates: Array<[number, number]>  // [lon, lat]
      }
    }
    distanceMeters: number
    duration: string  // e.g. "1234s"
    routeLabels?: string[]  // e.g. ["DEFAULT_ROUTE"] or ["DEFAULT_ROUTE_ALTERNATE"]
  }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Downsample a route to at most maxPoints evenly spaced points.
 * Always includes the first and last points.
 */
function samplePoints(
  points: Array<{ lat: number; lon: number }>,
  maxPoints: number
): Array<{ lat: number; lon: number }> {
  if (points.length <= maxPoints) return points
  const step = Math.ceil(points.length / maxPoints)
  const sampled: typeof points = []
  for (let i = 0; i < points.length; i += step) {
    sampled.push(points[i])
  }
  // Always include the last point. If the cap is full, replace the last sampled
  // non-endpoint with the actual last point so the destination is never dropped.
  const last = points[points.length - 1]
  if (sampled[sampled.length - 1] !== last) {
    if (sampled.length < maxPoints) {
      sampled.push(last)
    } else {
      sampled[sampled.length - 1] = last
    }
  }
  return sampled
}

// ── Provider implementation ───────────────────────────────────────────────────

async function geocodePlace(query: string): Promise<PlaceCandidate[]> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY
  if (!key) throw new Error('GOOGLE_MAPS_SERVER_KEY not set')

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(query)}&region=is&language=is&key=${key}`

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Geocoding API HTTP ${res.status}`)

  const data = (await res.json()) as GeoResponse
  if (data.status !== 'OK') return []

  return data.results.slice(0, 5).map((r) => ({
    placeId: r.place_id,
    displayName: r.address_components[0]?.long_name ?? r.formatted_address,
    formattedAddress: r.formatted_address,
    lat: r.geometry.location.lat,
    lon: r.geometry.location.lng,
  }))
}

async function getRouteGeometry(
  from: PlaceCandidate,
  to: PlaceCandidate
): Promise<RouteGeometry | null> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY
  if (!key) throw new Error('GOOGLE_MAPS_SERVER_KEY not set')

  const body = {
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lon } } },
    destination: { location: { latLng: { latitude: to.lat, longitude: to.lon } } },
    travelMode: 'DRIVE',
    polylineEncoding: 'GEO_JSON_LINESTRING',
  }

  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.polyline,routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  if (!res.ok) return null

  const data = (await res.json()) as RoutesResponse
  const route = data.routes?.[0]
  if (!route) return null

  const allPoints = route.polyline.geoJsonLinestring.coordinates.map(
    ([lon, lat]) => ({ lat, lon })
  )
  const points = samplePoints(allPoints, MAX_ROUTE_POINTS)

  return {
    points,
    distanceM: route.distanceMeters,
    durationS: parseInt(route.duration.replace('s', ''), 10),
  }
}

async function getRouteOptions(
  from: PlaceCandidate,
  to: PlaceCandidate
): Promise<RouteOption[]> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY
  if (!key) throw new Error('GOOGLE_MAPS_SERVER_KEY not set')

  const body = {
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lon } } },
    destination: { location: { latLng: { latitude: to.lat, longitude: to.lon } } },
    travelMode: 'DRIVE',
    polylineEncoding: 'GEO_JSON_LINESTRING',
    computeAlternativeRoutes: true,
  }

  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.polyline,routes.distanceMeters,routes.duration,routes.routeLabels',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  if (!res.ok) return []

  const data = (await res.json()) as RoutesResponse
  if (!data.routes || data.routes.length === 0) return []

  return data.routes.map((route, idx) => {
    const allPoints = route.polyline.geoJsonLinestring.coordinates.map(
      ([lon, lat]) => ({ lat, lon })
    )
    const points = samplePoints(allPoints, MAX_ROUTE_POINTS)
    const labels = route.routeLabels ?? []
    return {
      id: `google-${idx}`,
      routeIndex: idx,
      provider: 'google' as const,
      labels,
      isDefault: labels.includes('DEFAULT_ROUTE'),
      points,
      distanceM: route.distanceMeters,
      durationS: parseInt(route.duration.replace('s', ''), 10),
    }
  })
}

/**
 * Returns a Static Maps URL using the browser-restricted key.
 * Safe to include in API responses — the browser key has HTTP referrer restrictions.
 */
function staticMapUrl(params: StaticMapParams): string {
  const { lat, lon, zoom = 12, width = 600, height = 300 } = params
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
  if (!key) throw new Error('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY not set')

  const center = `${lat},${lon}`
  const marker = `color:red|label:•|${lat},${lon}`
  return (
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${encodeURIComponent(center)}` +
    `&zoom=${zoom}` +
    `&size=${width}x${height}` +
    `&markers=${encodeURIComponent(marker)}` +
    `&key=${key}`
  )
}

export const googleProvider: WeatherMapProvider = {
  geocodePlace,
  getRouteGeometry,
  getRouteOptions,
  staticMapUrl,
}
