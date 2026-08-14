import { describe, expect, it } from 'vitest'
import { curatedRouteLabelMessageKey } from '@/lib/weather/curatedRouteLabel'

describe('curated route labels', () => {
  it.each([
    ['CURATED_VIA_HOLMAVIK', 'routeOptionViaHolmavik'],
    ['CURATED_VIA_HELLISHEIDI', 'routeOptionViaHellisheidi'],
    ['CURATED_EAST_ICELAND_VIA_HELLISHEIDI', 'routeOptionEastViaHellisheidi'],
    ['CURATED_RING_ROAD', 'routeOptionRingRoad'],
    ['CURATED_AVOID_OXI', 'routeOptionAvoidOxi'],
    ['CURATED_VIA_THRENGSLAVEGUR', 'routeOptionViaThrengslavegur'],
  ])('maps %s to localized copy', (label, expected) => {
    expect(curatedRouteLabelMessageKey([label])).toBe(expected)
  })

  it('prefers the specific east-via-Hellisheiði label over its broader corridor label', () => {
    expect(curatedRouteLabelMessageKey([
      'CURATED_VIA_HELLISHEIDI',
      'CURATED_EAST_ICELAND_VIA_HELLISHEIDI',
    ])).toBe('routeOptionEastViaHellisheidi')
  })

  it('shows a merged Hellisheiði and Öxi route as Öxi', () => {
    expect(curatedRouteLabelMessageKey([
      'CURATED_EAST_ICELAND_VIA_HELLISHEIDI',
      'CURATED_VIA_HELLISHEIDI',
    ], ['oxi-axarvegur-939'])).toBe('routeOptionOxi')
  })

  it('does not expose unknown internal labels', () => {
    expect(curatedRouteLabelMessageKey(['TESKEID_EXPERIMENTAL', 'CURATED_UNKNOWN'])).toBeNull()
  })
})
