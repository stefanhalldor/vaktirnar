import { describe, expect, it } from 'vitest'
import {
  resolveLiveLocationCameraOffset,
  resolveLiveRouteMapPresentation,
  shouldShowRouteEndpointMarker,
} from '@/lib/road-intelligence/liveRouteMapPresentation'

describe('resolveLiveLocationCameraOffset', () => {
  it('centers the tracked point in the visible map above the bottom controls', () => {
    expect(resolveLiveLocationCameraOffset(240, 720)).toEqual([0, -120])
  })

  it('caps the offset so a tall overlay cannot push the tracked point off-map', () => {
    expect(resolveLiveLocationCameraOffset(900, 600)).toEqual([0, -210])
  })

  it.each([
    [0, 600],
    [-20, 600],
    [200, 0],
    [Number.NaN, 600],
  ])('returns no offset for invalid dimensions (%s, %s)', (overlayHeight, mapHeight) => {
    expect(resolveLiveLocationCameraOffset(overlayHeight, mapHeight)).toEqual([0, 0])
  })
})

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
  })

  it.each(['coverage-start', 'coverage-end'] as const)(
    'keeps internal %s markers off both normal and live route maps',
    kind => {
      expect(shouldShowRouteEndpointMarker({
        routeContextVisible: true,
        endpointMarkersCurrent: true,
        livePuckVisible: false,
        kind,
      })).toBe(false)
      expect(shouldShowRouteEndpointMarker({
        routeContextVisible: true,
        endpointMarkersCurrent: true,
        livePuckVisible: true,
        kind,
      })).toBe(false)
    },
  )

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
