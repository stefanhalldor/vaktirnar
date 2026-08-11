import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGuardTeskeidSession,
  mockGuardFeatureAccess,
  mockRedirect,
} = vi.hoisted(() => ({
  mockGuardTeskeidSession: vi.fn(),
  mockGuardFeatureAccess: vi.fn(),
  mockRedirect: vi.fn(),
}))

vi.mock('@/lib/auth/guard', () => ({
  guardTeskeidSession: mockGuardTeskeidSession,
}))

vi.mock('@/lib/loans/guard', () => ({
  guardFeatureAccess: mockGuardFeatureAccess,
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

import NewRelationshipCirclePage from '@/app/stillingar/tengsl/hringir/nyr/page'

describe('NewRelationshipCirclePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGuardTeskeidSession.mockResolvedValue({
      user: { id: 'owner-id', email: 'owner@example.com' },
    })
    mockGuardFeatureAccess.mockResolvedValue(undefined)
    mockRedirect.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT')
    })
  })

  it('runs session and feature guards before redirecting the frozen creation route', async () => {
    await expect(NewRelationshipCirclePage()).rejects.toThrow('NEXT_REDIRECT')

    expect(mockGuardFeatureAccess).toHaveBeenCalledWith('owner@example.com', 'tengsl')
    expect(mockRedirect).toHaveBeenCalledWith('/stillingar/tengsl/hringir')
    expect(mockGuardTeskeidSession.mock.invocationCallOrder[0]).toBeLessThan(
      mockGuardFeatureAccess.mock.invocationCallOrder[0],
    )
    expect(mockGuardFeatureAccess.mock.invocationCallOrder[0]).toBeLessThan(
      mockRedirect.mock.invocationCallOrder[0],
    )
  })
})
