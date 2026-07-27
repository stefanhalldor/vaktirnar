import { describe, expect, it } from 'vitest'
import {
  HMS_CSV_REQUIRED_HEADERS,
  buildCanonicalHmsPlace,
  chooseBestHmsPoint,
  compareHmsPointQuality,
  parseHmsCsv,
} from '@/lib/places/hmsCsv'
import type { HmsSourceRow } from '@/lib/places/types'

const RAW_DEFAULTS: Record<string, string> = {
  HNITNUM: '1001',
  HEINUM: '2001',
  SVFNR: '0000',
  BYGGD: 'Reykjavík',
  LANDNR: '123456',
  POSTNR: '101',
  HEITI_NF: 'Laugavegur',
  HEITI_TGF: 'Laugavegi',
  HUSNR: '10',
  BOKST: 'B',
  VIDSK: '',
  SERHEITI: '',
  DAGS_LEIDR: '2026-07-20T12:00:00Z',
  TEGHNIT: '3',
  YFIRFARID: '1',
  NAKV_XY: '5',
  N_HNIT_WGS84: '64.1450',
  E_HNIT_WGS84: '-21.9300',
  VEF_BIRTING: '1',
}

function csvCell(value: string): string {
  return /[,"\r\n]/.test(value)
    ? `"${value.replace(/"/g, '""')}"`
    : value
}

function rawRow(overrides: Record<string, string> = {}): string {
  const values = { ...RAW_DEFAULTS, ...overrides }
  return HMS_CSV_REQUIRED_HEADERS
    .map(header => csvCell(values[header] ?? ''))
    .join(',')
}

function csvWithRows(...rows: string[]): string {
  return `${HMS_CSV_REQUIRED_HEADERS.join(',')}\r\n${rows.join('\r\n')}\r\n`
}

const BASE_POINT: HmsSourceRow = {
  coordinateId: '1001',
  addressId: '0002001',
  municipalityCode: '0000',
  settlementCode: null,
  landNumber: '123456',
  postalCode: '101',
  streetName: 'Laugavegur',
  streetNameDative: 'Laugavegi',
  houseNumber: '10',
  houseLetter: 'B',
  addressSuffix: null,
  specialName: null,
  correctedAt: '2026-07-20T12:00:00Z',
  coordinateType: 3,
  reviewStatus: 1,
  accuracyM: 5,
  lat: 64.145,
  lon: -21.93,
}

describe('HMS CSV schema contract', () => {
  it('requires the stable address/coordinate IDs and WGS84 coordinates', () => {
    expect(HMS_CSV_REQUIRED_HEADERS).toEqual(expect.arrayContaining([
      'HNITNUM',
      'HEINUM',
      'N_HNIT_WGS84',
      'E_HNIT_WGS84',
    ]))
  })

  it('fails closed when a required column is missing', () => {
    const headers = HMS_CSV_REQUIRED_HEADERS.filter(header => header !== 'HEINUM')
    const csv = `${headers.join(',')}\r\n${headers.map(header => csvCell(RAW_DEFAULTS[header] ?? '')).join(',')}\r\n`

    expect(() => parseHmsCsv(csv)).toThrow()
  })
})

describe('parseHmsCsv', () => {
  it('accepts a UTF-8 BOM and CRLF without corrupting the first header', () => {
    const parsed = parseHmsCsv(`\uFEFF${csvWithRows(rawRow())}`)

    expect(parsed.headers[0]).toBe(HMS_CSV_REQUIRED_HEADERS[0])
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]).toMatchObject({
      coordinateId: '1001',
      addressId: '0002001',
      streetName: 'Laugavegur',
      houseNumber: '10',
      houseLetter: 'B',
      postalCode: '101',
      lat: 64.145,
      lon: -21.93,
    })
    expect(parsed.diagnostics).toMatchObject({
      sourceRowCount: 1,
      validPointCount: 1,
      canonicalPlaceCount: 1,
    })
  })

  it('parses quoted delimiters and escaped quotes as literal place text', () => {
    const parsed = parseHmsCsv(csvWithRows(rawRow({
      SERHEITI: 'Bær, "Gamli"',
    })))

    expect(parsed.rows[0]?.specialName).toBe('Bær, "Gamli"')
  })

  it('preserves an embedded newline inside a quoted field', () => {
    const parsed = parseHmsCsv(csvWithRows(rawRow({
      SERHEITI: 'Efstidalur\nII',
    })))

    // Source text is collapsed to a stable display/search value after parsing.
    expect(parsed.rows[0]?.specialName).toBe('Efstidalur II')
  })

  it('reports a row with the wrong number of cells as malformed', () => {
    const parsed = parseHmsCsv(csvWithRows(
      rawRow(),
      'only,three,cells',
    ))

    expect(parsed.rows).toHaveLength(1)
    expect(parsed.diagnostics).toMatchObject({
      sourceRowCount: 2,
      malformedRowCount: 1,
    })
  })

  it('fails closed on broken quoting or invalid UTF-8', () => {
    expect(() => parseHmsCsv('"unclosed')).toThrow('hms_csv_unclosed_quote')
    expect(() => parseHmsCsv('"closed"unexpected')).toThrow('hms_csv_character_after_quote')
    expect(() => parseHmsCsv('unexpected"quote')).toThrow('hms_csv_unexpected_quote')
    expect(() => parseHmsCsv(new Uint8Array([0xc3, 0x28]))).toThrow('hms_csv_not_utf8')
  })

  it('tracks invalid coordinates and missing address IDs without emitting them', () => {
    const parsed = parseHmsCsv(csvWithRows(
      rawRow({ HEINUM: '', HNITNUM: 'missing-address' }),
      rawRow({ HEINUM: '2002', HNITNUM: '2002', N_HNIT_WGS84: 'NaN' }),
      rawRow({ HEINUM: '2003', HNITNUM: '2003' }),
    ))

    expect(parsed.rows.map(row => row.addressId)).toEqual(['0002003'])
    expect(parsed.diagnostics.missingAddressIdCount).toBe(1)
    expect(parsed.diagnostics.invalidCoordinateCount).toBe(1)
    expect(parsed.diagnostics.sourceRowCount).toBe(3)
  })

  it('deduplicates HEINUM deterministically and keeps the best coordinate', () => {
    const parsed = parseHmsCsv(csvWithRows(
      rawRow({ HNITNUM: '20', HEINUM: '2004', NAKV_XY: '75' }),
      rawRow({ HNITNUM: '10', HEINUM: '2004', NAKV_XY: '2' }),
    ))

    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]).toMatchObject({
      addressId: '0002004',
      coordinateId: '10',
      accuracyM: 2,
    })
    expect(parsed.diagnostics.duplicateAddressPointCount).toBe(1)
    expect(parsed.diagnostics.canonicalPlaceCount).toBe(1)
  })

  it('sorts canonical rows by stable HMS address ID', () => {
    const parsed = parseHmsCsv(csvWithRows(
      rawRow({ HEINUM: '3000', HNITNUM: '3' }),
      rawRow({ HEINUM: '1000', HNITNUM: '1' }),
      rawRow({ HEINUM: '2000', HNITNUM: '2' }),
    ))

    expect(parsed.rows.map(row => row.addressId)).toEqual(['0001000', '0002000', '0003000'])
  })

  it('accepts Uint8Array input without losing Icelandic text', () => {
    const input = new TextEncoder().encode(csvWithRows(rawRow({ SERHEITI: 'Þingvellir' })))

    expect(parseHmsCsv(input).rows[0]?.specialName).toBe('Þingvellir')
  })
})

