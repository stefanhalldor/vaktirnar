import {
  buildNormalizedSearchText,
  cleanPlaceText,
  normalizeFixedNumericCode,
  normalizePlaceSearchText,
} from './normalize'
import type {
  HmsCanonicalPlace,
  HmsCsvDiagnostics,
  HmsCsvParseResult,
  HmsSourceRow,
  MunicipalityNameMap,
} from './types'

export const HMS_CSV_REQUIRED_HEADERS = Object.freeze([
  'HNITNUM',
  'SVFNR',
  'BYGGD',
  'LANDNR',
  'HEINUM',
  'POSTNR',
  'HEITI_NF',
  'HEITI_TGF',
  'HUSNR',
  'BOKST',
  'VIDSK',
  'SERHEITI',
  'DAGS_LEIDR',
  'TEGHNIT',
  'YFIRFARID',
  'NAKV_XY',
  'N_HNIT_WGS84',
  'E_HNIT_WGS84',
] as const)

const ICELAND_LAT_MIN = 63
const ICELAND_LAT_MAX = 67
const ICELAND_LON_MIN = -25
const ICELAND_LON_MAX = -12

function decodeCsvInput(input: string | Uint8Array): string {
  if (typeof input === 'string') return input
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(input)
  } catch {
    throw new Error('hms_csv_not_utf8')
  }
}

/** RFC 4180-style parser with support for quoted commas, escaped quotes and newlines. */
function forEachCsvRecord(csv: string, visit: (record: string[]) => void): void {
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let quoteClosed = false
  let rowHasSyntax = false

  const finishRow = () => {
    row.push(field)
    const nonEmpty = rowHasSyntax || row.some(value => value.length > 0)
    if (nonEmpty) visit(row)
    row = []
    field = ''
    quoteClosed = false
    rowHasSyntax = false
  }

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]
    if (inQuotes) {
      if (char === '"') {
        if (csv[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
          quoteClosed = true
        }
      } else {
        field += char
      }
      continue
    }

    if (quoteClosed) {
      if (char === ',') {
        row.push(field)
        field = ''
        quoteClosed = false
        rowHasSyntax = true
      } else if (char === '\n' || char === '\r') {
        finishRow()
        if (char === '\r' && csv[index + 1] === '\n') index += 1
      } else {
        throw new Error('hms_csv_character_after_quote')
      }
    } else if (char === '"') {
      if (field.length > 0) throw new Error('hms_csv_unexpected_quote')
      inQuotes = true
      rowHasSyntax = true
    } else if (char === ',') {
      row.push(field)
      field = ''
      rowHasSyntax = true
    } else if (char === '\n' || char === '\r') {
      finishRow()
      if (char === '\r' && csv[index + 1] === '\n') index += 1
    } else {
      field += char
    }
  }

  if (inQuotes) throw new Error('hms_csv_unclosed_quote')
  if (field.length > 0 || row.length > 0 || rowHasSyntax) finishRow()
}

function nullableText(value: unknown): string | null {
  const cleaned = cleanPlaceText(value)
  return cleaned || null
}

function normalizeNumericIdentifier(value: unknown): string | null {
  const cleaned = cleanPlaceText(value)
  const match = /^(\d+)(?:\.0+)?$/.exec(cleaned)
  return match ? match[1] : null
}

