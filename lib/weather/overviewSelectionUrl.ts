/**
 * Helpers for the provider-aware URL selection state on the overview map.
 *
 * The URL carries both `provider` and `stationId` so that refreshing or sharing
 * a URL opens the correct provider layer, even when multiple providers share the
 * same marker ID namespace.
 *
 * Legacy URLs with only `stationId` (no `provider`) are treated as Veðurstofan
 * to preserve backward compatibility with existing bookmarks/links.
 */

export interface OverviewSelection {
  provider: string
  stationId: string
}

/**
 * Parses a URL search-params object into an OverviewSelection.
 * Returns null when no stationId is present.
 * Treats missing provider as 'vedurstofan' (legacy URL fallback).
 */
export function parseOverviewSelection(
  searchParams: { get(key: string): string | null }
): OverviewSelection | null {
  const stationId = searchParams.get('stationId')
  if (!stationId) return null
  const provider = searchParams.get('provider') ?? 'vedurstofan'
  return { provider, stationId }
}

/**
 * Builds a new pathname+search string with the given selection applied.
 * Clears stationId+provider when selection is null (deselect).
 * Accepts a base URL string like '/auth-mvp/vedrid/elta-vedrid' or a full URL.
 */
export function overviewSelectionUrl(
  base: string,
  selection: OverviewSelection | null
): string {
  const parsed = new URL(base, 'https://x.invalid')
  parsed.searchParams.delete('stationId')
  parsed.searchParams.delete('provider')
  if (selection) {
    parsed.searchParams.set('provider', selection.provider)
    parsed.searchParams.set('stationId', selection.stationId)
  }
  return parsed.pathname + (parsed.search || '')
}

/** Composite key for stable selection tracking (avoids cross-provider false matches). */
export function overviewSelectionKey(selection: OverviewSelection | null): string {
  if (!selection) return ''
  return `${selection.provider}:${selection.stationId}`
}
