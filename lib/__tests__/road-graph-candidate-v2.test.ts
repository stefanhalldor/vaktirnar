import { describe, expect, it } from 'vitest'

import {
  buildRoadGraphCandidateV2,
  type RoadGraphCandidateRawSource,
} from '@/lib/iceland-routes/roadGraphCandidateV2'
import { createIcelandRoadDirectionInferenceAttestation } from '@/lib/iceland-routes/roadGraphDirectionInference'
import {
  canonicalVegagerdinRoadSourceId,
  VEGAGERDIN_ACCESS_CONNECTOR_SOURCE,
  VEGAGERDIN_ASSESSMENT_ROAD_SOURCE,
  VEGAGERDIN_SURFACE_SOURCE,
  type ArcGisGeoJsonFeatureCollection,
} from '@/lib/iceland-routes/vegagerdinRoadGraphSource'

const SOURCE_UPDATE_ROADS = Date.parse('2026-07-01T00:00:00.000Z')
const SOURCE_UPDATE_SURFACES = Date.parse('2026-07-02T00:00:00.000Z')
const ACTIVE_UNTIL = Date.parse('9999-12-31T00:00:00.000Z')

function collection(features: ArcGisGeoJsonFeatureCollection['features']): ArcGisGeoJsonFeatureCollection {
  return { type: 'FeatureCollection', features }
}

function lineFeature(properties: Record<string, unknown>, coordinates: number[][]) {
  return {
    type: 'Feature' as const,
    geometry: { type: 'LineString' as const, coordinates },
    properties,
  }
}

function road(objectId: number, sectionId: number, coordinates: number[][], direction: unknown = 2) {
  return lineFeature({
    OBJECTID: objectId,
    IDKAFLI: sectionId,
    NRVEGUR: '1',
    NRKAFLI: String(sectionId),
    KAFLIVEGURHEITI: 'Fixture road',
    KAFLILENGD: 1_000,
    KAFLISTODUPPHAF: 0,
    KAFLISTODENDIR: 1_000,
    VEGFLOKKUR: 1,
    VEGHLUTI: 1,
    NRVEGHLUTI: '1',
    STEFNA: direction,
    IDVEGEIGANDI: 0,
    DAGS_INOTKUN: 0,
    DAGS_URNOTKUN: ACTIVE_UNTIL,
    DAGSGRUNNUR: SOURCE_UPDATE_ROADS,
  }, coordinates)
}

function surface(objectId: number, sectionId: number, coordinates: number[][]) {
  return lineFeature({
    OBJECTID: objectId,
    IDKAFLI: sectionId,
    GERD_SL: 1,
    UPPH_STOD: 0,
    ENDA_STOD: 1_000,
    SLITLAGLENGD: 1_000,
    DAGSGRUNNUR: SOURCE_UPDATE_SURFACES,
  }, coordinates)
}

function sources(direction: unknown = 2, reverse = false): RoadGraphCandidateRawSource[] {
  const first = [[-21.90, 64.10], [-21.89, 64.10]]
  const second = [[-21.89, 64.10], [-21.88, 64.10]]
  const roads = [road(1, 10, first, direction), road(2, 20, second)]
  const surfaces = [surface(11, 10, first), surface(12, 20, second)]
  const result: RoadGraphCandidateRawSource[] = [
    { descriptor: VEGAGERDIN_ASSESSMENT_ROAD_SOURCE, collection: collection(reverse ? [...roads].reverse() : roads) },
    { descriptor: VEGAGERDIN_SURFACE_SOURCE, collection: collection(reverse ? [...surfaces].reverse() : surfaces) },
  ]
  return reverse ? result.reverse() : result
}

const CONFIG = {
  goldenRoutes: [{
    id: 'fixture-a-b',
    origin: { lat: 64.10, lon: -21.90 },
    destination: { lat: 64.10, lon: -21.88 },
    minKm: 1.9,
    maxKm: 2.1,
    maxSnapDistanceM: 100,
  }],
  budgets: {
    minAssessmentSegments: 2,
    minNodes: 3,
    minEdges: 4,
    minLargestComponentShare: 1,
    minLatitudeSpanDeg: 0,
    minLongitudeSpanDeg: 0.01,
    minGoldenRoutes: 1,
    maxPayloadBytes: 1_000_000,
  },
} as const

