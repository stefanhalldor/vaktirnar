import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetAdmin } = vi.hoisted(() => ({ mockGetAdmin: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: mockGetAdmin,
}))

vi.mock('server-only', () => ({}))

import { recordRouteMemory } from '@/lib/iceland-routes/routeMemory.server'

describe('recordRouteMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to writing route memory without route_caution_ids when sql/87 is missing', async () => {
    const firstSingle = vi.fn().mockResolvedValue({ data: null, error: { code: '42703' } })
    const fallbackSingle = vi.fn().mockResolvedValue({ data: { id: 'route-1' }, error: null })
    const selectFn = vi
      .fn()
      .mockReturnValueOnce({ single: firstSingle })
      .mockReturnValueOnce({ single: fallbackSingle })
    const upsertFn = vi.fn().mockReturnValue({ select: selectFn })

    const stationDeleteProviderEq = vi.fn().mockResolvedValue({ error: null })
    const stationDeleteRouteEq = vi.fn().mockReturnValue({ eq: stationDeleteProviderEq })
    const stationDeleteFn = vi.fn().mockReturnValue({ eq: stationDeleteRouteEq })
    const stationInsertFn = vi.fn().mockResolvedValue({ error: null })

    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'weather_route_memory_routes') {
        return { upsert: upsertFn }
      }
      if (table === 'weather_route_memory_stations') {
        return { delete: stationDeleteFn, insert: stationInsertFn }
      }
      throw new Error(`unexpected table ${table}`)
    })

    mockGetAdmin.mockReturnValue({ from: fromFn })

    await recordRouteMemory({
      routeKey: 'reykjavik--storaborg--route-1',
      fromPlaceKey: 'reykjavik',
      fromPlaceLabel: 'Reykjavík',
      toPlaceKey: 'storaborg',
      toPlaceLabel: 'Stóra-Borg',
      routeVariantKey: 'route-1',
      routeVariantLabel: null,
      routeCautionIds: ['trailer'],
      stations: [
        {
          provider: 'vedurstofan',
          stationId: '1',
          stationName: 'Stöð 1',
          routeOrder: 0,
        },
      ],
      providersEvaluated: ['vedurstofan'],
    })

    expect(upsertFn).toHaveBeenCalledTimes(2)
    expect(upsertFn.mock.calls[0][0]).toMatchObject({
      route_key: 'reykjavik--storaborg--route-1',
      to_place_key: 'storaborg',
      to_place_label: 'Stóra-Borg',
      route_caution_ids: ['trailer'],
    })
    expect(upsertFn.mock.calls[1][0]).toMatchObject({
      route_key: 'reykjavik--storaborg--route-1',
      to_place_key: 'storaborg',
      to_place_label: 'Stóra-Borg',
    })
    expect(upsertFn.mock.calls[1][0]).not.toHaveProperty('route_caution_ids')
    expect(stationDeleteProviderEq).toHaveBeenCalledWith('provider', 'vedurstofan')
    expect(stationInsertFn).toHaveBeenCalledWith([
      expect.objectContaining({
        route_id: 'route-1',
        provider: 'vedurstofan',
        station_id: '1',
        station_name: 'Stöð 1',
      }),
    ])
  })
})
