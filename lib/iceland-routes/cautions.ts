/**
 * Draft Road Intelligence cautions attached to canonical route segments.
 *
 * Keep these provider-neutral: a caution explains Teskeið road knowledge, not a
 * temporary official road condition.
 */

import type { IcelandRouteCaution } from './types'

export const ICELAND_ROAD_CAUTIONS: readonly IcelandRouteCaution[] = [
  {
    id: 'hellisheidi-vindnaemt',
    segmentId: 'ring-road-hellisheidi',
    tag: 'vindnaemt',
    label: 'Vindnæmt',
    labelEn: 'Wind-exposed',
    severity: 'caution',
  },
  {
    id: 'hellisheidi-fjallvegur',
    segmentId: 'ring-road-hellisheidi',
    tag: 'fjallvegur',
    label: 'Fjallvegur',
    labelEn: 'Mountain road',
    severity: 'info',
  },
  {
    id: 'oxi-lokad-kann',
    segmentId: 'oxi-axarvegur',
    tag: 'lokad-kann-ad-vera',
    label: 'Getur verið lokað',
    labelEn: 'May be closed',
    severity: 'caution',
  },
  {
    id: 'oxi-fjallvegur',
    segmentId: 'oxi-axarvegur',
    tag: 'fjallvegur',
    label: 'Fjallvegur',
    labelEn: 'Mountain road',
    severity: 'caution',
  },
  {
    id: 'oxi-eftirvagn',
    segmentId: 'oxi-axarvegur',
    tag: 'varasamt-eftirvagn',
    label: 'Varasamt með eftirvagn',
    labelEn: 'Risky with a trailer',
    severity: 'danger',
  },
  {
    id: 'holmavik-vindnaemt',
    segmentId: 'holmavik-sudurleid',
    tag: 'vindnaemt',
    label: 'Vindnæmt',
    labelEn: 'Wind-exposed',
    severity: 'caution',
  },
  {
    id: 'threngsli-fjallvegur',
    segmentId: 'threngsli',
    tag: 'fjallvegur',
    label: 'Fjallvegur',
    labelEn: 'Mountain road',
    severity: 'info',
  },
]

export function getRoadCautionsForSegments(
  segmentIds: Iterable<string>,
): readonly IcelandRouteCaution[] {
  const wanted = new Set(segmentIds)
  return ICELAND_ROAD_CAUTIONS.filter(c => wanted.has(c.segmentId))
}
