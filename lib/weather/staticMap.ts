/**
 * Returns a Google Static Maps URL for the given coordinates.
 * Uses NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY — safe for the client bundle.
 * Returns null if the key is not configured.
 *
 * The Static Maps API must be enabled on the browser key for the URL to load.
 */
export function getStaticMapUrl(lat: number, lon: number): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
  if (!key) return null
  const coords = `${lat},${lon}`
  const params = new URLSearchParams({
    center: coords,
    zoom: '13',
    size: '600x300',
    markers: `color:red|${coords}`,
    key,
  })
  return `https://maps.googleapis.com/maps/api/staticmap?${params}`
}
