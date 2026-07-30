import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetIcelandRoadGraph,
  mockResolveVerifiedHmsPostalIdentity,
  mockResolveVerifiedHmsSourceIdentity,
} = vi.hoisted(() => ({
  mockGetIcelandRoadGraph: vi.fn(),
  mockResolveVerifiedHmsPostalIdentity: vi.fn(),
  mockResolveVerifiedHmsSourceIdentity: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/iceland-routes/roadGraphRuntime.server', () => ({
  getIcelandRoadGraph: mockGetIcelandRoadGraph,
}))
vi.mock('@/lib/iceland-routes/routeAssessmentHmsIdentity.server', () => ({
  resolveVerifiedHmsPostalIdentity: mockResolveVerifiedHmsPostalIdentity,
  resolveVerifiedHmsSourceIdentity: mockResolveVerifiedHmsSourceIdentity,
}))

import { buildIcelandRoadGraph } from '@/lib/iceland-routes/roadGraph'
import type { IcelandRoadGraphSegmentInput } from '@/lib/iceland-routes/roadGraphTypes'
import { resolveRouteAssessmentScope } from '@/lib/iceland-routes/routeAssessmentScope.server'
import {
  parseRouteAssessmentScope,
  type OfficialRoadAnchorAssessmentEndpoint,
  type RuralPostalAreaAssessmentEndpoint,
  type UrbanSettlementAssessmentEndpoint,
} from '@/lib/iceland-routes/routeAssessmentScope'
import type { LatLon } from '@/lib/iceland-routes/types'
import {
  findOfficialSettlementContainingPoint,
  getOfficialPostalAssessmentIdentity,
  getOfficialPostalLocality,
  getOfficialSettlementById,
} from '@/lib/places/officialPlaceDirectory.server'

const urban210Identity = getOfficialPostalAssessmentIdentity('210')
if (!urban210Identity || urban210Identity.kind !== 'urban_settlement') {
  throw new Error('missing urban 210 test identity')
}
const rural301Identity = getOfficialPostalAssessmentIdentity('301')
if (!rural301Identity || rural301Identity.kind !== 'rural_postal_area') {
  throw new Error('missing rural 301 test identity')
}
const rural301PostalAreaId = rural301Identity.postalAreaId
const postal210 = getOfficialPostalLocality('210')!
const postal301 = getOfficialPostalLocality('301')!
const gardabaer = getOfficialSettlementById(urban210Identity.settlementId)!

const navigationOrigin = {
  name: 'Núverandi staðsetning',
  formattedAddress: 'Opaque navigation origin',
  source: 'device',
  placeType: 'point' as const,
  postalCode: '999',
  postalLocality: 'Forged client locality',
  lat: 64.083771,
  lon: -21.929006,
}

const ruralNavigationDestination = {
  name: 'Litla-Fellsöxl',
  formattedAddress: 'Opaque navigation destination',
  source: 'hms',
  sourceId: '1042531',
  placeType: 'address' as const,
  postalCode: '999',
  postalLocality: 'Forged client locality',
  lat: 64.32,
  lon: -21.94,
}

const graphJunction = { lat: 64.25, lon: -21.95 }
const graphDestinationEnd = { lat: 64.4, lon: -21.93 }

function segment(
  id: string,
  geometry: readonly LatLon[],
  overrides: Partial<IcelandRoadGraphSegmentInput> = {},
): IcelandRoadGraphSegmentInput {
  return {
    id,
    source: 'teskeid_fixture',
    sourceId: id,
    geometry,
    roadClass: 'trunk',
    surface: 'paved',
    direction: 'both',
    ...overrides,
  }
}

