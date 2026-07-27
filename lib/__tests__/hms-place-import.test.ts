import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdmin: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  readActive: vi.fn(),
  loadMunicipalities: vi.fn(),
  parseCsv: vi.fn(),
  buildCanonical: vi.fn(),
  placeInsert: vi.fn(),
}))

vi.mock('node:crypto', () => {
  const createHash = vi.fn(() => {
    const hash = {
      update: vi.fn(),
      digest: vi.fn(() => 'b'.repeat(64)),
    }
    hash.update.mockReturnValue(hash)
    return hash
  })
  return { createHash, default: { createHash } }
})
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mocks.getAdmin }))
vi.mock('@/lib/places/hmsDirectory.server', () => ({
  readActiveHmsDataset: mocks.readActive,
}))
vi.mock('@/lib/places/municipalities', () => ({
  loadMunicipalityNames: mocks.loadMunicipalities,
}))
vi.mock('@/lib/places/hmsCsv', () => ({
  parseHmsCsv: mocks.parseCsv,
  buildCanonicalHmsPlace: mocks.buildCanonical,
}))

import {
  HMS_ADDRESS_CSV_URL,
  HMS_CANONICAL_BASELINE_PLACES,
  HMS_SOURCE_BASELINE_BYTES,
  HMS_SOURCE_BASELINE_ROWS,
  refreshHmsPlaceDirectory,
} from '@/lib/places/hmsImport.server'

const SOURCE_BUFFER = new ArrayBuffer(HMS_SOURCE_BASELINE_BYTES)

const SOURCE_ROW = {
  coordinateId: '1001',
  addressId: '0002001',
  municipalityCode: '0000',
  settlementCode: null,
  landNumber: '123456',
  postalCode: '101',
  streetName: 'Laugavegur',
  streetNameDative: 'Laugavegi',
  houseNumber: '10',
  houseLetter: null,
  addressSuffix: null,
  specialName: null,
  correctedAt: '2026-07-27T08:00:00.000Z',
  coordinateType: 3,
  reviewStatus: 1,
  accuracyM: 2,
  lat: 64.145,
  lon: -21.93,
}

const DIAGNOSTICS = {
  sourceRowCount: HMS_SOURCE_BASELINE_ROWS,
  validPointCount: HMS_SOURCE_BASELINE_ROWS,
  canonicalPlaceCount: HMS_CANONICAL_BASELINE_PLACES,
  duplicateAddressPointCount: HMS_SOURCE_BASELINE_ROWS - HMS_CANONICAL_BASELINE_PLACES,
  missingAddressIdCount: 0,
  invalidCoordinateCount: 0,
  invalidDataRowCount: 0,
  malformedRowCount: 0,
}

