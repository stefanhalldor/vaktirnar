import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockReadCandidates, mockReadSourceCandidate } = vi.hoisted(() => ({
  mockReadCandidates: vi.fn(),
  mockReadSourceCandidate: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/places/hmsDirectory.server', () => ({
  readHmsPostalIdentityCandidates: mockReadCandidates,
  readHmsSourceIdentityCandidate: mockReadSourceCandidate,
}))

import {
  resolveVerifiedHmsPostalIdentity,
  resolveVerifiedHmsSourceIdentity,
} from '@/lib/iceland-routes/routeAssessmentHmsIdentity.server'
import { getOfficialPostalLocality } from '@/lib/places/officialPlaceDirectory.server'

function candidate(postalCode: string, sourceId: string, distanceM = 0) {
  const postalLocality = getOfficialPostalLocality(postalCode)
  if (!postalLocality) throw new Error(`missing test postal locality ${postalCode}`)
  return {
    sourceId,
    postalCode,
    postalLocality: postalLocality.name,
    postalLocalitySourceId: postalLocality.sourceId,
    distanceM,
  }
}

const point = {
  name: 'Litla-Fellsöxl',
  lat: 64.32,
  lon: -21.94,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockReadCandidates.mockResolvedValue([])
  mockReadSourceCandidate.mockResolvedValue(null)
})