describe('HMS point quality and canonical place construction', () => {
  it('prioritizes reviewed points before coordinate accuracy', () => {
    const reviewed = {
      ...BASE_POINT,
      coordinateId: 'reviewed',
      reviewStatus: 1,
      accuracyM: 80,
    }
    const unreviewed = {
      ...BASE_POINT,
      coordinateId: 'unreviewed',
      reviewStatus: 0,
      accuracyM: 1,
    }

    expect(chooseBestHmsPoint([unreviewed, reviewed])).toBe(reviewed)
  })

  it('prioritizes an entrance coordinate before a building midpoint', () => {
    const entrance = {
      ...BASE_POINT,
      coordinateId: 'entrance',
      coordinateType: 3,
      accuracyM: 40,
    }
    const midpoint = {
      ...BASE_POINT,
      coordinateId: 'midpoint',
      coordinateType: 1,
      accuracyM: 1,
    }

    expect(chooseBestHmsPoint([midpoint, entrance])).toBe(entrance)
  })

  it('prefers a more accurate coordinate when other quality fields are equal', () => {
    const worse = { ...BASE_POINT, coordinateId: 'worse', accuracyM: 80 }
    const better = { ...BASE_POINT, coordinateId: 'better', accuracyM: 3 }

    expect(compareHmsPointQuality(better, worse)).toBeLessThan(0)
    expect(chooseBestHmsPoint([worse, better])).toBe(better)
  })

  it('uses a stable coordinate ID tie-break so import order cannot change the result', () => {
    const first = { ...BASE_POINT, coordinateId: '100' }
    const second = { ...BASE_POINT, coordinateId: '200' }

    expect(chooseBestHmsPoint([second, first]).coordinateId).toBe('100')
    expect(chooseBestHmsPoint([first, second]).coordinateId).toBe('100')
  })

  it('prefers the newest parseable correction timestamp after equal quality and accuracy', () => {
    const older = {
      ...BASE_POINT,
      coordinateId: 'older',
      correctedAt: '2025-01-01T00:00:00Z',
    }
    const newer = {
      ...BASE_POINT,
      coordinateId: 'newer',
      correctedAt: '2026-01-01T00:00:00Z',
    }

    expect(chooseBestHmsPoint([older, newer])).toBe(newer)
  })

  it('rejects an empty candidate group', () => {
    expect(() => chooseBestHmsPoint([])).toThrow('hms_point_candidates_empty')
  })

  it('builds deterministic canonical display/search fields without Google identity', () => {
    const place = buildCanonicalHmsPlace(BASE_POINT, { '0000': 'Reykjavík' })

    expect(place).toMatchObject({
      addressId: '0002001',
      displayName: 'Laugavegur 10B',
      formattedAddress: 'Laugavegur 10B, 101 Reykjavík',
      lat: 64.145,
      lon: -21.93,
      postalCode: '101',
      municipalityName: 'Reykjavík',
    })
    expect(place).not.toHaveProperty('placeId')
    expect(place).not.toHaveProperty('googlePlaceId')
  })
})
