import { createHash } from 'node:crypto'

import type {
  IcelandRoadDirection,
  IcelandRoadDirectionBasis,
  IcelandRoadDirectionEvidenceArtifactV1,
  IcelandRoadDirectionInferenceAttestationV1,
  IcelandRoadDirectionInferencePolicyV1,
  IcelandRoadDirectionStatus,
  IcelandRoadGraphSegmentInput,
  IcelandRoadOfficialSegmentMetadata,
} from './roadGraphTypes'

export type IcelandRoadDirectionInferenceFailureReason =
  | 'malformed_attestation'
  | 'content_hash_mismatch'
  | 'attestation_id_mismatch'
  | 'duplicate_attestation_id'
  | 'duplicate_segment_source_id'
  | 'source_provenance_mismatch'
  | 'policy_missing'
  | 'policy_mismatch'
  | 'confidence_below_policy'
  | 'not_yet_valid'
  | 'expired'
  | 'segment_source_not_found'
  | 'segment_source_ambiguous'
  | 'segment_source_not_inferable'
  | 'evidence_registry_missing'
  | 'malformed_evidence_artifact'
  | 'duplicate_evidence_artifact_id'
  | 'evidence_artifact_not_found'
  | 'evidence_artifact_mismatch'
  | 'orphan_evidence_artifact'

export interface IcelandRoadDirectionInferenceFailure {
  attestationId: string
  segmentSourceId: string
  reason: IcelandRoadDirectionInferenceFailureReason
}

export interface IcelandRoadDirectionInferenceValidationContext {
  sourceProvenanceKey: string
  evaluatedAtIso: string
  policy?: IcelandRoadDirectionInferencePolicyV1
  evidenceArtifacts: readonly IcelandRoadDirectionEvidenceArtifactV1[]
}

export interface IcelandRoadDirectionInferenceSetValidation {
  acceptedBySourceId: ReadonlyMap<string, IcelandRoadDirectionInferenceAttestationV1>
  failures: readonly IcelandRoadDirectionInferenceFailure[]
}

export type IcelandRoadDirectionInferenceAttestationBodyV1 = Omit<
  IcelandRoadDirectionInferenceAttestationV1,
  'attestationId' | 'contentSha256'
>

const ATTESTATION_ID_PREFIX = 'direction-inference-v1:'
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/

function binaryCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validSourceId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 300
    && !/[\u0000-\u001f\u007f]/.test(value)
}

function canonicalIso(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
}

function validToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value)
}

export function isIcelandRoadDirectionInferenceAttestationV1(
  value: unknown,
): value is IcelandRoadDirectionInferenceAttestationV1 {
  if (!isRecord(value)) return false
  const keys = [
    'schemaVersion', 'kind', 'attestationId', 'contentSha256', 'segmentSourceId',
    'sourceProvenanceKey', 'policyId', 'policyVersion', 'generatorId',
    'generatorVersion', 'evidenceArtifactId', 'evidenceContentSha256',
    'confidenceBps', 'validFromIso', 'expiresAtIso',
  ]
  if (Object.keys(value).some(key => !keys.includes(key)) || Object.keys(value).length !== keys.length) {
    return false
  }
  return value.schemaVersion === 1
    && value.kind === 'inferred_both'
    && typeof value.attestationId === 'string'
    && typeof value.contentSha256 === 'string'
    && validSourceId(value.segmentSourceId)
    && typeof value.sourceProvenanceKey === 'string'
    && typeof value.policyId === 'string'
    && typeof value.policyVersion === 'string'
    && typeof value.generatorId === 'string'
    && typeof value.generatorVersion === 'string'
    && typeof value.evidenceArtifactId === 'string'
    && typeof value.evidenceContentSha256 === 'string'
    && typeof value.confidenceBps === 'number'
    && typeof value.validFromIso === 'string'
    && typeof value.expiresAtIso === 'string'
}

export function isIcelandRoadDirectionInferencePolicyV1(
  value: unknown,
): value is IcelandRoadDirectionInferencePolicyV1 {
  if (!isRecord(value)) return false
  const keys = [
    'schemaVersion', 'policyId', 'policyVersion', 'generatorId',
    'generatorVersion', 'minimumConfidenceBps',
  ]
  if (Object.keys(value).some(key => !keys.includes(key)) || Object.keys(value).length !== keys.length) {
    return false
  }
  return value.schemaVersion === 1
    && validToken(value.policyId)
    && validToken(value.policyVersion)
    && validToken(value.generatorId)
    && validToken(value.generatorVersion)
    && Number.isSafeInteger(value.minimumConfidenceBps)
    && (value.minimumConfidenceBps as number) >= 1
    && (value.minimumConfidenceBps as number) <= 10_000
}

