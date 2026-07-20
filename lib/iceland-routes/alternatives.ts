/**
 * Draft curated alternatives for Road Intelligence.
 *
 * These are provider-neutral route concepts. They do not replace Google Routes
 * and they do not imply verified turn-by-turn routing.
 */

import type { IcelandRouteAlternative } from './types'

export const ICELAND_ROAD_INTELLIGENCE_ALTERNATIVES: readonly IcelandRouteAlternative[] = [
  {
    id: 'rvk-isafjordur-via-holmavik',
    routeFamilyId: 'capital-westfjords',
    label: 'Gegnum Hólmavík',
    labelEn: 'Via Hólmavík',
    labelKey: 'gegnum-holmavik',
    segmentIds: ['holmavik-sudurleid'],
    notes: 'Draft curated route concept for Reykjavík to Ísafjörður via Hólmavík.',
    verified: false,
  },
  {
    id: 'rvk-east-via-hellisheidi',
    routeFamilyId: 'capital-east-iceland',
    label: 'Um Hellisheiði',
    labelEn: 'Via Hellisheiði',
    labelKey: 'um-hellisheidi',
    segmentIds: ['ring-road-hellisheidi', 'ring-road-vik-west', 'ring-road-vik-east'],
    notes: 'Draft south/east route concept from the capital area toward East Iceland.',
    verified: false,
  },
  {
    id: 'rvk-east-sleppa-oxi',
    routeFamilyId: 'capital-east-iceland',
    label: 'Til að sleppa við Öxi',
    labelEn: 'Avoid Öxi',
    labelKey: 'sleppa-oxi',
    segmentIds: ['ring-road-hellisheidi', 'ring-road-vik-west', 'ring-road-vik-east'],
    avoids: ['oxi-axarvegur'],
    notes: 'Draft alternative that explicitly avoids Axarvegur 939 / Öxi.',
    verified: false,
  },
  {
    id: 'rvk-east-um-firdi',
    routeFamilyId: 'capital-east-iceland',
    label: 'Um firðina',
    labelEn: 'Via the fjords',
    labelKey: 'um-firdi',
    segmentIds: ['ring-road-hellisheidi', 'ring-road-vik-west', 'ring-road-vik-east'],
    avoids: ['oxi-axarvegur'],
    notes: 'Draft Eastfjords-facing alternative. Needs finer east segment registry before map use.',
    verified: false,
  },
  {
    id: 'rvk-akureyri-hringvegurinn',
    routeFamilyId: 'capital-north-iceland',
    label: 'Hringvegurinn',
    labelEn: 'Ring Road',
    labelKey: 'hringvegurinn',
    segmentIds: [],
    notes: 'Draft family-level alternative. North backbone segments are not registered yet.',
    verified: false,
  },
]

export function getRoadIntelligenceAlternativesForFamily(
  routeFamilyId: string,
): readonly IcelandRouteAlternative[] {
  return ICELAND_ROAD_INTELLIGENCE_ALTERNATIVES.filter(a => a.routeFamilyId === routeFamilyId)
}
