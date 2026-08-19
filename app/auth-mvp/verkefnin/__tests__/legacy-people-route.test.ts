import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  permanentRedirect: vi.fn((href: string) => {
    throw new Error(`PERMANENT_REDIRECT:${href}`)
  }),
}))

vi.mock('next/navigation', () => ({ permanentRedirect: mocks.permanentRedirect }))

import LegacyHouseholdChorePeoplePage from '@/app/auth-mvp/verkefnin/(content)/[circleId]/heimili/page'

describe('legacy people route compatibility', () => {
  beforeEach(() => {
    mocks.permanentRedirect.mockClear()
  })

  it('preserves the circle and repeated query parameters when redirecting to folk', async () => {
    await expect(LegacyHouseholdChorePeoplePage({
      params: Promise.resolve({ circleId: 'circle-id' }),
      searchParams: Promise.resolve({
        mode: 'review',
        tag: ['member', 'child'],
      }),
    })).rejects.toThrow(
      'PERMANENT_REDIRECT:/auth-mvp/verkefnin/circle-id/folk?mode=review&tag=member&tag=child',
    )

    expect(mocks.permanentRedirect).toHaveBeenCalledWith(
      '/auth-mvp/verkefnin/circle-id/folk?mode=review&tag=member&tag=child',
    )
  })
})
