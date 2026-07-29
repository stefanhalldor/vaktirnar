import 'server-only'

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

type GeneratedPostalLocality = {
  name: string
  classification: string
}

export type OfficialPostalLocality = Readonly<GeneratedPostalLocality>

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
  if (
    !isNonEmptyString(value.id)
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
    || value.placeType !== 'settlement'
    || value.population2024 !== null
    || typeof value.searchTextNormalized !== 'string'
  ) {
    throw new Error('official_place_directory_invalid')
  }
  if (value.postalCode !== null && !/^\d{3}$/.test(value.postalCode)) {
    throw new Error('official_place_directory_invalid')
  }
  return {
    ...(value as Omit<GeneratedSettlement, 'geometry'>),
    geometry: parseSettlementGeometry(value.geometry),
  }
}

function parseDirectory(value: unknown): {
  settlements: GeneratedSettlement[]
  postalLocalities: Map<string, OfficialPostalLocality>
} {
  if (!isRecord(value) || value.schemaVersion !== 2 || !Array.isArray(value.settlements)) {
    throw new Error('official_place_directory_invalid')
  }
  if (!isRecord(value.postalLocalities)) throw new Error('official_place_directory_invalid')

  const postalLocalities = new Map<string, OfficialPostalLocality>()
  for (const [postalCode, locality] of Object.entries(value.postalLocalities)) {
    if (
      !/^\d{3}$/.test(postalCode)
      || !isRecord(locality)
      || !isNonEmptyString(locality.name)
      || !isNonEmptyString(locality.classification)
    ) {
      throw new Error('official_place_directory_invalid')
    }
    postalLocalities.set(postalCode, {
      name: locality.name,
      classification: locality.classification,
    })
  }

  return {
    settlements: value.settlements.map(parseSettlement),
    postalLocalities,
  }
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
  return directory.postalLocalities.get(postalCode) ?? null
}
