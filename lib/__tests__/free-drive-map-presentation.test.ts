import { describe, expect, it } from 'vitest'
import {
  FREE_DRIVE_AGGREGATE_MARKER_OFFSETS,
  FREE_DRIVE_WIND_STATUS_FILTER_MODE,
  createDefaultFreeDriveVisibleWindStatuses,
  freeDriveAggregateStationCountLabel,
  freeDriveAggregateStatus,
  freeDriveShowsIndividualStationMarkers,
  isFreeDriveWindStatusVisible,
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

  it('filters exact free-drive statuses without inheriting a grouped route preference', () => {
    const statuses = createDefaultFreeDriveVisibleWindStatuses()
    statuses.delete('innan-marka')

    expect(FREE_DRIVE_WIND_STATUS_FILTER_MODE).toBe('detailed')
    expect(isFreeDriveWindStatusVisible('innan-marka', statuses)).toBe(false)
    expect(isFreeDriveWindStatusVisible('nalgast-othaegindi', statuses)).toBe(true)
    expect(isFreeDriveWindStatusVisible('othaegilegt', statuses)).toBe(true)
    expect(isFreeDriveWindStatusVisible('no_data', statuses)).toBe(false)
    expect(isFreeDriveWindStatusVisible('haettulegt', new Set())).toBe(true)
  })

  it('clusters overview zooms but keeps every station at close free-drive zoom', () => {
    expect(freeDriveShowsIndividualStationMarkers('aggregate')).toBe(false)
    expect(freeDriveShowsIndividualStationMarkers('compact')).toBe(false)
    expect(freeDriveShowsIndividualStationMarkers('full')).toBe(true)
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
