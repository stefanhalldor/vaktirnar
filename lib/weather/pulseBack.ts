/**
 * Resolves the typed back-navigation destination for the full Veðurpúls page.
 *
 * Returns `null` when `returnTo` is absent, external, or does not match a
 * known safe internal destination — in which case no back link is rendered.
 *
 * Recognised destinations:
 *   'drive'           — /vedrid or /auth-mvp/vedrid (canonical map, exact, query or hash only)
 *                       /auth-mvp/vedrid/road-map-prototype (legacy path — still in EXACT_PUBLIC_PATHS)
 *   'trip'            — /auth-mvp/vedrid/ferdalagid (exact, query or hash)
 *   'stationExplorer' — /auth-mvp/vedrid/elta-vedrid (exact, query or hash)
 *   'pulseStation'    — /auth-mvp/vedrid/puls/stod/{stationId}
 *
 * Uses the same boundary-safe matching style as lib/auth/loginNext.ts so that
 * lookalikes such as /auth-mvp/vedrid-anything or /vedrid-anything are rejected.
 */
export type PulseBackDestination =
  | { kind: 'drive'; href: string }
  | { kind: 'trip'; href: string }
  | { kind: 'stationExplorer'; href: string }
  | { kind: 'pulseStation'; href: string }

export function resolvePulseBackDestination(returnTo: string | null): PulseBackDestination | null {
  if (!returnTo) return null
  try {
    const decoded = decodeURIComponent(returnTo)
    if (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('//')) return null
    if (!decoded.startsWith('/')) return null

    // Drive: canonical map paths and legacy prototype path (exact or with query/hash only).
    // Legacy /auth-mvp/vedrid/road-map-prototype now redirects to /vedrid but is kept
    // in EXACT_PUBLIC_PATHS — returnTo values using the old path still resolve correctly.
    if (
      decoded === '/vedrid' ||
      decoded.startsWith('/vedrid?') ||
      decoded.startsWith('/vedrid#') ||
      decoded === '/auth-mvp/vedrid' ||
      decoded.startsWith('/auth-mvp/vedrid?') ||
      decoded.startsWith('/auth-mvp/vedrid#') ||
      decoded === '/auth-mvp/vedrid/road-map-prototype' ||
      decoded.startsWith('/auth-mvp/vedrid/road-map-prototype?') ||
      decoded.startsWith('/auth-mvp/vedrid/road-map-prototype#')
    ) {
      return { kind: 'drive', href: decoded }
    }

    // Trip: /auth-mvp/vedrid/ferdalagid exactly, or with query/hash
    if (
      decoded === '/auth-mvp/vedrid/ferdalagid' ||
      decoded.startsWith('/auth-mvp/vedrid/ferdalagid?') ||
      decoded.startsWith('/auth-mvp/vedrid/ferdalagid#')
    ) {
      return { kind: 'trip', href: decoded }
    }

    // Station explorer: /auth-mvp/vedrid/elta-vedrid exactly, or with query/hash/sub-path
    if (
      decoded === '/auth-mvp/vedrid/elta-vedrid' ||
      decoded.startsWith('/auth-mvp/vedrid/elta-vedrid?') ||
      decoded.startsWith('/auth-mvp/vedrid/elta-vedrid#') ||
      decoded.startsWith('/auth-mvp/vedrid/elta-vedrid/')
    ) {
      return { kind: 'stationExplorer', href: decoded }
    }

    // Veðurstofan pulse station: /auth-mvp/vedrid/puls/stod/{stationId} (single segment, no sub-path)
    // Only the path portion (before ? or #) must have no further slashes.
    const stodPrefix = '/auth-mvp/vedrid/puls/stod/'
    if (decoded.startsWith(stodPrefix)) {
      const rest = decoded.slice(stodPrefix.length)
      const pathEnd = rest.search(/[?#]/)
      const pathPart = pathEnd === -1 ? rest : rest.slice(0, pathEnd)
      if (pathPart.length > 0 && !pathPart.includes('/')) {
        return { kind: 'pulseStation', href: decoded }
      }
    }

    return null
  } catch {
    return null
  }
}
