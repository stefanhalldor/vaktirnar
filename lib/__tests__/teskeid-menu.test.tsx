import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'

const { mockPathname, mockPush, mockFetch, mockGetSession, mockSignOut } = vi.hoisted(() => ({
  mockPathname: vi.fn().mockReturnValue('/'),
  mockPush: vi.fn(),
  mockFetch: vi.fn(),
  mockGetSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  mockSignOut: vi.fn().mockResolvedValue({}),
}))

vi.mock('next/navigation', () => ({
  usePathname: mockPathname,
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    menu: 'Valmynd', closeMenu: 'Loka valmynd', publicNavigation: 'Almenn leiðsögn',
    featureNavigation: 'Teskeiðar og aðgangur', ideas: 'Hugmyndabankinn', quiz: 'Kviss',
    submitIdea: 'Ný hugmynd', login: 'Nýskráning / innskráning', loans: 'Lánað og skilað',
    expenses: 'Útlagt og endurgreitt', events: 'Viðburðir', bookkeeping: 'Bókhaldið', care: 'Umönnun',
    weather: 'Veðrið', advertiser: 'Auglýsandi', bookings: 'Bókanir',
    householdChores: 'Verkefnin', home: 'Heim',
    agentCollaboration: 'Samvinna', profile: 'Minn prófíll', signOut: 'Útskrá',
    agentUnread: 'Ólesin skilaboð',
    unreadItems: 'Ólesin atriði',
  })[key] ?? key,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getSession: mockGetSession, signOut: mockSignOut } }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) =>
    <a href={href} {...props}>{children}</a>,
}))

import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'

vi.stubGlobal('fetch', mockFetch)

const ALL_FEATURES = [
  'lanad-og-skilad', 'utlagt-og-endurgreitt', 'afmaeli-og-vidburdir', 'bokhaldid', 'umonnun',
  'vedrid', 'kviss', 'auglysandi', 'bokanir',
  'heimilisverkin',
] as const

function launcherResponse(
  featureIds: readonly string[] = ALL_FEATURES,
  collaboration = true,
  usageAvailable = true,
  unreadCounts: Record<string, number> = {},
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ featureIds, agentCollaborationAvailable: collaboration, usageAvailable, unreadCounts }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPathname.mockReturnValue('/')
  mockGetSession.mockResolvedValue({ data: { session: null } })
  mockFetch.mockImplementation(async (url: string) => url.includes('/launcher')
    ? launcherResponse()
    : { ok: true, status: 200, json: async () => ({ unreadCount: 0 }) })
})
describe('TeskeidMenu public variant', () => {
  it('keeps the public menu unchanged and does not fetch private projection', () => {
    render(<TeskeidMenu variant="public" />)
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    expect(screen.getByText('Hugmyndabankinn')).toBeInTheDocument()
    expect(screen.getByText('Kviss')).toBeInTheDocument()
    expect(screen.getByText('Ný hugmynd')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ný hugmynd' }).querySelector('svg'))
      .toHaveClass('lucide-lightbulb')
    expect(screen.getByText('Nýskráning / innskráning')).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockGetSession).not.toHaveBeenCalled()
  })
})

