import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdmin: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mocks.getAdmin }))

import {
  readHmsPostalIdentityCandidates,
  readActiveHmsDataset,
  reverseHmsPlace,
  searchHmsPlaces,
} from '@/lib/places/hmsDirectory.server'

function hmsRow(overrides: Record<string, unknown> = {}) {
  return {
    source_id: '0002001',
    coordinate_id: '12345',
    display_name: 'Laugavegur 10B',
    formatted_address: 'Laugavegur 10B, 101 Reykjavík',
    postal_code: '101',
    municipality_code: '0000',
    municipality_name: 'Reykjavíkurborg',
    lat: 64.145,
    lon: -21.93,
    accuracy_m: '3.5',
    distance_m: '42.25',
    ...overrides,
  }
}

function activeDatasetResult(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error })
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  mocks.from.mockReturnValue({ select })
  return { select, eq, maybeSingle }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getAdmin.mockReturnValue({ rpc: mocks.rpc, from: mocks.from })
  mocks.rpc.mockResolvedValue({ data: [], error: null })
})

describe('HMS directory search repository', () => {
  it('normalizes Icelandic search text and caps the RPC result limit', async () => {
    await searchHmsPlaces('  Þórshöfn   Höfn  ', 999.8)

    expect(mocks.rpc).toHaveBeenCalledWith('search_hms_places', {
      p_query: 'thorshofn hofn',
      p_limit: 10,
    })
  })

  it('clamps the lower result limit before calling SQL', async () => {
    await searchHmsPlaces('Höfn', 0)

    expect(mocks.rpc).toHaveBeenCalledWith('search_hms_places', {
      p_query: 'hofn',
      p_limit: 1,
    })
  })

  it.each(['x', 'x'.repeat(101)])(
    'does not call the database for an invalid normalized query (%s)',
    async query => {
      await expect(searchHmsPlaces(query)).resolves.toEqual([])
      expect(mocks.rpc).not.toHaveBeenCalled()
    },
  )

  it('maps valid public HMS rows without inventing a provider routing ID', async () => {
    mocks.rpc.mockResolvedValue({ data: [hmsRow()], error: null })

    const [place] = await searchHmsPlaces('Laugavegur')

    expect(place).toEqual({
      id: 'hms:0002001',
      source: 'hms',
      sourceId: '0002001',
      name: 'Laugavegur 10B',
      formattedAddress: 'Laugavegur 10B, 101 Reykjavík',
      placeType: 'address',
      postalCode: '101',
      postalLocality: 'Reykjavík',
      municipalityCode: '0000',
      municipality: 'Reykjavíkurborg',
      lat: 64.145,
      lon: -21.93,
      accuracyM: 3.5,
    })
    expect(place).not.toHaveProperty('placeId')
    expect(place).not.toHaveProperty('googlePlaceId')
    expect(place).not.toHaveProperty('routingRef')
  })

  it('corrects a trailing HMS municipality label with the official postcode locality', async () => {
    mocks.rpc.mockResolvedValue({
      data: [hmsRow({
        source_id: 'hella-611',
        display_name: 'Hella',
        formatted_address: 'Hella, 611 Akureyrarbær',
        postal_code: '611',
        municipality_code: '6000',
        municipality_name: 'Akureyrarbær',
        lat: 66.54,
        lon: -18.02,
      })],
      error: null,
    })

    const [place] = await searchHmsPlaces('Hella')

    expect(place).toMatchObject({
      formattedAddress: 'Hella, 611 Grímsey',
      postalCode: '611',
      postalLocality: 'Grímsey',
      municipality: 'Akureyrarbær',
      placeType: 'address',
    })
  })

  it('fails closed when the HMS formatted-address suffix is not recognizable', async () => {
    mocks.rpc.mockResolvedValue({
      data: [hmsRow({
        source_id: 'hella-611-unusual',
        display_name: 'Hella',
        formatted_address: 'Hella við óvenjulegt kennileiti',
        postal_code: '611',
        municipality_name: 'Akureyrarbær',
        lat: 66.54,
        lon: -18.02,
      })],
      error: null,
    })

    const [place] = await searchHmsPlaces('Hella')

    expect(place).toMatchObject({
      formattedAddress: 'Hella við óvenjulegt kennileiti',
      postalLocality: 'Grímsey',
      municipality: 'Akureyrarbær',
    })
  })

  it('drops malformed and outside-Iceland rows returned by the RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        hmsRow({ source_id: '' }),
        hmsRow({ display_name: '' }),
        hmsRow({ lat: 51.5, lon: -0.12 }),
        hmsRow({ source_id: '0002002', lat: '65.68', lon: '-18.10', accuracy_m: 'unknown' }),
      ],
      error: null,
    })

    const results = await searchHmsPlaces('Akureyri')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ sourceId: '0002002', lat: 65.68, lon: -18.1 })
    expect(results[0]).not.toHaveProperty('accuracyM')
  })

  it('returns an empty list for a non-array payload and exposes only a fixed error code', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(searchHmsPlaces('Höfn')).resolves.toEqual([])

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'secret database detail' } })
    await expect(searchHmsPlaces('Höfn')).rejects.toThrow('hms_place_search_failed')
  })
})

