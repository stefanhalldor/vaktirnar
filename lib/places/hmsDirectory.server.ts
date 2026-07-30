import 'server-only'

import { getAdmin } from '@/lib/supabase/admin'
import { haversineDistanceM } from '@/lib/weather/nearestStations'
import { normalizePlaceSearchText } from './normalize'
import { getOfficialPostalLocality } from './officialPlaceDirectory.server'
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

export const ASSESSMENT_HMS_QUERY_MAX_DISTANCE_M = 50
const ASSESSMENT_HMS_QUERY_MAX_ROWS = 64

export type HmsPostalIdentityCandidate = Readonly<{
  sourceId: string
  postalCode: string
  postalLocality: string
  postalLocalitySourceId: string
  distanceM: number
}>

export type HmsSourceIdentityCandidate = Readonly<{
  sourceId: string
  distanceM: number
}>

function finiteNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatWithOfficialPostalLocality(
  row: HmsPlaceRpcRow,
  postalLocality: string | undefined,
): string {
  if (!row.postal_code || !postalLocality || !row.municipality_name) {
    return row.formatted_address
  }
  const currentSuffix = `${row.postal_code} ${row.municipality_name}`
  const officialSuffix = `${row.postal_code} ${postalLocality}`
  if (currentSuffix === officialSuffix) return row.formatted_address
  if (row.formatted_address === currentSuffix) return officialSuffix
  const commaSuffix = `, ${currentSuffix}`
  if (!row.formatted_address.endsWith(commaSuffix)) return row.formatted_address
  return `${row.formatted_address.slice(0, -commaSuffix.length)}, ${officialSuffix}`
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
  const postalLocality = getOfficialPostalLocality(row.postal_code)?.name
  return {
    id: `hms:${row.source_id}`,
    source: 'hms',
    sourceId: row.source_id,
    name: row.display_name,
    formattedAddress: formatWithOfficialPostalLocality(row, postalLocality),
    placeType: 'address',
    ...(row.postal_code ? { postalCode: row.postal_code } : {}),
    ...(postalLocality ? { postalLocality } : {}),
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

/**
 * Reads a bounded first-party candidate set for assessment identity. Exact
 * coordinates remain transient query/distance inputs; returned values contain
 * only structured HMS/official identities and distance.
 */
export async function readHmsPostalIdentityCandidates(
  point: { lat: number; lon: number },
  options: { maxDistanceM: number; sourceId?: string },
): Promise<HmsPostalIdentityCandidate[] | null> {
  if (
    !Number.isFinite(point.lat)
    || !Number.isFinite(point.lon)
    || point.lat < 63 || point.lat > 67
    || point.lon < -25 || point.lon > -12
  ) {
    return []
  }
  const maxDistanceM = Math.min(
    Math.max(Math.round(options.maxDistanceM), 1),
    ASSESSMENT_HMS_QUERY_MAX_DISTANCE_M,
  )
  const expectedSourceId = options.sourceId?.trim()
  if (
    options.sourceId !== undefined
    && (!expectedSourceId || expectedSourceId.length > 160)
  ) return []

  const { data: activeDataset, error: datasetError } = await getAdmin()
    .from(DATASET_TABLE)
    .select('id')
    .eq('status', 'active')
    .maybeSingle()
  if (datasetError) throw new Error('hms_assessment_exact_lookup_failed')
  if (!activeDataset?.id) return []

  const columns = [
    'source_id',
    'coordinate_id',
    'display_name',
    'formatted_address',
    'postal_code',
    'municipality_code',
    'municipality_name',
    'lat',
    'lon',
    'accuracy_m',
  ].join(', ')
  const places = getAdmin().from('hms_places')
  const latitudeDelta = maxDistanceM / 111_320
  const longitudeDelta = maxDistanceM
    / (111_320 * Math.max(0.1, Math.cos(point.lat * Math.PI / 180)))
  const { data, error } = expectedSourceId
    ? await places
        .select(columns)
        .eq('dataset_version_id', activeDataset.id)
        .eq('source_id', expectedSourceId)
        .order('source_id', { ascending: true })
        .limit(2)
    : await places
        .select(columns)
        .eq('dataset_version_id', activeDataset.id)
        .gte('lat', point.lat - latitudeDelta)
        .lte('lat', point.lat + latitudeDelta)
        .gte('lon', point.lon - longitudeDelta)
        .lte('lon', point.lon + longitudeDelta)
        .order('source_id', { ascending: true })
        .limit(ASSESSMENT_HMS_QUERY_MAX_ROWS + 1)
  if (error) throw new Error('hms_assessment_exact_lookup_failed')
  if (!Array.isArray(data)) return []
  if (
    data.length > ASSESSMENT_HMS_QUERY_MAX_ROWS
    || (expectedSourceId && data.length !== 1)
  ) return null

  const candidates: HmsPostalIdentityCandidate[] = []
  for (const raw of data) {
    const row = raw as unknown as HmsPlaceRpcRow
    const rawLat = finiteNumber(row.lat)
    const rawLon = finiteNumber(row.lon)
    if (rawLat === null || rawLon === null) return null
    const distanceM = haversineDistanceM(point, { lat: rawLat, lon: rawLon })
    if (!Number.isFinite(distanceM)) return null
    if (distanceM > maxDistanceM) continue

    const location = toSelectedLocation(row)
    if (
      !location
      || location.source !== 'hms'
      || location.placeType !== 'address'
      || !location.sourceId
      || (expectedSourceId && location.sourceId !== expectedSourceId)
      || !location.postalCode
      || !location.postalLocality
    ) return null
    const officialPostalLocality = getOfficialPostalLocality(location.postalCode)
    if (!officialPostalLocality || officialPostalLocality.name !== location.postalLocality) return null
    candidates.push({
      sourceId: location.sourceId,
      postalCode: location.postalCode,
      postalLocality: officialPostalLocality.name,
      postalLocalitySourceId: officialPostalLocality.sourceId,
      distanceM,
    })
  }
  return candidates.sort((a, b) => (
    a.distanceM - b.distanceM || a.sourceId.localeCompare(b.sourceId, 'is')
  ))
}

/**
 * Re-attests one explicitly selected HMS row against the active first-party
 * dataset. Unlike postal identity resolution, this only proves source identity
 * and coordinate proximity, so named places without usable postcode metadata
 * can still be projected onto the connected official-road graph.
 */
export async function readHmsSourceIdentityCandidate(
  point: { lat: number; lon: number },
  options: { maxDistanceM: number; sourceId: string },
): Promise<HmsSourceIdentityCandidate | null> {
  if (
    !Number.isFinite(point.lat)
    || !Number.isFinite(point.lon)
    || point.lat < 63 || point.lat > 67
    || point.lon < -25 || point.lon > -12
  ) return null

  const sourceId = options.sourceId.trim()
  if (!sourceId || sourceId.length > 160) return null
  const maxDistanceM = Math.min(
    Math.max(Math.round(options.maxDistanceM), 1),
    ASSESSMENT_HMS_QUERY_MAX_DISTANCE_M,
  )

  const { data: activeDataset, error: datasetError } = await getAdmin()
    .from(DATASET_TABLE)
    .select('id')
    .eq('status', 'active')
    .maybeSingle()
  if (datasetError) throw new Error('hms_assessment_exact_lookup_failed')
  if (!activeDataset?.id) return null

  const { data, error } = await getAdmin()
    .from('hms_places')
    .select('source_id, lat, lon')
    .eq('dataset_version_id', activeDataset.id)
    .eq('source_id', sourceId)
    .order('source_id', { ascending: true })
    .limit(2)
  if (error) throw new Error('hms_assessment_exact_lookup_failed')
  if (!Array.isArray(data) || data.length !== 1) return null

  const row = data[0] as Pick<HmsPlaceRpcRow, 'source_id' | 'lat' | 'lon'>
  const lat = finiteNumber(row.lat)
  const lon = finiteNumber(row.lon)
  if (
    row.source_id !== sourceId
    || lat === null || lon === null
    || lat < 63 || lat > 67
    || lon < -25 || lon > -12
  ) return null
  const distanceM = haversineDistanceM(point, { lat, lon })
  return Number.isFinite(distanceM) && distanceM <= maxDistanceM
    ? { sourceId, distanceM }
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
