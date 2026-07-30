import 'server-only'

import type { ConfirmedLocationInput } from '@/lib/places/providerCandidate'
import {
  getOfficialPostalAssessmentIdentity,
  getOfficialPostalLocality,
  type OfficialPostalAssessmentIdentity,
} from '@/lib/places/officialPlaceDirectory.server'
import {
  readHmsPostalIdentityCandidates,
  readHmsSourceIdentityCandidate,
  type HmsPostalIdentityCandidate,
} from '@/lib/places/hmsDirectory.server'

const SAVED_ASSESSMENT_HMS_MAX_DISTANCE_M = 25
const DEVICE_ASSESSMENT_HMS_MAX_DISTANCE_M = 50
const MAP_ASSESSMENT_HMS_MAX_DISTANCE_M = 50
const HMS_SOURCE_ASSESSMENT_MAX_DISTANCE_M = 25

export type ResolvedOfficialPostalAssessmentIdentity = Exclude<
  OfficialPostalAssessmentIdentity,
  { kind: 'unresolved' }
>

export type VerifiedHmsPostalIdentity = HmsPostalIdentityCandidate & Readonly<{
  assessmentIdentity: ResolvedOfficialPostalAssessmentIdentity
  anchorKind: 'settlement_nodes' | 'projected_road'
}>

export type VerifiedHmsSourceIdentity = Readonly<{
  sourceId: string
  distanceM: number
}>

function configuredIdentity(candidate: HmsPostalIdentityCandidate): VerifiedHmsPostalIdentity | null {
  const postalLocality = getOfficialPostalLocality(candidate.postalCode)
  const assessmentIdentity = getOfficialPostalAssessmentIdentity(candidate.postalCode)
  if (
    !postalLocality
    || postalLocality.sourceId !== candidate.postalLocalitySourceId
    || postalLocality.name !== candidate.postalLocality
    || !assessmentIdentity
    || assessmentIdentity.kind === 'unresolved'
  ) {
    return null
  }
  return {
    ...candidate,
    assessmentIdentity,
    anchorKind: assessmentIdentity.kind === 'urban_settlement'
      ? 'settlement_nodes'
      : 'projected_road',
  }
}

function identityKey(candidate: VerifiedHmsPostalIdentity): string {
  const identity = candidate.assessmentIdentity
  return identity.kind === 'urban_settlement'
    ? `urban:${identity.settlementId}`
    : `rural:${identity.postalAreaId}`
}

/**
 * Derives one source-backed assessment identity without trusting client
 * postcode, locality, municipality or display text. Exact navigation
 * coordinates are used only as the bounded lookup point. Every in-radius HMS
 * candidate must resolve to the same official identity or the lookup fails
 * closed.
 */
export async function resolveVerifiedHmsPostalIdentity(
  location: ConfirmedLocationInput,
): Promise<VerifiedHmsPostalIdentity | null> {
  let maxDistanceM: number
  let expectedSourceId: string | undefined
  if (location.source === 'hms') {
    if (!location.sourceId) return null
    maxDistanceM = HMS_SOURCE_ASSESSMENT_MAX_DISTANCE_M
    expectedSourceId = location.sourceId
  } else if (location.source === 'device') {
    maxDistanceM = DEVICE_ASSESSMENT_HMS_MAX_DISTANCE_M
  } else if (location.source === 'map') {
    maxDistanceM = MAP_ASSESSMENT_HMS_MAX_DISTANCE_M
  } else if (
    location.source === 'saved'
    || location.source === 'recent'
    || location.source === undefined
  ) {
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
  if (configured.length === 0 || configured.length !== candidates.length) return null

  const identities = new Set(configured.map(identityKey))
  return identities.size === 1 ? configured[0] : null
}

/**
 * Re-attests an explicitly selected HMS row without requiring that its postal
 * area can also supply a settlement identity. This is deliberately narrower
 * than the postal resolver: it is only a provenance gate for the generic
 * public-road-anchor fallback, and it never returns the source coordinates or
 * trusts client labels/postal metadata.
 */
export async function resolveVerifiedHmsSourceIdentity(
  location: ConfirmedLocationInput,
): Promise<VerifiedHmsSourceIdentity | null> {
  if (location.source !== 'hms' || !location.sourceId?.trim()) return null
  const expectedSourceId = location.sourceId.trim()
  const candidate = await readHmsSourceIdentityCandidate(
    { lat: location.lat, lon: location.lon },
    {
      maxDistanceM: HMS_SOURCE_ASSESSMENT_MAX_DISTANCE_M,
      sourceId: expectedSourceId,
    },
  )
  return candidate?.sourceId === expectedSourceId ? candidate : null
}
