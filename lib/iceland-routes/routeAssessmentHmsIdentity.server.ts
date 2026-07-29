import 'server-only'

import type { ConfirmedLocationInput } from '@/lib/places/providerCandidate'
import {
  readHmsPostalIdentityCandidates,
  type HmsPostalIdentityCandidate,
} from '@/lib/places/hmsDirectory.server'
import {
  getRuralPostalAssessmentMapping,
  getUrbanPostalAssessmentMapping,
  type PostalAssessmentMapping,
} from './routeAssessmentMapping'

const SAVED_ASSESSMENT_HMS_MAX_DISTANCE_M = 25
const DEVICE_ASSESSMENT_HMS_MAX_DISTANCE_M = 50
const HMS_SOURCE_ASSESSMENT_MAX_DISTANCE_M = 25

export type VerifiedHmsPostalIdentity = HmsPostalIdentityCandidate & Readonly<{
  mapping: PostalAssessmentMapping
  anchorKind: 'settlement_nodes' | 'projected_road'
}>

function configuredIdentity(candidate: HmsPostalIdentityCandidate): VerifiedHmsPostalIdentity | null {
  const urban = getUrbanPostalAssessmentMapping(candidate.postalCode)
  const rural = getRuralPostalAssessmentMapping(candidate.postalCode)
  if (Boolean(urban) === Boolean(rural)) return null
  const mapping = urban ?? rural!
  if (candidate.postalLocalitySourceId !== mapping.postalLocalitySourceId) return null
  return {
    ...candidate,
    mapping,
    anchorKind: urban ? 'settlement_nodes' : 'projected_road',
  }
}

/**
 * Derives one configured assessment identity without trusting client postcode,
 * locality or display text. Boundary candidates are accepted only when every
 * configured match resolves to the same settlement/anchor behavior.
 */
export async function resolveVerifiedHmsPostalIdentity(
  location: ConfirmedLocationInput,
): Promise<VerifiedHmsPostalIdentity | null> {
  let maxDistanceM: number
  let expectedSourceId: string | undefined
  if (location.source === 'hms' && location.sourceId) {
    maxDistanceM = HMS_SOURCE_ASSESSMENT_MAX_DISTANCE_M
    expectedSourceId = location.sourceId
  } else if (location.source === 'device') {
    maxDistanceM = DEVICE_ASSESSMENT_HMS_MAX_DISTANCE_M
  } else if (location.source === 'saved' || location.source === undefined) {
    maxDistanceM = SAVED_ASSESSMENT_HMS_MAX_DISTANCE_M
  } else {
    return null
  }

  const candidates = await readHmsPostalIdentityCandidates(
    { lat: location.lat, lon: location.lon },
    { maxDistanceM, ...(expectedSourceId ? { sourceId: expectedSourceId } : {}) },
  )
  if (!candidates) return null
  const configured = candidates
    .map(configuredIdentity)
    .filter((candidate): candidate is VerifiedHmsPostalIdentity => candidate !== null)
  // Every HMS identity inside the accepted radius must be covered and
  // provenance-valid. Ignoring an unmapped boundary candidate would turn a
  // genuinely ambiguous point into a false configured match.
  if (configured.length === 0 || configured.length !== candidates.length) return null

  const identities = new Set(configured.map(candidate => (
    `${candidate.anchorKind}:${candidate.mapping.assessmentSettlementId}`
  )))
  return identities.size === 1 ? configured[0] : null
}
