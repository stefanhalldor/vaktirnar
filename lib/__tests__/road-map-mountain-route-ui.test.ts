import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'),
  'utf8',
)

describe('road-map mountain-route presentation', () => {
  it('does not classify an F-road route as a paved Teskeið route', () => {
    expect(source).toContain(
      ".filter(route => (route.route.experimental?.fRoad?.distanceM ?? 0) === 0)",
    )
  })

  it('shows mountain-road distance separately from the physical surface summary', () => {
    expect(source).toContain("t('roadMapPrototypeRouteMountainRoadMetric'")
    expect(source).toContain("t('roadMapPrototypeSurfaceBreakdown'")
  })
})
