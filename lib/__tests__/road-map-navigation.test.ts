import { describe, expect, it } from 'vitest'
import {
  ROAD_MAP_PROTOTYPE_NAVIGATION,
  buildRoadMapFreeDriveSignInReturnHref,
  buildRoadMapLiveLocationSignInReturnHref,
  buildRoadMapRouteReturnHref,
  buildRoadMapRouteSignInReturnHref,
  buildRoadMapSignInReturnHref,
  buildRoadMapStationReturnHref,
  type RoadMapNavigation,
} from '@/lib/weather/roadMapNavigation'

const promotedPublicNavigation: RoadMapNavigation = {
  canonicalPath: '/vedrid',
  authenticatedPath: '/auth-mvp/vedrid',
}

describe('road map navigation', () => {
  it('preserves the prototype route as the compatibility default', () => {
    expect(buildRoadMapRouteReturnHref(ROAD_MAP_PROTOTYPE_NAVIGATION, 'map')).toBe(
      '/auth-mvp/vedrid/road-map-prototype?context=route&view=map&restoreRoute=1',
    )
  })

  it('builds a public canonical route restore URL', () => {
    expect(buildRoadMapRouteReturnHref(promotedPublicNavigation, 'information')).toBe(
      '/vedrid?context=route&view=information&restoreRoute=1',
    )
  })

  it('uses the authenticated destination after public sign-in', () => {
    expect(buildRoadMapSignInReturnHref(promotedPublicNavigation)).toBe(
      '/auth-mvp/vedrid?context=route&view=information',
    )
    expect(buildRoadMapSignInReturnHref(promotedPublicNavigation, 'weather')).toBe(
      '/auth-mvp/vedrid?context=weather&view=information',
    )
  })

  it('restores the route directly into the map after live-location sign-in', () => {
    expect(buildRoadMapLiveLocationSignInReturnHref(promotedPublicNavigation)).toBe(
      '/auth-mvp/vedrid?context=route&view=map&restoreRoute=1',
    )
  })

  it('returns a pending free-drive sign-in to threshold setup instead of the map', () => {
    expect(buildRoadMapFreeDriveSignInReturnHref(promotedPublicNavigation)).toBe(
      '/auth-mvp/vedrid?context=route&view=information&drive=1',
    )
  })

  it('restores the route form and calculation after guest quota sign-in', () => {
    expect(buildRoadMapRouteSignInReturnHref(promotedPublicNavigation)).toBe(
      '/auth-mvp/vedrid?context=route&view=information&restoreRoute=1',
    )
  })

  it('builds station return URLs without losing the canonical path', () => {
    expect(buildRoadMapStationReturnHref(promotedPublicNavigation, '34238')).toBe(
      '/vedrid?stationId=34238',
    )
    expect(buildRoadMapStationReturnHref(promotedPublicNavigation)).toBe('/vedrid')
  })
})
