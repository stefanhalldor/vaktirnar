// Client-side reverse geocoding via BFF (/api/place/reverse-geocode).
// The BFF calls Nominatim server-side with User-Agent, cache, and rate limiting.
// Attribution: © OpenStreetMap contributors (ODbL 1.0)

const cache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

/** Round to ~1 km grid for cache deduplication. */
function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`
}

/**
 * Returns a human-readable place name near the given coordinates, or null if
 * no useful name is found or the request fails.
 *
 * Results are cached in memory per session. In-flight deduplication prevents
 * duplicate concurrent requests for the same coordinate.
 */
export async function resolvePlaceLabel(lat: number, lon: number): Promise<string | null> {
  const key = cacheKey(lat, lon)
  if (cache.has(key)) return cache.get(key)!
  if (inflight.has(key)) return inflight.get(key)!

  const promise = (async () => {
    try {
      const res = await fetch(`/api/place/reverse-geocode?lat=${lat}&lon=${lon}`)
      if (!res.ok) { cache.set(key, null); return null }
      const data: { name: string | null } = await res.json()
      const name = data.name ?? null
      cache.set(key, name)
      return name
    } catch {
      cache.set(key, null)
      return null
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, promise)
  return promise
}