export function isIcelandRoadDirectionEvidenceArtifactV1(
  value: unknown,
): value is IcelandRoadDirectionEvidenceArtifactV1 {
  if (!isRecord(value)) return false
  const keys = [
    'schemaVersion', 'artifactId', 'datasetId', 'datasetVersion', 'sourceUrl',
    'effectiveAtIso', 'contentSha256', 'policyId', 'policyVersion', 'generatorId',
    'generatorVersion', 'licenseReviewId',
  ]
  if (Object.keys(value).some(key => !keys.includes(key)) || Object.keys(value).length !== keys.length) {
    return false
  }
  let validSourceUrl = false
  if (typeof value.sourceUrl === 'string' && value.sourceUrl.length <= 1_000) {
    try {
      validSourceUrl = new URL(value.sourceUrl).protocol === 'https:'
    } catch {
      validSourceUrl = false
    }
  }
  return value.schemaVersion === 1
    && validToken(value.artifactId)
    && validToken(value.datasetId)
    && validToken(value.datasetVersion)
    && validSourceUrl
    && canonicalIso(value.effectiveAtIso)
    && typeof value.contentSha256 === 'string'
    && SHA256_PATTERN.test(value.contentSha256)
    && validToken(value.policyId)
    && validToken(value.policyVersion)
    && validToken(value.generatorId)
    && validToken(value.generatorVersion)
    && validToken(value.licenseReviewId)
}

/** Fixed key order is part of the version-1 attestation contract. */
export function canonicalIcelandRoadDirectionInferenceBodyJson(
  body: IcelandRoadDirectionInferenceAttestationBodyV1,
): string {
  return JSON.stringify({
    schemaVersion: body.schemaVersion,
    kind: body.kind,
    segmentSourceId: body.segmentSourceId,
    sourceProvenanceKey: body.sourceProvenanceKey,
    policyId: body.policyId,
    policyVersion: body.policyVersion,
    generatorId: body.generatorId,
    generatorVersion: body.generatorVersion,
    evidenceArtifactId: body.evidenceArtifactId,
    evidenceContentSha256: body.evidenceContentSha256,
    confidenceBps: body.confidenceBps,
    validFromIso: body.validFromIso,
    expiresAtIso: body.expiresAtIso,
  })
}

export function hashIcelandRoadDirectionInferenceBody(
  body: IcelandRoadDirectionInferenceAttestationBodyV1,
): string {
  return createHash('sha256')
    .update(canonicalIcelandRoadDirectionInferenceBodyJson(body))
    .digest('hex')
}

export function createIcelandRoadDirectionInferenceAttestation(
  body: IcelandRoadDirectionInferenceAttestationBodyV1,
): IcelandRoadDirectionInferenceAttestationV1 {
  const contentSha256 = hashIcelandRoadDirectionInferenceBody(body)
  return {
    ...body,
    attestationId: `${ATTESTATION_ID_PREFIX}${contentSha256}`,
    contentSha256,
  }
}

export function canonicalIcelandRoadSourceProvenanceKey(
  artifacts: readonly { key: string; contentSha256: string }[],
): string {
  return [...artifacts]
    .sort((a, b) => binaryCompare(a.key, b.key))
    .map(artifact => `${artifact.key}=${artifact.contentSha256}`)
    .join('|')
}

/** Returns null for internally inconsistent raw metadata. */
export function directionStatusFromOfficialMetadata(
  official: IcelandRoadOfficialSegmentMetadata,
): IcelandRoadDirectionStatus | null {
  const state = official.directionFieldState
  const code = official.directionCode
  if (state === 'missing' || state === 'null') {
    return code === null ? 'unknown_missing' : null
  }
  if (state === 'invalid') return code === null ? 'unknown_domain_drift' : null
  if (state !== 'integer' || code === null || !Number.isSafeInteger(code)) return null
  if (code === 2) return 'authoritative_both'
  if (code === 1) return 'authoritative_forward'
  if (code === -1) return 'authoritative_reverse'
  return 'unknown_domain_drift'
}

export function authoritativeDirectionFromStatus(
  status: IcelandRoadDirectionStatus,
): Exclude<IcelandRoadDirection, 'unknown'> | null {
  if (status === 'authoritative_both') return 'both'
  if (status === 'authoritative_forward') return 'forward'
  if (status === 'authoritative_reverse') return 'reverse'
  return null
}

