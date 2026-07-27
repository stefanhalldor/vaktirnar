// Client-side label lookup via the same-origin, local-only HMS/static BFF.

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
      const res = await fetch('/api/place/reverse-geocode', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon }),
      })
      if (!res.ok) { cache.set(key, null); return null }
      const data = await res.json().catch(() => null) as {
        location?: { name?: unknown; formattedAddress?: unknown } | null
      } | null
      const formattedAddress = data?.location?.formattedAddress
      const displayName = data?.location?.name
      const name = typeof formattedAddress === 'string' && formattedAddress.trim()
        ? formattedAddress.trim()
        : typeof displayName === 'string' && displayName.trim()
          ? displayName.trim()
          : null
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
