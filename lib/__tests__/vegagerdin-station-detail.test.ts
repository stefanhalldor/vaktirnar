import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  fetchVegagerdinStationDetail,
} from '@/lib/weather/providers/vegagerdinStationDetail.server'
import {
  shouldOpenVegagerdinStationExternally,
  shouldWarnVegagerdinStationAge,
  vegagerdinStationUrl,
} from '@/lib/weather/vegagerdinStationPresentation'

afterEach(() => vi.unstubAllGlobals())

describe('Vegagerðin station presentation', () => {
  const now = Date.parse('2026-08-13T10:40:00Z')

  it('warns at 20 minutes and uses external-only mode at 90 minutes', () => {
    expect(shouldWarnVegagerdinStationAge('2026-08-13T10:20:00Z', now)).toBe(true)
    expect(shouldOpenVegagerdinStationExternally('2026-08-13T09:10:00Z', now)).toBe(true)
    expect(shouldOpenVegagerdinStationExternally('2026-08-13T09:11:00Z', now)).toBe(false)
  })

  it('builds only bounded numeric Umferðin station links', () => {
    expect(vegagerdinStationUrl('12')).toBe('https://umferdin.is/vedurstodvar/12')
    expect(vegagerdinStationUrl('../12')).toBeNull()
  })
})

describe('fetchVegagerdinStationDetail', () => {
  it('maps station measurements and only connected official camera images', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        WeatherStation: {
          id: 12,
          name: 'Hafnarfjall',
          owner: 'Vegagerðin',
          lastUpdate: '2026-08-13T10:30:00Z',
          RoadConditionIds: ['80402'],
          wind: { speed: 1.3, gust: 2.4 },
          windDirection: { description: 'NNA', degrees: 20 },
          temperature: 13.8,
          roadTemperature: 13.8,
          humidity: 99,
          traffic: 129,
          trafficFromMidnight: 2269,
          dewPoint: 13.6,
        },
        Cameras: { results: [
          {
            id: 7192,
            name: 'Hafnarfjall',
            RoadConditionIds: ['80402'],
            images: [
              { id: 131, url: 'https://www.vegagerdin.is/vgdata/vefmyndavelar/hafnarfjall_1.jpg', description: 'Hafnarfjall séð til suðurs' },
              { id: 999, url: 'https://example.com/not-official.jpg', description: 'Óheimil mynd' },
            ],
          },
          { id: 2, name: 'Önnur', RoadConditionIds: ['x'], images: [] },
        ] },
      },
    }), { headers: { 'Content-Type': 'application/json' } })))

    const result = await fetchVegagerdinStationDetail(12)

    expect(result).toMatchObject({
      stationId: '12',
      stationName: 'Hafnarfjall',
      trafficLast10Min: 129,
      trafficFromMidnight: 2269,
      humidityPercent: 99,
      dewPointC: 13.6,
      ownerName: 'Vegagerðin',
    })
    expect(result?.cameras).toEqual([{
      id: '131',
      description: 'Hafnarfjall séð til suðurs',
      imageUrl: 'https://www.vegagerdin.is/vgdata/vefmyndavelar/hafnarfjall_1.jpg',
    }])
  })
})
