import 'server-only'

export const TESKEID_ROUTE_CANDIDATE_ID = 'teskeid-road-graph-v1'
export const TESKEID_ROUTE_CANDIDATE_ID_PREFIX = `${TESKEID_ROUTE_CANDIDATE_ID}-alt-`

const ROUTE_PROVENANCE_FINGERPRINT_PATTERN = /^[A-Za-z0-9_-]{43}$/

export type TeskeidAssessmentAlternativeIdentity = Readonly<{
  index: number
  routeProvenanceFingerprint: string
}>

/**
 * Alternative IDs are signed inside route envelopes. Including the complete
 * graph provenance hash lets final weather coverage reselect the exact edge
 * path rather than trusting a positional index after a graph refresh.
 */
export function createTeskeidAssessmentAlternativeRouteId(
  index: number,
  routeProvenanceFingerprint: string,
): string {
  if (
    !Number.isInteger(index)
    || index < 1
    || index > 4
    || !ROUTE_PROVENANCE_FINGERPRINT_PATTERN.test(routeProvenanceFingerprint)
  ) {
    throw new Error('invalid_assessment_alternative_identity')
  }
  return `${TESKEID_ROUTE_CANDIDATE_ID_PREFIX}${index}-${routeProvenanceFingerprint}`
}

export function parseTeskeidAssessmentAlternativeRouteId(
  routeId: string,
): TeskeidAssessmentAlternativeIdentity | null {
  const match = new RegExp(
    `^${TESKEID_ROUTE_CANDIDATE_ID_PREFIX}(\\d+)-([A-Za-z0-9_-]{43})$`,
  ).exec(routeId)
  if (!match) return null
  const index = Number(match[1])
  return Number.isInteger(index) && index >= 1 && index <= 4
    ? { index, routeProvenanceFingerprint: match[2] }
    : null
}
