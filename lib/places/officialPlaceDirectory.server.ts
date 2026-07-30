import 'server-only'

import { createHash } from 'node:crypto'
import generatedDirectory from './officialPlaceDirectory.generated.json'
import { normalizePlaceSearchText } from './normalize'
import type { SelectedLocation } from './types'

type GeneratedSettlement = {
  id: string
  name: string
  aliases: string[]
  lat: number
  lon: number
  postalCode: string | null
  postalLocality: string | null
  postalCodes: string[]
  placeType: 'settlement'
  population2024: null
  hagstofaId: string | null
  is50vIds: string[]
  sourceUpdatedAt: string | null
  searchTextNormalized: string
  geometry: OfficialSettlementGeometry
}

export type OfficialSettlementPosition = readonly [lon: number, lat: number]
export type OfficialSettlementPolygon = readonly (readonly OfficialSettlementPosition[])[]
export type OfficialSettlementGeometry = {
  type: 'MultiPolygon'
  coordinates: readonly OfficialSettlementPolygon[]
}

export type OfficialSettlementBoundary = {
  id: string
  name: string
  geometry: OfficialSettlementGeometry
}

export type OfficialSettlementRecord = OfficialSettlementBoundary & {
  lat: number
  lon: number
  postalCode: string | null
  postalLocality: string | null
}

export type OfficialPostalClassification = 'Þéttbýli' | 'Dreifbýli'

export type OfficialPostalAssessmentIdentity = Readonly<
  | {
      kind: 'urban_settlement'
      postalAreaId: string
      settlementId: string
      resolution:
        | 'unique_official_name'
        | 'unique_official_name_and_primary_postal'
        | 'unique_primary_postal'
    }
  | {
      kind: 'rural_postal_area'
      postalAreaId: string
    }
  | {
      kind: 'unresolved'
      reason: 'no_unique_official_settlement' | 'ambiguous_official_settlement'
    }
>

type GeneratedPostalLocality = {
  name: string
  classification: OfficialPostalClassification
  sourceId: string
  correctedAt: string | null
  assessmentIdentity: OfficialPostalAssessmentIdentity
}

export type OfficialPostalLocality = Readonly<Omit<GeneratedPostalLocality, 'assessmentIdentity'>>

type IndexedSettlement = {
  settlement: GeneratedSettlement
  normalizedAliases: ReadonlySet<string>
  normalizedPostalCodes: ReadonlySet<string>
  normalizedPostalCombinations: ReadonlySet<string>
  normalizedSearchText: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isOptionalString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return Object.keys(value).every(key => allowed.has(key))
}

function contentSha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function validHttpsUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function validDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function parseSourceProvenance(value: unknown, retrievedDate: string): void {
  if (!isRecord(value) || !hasOnlyKeys(value, ['hagstofa', 'is50v', 'postal'])) {
    throw new Error('official_place_directory_invalid')
  }
  for (const sourceKey of ['hagstofa', 'is50v', 'postal']) {
    const source = value[sourceKey]
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
      || !isNonEmptyString(source.dataset)
      || !validHttpsUrl(source.metadataUrl)
      || !validHttpsUrl(source.dataUrl)
      || typeof source.featureCount !== 'number'
      || !Number.isInteger(source.featureCount)
      || source.featureCount <= 0
      || typeof source.contentSha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(source.contentSha256)
      || source.retrievedDate !== retrievedDate
    ) {
      throw new Error('official_place_directory_invalid')
    }
  }
}

function parseSettlementPosition(value: unknown): OfficialSettlementPosition {
  if (
    !Array.isArray(value)
    || value.length < 2
    || typeof value[0] !== 'number'
    || typeof value[1] !== 'number'
    || !Number.isFinite(value[0])
    || !Number.isFinite(value[1])
    || value[0] < -25
    || value[0] > -12
    || value[1] < 63
    || value[1] > 67
  ) {
    throw new Error('official_place_directory_invalid')
  }
  return [value[0], value[1]]
}

