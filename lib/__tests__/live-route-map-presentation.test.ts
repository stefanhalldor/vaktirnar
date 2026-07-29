import { describe, expect, it } from 'vitest'
import {
  resolveLiveRouteMapPresentation,
  shouldShowRouteEndpointMarker,
} from '@/lib/road-intelligence/liveRouteMapPresentation'

describe('resolveLiveRouteMapPresentation', () => {
  it('hides the Vegagerðin raster and shows only non-clear vector segments during live tracking', () => {
    expect(resolveLiveRouteMapPresentation({
      liveTrackingActive: true,
      configuredVegagerdinRasterVisibility: 'visible',
      configuredRoadSegmentsVisibility: 'visible',
    })).toEqual({
      vegagerdinRasterVisibility: 'none',
      roadSegmentsVisibility: 'visible',
      roadSegmentsFilter: ['!=', ['get', 'teskeidRoadStatus'], 'clear'],
    })
  })

  it('treats live presentation as a transient override of hidden configured layers', () => {
    expect(resolveLiveRouteMapPresentation({
      liveTrackingActive: true,
      configuredVegagerdinRasterVisibility: 'none',
      configuredRoadSegmentsVisibility: 'none',
    })).toEqual({
      vegagerdinRasterVisibility: 'none',
      roadSegmentsVisibility: 'visible',
      roadSegmentsFilter: ['!=', ['get', 'teskeidRoadStatus'], 'clear'],
    })
  })

  it.each([
    ['visible', 'visible'],
    ['visible', 'none'],
    ['none', 'visible'],
    ['none', 'none'],
  ] as const)(
    'restores configured raster %s and vector %s visibility outside live tracking',
    (configuredVegagerdinRasterVisibility, configuredRoadSegmentsVisibility) => {
      expect(resolveLiveRouteMapPresentation({
        liveTrackingActive: false,
        configuredVegagerdinRasterVisibility,
        configuredRoadSegmentsVisibility,
      })).toEqual({
        vegagerdinRasterVisibility: configuredVegagerdinRasterVisibility,
        roadSegmentsVisibility: configuredRoadSegmentsVisibility,
        roadSegmentsFilter: null,
      })
    },
  )
})

describe('shouldShowRouteEndpointMarker', () => {
  it('keeps the exact origin visible while permission is pending and no live puck exists', () => {
    expect(shouldShowRouteEndpointMarker({
      routeContextVisible: true,
      endpointMarkersCurrent: true,
      livePuckVisible: false,
      kind: 'origin',
    })).toBe(true)
  })

  it('lets an active puck replace only the exact origin label', () => {
    expect(shouldShowRouteEndpointMarker({
      routeContextVisible: true,
      endpointMarkersCurrent: true,
      livePuckVisible: true,
      kind: 'origin',
    })).toBe(false)
    expect(shouldShowRouteEndpointMarker({
      routeContextVisible: true,
      endpointMarkersCurrent: true,
      livePuckVisible: true,
      kind: 'destination',
    })).toBe(true)
    expect(shouldShowRouteEndpointMarker({
      routeContextVisible: true,
      endpointMarkersCurrent: true,
      livePuckVisible: true,
      kind: 'coverage-end',
    })).toBe(true)
  })

  it('fails closed for stale markers or a non-route context', () => {
    expect(shouldShowRouteEndpointMarker({
      routeContextVisible: true,
      endpointMarkersCurrent: false,
      livePuckVisible: false,
      kind: 'destination',
    })).toBe(false)
    expect(shouldShowRouteEndpointMarker({
      routeContextVisible: false,
      endpointMarkersCurrent: true,
      livePuckVisible: false,
      kind: 'destination',
    })).toBe(false)
  })
})