describe('HMS directory reverse lookup repository', () => {
  it('rejects malformed and outside-Iceland coordinates without database work', async () => {
    for (const [lat, lon] of [
      [Number.NaN, -21.9],
      [64, Number.POSITIVE_INFINITY],
      [51.5, -0.12],
      [68, -21],
    ]) {
      await expect(reverseHmsPlace(lat, lon)).resolves.toBeNull()
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('clamps distance limits before the nearest-place RPC', async () => {
    await reverseHmsPlace(64.1, -21.9, 1)
    await reverseHmsPlace(64.1, -21.9, 100_000)

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'reverse_hms_place', {
      p_lat: 64.1,
      p_lon: -21.9,
      p_max_distance_m: 100,
    })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'reverse_hms_place', {
      p_lat: 64.1,
      p_lon: -21.9,
      p_max_distance_m: 50_000,
    })
  })

  it('returns the nearest validated place and parsed distance', async () => {
    mocks.rpc.mockResolvedValue({ data: [hmsRow()], error: null })

    await expect(reverseHmsPlace(64.145, -21.93)).resolves.toEqual({
      location: expect.objectContaining({ source: 'hms', sourceId: '0002001' }),
      distanceM: 42.25,
    })
  })

  it('rejects missing, negative, malformed, or over-limit distance output', async () => {
    for (const distance of [undefined, -1, 'unknown', 25_001]) {
      mocks.rpc.mockResolvedValueOnce({ data: [hmsRow({ distance_m: distance })], error: null })
      await expect(reverseHmsPlace(64.145, -21.93, 25_000)).resolves.toBeNull()
    }
  })

  it('returns null for no match and uses a fixed error code on RPC failure', async () => {
    await expect(reverseHmsPlace(64.145, -21.93)).resolves.toBeNull()

    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'internal database detail' } })
    await expect(reverseHmsPlace(64.145, -21.93)).rejects.toThrow('hms_reverse_place_failed')
  })

  it('returns only structured identities within the local assessment cutoff', async () => {
    const activeMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'active-dataset' },
      error: null,
    })
    const activeEq = vi.fn(() => ({ maybeSingle: activeMaybeSingle }))
    const activeSelect = vi.fn(() => ({ eq: activeEq }))
    const point = { lat: 64.145, lon: -21.93 }
    const placesLimit = vi.fn().mockResolvedValue({
      data: [
        hmsRow({
          source_id: 'inside-cutoff',
          postal_code: '210',
          lat: point.lat + 20 / 111_320,
          lon: point.lon,
        }),
        hmsRow({
          source_id: 'outside-cutoff',
          postal_code: '210',
          lat: point.lat + 30 / 111_320,
          lon: point.lon,
        }),
      ],
      error: null,
    })
    const placesOrder = vi.fn(() => ({ limit: placesLimit }))
    const lteLon = vi.fn(() => ({ order: placesOrder }))
    const gteLon = vi.fn(() => ({ lte: lteLon }))
    const lteLat = vi.fn(() => ({ gte: gteLon }))
    const gteLat = vi.fn(() => ({ lte: lteLat }))
    const eqDataset = vi.fn(() => ({ gte: gteLat }))
    const placesSelect = vi.fn(() => ({ eq: eqDataset }))
    mocks.from.mockImplementation((table: string) => (
      table === 'hms_place_dataset_versions'
        ? { select: activeSelect }
        : { select: placesSelect }
    ))

    const identities = await readHmsPostalIdentityCandidates(point, { maxDistanceM: 25 })

    expect(identities).toHaveLength(1)
    expect(identities?.[0]).toMatchObject({
      sourceId: 'inside-cutoff',
      postalCode: '210',
      postalLocality: 'Garðabær',
      postalLocalitySourceId: 'e6b4bdfc-9fab-1237-49c4-15a90b99565f',
    })
    expect(identities?.[0].distanceM).toBeGreaterThan(19)
    expect(identities?.[0].distanceM).toBeLessThan(21)
    expect(identities?.[0]).not.toHaveProperty('lat')
    expect(identities?.[0]).not.toHaveProperty('lon')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(placesLimit).toHaveBeenCalledWith(65)
  })

  it('binds an HMS selection to one exact source row before applying the local cutoff', async () => {
    const activeMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'active-dataset' },
      error: null,
    })
    const activeEq = vi.fn(() => ({ maybeSingle: activeMaybeSingle }))
    const activeSelect = vi.fn(() => ({ eq: activeEq }))
    const point = { lat: 64.145, lon: -21.93 }
    const placesLimit = vi.fn().mockResolvedValue({
      data: [hmsRow({
        source_id: 'selected-hms-address',
        postal_code: '210',
        lat: point.lat + 30 / 111_320,
        lon: point.lon,
      })],
      error: null,
    })
    const placesOrder = vi.fn(() => ({ limit: placesLimit }))
    const eqSource = vi.fn(() => ({ order: placesOrder }))
    const eqDataset = vi.fn(() => ({ eq: eqSource }))
    const placesSelect = vi.fn(() => ({ eq: eqDataset }))
    mocks.from.mockImplementation((table: string) => (
      table === 'hms_place_dataset_versions'
        ? { select: activeSelect }
        : { select: placesSelect }
    ))

    await expect(readHmsPostalIdentityCandidates(
      point,
      { maxDistanceM: 25, sourceId: 'selected-hms-address' },
    )).resolves.toEqual([])

    expect(eqDataset).toHaveBeenCalledWith('dataset_version_id', 'active-dataset')
    expect(eqSource).toHaveBeenCalledWith('source_id', 'selected-hms-address')
    expect(placesLimit).toHaveBeenCalledWith(2)
  })

  it('fails closed when the bounded HMS candidate set overflows', async () => {
    const activeMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'active-dataset' },
      error: null,
    })
    const activeEq = vi.fn(() => ({ maybeSingle: activeMaybeSingle }))
    const activeSelect = vi.fn(() => ({ eq: activeEq }))
    const placesLimit = vi.fn().mockResolvedValue({
      data: Array.from({ length: 65 }, (_, index) => hmsRow({ source_id: `row-${index}` })),
      error: null,
    })
    const placesOrder = vi.fn(() => ({ limit: placesLimit }))
    const lteLon = vi.fn(() => ({ order: placesOrder }))
    const gteLon = vi.fn(() => ({ lte: lteLon }))
    const lteLat = vi.fn(() => ({ gte: gteLon }))
    const gteLat = vi.fn(() => ({ lte: lteLat }))
    const eqDataset = vi.fn(() => ({ gte: gteLat }))
    const placesSelect = vi.fn(() => ({ eq: eqDataset }))
    mocks.from.mockImplementation((table: string) => (
      table === 'hms_place_dataset_versions'
        ? { select: activeSelect }
        : { select: placesSelect }
    ))

    await expect(readHmsPostalIdentityCandidates(
      { lat: 64.145, lon: -21.93 },
      { maxDistanceM: 25 },
    )).resolves.toBeNull()
  })

  it('fails closed when an in-radius HMS row lacks official postal provenance', async () => {
    const activeMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'active-dataset' },
      error: null,
    })
    const activeEq = vi.fn(() => ({ maybeSingle: activeMaybeSingle }))
    const activeSelect = vi.fn(() => ({ eq: activeEq }))
    const placesLimit = vi.fn().mockResolvedValue({
      data: [hmsRow({ postal_code: '999' })],
      error: null,
    })
    const placesOrder = vi.fn(() => ({ limit: placesLimit }))
    const lteLon = vi.fn(() => ({ order: placesOrder }))
    const gteLon = vi.fn(() => ({ lte: lteLon }))
    const lteLat = vi.fn(() => ({ gte: gteLon }))
    const gteLat = vi.fn(() => ({ lte: lteLat }))
    const eqDataset = vi.fn(() => ({ gte: gteLat }))
    const placesSelect = vi.fn(() => ({ eq: eqDataset }))
    mocks.from.mockImplementation((table: string) => (
      table === 'hms_place_dataset_versions'
        ? { select: activeSelect }
        : { select: placesSelect }
    ))

    await expect(readHmsPostalIdentityCandidates(
      { lat: 64.145, lon: -21.93 },
      { maxDistanceM: 25 },
    )).resolves.toBeNull()
  })
})

