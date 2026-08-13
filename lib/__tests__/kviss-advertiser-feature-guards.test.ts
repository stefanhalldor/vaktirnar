import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { featureResult } = vi.hoisted(() => ({
  featureResult: vi.fn(),
}))

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/auth/guard', () => ({ guardTeskeidSession: vi.fn() }))
vi.mock('@/lib/weather/weatherEnabledMode.server', () => ({ getWeatherEnabledMode: vi.fn(() => 'off') }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: featureResult })) })),
      })),
    })),
  })),
}))

import { checkFeatureAccess } from '@/lib/loans/guard'

describe('Kviss, advertiser and booking-provider feature guards', () => {
  const originalKviss = process.env.KVISS_ENABLED
  const originalAdvertiser = process.env.ADVERTISER_ENABLED
  const originalBookings = process.env.BOOKINGS_ENABLED

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.KVISS_ENABLED
    delete process.env.ADVERTISER_ENABLED
    delete process.env.BOOKINGS_ENABLED
  })
  afterEach(() => {
    if (originalKviss === undefined) delete process.env.KVISS_ENABLED
    else process.env.KVISS_ENABLED = originalKviss
    if (originalAdvertiser === undefined) delete process.env.ADVERTISER_ENABLED
    else process.env.ADVERTISER_ENABLED = originalAdvertiser
    if (originalBookings === undefined) delete process.env.BOOKINGS_ENABLED
    else process.env.BOOKINGS_ENABLED = originalBookings
  })

  it.each([
    ['kviss', 'KVISS_ENABLED'],
    ['auglysandi', 'ADVERTISER_ENABLED'],
    ['bokanir', 'BOOKINGS_ENABLED'],
  ] as const)('requires both global and per-user access for %s', async (feature, envKey) => {
    featureResult.mockResolvedValue({ data: { email: 'user@example.com' }, error: null })
    expect(await checkFeatureAccess('user', 'user@example.com', feature)).toBe(false)
    expect(featureResult).not.toHaveBeenCalled()

    process.env[envKey] = 'true'
    featureResult.mockResolvedValueOnce({ data: null, error: null })
    expect(await checkFeatureAccess('user', 'user@example.com', feature)).toBe(false)
    featureResult.mockResolvedValueOnce({ data: { email: 'user@example.com' }, error: null })
    expect(await checkFeatureAccess('user', 'user@example.com', feature)).toBe(true)
  })
})
