import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGuardSession } = vi.hoisted(() => ({ mockGuardSession: vi.fn() }))
const { mockResolveShellAccess, mockGetWeatherMode } = vi.hoisted(() => ({
  mockResolveShellAccess: vi.fn(),
  mockGetWeatherMode: vi.fn(),
}))
const { mockCheckFeatureAccess } = vi.hoisted(() => ({ mockCheckFeatureAccess: vi.fn() }))
const { mockIsTeskeidRouteCandidateEnabled } = vi.hoisted(() => ({
  mockIsTeskeidRouteCandidateEnabled: vi.fn(),
}))
const { roadMapProps } = vi.hoisted(() => ({ roadMapProps: vi.fn() }))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) }),
}))

vi.mock('@/lib/auth/guard', () => ({
  guardTeskeidSession: mockGuardSession,
}))

vi.mock('@/lib/weather/weatherBaseAccess.server', () => ({
  resolveAuthenticatedWeatherShellAccess: mockResolveShellAccess,
  getWeatherEnabledMode: mockGetWeatherMode,
}))

vi.mock('@/lib/loans/guard', () => ({
  checkFeatureAccess: mockCheckFeatureAccess,
}))

vi.mock('@/lib/iceland-routes/roadGraphCandidate.server', () => ({
  isTeskeidRouteCandidateEnabled: mockIsTeskeidRouteCandidateEnabled,
}))

vi.mock('@/components/weather/RoadMapPrototypeMap', () => ({
  RoadMapPrototypeMap: (props: unknown) => {
    roadMapProps(props)
    return <div data-testid="road-map" />
  },
}))

import AuthenticatedVedridPage from '@/app/auth-mvp/vedrid/page'
import PublicVedridPage from '@/app/vedrid/page'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AUTH_MVP_ENABLED = 'true'
  mockGuardSession.mockResolvedValue({
    user: { id: 'u1', email: 'user@example.com' },
  })
  mockResolveShellAccess.mockResolvedValue({
    mode: 'authenticated',
    userId: 'u1',
    hasPrivateVedrid: true,
  })
  mockGetWeatherMode.mockReturnValue('authenticated')
  mockCheckFeatureAccess.mockResolvedValue(false)
  mockIsTeskeidRouteCandidateEnabled.mockReturnValue(false)
})

describe('Veðrið page Teskeið routing access', () => {
  it('keeps the authenticated client feature off when the global switch is off', async () => {
    render(await AuthenticatedVedridPage())

    expect(roadMapProps).toHaveBeenCalledWith(expect.objectContaining({
      isAuthenticated: true,
      teskeidRouteCandidateEnabled: false,
    }))
  })

  it('enables the authenticated client feature when the global switch is on', async () => {
    mockCheckFeatureAccess.mockImplementation(async (_uid: string, _email: string, key: string) => (
      key === 'teskeid-routing-v1'
    ))

    render(await AuthenticatedVedridPage())

    expect(roadMapProps).toHaveBeenCalledWith(expect.objectContaining({
      isAuthenticated: true,
      teskeidRouteCandidateEnabled: true,
    }))
  })

  it('enables the public client feature when Weather and the global switch are on', () => {
    mockGetWeatherMode.mockReturnValue('all')
    mockIsTeskeidRouteCandidateEnabled.mockReturnValue(true)

    render(<PublicVedridPage />)

    expect(roadMapProps).toHaveBeenCalledWith(expect.objectContaining({
      isAuthenticated: false,
      teskeidRouteCandidateEnabled: true,
    }))
  })

  it('keeps the public client feature off when the global switch is off', () => {
    mockGetWeatherMode.mockReturnValue('all')

    render(<PublicVedridPage />)

    expect(roadMapProps).toHaveBeenCalledWith(expect.objectContaining({
      isAuthenticated: false,
      teskeidRouteCandidateEnabled: false,
    }))
  })
})