describe('active HMS dataset repository', () => {
  it('maps the active last-known-good metadata with numeric database values', async () => {
    activeDatasetResult({
      id: 'dataset-1',
      source_content_sha256: 'a'.repeat(64),
      source_bytes: '123456',
      source_row_count: '98765',
      canonical_place_count: '87654',
      promoted_at: '2026-07-27T08:00:00.000Z',
    })

    await expect(readActiveHmsDataset()).resolves.toEqual({
      id: 'dataset-1',
      sourceContentSha256: 'a'.repeat(64),
      sourceBytes: 123456,
      sourceRowCount: 98765,
      canonicalPlaceCount: 87654,
      promotedAtIso: '2026-07-27T08:00:00.000Z',
    })
  })

  it('returns null when no active dataset exists', async () => {
    activeDatasetResult(null)
    await expect(readActiveHmsDataset()).resolves.toBeNull()
  })

  it('fails safely for a database error or malformed active metadata', async () => {
    activeDatasetResult(null, { message: 'sensitive detail' })
    await expect(readActiveHmsDataset()).rejects.toThrow('hms_active_dataset_read_failed')

    activeDatasetResult({
      id: 'dataset-1',
      source_content_sha256: '',
      source_bytes: 'not-a-number',
      source_row_count: 1,
      canonical_place_count: 1,
      promoted_at: '2026-07-27T08:00:00.000Z',
    })
    await expect(readActiveHmsDataset()).rejects.toThrow('hms_active_dataset_invalid')
  })
})
