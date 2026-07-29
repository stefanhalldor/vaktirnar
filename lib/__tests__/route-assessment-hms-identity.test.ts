import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockReadCandidates } = vi.hoisted(() => ({
  mockReadCandidates: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/places/hmsDirectory.server', () => ({
  readHmsPostalIdentityCandidates: mockReadCandidates,
}))

import { resolveVerifiedHmsPostalIdentity } from '@/lib/iceland-routes/routeAssessmentHmsIdentity.server'

const POSTAL_SOURCE = {
  '210': 'e6b4bdfc-9fab-1237-49c4-15a90b99565f',
  '225': 'b57a92df-8ed9-4603-6ab3-d0b5778be777',
  '851': '453b1695-1c60-4a6e-3a69-fd9620c3adb0',
} as const

function candidate(postalCode: keyof typeof POSTAL_SOURCE, sourceId: string, distanceM = 0) {
  return {
    sourceId,
    postalCode,
    postalLocality: postalCode === '851' ? 'Hella, dreifbýli' : 'Garðabær',
    postalLocalitySourceId: POSTAL_SOURCE[postalCode],
    distanceM,
  }
}

const point = {
  name: 'Víðibakki',
  lat: 63.901234,
  lon: -20.201234,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockReadCandidates.mockResolvedValue([])
})

describe('verified HMS route-assessment identity', () => {
  it('rehydrates metadata-light saved coordinates and accepts multiple rows with one configured identity', async () => {
    mockReadCandidates.mockResolvedValue([
      candidate('210', 'address-a', 2),
      candidate('225', 'address-b', 4),
    ])

    const result = await resolveVerifiedHmsPostalIdentity({ ...point, source: 'saved' })

    expect(result).toMatchObject({
      sourceId: 'address-a',
      anchorKind: 'settlement_nodes',
      mapping: {
        assessmentSettlementId: 'is50v:1407fdee-3621-5c85-686f-8bd6a4316272',
        expectedSettlementName: 'Garðabær',
      },
    })
    expect(mockReadCandidates).toHaveBeenCalledWith(
      { lat: point.lat, lon: point.lon },
      { maxDistanceM: 25 },
    )
  })

  it('fails closed at a boundary with competing configured assessment identities', async () => {
    mockReadCandidates.mockResolvedValue([
      candidate('210', 'gardabaer-address', 20),
      candidate('851', 'hella-address', 21),
    ])

    await expect(resolveVerifiedHmsPostalIdentity({
      ...point,
      source: 'device',
    })).resolves.toBeNull()
  })

  it('fails closed when any in-radius HMS candidate lacks a configured assessment identity', async () => {
    mockReadCandidates.mockResolvedValue([
      candidate('210', 'configured-address', 10),
      {
        sourceId: 'unmapped-address',
        postalCode: '200',
        postalLocality: 'Kópavogur',
        postalLocalitySourceId: 'official-postal-200',
        distanceM: 12,
      },
    ])

    await expect(resolveVerifiedHmsPostalIdentity({
      ...point,
      source: 'device',
    })).resolves.toBeNull()
  })

  it('accepts duplicate rural addresses only when they share the same configured projection identity', async () => {
    mockReadCandidates.mockResolvedValue([
      candidate('851', 'vidibakki-main', 0),
      candidate('851', 'vidibakki-unit', 1),
    ])

    await expect(resolveVerifiedHmsPostalIdentity({
      ...point,
      source: 'saved',
    })).resolves.toMatchObject({
      sourceId: 'vidibakki-main',
      anchorKind: 'projected_road',
      mapping: { assessmentSettlementId: 'hagstofa:1120' },
    })
  })

  it('uses the device cutoff and ignores a forged client postcode', async () => {
    mockReadCandidates.mockResolvedValue([candidate('210', 'actual-nearby-address', 42)])

    const result = await resolveVerifiedHmsPostalIdentity({
      ...point,
      source: 'device',
      postalCode: '851',
      postalLocality: 'Hella, dreifbýli',
    })

    expect(result?.mapping.expectedSettlementName).toBe('Garðabær')
    expect(result?.postalCode).toBe('210')
    expect(mockReadCandidates).toHaveBeenCalledWith(
      { lat: point.lat, lon: point.lon },
      { maxDistanceM: 50 },
    )
  })

  it('binds an HMS selection to its exact source identity and fails closed on source drift', async () => {
    mockReadCandidates.mockResolvedValueOnce([candidate('851', 'hms-vidibakki')])
    await expect(resolveVerifiedHmsPostalIdentity({
      ...point,
      source: 'hms',
      sourceId: 'hms-vidibakki',
    })).resolves.toMatchObject({
      sourceId: 'hms-vidibakki',
      anchorKind: 'projected_road',
    })
    expect(mockReadCandidates).toHaveBeenLastCalledWith(
      { lat: point.lat, lon: point.lon },
      { maxDistanceM: 25, sourceId: 'hms-vidibakki' },
    )

    mockReadCandidates.mockResolvedValueOnce([])
    await expect(resolveVerifiedHmsPostalIdentity({
      ...point,
      source: 'hms',
      sourceId: 'stale-source-id',
    })).resolves.toBeNull()
  })

  it('rejects postal provenance drift and unsupported client sources without guessing', async () => {
    mockReadCandidates.mockResolvedValueOnce([{
      ...candidate('851', 'bad-postal-source'),
      postalLocalitySourceId: 'forged-postal-source',
    }])
    await expect(resolveVerifiedHmsPostalIdentity({
      ...point,
      source: 'saved',
    })).resolves.toBeNull()

    mockReadCandidates.mockClear()
    await expect(resolveVerifiedHmsPostalIdentity({
      ...point,
      source: 'google',
    })).resolves.toBeNull()
    expect(mockReadCandidates).not.toHaveBeenCalled()
  })
})
