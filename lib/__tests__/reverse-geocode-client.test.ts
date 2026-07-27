import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolvePlaceLabel } from '@/lib/weather/reverseGeocode.client'

describe('resolvePlaceLabel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('uses the POST-only privacy contract and reads the nested location label', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        location: {
          name: 'Melás 8',
          formattedAddress: 'Melás 8, 210 Garðabær',
        },
        distanceM: 12,
      }),
    } as unknown as Response)

    await expect(resolvePlaceLabel(64.0865, -21.9395)).resolves.toBe(
      'Melás 8, 210 Garðabær',
    )
    expect(fetch).toHaveBeenCalledWith('/api/place/reverse-geocode', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 64.0865, lon: -21.9395 }),
    })
  })

  it('falls back to the display name and returns null for an unusable response', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ location: { name: 'Garðabær' } }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ location: null }),
      } as unknown as Response)

    await expect(resolvePlaceLabel(64.2, -21.8)).resolves.toBe('Garðabær')
    await expect(resolvePlaceLabel(65.9, -19.1)).resolves.toBeNull()
  })
})
