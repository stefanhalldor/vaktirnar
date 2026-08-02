import { describe, expect, it } from 'vitest'
import {
  FREE_DRIVE_AGGREGATE_MARKER_OFFSETS,
  createDefaultFreeDriveVisibleWindStatuses,
  freeDriveAggregateStationCountLabel,
  freeDriveAggregateStatus,
  overviewStationClusterKey,
  routeOriginFromLiveLocation,
} from '@/lib/weather/freeDriveMapPresentation'

describe('free-drive map presentation', () => {
  it('keeps station counts in separate wind-status clusters', () => {
    expect(overviewStationClusterKey('reykjavik', 'innan-marka', true)).toBe(
      'reykjavik:innan-marka',
    )
    expect(overviewStationClusterKey('reykjavik', 'haettulegt', true)).toBe(
      'reykjavik:haettulegt',
    )
    expect(overviewStationClusterKey('reykjavik', 'haettulegt', false)).toBe('reykjavik')
    expect(FREE_DRIVE_AGGREGATE_MARKER_OFFSETS['innan-marka']).not.toEqual(
      FREE_DRIVE_AGGREGATE_MARKER_OFFSETS.haettulegt,
    )
    expect(freeDriveAggregateStatus('no_data')).toBe('no_wind_data')
    expect(freeDriveAggregateStatus('haettulegt')).toBe('haettulegt')
    expect(freeDriveAggregateStationCountLabel(1)).toBe('1')
    expect(freeDriveAggregateStationCountLabel(11)).toBe('11')
  })

  it('starts free-drive with measured wind statuses visible and missing wind hidden', () => {
    const statuses = createDefaultFreeDriveVisibleWindStatuses()
    expect([...statuses]).toEqual([
      'innan-marka',
      'nalgast-othaegindi',
      'othaegilegt',
      'nalgast-haettumork',
      'haettulegt',
    ])
    expect(statuses.has('no_data')).toBe(false)
    expect(statuses.has('no_wind_data')).toBe(false)
  })

  it('turns the last trusted free-drive point into an exact device origin', () => {
    expect(routeOriginFromLiveLocation({
      lat: 64.1466,
      lon: -21.9426,
      accuracyM: 7,
    }, 'Núverandi staðsetning')).toEqual({
      name: 'Núverandi staðsetning',
      lat: 64.1466,
      lon: -21.9426,
      source: 'device',
      labelSource: 'device',
      sourceId: 'device:64.146600:-21.942600',
      placeType: 'point',
      accuracyM: 7,
    })
  })

  it('rejects a live point outside Iceland instead of seeding a false origin', () => {
    expect(routeOriginFromLiveLocation({
      lat: 51.5072,
      lon: -0.1276,
      accuracyM: 5,
    }, 'Núverandi staðsetning')).toBeNull()
  })
})
