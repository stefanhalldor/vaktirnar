import { describe, expect, it } from 'vitest'

import {
  createIcelandRoadDirectionInferenceAttestation,
  resolveIcelandRoadSegmentDirection,
  validateIcelandRoadDirectionInferenceSet,
} from '@/lib/iceland-routes/roadGraphDirectionInference'
import type {
  IcelandRoadDirectionInferenceAttestationV1,
  IcelandRoadDirectionInferencePolicyV1,
  IcelandRoadDirectionEvidenceArtifactV1,
  IcelandRoadDirectionStatus,
  IcelandRoadGraphSegmentInput,
} from '@/lib/iceland-routes/roadGraphTypes'

const SOURCE_ID = 'vegagerdin:layer-6:section-10:road-part-1:road-part-number-1'
const SOURCE_PROVENANCE_KEY = `assessment_public_roads=${'a'.repeat(64)}|road_surfaces=${'b'.repeat(64)}`
const EVALUATED_AT_ISO = '2026-07-02T00:00:00.000Z'
const POLICY: IcelandRoadDirectionInferencePolicyV1 = {
  schemaVersion: 1,
  policyId: 'teskeid-direction-policy',
  policyVersion: '1.0.0',
  generatorId: 'independent-direction-evidence',
  generatorVersion: '1.0.0',
  minimumConfidenceBps: 9_000,
}
const EVIDENCE_ARTIFACT: IcelandRoadDirectionEvidenceArtifactV1 = {
  schemaVersion: 1,
  artifactId: 'independent-artifact-2026-07',
  datasetId: 'independent-direction-dataset',
  datasetVersion: '2026-07',
  sourceUrl: 'https://example.test/direction-evidence.json',
  effectiveAtIso: '2026-07-01T00:00:00.000Z',
  contentSha256: 'c'.repeat(64),
  policyId: POLICY.policyId,
  policyVersion: POLICY.policyVersion,
  generatorId: POLICY.generatorId,
  generatorVersion: POLICY.generatorVersion,
  licenseReviewId: 'license-review-1',
}

function segment(
  status: IcelandRoadDirectionStatus = 'unknown_missing',
  code: number | null = null,
  fieldState: 'missing' | 'null' | 'integer' | 'invalid' = 'null',
): IcelandRoadGraphSegmentInput {
  return {
    id: `${SOURCE_ID}:geometry-0`,
    source: 'vegagerdin',
    sourceId: SOURCE_ID,
    geometry: [{ lat: 64, lon: -22 }, { lat: 64.01, lon: -22 }],
    roadClass: 'trunk',
    surface: 'paved',
    direction: status.startsWith('authoritative_')
      ? status === 'authoritative_both'
        ? 'both'
        : status === 'authoritative_forward'
          ? 'forward'
          : 'reverse'
      : 'unknown',
    directionStatus: status,
    networkRole: 'assessment_public',
    official: {
      provider: 'vegagerdin',
      sourceLayerId: 6,
      sourceObjectId: 1,
      sectionId: 10,
      roadPartCode: 1,
      roadPartNumber: '1',
      ownerCode: 0,
      roadClassCode: 1,
      directionCode: code,
      directionFieldState: fieldState,
      inUseFromEpochMs: 0,
      outOfUseAtEpochMs: Date.parse('9999-12-31T00:00:00.000Z'),
    },
  }
}

function attestation(
  overrides: Partial<Omit<IcelandRoadDirectionInferenceAttestationV1, 'attestationId' | 'contentSha256'>> = {},
) {
  return createIcelandRoadDirectionInferenceAttestation({
    schemaVersion: 1,
    kind: 'inferred_both',
    segmentSourceId: SOURCE_ID,
    sourceProvenanceKey: SOURCE_PROVENANCE_KEY,
    policyId: POLICY.policyId,
    policyVersion: POLICY.policyVersion,
    generatorId: POLICY.generatorId,
    generatorVersion: POLICY.generatorVersion,
    evidenceArtifactId: 'independent-artifact-2026-07',
    evidenceContentSha256: 'c'.repeat(64),
    confidenceBps: 9_500,
    validFromIso: '2026-07-01T00:00:00.000Z',
    expiresAtIso: '2026-08-01T00:00:00.000Z',
    ...overrides,
  })
}

function validate(
  segments: readonly IcelandRoadGraphSegmentInput[],
  attestations: readonly IcelandRoadDirectionInferenceAttestationV1[],
  overrides: Partial<{ sourceProvenanceKey: string; evaluatedAtIso: string; policy: IcelandRoadDirectionInferencePolicyV1 }> = {},
) {
  return validateIcelandRoadDirectionInferenceSet(segments, attestations, {
    sourceProvenanceKey: SOURCE_PROVENANCE_KEY,
    evaluatedAtIso: EVALUATED_AT_ISO,
    policy: POLICY,
    evidenceArtifacts: [EVIDENCE_ARTIFACT],
    ...overrides,
  })
}