function attestationBody(
  attestation: IcelandRoadDirectionInferenceAttestationV1,
): IcelandRoadDirectionInferenceAttestationBodyV1 {
  return {
    schemaVersion: attestation.schemaVersion,
    kind: attestation.kind,
    segmentSourceId: attestation.segmentSourceId,
    sourceProvenanceKey: attestation.sourceProvenanceKey,
    policyId: attestation.policyId,
    policyVersion: attestation.policyVersion,
    generatorId: attestation.generatorId,
    generatorVersion: attestation.generatorVersion,
    evidenceArtifactId: attestation.evidenceArtifactId,
    evidenceContentSha256: attestation.evidenceContentSha256,
    confidenceBps: attestation.confidenceBps,
    validFromIso: attestation.validFromIso,
    expiresAtIso: attestation.expiresAtIso,
  }
}

function basicAttestationFailures(
  attestation: IcelandRoadDirectionInferenceAttestationV1,
  context: IcelandRoadDirectionInferenceValidationContext,
): IcelandRoadDirectionInferenceFailureReason[] {
  const failures: IcelandRoadDirectionInferenceFailureReason[] = []
  if (
    attestation.schemaVersion !== 1
    || attestation.kind !== 'inferred_both'
    || !validSourceId(attestation.segmentSourceId)
    || typeof attestation.sourceProvenanceKey !== 'string'
    || attestation.sourceProvenanceKey.length === 0
    || attestation.sourceProvenanceKey.length > 2_000
    || !validToken(attestation.policyId)
    || !validToken(attestation.policyVersion)
    || !validToken(attestation.generatorId)
    || !validToken(attestation.generatorVersion)
    || !validToken(attestation.evidenceArtifactId)
    || !SHA256_PATTERN.test(attestation.evidenceContentSha256)
    || !Number.isSafeInteger(attestation.confidenceBps)
    || attestation.confidenceBps < 1
    || attestation.confidenceBps > 10_000
    || !canonicalIso(attestation.validFromIso)
    || !canonicalIso(attestation.expiresAtIso)
    || !SHA256_PATTERN.test(attestation.contentSha256)
    || typeof attestation.attestationId !== 'string'
    || !attestation.attestationId.startsWith(ATTESTATION_ID_PREFIX)
  ) failures.push('malformed_attestation')

  if (!failures.includes('malformed_attestation')) {
    const expectedHash = hashIcelandRoadDirectionInferenceBody(attestationBody(attestation))
    if (attestation.contentSha256 !== expectedHash) failures.push('content_hash_mismatch')
    if (attestation.attestationId !== `${ATTESTATION_ID_PREFIX}${expectedHash}`) {
      failures.push('attestation_id_mismatch')
    }
  }
  if (attestation.sourceProvenanceKey !== context.sourceProvenanceKey) {
    failures.push('source_provenance_mismatch')
  }
  if (!context.policy) {
    failures.push('policy_missing')
  } else {
    const policy = context.policy
    if (
      !isIcelandRoadDirectionInferencePolicyV1(policy)
      || attestation.policyId !== policy.policyId
      || attestation.policyVersion !== policy.policyVersion
      || attestation.generatorId !== policy.generatorId
      || attestation.generatorVersion !== policy.generatorVersion
    ) failures.push('policy_mismatch')
    if (attestation.confidenceBps < policy.minimumConfidenceBps) {
      failures.push('confidence_below_policy')
    }
  }
  if (context.evidenceArtifacts.length === 0) {
    failures.push('evidence_registry_missing')
  } else {
    const matches = context.evidenceArtifacts.filter(
      artifact => artifact.artifactId === attestation.evidenceArtifactId,
    )
    if (matches.length !== 1) {
      failures.push('evidence_artifact_not_found')
    } else {
      const artifact = matches[0]
      if (
        !isIcelandRoadDirectionEvidenceArtifactV1(artifact)
        || artifact.contentSha256 !== attestation.evidenceContentSha256
        || artifact.policyId !== attestation.policyId
        || artifact.policyVersion !== attestation.policyVersion
        || artifact.generatorId !== attestation.generatorId
        || artifact.generatorVersion !== attestation.generatorVersion
        || !canonicalIso(context.evaluatedAtIso)
        || Date.parse(artifact.effectiveAtIso) > Date.parse(context.evaluatedAtIso)
        || Date.parse(artifact.effectiveAtIso) > Date.parse(attestation.validFromIso)
      ) failures.push('evidence_artifact_mismatch')
    }
  }
  if (!canonicalIso(context.evaluatedAtIso)) {
    failures.push('malformed_attestation')
  } else if (canonicalIso(attestation.validFromIso) && canonicalIso(attestation.expiresAtIso)) {
    const evaluatedAt = Date.parse(context.evaluatedAtIso)
    const validFrom = Date.parse(attestation.validFromIso)
    const expiresAt = Date.parse(attestation.expiresAtIso)
    if (expiresAt <= validFrom) failures.push('malformed_attestation')
    else if (evaluatedAt < validFrom) failures.push('not_yet_valid')
    else if (evaluatedAt >= expiresAt) failures.push('expired')
  }
  return [...new Set(failures)]
}

