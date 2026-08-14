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
  /**
   * Dense route geometry for fixed-provider (Veðurstofan, Vegagerðin) station matching.
   * Derived from the full pre-sampling polyline via RDP simplification.
   * Consumers should prefer this over `points` when matching fixed provider stations.
   * Falls back to `points` when absent (e.g. tests, legacy data).
   */
  providerMatchingPoints?: Array<{ lat: number; lon: number }>
  distanceM: number
  durationS: number
}

export type RouteCautionSeverity = 'info' | 'caution' | 'warning'

export type RouteCautionVehicle = 'trailer' | 'caravan' | 'camper' | 'all'

export type RouteCautionResult = {
  id: string
  severity: RouteCautionSeverity
  labelKey: string
  /** Short descriptive text shown below the chip in route selection. */
  summaryKey?: string
  detailKey?: string
  appliesTo: RouteCautionVehicle[]
}

export type RouteOption = RouteGeometry & {
  id: string
  routeIndex: number
  provider: 'google' | 'mapbox' | 'teskeid'
  labels: string[]
  isDefault: boolean
  description?: string
  cautions?: RouteCautionResult[]
  /** Present only for the flag-gated Teskeið road-graph candidate. */
  experimental?: {
    derivedDuration: true
    surface: {
      pavedM: number
      gravelM: number
      mixedM: number
      unknownM: number
    }
    fRoad?: {
      distanceM: number
      roadNumbers: string[]
    }
  }
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
  staticMapUrl(params: StaticMapParams): string
}

/**
 * Historical adapter shape retained only for isolated provider parity tests.
 * Product code must depend on WeatherMapProvider and Teskeið route discovery.
 */
export type LegacyWeatherRoutingProvider = WeatherMapProvider & {
  getRouteGeometry(from: PlaceCandidate, to: PlaceCandidate): Promise<RouteGeometry | null>
  getRouteOptions(from: PlaceCandidate, to: PlaceCandidate): Promise<RouteOption[]>
}
