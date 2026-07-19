/**
 * Pure fallback predicate for /vedrid source/time selection.
 *
 * Returns true when Vegagerðin has no usable current-observation layer —
 * meaning the page should auto-advance from 'now' to the first forecast slot
 * rather than showing a blank map.
 *
 * Extracted from WeatherOverviewClient so it can be unit-tested without
 * rendering the React component.
 */
export function vegagerdinHasNoUsableLayer({
  loading,
  restricted,
  loadError,
  data,
}: {
  loading: boolean
  restricted: boolean
  loadError: boolean
  data: { status: string; stations: readonly unknown[] } | null
}): boolean {
  if (loading) return false
  if (restricted || loadError) return true
  if (!data) return true
  if (data.status === 'unavailable') return true
  return data.status === 'ok' && data.stations.length === 0
}
