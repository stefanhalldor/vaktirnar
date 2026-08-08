import { describe, expect, it } from 'vitest'
import { buildIcelandRoadGraph } from '@/lib/iceland-routes/roadGraph'
import {
  canonicalIcelandRoadSourceProvenanceKey,
  createIcelandRoadDirectionInferenceAttestation,
} from '@/lib/iceland-routes/roadGraphDirectionInference'
import {
  canonicalRoadGraphSnapshotJson,
  canonicalRoadGraphSnapshotContentJson,
  canonicalRoadGraphSnapshotValueJson,
  parseRoadGraphSnapshotPayload,
  parseRoadGraphSnapshotPayloadLegacyV1Compatibility,
  parseRoadGraphSnapshotPayloadV2,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_ENDPOINT_JUNCTION_V3,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4,
  ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_RECIPROCAL_V1,
  serializeRoadGraphSnapshotSegmentsV1,
  type RoadGraphSnapshotPayloadV1,
  type RoadGraphSnapshotPayloadV2,
} from '@/lib/iceland-routes/roadGraphSnapshotFormat'
import {
  canonicalVegagerdinRoadSourceId,
  VEGAGERDIN_ASSESSMENT_ROAD_SOURCE,
  VEGAGERDIN_SURFACE_SOURCE,
} from '@/lib/iceland-routes/vegagerdinRoadGraphSource'

const PAYLOAD: RoadGraphSnapshotPayloadV1 = {
  schemaVersion: 1,
  source: 'vegagerdin',
  sourceFetchedAtIso: '2026-07-26T15:00:00.000Z',
  nodeSnapToleranceM: 20,
  segments: [{
    id: '1', source: 'vegagerdin', sourceId: '1',
    geometry: [{ lat: 64, lon: -22 }, { lat: 65, lon: -21 }],
    roadClass: 'trunk', surface: 'paved', direction: 'both',
  }],
}

const V2_SOURCE_ID = canonicalVegagerdinRoadSourceId({
  sourceLayerId: 6,
  sectionId: 10,
  roadPartCode: 1,
  roadPartNumber: '1',
})

const V2_SEGMENT: RoadGraphSnapshotPayloadV2['segments'][number] = {
  id: `${V2_SOURCE_ID}:geometry-0`,
  source: 'vegagerdin',
  sourceId: V2_SOURCE_ID,
  geometry: [{ lat: 64, lon: -22, elevationM: 10 }, { lat: 65, lon: -21, elevationM: 20 }],
  roadClass: 'trunk',
  surface: 'paved',
  direction: 'both',
  directionStatus: 'authoritative_both',
  networkRole: 'assessment_public',
  official: {
    provider: 'vegagerdin',
    sourceLayerId: 6,
    sourceObjectId: 1,
    sectionId: 10,
    sectionNumber: '01-01',
    sectionStartLabel: 'A',
    sectionEndLabel: 'B',
    roadPartCode: 1,
    roadPartNumber: '1',
    ownerCode: 0,
    roadClassCode: 1,
    directionCode: 2,
    directionFieldState: 'integer',
    inUseFromEpochMs: 0,
    outOfUseAtEpochMs: Date.parse('9999-12-31T00:00:00.000Z'),
  },
}

const PAYLOAD_V2: RoadGraphSnapshotPayloadV2 = {
  schemaVersion: 2,
  source: 'vegagerdin',
  sourceEffectiveAtIso: '2026-07-26T15:00:00.000Z',
  nodeSnapToleranceM: 20,
  sourceArtifacts: [
    { descriptor: VEGAGERDIN_ASSESSMENT_ROAD_SOURCE, featureCount: 1, contentSha256: 'a'.repeat(64) },
    { descriptor: VEGAGERDIN_SURFACE_SOURCE, featureCount: 1, contentSha256: 'b'.repeat(64) },
  ],
  directionInferencePolicy: null,
  directionEvidenceArtifacts: [],
  directionAttestations: [],
  segments: [V2_SEGMENT],
}

