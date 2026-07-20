import { slugifyPlaceKey } from './routePlaceNormalization'
import { ROUTE_FAMILIES } from './routeFamilies'
import { getRoadIntelligenceAlternativesForFamily } from './alternatives'
import { getRoadCautionsForSegments } from './cautions'
import type { IcelandRoadIntelligenceResult } from './types'

function normalizeRoadIntelligenceKey(placeKey: string): string {
  return slugifyPlaceKey(placeKey)
}

function matchesAlias(placeKey: string, aliases: readonly string[]): boolean {
  return aliases.some(alias => placeKey === normalizeRoadIntelligenceKey(alias))
}

/**
 * Resolve a place pair into Teskeið's draft provider-neutral Road Intelligence.
 *
 * Input may be a route-memory key (e.g. "egilsstadir") or a display label
 * (e.g. "Egilsstaðir"). This function is pure and never calls Google, Supabase,
 * Veðurstofan, Vegagerðin, or any network provider.
 */
export function resolveRoadIntelligence(
  fromPlaceKey: string,
  toPlaceKey: string,
): IcelandRoadIntelligenceResult {
  const fromKey = normalizeRoadIntelligenceKey(fromPlaceKey)
  const toKey = normalizeRoadIntelligenceKey(toPlaceKey)

  const family = ROUTE_FAMILIES.find(f => {
    const fromMatchesOrigin = matchesAlias(fromKey, f.fromAliases)
    const toMatchesDest = matchesAlias(toKey, f.toAliases)
    const fromMatchesDest = matchesAlias(fromKey, f.toAliases)
    const toMatchesOrigin = matchesAlias(toKey, f.fromAliases)
    return (fromMatchesOrigin && toMatchesDest) || (fromMatchesDest && toMatchesOrigin)
  })

  if (!family) {
    return {
      status: 'unknown',
      source: 'teskeid_registry',
      confidence: 'draft',
      alternatives: [],
      cautions: [],
    }
  }

  const alternatives = getRoadIntelligenceAlternativesForFamily(family.id)
  const segmentIds = new Set<string>()
  for (const alternative of alternatives) {
    for (const segmentId of alternative.segmentIds) segmentIds.add(segmentId)
    for (const segmentId of alternative.avoids ?? []) segmentIds.add(segmentId)
  }

  return {
    status: 'resolved',
    source: 'teskeid_registry',
    confidence: 'draft',
    routeFamilyId: family.id,
    routeFamilyLabel: family.label,
    alternatives,
    cautions: getRoadCautionsForSegments(segmentIds),
  }
}