function queryChain(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  chain.eq = vi.fn(() => chain)
  chain.in = vi.fn(() => chain)
  chain.select = vi.fn(() => chain)
  chain.maybeSingle = maybeSingle
  return chain
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.clearAllMocks()

  mocks.placeInsert.mockResolvedValue({ error: null })
  const placeDeleteEq = vi.fn().mockResolvedValue({ error: null })
  const placeDelete = vi.fn(() => ({ eq: placeDeleteEq }))
  const readyChain = queryChain({ data: { id: 'dataset-new' }, error: null })
  // Promotion has already changed the status to active, so building/ready -> failed
  // must match no row. This is the critical deletion guard exercised below.
  const failedChain = queryChain({ data: null, error: null })
  const datasetUpdate = vi.fn((payload: { status?: string }) => (
    payload.status === 'ready' ? readyChain : failedChain
  ))

  mocks.from.mockImplementation((table: string) => {
    if (table === 'hms_places') return { insert: mocks.placeInsert, delete: placeDelete }
    if (table === 'hms_place_dataset_versions') return { update: datasetUpdate }
    throw new Error(`unexpected_table_${table}`)
  })
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'begin_hms_place_refresh') return { data: 'dataset-new', error: null }
    if (name === 'promote_hms_place_dataset') return { data: true, error: null }
    return { data: null, error: { message: 'unexpected RPC' } }
  })
  mocks.getAdmin.mockReturnValue({ rpc: mocks.rpc, from: mocks.from })
  mocks.readActive
    .mockResolvedValueOnce({
      id: 'dataset-old',
      sourceContentSha256: 'a'.repeat(64),
      sourceBytes: HMS_SOURCE_BASELINE_BYTES,
      sourceRowCount: HMS_SOURCE_BASELINE_ROWS,
      canonicalPlaceCount: HMS_CANONICAL_BASELINE_PLACES,
      promotedAtIso: '2026-07-20T08:00:00.000Z',
    })
    // Simulate a post-promotion verification failure.
    .mockResolvedValueOnce({
      id: 'unexpected-active-dataset',
      sourceContentSha256: 'c'.repeat(64),
      sourceBytes: HMS_SOURCE_BASELINE_BYTES,
      sourceRowCount: HMS_SOURCE_BASELINE_ROWS,
      canonicalPlaceCount: HMS_CANONICAL_BASELINE_PLACES,
      promotedAtIso: '2026-07-27T08:00:00.000Z',
    })
  mocks.loadMunicipalities.mockResolvedValue({
    names: { '0000': 'Reykjavíkurborg' },
    source: 'static',
  })
  mocks.parseCsv.mockReturnValue({ rows: [SOURCE_ROW], diagnostics: DIAGNOSTICS })
  mocks.buildCanonical.mockReturnValue({
    ...SOURCE_ROW,
    displayName: 'Laugavegur 10',
    formattedAddress: 'Laugavegur 10, 101 Reykjavík',
    municipalityName: 'Reykjavíkurborg',
    searchNameNormalized: 'laugavegur 10',
    searchAddressNormalized: 'laugavegur 10 101 reykjavik',
    searchSpecialNameNormalized: '',
    searchMunicipalityNormalized: 'reykjavikurborg',
    searchTextNormalized: 'laugavegur 10 101 reykjavik reykjavikurborg',
  })

  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    headers: { get: (name: string) => name === 'content-length' ? String(SOURCE_BUFFER.byteLength) : null },
    arrayBuffer: async () => SOURCE_BUFFER,
  })))
})

describe('HMS last-known-good import safety', () => {
  it('uses bounded 2,000-row chunks to reduce full-import request count', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.parseCsv.mockReturnValue({
      rows: Array.from({ length: 2_001 }, (_, index) => ({
        ...SOURCE_ROW,
        addressId: String(index + 1).padStart(7, '0'),
        coordinateId: String(index + 1),
      })),
      diagnostics: DIAGNOSTICS,
    })

    await refreshHmsPlaceDirectory('admin')

    expect(mocks.placeInsert).toHaveBeenCalledTimes(2)
    expect(mocks.placeInsert.mock.calls[0]?.[0]).toHaveLength(2_000)
    expect(mocks.placeInsert.mock.calls[1]?.[0]).toHaveLength(1)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('does not delete place rows when verification fails after atomic promotion', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const result = await refreshHmsPlaceDirectory('admin')

    expect(result).toEqual({ status: 'error', reason: 'hms_dataset_verify_failed' })
    expect(mocks.rpc).toHaveBeenCalledWith('begin_hms_place_refresh', {
      p_triggered_by: 'admin',
      p_source_url: HMS_ADDRESS_CSV_URL,
    })
    expect(fetch).toHaveBeenCalledWith(HMS_ADDRESS_CSV_URL, expect.objectContaining({
      method: 'GET',
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    }))
    expect(mocks.rpc).toHaveBeenCalledWith('promote_hms_place_dataset', {
      p_dataset_id: 'dataset-new',
    })

    const placeTableCalls = mocks.from.mock.calls
      .filter(([table]) => table === 'hms_places')
      .map(([, ...rest]) => rest)
    expect(placeTableCalls).toHaveLength(1)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('fails validation before staging when too many HMS rows have unmapped municipality codes', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.parseCsv.mockReturnValue({
      rows: Array.from({ length: 200 }, (_, index) => ({
        ...SOURCE_ROW,
        addressId: String(index + 1).padStart(7, '0'),
        coordinateId: String(index + 1),
        municipalityCode: '9998',
      })),
      diagnostics: DIAGNOSTICS,
    })

    const result = await refreshHmsPlaceDirectory('cron')

    expect(result).toEqual({ status: 'error', reason: 'hms_dataset_validation_failed' })
    expect(mocks.buildCanonical).not.toHaveBeenCalled()
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(['begin_hms_place_refresh'])
    expect(mocks.from.mock.calls.some(([table]) => table === 'hms_places')).toBe(false)
    expect(errorSpy).toHaveBeenCalled()
  })
})
