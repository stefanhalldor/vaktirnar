export const CURATED_ROUTE_LABEL_MESSAGE_KEYS = {
  CURATED_EAST_ICELAND_VIA_HELLISHEIDI: 'routeOptionEastViaHellisheidi',
  CURATED_RING_ROAD: 'routeOptionRingRoad',
  CURATED_VIA_HELLISHEIDI: 'routeOptionViaHellisheidi',
  CURATED_VIA_HOLMAVIK: 'routeOptionViaHolmavik',
  CURATED_AVOID_OXI: 'routeOptionAvoidOxi',
  // Historical envelope/restore compatibility only.
  CURATED_VIA_THRENGSLAVEGUR: 'routeOptionViaThrengslavegur',
} as const

export type CuratedRouteLabelMessageKey =
  | typeof CURATED_ROUTE_LABEL_MESSAGE_KEYS[keyof typeof CURATED_ROUTE_LABEL_MESSAGE_KEYS]
  | 'routeOptionOxi'

/** Returns one stable, user-facing name without leaking internal labels. */
export function curatedRouteLabelMessageKey(
  labels: readonly string[],
  cautionIds: readonly string[] = [],
): CuratedRouteLabelMessageKey | null {
  // Öxi is the meaningful user-facing route identity. Hellisheiði can remain
  // attached as internal curated evidence after physical-path dedupe.
  if (cautionIds.includes('oxi-axarvegur-939')) return 'routeOptionOxi'
  for (const label of Object.keys(CURATED_ROUTE_LABEL_MESSAGE_KEYS)) {
    if (labels.includes(label)) {
      return CURATED_ROUTE_LABEL_MESSAGE_KEYS[
        label as keyof typeof CURATED_ROUTE_LABEL_MESSAGE_KEYS
      ]
    }
  }
  return null
}
