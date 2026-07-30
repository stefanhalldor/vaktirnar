import { createHash } from 'node:crypto'

export const OFFICIAL_PLACE_DIRECTORY_SCHEMA_VERSION = 3
export const OFFICIAL_PLACE_DIRECTORY_GENERATOR = Object.freeze({
  id: 'scripts/generate-official-place-directory.mjs',
  version: 1,
})

const POSTAL_CLASSIFICATIONS = new Set(['Þéttbýli', 'Dreifbýli'])
const URBAN_RESOLUTIONS = new Set([
  'unique_official_name',
  'unique_official_name_and_primary_postal',
  'unique_primary_postal',
])

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value, keys) {
  const allowed = new Set(keys)
  return Object.keys(value).every(key => allowed.has(key))
}

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}_invalid`)
  return value
}

function normalizeOfficialIdentityName(value) {
  return String(value ?? '')
    .normalize('NFC')
    .toLocaleLowerCase('is-IS')
    .replace(/\s+/g, ' ')
    .trim()
}

export function assertConsistentOfficialPostalLocalityRecords(postalCode, records) {
  if (!/^\d{3}$/.test(postalCode) || !Array.isArray(records) || records.length === 0) {
    throw new Error(`postal_${postalCode}_records_invalid`)
  }
  const normalizedNames = new Set()
  const classifications = new Set()
  const sourceIds = new Set()
  for (const record of records) {
    if (!isRecord(record)) throw new Error(`postal_${postalCode}_record_invalid`)
    const name = nonEmptyString(record.name, `postal_${postalCode}_name`)
    const sourceId = nonEmptyString(record.sourceId, `postal_${postalCode}_source_id`)
    if (!POSTAL_CLASSIFICATIONS.has(record.classification)) {
      throw new Error(`postal_${postalCode}_classification_invalid`)
    }
    normalizedNames.add(normalizeOfficialIdentityName(name))
    classifications.add(record.classification)
    sourceIds.add(sourceId)
  }
  if (normalizedNames.size !== 1) throw new Error(`postal_locality_conflict_${postalCode}`)
  if (classifications.size !== 1) throw new Error(`postal_classification_conflict_${postalCode}`)
  if (sourceIds.size !== 1) throw new Error(`postal_source_identity_conflict_${postalCode}`)
}

function postalAreaId(postalCode, sourceId) {
  return `postal:${postalCode}:${sourceId}`
}

function compareCanonicalText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

function sortedUniqueStrings(values, field) {
  if (!Array.isArray(values) || !values.every(value => (
    typeof value === 'string' && Boolean(value.trim())
  ))) throw new Error(`${field}_invalid`)
  if (new Set(values).size !== values.length) throw new Error(`${field}_duplicate`)
  return [...values].sort(compareCanonicalText)
}

function canonicalSettlement(rawSettlement) {
  if (!isRecord(rawSettlement)) throw new Error('settlement_invalid')
  if (!hasOnlyKeys(rawSettlement, [
    'id',
    'name',
    'aliases',
    'lat',
    'lon',
    'postalCode',
    'postalLocality',
    'postalCodes',
    'placeType',
    'population2024',
    'hagstofaId',
    'is50vIds',
    'sourceUpdatedAt',
    'searchTextNormalized',
    'geometry',
  ])) throw new Error('settlement_schema_drift')
  const id = nonEmptyString(rawSettlement.id, 'settlement_id')
  const name = nonEmptyString(rawSettlement.name, `settlement_${id}_name`)
  if (rawSettlement.postalCode !== null && !/^\d{3}$/.test(rawSettlement.postalCode)) {
    throw new Error(`settlement_${id}_postal_code_invalid`)
  }
  if (!isRecord(rawSettlement.geometry) || rawSettlement.geometry.type !== 'MultiPolygon') {
    throw new Error(`settlement_${id}_geometry_invalid`)
  }
  return {
    id,
    name,
    aliases: sortedUniqueStrings(rawSettlement.aliases, `settlement_${id}_aliases`),
    lat: rawSettlement.lat,
    lon: rawSettlement.lon,
    postalCode: rawSettlement.postalCode,
    postalLocality: rawSettlement.postalLocality,
    postalCodes: sortedUniqueStrings(rawSettlement.postalCodes, `settlement_${id}_postal_codes`),
    placeType: rawSettlement.placeType,
    population2024: rawSettlement.population2024,
    hagstofaId: rawSettlement.hagstofaId,
    is50vIds: sortedUniqueStrings(rawSettlement.is50vIds, `settlement_${id}_is50v_ids`),
    sourceUpdatedAt: rawSettlement.sourceUpdatedAt,
    searchTextNormalized: rawSettlement.searchTextNormalized,
    // Preserve source ring/vertex order. Reordering geometry would require a
    // separate topology-aware canonicalizer and is not needed for stable
    // feature-order regeneration.
    geometry: {
      type: 'MultiPolygon',
      coordinates: rawSettlement.geometry.coordinates,
    },
  }
}

function assessmentIdentityForPostalLocality(postalCode, locality, settlements) {
  const sourceId = nonEmptyString(locality.sourceId, `postal_${postalCode}_source_id`)
  const areaId = postalAreaId(postalCode, sourceId)
  if (locality.classification === 'Dreifbýli') {
    return { kind: 'rural_postal_area', postalAreaId: areaId }
  }
  if (locality.classification !== 'Þéttbýli') {
    throw new Error(`postal_${postalCode}_classification_invalid`)
  }

  const normalizedName = normalizeOfficialIdentityName(locality.name)
  const exactNameMatches = settlements.filter(settlement => (
    [settlement.name, ...(Array.isArray(settlement.aliases) ? settlement.aliases : [])]
      .some(alias => normalizeOfficialIdentityName(alias) === normalizedName)
  ))
  if (exactNameMatches.length === 1) {
    return {
      kind: 'urban_settlement',
      postalAreaId: areaId,
      settlementId: exactNameMatches[0].id,
      resolution: 'unique_official_name',
    }
  }

  if (exactNameMatches.length > 1) {
    const primaryPostalMatches = exactNameMatches.filter(
      settlement => settlement.postalCode === postalCode,
    )
    if (primaryPostalMatches.length === 1) {
      return {
        kind: 'urban_settlement',
        postalAreaId: areaId,
        settlementId: primaryPostalMatches[0].id,
        resolution: 'unique_official_name_and_primary_postal',
      }
    }
    return { kind: 'unresolved', reason: 'ambiguous_official_settlement' }
  }

  const primaryPostalMatches = settlements.filter(
    settlement => settlement.postalCode === postalCode,
  )
  if (primaryPostalMatches.length === 1) {
    return {
      kind: 'urban_settlement',
      postalAreaId: areaId,
      settlementId: primaryPostalMatches[0].id,
      resolution: 'unique_primary_postal',
    }
  }
  return {
    kind: 'unresolved',
    reason: primaryPostalMatches.length > 1
      ? 'ambiguous_official_settlement'
      : 'no_unique_official_settlement',
  }
}

function validDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function validateSourceProvenance(sources, retrievedDate) {
  if (
    !isRecord(sources)
    || !hasOnlyKeys(sources, ['hagstofa', 'is50v', 'postal'])
  ) throw new Error('sources_invalid')
  for (const sourceKey of ['hagstofa', 'is50v', 'postal']) {
    const source = sources[sourceKey]
    if (
      !isRecord(source)
      || !hasOnlyKeys(source, [
        'dataset',
        'metadataUrl',
        'dataUrl',
        'featureCount',
        'contentSha256',
        'retrievedDate',
      ])
      || !nonEmptyString(source.dataset, `${sourceKey}_dataset`)
      || !nonEmptyString(source.metadataUrl, `${sourceKey}_metadata_url`).startsWith('https://')
      || !nonEmptyString(source.dataUrl, `${sourceKey}_data_url`).startsWith('https://')
      || !Number.isInteger(source.featureCount)
      || source.featureCount <= 0
      || typeof source.contentSha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(source.contentSha256)
      || (source.retrievedDate !== undefined && !validDateOnly(source.retrievedDate))
    ) {
      throw new Error(`${sourceKey}_provenance_invalid`)
    }
    if (source.retrievedDate !== undefined && source.retrievedDate !== retrievedDate) {
      throw new Error(`${sourceKey}_retrieved_date_mismatch`)
    }
  }
}

function canonicalSources(sources, retrievedDate) {
  validateSourceProvenance(sources, retrievedDate)
  return Object.fromEntries(['hagstofa', 'is50v', 'postal'].map(sourceKey => {
    const source = sources[sourceKey]
    return [sourceKey, {
      dataset: source.dataset,
      metadataUrl: source.metadataUrl,
      dataUrl: source.dataUrl,
      featureCount: source.featureCount,
      contentSha256: source.contentSha256,
      // The upstream services expose uneven semantic version fields. The raw
      // content hash is the immutable byte version; this records when that
      // exact source version was retrieved without inventing an update date.
      retrievedDate: source.retrievedDate ?? retrievedDate,
    }]
  }))
}

function validatedRetrievedDate(input, explicitRetrievedDate) {
  const inputRetrievedDate = input.retrievedDate
    ?? (typeof input.generatedAt === 'string' ? input.generatedAt.slice(0, 10) : null)
  if (inputRetrievedDate !== null && !validDateOnly(inputRetrievedDate)) {
    throw new Error('retrieved_date_invalid')
  }
  if (explicitRetrievedDate !== undefined && !validDateOnly(explicitRetrievedDate)) {
    throw new Error('retrieved_date_invalid')
  }
  if (
    explicitRetrievedDate !== undefined
    && inputRetrievedDate !== null
    && explicitRetrievedDate !== inputRetrievedDate
  ) {
    throw new Error('retrieved_date_override_mismatch')
  }
  const candidate = explicitRetrievedDate ?? inputRetrievedDate
  if (candidate === null) throw new Error('retrieved_date_invalid')
  return candidate
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function officialPlaceDirectoryContentSha256(payload) {
  return sha256(JSON.stringify(payload))
}

export function officialPlaceDirectoryPayload(snapshot) {
  return {
    schemaVersion: snapshot.schemaVersion,
    generator: snapshot.generator,
    retrievedDate: snapshot.retrievedDate,
    sources: snapshot.sources,
    settlements: snapshot.settlements,
    postalLocalities: snapshot.postalLocalities,
  }
}

export function buildDeterministicOfficialPlaceDirectory(input, options = {}) {
  if (!isRecord(input) || !Array.isArray(input.settlements) || !isRecord(input.postalLocalities)) {
    throw new Error('official_place_directory_input_invalid')
  }
  const retrievedDate = validatedRetrievedDate(input, options.retrievedDate)
  const sources = canonicalSources(input.sources, retrievedDate)
  const settlements = input.settlements
    .map(canonicalSettlement)
    .sort((a, b) => (
      a.name.localeCompare(b.name, 'is')
      || compareCanonicalText(a.id, b.id)
    ))
  const settlementIds = new Set()
  for (const settlement of settlements) {
    const id = settlement.id
    if (settlementIds.has(id)) throw new Error(`duplicate_settlement_id_${id}`)
    settlementIds.add(id)
  }

  const postalLocalities = {}
  const postalAreaIds = new Set()
  for (const [postalCode, rawLocality] of Object.entries(input.postalLocalities)
    .sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    if (
      !/^\d{3}$/.test(postalCode)
      || !isRecord(rawLocality)
      || !hasOnlyKeys(rawLocality, [
        'name',
        'classification',
        'sourceId',
        'correctedAt',
        'assessmentIdentity',
      ])
    ) {
      throw new Error(`postal_${postalCode}_invalid`)
    }
    const name = nonEmptyString(rawLocality.name, `postal_${postalCode}_name`)
    const sourceId = nonEmptyString(rawLocality.sourceId, `postal_${postalCode}_source_id`)
    const classification = rawLocality.classification
    if (!POSTAL_CLASSIFICATIONS.has(classification)) {
      throw new Error(`postal_${postalCode}_classification_invalid`)
    }
    const correctedAt = rawLocality.correctedAt
    if (correctedAt !== null && typeof correctedAt !== 'string') {
      throw new Error(`postal_${postalCode}_corrected_at_invalid`)
    }
    const assessmentIdentity = assessmentIdentityForPostalLocality(
      postalCode,
      { name, sourceId, classification },
      settlements,
    )
    if (assessmentIdentity.kind !== 'unresolved') {
      if (postalAreaIds.has(assessmentIdentity.postalAreaId)) {
        throw new Error(`duplicate_postal_area_id_${assessmentIdentity.postalAreaId}`)
      }
      postalAreaIds.add(assessmentIdentity.postalAreaId)
    }
    if (
      assessmentIdentity.kind === 'urban_settlement'
      && (
        !settlementIds.has(assessmentIdentity.settlementId)
        || !URBAN_RESOLUTIONS.has(assessmentIdentity.resolution)
      )
    ) {
      throw new Error(`postal_${postalCode}_settlement_identity_invalid`)
    }
    postalLocalities[postalCode] = {
      name,
      classification,
      sourceId,
      correctedAt,
      assessmentIdentity,
    }
  }

  const payload = {
    schemaVersion: OFFICIAL_PLACE_DIRECTORY_SCHEMA_VERSION,
    generator: { ...OFFICIAL_PLACE_DIRECTORY_GENERATOR },
    retrievedDate,
    sources,
    settlements,
    postalLocalities,
  }
  return {
    ...payload,
    contentSha256: officialPlaceDirectoryContentSha256(payload),
  }
}

export function serializeOfficialPlaceDirectory(snapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}
