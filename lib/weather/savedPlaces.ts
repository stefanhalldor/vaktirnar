/** Types and helpers for weather_saved_places. Client-safe — no server imports. */

export type SavedWeatherPlace = {
  id: string
  name: string
  formattedAddress: string
  lat: number
  lon: number
  usageCount: number
  lastUsedAt: string // ISO 8601
}

export type SavedWeatherPlaceInput = {
  name: string
  formattedAddress?: string
  lat: number
  lon: number
}

/** Coordinate-based dedupe key. Computed server-side; never trusted from client body. */
export function makeWeatherPlaceKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)}:${lon.toFixed(5)}`
}

/** Trim and length-clamp strings before sending to the DB. */
export function normalizeSavedPlaceInput(input: SavedWeatherPlaceInput): {
  name: string
  formattedAddress: string
} {
  return {
    name: input.name.trim().slice(0, 160),
    formattedAddress: (input.formattedAddress ?? '').trim().slice(0, 300),
  }
}

/** Convert a saved place row to a minimal RoutePlace-compatible object. */
export function savedPlaceToRoutePlace(p: SavedWeatherPlace): {
  name: string
  lat: number
  lon: number
  formattedAddress?: string
} {
  return {
    name: p.name,
    lat: p.lat,
    lon: p.lon,
    formattedAddress: p.formattedAddress || undefined,
  }
}