describe('road graph snapshot payload', () => {
  it('accepts a bounded schema-v1 Vegagerðin payload', () => {
    expect(parseRoadGraphSnapshotPayload(PAYLOAD)).toEqual(PAYLOAD)
  })

  it('round-trips retired STEFNA metadata through a bidirectional legacy-readable v1 payload', () => {
    const unknownMissing = {
      ...V2_SEGMENT,
      direction: 'unknown' as const,
      directionStatus: 'unknown_missing' as const,
      official: {
        ...V2_SEGMENT.official!,
        directionCode: null,
        directionFieldState: 'null' as const,
      },
    }
    const segments = serializeRoadGraphSnapshotSegmentsV1([unknownMissing])
    const runtimeBuildContract: NonNullable<RoadGraphSnapshotPayloadV1['runtimeBuildContract']> = {
      schemaVersion: 1 as const,
      policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT,
      diagnostics: {
        nodeCount: 2,
        edgeCount: 2,
        segmentCount: 1,
        weakComponentCount: 1,
        largestWeakComponentNodeCount: 2,
        isolatedNodeCount: 0,
        surfaceEdgeCounts: { paved: 2, gravel: 0, mixed: 0, unknown: 0 },
        derivedSpeedEdgeCount: 2,
        topologyConnectorEdgeCount: 0,
      },
      goldenRoutePassCount: 20,
      goldenRouteTotalCount: 20,
      topologyReceiptIds: [],
    }
    const enhancedPayload: RoadGraphSnapshotPayloadV1 = {
      ...PAYLOAD,
      runtimeBuildContract,
      segments,
    }

    expect(segments[0]).toMatchObject({
      direction: 'both',
      directionStatus: 'unknown_missing',
      official: { directionCode: null, directionFieldState: 'null' },
    })
    expect(parseRoadGraphSnapshotPayload(enhancedPayload)).toEqual(enhancedPayload)
    expect(ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT).toBe(
      ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_HUB_ENDPOINT_V4,
    )
    expect(parseRoadGraphSnapshotPayloadLegacyV1Compatibility(enhancedPayload)).toEqual(enhancedPayload)
    const exactVertexV2Payload = {
      ...enhancedPayload,
      runtimeBuildContract: {
        ...runtimeBuildContract,
        policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_EXACT_VERTEX_V2,
      },
    }
    expect(parseRoadGraphSnapshotPayload(exactVertexV2Payload)).toEqual(exactVertexV2Payload)
    const endpointJunctionV3Payload = {
      ...enhancedPayload,
      runtimeBuildContract: {
        ...runtimeBuildContract,
        policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_ENDPOINT_JUNCTION_V3,
      },
    }
    expect(parseRoadGraphSnapshotPayload(endpointJunctionV3Payload)).toEqual(endpointJunctionV3Payload)
    const reciprocalV1Payload = {
      ...enhancedPayload,
      runtimeBuildContract: {
        ...runtimeBuildContract,
        policyFingerprint: ROAD_GRAPH_RUNTIME_BUILD_POLICY_FINGERPRINT_RECIPROCAL_V1,
      },
    }
    expect(parseRoadGraphSnapshotPayload(reciprocalV1Payload)).toEqual(reciprocalV1Payload)
    expect(parseRoadGraphSnapshotPayload({
      ...enhancedPayload,
      runtimeBuildContract: {
        ...runtimeBuildContract,
        policyFingerprint: 'unsupported-topology-policy',
      },
    })).toBeNull()
    const enhancedGraph = buildIcelandRoadGraph(segments, {
      missingDirectionPolicy: 'provisional_bidirectional',
    })
    expect(enhancedGraph.edges).toHaveLength(2)
    expect(enhancedGraph.edges[0]).toMatchObject({
      directionBasis: 'provisional',
      directionStatus: 'unknown_missing',
    })
    const domainDriftSegments = serializeRoadGraphSnapshotSegmentsV1([{
      ...unknownMissing,
      direction: 'unknown',
      directionStatus: 'unknown_domain_drift',
      official: {
        ...unknownMissing.official,
        directionCode: 999,
        directionFieldState: 'integer',
      },
    }])
    const domainDriftPayload = {
      ...enhancedPayload,
      segments: domainDriftSegments,
    }
    expect(domainDriftSegments[0]).toMatchObject({
      direction: 'both',
      directionStatus: 'unknown_domain_drift',
      official: { directionCode: 999 },
    })
    expect(parseRoadGraphSnapshotPayload(domainDriftPayload)).toEqual(domainDriftPayload)

    const forwardSegments = serializeRoadGraphSnapshotSegmentsV1([{
      ...V2_SEGMENT,
      direction: 'forward',
      directionStatus: 'authoritative_forward',
      official: { ...V2_SEGMENT.official!, directionCode: 1 },
    }])
    expect(forwardSegments[0]).toMatchObject({
      direction: 'both',
      directionStatus: 'authoritative_forward',
      official: { directionCode: 1 },
    })
  })

  it('rejects unsupported schema versions and coordinates outside Iceland', () => {
    expect(parseRoadGraphSnapshotPayload({ ...PAYLOAD, schemaVersion: 3 })).toBeNull()
    expect(parseRoadGraphSnapshotPayload({
      ...PAYLOAD,
      segments: [{ ...PAYLOAD.segments[0], geometry: [{ lat: 40, lon: -22 }, { lat: 65, lon: -21 }] }],
    })).toBeNull()
  })

  it('strictly accepts a provenance-complete schema-v2 candidate', () => {
    expect(parseRoadGraphSnapshotPayloadV2(PAYLOAD_V2)).toEqual(PAYLOAD_V2)
    expect(parseRoadGraphSnapshotPayload(PAYLOAD_V2)).toBeNull()
  })

  it('persists and enforces the structural inference policy and artifact registry contract', () => {
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
    const sourceProvenanceKey = canonicalIcelandRoadSourceProvenanceKey(
      PAYLOAD_V2.sourceArtifacts.map(artifact => ({
        key: artifact.descriptor.key,
        contentSha256: artifact.contentSha256,
      })),
    )
    const attestation = createIcelandRoadDirectionInferenceAttestation({
      schemaVersion: 1,
      kind: 'inferred_both',
      segmentSourceId: V2_SOURCE_ID,
      sourceProvenanceKey,
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
    const unknownSegment = {
      ...V2_SEGMENT,
      direction: 'unknown' as const,
      directionStatus: 'unknown_missing' as const,
      official: {
        ...V2_SEGMENT.official!,
        directionCode: null,
        directionFieldState: 'null' as const,
      },
    }
    const inferredPayload = {
      ...PAYLOAD_V2,
      directionInferencePolicy: policy,
      directionEvidenceArtifacts: [evidenceArtifact],
      directionAttestations: [attestation],
      segments: [unknownSegment],
    }
    expect(parseRoadGraphSnapshotPayloadV2(inferredPayload)).toEqual(inferredPayload)
    expect(parseRoadGraphSnapshotPayloadV2({
      ...inferredPayload,
      directionInferencePolicy: { ...policy, minimumConfidenceBps: 9_501 },
    })).toBeNull()
    expect(parseRoadGraphSnapshotPayloadV2({
      ...inferredPayload,
      directionEvidenceArtifacts: [{ ...evidenceArtifact, contentSha256: 'd'.repeat(64) }],
    })).toBeNull()
    expect(parseRoadGraphSnapshotPayloadV2({
      ...inferredPayload,
      directionAttestations: [attestation, attestation],
    })).toBeNull()
    expect(parseRoadGraphSnapshotPayloadV2({
      ...inferredPayload,
      segments: [{
        ...unknownSegment,
        directionStatus: 'unknown_domain_drift',
        official: {
          ...unknownSegment.official,
          directionCode: 999,
          directionFieldState: 'integer',
        },
      }],
    })).toBeNull()
  })

  it('rejects schema-v2 authority, descriptor, and geometry drift', () => {
    expect(parseRoadGraphSnapshotPayloadV2({
      ...PAYLOAD_V2,
      segments: [{
        ...V2_SEGMENT,
        official: { ...V2_SEGMENT.official!, ownerCode: 2 },
      }],
    })).toBeNull()
    expect(parseRoadGraphSnapshotPayloadV2({
      ...PAYLOAD_V2,
      segments: [{ ...V2_SEGMENT, directionStatus: 'unknown_missing' }],
    })).toBeNull()
    expect(parseRoadGraphSnapshotPayloadV2({
      ...PAYLOAD_V2,
      segments: [{
        ...V2_SEGMENT,
        official: { ...V2_SEGMENT.official!, directionFieldState: 'null' },
      }],
    })).toBeNull()
    expect(parseRoadGraphSnapshotPayloadV2({
      ...PAYLOAD_V2,
      sourceArtifacts: [{
        ...PAYLOAD_V2.sourceArtifacts[0],
        descriptor: { ...VEGAGERDIN_ASSESSMENT_ROAD_SOURCE, layerId: 14 },
      }, PAYLOAD_V2.sourceArtifacts[1]],
    })).toBeNull()
    expect(parseRoadGraphSnapshotPayloadV2({
      ...PAYLOAD_V2,
      segments: [{ ...V2_SEGMENT, geometry: [{ lat: 64, lon: -22 }, { lat: 65, lon: -21, elevationM: Number.NaN }] }],
    })).toBeNull()
    expect(parseRoadGraphSnapshotPayloadV2({
      ...PAYLOAD_V2,
      segments: [V2_SEGMENT, {
        ...V2_SEGMENT,
        id: `${V2_SOURCE_ID}:geometry-1`,
        official: { ...V2_SEGMENT.official!, sourceObjectId: 2 },
      }],
    })).toBeNull()
  })

  it('canonicalizes object key order without changing array order', () => {
    const reordered = {
      segments: PAYLOAD.segments,
      nodeSnapToleranceM: 20,
      sourceFetchedAtIso: PAYLOAD.sourceFetchedAtIso,
      source: 'vegagerdin',
      schemaVersion: 1,
    } as RoadGraphSnapshotPayloadV1
    expect(canonicalRoadGraphSnapshotJson(reordered)).toBe(canonicalRoadGraphSnapshotJson(PAYLOAD))
    expect(canonicalRoadGraphSnapshotValueJson([{ b: 2, a: 1 }]))
      .toBe(canonicalRoadGraphSnapshotValueJson([{ a: 1, b: 2 }]))
  })

  it('canonicalizes v2 source and segment order with official effective time as content', () => {
    const secondSourceId = canonicalVegagerdinRoadSourceId({
      sourceLayerId: 6,
      sectionId: 20,
      roadPartCode: 1,
      roadPartNumber: '1',
    })
    const secondSegment = {
      ...V2_SEGMENT,
      id: `${secondSourceId}:geometry-0`,
      sourceId: secondSourceId,
      official: { ...V2_SEGMENT.official!, sourceObjectId: 2, sectionId: 20 },
    }
    const forward = { ...PAYLOAD_V2, segments: [V2_SEGMENT, secondSegment] }
    const reversed = {
      ...PAYLOAD_V2,
      sourceArtifacts: [...PAYLOAD_V2.sourceArtifacts].reverse(),
      segments: [secondSegment, V2_SEGMENT],
    }
    expect(canonicalRoadGraphSnapshotJson(forward)).toBe(canonicalRoadGraphSnapshotJson(reversed))
    expect(canonicalRoadGraphSnapshotContentJson(forward)).not.toBe(
      canonicalRoadGraphSnapshotContentJson({ ...forward, sourceEffectiveAtIso: '2026-07-27T15:00:00.000Z' }),
    )

    const policy = {
      schemaVersion: 1 as const,
      policyId: 'direction-policy',
      policyVersion: '1.0.0',
      generatorId: 'direction-generator',
      generatorVersion: '1.0.0',
      minimumConfidenceBps: 9_000,
    }
    const artifacts = ['a', 'b'].map(id => ({
      schemaVersion: 1 as const,
      artifactId: `artifact-${id}`,
      datasetId: 'direction-dataset',
      datasetVersion: id,
      sourceUrl: `https://example.test/${id}.json`,
      effectiveAtIso: '2026-07-01T00:00:00.000Z',
      contentSha256: id.repeat(64),
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      generatorId: policy.generatorId,
      generatorVersion: policy.generatorVersion,
      licenseReviewId: 'license-review-1',
    }))
    const attestations = artifacts.map((artifact, index) => createIcelandRoadDirectionInferenceAttestation({
      schemaVersion: 1,
      kind: 'inferred_both',
      segmentSourceId: index === 0 ? V2_SOURCE_ID : secondSourceId,
      sourceProvenanceKey: 'canonical-test-source',
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      generatorId: policy.generatorId,
      generatorVersion: policy.generatorVersion,
      evidenceArtifactId: artifact.artifactId,
      evidenceContentSha256: artifact.contentSha256,
      confidenceBps: 9_500,
      validFromIso: '2026-07-01T00:00:00.000Z',
      expiresAtIso: '2026-08-01T00:00:00.000Z',
    }))
    const withDirectionEvidence: RoadGraphSnapshotPayloadV2 = {
      ...forward,
      directionInferencePolicy: policy,
      directionEvidenceArtifacts: [...artifacts].reverse(),
      directionAttestations: [...attestations].reverse(),
    }
    expect(canonicalRoadGraphSnapshotJson(withDirectionEvidence)).toBe(
      canonicalRoadGraphSnapshotJson({
        ...withDirectionEvidence,
        directionEvidenceArtifacts: artifacts,
        directionAttestations: attestations,
      }),
    )
  })
})
