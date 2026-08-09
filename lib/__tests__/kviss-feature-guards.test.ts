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

describe('Kviss feature guard', () => {
  const originalKviss = process.env.KVISS_ENABLED

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.KVISS_ENABLED
  })
  afterEach(() => {
    if (originalKviss === undefined) delete process.env.KVISS_ENABLED
    else process.env.KVISS_ENABLED = originalKviss
  })

  it('requires both global and per-user access', async () => {
    featureResult.mockResolvedValue({ data: { email: 'user@example.com' }, error: null })
    expect(await checkFeatureAccess('user', 'user@example.com', 'kviss')).toBe(false)
    expect(featureResult).not.toHaveBeenCalled()

    process.env.KVISS_ENABLED = 'true'
    featureResult.mockResolvedValueOnce({ data: null, error: null })
    expect(await checkFeatureAccess('user', 'user@example.com', 'kviss')).toBe(false)
    featureResult.mockResolvedValueOnce({ data: { email: 'user@example.com' }, error: null })
    expect(await checkFeatureAccess('user', 'user@example.com', 'kviss')).toBe(true)
  })
})
