export type GoogleMapsDirectionsPoint = Readonly<{
  lat: number
  lon: number
}>

export type GoogleMapsDirectionsUrlInput = Readonly<{
  origin: GoogleMapsDirectionsPoint
  destination: GoogleMapsDirectionsPoint
}>

const GOOGLE_MAPS_DIRECTIONS_URL = 'https://www.google.com/maps/dir/'

function isValidPoint(point: GoogleMapsDirectionsPoint): boolean {
  return Number.isFinite(point.lat)
    && Number.isFinite(point.lon)
    && point.lat >= -90
    && point.lat <= 90
    && point.lon >= -180
    && point.lon <= 180
}

function exactCoordinate(point: GoogleMapsDirectionsPoint): string {
  return `${point.lat},${point.lon}`
}

/**
 * Builds a keyless Google Maps URL without contacting Google or loading its SDK.
 * Coordinates are passed through without rounding so the handoff uses the exact
 * route boundary and destination selected by Teskeið.
 */
export function buildGoogleMapsDirectionsUrl(
  input: GoogleMapsDirectionsUrlInput,
): string | null {
  if (!isValidPoint(input.origin) || !isValidPoint(input.destination)) return null

  const url = new URL(GOOGLE_MAPS_DIRECTIONS_URL)
  url.searchParams.set('api', '1')
  url.searchParams.set('origin', exactCoordinate(input.origin))
  url.searchParams.set('destination', exactCoordinate(input.destination))
  url.searchParams.set('travelmode', 'driving')
  url.searchParams.set('dir_action', 'navigate')
  return url.toString()
}