function parseSettlementGeometry(value: unknown): OfficialSettlementGeometry {
  if (!isRecord(value) || value.type !== 'MultiPolygon' || !Array.isArray(value.coordinates)) {
    throw new Error('official_place_directory_invalid')
  }
  const coordinates = value.coordinates.map(rawPolygon => {
    if (!Array.isArray(rawPolygon) || rawPolygon.length === 0) {
      throw new Error('official_place_directory_invalid')
    }
    return rawPolygon.map(rawRing => {
      if (!Array.isArray(rawRing) || rawRing.length < 4) {
        throw new Error('official_place_directory_invalid')
      }
      const ring = rawRing.map(parseSettlementPosition)
      const first = ring[0]
      const last = ring[ring.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) {
        throw new Error('official_place_directory_invalid')
      }
      return ring
    })
  })
  if (coordinates.length === 0) throw new Error('official_place_directory_invalid')
  return { type: 'MultiPolygon', coordinates }
}

function parseSettlement(value: unknown): GeneratedSettlement {
  if (!isRecord(value)) throw new Error('official_place_directory_invalid')
  const aliases = value.aliases
  const postalCodes = value.postalCodes
  const is50vIds = value.is50vIds
  if (
    !hasOnlyKeys(value, [
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
    ])
    || !isNonEmptyString(value.id)
    || !isNonEmptyString(value.name)
    || !Array.isArray(aliases)
    || aliases.length === 0
    || !aliases.every(isNonEmptyString)
    || typeof value.lat !== 'number'
    || !Number.isFinite(value.lat)
    || value.lat < 63
    || value.lat > 67
    || typeof value.lon !== 'number'
    || !Number.isFinite(value.lon)
    || value.lon < -25
    || value.lon > -12
    || !isOptionalString(value.postalCode)
    || !isOptionalString(value.postalLocality)
    || !Array.isArray(postalCodes)
    || !postalCodes.every(code => typeof code === 'string' && /^\d{3}$/.test(code))
    || !Array.isArray(is50vIds)
    || !is50vIds.every(isNonEmptyString)
    || value.placeType !== 'settlement'
    || value.population2024 !== null
    || !isOptionalString(value.hagstofaId)
    || !isOptionalString(value.sourceUpdatedAt)
    || typeof value.searchTextNormalized !== 'string'
  ) {
    throw new Error('official_place_directory_invalid')
  }
  if (value.postalCode !== null && !/^\d{3}$/.test(value.postalCode)) {
    throw new Error('official_place_directory_invalid')
  }
  if (
    new Set(aliases).size !== aliases.length
    || new Set(postalCodes).size !== postalCodes.length
    || new Set(is50vIds).size !== is50vIds.length
  ) throw new Error('official_place_directory_invalid')
  return {
    id: value.id,
    name: value.name,
    aliases,
    lat: value.lat,
    lon: value.lon,
    postalCode: value.postalCode,
    postalLocality: value.postalLocality,
    postalCodes,
    placeType: 'settlement',
    population2024: null,
    hagstofaId: value.hagstofaId,
    is50vIds,
    sourceUpdatedAt: value.sourceUpdatedAt,
    searchTextNormalized: value.searchTextNormalized,
    geometry: parseSettlementGeometry(value.geometry),
  }
}

