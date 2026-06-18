/**
 * Unit tests for components/teskeid/TeskeidMenu.tsx
 *
 * Covers:
 *   - Accessible button label (closed / open)
 *   - Public and authenticated item sets
 *   - Open/close by click
 *   - Escape key closes the menu
 *   - Active state: exact match
 *   - Active state: activePrefixes match for Teskeiðar item (lanad-og-skilad, umonnun routes)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockPathname, mockPush } = vi.hoisted(() => ({
  mockPathname: vi.fn().mockReturnValue('/'),
  mockPush: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  usePathname: mockPathname,
  useRouter: vi.fn(() => ({ push: mockPush })),
}))

vi.mock('next-intl', () => ({
  useTranslations: vi.fn().mockImplementation((ns: string) => {
    const T: Record<string, Record<string, string>> = {
      'teskeid.nav': {
        menu: 'Valmynd',
        closeMenu: 'Loka valmynd',
        ideas: 'Hugmyndabankinn',
        submitIdea: 'Ný hugmynd',
        login: 'Nýskráning / innskráning',
        home: 'Heim',
        profile: 'Minn prófíll',
        loans: 'Lánað og skilað',
        teskeidar: 'Teskeiðar',
        signOut: 'Útskrá',
      },
    }
    return (key: string) => T[ns]?.[key] ?? key
  }),
}))

const { mockGetSession, mockSignOut } = vi.hoisted(() => ({
  mockGetSession: vi.fn().mockResolvedValue({ data: { session: null } }),
  mockSignOut: vi.fn().mockResolvedValue({}),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: mockGetSession,
      signOut: mockSignOut,
    },
  })),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))

import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'

beforeEach(() => {
  vi.clearAllMocks()
  mockPathname.mockReturnValue('/')
  mockGetSession.mockResolvedValue({ data: { session: null } })
})

// ── Button label ──────────────────────────────────────────────────────────────

describe('TeskeidMenu — button label', () => {
  it('shows accessible label "Valmynd" when closed', () => {
    render(<TeskeidMenu variant="public" />)
    expect(screen.getByRole('button', { name: 'Valmynd' })).toBeDefined()
  })

  it('shows accessible label "Loka valmynd" when open', () => {
    render(<TeskeidMenu variant="public" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button', { name: 'Loka valmynd' })).toBeDefined()
  })

  it('aria-expanded is false when closed', () => {
    render(<TeskeidMenu variant="public" />)
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false')
  })

  it('aria-expanded is true when open', () => {
    render(<TeskeidMenu variant="public" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true')
  })
})

// ── Public items ──────────────────────────────────────────────────────────────

describe('TeskeidMenu — public variant items', () => {
  it('shows Hugmyndabankinn, Ný hugmynd, Innskráning when open', () => {
    render(<TeskeidMenu variant="public" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Hugmyndabankinn')).toBeDefined()
    expect(screen.getByText('Ný hugmynd')).toBeDefined()
    expect(screen.getByText('Nýskráning / innskráning')).toBeDefined()
  })

  it('links point to correct hrefs', () => {
    const { container } = render(<TeskeidMenu variant="public" />)
    fireEvent.click(screen.getByRole('button'))
    expect(container.querySelector('a[href="/"]')).not.toBeNull()
    expect(container.querySelector('a[href="/senda-hugmynd"]')).not.toBeNull()
    expect(container.querySelector('a[href="/innskraning"]')).not.toBeNull()
  })

  it('does not show authenticated items', () => {
    render(<TeskeidMenu variant="public" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('Lánað og skilað')).toBeNull()
  })
})

// ── Authenticated items ───────────────────────────────────────────────────────

describe('TeskeidMenu — authenticated variant items', () => {
  it('shows Teskeiðar and Minn prófíll when open', () => {
    render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Teskeiðar')).toBeDefined()
    expect(screen.getByText('Minn prófíll')).toBeDefined()
  })

  it('does not show a separate Heim item', () => {
    render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('Heim')).toBeNull()
  })

  it('links point to correct hrefs', () => {
    const { container } = render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button'))
    expect(container.querySelector('a[href="/auth-mvp/heim"]')).not.toBeNull()
    expect(container.querySelector('a[href="/auth-mvp/minn-profill"]')).not.toBeNull()
  })

  it('does not show public-only items', () => {
    render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('Nýskráning / innskráning')).toBeNull()
  })
})

// ── Open / close ──────────────────────────────────────────────────────────────

describe('TeskeidMenu — open and close', () => {
  it('items are not visible before opening', () => {
    render(<TeskeidMenu variant="public" />)
    expect(screen.queryByText('Hugmyndabankinn')).toBeNull()
  })

  it('closes on second button click', () => {
    render(<TeskeidMenu variant="public" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Hugmyndabankinn')).toBeDefined()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('Hugmyndabankinn')).toBeNull()
  })

  it('closes when Escape is pressed', () => {
    render(<TeskeidMenu variant="public" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Hugmyndabankinn')).toBeDefined()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Hugmyndabankinn')).toBeNull()
  })

  it('closes when a menu item is clicked', () => {
    render(<TeskeidMenu variant="public" />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByText('Nýskráning / innskráning'))
    expect(screen.queryByText('Hugmyndabankinn')).toBeNull()
  })
})

// ── Active state ──────────────────────────────────────────────────────────────

describe('TeskeidMenu — active state', () => {
  it('marks / as active when pathname is /', () => {
    mockPathname.mockReturnValue('/')
    const { container } = render(<TeskeidMenu variant="public" />)
    fireEvent.click(screen.getByRole('button'))
    const ideasLink = container.querySelector('a[href="/"]')
    expect(ideasLink?.className).toContain('bg-[#2d5a27]')
  })

  it('does not mark / as active when pathname is /senda-hugmynd', () => {
    mockPathname.mockReturnValue('/senda-hugmynd')
    const { container } = render(<TeskeidMenu variant="public" />)
    fireEvent.click(screen.getByRole('button'))
    const ideasLink = container.querySelector('a[href="/"]')
    expect(ideasLink?.className).not.toContain('bg-[#2d5a27]')
  })

  it('marks Teskeiðar as active on /auth-mvp/heim', () => {
    mockPathname.mockReturnValue('/auth-mvp/heim')
    const { container } = render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button'))
    const link = container.querySelector('a[href="/auth-mvp/heim"]')
    expect(link?.className).toContain('bg-[#2d5a27]')
  })

  it('marks Teskeiðar as active on /auth-mvp/lanad-og-skilad (exact)', () => {
    mockPathname.mockReturnValue('/auth-mvp/lanad-og-skilad')
    const { container } = render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button'))
    const link = container.querySelector('a[href="/auth-mvp/heim"]')
    expect(link?.className).toContain('bg-[#2d5a27]')
  })

  it('marks Teskeiðar as active on subroute /auth-mvp/lanad-og-skilad/ny', () => {
    mockPathname.mockReturnValue('/auth-mvp/lanad-og-skilad/ny')
    const { container } = render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button'))
    const link = container.querySelector('a[href="/auth-mvp/heim"]')
    expect(link?.className).toContain('bg-[#2d5a27]')
  })

  it('marks Teskeiðar as active on deep subroute /auth-mvp/lanad-og-skilad/breyta/abc', () => {
    mockPathname.mockReturnValue('/auth-mvp/lanad-og-skilad/breyta/abc')
    const { container } = render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button'))
    const link = container.querySelector('a[href="/auth-mvp/heim"]')
    expect(link?.className).toContain('bg-[#2d5a27]')
  })

  it('marks Teskeiðar as active on /auth-mvp/umonnun', () => {
    mockPathname.mockReturnValue('/auth-mvp/umonnun')
    const { container } = render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button'))
    const link = container.querySelector('a[href="/auth-mvp/heim"]')
    expect(link?.className).toContain('bg-[#2d5a27]')
  })

  it('does not mark Teskeiðar as active on /auth-mvp/minn-profill', () => {
    mockPathname.mockReturnValue('/auth-mvp/minn-profill')
    const { container } = render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button'))
    const link = container.querySelector('a[href="/auth-mvp/heim"]')
    expect(link?.className).not.toContain('bg-[#2d5a27]')
  })
})

// ── Sign out ──────────────────────────────────────────────────────────────────

describe('TeskeidMenu — sign out', () => {
  it('shows Útskrá button in authenticated variant', () => {
    render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    expect(screen.getByRole('button', { name: 'Útskrá' })).toBeDefined()
  })

  it('does not show Útskrá button in public variant', () => {
    render(<TeskeidMenu variant="public" />)
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    expect(screen.queryByRole('button', { name: 'Útskrá' })).toBeNull()
  })

  it('calls signOut and router.push when Útskrá is clicked', async () => {
    render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    fireEvent.click(screen.getByRole('button', { name: 'Útskrá' }))
    await vi.waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
    expect(mockPush).toHaveBeenCalledWith('/innskraning')
  })

  it('closes the menu when Útskrá is clicked', async () => {
    render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    expect(screen.getByText('Teskeiðar')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Útskrá' }))
    expect(screen.queryByText('Teskeiðar')).toBeNull()
  })
})

// ── User email display ────────────────────────────────────────────────────────

describe('TeskeidMenu — user email', () => {
  it('shows user email at top of authenticated menu when session exists', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: 'user@example.com' } } },
    })
    render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    await vi.waitFor(() => expect(screen.getByText('user@example.com')).toBeDefined())
  })

  it('does not show email when session is null', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button', { name: 'Valmynd' }))
    await vi.waitFor(() => expect(screen.queryByText('@')).toBeNull())
  })

  it('does not fetch session in public variant', () => {
    render(<TeskeidMenu variant="public" />)
    expect(mockGetSession).not.toHaveBeenCalled()
  })
})
