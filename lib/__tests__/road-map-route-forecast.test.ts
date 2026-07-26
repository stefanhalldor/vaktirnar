import { describe, expect, it } from 'vitest'
import {
  formatRouteReferenceLabel,
  isRouteForecastBuildCurrent,
} from '@/components/weather/RoadMapPrototypeMap'

describe('route departure forecast build state', () => {
  it('reuses a completed scrubber only for the active route context', () => {
    const firstRouteContext = {}
    const secondRouteContext = {}

    expect(isRouteForecastBuildCurrent(firstRouteContext, firstRouteContext)).toBe(true)
    expect(isRouteForecastBuildCurrent(firstRouteContext, secondRouteContext)).toBe(false)
    expect(isRouteForecastBuildCurrent(null, secondRouteContext)).toBe(false)
  })

  it('identifies the exact numbered provider route used by the weather calculation', () => {
    expect(formatRouteReferenceLabel({
      providerLabel: 'Google-leið',
      providerIndex: 0,
      providerCount: 2,
      routeName: 'Vestfjarðavegur/Leið 60',
    })).toBe('Google-leið 1 (Vestfjarðavegur/Leið 60)')

    expect(formatRouteReferenceLabel({
      providerLabel: 'Google-leið',
      providerIndex: 1,
      providerCount: 2,
      routeName: 'Djúpurvegur/Leið 61',
    })).toBe('Google-leið 2 (Djúpurvegur/Leið 61)')
  })
})
