import { describe, expect, it, vi } from 'vitest'
import {
  canonicalVegagerdinRoadSourceId,
  classifyVegagerdinRoadFeature,
  normalizeVegagerdinRoadGraphSegments,
  normalizeVegagerdinRoadGraphSegmentsWithReport,
  vegagerdinDirection,
  vegagerdinDirectionEvidence,
  vegagerdinRoadClass,
  vegagerdinSurface,
  type ArcGisGeoJsonFeatureCollection,
} from '@/lib/iceland-routes/vegagerdinRoadGraphSource'
import { fetchVegagerdinRoadGraphSegments } from '@/lib/iceland-routes/vegagerdinRoadGraphSource.server'

const line = [[-21.9, 64.1, 0], [-21.8, 64.2, 0]]
const EFFECTIVE_AT_EPOCH_MS = Date.parse('2026-07-29T12:00:00.000Z')
const ACTIVE_UNTIL_EPOCH_MS = Date.parse('9999-12-31T00:00:00.000Z')
const OFFICIAL_ROAD_PROPERTIES = {
  IDVEGEIGANDI: 0,
  VEGFLOKKUR: 1,
  VEGHLUTI: 1,
  DAGS_INOTKUN: 0,
  DAGS_URNOTKUN: ACTIVE_UNTIL_EPOCH_MS,
}

function collection(features: ArcGisGeoJsonFeatureCollection['features'], exceeded = false): ArcGisGeoJsonFeatureCollection {
  return { type: 'FeatureCollection', features, exceededTransferLimit: exceeded }
}

function feature(properties: Record<string, unknown>, coordinates: unknown = line) {
  return {
    type: 'Feature' as const,
    geometry: { type: 'LineString' as const, coordinates },
    properties,
  }
}

function roadFeature(properties: Record<string, unknown>, coordinates: unknown = line) {
  return feature({ ...OFFICIAL_ROAD_PROPERTIES, ...properties }, coordinates)
}

function normalize(
  roads: ArcGisGeoJsonFeatureCollection,
  surfaces: ArcGisGeoJsonFeatureCollection,
  roadLayerId = 6,
) {
  return normalizeVegagerdinRoadGraphSegments({
    roads,
    surfaces,
    roadLayerId,
    effectiveAtEpochMs: EFFECTIVE_AT_EPOCH_MS,
  })
}

function sourceId(sectionId: number, roadPartNumber?: string, sourceLayerId: 6 | 8 = 6) {
  return canonicalVegagerdinRoadSourceId({
    sourceLayerId,
    sectionId,
    roadPartCode: 1,
    roadPartNumber,
  })
}

