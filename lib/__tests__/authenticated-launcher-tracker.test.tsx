import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockEnqueue, mockPathname } = vi.hoisted(() => ({
  mockEnqueue: vi.fn(),
  mockPathname: vi.fn(),
}))

vi.mock('next/navigation', () => ({ usePathname: mockPathname }))
vi.mock('@/lib/teskeid/launcherTracker', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/teskeid/launcherTracker')>(),
  enqueueTeskeidLauncherCommit: mockEnqueue,
}))

import { AuthenticatedLauncherTracker } from '@/components/teskeid/AuthenticatedLauncherTracker'

beforeEach(() => {
  vi.clearAllMocks()
  mockPathname.mockReturnValue('/auth-mvp/vedrid')
  mockEnqueue.mockResolvedValue(true)
})

describe('authenticated launcher path tracker', () => {
  it('never enqueues the exact public road-map route, even when a signed-in proof exists', async () => {
    mockPathname.mockReturnValue('/auth-mvp/vedrid/road-map-prototype')
    render(<AuthenticatedLauncherTracker commitProof="signed-in-account-proof" />)
    await Promise.resolve()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it.each([
    '/auth-mvp/verkefnin/adild',
    '/auth-mvp/verkefnin/bod/invitation-id',
    '/auth-mvp/heimilisverkin/adild',
    '/auth-mvp/heimilisverkin/bod/invitation-id',
  ])('never treats the Tasks consent route %s as a feature-open signal', async (pathname) => {
    mockPathname.mockReturnValue(pathname)
    render(<AuthenticatedLauncherTracker commitProof="signed-in-account-proof" />)
    await Promise.resolve()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('enqueues an authenticated feature path with the server-issued proof', async () => {
    render(<AuthenticatedLauncherTracker commitProof="signed-in-account-proof" />)
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalledOnce())
    expect(mockEnqueue).toHaveBeenCalledWith(
      'vedrid',
      expect.stringMatching(/^launcher-commit-/),
      'signed-in-account-proof',
    )
  })

  it('creates a fresh coordinated commit for a deep path transition within the same feature', async () => {
    const { rerender } = render(
      <AuthenticatedLauncherTracker commitProof="signed-in-account-proof" />,
    )
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalledOnce())
    const firstToken = mockEnqueue.mock.calls[0]?.[1]

    mockPathname.mockReturnValue('/auth-mvp/vedrid/puls/stod/1')
    rerender(<AuthenticatedLauncherTracker commitProof="signed-in-account-proof" />)
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalledTimes(2))
    expect(mockEnqueue.mock.calls[1]?.[1]).not.toBe(firstToken)
  })

  it('does not enqueue when auth resolution issued no proof', async () => {
    render(<AuthenticatedLauncherTracker commitProof={null} />)
    await Promise.resolve()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })
})