function parsePostalAssessmentIdentity(
  value: unknown,
  input: {
    postalCode: string
    sourceId: string
    classification: OfficialPostalClassification
    settlementIds: ReadonlySet<string>
  },
): OfficialPostalAssessmentIdentity {
  if (!isRecord(value) || !isNonEmptyString(value.kind)) {
    throw new Error('official_place_directory_invalid')
  }
  if (value.kind === 'unresolved') {
    if (
      input.classification !== 'Þéttbýli'
      || !hasOnlyKeys(value, ['kind', 'reason'])
      || !['no_unique_official_settlement', 'ambiguous_official_settlement'].includes(
        String(value.reason),
      )
    ) throw new Error('official_place_directory_invalid')
    return {
      kind: 'unresolved',
      reason: value.reason as 'no_unique_official_settlement' | 'ambiguous_official_settlement',
    }
  }

  const expectedPostalAreaId = `postal:${input.postalCode}:${input.sourceId}`
  if (!isNonEmptyString(value.postalAreaId) || value.postalAreaId !== expectedPostalAreaId) {
    throw new Error('official_place_directory_invalid')
  }
  if (value.kind === 'rural_postal_area') {
    if (
      input.classification !== 'Dreifbýli'
      || !hasOnlyKeys(value, ['kind', 'postalAreaId'])
    ) throw new Error('official_place_directory_invalid')
    return { kind: 'rural_postal_area', postalAreaId: value.postalAreaId }
  }
  if (value.kind === 'urban_settlement') {
    if (
      input.classification !== 'Þéttbýli'
      || !hasOnlyKeys(value, ['kind', 'postalAreaId', 'settlementId', 'resolution'])
      || !isNonEmptyString(value.settlementId)
      || !input.settlementIds.has(value.settlementId)
      || ![
        'unique_official_name',
        'unique_official_name_and_primary_postal',
        'unique_primary_postal',
      ].includes(String(value.resolution))
    ) throw new Error('official_place_directory_invalid')
    return {
      kind: 'urban_settlement',
      postalAreaId: value.postalAreaId,
      settlementId: value.settlementId,
      resolution: value.resolution as Extract<
        OfficialPostalAssessmentIdentity,
        { kind: 'urban_settlement' }
      >['resolution'],
    }
  }
  throw new Error('official_place_directory_invalid')
}

function parseDirectory(value: unknown): {
  settlements: GeneratedSettlement[]
  postalLocalities: Map<string, GeneratedPostalLocality>
} {
  if (
    !isRecord(value)
    || !hasOnlyKeys(value, [
      'schemaVersion',
      'generator',
      'retrievedDate',
      'sources',
      'settlements',
      'postalLocalities',
      'contentSha256',
    ])
    || value.schemaVersion !== 3
    || !isRecord(value.generator)
    || !hasOnlyKeys(value.generator, ['id', 'version'])
    || value.generator.id !== 'scripts/generate-official-place-directory.mjs'
    || value.generator.version !== 1
    || !validDateOnly(value.retrievedDate)
    || !Array.isArray(value.settlements)
    || typeof value.contentSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.contentSha256)
  ) {
    throw new Error('official_place_directory_invalid')
  }
  if (!isRecord(value.postalLocalities)) throw new Error('official_place_directory_invalid')
  parseSourceProvenance(value.sources, value.retrievedDate)
  const hashPayload = {
    schemaVersion: value.schemaVersion,
    generator: value.generator,
    retrievedDate: value.retrievedDate,
    sources: value.sources,
    settlements: value.settlements,
    postalLocalities: value.postalLocalities,
  }
  if (contentSha256(hashPayload) !== value.contentSha256) {
    throw new Error('official_place_directory_invalid')
  }

  const settlements = value.settlements.map(parseSettlement)
  const settlementIds = new Set(settlements.map(settlement => settlement.id))
  if (settlementIds.size !== settlements.length) throw new Error('official_place_directory_invalid')

  const postalLocalities = new Map<string, GeneratedPostalLocality>()
  const postalAreaIds = new Set<string>()
  for (const [postalCode, locality] of Object.entries(value.postalLocalities)) {
    if (
      !/^\d{3}$/.test(postalCode)
      || !isRecord(locality)
      || !hasOnlyKeys(locality, [
        'name',
        'classification',
        'sourceId',
        'correctedAt',
        'assessmentIdentity',
      ])
      || !isNonEmptyString(locality.name)
      || !['Þéttbýli', 'Dreifbýli'].includes(String(locality.classification))
      || !isNonEmptyString(locality.sourceId)
      || !isOptionalString(locality.correctedAt)
    ) {
      throw new Error('official_place_directory_invalid')
    }
    const classification = locality.classification as OfficialPostalClassification
    const assessmentIdentity = parsePostalAssessmentIdentity(locality.assessmentIdentity, {
      postalCode,
      sourceId: locality.sourceId,
      classification,
      settlementIds,
    })
    if (assessmentIdentity.kind !== 'unresolved') {
      if (postalAreaIds.has(assessmentIdentity.postalAreaId)) {
        throw new Error('official_place_directory_invalid')
      }
      postalAreaIds.add(assessmentIdentity.postalAreaId)
    }
    postalLocalities.set(postalCode, {
      name: locality.name,
      classification,
      sourceId: locality.sourceId,
      correctedAt: locality.correctedAt,
      assessmentIdentity,
    })
  }

  return {
    settlements,
    postalLocalities,
  }
}

