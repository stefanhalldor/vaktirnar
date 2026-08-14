import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFetch, mockGetSession, mockPathname, mockPush, mockSignOut } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockGetSession: vi.fn(),
  mockPathname: vi.fn(),
  mockPush: vi.fn(),
  mockSignOut: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: mockPathname,
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    menu: 'Valmynd', closeMenu: 'Loka valmynd', featureNavigation: 'Teskeiðar og aðgangur',
    loans: 'Lánað og skilað', expenses: 'Útlagt og endurgreitt', bookkeeping: 'Bókhaldið',
    care: 'Umönnun', weather: 'Veðrið', quiz: 'Kviss', advertiser: 'Auglýsandi',
    bookings: 'Bókanir', home: 'Heim', agentCollaboration: 'Samvinna', profile: 'Minn prófíll',
    submitIdea: 'Ný hugmynd', signOut: 'Útskrá', agentUnread: 'Ólesin skilaboð',
  })[key] ?? key,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession: mockGetSession, signOut: mockSignOut } }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import { AuthenticatedLauncherTracker } from '@/components/teskeid/AuthenticatedLauncherTracker'
import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'
import { resetTeskeidLauncherCommitsForTests } from '@/lib/teskeid/launcherTracker'

vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  vi.clearAllMocks()
  resetTeskeidLauncherCommitsForTests()
  mockPathname.mockReturnValue('/auth-mvp/bokanir')
  mockGetSession.mockResolvedValue({ data: { session: null } })
  mockSignOut.mockResolvedValue({})
})

describe('tracker and non-home menu canonical coordination', () => {
  it('waits for a delayed B commit before GET, then renders server-authoritative B first', async () => {
    let releasePost!: () => void
    let committed = false
    const requestOrder: string[] = []
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth-mvp/launcher' && init?.method === 'POST') {
        requestOrder.push('POST:start')
        return new Promise((resolve) => {
          releasePost = () => {
            committed = true
            requestOrder.push('POST:complete')
            resolve({ ok: true, status: 204 })
          }
        })
      }
      if (url === '/api/auth-mvp/launcher') {
        requestOrder.push('GET')
        return {
          ok: true,
          status: 200,
          json: async () => ({
            featureIds: committed ? ['bokanir', 'vedrid'] : ['vedrid', 'bokanir'],
            agentCollaborationAvailable: false,
          }),
        }
      }
      return { ok: true, status: 200, json: async () => ({ unreadCount: 0 }) }
    })

    render(
      <AuthenticatedLauncherTracker commitProof="current-account-proof">
        <TeskeidMenu variant="authenticated" />
      </AuthenticatedLauncherTracker>,
    )

    await waitFor(() => expect(requestOrder).toEqual(['POST:start']))
    expect(mockFetch.mock.calls.some(([url, init]) => (
      url === '/api/auth-mvp/launcher' && (init as RequestInit | undefined)?.method !== 'POST'
    ))).toBe(false)

    await act(async () => releasePost())
    await waitFor(() => expect(requestOrder).toEqual(['POST:start', 'POST:complete', 'GET']))

    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    const menuText = screen.getByRole('navigation', { name: 'Teskeiðar og aðgangur' }).textContent ?? ''
    expect(menuText.indexOf('Bókanir')).toBeLessThan(menuText.indexOf('Veðrið'))
  })

  it('never refetches over a home SSR projection while its commit settles', async () => {
    let releasePost!: () => void
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/auth-mvp/launcher' && init?.method === 'POST') {
        return new Promise((resolve) => {
          releasePost = () => resolve({ ok: true, status: 204 })
        })
      }
      if (url === '/api/auth-mvp/launcher') {
        throw new Error('home must not refetch its projection')
      }
      return { ok: true, status: 200, json: async () => ({ unreadCount: 0 }) }
    })

    render(
      <AuthenticatedLauncherTracker commitProof="current-account-proof">
        <TeskeidMenu
          variant="authenticated"
          initialFeatureIds={['vedrid', 'bokanir']}
        />
      </AuthenticatedLauncherTracker>,
    )
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      '/api/auth-mvp/launcher',
      expect.objectContaining({ method: 'POST' }),
    ))
    await act(async () => releasePost())
    expect(mockFetch.mock.calls.filter(([url, init]) => (
      url === '/api/auth-mvp/launcher' && (init as RequestInit | undefined)?.method !== 'POST'
    ))).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    const menuText = screen.getByRole('navigation', { name: 'Teskeiðar og aðgangur' }).textContent ?? ''
    expect(menuText.indexOf('Veðrið')).toBeLessThan(menuText.indexOf('Bókanir'))
  })
})
