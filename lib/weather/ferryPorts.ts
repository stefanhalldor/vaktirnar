import { validateIcelandicCoords } from './coords'

export type FerryPortId = 'landeyjahofn' | 'thorlakshofn'

export const VESTMANNAEYJAR_BBOX = {
  minLat: 63.30,
  maxLat: 63.50,
  minLon: -20.45,
  maxLon: -20.05,
}

export type FerryPort = {
  id: FerryPortId
  lat: number
  lon: number
  name: string
}

// Coordinates for each Herjólfur terminal.
// Landeyjahöfn: 63°33′N 20°04′W — southern ferry terminal.
// Þorlákshöfn: 63°51′N 21°22′W — western ferry terminal.
export const FERRY_PORTS: Record<FerryPortId, FerryPort> = {
  landeyjahofn: { id: 'landeyjahofn', lat: 63.557, lon: -20.064, name: 'Landeyjahöfn' },
  thorlakshofn: { id: 'thorlakshofn', lat: 63.848, lon: -21.363, name: 'Þorlákshöfn' },
}

// Runtime sanity guard — called by tests.
export function ferryPortsAreValid(): boolean {
  return Object.values(FERRY_PORTS).every(p => validateIcelandicCoords(p.lat, p.lon))
}

/**
 * Returns true if the given place is in Vestmannaeyjar / Heimaey.
 *
 * Detection is coordinate-based only. Geocoded places always carry lat/lon,
 * so text-based detection is not needed and would cause false positives for
 * mainland businesses/hotels with "Vestmannaeyjar" in their name.
 */
export function isVestmannaeyjarDestination(place: {
  lat: number
  lon: number
  name?: string
  formattedAddress?: string
}): boolean {
  const { lat, lon } = place
  return (
    lat >= VESTMANNAEYJAR_BBOX.minLat &&
    lat <= VESTMANNAEYJAR_BBOX.maxLat &&
    lon >= VESTMANNAEYJAR_BBOX.minLon &&
    lon <= VESTMANNAEYJAR_BBOX.maxLon
  )
}