describe('Vegagerdin road graph normalization', () => {
  it('maps official coded values without guessing unknown values', () => {
    expect(vegagerdinSurface(1)).toBe('paved')
    expect(vegagerdinSurface(0)).toBe('gravel')
    expect(vegagerdinSurface(21)).toBe('unknown')
    expect(vegagerdinDirection(-1)).toBe('reverse')
    expect(vegagerdinDirection(1)).toBe('forward')
    expect(vegagerdinDirection(2)).toBe('both')
    expect(vegagerdinDirection(null)).toBe('unknown')
    expect(vegagerdinDirectionEvidence({})).toEqual({
      direction: 'unknown',
      directionStatus: 'unknown_missing',
      directionCode: null,
      directionFieldState: 'missing',
    })
    expect(vegagerdinDirectionEvidence({ STEFNA: null })).toMatchObject({
      directionStatus: 'unknown_missing',
      directionFieldState: 'null',
    })
    expect(vegagerdinDirectionEvidence({ STEFNA: 0 })).toMatchObject({
      directionStatus: 'unknown_domain_drift',
      directionCode: 0,
      directionFieldState: 'integer',
    })
    expect(vegagerdinRoadClass(8)).toBe('highland_trunk')
    expect(vegagerdinRoadClass(999)).toBe('other')
  })

  it('joins direction metadata to surface-split geometry', () => {
    const roads = collection([
      roadFeature({
        OBJECTID: 1,
        IDKAFLI: 10,
        NRVEGUR: '1',
        NRKAFLI: '01-02',
        KAFLIHEITIUPPHAF: 'Upphaf',
        KAFLIHEITIENDIR: 'Endir',
        KAFLIVEGURHEITI: 'Hringvegur',
        VEGFLOKKUR: 1,
        STEFNA: -1,
        NRVEGHLUTI: 'A',
      }),
    ])
    const surfaces = collection([
      feature({
        OBJECTID: 20,
        IDKAFLI: 10,
        NRVEGUR: '1',
        SLITLAGLENGD: 12_000,
        GERD_SL: 1,
      }),
    ])

    expect(normalize(roads, surfaces)).toEqual([expect.objectContaining({
      id: `${sourceId(10, 'A')}:geometry-0`,
      sourceId: sourceId(10, 'A'),
      roadNumber: '1',
      roadName: 'Hringvegur',
      roadClass: 'trunk',
      surface: 'paved',
      direction: 'reverse',
      directionStatus: 'authoritative_reverse',
      lengthM: undefined,
      isFRoad: false,
      networkRole: 'assessment_public',
      official: expect.objectContaining({
        sourceLayerId: 6,
        sourceObjectId: 1,
        sectionId: 10,
        sectionNumber: '01-02',
        sectionStartLabel: 'Upphaf',
        sectionEndLabel: 'Endir',
        roadPartCode: 1,
        roadPartNumber: 'A',
        ownerCode: 0,
        directionCode: -1,
        directionFieldState: 'integer',
      }),
    })])
    expect(normalize(roads, surfaces)[0].geometry).toEqual([
      { lat: 64.1, lon: -21.9, elevationM: 0 },
      { lat: 64.2, lon: -21.8, elevationM: 0 },
    ])
  })

  it('marks F roads without claiming that all F roads are currently seasonal', () => {
    const roads = collection([roadFeature({ OBJECTID: 1, IDKAFLI: 10, NRVEGUR: 'F35', VEGFLOKKUR: 8, STEFNA: 2 })])
    const surfaces = collection([feature({ OBJECTID: 20, IDKAFLI: 10, GERD_SL: 0 })])
    const [result] = normalize(roads, surfaces)
    expect(result).toMatchObject({
      isFRoad: true,
      isMountainRoad: true,
      surface: 'gravel',
    })
    expect(result.isSeasonal).toBeUndefined()
  })

  it('rejects geometry outside Icelandic bounds', () => {
    const roads = collection([roadFeature({ OBJECTID: 1, IDKAFLI: 10 }, [[-21.9, 64.1], [0, 0], [-21.8, 64.2]])])
    const surfaces = collection([feature({ OBJECTID: 20, IDKAFLI: 10 })])
    expect(normalize(roads, surfaces)).toEqual([])
  })

  it('splits a mixed road section using complete official station intervals', () => {
    const roads = collection([roadFeature({
      OBJECTID: 1,
      IDKAFLI: 10,
      VEGFLOKKUR: 1,
      STEFNA: 2,
      KAFLILENGD: 1_000,
      KAFLISTODUPPHAF: 0,
      KAFLISTODENDIR: 1_000,
    }, [[-21.9, 64.1], [-21.8, 64.2], [-21.7, 64.3]])])
    const surfaces = collection([
      feature({ OBJECTID: 20, IDKAFLI: 10, GERD_SL: 1, UPPH_STOD: 0, ENDA_STOD: 400, SLITLAGLENGD: 400 }),
      feature({ OBJECTID: 21, IDKAFLI: 10, GERD_SL: 0, UPPH_STOD: 400, ENDA_STOD: 1_000, SLITLAGLENGD: 600 }),
    ])
    const result = normalize(roads, surfaces)
    expect(result).toHaveLength(2)
    expect(result.map(segment => ({ id: segment.id, surface: segment.surface, lengthM: segment.lengthM }))).toEqual([
      { id: `${sourceId(10)}:geometry-0:surface-0`, surface: 'paved', lengthM: 400 },
      { id: `${sourceId(10)}:geometry-0:surface-1`, surface: 'gravel', lengthM: 600 },
    ])
    expect(result[0].geometry[0]).toEqual({ lat: 64.1, lon: -21.9 })
    expect(result[0].geometry.at(-1)).toEqual(result[1].geometry[0])
    expect(result[1].geometry.at(-1)).toEqual({ lat: 64.3, lon: -21.7 })
  })

  it('fails closed to mixed when official station intervals have a gap', () => {
    const roads = collection([roadFeature({
      OBJECTID: 1,
      IDKAFLI: 10,
      VEGFLOKKUR: 1,
      STEFNA: 2,
      KAFLILENGD: 1_000,
      KAFLISTODUPPHAF: 0,
      KAFLISTODENDIR: 1_000,
    })])
    const surfaces = collection([
      feature({ OBJECTID: 20, IDKAFLI: 10, GERD_SL: 1, UPPH_STOD: 0, ENDA_STOD: 400, SLITLAGLENGD: 400 }),
      feature({ OBJECTID: 21, IDKAFLI: 10, GERD_SL: 0, UPPH_STOD: 500, ENDA_STOD: 1_000, SLITLAGLENGD: 500 }),
    ])
    const result = normalize(roads, surfaces)
    expect(result).toHaveLength(1)
    expect(result[0].surface).toBe('mixed')
  })

  it('maps surface intervals in geometry order when road stationing runs in reverse', () => {
    const roads = collection([roadFeature({
      OBJECTID: 1,
      IDKAFLI: 10,
      VEGFLOKKUR: 1,
      STEFNA: 2,
      KAFLILENGD: 1_000,
      KAFLISTODUPPHAF: 1_000,
      KAFLISTODENDIR: 0,
    }, [[-21.9, 64.1], [-21.8, 64.2], [-21.7, 64.3]])])
    const surfaces = collection([
      feature({ OBJECTID: 20, IDKAFLI: 10, GERD_SL: 1, UPPH_STOD: 0, ENDA_STOD: 600, SLITLAGLENGD: 600 }),
      feature({ OBJECTID: 21, IDKAFLI: 10, GERD_SL: 0, UPPH_STOD: 600, ENDA_STOD: 1_000, SLITLAGLENGD: 400 }),
    ])

    const result = normalize(roads, surfaces)
    expect(result.map(segment => ({ surface: segment.surface, lengthM: segment.lengthM }))).toEqual([
      { surface: 'gravel', lengthM: 400 },
      { surface: 'paved', lengthM: 600 },
    ])
    expect(result[0].geometry[0]).toEqual({ lat: 64.1, lon: -21.9 })
    expect(result[0].geometry.at(-1)).toEqual(result[1].geometry[0])
    expect(result[1].geometry.at(-1)).toEqual({ lat: 64.3, lon: -21.7 })
  })

  it('classifies layer 8 only as an unassessed access connector', () => {
    const roads = collection([roadFeature({
      OBJECTID: 7,
      IDKAFLI: 70,
      IDVEGEIGANDI: 2,
      VEGFLOKKUR: 12,
      STEFNA: 2,
    })])
    const surfaces = collection([feature({
      OBJECTID: 70,
      IDKAFLI: 70,
      GERD_SL: 1,
      UPPH_STOD: 0,
      ENDA_STOD: 100,
      SLITLAGLENGD: 100,
    })])
    const [segment] = normalize(roads, surfaces, 8)
    expect(segment).toMatchObject({
      id: `${sourceId(70, undefined, 8)}:geometry-0`,
      sourceId: sourceId(70, undefined, 8),
      networkRole: 'access_connector',
      roadClass: 'other',
      surface: 'unknown',
      direction: 'both',
      directionStatus: 'authoritative_both',
      official: { sourceLayerId: 8, ownerCode: 2, roadClassCode: 12 },
    })
  })

  it('reports source-domain drift and never promotes unauthorized rows', () => {
    const roads = collection([
      roadFeature({ OBJECTID: 2, IDKAFLI: 20, IDVEGEIGANDI: 99, VEGFLOKKUR: 999, VEGHLUTI: 999 }),
      roadFeature({ OBJECTID: 1, IDKAFLI: 10, STEFNA: 999 }),
    ])
    const { segments, report } = normalizeVegagerdinRoadGraphSegmentsWithReport({
      roads,
      surfaces: collection([]),
      roadLayerId: 6,
      effectiveAtEpochMs: EFFECTIVE_AT_EPOCH_MS,
    })
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({
      id: `${sourceId(10)}:geometry-0`,
      sourceId: sourceId(10),
      direction: 'unknown',
      directionStatus: 'unknown_domain_drift',
      official: { directionCode: 999, directionFieldState: 'integer' },
    })
    expect(report).toMatchObject({
      acceptedFeatureCount: 1,
      excludedFeatureCount: 1,
      domainDriftDetected: true,
      nonDirectionDomainDriftDetected: true,
      directionDomainDriftDetected: true,
      unknownOwnerCodes: [99],
      unknownRoadClassCodes: [999],
      unknownRoadPartCodes: [999],
      unknownDirectionCodes: [999],
      unknownDirectionFeatureCount: 1,
    })
    expect(report.exclusionCounts.unknown_owner_code).toBe(1)
  })

  it('audits missing and explicit NULL separately without treating either as two-way', () => {
    const roads = collection([
      roadFeature({ OBJECTID: 1, IDKAFLI: 10 }),
      roadFeature({ OBJECTID: 2, IDKAFLI: 20, STEFNA: null }),
      roadFeature({ OBJECTID: 3, IDKAFLI: 30, STEFNA: 0 }),
    ])
    const { segments, report } = normalizeVegagerdinRoadGraphSegmentsWithReport({
      roads,
      surfaces: collection([]),
      roadLayerId: 6,
      effectiveAtEpochMs: EFFECTIVE_AT_EPOCH_MS,
    })
    expect(segments.map(segment => ({
      sectionId: segment.official?.sectionId,
      direction: segment.direction,
      status: segment.directionStatus,
      fieldState: segment.official?.directionFieldState,
      code: segment.official?.directionCode,
    }))).toEqual([
      { sectionId: 10, direction: 'unknown', status: 'unknown_missing', fieldState: 'missing', code: null },
      { sectionId: 20, direction: 'unknown', status: 'unknown_missing', fieldState: 'null', code: null },
      { sectionId: 30, direction: 'unknown', status: 'unknown_domain_drift', fieldState: 'integer', code: 0 },
    ])
    expect(report).toMatchObject({
      unknownDirectionFeatureCount: 3,
      unknownMissingDirectionFeatureCount: 2,
      unknownDomainDriftDirectionFeatureCount: 1,
      unknownDirectionCodes: [0],
      directionDomainDriftDetected: true,
      nonDirectionDomainDriftDetected: false,
    })
  })

  it('rejects every row in a conflicting duplicate semantic identity', () => {
    const roads = collection([
      roadFeature({ OBJECTID: 1, IDKAFLI: 10, STEFNA: 2 }),
      roadFeature({ OBJECTID: 2, IDKAFLI: 10, STEFNA: 2 }, [[-21.7, 64.3], [-21.6, 64.4]]),
    ])
    const { segments, report } = normalizeVegagerdinRoadGraphSegmentsWithReport({
      roads,
      surfaces: collection([]),
      roadLayerId: 6,
      effectiveAtEpochMs: EFFECTIVE_AT_EPOCH_MS,
    })
    expect(segments).toEqual([])
    expect(report.exclusionCounts.invalid_identity).toBe(2)
    expect(report.duplicateSemanticIdentityFeatureCount).toBe(2)
    expect(report.schemaDriftDetected).toBe(true)
  })

  it('fails closed for inactive lifecycle and private rows in the assessed layer', () => {
    expect(classifyVegagerdinRoadFeature({
      properties: {
        ...OFFICIAL_ROAD_PROPERTIES,
        OBJECTID: 1,
        IDKAFLI: 10,
        DAGS_URNOTKUN: EFFECTIVE_AT_EPOCH_MS,
      },
      sourceLayerId: 6,
      effectiveAtEpochMs: EFFECTIVE_AT_EPOCH_MS,
    })).toEqual({ classification: 'excluded', reason: 'inactive_lifecycle' })

    expect(classifyVegagerdinRoadFeature({
      properties: {
        ...OFFICIAL_ROAD_PROPERTIES,
        OBJECTID: 1,
        IDKAFLI: 10,
        IDVEGEIGANDI: 2,
      },
      sourceLayerId: 6,
      effectiveAtEpochMs: EFFECTIVE_AT_EPOCH_MS,
    })).toEqual({ classification: 'excluded', reason: 'unauthorized_owner' })
  })
})

