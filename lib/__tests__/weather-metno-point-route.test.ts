import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchForecast } = vi.hoisted(() => ({
  fetchForecast: vi.fn(),
}))

vi.mock('@/lib/weather/weatherChaseHistory.server', () => ({
  fetchRoadMapPlaceMetnoForecast: fetchForecast,
}))

import { GET } from '@/app/api/teskeid/weather/metno/point/route'

describe('public met.no point route', () => {
  beforeEach(() => {
    fetchForecast.mockReset()
  })

  it('fetches a forecast only for a canonical place id', async () => {
    fetchForecast.mockResolvedValueOnce([{ time: '2026-07-25T12:00:00Z' }])

    const response = await GET(new Request(
      'https://teskeid.is/api/teskeid/weather/metno/point?placeId=egilsstadir',
    ))

    expect(response.status).toBe(200)
    expect(fetchForecast).toHaveBeenCalledWith(expect.objectContaining({
      id: 'egilsstadir', lat: 65.2674, lon: -14.3948,
    }))
  })

  it('rejects arbitrary coordinates and unknown place ids', async () => {
    const response = await GET(new Request(
      'https://teskeid.is/api/teskeid/weather/metno/point?lat=64.1&lon=-21.9',
    ))

    expect(response.status).toBe(400)
    expect(fetchForecast).not.toHaveBeenCalled()
  })

  it('does not return a successful empty forecast', async () => {
    fetchForecast.mockResolvedValueOnce([])

    const response = await GET(new Request(
      'https://teskeid.is/api/teskeid/weather/metno/point?placeId=isafjordur',
    ))

    expect(response.status).toBe(503)
  })
})