function readyGraph(extraTargetPoint = false) {
  return buildIcelandRoadGraph([
    segment('urban-approach', [
      { lat: gardabaer.lat, lon: gardabaer.lon },
      graphJunction,
    ]),
    segment('rural-access', extraTargetPoint
      ? [graphJunction, { lat: 64.325, lon: -21.94 }, graphDestinationEnd]
      : [graphJunction, graphDestinationEnd], {
      roadNumber: '51',
      roadName: 'Source-attested fixture road',
    }),
  ], { nodeSnapToleranceM: 2 })
}

function verified(postalCode: '210' | '301', sourceId: string) {
  const postalLocality = getOfficialPostalLocality(postalCode)!
  const assessmentIdentity = getOfficialPostalAssessmentIdentity(postalCode)
  if (!assessmentIdentity || assessmentIdentity.kind === 'unresolved') {
    throw new Error(`missing verified identity ${postalCode}`)
  }
  return {
    sourceId,
    postalCode,
    postalLocality: postalLocality.name,
    postalLocalitySourceId: postalLocality.sourceId,
    distanceM: 0,
    assessmentIdentity,
    anchorKind: assessmentIdentity.kind === 'urban_settlement'
      ? 'settlement_nodes' as const
      : 'projected_road' as const,
  }
}

const verified210 = verified('210', 'origin-hms')
const verified301 = verified('301', '1042531')

function validUrbanEndpoint(
  overrides: Partial<UrbanSettlementAssessmentEndpoint> = {},
): UrbanSettlementAssessmentEndpoint {
  return {
    name: gardabaer.name,
    formattedAddress: gardabaer.name,
    lat: gardabaer.lat,
    lon: gardabaer.lon,
    source: 'official',
    sourceId: gardabaer.id,
    identityKind: 'urban_settlement',
    placeType: 'settlement',
    postalCode: '210',
    postalLocality: postal210.name,
    ...overrides,
  }
}

function validRuralEndpoint(
  overrides: Partial<RuralPostalAreaAssessmentEndpoint> = {},
): RuralPostalAreaAssessmentEndpoint {
  return {
    name: postal301.name,
    formattedAddress: `301 ${postal301.name}`,
    lat: 64.32,
    lon: -21.9407,
    source: 'official',
    sourceId: rural301PostalAreaId,
    identityKind: 'rural_postal_area',
    placeType: 'point',
    postalCode: '301',
    postalLocality: postal301.name,
    postalLocalitySourceId: postal301.sourceId,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetIcelandRoadGraph.mockResolvedValue(readyGraph())
  mockResolveVerifiedHmsSourceIdentity.mockResolvedValue(null)
  mockResolveVerifiedHmsPostalIdentity.mockImplementation(async location => (
    location.sourceId === ruralNavigationDestination.sourceId
      || location.lat === ruralNavigationDestination.lat
      ? verified301
      : verified210
  ))
})

