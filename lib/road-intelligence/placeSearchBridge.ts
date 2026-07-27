import { normalizePlaceSearchText as normalizeCanonicalPlaceSearchText } from '@/lib/places/normalize'

export type RoadIntelligencePlaceResult = {
  name: string
  formattedAddress?: string
  lat: number
  lon: number
  placeId?: string
  googlePlaceId?: string
  source?: 'hms' | 'device' | 'map' | 'saved' | 'static' | 'curated' | 'official' | 'google'
  labelSource?: 'hms' | 'device' | 'map' | 'saved' | 'static' | 'curated' | 'official' | 'google'
  sourceId?: string
  placeType?: 'settlement' | 'address' | 'point'
  postalCode?: string
  postalLocality?: string
  municipality?: string
  municipalityCode?: string
  accuracyM?: number
}

type SelectOptions = {
  allowFirstFallback?: boolean
}

export const normalizePlaceSearchText = normalizeCanonicalPlaceSearchText

function hasFiniteCoords(lat: unknown, lon: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon)
  )
}

function coercePlaceResult(raw: unknown): RoadIntelligencePlaceResult | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const name = value.name ?? value.displayName ?? value.description
  const lat = value.lat
  const lon = value.lon ?? value.lng

  if (typeof name !== 'string' || name.trim().length === 0 || !hasFiniteCoords(lat, lon)) {
    return null
  }

  const numericLon = lon as number

  const formattedAddress = value.formattedAddress ?? value.address
  const placeId = value.placeId ?? value.place_id
  const googlePlaceId = value.googlePlaceId
  const source = value.source
  const labelSource = value.labelSource
  const sourceId = value.sourceId
  const placeType = value.placeType
  const postalCode = value.postalCode
  const postalLocality = value.postalLocality
  const municipality = value.municipality
  const municipalityCode = value.municipalityCode
  const accuracyM = value.accuracyM

  return {
    name: name.trim(),
    formattedAddress:
      typeof formattedAddress === 'string' && formattedAddress.trim().length > 0
        ? formattedAddress.trim()
        : undefined,
    lat,
    lon: numericLon,
    placeId:
      typeof placeId === 'string' && placeId.trim().length > 0
        ? placeId.trim()
        : undefined,
    googlePlaceId:
      typeof googlePlaceId === 'string' && googlePlaceId.trim().length > 0
        ? googlePlaceId.trim()
        : undefined,
    source:
      source === 'hms' || source === 'device' || source === 'map' || source === 'saved' ||
      source === 'static' || source === 'curated' || source === 'official' || source === 'google'
        ? source
        : undefined,
    labelSource:
      labelSource === 'hms' || labelSource === 'device' || labelSource === 'map' ||
      labelSource === 'saved' || labelSource === 'static' || labelSource === 'curated' ||
      labelSource === 'official' || labelSource === 'google'
        ? labelSource
        : undefined,
    sourceId:
      typeof sourceId === 'string' && sourceId.trim().length > 0
        ? sourceId.trim()
        : undefined,
    placeType:
      placeType === 'settlement' || placeType === 'address' || placeType === 'point'
        ? placeType
        : undefined,
    postalCode:
      typeof postalCode === 'string' && postalCode.trim().length > 0
        ? postalCode.trim()
        : undefined,
    postalLocality:
      typeof postalLocality === 'string' && postalLocality.trim().length > 0
        ? postalLocality.trim()
        : undefined,
    municipality:
      typeof municipality === 'string' && municipality.trim().length > 0
        ? municipality.trim()
        : undefined,
    municipalityCode:
      typeof municipalityCode === 'string' && municipalityCode.trim().length > 0
        ? municipalityCode.trim()
        : undefined,
    accuracyM:
      typeof accuracyM === 'number' && Number.isFinite(accuracyM) && accuracyM >= 0
        ? accuracyM
        : undefined,
  }
}

export function parsePlaceSearchResults(raw: unknown): RoadIntelligencePlaceResult[] {
  const container = raw as { results?: unknown; candidates?: unknown } | null
  const values = Array.isArray(raw)
    ? raw
    : Array.isArray(container?.results)
      ? container.results
      : Array.isArray(container?.candidates)
        ? container.candidates
        : []

  return values
    .map(coercePlaceResult)
    .filter((place): place is RoadIntelligencePlaceResult => place !== null)
}

function placeQueryMatchScore(query: string, place: RoadIntelligencePlaceResult): number {
  const normalizedQuery = normalizePlaceSearchText(query)
  if (!normalizedQuery) return 0

  const name = normalizePlaceSearchText(place.name)
  const address = normalizePlaceSearchText(place.formattedAddress ?? '')

  if (name === normalizedQuery) return 100
  if (address === normalizedQuery) return 95
  if (name.startsWith(normalizedQuery)) return 80
  if (address.startsWith(normalizedQuery)) return 70
  if (name.includes(normalizedQuery)) return 50
  if (address.includes(normalizedQuery)) return 40
  return 0
}

export function isPlaceUsableForQuery(
  query: string,
  place: RoadIntelligencePlaceResult | null | undefined,
): place is RoadIntelligencePlaceResult {
  return Boolean(place && placeQueryMatchScore(query, place) > 0)
}

export function selectBestPlaceForQuery(
  query: string,
  candidates: readonly (RoadIntelligencePlaceResult | null | undefined)[],
  options: SelectOptions = {},
): RoadIntelligencePlaceResult | null {
  const validCandidates = candidates.filter(
    (place): place is RoadIntelligencePlaceResult => Boolean(place),
  )
  if (validCandidates.length === 0) return null

  let best: { place: RoadIntelligencePlaceResult; score: number } | null = null
  for (const place of validCandidates) {
    const score = placeQueryMatchScore(query, place)
    if (score > 0 && (!best || score > best.score)) {
      best = { place, score }
    }
  }

  if (best) return best.place
  return options.allowFirstFallback ? validCandidates[0] : null
}