/**
 * Strictly validates the structural contract for a whole attestation set.
 * This does not verify referenced evidence bytes or claims. Any duplicate or
 * ambiguous source binding rejects every conflicting assertion for that source.
 */
export function validateIcelandRoadDirectionInferenceSet(
  segments: readonly IcelandRoadGraphSegmentInput[],
  attestations: readonly IcelandRoadDirectionInferenceAttestationV1[],
  context: IcelandRoadDirectionInferenceValidationContext,
): IcelandRoadDirectionInferenceSetValidation {
  const failures: IcelandRoadDirectionInferenceFailure[] = []
  const validAttestations: IcelandRoadDirectionInferenceAttestationV1[] = []
  for (const [index, value] of (attestations as readonly unknown[]).entries()) {
    if (isIcelandRoadDirectionInferenceAttestationV1(value)) {
      validAttestations.push(value)
    } else {
      const record = isRecord(value) ? value : null
      failures.push({
        attestationId: typeof record?.attestationId === 'string'
          ? record.attestationId
          : `malformed-attestation-${index}`,
        segmentSourceId: typeof record?.segmentSourceId === 'string' ? record.segmentSourceId : '',
        reason: 'malformed_attestation',
      })
    }
  }
  const validEvidenceArtifacts: IcelandRoadDirectionEvidenceArtifactV1[] = []
  for (const [index, value] of (context.evidenceArtifacts as readonly unknown[]).entries()) {
    if (isIcelandRoadDirectionEvidenceArtifactV1(value)) {
      validEvidenceArtifacts.push(value)
    } else {
      const record = isRecord(value) ? value : null
      failures.push({
        attestationId: typeof record?.artifactId === 'string'
          ? record.artifactId
          : `malformed-evidence-artifact-${index}`,
        segmentSourceId: '',
        reason: 'malformed_evidence_artifact',
      })
    }
  }
  const validatedContext: IcelandRoadDirectionInferenceValidationContext = {
    ...context,
    evidenceArtifacts: validEvidenceArtifacts,
  }
  const sourceGroups = new Map<string, IcelandRoadGraphSegmentInput[]>()
  for (const segment of segments) {
    const existing = sourceGroups.get(segment.sourceId) ?? []
    existing.push(segment)
    sourceGroups.set(segment.sourceId, existing)
  }
  const idCounts = new Map<string, number>()
  const sourceCounts = new Map<string, number>()
  const artifactIdCounts = new Map<string, number>()
  for (const artifact of validEvidenceArtifacts) {
    artifactIdCounts.set(artifact.artifactId, (artifactIdCounts.get(artifact.artifactId) ?? 0) + 1)
  }
  for (const attestation of validAttestations) {
    idCounts.set(attestation.attestationId, (idCounts.get(attestation.attestationId) ?? 0) + 1)
    sourceCounts.set(attestation.segmentSourceId, (sourceCounts.get(attestation.segmentSourceId) ?? 0) + 1)
  }

  const evaluatedAt = Date.parse(context.evaluatedAtIso)
  for (const artifact of validEvidenceArtifacts) {
    const artifactReasons: IcelandRoadDirectionInferenceFailureReason[] = []
    if (!isIcelandRoadDirectionEvidenceArtifactV1(artifact)) {
      artifactReasons.push('malformed_evidence_artifact')
    }
    if ((artifactIdCounts.get(artifact.artifactId) ?? 0) !== 1) {
      artifactReasons.push('duplicate_evidence_artifact_id')
    }
    if (
      !context.policy
      || artifact.policyId !== context.policy.policyId
      || artifact.policyVersion !== context.policy.policyVersion
      || artifact.generatorId !== context.policy.generatorId
      || artifact.generatorVersion !== context.policy.generatorVersion
    ) artifactReasons.push('evidence_artifact_mismatch')
    if (
      canonicalIso(artifact.effectiveAtIso)
      && Number.isFinite(evaluatedAt)
      && Date.parse(artifact.effectiveAtIso) > evaluatedAt
    ) artifactReasons.push('malformed_evidence_artifact')
    for (const reason of [...new Set(artifactReasons)]) {
      failures.push({
        attestationId: artifact.artifactId,
        segmentSourceId: '',
        reason,
      })
    }
  }
  const acceptedBySourceId = new Map<string, IcelandRoadDirectionInferenceAttestationV1>()
  const ordered = [...validAttestations].sort((a, b) => (
    binaryCompare(a.segmentSourceId, b.segmentSourceId)
    || binaryCompare(a.attestationId, b.attestationId)
  ))
  for (const attestation of ordered) {
    const reasons = basicAttestationFailures(attestation, validatedContext)
    if ((idCounts.get(attestation.attestationId) ?? 0) !== 1) {
      reasons.push('duplicate_attestation_id')
    }
    if ((sourceCounts.get(attestation.segmentSourceId) ?? 0) !== 1) {
      reasons.push('duplicate_segment_source_id')
    }
    const sourceSegments = sourceGroups.get(attestation.segmentSourceId)
    if (!sourceSegments || sourceSegments.length === 0) {
      reasons.push('segment_source_not_found')
    } else {
      const statuses = new Set(sourceSegments.map(segment => {
        if (!segment.official || !segment.directionStatus) return null
        const sourceStatus = directionStatusFromOfficialMetadata(segment.official)
        return sourceStatus === segment.directionStatus ? sourceStatus : null
      }))
      if (statuses.size !== 1 || statuses.has(null)) {
        reasons.push('segment_source_ambiguous')
      } else {
        const status = [...statuses][0]
        const eligible = sourceSegments.every(segment => {
          const official = segment.official!
          return status === 'unknown_missing'
            ? official.directionCode === null
              && (official.directionFieldState === 'missing' || official.directionFieldState === 'null')
            : status === 'unknown_domain_drift'
              ? official.directionCode === 0
                && official.directionFieldState === 'integer'
              : false
        })
        if (!eligible) {
          reasons.push('segment_source_not_inferable')
        }
        if (sourceSegments.some(segment => segment.direction !== 'unknown')) {
          reasons.push('segment_source_ambiguous')
        }
      }
    }
    for (const reason of [...new Set(reasons)]) {
      failures.push({
        attestationId: attestation.attestationId,
        segmentSourceId: attestation.segmentSourceId,
        reason,
      })
    }
    if (reasons.length === 0) acceptedBySourceId.set(attestation.segmentSourceId, attestation)
  }
  const referencedArtifactIds = new Set(validAttestations.map(attestation => attestation.evidenceArtifactId))
  for (const artifact of validEvidenceArtifacts) {
    if (!referencedArtifactIds.has(artifact.artifactId)) {
      failures.push({
        attestationId: artifact.artifactId,
        segmentSourceId: '',
        reason: 'orphan_evidence_artifact',
      })
    }
  }
  failures.sort((a, b) => (
    binaryCompare(a.segmentSourceId, b.segmentSourceId)
    || binaryCompare(a.attestationId, b.attestationId)
    || binaryCompare(a.reason, b.reason)
  ))
  return { acceptedBySourceId, failures }
}