describe('road graph direction inference contract', () => {
  it('accepts a deterministic structurally registered inferred-both unit contract', () => {
    const source = segment()
    const first = attestation()
    const second = attestation()
    expect(first).toEqual(second)
    expect(first.contentSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(first.attestationId).toBe(`direction-inference-v1:${first.contentSha256}`)

    const result = validate([source], [first])
    expect(result.failures).toEqual([])
    expect(resolveIcelandRoadSegmentDirection(source, result.acceptedBySourceId)).toEqual({
      direction: 'both',
      basis: 'inferred',
      status: 'unknown_missing',
      attestation: first,
    })
  })

  it('never promotes uncorroborated NULL or numeric domain drift', () => {
    const missing = segment('unknown_missing', null, 'null')
    const drift = segment('unknown_domain_drift', 0, 'integer')
    expect(resolveIcelandRoadSegmentDirection(missing, new Map()).direction).toBe('unknown')
    expect(resolveIcelandRoadSegmentDirection(drift, new Map()).direction).toBe('unknown')
  })

  it.each([
    ['expired', attestation({ expiresAtIso: EVALUATED_AT_ISO })],
    ['source_provenance_mismatch', attestation({ sourceProvenanceKey: `assessment_public_roads=${'d'.repeat(64)}` })],
    ['confidence_below_policy', attestation({ confidenceBps: 8_999 })],
    ['evidence_artifact_mismatch', attestation({ validFromIso: '2026-06-30T00:00:00.000Z' })],
  ] as const)('rejects %s evidence', (reason, evidence) => {
    const result = validate([segment()], [evidence])
    expect(result.failures.map(failure => failure.reason)).toContain(reason)
    expect(result.acceptedBySourceId.size).toBe(0)
  })

  it('rejects duplicate or authoritative source bindings', () => {
    const evidence = attestation()
    const duplicate = validate([segment()], [evidence, evidence])
    expect(duplicate.failures.map(failure => failure.reason)).toContain('duplicate_attestation_id')
    expect(duplicate.failures.map(failure => failure.reason)).toContain('duplicate_segment_source_id')
    expect(duplicate.acceptedBySourceId.size).toBe(0)

    const authoritative = validate(
      [segment('authoritative_both', 2, 'integer')],
      [evidence],
    )
    expect(authoritative.failures.map(failure => failure.reason)).toContain('segment_source_not_inferable')
    expect(authoritative.acceptedBySourceId.size).toBe(0)
  })

  it('rejects mismatched, unregistered, or orphan registry references structurally', () => {
    const fabricated = attestation({ evidenceContentSha256: 'd'.repeat(64) })
    const mismatch = validate([segment()], [fabricated])
    expect(mismatch.failures.map(failure => failure.reason)).toContain('evidence_artifact_mismatch')
    expect(mismatch.acceptedBySourceId.size).toBe(0)

    const orphan = validateIcelandRoadDirectionInferenceSet([segment()], [], {
      sourceProvenanceKey: SOURCE_PROVENANCE_KEY,
      evaluatedAtIso: EVALUATED_AT_ISO,
      policy: POLICY,
      evidenceArtifacts: [EVIDENCE_ARTIFACT],
    })
    expect(orphan.failures.map(failure => failure.reason)).toContain('orphan_evidence_artifact')
  })

  it('permits only missing/NULL and integer 0 as inference candidates', () => {
    const unexpectedCode = validate(
      [segment('unknown_domain_drift', 999, 'integer')],
      [attestation()],
    )
    expect(unexpectedCode.failures.map(failure => failure.reason)).toContain('segment_source_not_inferable')

    const malformed = validate(
      [segment('unknown_domain_drift', null, 'invalid')],
      [attestation()],
    )
    expect(malformed.failures.map(failure => failure.reason)).toContain('segment_source_not_inferable')
  })

  it('validates policy structure at runtime rather than trusting TypeScript', () => {
    const invalidPolicy = { ...POLICY, minimumConfidenceBps: Number.NaN }
    const result = validate([segment()], [attestation()], { policy: invalidPolicy })
    expect(result.failures.map(failure => failure.reason)).toContain('policy_mismatch')
    expect(result.acceptedBySourceId.size).toBe(0)
  })

  it('returns deterministic domain failures for malformed runtime values without throwing', () => {
    const malformedAttestations = (
      [null, { attestationId: 42 }] as unknown as IcelandRoadDirectionInferenceAttestationV1[]
    )
    const malformedArtifacts = (
      [null] as unknown as IcelandRoadDirectionEvidenceArtifactV1[]
    )
    const result = validateIcelandRoadDirectionInferenceSet(
      [segment()],
      malformedAttestations,
      {
        sourceProvenanceKey: SOURCE_PROVENANCE_KEY,
        evaluatedAtIso: EVALUATED_AT_ISO,
        policy: POLICY,
        evidenceArtifacts: malformedArtifacts,
      },
    )
    expect(result.acceptedBySourceId.size).toBe(0)
    expect(result.failures.filter(failure => failure.reason === 'malformed_attestation')).toHaveLength(2)
    expect(result.failures.filter(failure => failure.reason === 'malformed_evidence_artifact')).toHaveLength(1)
  })
})
