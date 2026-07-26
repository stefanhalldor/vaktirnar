import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getAdmin: vi.fn(), fetchSnapshot: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ getAdmin: mocks.getAdmin }))
vi.mock('@/lib/weather/metno.server', () => ({ fetchForecastSnapshot: mocks.fetchSnapshot }))

import {
  selectLatestIssuedForecastRows,
  pruneMetnoRoadMapPlaceHistory,
  validateWeatherChaseHistoryRequest,
  warmAllRoadMapPlaceMetnoHistory,
  weatherChaseHistoryRangeBounds,
} from '@/lib/weather/weatherChaseHistory.server'

describe('weather chase bounded history contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-26T21:00:00.000Z'))
  })

  it('accepts only canonical IDs, at most seven items and a retained UTC day', () => {
    expect(validateWeatherChaseHistoryRequest({
      day: '2026-07-26',
      items: [
        { id: 'vedurstofan:31392', providerId: 'vedurstofan' },
        { id: 'metno:reykjavik', providerId: 'metno' },
      ],
    })).not.toBeNull()
    expect(validateWeatherChaseHistoryRequest({
      day: '2026-07-26',
      items: [{ id: 'metno:arbitrary-coordinate', providerId: 'metno' }],
    })).toBeNull()
    expect(validateWeatherChaseHistoryRequest({
      day: '2026-07-27',
      items: [{ id: 'metno:reykjavik', providerId: 'metno' }],
    })).toBeNull()
    expect(validateWeatherChaseHistoryRequest({
      day: '2026-07-11',
      items: [{ id: 'metno:reykjavik', providerId: 'metno' }],
    })).toBeNull()
    expect(validateWeatherChaseHistoryRequest({
      day: '2026-02-30',
      items: [{ id: 'metno:reykjavik', providerId: 'metno' }],
    })).toBeNull()
  })

  it('chooses the newest forecast cycle issued no later than its valid time', () => {
    const rows = [
      { target: 'a', forecast_time: '2026-07-25T12:00:00Z', cycle: '2026-07-25T06:00:00Z', value: 1 },
      { target: 'a', forecast_time: '2026-07-25T12:00:00Z', cycle: '2026-07-25T09:00:00Z', value: 2 },
      { target: 'a', forecast_time: '2026-07-25T12:00:00Z', cycle: '2026-07-25T15:00:00Z', value: 99 },
    ]
    const selected = selectLatestIssuedForecastRows(rows, row => row.target, row => row.cycle)
    expect(selected.get('a')).toEqual([expect.objectContaining({ value: 2 })])
  })

  it('reads one continuous UTC range from the requested day through today', () => {
    expect(weatherChaseHistoryRangeBounds('2026-07-23')).toEqual({
      fromIso: '2026-07-23T00:00:00.000Z',
      toIso: '2026-07-26T23:59:59.999Z',
    })
  })

  it('does not report a cron point as successful when its history write fails', async () => {
    mocks.fetchSnapshot.mockResolvedValue({
      updatedAtIso: '2026-07-26T18:00:00.000Z',
      forecasts: [{
        time: '2026-07-26T21:00:00.000Z', airTemperatureC: 9,
        windSpeedMs: 4, windGustMs: 6, windFromDegrees: 90,
        precipitationMmPerHour: 0, symbolCode: 'cloudy',
      }],
    })
    mocks.getAdmin.mockReturnValue({
      from: vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: { message: 'constraint missing' } }),
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({ lt: vi.fn().mockResolvedValue({ error: null }) })),
        })),
      })),
    })
    await expect(warmAllRoadMapPlaceMetnoHistory()).resolves.toEqual({
      total: 43, succeeded: 0, failed: 43,
    })
  })

  it('fails the warmup visibly when retention cleanup fails', async () => {
    mocks.getAdmin.mockReturnValue({
      from: vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            lt: vi.fn().mockResolvedValue({ error: { message: 'database unavailable' } }),
          })),
        })),
      })),
    })

    await expect(pruneMetnoRoadMapPlaceHistory()).rejects.toThrow('metno_history_prune_failed')
  })
})