export interface IcelandRoadResolvedDirection {
  direction: IcelandRoadDirection
  basis?: IcelandRoadDirectionBasis
  status?: IcelandRoadDirectionStatus
  attestation?: IcelandRoadDirectionInferenceAttestationV1
}

/** Official inconsistencies and uncorroborated unknowns always resolve closed. */
export function resolveIcelandRoadSegmentDirection(
  segment: IcelandRoadGraphSegmentInput,
  acceptedBySourceId: ReadonlyMap<string, IcelandRoadDirectionInferenceAttestationV1>,
): IcelandRoadResolvedDirection {
  if (!segment.official) return { direction: segment.direction }
  // Official metadata without the strict v2 status is ambiguous. Legacy v1
  // compatibility applies only to rows with no official metadata at all.
  if (!segment.directionStatus) return { direction: 'unknown' }
  const status = directionStatusFromOfficialMetadata(segment.official)
  if (!status || status !== segment.directionStatus) return { direction: 'unknown' }
  const authoritative = authoritativeDirectionFromStatus(status)
  if (authoritative) {
    return segment.direction === authoritative
      ? { direction: authoritative, basis: 'authoritative', status }
      : { direction: 'unknown', status }
  }
  if (segment.direction !== 'unknown') return { direction: 'unknown', status }
  const attestation = acceptedBySourceId.get(segment.sourceId)
  return attestation
    ? { direction: 'both', basis: 'inferred', status, attestation }
    : { direction: 'unknown', status }
}
