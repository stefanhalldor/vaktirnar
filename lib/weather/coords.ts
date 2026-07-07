// Iceland bounding box with a small buffer.
// Covers the main island, Westfjords, and surrounding ocean zones.
const LAT_MIN = 63.0
const LAT_MAX = 67.0
const LON_MIN = -25.0
const LON_MAX = -12.0

export function validateIcelandicCoords(lat: number, lon: number): boolean {
  return (
    isFinite(lat) &&
    isFinite(lon) &&
    lat >= LAT_MIN &&
    lat <= LAT_MAX &&
    lon >= LON_MIN &&
    lon <= LON_MAX
  )
}