describe('resolveRouteAssessmentScope', () => {
  it('derives urban and rural identities and projects the rural endpoint onto the connected road', async () => {
    expect(findOfficialSettlementContainingPoint(navigationOrigin.lat, navigationOrigin.lon)).toBeNull()
    expect(findOfficialSettlementContainingPoint(
      ruralNavigationDestination.lat,
      ruralNavigationDestination.lon,
    )).toBeNull()

    const scope = await resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination)

    expect(scope.status).toBe('ready')
    if (scope.status !== 'ready') return
    expect(scope.scopeId).toMatch(/^assessment:v3:[A-Za-z0-9_-]{43}$/)
    expect(scope.origin).toMatchObject({
      identityKind: 'urban_settlement',
      sourceId: gardabaer.id,
      name: gardabaer.name,
      lat: gardabaer.lat,
      lon: gardabaer.lon,
      accessDistanceM: expect.any(Number),
    })
    expect(scope.destination).toMatchObject({
      identityKind: 'rural_postal_area',
      sourceId: rural301PostalAreaId,
      name: postal301.name,
      postalCode: '301',
      postalLocalitySourceId: postal301.sourceId,
      placeType: 'point',
      accessDistanceM: expect.any(Number),
    })
    expect(scope.destination).not.toMatchObject({
      lat: ruralNavigationDestination.lat,
      lon: ruralNavigationDestination.lon,
    })
    expect(scope.origin.accessDistanceM).toBeGreaterThan(0)
    expect(scope.destination.accessDistanceM).toBeGreaterThan(0)
    expect(Number.isSafeInteger(scope.origin.accessDistanceM)).toBe(true)
    expect(Number.isSafeInteger(scope.destination.accessDistanceM)).toBe(true)
    expect(scope.destination).not.toMatchObject(graphJunction)
    expect(scope.destination).not.toMatchObject(graphDestinationEnd)
    expect(scope.destination.sourceId).not.toBe(ruralNavigationDestination.sourceId)
    expect(mockResolveVerifiedHmsPostalIdentity).toHaveBeenCalledWith(navigationOrigin)
    expect(mockResolveVerifiedHmsPostalIdentity).toHaveBeenCalledWith(ruralNavigationDestination)
  })

  it('ignores forged client labels/postal metadata and keeps navigation input separate', async () => {
    const scope = await resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination)
    expect(scope.status).toBe('ready')
    if (scope.status !== 'ready') return

    expect(scope.origin.name).toBe(gardabaer.name)
    expect(scope.origin.identityKind).toBe('urban_settlement')
    if (scope.origin.identityKind !== 'urban_settlement') return
    expect(scope.origin.postalCode).toBe(gardabaer.postalCode)
    expect(scope.destination.name).toBe(postal301.name)
    expect(scope.destination.formattedAddress).toBe(`301 ${postal301.name}`)
    expect(JSON.stringify(scope)).not.toContain('Forged client locality')
    expect(JSON.stringify(scope)).not.toContain('Opaque navigation destination')
  })

  it('rehydrates metadata-light map, saved, recent and device coordinates through one verifier', async () => {
    for (const source of ['map', 'saved', 'recent', 'device'] as const) {
      const destination = {
        name: 'Opaque point',
        formattedAddress: 'Opaque point',
        source,
        placeType: 'point' as const,
        lat: ruralNavigationDestination.lat,
        lon: ruralNavigationDestination.lon,
      }
      const scope = await resolveRouteAssessmentScope(navigationOrigin, destination)
      expect(scope.status).toBe('ready')
      expect(mockResolveVerifiedHmsPostalIdentity).toHaveBeenCalledWith(destination)
    }
  })

  it('falls back generically from map, device, saved, recent and legacy points to graph evidence', async () => {
    mockResolveVerifiedHmsPostalIdentity.mockImplementation(async location => (
      location.lat === navigationOrigin.lat && location.lon === navigationOrigin.lon
        ? verified210
        : null
    ))
    const allowedSources = ['map', 'device', 'saved', 'recent', undefined] as const

    for (const source of allowedSources) {
      const destination = {
        name: 'Forged client road label',
        formattedAddress: 'Forged client address',
        ...(source === undefined ? {} : { source }),
        sourceId: 'client-controlled-id',
        placeType: 'point' as const,
        postalCode: '210',
        postalLocality: 'Forged client locality',
        lat: ruralNavigationDestination.lat,
        lon: ruralNavigationDestination.lon,
      }

      const scope = await resolveRouteAssessmentScope(navigationOrigin, destination)

      expect(scope.status).toBe('ready')
      if (scope.status !== 'ready') continue
      expect(scope.destination).toEqual(expect.objectContaining({
        identityKind: 'official_road_anchor',
        source: 'official',
        sourceId: 'official-road:rural-access',
        name: '51 · Source-attested fixture road',
        formattedAddress: '51 · Source-attested fixture road',
        placeType: 'point',
      }))
      expect(scope.destination).not.toMatchObject({
        lat: destination.lat,
        lon: destination.lon,
      })
      expect(JSON.stringify(scope.destination)).not.toContain('Forged')
      expect(JSON.stringify(scope.destination)).not.toContain('client-controlled-id')
    }
    expect(mockResolveVerifiedHmsSourceIdentity).not.toHaveBeenCalled()
  })

  it('derives both generic endpoint identities from their selected graph edges', async () => {
    mockResolveVerifiedHmsPostalIdentity.mockResolvedValue(null)
    const scope = await resolveRouteAssessmentScope(navigationOrigin, {
      ...ruralNavigationDestination,
      source: 'map',
      sourceId: 'client-map-id',
    })

    expect(scope.status).toBe('ready')
    if (scope.status !== 'ready') return
    expect(scope.origin).toMatchObject({
      identityKind: 'official_road_anchor',
      sourceId: 'official-road:urban-approach',
      name: 'urban-approach',
    })
    expect(scope.destination).toMatchObject({
      identityKind: 'official_road_anchor',
      sourceId: 'official-road:rural-access',
      name: '51 · Source-attested fixture road',
    })
    expect(scope.origin).not.toMatchObject({
      lat: navigationOrigin.lat,
      lon: navigationOrigin.lon,
    })
    expect(scope.destination).not.toMatchObject({
      lat: ruralNavigationDestination.lat,
      lon: ruralNavigationDestination.lon,
    })
  })

  it('allows an identity-light HMS row to use a road anchor only after exact source re-attestation', async () => {
    mockResolveVerifiedHmsPostalIdentity.mockImplementation(async location => (
      location.lat === navigationOrigin.lat && location.lon === navigationOrigin.lon
        ? verified210
        : null
    ))
    mockResolveVerifiedHmsSourceIdentity.mockResolvedValue({
      sourceId: ruralNavigationDestination.sourceId,
      distanceM: 0,
    })

    const scope = await resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination)

    expect(scope.status).toBe('ready')
    if (scope.status !== 'ready') return
    expect(mockResolveVerifiedHmsSourceIdentity).toHaveBeenCalledWith(ruralNavigationDestination)
    expect(scope.destination).toMatchObject({
      identityKind: 'official_road_anchor',
      sourceId: 'official-road:rural-access',
      name: '51 · Source-attested fixture road',
    })
    expect(scope.destination.sourceId).not.toContain(ruralNavigationDestination.sourceId)
    expect(scope.destination).not.toMatchObject({
      lat: ruralNavigationDestination.lat,
      lon: ruralNavigationDestination.lon,
    })
  })

  it('keeps stale or forged HMS source identity terminal instead of downgrading', async () => {
    mockResolveVerifiedHmsPostalIdentity.mockImplementation(async location => (
      location.lat === navigationOrigin.lat && location.lon === navigationOrigin.lon
        ? verified210
        : null
    ))
    mockResolveVerifiedHmsSourceIdentity.mockResolvedValue({
      sourceId: 'different-source-id',
      distanceM: 0,
    })

    await expect(resolveRouteAssessmentScope(
      navigationOrigin,
      ruralNavigationDestination,
    )).resolves.toEqual({ status: 'unavailable', reason: 'assessment_area_unavailable' })
    expect(mockResolveVerifiedHmsSourceIdentity).toHaveBeenCalledWith(ruralNavigationDestination)
    expect(mockGetIcelandRoadGraph).not.toHaveBeenCalled()
  })

  it('revalidates exact HMS source identity before settlement containment', async () => {
    mockResolveVerifiedHmsPostalIdentity.mockResolvedValueOnce(null)
    const forgedHmsAtSettlementCenter = {
      name: 'Forged HMS row',
      formattedAddress: 'Forged HMS row',
      source: 'hms',
      sourceId: 'stale-source-id',
      placeType: 'address' as const,
      lat: gardabaer.lat,
      lon: gardabaer.lon,
    }

    await expect(resolveRouteAssessmentScope(
      forgedHmsAtSettlementCenter,
      ruralNavigationDestination,
    )).resolves.toEqual({ status: 'unavailable', reason: 'assessment_area_unavailable' })
    expect(mockGetIcelandRoadGraph).not.toHaveBeenCalled()
  })

  it('never collapses two rural points to same_area even within one postal identity', async () => {
    mockResolveVerifiedHmsPostalIdentity.mockResolvedValue(verified301)
    const scope = await resolveRouteAssessmentScope({
      ...ruralNavigationDestination,
      sourceId: 'rural-origin',
      lat: 64.28,
      lon: -21.946,
    }, {
      ...ruralNavigationDestination,
      sourceId: 'rural-destination',
      lat: 64.36,
      lon: -21.935,
    })

    expect(scope.status).toBe('ready')
    if (scope.status !== 'ready') return
    expect(scope.origin.identityKind).toBe('rural_postal_area')
    expect(scope.destination.identityKind).toBe('rural_postal_area')
  })

  it('returns same_area only for two identical verified urban settlements', async () => {
    const officialGarðabær = {
      name: gardabaer.name,
      formattedAddress: gardabaer.name,
      source: 'official',
      sourceId: gardabaer.id,
      placeType: 'settlement' as const,
      lat: gardabaer.lat,
      lon: gardabaer.lon,
    }
    await expect(resolveRouteAssessmentScope(officialGarðabær, officialGarðabær)).resolves.toEqual({
      status: 'same_area',
      settlementId: gardabaer.id,
      settlementName: gardabaer.name,
    })
    expect(mockResolveVerifiedHmsPostalIdentity).not.toHaveBeenCalled()
    expect(mockGetIcelandRoadGraph).not.toHaveBeenCalled()
  })

  it('routes between two distinct exact points in the same verified settlement', async () => {
    const first = {
      name: gardabaer.name,
      formattedAddress: 'Fyrri nákvæmi staðurinn',
      source: 'official',
      sourceId: gardabaer.id,
      placeType: 'settlement' as const,
      lat: gardabaer.lat,
      lon: gardabaer.lon,
    }
    const second = {
      ...first,
      formattedAddress: 'Seinni nákvæmi staðurinn',
      lat: graphJunction.lat,
      lon: graphJunction.lon,
    }

    const scope = await resolveRouteAssessmentScope(first, second)

    expect(scope.status).toBe('ready')
    if (scope.status !== 'ready') return
    expect(scope.origin.identityKind).toBe('urban_settlement')
    expect(scope.destination.identityKind).toBe('urban_settlement')
    expect(scope.origin.lat).toBeCloseTo(first.lat, 6)
    expect(scope.origin.lon).toBeCloseTo(first.lon, 6)
    expect(scope.destination.lat).toBeCloseTo(second.lat, 6)
    expect(scope.destination.lon).toBeCloseTo(second.lon, 6)
    expect(scope.origin.accessDistanceM).toBe(0)
    expect(scope.destination.accessDistanceM).toBe(0)
  })

  it('falls back from an unroutable exact endpoint to its verified settlement level', async () => {
    const exactOrigin = {
      name: 'Nákvæmur staður',
      formattedAddress: 'Nákvæmur staður í Garðabæ',
      source: 'official',
      sourceId: gardabaer.id,
      placeType: 'settlement' as const,
      lat: gardabaer.lat + 0.1,
      lon: gardabaer.lon - 0.25,
    }
    mockGetIcelandRoadGraph.mockResolvedValueOnce(buildIcelandRoadGraph([
      segment('urban-approach', [
        { lat: gardabaer.lat, lon: gardabaer.lon },
        graphJunction,
      ]),
      segment('rural-access', [graphJunction, graphDestinationEnd], {
        roadNumber: '51',
        roadName: 'Source-attested fixture road',
      }),
      segment('isolated-exact-origin', [
        { lat: exactOrigin.lat, lon: exactOrigin.lon - 0.005 },
        { lat: exactOrigin.lat, lon: exactOrigin.lon + 0.005 },
      ]),
    ], { nodeSnapToleranceM: 2 }))

    const scope = await resolveRouteAssessmentScope(exactOrigin, ruralNavigationDestination)

    expect(scope.status).toBe('ready')
    if (scope.status !== 'ready') return
    expect(scope.origin.name).toBe(gardabaer.name)
    expect(scope.origin.lat).toBeCloseTo(gardabaer.lat, 6)
    expect(scope.origin.lon).toBeCloseTo(gardabaer.lon, 6)
    expect(scope.origin.accessDistanceM).toBeGreaterThan(10_000)
  })

  it('fails closed for unavailable identity and official-artifact provenance drift', async () => {
    mockResolveVerifiedHmsPostalIdentity
      .mockResolvedValueOnce(verified210)
      .mockResolvedValueOnce(null)
    await expect(resolveRouteAssessmentScope(
      navigationOrigin,
      ruralNavigationDestination,
    )).resolves.toEqual({ status: 'unavailable', reason: 'assessment_area_unavailable' })
    expect(mockGetIcelandRoadGraph).not.toHaveBeenCalled()

    mockResolveVerifiedHmsSourceIdentity.mockClear()
    mockResolveVerifiedHmsPostalIdentity.mockResolvedValueOnce({
      ...verified210,
      assessmentIdentity: {
        ...urban210Identity,
        settlementId: 'official:forged-settlement',
      },
    })
    await expect(resolveRouteAssessmentScope(
      navigationOrigin,
      ruralNavigationDestination,
    )).resolves.toEqual({ status: 'unavailable', reason: 'assessment_mapping_invalid' })
    expect(mockResolveVerifiedHmsSourceIdentity).not.toHaveBeenCalled()
    expect(mockGetIcelandRoadGraph).not.toHaveBeenCalled()
  })

  it('keeps one scope ID stable and changes it only with selected-route provenance', async () => {
    const first = await resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination)
    const repeated = await resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination)
    mockGetIcelandRoadGraph.mockResolvedValueOnce(readyGraph(true))
    const drifted = await resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination)

    expect(first.status).toBe('ready')
    expect(repeated.status).toBe('ready')
    expect(drifted.status).toBe('ready')
    if (first.status !== 'ready' || repeated.status !== 'ready' || drifted.status !== 'ready') return
    expect(repeated.scopeId).toBe(first.scopeId)
    expect(drifted.scopeId).not.toBe(first.scopeId)
  })

  it('fails closed when projected-anchor selection exhausts its graph deadline', async () => {
    let now = 0
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now)
    mockGetIcelandRoadGraph.mockImplementationOnce(async () => {
      now = 1_001
      return readyGraph()
    })
    try {
      await expect(resolveRouteAssessmentScope(
        navigationOrigin,
        ruralNavigationDestination,
      )).resolves.toEqual({ status: 'unavailable', reason: 'road_graph_unavailable' })
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('fails closed when graph read rejects, times out or has no connected road', async () => {
    mockGetIcelandRoadGraph.mockRejectedValueOnce(new Error('private graph unavailable'))
    await expect(resolveRouteAssessmentScope(
      navigationOrigin,
      ruralNavigationDestination,
    )).resolves.toEqual({ status: 'unavailable', reason: 'road_graph_unavailable' })

    vi.useFakeTimers()
    try {
      mockGetIcelandRoadGraph.mockReturnValueOnce(new Promise(() => {}))
      const timedOut = resolveRouteAssessmentScope(navigationOrigin, ruralNavigationDestination)
      await vi.advanceTimersByTimeAsync(1_001)
      await expect(timedOut).resolves.toEqual({
        status: 'unavailable', reason: 'road_graph_unavailable',
      })
    } finally {
      vi.useRealTimers()
    }

    mockGetIcelandRoadGraph.mockResolvedValueOnce(buildIcelandRoadGraph([
      segment('origin-only', [
        { lat: gardabaer.lat, lon: gardabaer.lon },
        { lat: gardabaer.lat + 0.01, lon: gardabaer.lon },
      ]),
    ]))
    await expect(resolveRouteAssessmentScope(
      navigationOrigin,
      ruralNavigationDestination,
    )).resolves.toEqual({ status: 'unavailable', reason: 'no_connected_official_road' })
  })
})