describe('Vegagerdin road graph fetch boundary', () => {
  it('paginates both official layers and sends a fixed allowlisted query', async () => {
    const canonicalRoadFeature = roadFeature({ OBJECTID: 1, IDKAFLI: 10, NRVEGUR: '1', VEGFLOKKUR: 1, STEFNA: 2 })
    const surfaceFeature = feature({ OBJECTID: 2, IDKAFLI: 10, NRVEGUR: '1', GERD_SL: 1 })
    const calls: string[] = []
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      calls.push(url)
      const isRoad = url.includes('/vegakerfi/')
      const offset = new URL(url).searchParams.get('resultOffset')
      const payload = offset === '0'
        ? collection([isRoad ? canonicalRoadFeature : surfaceFeature], true)
        : collection([])
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const result = await fetchVegagerdinRoadGraphSegments({ fetchImpl })
    expect(result).toHaveLength(1)
    expect(calls).toHaveLength(4)
    for (const call of calls) {
      const url = new URL(call)
      const roadRequest = call.includes('/vegakerfi/')
      expect(url.hostname).toBe('vegasja.vegagerdin.is')
      expect(url.searchParams.get('where')).toBe('1=1')
      expect(url.searchParams.get('outSR')).toBe('4326')
      expect(url.searchParams.get('f')).toBe('geojson')
      expect(url.searchParams.get('returnZ')).toBe(roadRequest ? 'true' : 'false')
    }
    const roadUrl = new URL(calls.find(call => call.includes('/vegakerfi/'))!)
    expect(roadUrl.searchParams.get('outFields')).toContain('KAFLISTODUPPHAF')
    expect(roadUrl.searchParams.get('outFields')).toContain('KAFLISTODENDIR')
    expect(roadUrl.searchParams.get('outFields')).toContain('KAFLIHEITIUPPHAF')
    expect(roadUrl.searchParams.get('outFields')).toContain('KAFLIHEITIENDIR')
    expect(roadUrl.searchParams.get('outFields')).toContain('VEGHLUTI')
    expect(roadUrl.searchParams.get('outFields')).toContain('NRVEGHLUTI')
    expect(roadUrl.searchParams.get('outFields')).toContain('IDVEGEIGANDI')
    expect(roadUrl.searchParams.get('outFields')).toContain('DAGS_INOTKUN')
    expect(roadUrl.searchParams.get('outFields')).toContain('DAGS_URNOTKUN')
    const surfaceUrl = new URL(calls.find(call => call.includes('/slitlag/'))!)
    expect(surfaceUrl.searchParams.get('outFields')).toContain('UPPH_STOD')
    expect(surfaceUrl.searchParams.get('outFields')).toContain('ENDA_STOD')
  })

  it('fails closed on an upstream HTTP error', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 503 }))
    await expect(fetchVegagerdinRoadGraphSegments({ fetchImpl }))
      .rejects.toThrow('vegagerdin_road_graph_source_http_503')
  })
})
