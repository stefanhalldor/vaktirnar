// Provider-agnostic types for map/geocoding adapters.
// Designed for Mapbox to be added later without touching consuming code.

export type PlaceCandidate = {
  placeId: string
  displayName: string
  formattedAddress: string
  lat: number
  lon: number
}

export type RouteGeometry = {
  points: Array<{ lat: number; lon: number }>
  distanceM: number
  durationS: number
}

export type RouteOption = RouteGeometry & {
  id: string
  routeIndex: number
  provider: 'google' | 'mapbox'
  labels: string[]
  isDefault: boolean
  description?: string
}

export type StaticMapParams = {
  lat: number
  lon: number
  zoom?: number
  width?: number
  height?: number
}

export type WeatherMapProvider = {
  geocodePlace(query: string): Promise<PlaceCandidate[]>
  getRouteGeometry(from: PlaceCandidate, to: PlaceCandidate): Promise<RouteGeometry | null>
  getRouteOptions(from: PlaceCandidate, to: PlaceCandidate): Promise<RouteOption[]>
  staticMapUrl(params: StaticMapParams): string
}