function parseInteger(value: unknown): number | null {
  const cleaned = cleanPlaceText(value)
  if (!/^-?\d+(?:\.0+)?$/.test(cleaned)) return null
  const parsed = Number(cleaned)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function parseNonNegativeNumber(value: unknown): number | null {
  const cleaned = cleanPlaceText(value)
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function parseCoordinate(value: unknown): number | null {
  const cleaned = cleanPlaceText(value)
  if (!cleaned) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function isIcelandCoordinate(lat: number, lon: number): boolean {
  return lat >= ICELAND_LAT_MIN && lat <= ICELAND_LAT_MAX
    && lon >= ICELAND_LON_MIN && lon <= ICELAND_LON_MAX
}

const REVIEW_PRIORITY: Readonly<Record<number, number>> = Object.freeze({
  1: 4, // reviewed
  0: 3, // not yet reviewed
  2: 2, // needs revision
  9: 1, // missing HEINUM; normally filtered before comparison
})

const COORDINATE_TYPE_PRIORITY: Readonly<Record<number, number>> = Object.freeze({
  3: 6, // driveway — most useful vehicle destination
  2: 5, // main entrance
  4: 4, // known to be within parcel
  1: 3, // estimated building midpoint
  5: 2, // within estimated building site
  0: 1, // type needs review
})

function correctedAtTimestamp(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

/** Negative means `a` is the preferred HMS point, matching Array.sort semantics. */
export function compareHmsPointQuality(a: HmsSourceRow, b: HmsSourceRow): number {
  const reviewDifference = (REVIEW_PRIORITY[b.reviewStatus ?? -1] ?? 0)
    - (REVIEW_PRIORITY[a.reviewStatus ?? -1] ?? 0)
  if (reviewDifference !== 0) return reviewDifference

  const typeDifference = (COORDINATE_TYPE_PRIORITY[b.coordinateType ?? -1] ?? 0)
    - (COORDINATE_TYPE_PRIORITY[a.coordinateType ?? -1] ?? 0)
  if (typeDifference !== 0) return typeDifference

  const accuracyA = a.accuracyM ?? Number.POSITIVE_INFINITY
  const accuracyB = b.accuracyM ?? Number.POSITIVE_INFINITY
  if (accuracyA !== accuracyB) return accuracyA - accuracyB

  const correctedDifference = correctedAtTimestamp(b.correctedAt) - correctedAtTimestamp(a.correctedAt)
  if (correctedDifference !== 0) return correctedDifference

  const coordinateDifference = a.coordinateId.localeCompare(b.coordinateId, 'is', { numeric: true })
  if (coordinateDifference !== 0) return coordinateDifference
  if (a.lat !== b.lat) return a.lat - b.lat
  return a.lon - b.lon
}

export function chooseBestHmsPoint(points: readonly HmsSourceRow[]): HmsSourceRow {
  if (points.length === 0) throw new Error('hms_point_candidates_empty')
  let best = points[0]
  for (let index = 1; index < points.length; index += 1) {
    if (compareHmsPointQuality(points[index], best) < 0) best = points[index]
  }
  return best
}

function buildHeaderIndex(headers: readonly string[]): Map<string, number> {
  const index = new Map<string, number>()
  headers.forEach((header, position) => {
    if (index.has(header)) throw new Error('hms_csv_duplicate_header')
    index.set(header, position)
  })
  for (const required of HMS_CSV_REQUIRED_HEADERS) {
    if (!index.has(required)) throw new Error(`hms_csv_missing_header_${required.toLowerCase()}`)
  }
  return index
}

export function parseHmsCsv(input: string | Uint8Array): HmsCsvParseResult {
  const csv = decodeCsvInput(input)
  let headers: string[] | null = null
  let headerIndex: Map<string, number> | null = null
  const preferredByAddressId = new Map<string, HmsSourceRow>()
  const diagnostics: HmsCsvDiagnostics = {
    sourceRowCount: 0,
    validPointCount: 0,
    canonicalPlaceCount: 0,
    duplicateAddressPointCount: 0,
    missingAddressIdCount: 0,
    invalidCoordinateCount: 0,
    invalidDataRowCount: 0,
    malformedRowCount: 0,
  }

  forEachCsvRecord(csv, (record) => {
    if (!headers) {
      headers = record.map((value, index) => (
        cleanPlaceText(index === 0 ? value.replace(/^\uFEFF/, '') : value).toUpperCase()
      ))
      headerIndex = buildHeaderIndex(headers)
      return
    }

    diagnostics.sourceRowCount += 1
    if (record.length !== headers.length || !headerIndex) {
      diagnostics.malformedRowCount += 1
      return
    }

    const value = (name: typeof HMS_CSV_REQUIRED_HEADERS[number]) => record[headerIndex!.get(name)!]
    const addressId = normalizeFixedNumericCode(value('HEINUM'), 7)
    if (!addressId) {
      diagnostics.missingAddressIdCount += 1
      return
    }

    const lat = parseCoordinate(value('N_HNIT_WGS84'))
    const lon = parseCoordinate(value('E_HNIT_WGS84'))
    if (lat === null || lon === null || !isIcelandCoordinate(lat, lon)) {
      diagnostics.invalidCoordinateCount += 1
      return
    }

    const coordinateId = normalizeNumericIdentifier(value('HNITNUM'))
    const streetName = cleanPlaceText(value('HEITI_NF'))
    const specialName = nullableText(value('SERHEITI'))
    if (!coordinateId || (!streetName && !specialName)) {
      diagnostics.invalidDataRowCount += 1
      return
    }

    const coordinateType = parseInteger(value('TEGHNIT'))
    const reviewStatus = parseInteger(value('YFIRFARID'))
    const sourceRow: HmsSourceRow = {
      coordinateId,
      addressId,
      municipalityCode: normalizeFixedNumericCode(value('SVFNR'), 4),
      settlementCode: normalizeNumericIdentifier(value('BYGGD')),
      landNumber: normalizeFixedNumericCode(value('LANDNR'), 6),
      postalCode: normalizeFixedNumericCode(value('POSTNR'), 3),
      streetName,
      streetNameDative: nullableText(value('HEITI_TGF')),
      houseNumber: nullableText(value('HUSNR')),
      houseLetter: nullableText(value('BOKST')),
      addressSuffix: nullableText(value('VIDSK')),
      specialName,
      correctedAt: nullableText(value('DAGS_LEIDR')),
      coordinateType: coordinateType !== null && coordinateType >= 0 && coordinateType <= 5
        ? coordinateType
        : null,
      reviewStatus: reviewStatus !== null && [0, 1, 2, 9].includes(reviewStatus)
        ? reviewStatus
        : null,
      accuracyM: parseNonNegativeNumber(value('NAKV_XY')),
      lat,
      lon,
    }

    diagnostics.validPointCount += 1
    const existing = preferredByAddressId.get(addressId)
    if (existing) {
      diagnostics.duplicateAddressPointCount += 1
      if (compareHmsPointQuality(sourceRow, existing) < 0) {
        preferredByAddressId.set(addressId, sourceRow)
      }
    } else {
      preferredByAddressId.set(addressId, sourceRow)
    }
  })

  if (!headers) throw new Error('hms_csv_empty')
  const rows = [...preferredByAddressId.values()]
    .sort((a, b) => a.addressId.localeCompare(b.addressId, 'is', { numeric: true }))
  diagnostics.canonicalPlaceCount = rows.length
  return { headers, rows, diagnostics }
}

function houseMarker(row: HmsSourceRow): string {
  if (!row.houseNumber) return ''
  const numberAndLetter = `${row.houseNumber}${row.houseLetter ?? ''}`
  return row.addressSuffix ? `${numberAndLetter} ${row.addressSuffix}` : numberAndLetter
}

export function buildCanonicalHmsPlace(
  row: HmsSourceRow,
  municipalityNames: MunicipalityNameMap,
): HmsCanonicalPlace {
  const marker = houseMarker(row)
  const streetAddress = [row.streetName, marker].filter(Boolean).join(' ').trim()
  const municipalityName = row.municipalityCode
    ? municipalityNames[row.municipalityCode] ?? null
    : null
  const locality = [row.postalCode, municipalityName].filter(Boolean).join(' ').trim()
  const displayName = row.specialName || streetAddress || row.addressId
  const formattedAddress = buildNormalizedDisplayParts([
    row.specialName && row.specialName !== streetAddress ? row.specialName : null,
    streetAddress,
    locality,
  ]) || displayName

  const searchNameNormalized = normalizePlaceSearchText(displayName)
  // Keep the street address independently searchable when a special name is
  // the primary display name and therefore appears first in formattedAddress.
  const searchAddressNormalized = normalizePlaceSearchText(streetAddress || formattedAddress)
  const searchSpecialNameNormalized = normalizePlaceSearchText(row.specialName ?? '')
  const searchMunicipalityNormalized = normalizePlaceSearchText(municipalityName ?? '')
  const searchTextNormalized = buildNormalizedSearchText([
    displayName,
    streetAddress,
    row.streetNameDative,
    row.specialName,
    row.postalCode,
    municipalityName,
    row.addressId,
  ])

  return {
    ...row,
    displayName,
    formattedAddress,
    municipalityName,
    searchNameNormalized,
    searchAddressNormalized,
    searchSpecialNameNormalized,
    searchMunicipalityNormalized,
    searchTextNormalized,
  }
}

function buildNormalizedDisplayParts(parts: readonly (string | null | undefined)[]): string {
  const result: string[] = []
  for (const part of parts) {
    const cleaned = cleanPlaceText(part)
    if (!cleaned || result[result.length - 1] === cleaned) continue
    result.push(cleaned)
  }
  return result.join(', ')
}
