import { describe, expect, it } from 'vitest'
import {
  isRouteFractionWithinAssessedRange,
  splitRouteByAssessedFractions,
} from '@/lib/weather/routeAssessmentDisplaySegments'

describe('route assessment display segments', () => {
  it('interpolates assessment boundaries inside polyline segments', () => {
    const result = splitRouteByAssessedFractions([
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 },
      { lat: 0, lon: 2 },
    ], 0.25, 0.75)

    expect(result).not.toBeNull()
    expect(result?.unassessedBefore).toHaveLength(2)
    expect(result?.assessed).toHaveLength(3)
    expect(result?.unassessedAfter).toHaveLength(2)
    expect(result?.assessedStartPoint.lon).toBeCloseTo(0.5, 6)
    expect(result?.assessedEndPoint.lon).toBeCloseTo(1.5, 6)
    expect(result?.assessedStartPoint).toEqual(result?.unassessedBefore.at(-1))
    expect(result?.assessedEndPoint).toEqual(result?.unassessedAfter[0])
    expect(result?.assessedStartPoint.lon).not.toBe(0)
    expect(result?.assessedStartPoint.lon).not.toBe(1)
  })

  it('fails closed for malformed ranges and route geometry', () => {
    const route = [
      { lat: 64.1, lon: -21.9 },
      { lat: 64.2, lon: -21.8 },
    ]

    expect(splitRouteByAssessedFractions(route, 0.8, 0.2)).toBeNull()
    expect(splitRouteByAssessedFractions(route, -0.1, 0.5)).toBeNull()
    expect(splitRouteByAssessedFractions(route, 0, 1.1)).toBeNull()
    expect(splitRouteByAssessedFractions([{ lat: Number.NaN, lon: -21.9 }, route[1]], 0, 0.5))
      .toBeNull()
  })

  it('only accepts verified provider points inside the assessed range', () => {
    expect(isRouteFractionWithinAssessedRange(0.2, 0.2, 0.6)).toBe(true)
    expect(isRouteFractionWithinAssessedRange(0.6, 0.2, 0.6)).toBe(true)
    expect(isRouteFractionWithinAssessedRange(0.19, 0.2, 0.6)).toBe(false)
    expect(isRouteFractionWithinAssessedRange(0.61, 0.2, 0.6)).toBe(false)
    expect(isRouteFractionWithinAssessedRange(null, 0.2, 0.6)).toBe(false)
    expect(isRouteFractionWithinAssessedRange(undefined, 0.2, 0.6)).toBe(false)
    expect(isRouteFractionWithinAssessedRange(Number.NaN, 0.2, 0.6)).toBe(false)
    expect(isRouteFractionWithinAssessedRange(0.4, 0.7, 0.3)).toBe(false)
  })
})
