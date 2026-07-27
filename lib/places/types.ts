export type PlaceSource = 'hms' | 'device' | 'map' | 'saved' | 'static' | 'curated' | 'google'

export type PlaceRoutingReference = {
  provider: 'google'
  placeId: string
}

/**
 * Provider-neutral location selected by a user or resolved by the place directory.
 * `sourceId` is provenance only. In particular, an HMS HEINUM must never be sent
 * to a routing provider as a Google Place ID.
 */
export type SelectedLocation = {
  id?: string
  source: PlaceSource
  sourceId?: string
  name: string
  formattedAddress: string
  postalCode?: string
  municipalityCode?: string
  municipality?: string
  lat: number
  lon: number
  accuracyM?: number
  /** Transitional Google-only fields. HMS locations must leave both unset. */
  googlePlaceId?: string
  placeId?: string
  routingRef?: PlaceRoutingReference
}

export type ReversePlaceResult = {
  location: SelectedLocation
  distanceM: number
}

export type MunicipalityNameMap = Readonly<Record<string, string>>

/** A validated HMS source point before one point is selected per HEINUM. */
export type HmsSourceRow = {
  coordinateId: string
  addressId: string
  municipalityCode: string | null
  settlementCode: string | null
  landNumber: string | null
  postalCode: string | null
  streetName: string
  streetNameDative: string | null
  houseNumber: string | null
  houseLetter: string | null
  addressSuffix: string | null
  specialName: string | null
  correctedAt: string | null
  coordinateType: number | null
  reviewStatus: number | null
  accuracyM: number | null
  lat: number
  lon: number
}

/** Canonical, searchable HMS place built from the preferred point for a HEINUM. */
export type HmsCanonicalPlace = HmsSourceRow & {
  displayName: string
  formattedAddress: string
  municipalityName: string | null
  searchNameNormalized: string
  searchAddressNormalized: string
  searchSpecialNameNormalized: string
  searchMunicipalityNormalized: string
  searchTextNormalized: string
}

export type HmsCsvDiagnostics = {
  sourceRowCount: number
  validPointCount: number
  canonicalPlaceCount: number
  duplicateAddressPointCount: number
  missingAddressIdCount: number
  invalidCoordinateCount: number
  invalidDataRowCount: number
  malformedRowCount: number
}

export type HmsCsvParseResult = {
  headers: string[]
  /** Exactly one preferred source point per valid HEINUM, sorted by addressId. */
  rows: HmsSourceRow[]
  diagnostics: HmsCsvDiagnostics
}

export type HmsDatasetTrigger = 'cron' | 'admin'

export type HmsDatasetStatus =
  | 'building'
  | 'ready'
  | 'active'
  | 'retired'
  | 'failed'
  | 'unchanged'

export type ActiveHmsDataset = {
  id: string
  sourceContentSha256: string
  sourceBytes: number
  sourceRowCount: number
  canonicalPlaceCount: number
  promotedAtIso: string
}
