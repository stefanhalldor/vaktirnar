import type { RouteOption } from '@/lib/weather/provider.types'

function surface(route: RouteOption) {
  return route.experimental?.surface
}

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * Frozen v238 route-only presentation comparator. It deliberately knows
 * nothing about weather, providers or station coverage.
 */
export function compareTeskeidRouteOptions(
  left: RouteOption,
  right: RouteOption,
  leftEngineOrder: number,
  rightEngineOrder: number,
): number {
  const leftSurface = surface(left)
  const rightSurface = surface(right)
  const uncertainDifference = compareNumber(
    (leftSurface?.unknownM ?? Number.POSITIVE_INFINITY)
      + (leftSurface?.mixedM ?? Number.POSITIVE_INFINITY),
    (rightSurface?.unknownM ?? Number.POSITIVE_INFINITY)
      + (rightSurface?.mixedM ?? Number.POSITIVE_INFINITY),
  )
  if (uncertainDifference !== 0) return uncertainDifference

  const fRoadDifference = compareNumber(
    left.experimental?.fRoad?.distanceM ?? 0,
    right.experimental?.fRoad?.distanceM ?? 0,
  )
  if (fRoadDifference !== 0) return fRoadDifference

  const cautionDifference = compareNumber(
    (left.cautions?.length ?? 0) === 0 ? 0 : 1,
    (right.cautions?.length ?? 0) === 0 ? 0 : 1,
  )
  if (cautionDifference !== 0) return cautionDifference

  const gravelDifference = compareNumber(
    leftSurface?.gravelM ?? Number.POSITIVE_INFINITY,
    rightSurface?.gravelM ?? Number.POSITIVE_INFINITY,
  )
  if (gravelDifference !== 0) return gravelDifference

  return compareNumber(leftEngineOrder, rightEngineOrder)
    || left.id.localeCompare(right.id)
}

export type TeskeidRouteInclusion = 'primary' | 'safety' | 'hellisheidi' | 'ring' | 'generic'

export type TeskeidRouteSelectionRecord<T> = Readonly<{
  value: T
  engineOrder: number
  inclusion: TeskeidRouteInclusion
  stableId: string
}>

const INCLUSION_RANK: Readonly<Record<TeskeidRouteInclusion, number>> = {
  primary: 0,
  safety: 1,
  hellisheidi: 2,
  ring: 3,
  generic: 4,
}

/**
 * Applies the product inclusion contract before presentation sorting. A
 * mandatory route is never evicted by a generic alternative; an impossible
 * mandatory set fails truthfully instead of being truncated.
 */
export function selectTeskeidRouteRecordsBeforeCap<T>(input: {
  records: readonly TeskeidRouteSelectionRecord<T>[]
  cap: number
}): readonly TeskeidRouteSelectionRecord<T>[] | null {
  const cap = Number.isInteger(input.cap) && input.cap > 0 ? input.cap : 0
  const mandatoryCount = input.records.filter(record => record.inclusion !== 'generic').length
  if (cap === 0 || mandatoryCount > cap) return null
  return [...input.records]
    .sort((left, right) => (
      INCLUSION_RANK[left.inclusion] - INCLUSION_RANK[right.inclusion]
      || left.engineOrder - right.engineOrder
      || left.stableId.localeCompare(right.stableId)
    ))
    .slice(0, cap)
}
