/**
 * Resolves the typed back-navigation destination for the full Veðurpúls page.
 *
 * Returns `null` when `returnTo` is absent, external, or does not match a
 * known safe internal destination — in which case no back link is rendered.
 *
 * Three recognised destinations:
 *   'overview'        — /auth-mvp/vedrid or /vedrid (exact, query or hash only)
 *   'trip'            — /auth-mvp/vedrid/ferdalagid (exact, query or hash)
 *   'stationExplorer' — /auth-mvp/vedrid/elta-vedrid (exact, query or hash)
 *
 * Uses the same boundary-safe matching style as lib/auth/loginNext.ts so that
 * lookalikes such as /auth-mvp/vedrid-anything are rejected.
 */
export type PulseBackDestination =
  | { kind: 'overview'; href: string }
  | { kind: 'trip'; href: string }
  | { kind: 'stationExplorer'; href: string }

export function resolvePulseBackDestination(returnTo: string | null): PulseBackDestination | null {
  if (!returnTo) return null
  try {
    const decoded = decodeURIComponent(returnTo)
    if (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('//')) return null
    if (!decoded.startsWith('/')) return null

    // Overview: /auth-mvp/vedrid or /vedrid exactly, or with query/hash (no sub-path)
    if (
      decoded === '/auth-mvp/vedrid' ||
      decoded.startsWith('/auth-mvp/vedrid?') ||
      decoded.startsWith('/auth-mvp/vedrid#') ||
      decoded === '/vedrid' ||
      decoded.startsWith('/vedrid?') ||
      decoded.startsWith('/vedrid#')
    ) {
      return { kind: 'overview', href: decoded }
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

    return null
  } catch {
    return null
  }
}
