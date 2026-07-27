import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('road-map first-ready loading UI', () => {
  it('keeps route choice cards hidden until the route summary is ready', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/weather/RoadMapPrototypeMap.tsx'),
      'utf8',
    )
    const loadingBranchStart = source.indexOf(') : isRouteLoading && firstReadyRouteChoice ? (')
    const nextBranchStart = source.indexOf(') : isRouteLoading ? (', loadingBranchStart)

    expect(loadingBranchStart).toBeGreaterThan(-1)
    expect(nextBranchStart).toBeGreaterThan(loadingBranchStart)
    expect(source.slice(loadingBranchStart, nextBranchStart))
      .not.toContain('renderRouteSurfaceChoices()')
  })
})