describe('road graph schema-v2 local candidate builder', () => {
  it('builds byte-identical payload and report from the same canonical source content', () => {
    const first = buildRoadGraphCandidateV2({ sources: sources(), ...CONFIG })
    const second = buildRoadGraphCandidateV2({ sources: sources(), ...CONFIG })
    const reordered = buildRoadGraphCandidateV2({ sources: sources(2, true), ...CONFIG })

    expect(first.report.status).toBe('green')
    expect(first.report.checks.directionInferenceTrustedIngestionGate).toBe(true)
    expect(first.report.checks.directionInferenceActivationFreshnessGate).toBe(true)
    expect(first.report.sourceEffectiveAtIso).toBe('2026-07-02T00:00:00.000Z')
    expect(first.report.generator).toEqual({ id: 'teskeid-road-graph-candidate-v2', version: 4 })
    expect(first.report.snapshotSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(first.payloadJson).toBe(second.payloadJson)
    expect(first.reportJson).toBe(second.reportJson)
    expect(first.payloadJson).toBe(reordered.payloadJson)
    expect(first.reportJson).toBe(reordered.reportJson)
    expect(first.payload).toMatchObject({
      directionInferencePolicy: null,
      directionEvidenceArtifacts: [],
      directionAttestations: [],
    })
  })

  it('routes independently of NULL direction without rewriting the official source truth', () => {
    const first = buildRoadGraphCandidateV2({ sources: sources(null), ...CONFIG })
    const second = buildRoadGraphCandidateV2({ sources: sources(null), ...CONFIG })

    expect(first.payload).not.toBeNull()
    expect(first.payloadJson).not.toBeNull()
    expect(first.report.status).toBe('green')
    expect(first.report.checks.directionInferenceTrustedIngestionGate).toBe(true)
    expect(first.report.checks.directionInferenceActivationFreshnessGate).toBe(true)
    expect(first.report.failureChecks).not.toContain('directionInferenceTrustedIngestionGate')
    expect(first.report.checks.knownRoutingDirection).toBe(true)
    expect(first.report.metrics.unknownDirectionSourceCount).toBe(1)
    expect(first.report.metrics.authoritativeDirectionKm).toBe(1)
    expect(first.report.metrics.unresolvedMissingDirectionKm).toBe(1)
    expect(first.report.metrics.provisionalBidirectionalDirectionSourceCount).toBe(1)
    expect(first.report.metrics.provisionalBidirectionalDirectionSegmentCount).toBe(1)
    expect(first.report.metrics.provisionalBidirectionalDirectionKm).toBe(1)
    expect(first.report.metrics.inferredDirectionKm).toBe(0)
    expect(first.report.checks.directionEvidenceValid).toBe(true)
    expect(first.report.checks.routingDirectionResolved).toBe(true)
    expect(first.report.failureChecks).not.toContain('knownRoutingDirection')
    expect(first.payload?.segments.find(segment => segment.directionStatus === 'unknown_missing'))
      .toMatchObject({ direction: 'unknown', directionStatus: 'unknown_missing' })
    expect(first.report.goldenRoutes[0]).toMatchObject({
      status: 'ok',
      authoritativeDirectionKm: 0,
      inferredDirectionKm: 0,
      provisionalDirectionKm: 2,
    })
    expect(first.payloadJson).toBe(second.payloadJson)
    expect(first.reportJson).toBe(second.reportJson)
  })

  it('keeps retired direction inference diagnostic-only and out of routing payloads', () => {
    const unresolved = buildRoadGraphCandidateV2({ sources: sources(null), ...CONFIG })
    const sourceId = canonicalVegagerdinRoadSourceId({
      sourceLayerId: 6,
      sectionId: 10,
      roadPartCode: 1,
      roadPartNumber: '1',
    })
    const policy = {
      schemaVersion: 1 as const,
      policyId: 'direction-policy',
      policyVersion: '1.0.0',
      generatorId: 'direction-generator',
      generatorVersion: '1.0.0',
      minimumConfidenceBps: 9_000,
    }
    const evidenceArtifact = {
      schemaVersion: 1 as const,
      artifactId: 'direction-evidence',
      datasetId: 'independent-direction-dataset',
      datasetVersion: '2026-07',
      sourceUrl: 'https://example.test/direction-evidence.json',
      effectiveAtIso: '2026-07-01T00:00:00.000Z',
      contentSha256: 'c'.repeat(64),
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      generatorId: policy.generatorId,
      generatorVersion: policy.generatorVersion,
      licenseReviewId: 'license-review-1',
    }
    const attestation = createIcelandRoadDirectionInferenceAttestation({
      schemaVersion: 1,
      kind: 'inferred_both',
      segmentSourceId: sourceId,
      sourceProvenanceKey: unresolved.report.sourceProvenanceKey,
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      generatorId: policy.generatorId,
      generatorVersion: policy.generatorVersion,
      evidenceArtifactId: evidenceArtifact.artifactId,
      evidenceContentSha256: evidenceArtifact.contentSha256,
      confidenceBps: 9_500,
      validFromIso: '2026-07-01T00:00:00.000Z',
      expiresAtIso: '2026-08-01T00:00:00.000Z',
    })
    const candidate = buildRoadGraphCandidateV2({
      sources: sources(null),
      goldenRoutes: CONFIG.goldenRoutes,
      budgets: { ...CONFIG.budgets, maxInferredDirectionKmShare: 0.5 },
      directionInference: {
        policy,
        evidenceArtifacts: [evidenceArtifact],
        attestations: [attestation],
      },
    })

    expect(candidate.report.status).toBe('green')
    expect(candidate.report.failureChecks).not.toContain('directionInferenceTrustedIngestionGate')
    expect(candidate.report.failureChecks).not.toContain('directionInferenceActivationFreshnessGate')
    expect(candidate.report.checks).toMatchObject({
      directionEvidenceValid: true,
      directionInferenceTrustedIngestionGate: true,
      directionInferenceActivationFreshnessGate: true,
      routingDirectionResolved: true,
      directionInferenceWithinPolicy: true,
    })
    expect(candidate.report.metrics).toMatchObject({
      authoritativeDirectionSourceCount: 1,
      authoritativeDirectionSegmentCount: 1,
      authoritativeDirectionKm: 1,
      inferredDirectionSourceCount: 1,
      inferredDirectionSegmentCount: 1,
      inferredDirectionKm: 1,
      inferredDirectionKmShare: 0.5,
      unresolvedMissingDirectionSourceCount: 0,
      directionInferenceFailureCount: 0,
    })
    expect(candidate.report.goldenRoutes[0]).toMatchObject({
      authoritativeDirectionKm: 0,
      inferredDirectionKm: 0,
      provisionalDirectionKm: 2,
    })
    expect(candidate.payload).toMatchObject({
      directionInferencePolicy: null,
      directionEvidenceArtifacts: [],
      directionAttestations: [],
    })
    expect(candidate.payloadJson).not.toBeNull()
    expect(candidate.report.snapshotSha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('counts disjoint surface-split portions once instead of counting directed edges', () => {
    const coordinates = [[-21.90, 64.10], [-21.89, 64.10]]
    const splitSurfaceSources: RoadGraphCandidateRawSource[] = [
      {
        descriptor: VEGAGERDIN_ASSESSMENT_ROAD_SOURCE,
        collection: collection([road(1, 10, coordinates, null)]),
      },
      {
        descriptor: VEGAGERDIN_SURFACE_SOURCE,
        collection: collection([
          lineFeature({
            OBJECTID: 11,
            IDKAFLI: 10,
            GERD_SL: 1,
            UPPH_STOD: 0,
            ENDA_STOD: 400,
            SLITLAGLENGD: 400,
            DAGSGRUNNUR: SOURCE_UPDATE_SURFACES,
          }, coordinates),
          lineFeature({
            OBJECTID: 12,
            IDKAFLI: 10,
            GERD_SL: 0,
            UPPH_STOD: 400,
            ENDA_STOD: 1_000,
            SLITLAGLENGD: 600,
            DAGSGRUNNUR: SOURCE_UPDATE_SURFACES,
          }, coordinates),
        ]),
      },
    ]
    const candidate = buildRoadGraphCandidateV2({
      sources: splitSurfaceSources,
      goldenRoutes: [],
      budgets: {
        ...CONFIG.budgets,
        minAssessmentSegments: 0,
        minNodes: 0,
        minEdges: 0,
        minGoldenRoutes: 0,
      },
    })
    expect(candidate.report.status).toBe('red')
    expect(candidate.report.metrics).toMatchObject({
      unresolvedMissingDirectionSourceCount: 1,
      unresolvedMissingDirectionSegmentCount: 2,
      unresolvedMissingDirectionKm: 1,
    })
  })

  it('keeps unknown access-layer direction out of assessment release metrics and gates', () => {
    const baseline = buildRoadGraphCandidateV2({ sources: sources(), ...CONFIG })
    const overlappingAccessRoad = lineFeature({
      ...road(90, 900, [[-21.90, 64.10], [-21.89, 64.10]], null).properties,
      IDVEGEIGANDI: 2,
      VEGFLOKKUR: 12,
    }, [[-21.90, 64.10], [-21.89, 64.10]])
    const withAccess = buildRoadGraphCandidateV2({
      sources: [
        ...sources(),
        {
          descriptor: VEGAGERDIN_ACCESS_CONNECTOR_SOURCE,
          collection: collection([overlappingAccessRoad]),
        },
      ],
      ...CONFIG,
    })

    expect(baseline.report.status).toBe('green')
    expect(withAccess.report.status).toBe('green')
    expect(withAccess.payload).not.toBeNull()
    expect(withAccess.report.failureChecks).toEqual(baseline.report.failureChecks)
    expect(withAccess.report.checks).toEqual(baseline.report.checks)
    expect(withAccess.report.metrics).toMatchObject({
      assessmentSegmentCount: baseline.report.metrics.assessmentSegmentCount,
      unknownDirectionSourceCount: baseline.report.metrics.unknownDirectionSourceCount,
      authoritativeDirectionKm: baseline.report.metrics.authoritativeDirectionKm,
      inferredDirectionKm: baseline.report.metrics.inferredDirectionKm,
      unresolvedMissingDirectionKm: baseline.report.metrics.unresolvedMissingDirectionKm,
      accessSegmentCount: 1,
      accessUnknownDirectionSourceCount: 1,
      accessUnknownDirectionKm: 1,
    })
  })
})