describe('parseRouteAssessmentScope', () => {
  const roadEndpoint: OfficialRoadAnchorAssessmentEndpoint = {
    name: 'Official road anchor',
    formattedAddress: 'Official road anchor',
    lat: 64.1,
    lon: -21.8,
    source: 'official',
    sourceId: 'official-road:test-anchor',
    identityKind: 'official_road_anchor',
    placeType: 'point',
  }

  it('accepts all three exact endpoint discriminants and keeps assessment:v3 opaque', () => {
    for (const [origin, destination] of [
      [validUrbanEndpoint(), validRuralEndpoint()],
      [validRuralEndpoint(), roadEndpoint],
    ]) {
      const payload = {
        status: 'ready' as const,
        scopeId: 'assessment:v3:test',
        origin,
        destination,
      }
      expect(parseRouteAssessmentScope(payload)).toEqual(payload)
    }
  })

  it('accepts bounded integer access distances and rejects untrusted distance claims', () => {
    const payload = {
      status: 'ready' as const,
      scopeId: 'assessment:v3:test',
      origin: validUrbanEndpoint({ accessDistanceM: 42 }),
      destination: validRuralEndpoint({ accessDistanceM: 566 }),
    }
    expect(parseRouteAssessmentScope(payload)).toEqual(payload)
    for (const accessDistanceM of [-1, 1.5, 25_001, Number.NaN, '566']) {
      expect(parseRouteAssessmentScope({
        ...payload,
        destination: { ...payload.destination, accessDistanceM },
      })).toBeNull()
    }
  })

  it('accepts and normalizes same_area and unavailable contracts', () => {
    expect(parseRouteAssessmentScope({
      status: 'same_area', settlementId: gardabaer.id, settlementName: ` ${gardabaer.name} `,
    })).toEqual({
      status: 'same_area', settlementId: gardabaer.id, settlementName: gardabaer.name,
    })
    expect(parseRouteAssessmentScope({
      status: 'unavailable', reason: 'road_graph_unavailable',
    })).toEqual({ status: 'unavailable', reason: 'road_graph_unavailable' })
  })

  it.each([
    { ...validUrbanEndpoint(), identityKind: undefined },
    { ...validUrbanEndpoint(), placeType: 'point' },
    { ...validUrbanEndpoint(), postalLocalitySourceId: postal210.sourceId },
    { ...validRuralEndpoint(), placeType: 'settlement' },
    { ...validRuralEndpoint(), sourceId: 'forged-postal-area' },
    { ...validRuralEndpoint(), postalLocalitySourceId: '' },
    { ...roadEndpoint, postalCode: '301' },
    { ...roadEndpoint, identityKind: 'future_identity' },
  ])('rejects incompatible or malformed endpoint discriminant %#', endpoint => {
    expect(parseRouteAssessmentScope({
      status: 'ready', scopeId: 'assessment:v3:test', origin: endpoint, destination: validUrbanEndpoint(),
    })).toBeNull()
  })

  it.each([
    null,
    {},
    { status: 'ready', scopeId: '', origin: validUrbanEndpoint(), destination: validRuralEndpoint() },
    { status: 'same_area', settlementId: gardabaer.id, settlementName: '' },
    { status: 'unavailable', reason: 'made_up_reason' },
    { status: 'future_status' },
    { status: 'unavailable', reason: 'road_graph_unavailable', unexpected: true },
  ])('rejects malformed, future or widened scope payload %#', payload => {
    expect(parseRouteAssessmentScope(payload)).toBeNull()
  })
})