describe('TeskeidMenu authenticated launcher', () => {
  it('uses a home icon for the Heim navigation item', () => {
    render(<TeskeidMenu variant="authenticated" initialFeatureIds={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))

    const homeLink = screen.getByRole('link', { name: 'Heim' })
    expect(homeLink.querySelector('svg')).toHaveClass('lucide-house')
    expect(homeLink.querySelector('svg')).not.toHaveClass('lucide-lightbulb')
    expect(screen.getByRole('link', { name: 'Ný hugmynd' }).querySelector('svg'))
      .toHaveClass('lucide-lightbulb')
  })

  it('shows source-specific unread badges and omits zero or hidden counts', async () => {
    mockFetch.mockImplementation(async (url: string) => url.includes('/launcher')
      ? launcherResponse(
        ['utlagt-og-endurgreitt', 'afmaeli-og-vidburdir'],
        false,
        true,
        { 'utlagt-og-endurgreitt': 3, 'afmaeli-og-vidburdir': 1, 'lanad-og-skilad': 7 },
      )
      : { ok: true, status: 200, json: async () => ({ unreadCount: 0 }) })
    render(<TeskeidMenu variant="authenticated" />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/auth-mvp/launcher', { cache: 'no-store' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    expect(screen.getByTestId('teskeid-unread-utlagt-og-endurgreitt')).toHaveTextContent('3')
    expect(screen.getByTestId('teskeid-unread-afmaeli-og-vidburdir')).toHaveTextContent('1')
    expect(screen.queryByTestId('teskeid-unread-lanad-og-skilad')).toBeNull()
  })

  it('renders home-projected unread counts without refetching the launcher', () => {
    render(
      <TeskeidMenu
        variant="authenticated"
        initialFeatureIds={['lanad-og-skilad', 'utlagt-og-endurgreitt']}
        initialUnreadCounts={{ 'lanad-og-skilad': 2 }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    expect(screen.getByTestId('teskeid-unread-lanad-og-skilad')).toHaveTextContent('2')
    expect(screen.queryByTestId('teskeid-unread-utlagt-og-endurgreitt')).toBeNull()
    expect(mockFetch).not.toHaveBeenCalledWith('/api/auth-mvp/launcher', { cache: 'no-store' })
  })

  it('renders the Household icon and updates its badge from the shared acknowledgement event', () => {
    render(
      <TeskeidMenu
        variant="authenticated"
        initialFeatureIds={['heimilisverkin']}
        initialUnreadCounts={{ heimilisverkin: 2 }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    const householdLink = screen.getByRole('link', { name: /Verkefnin/ })
    expect(householdLink.querySelector('svg')).toHaveClass('lucide-list-checks')
    expect(screen.getByTestId('teskeid-unread-heimilisverkin')).toHaveTextContent('2')

    fireEvent(window, new CustomEvent('teskeid:recent-events-changed', {
      detail: { sources: ['heimilisverkin'] },
    }))
    expect(screen.getByTestId('teskeid-unread-heimilisverkin')).toHaveTextContent('1')

    fireEvent(window, new CustomEvent('teskeid:recent-events-changed', {
      detail: { sources: ['heimilisverkin'], all: true },
    }))
    expect(screen.queryByTestId('teskeid-unread-heimilisverkin')).toBeNull()
  })


  it('renders exact server order and has no umbrella Teskeiðar item', async () => {
    mockFetch.mockImplementation(async (url: string) => url.includes('/launcher')
      ? launcherResponse(['bokanir', 'vedrid', 'lanad-og-skilad'], false)
      : { ok: true, status: 200, json: async () => ({ unreadCount: 0 }) })
    render(<TeskeidMenu variant="authenticated" />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/auth-mvp/launcher', { cache: 'no-store' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    const navText = screen.getByRole('navigation', { name: 'Teskeiðar og aðgangur' }).textContent ?? ''
    expect(navText.indexOf('Bókanir')).toBeLessThan(navText.indexOf('Veðrið'))
    expect(navText.indexOf('Veðrið')).toBeLessThan(navText.indexOf('Lánað og skilað'))
    expect(screen.queryByText('Teskeiðar')).not.toBeInTheDocument()
  })

  it('keeps a home SSR projection exact and does not independently refetch or promote pathname', () => {
    mockPathname.mockReturnValue('/auth-mvp/vedrid')
    const { rerender } = render(
      <TeskeidMenu
        variant="authenticated"
        initialFeatureIds={['bokanir', 'vedrid', 'lanad-og-skilad']}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    const navText = screen.getByRole('navigation', { name: 'Teskeiðar og aðgangur' }).textContent ?? ''
    expect(navText.indexOf('Bókanir')).toBeLessThan(navText.indexOf('Veðrið'))
    expect(navText.indexOf('Veðrið')).toBeLessThan(navText.indexOf('Lánað og skilað'))
    expect(mockFetch).not.toHaveBeenCalledWith('/api/auth-mvp/launcher', { cache: 'no-store' })

    rerender(
      <TeskeidMenu
        variant="authenticated"
        initialFeatureIds={['vedrid', 'bokanir', 'lanad-og-skilad']}
      />,
    )
    const refreshedText = screen.getByRole('navigation', { name: 'Teskeiðar og aðgangur' }).textContent ?? ''
    expect(refreshedText.indexOf('Veðrið')).toBeLessThan(refreshedText.indexOf('Bókanir'))
    expect(mockFetch).not.toHaveBeenCalledWith('/api/auth-mvp/launcher', { cache: 'no-store' })
  })

  it('fails closed without replacing a valid server-projected initial list', async () => {
    mockFetch.mockRejectedValue(new Error('offline'))
    render(<TeskeidMenu variant="authenticated" initialFeatureIds={['vedrid']} />)
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    expect(screen.getByText('Veðrið')).toBeInTheDocument()
    expect(screen.queryByText('Kviss')).not.toBeInTheDocument()
  })

  it('keeps collaboration visibility independent from unread failure', async () => {
    mockFetch.mockImplementation(async (url: string) => url.includes('/launcher')
      ? launcherResponse([], true)
      : { ok: false, status: 503, json: async () => ({}) })
    render(<TeskeidMenu variant="authenticated" />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    expect(screen.getByText('Samvinna')).toBeInTheDocument()
  })

  it('marks the exact feature deep path active', () => {
    mockPathname.mockReturnValue('/auth-mvp/bokhaldid/timabil/period/faerslur')
    const { container } = render(
      <TeskeidMenu variant="authenticated" initialFeatureIds={['bokhaldid', 'vedrid']} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    expect(container.querySelector('a[href="/auth-mvp/bokhaldid"]')).toHaveAttribute('aria-current', 'page')
    expect(container.querySelector('a[href="/auth-mvp/vedrid"]')).not.toHaveAttribute('aria-current')
  })

  it('uses the canonical server order without independent pathname promotion', async () => {
    mockPathname.mockReturnValue('/auth-mvp/vedrid')
    mockFetch.mockImplementation(async (url: string) => url.includes('/launcher')
      ? launcherResponse(['bokanir', 'vedrid', 'kviss'], false)
      : { ok: true, status: 200, json: async () => ({ unreadCount: 0 }) })
    render(<TeskeidMenu variant="authenticated" />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    const navText = screen.getByRole('navigation', { name: 'Teskeiðar og aðgangur' }).textContent ?? ''
    expect(navText.indexOf('Bókanir')).toBeLessThan(navText.indexOf('Veðrið'))
  })

  it('keeps the exact static server order when SQL71 usage is unavailable', async () => {
    mockPathname.mockReturnValue('/auth-mvp/vedrid')
    mockFetch.mockImplementation(async (url: string) => url.includes('/launcher')
      ? launcherResponse(['lanad-og-skilad', 'vedrid', 'bokanir'], false, false)
      : { ok: true, status: 200, json: async () => ({ unreadCount: 0 }) })
    render(<TeskeidMenu variant="authenticated" />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    const navText = screen.getByRole('navigation', { name: 'Teskeiðar og aðgangur' }).textContent ?? ''
    expect(navText.indexOf('Lánað og skilað')).toBeLessThan(navText.indexOf('Veðrið'))
    expect(navText.indexOf('Veðrið')).toBeLessThan(navText.indexOf('Bókanir'))
  })

  it('preserves the previous canonical order when a coordinated refresh fails', async () => {
    mockPathname.mockReturnValue('/auth-mvp/vedrid')
    mockFetch.mockResolvedValue(launcherResponse(['vedrid', 'bokanir'], false))
    const { rerender } = render(<TeskeidMenu variant="authenticated" />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    mockFetch.mockRejectedValue(new Error('offline'))
    mockPathname.mockReturnValue('/auth-mvp/bokanir')
    rerender(<TeskeidMenu variant="authenticated" />)
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    const navText = screen.getByRole('navigation', { name: 'Teskeiðar og aðgangur' }).textContent ?? ''
    expect(navText.indexOf('Veðrið')).toBeLessThan(navText.indexOf('Bókanir'))
  })
})

describe('TeskeidMenu controlled close behavior', () => {
  it('closes immediately on the second trigger click', () => {
    render(<TeskeidMenu variant="public" />)
    const trigger = screen.getByRole('button', { name: 'Valmynd' })
    fireEvent.click(trigger)
    expect(screen.getByRole('button', { name: 'Loka valmynd' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Loka valmynd' }))
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Valmynd' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('Escape closes and returns focus to the trigger', () => {
    render(<TeskeidMenu variant="public" />)
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Valmynd' })).toHaveFocus()
  })

  it('closes on outside pointer, link selection and pathname change', () => {
    const { rerender } = render(<TeskeidMenu variant="public" />)
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    fireEvent.click(screen.getByText('Ný hugmynd'))
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    mockPathname.mockReturnValue('/kviss')
    rerender(<TeskeidMenu variant="public" />)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('sign-out closes, signs out and navigates', async () => {
    render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    fireEvent.click(screen.getByRole('button', { name: 'Útskrá' }))
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledOnce())
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(mockPush).toHaveBeenCalledWith('/innskraning')
  })
})
