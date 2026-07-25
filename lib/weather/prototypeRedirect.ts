/**
 * Builds the redirect URL for the legacy /auth-mvp/vedrid/road-map-prototype path.
 *
 * Preserves all query parameters, including repeated keys, so that route restore
 * state (e.g. ?context=route&view=map&restoreRoute=1) survives the redirect to
 * the canonical /vedrid page. Authenticated users are then canonicalized to
 * /auth-mvp/vedrid by middleware, with the query string intact.
 */
export function buildPrototypeLegacyRedirectUrl(
  params: Record<string, string | string[] | undefined>,
): string {
  const usp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      usp.set(key, value)
    } else if (Array.isArray(value)) {
      for (const v of value) usp.append(key, v)
    }
  }
  const qs = usp.toString()
  return '/vedrid' + (qs ? '?' + qs : '')
}