describe('source-derived HMS route-assessment identity', () => {
  it('coalesces two official urban postal areas that derive the same settlement', async () => {
    mockReadCandidates.mockResolvedValue([
      candidate('210', 'address-a', 2),
      candidate('225', 'address-b', 4),
    ])

    const result = await resolveVerifiedHmsPostalIdentity({ ...point, source: 'saved' })

    expect(result).toMatchObject({
      sourceId: 'address-a',
      anchorKind: 'settlement_nodes',
      assessmentIdentity: {
        kind: 'urban_settlement',
        settlementId: 'is50v:1407fdee-3621-5c85-686f-8bd6a4316272',
      },
    })
    expect(mockReadCandidates).toHaveBeenCalledWith(
      { lat: point.lat, lon: point.lon },
      { maxDistanceM: 25 },
    )
  })

  it('resolves a 301 HMS marker as a rural postal identity without a production mapping', async () => {
    mockReadCandidates.mockResolvedValue([candidate('301', '1042531')])

    await expect(resolveVerifiedHmsPostalIdentity({
      ...point,
      source: 'hms',
      sourceId: '1042531',
      postalCode: '999',
      postalLocality: 'Forged client locality',
    })).resolves.toMatchObject({
      sourceId: '1042531',
      postalCode: '301',
      anchorKind: 'projected_road',
      assessmentIdentity: {
        kind: 'rural_postal_area',
        postalAreaId: 'postal:301:8bd88772-0d1d-d85e-9395-f9fc7f392ca8',
      },
    })
    expect(mockReadCandidates).toHaveBeenCalledWith(
      { lat: point.lat, lon: point.lon },
      { maxDistanceM: 25, sourceId: '1042531' },
    )
  })

  it('uses the same bounded lookup for map, device, saved, recent and legacy inputs', async () => {
    for (const [source, maxDistanceM] of [
      ['map', 50],
      ['device', 50],
      ['saved', 25],
      ['recent', 25],
      [undefined, 25],
    ] as const) {
      mockReadCandidates.mockResolvedValueOnce([candidate('301', `source-${source ?? 'legacy'}`)])
      await expect(resolveVerifiedHmsPostalIdentity({ ...point, source })).resolves.toMatchObject({
        assessmentIdentity: { kind: 'rural_postal_area' },
      })
      expect(mockReadCandidates).toHaveBeenLastCalledWith(
        { lat: point.lat, lon: point.lon },
        { maxDistanceM },
      )
    }
  })

  it('accepts duplicate rural addresses only for one composite official postal identity', async () => {
    mockReadCandidates.mockResolvedValue([
      candidate('301', 'rural-main', 0),
      candidate('301', 'rural-unit', 1),
    ])

    await expect(resolveVerifiedHmsPostalIdentity({
      ...point,
      source: 'saved',
    })).resolves.toMatchObject({
      sourceId: 'rural-main',
      anchorKind: 'projected_road',
      assessmentIdentity: { kind: 'rural_postal_area' },
    })
  })

  it('keeps rural postal code in the identity even when official source IDs are shared', async () => {
    const postal815 = candidate('815', 'address-815', 2)
    const postal816 = candidate('816', 'address-816', 3)
    expect(postal815.postalLocalitySourceId).toBe(postal816.postalLocalitySourceId)
    mockReadCandidates.mockResolvedValue([postal815, postal816])

    await expect(resolveVerifiedHmsPostalIdentity({
      ...point,
      source: 'device',
    })).resolves.toBeNull()
  })

  it('fails closed for competing, unresolved or partially invalid candidate sets', async () => {
    mockReadCandidates.mockResolvedValueOnce([
      candidate('210', 'urban-address', 20),
      candidate('301', 'rural-address', 21),
    ])
    await expect(resolveVerifiedHmsPostalIdentity({ ...point, source: 'device' })).resolves.toBeNull()

    mockReadCandidates.mockResolvedValueOnce([
      candidate('210', 'urban-address', 10),
      candidate('345', 'unresolved-address', 12),
    ])
    await expect(resolveVerifiedHmsPostalIdentity({ ...point, source: 'device' })).resolves.toBeNull()

    mockReadCandidates.mockResolvedValueOnce(null)
    await expect(resolveVerifiedHmsPostalIdentity({ ...point, source: 'device' })).resolves.toBeNull()
  })

  it('binds HMS selections to exact source identity and fails closed on drift', async () => {
    mockReadCandidates.mockResolvedValueOnce([candidate('301', '1042531')])
    await expect(resolveVerifiedHmsPostalIdentity({
      ...point,
      source: 'hms',
      sourceId: '1042531',
    })).resolves.toMatchObject({ sourceId: '1042531' })

    mockReadCandidates.mockResolvedValueOnce([])
    await expect(resolveVerifiedHmsPostalIdentity({
      ...point,
      source: 'hms',
      sourceId: 'stale-source-id',
    })).resolves.toBeNull()

    mockReadCandidates.mockClear()
    await expect(resolveVerifiedHmsPostalIdentity({ ...point, source: 'hms' })).resolves.toBeNull()
    expect(mockReadCandidates).not.toHaveBeenCalled()
  })

  it('re-attests one HMS source row for generic road-anchor fallback without returning coordinates', async () => {
    mockReadSourceCandidate.mockResolvedValueOnce({
      sourceId: 'unresolved-but-valid',
      distanceM: 3,
    })
    const result = await resolveVerifiedHmsSourceIdentity({
      ...point,
      source: 'hms',
      sourceId: 'unresolved-but-valid',
      postalCode: '999',
      postalLocality: 'Forged client locality',
    })

    expect(result).toEqual({ sourceId: 'unresolved-but-valid', distanceM: 3 })
    expect(result).not.toHaveProperty('lat')
    expect(result).not.toHaveProperty('lon')
    expect(mockReadSourceCandidate).toHaveBeenCalledWith(
      { lat: point.lat, lon: point.lon },
      { maxDistanceM: 25, sourceId: 'unresolved-but-valid' },
    )
  })

  it('re-attests a named HMS place without requiring postcode metadata', async () => {
    mockReadCandidates.mockResolvedValueOnce([])
    mockReadSourceCandidate.mockResolvedValueOnce({
      sourceId: 'named-place-without-postcode',
      distanceM: 0,
    })

    await expect(resolveVerifiedHmsSourceIdentity({
      name: 'Named place',
      lat: point.lat,
      lon: point.lon,
      source: 'hms',
      sourceId: 'named-place-without-postcode',
    })).resolves.toEqual({
      sourceId: 'named-place-without-postcode',
      distanceM: 0,
    })
    expect(mockReadCandidates).not.toHaveBeenCalled()
  })

  it('fails the HMS source-only gate for stale, duplicate or non-HMS inputs', async () => {
    mockReadSourceCandidate.mockResolvedValueOnce(null)
    await expect(resolveVerifiedHmsSourceIdentity({
      ...point, source: 'hms', sourceId: 'stale',
    })).resolves.toBeNull()

    mockReadSourceCandidate.mockResolvedValueOnce(null)
    await expect(resolveVerifiedHmsSourceIdentity({
      ...point, source: 'hms', sourceId: 'duplicate',
    })).resolves.toBeNull()

    mockReadSourceCandidate.mockClear()
    await expect(resolveVerifiedHmsSourceIdentity({ ...point, source: 'map' }))
      .resolves.toBeNull()
    expect(mockReadSourceCandidate).not.toHaveBeenCalled()
  })

  it('rejects official postal provenance drift and unsupported client sources', async () => {
    mockReadCandidates.mockResolvedValueOnce([{
      ...candidate('301', 'bad-postal-source'),
      postalLocalitySourceId: 'forged-postal-source',
    }])
    await expect(resolveVerifiedHmsPostalIdentity({ ...point, source: 'saved' })).resolves.toBeNull()

    mockReadCandidates.mockClear()
    for (const source of ['google', 'static', 'curated', 'official']) {
      await expect(resolveVerifiedHmsPostalIdentity({ ...point, source })).resolves.toBeNull()
    }
    expect(mockReadCandidates).not.toHaveBeenCalled()
  })
})