export function validateOfficialPlaceDirectorySnapshot(value: unknown): void {
  parseDirectory(value)
}

const directory = parseDirectory(generatedDirectory)

function indexSettlement(settlement: GeneratedSettlement): IndexedSettlement {
  const normalizedAliases = new Set(
    [settlement.name, ...settlement.aliases]
      .map(normalizePlaceSearchText)
      .filter(Boolean),
  )
  const normalizedPostalCodes = new Set(settlement.postalCodes)
  const normalizedPostalCombinations = new Set<string>()
  for (const alias of normalizedAliases) {
    for (const postalCode of normalizedPostalCodes) {
      normalizedPostalCombinations.add(`${alias} ${postalCode}`)
      normalizedPostalCombinations.add(`${postalCode} ${alias}`)
    }
  }
  return {
    settlement,
    normalizedAliases,
    normalizedPostalCodes,
    normalizedPostalCombinations,
    normalizedSearchText: normalizePlaceSearchText(settlement.searchTextNormalized),
  }
}

const settlementIndex = directory.settlements.map(indexSettlement)
const settlementById = new Map(settlementIndex.map(entry => [entry.settlement.id, entry]))

export function getOfficialSettlementById(
  settlementId: string | null | undefined,
): OfficialSettlementRecord | null {
  if (!settlementId) return null
  const settlement = settlementById.get(settlementId)?.settlement
  return settlement
    ? {
        id: settlement.id,
        name: settlement.name,
        lat: settlement.lat,
        lon: settlement.lon,
        postalCode: settlement.postalCode,
        postalLocality: settlement.postalLocality,
        geometry: settlement.geometry,
      }
    : null
}

function pointOnSegment(
  point: OfficialSettlementPosition,
  a: OfficialSettlementPosition,
  b: OfficialSettlementPosition,
): boolean {
  const cross = (point[1] - a[1]) * (b[0] - a[0]) - (point[0] - a[0]) * (b[1] - a[1])
  if (Math.abs(cross) > 1e-12) return false
  return point[0] >= Math.min(a[0], b[0]) - 1e-12
    && point[0] <= Math.max(a[0], b[0]) + 1e-12
    && point[1] >= Math.min(a[1], b[1]) - 1e-12
    && point[1] <= Math.max(a[1], b[1]) + 1e-12
}

function pointInRing(
  point: OfficialSettlementPosition,
  ring: readonly OfficialSettlementPosition[],
): boolean {
  let inside = false
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const a = ring[previous]
    const b = ring[current]
    if (pointOnSegment(point, a, b)) return true
    const crosses = (a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    if (crosses) inside = !inside
  }
  return inside
}

export function officialSettlementGeometryContains(
  geometry: OfficialSettlementGeometry,
  lat: number,
  lon: number,
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false
  const point: OfficialSettlementPosition = [lon, lat]
  return geometry.coordinates.some(polygon => (
    polygon[0]
    && pointInRing(point, polygon[0])
    && !polygon.slice(1).some(hole => pointInRing(point, hole))
  ))
}

/**
 * Resolves an exact WGS84 point to one canonical settlement boundary.
 * Overlapping/ambiguous boundaries fail closed instead of guessing.
 */
