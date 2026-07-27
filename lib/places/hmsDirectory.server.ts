import 'server-only'

import { getAdmin } from '@/lib/supabase/admin'
import { normalizePlaceSearchText } from './normalize'
import type {
  ActiveHmsDataset,
  ReversePlaceResult,
  SelectedLocation,
} from './types'

const DATASET_TABLE = 'hms_place_dataset_versions'

type HmsPlaceRpcRow = {
  source_id: string
  coordinate_id: string
  display_name: string
  formatted_address: string
  postal_code: string | null
  municipality_code: string | null
  municipality_name: string | null
  lat: number
  lon: number
  accuracy_m: number | string | null
  distance_m?: number | string | null
}
type ActiveDatasetRow = {
  id: string
  source_content_sha256: string
  source_bytes: number | string
  source_row_count: number | string
  canonical_place_count: number | string
  promoted_at: string
}

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toSelectedLocation(row: HmsPlaceRpcRow): SelectedLocation | null {
  const lat = finiteNumber(row.lat)
  const lon = finiteNumber(row.lon)
  if (
    !row.source_id || !row.display_name || !row.formatted_address
    || lat === null || lon === null
    || lat < 63 || lat > 67 || lon < -25 || lon > -12
  ) {
    return null
  }
  const accuracyM = finiteNumber(row.accuracy_m)
  return {
    id: `hms:${row.source_id}`,
    source: 'hms',
    sourceId: row.source_id,
    name: row.display_name,
    formattedAddress: row.formatted_address,
    ...(row.postal_code ? { postalCode: row.postal_code } : {}),
    ...(row.municipality_code ? { municipalityCode: row.municipality_code } : {}),
    ...(row.municipality_name ? { municipality: row.municipality_name } : {}),
    lat,
    lon,
    ...(accuracyM !== null ? { accuracyM } : {}),
    // Intentionally no routingRef/placeId: HEINUM is not a Google Place ID.
  }
}

export async function searchHmsPlaces(query: string, limit = 8): Promise<SelectedLocation[]> {
  const normalizedQuery = normalizePlaceSearchText(query)
  if (normalizedQuery.length < 2 || normalizedQuery.length > 100) return []
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 10)
  const { data, error } = await getAdmin().rpc('search_hms_places', {
    p_query: normalizedQuery,
    p_limit: safeLimit,
  })
  if (error) throw new Error('hms_place_search_failed')
  if (!Array.isArray(data)) return []
  return data
    .map(row => toSelectedLocation(row as HmsPlaceRpcRow))
    .filter((place): place is SelectedLocation => place !== null)
}

export async function reverseHmsPlace(
  lat: number,
  lon: number,
  maxDistanceM = 25_000,
): Promise<ReversePlaceResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 63 || lat > 67 || lon < -25 || lon > -12) {
    return null
  }
  const safeMaxDistanceM = Math.min(Math.max(Math.round(maxDistanceM), 100), 50_000)
  const { data, error } = await getAdmin().rpc('reverse_hms_place', {
    p_lat: lat,
    p_lon: lon,
    p_max_distance_m: safeMaxDistanceM,
  })
  if (error) throw new Error('hms_reverse_place_failed')
  if (!Array.isArray(data) || data.length === 0) return null
  const row = data[0] as HmsPlaceRpcRow
  const location = toSelectedLocation(row)
  const distanceM = finiteNumber(row.distance_m)
  return location && distanceM !== null && distanceM >= 0 && distanceM <= safeMaxDistanceM
    ? { location, distanceM }
    : null
}

export async function readActiveHmsDataset(): Promise<ActiveHmsDataset | null> {
  const { data, error } = await getAdmin()
    .from(DATASET_TABLE)
    .select('id, source_content_sha256, source_bytes, source_row_count, canonical_place_count, promoted_at')
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw new Error('hms_active_dataset_read_failed')
  if (!data) return null
  const row = data as unknown as ActiveDatasetRow
  const sourceBytes = finiteNumber(row.source_bytes)
  const sourceRowCount = finiteNumber(row.source_row_count)
  const canonicalPlaceCount = finiteNumber(row.canonical_place_count)
  if (
    !row.id || !row.source_content_sha256 || !row.promoted_at
    || sourceBytes === null || sourceRowCount === null || canonicalPlaceCount === null
  ) {
    throw new Error('hms_active_dataset_invalid')
  }
  return {
    id: row.id,
    sourceContentSha256: row.source_content_sha256,
    sourceBytes,
    sourceRowCount,
    canonicalPlaceCount,
    promotedAtIso: row.promoted_at,
  }
}
