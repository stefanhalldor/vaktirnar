/**
 * Resolves the typed back-navigation destination for the full Veðurpúls page.
 *
 * Returns `null` when `returnTo` is absent, external, or does not match a
 * known safe internal destination — in which case no back link is rendered.
 *
 * Two recognised destinations:
 *   'trip'            — /auth-mvp/vedrid (exact, query or hash only)
 *   'stationExplorer' — /auth-mvp/vedrid/elta-vedrid (exact, query or hash)
 *
 * Uses the same boundary-safe matching style as lib/auth/loginNext.ts so that
 * lookalikes such as /auth-mvp/vedrid-anything are rejected.
 */
export type PulseBackDestination =
  | { kind: 'trip'; href: string }
  | { kind: 'stationExplorer'; href: string }

export function resolvePulseBackDestination(returnTo: string | null): PulseBackDestination | null {
  if (!returnTo) return null
  try {
    const decoded = decodeURIComponent(returnTo)
    if (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.startsWith('//')) return null
    if (!decoded.startsWith('/')) return null

    // Trip: /auth-mvp/vedrid exactly, or with query/hash (no sub-path)
    if (
      decoded === '/auth-mvp/vedrid' ||
      decoded.startsWith('/auth-mvp/vedrid?') ||
      decoded.startsWith('/auth-mvp/vedrid#')
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