export function findOfficialSettlementContainingPoint(
  lat: number,
  lon: number,
): OfficialSettlementBoundary | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const matches = settlementIndex
    .map(entry => entry.settlement)
    .filter(settlement => officialSettlementGeometryContains(settlement.geometry, lat, lon))
  if (matches.length !== 1) return null
  return {
    id: matches[0].id,
    name: matches[0].name,
    geometry: matches[0].geometry,
  }
}

function scoreIndexedSettlement(normalizedQuery: string, entry: IndexedSettlement): number {
  if (!normalizedQuery) return 0
  if (entry.normalizedAliases.has(normalizedQuery)) return 180
  if (entry.normalizedPostalCombinations.has(normalizedQuery)) return 175
  if (entry.normalizedPostalCodes.has(normalizedQuery)) return 150
  if ([...entry.normalizedAliases].some(alias => alias.startsWith(normalizedQuery))) return 130
  // This deliberately ranks below an exact HMS address. For example, `Hella 8`
  // is an address intent even though it prefixes the official key `Hella 850`.
  if ([...entry.normalizedPostalCombinations].some(value => value.startsWith(normalizedQuery))) return 115
  if ([...entry.normalizedAliases].some(alias => alias.includes(normalizedQuery))) return 90
  if (entry.normalizedSearchText.includes(normalizedQuery)) return 70
  return 0
}

function toSelectedLocation(settlement: GeneratedSettlement): SelectedLocation {
  const formattedAddress = settlement.postalCode && settlement.postalLocality
    ? `${settlement.postalCode} ${settlement.postalLocality}`
    : settlement.postalLocality ?? settlement.name
  return {
    id: `official:${settlement.id}`,
    source: 'official',
    sourceId: settlement.id,
    name: settlement.name,
    formattedAddress,
    placeType: 'settlement',
    ...(settlement.postalCode ? { postalCode: settlement.postalCode } : {}),
    ...(settlement.postalLocality ? { postalLocality: settlement.postalLocality } : {}),
    lat: settlement.lat,
    lon: settlement.lon,
  }
}

/** Deterministic, local-only lookup against the checked-in official settlement artifact. */
export function searchOfficialPlaces(query: string, limit = 8): SelectedLocation[] {
  const normalizedQuery = normalizePlaceSearchText(query)
  if (normalizedQuery.length < 2 || normalizedQuery.length > 100) return []
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 10)
  return settlementIndex
    .map(entry => ({ entry, score: scoreIndexedSettlement(normalizedQuery, entry) }))
    .filter(result => result.score > 0)
    .sort((a, b) => (
      b.score - a.score
      || a.entry.settlement.name.localeCompare(b.entry.settlement.name, 'is')
      || a.entry.settlement.id.localeCompare(b.entry.settlement.id, 'is')
    ))
    .slice(0, safeLimit)
    .map(result => toSelectedLocation(result.entry.settlement))
}

export function officialPlaceSearchScore(query: string, sourceId: string | undefined): number {
  if (!sourceId) return 0
  const entry = settlementById.get(sourceId)
  return entry ? scoreIndexedSettlement(normalizePlaceSearchText(query), entry) : 0
}

export function officialPlaceHasAlias(sourceId: string | undefined, name: string): boolean {
  if (!sourceId) return false
  const entry = settlementById.get(sourceId)
  const normalizedName = normalizePlaceSearchText(name)
  return Boolean(entry && normalizedName && entry.normalizedAliases.has(normalizedName))
}

export function getOfficialPostalLocality(
  postalCode: string | null | undefined,
): OfficialPostalLocality | null {
  if (!postalCode || !/^\d{3}$/.test(postalCode)) return null
  const locality = directory.postalLocalities.get(postalCode)
  return locality
    ? {
        name: locality.name,
        classification: locality.classification,
        sourceId: locality.sourceId,
        correctedAt: locality.correctedAt,
      }
    : null
}

export function getOfficialPostalAssessmentIdentity(
  postalCode: string | null | undefined,
): OfficialPostalAssessmentIdentity | null {
  if (!postalCode || !/^\d{3}$/.test(postalCode)) return null
  return directory.postalLocalities.get(postalCode)?.assessmentIdentity ?? null
}
