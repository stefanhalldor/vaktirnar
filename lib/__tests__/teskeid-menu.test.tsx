/**
 * Unit tests for components/teskeid/TeskeidMenu.tsx
 *
 * Covers:
 *   - Accessible button label (closed / open)
 *   - Public and authenticated item sets
 *   - Open/close by click
 *   - Escape key closes the menu
 *   - Active state: exact match
 *   - Active state: descendant match for /auth-mvp/lanad-og-skilad subroutes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockPathname } = vi.hoisted(() => ({ mockPathname: vi.fn().mockReturnValue('/') }))
vi.mock('next/navigation', () => ({
  usePathname: mockPathname,
}))

vi.mock('next-intl', () => ({
  useTranslations: vi.fn().mockImplementation((ns: string) => {
    const T: Record<string, Record<string, string>> = {
      'teskeid.nav': {
        menu: 'Valmynd',
        closeMenu: 'Loka valmynd',
        ideas: 'Hugmyndabankinn',
        submitIdea: 'Ný hugmynd',
        login: 'Innskráning',
        home: 'Heim',
        profile: 'Minn prófíll',
        loans: 'Lánað og skilað',
      },
    }
    return (key: string) => T[ns]?.[key] ?? key
  }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))

import { TeskeidMenu } from '@/components/teskeid/TeskeidMenu'

beforeEach(() => {
  vi.clearAllMocks()
  mockPathname.mockReturnValue('/')
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
    expect(screen.getByText('Innskráning')).toBeDefined()
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
  it('shows Heim, Minn prófíll, Lánað og skilað when open', () => {
    render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Heim')).toBeDefined()
    expect(screen.getByText('Minn prófíll')).toBeDefined()
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
  })

  it('links point to correct hrefs', () => {
    const { container } = render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button'))
    expect(container.querySelector('a[href="/auth-mvp/heim"]')).not.toBeNull()
    expect(container.querySelector('a[href="/auth-mvp/minn-profill"]')).not.toBeNull()
    expect(container.querySelector('a[href="/auth-mvp/lanad-og-skilad"]')).not.toBeNull()
  })

  it('does not show public-only items', () => {
    render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('Innskráning')).toBeNull()
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
    fireEvent.click(screen.getByText('Innskráning'))
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

  it('marks /auth-mvp/lanad-og-skilad as active on exact route', () => {
    mockPathname.mockReturnValue('/auth-mvp/lanad-og-skilad')
    const { container } = render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button'))
    const link = container.querySelector('a[href="/auth-mvp/lanad-og-skilad"]')
    expect(link?.className).toContain('bg-[#2d5a27]')
  })

  it('marks /auth-mvp/lanad-og-skilad as active on subroute /auth-mvp/lanad-og-skilad/ny', () => {
    mockPathname.mockReturnValue('/auth-mvp/lanad-og-skilad/ny')
    const { container } = render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button'))
    const link = container.querySelector('a[href="/auth-mvp/lanad-og-skilad"]')
    expect(link?.className).toContain('bg-[#2d5a27]')
  })

  it('marks /auth-mvp/lanad-og-skilad as active on deep subroute /auth-mvp/lanad-og-skilad/breyta/abc', () => {
    mockPathname.mockReturnValue('/auth-mvp/lanad-og-skilad/breyta/abc')
    const { container } = render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button'))
    const link = container.querySelector('a[href="/auth-mvp/lanad-og-skilad"]')
    expect(link?.className).toContain('bg-[#2d5a27]')
  })

  it('does not mark /auth-mvp/heim as active on /auth-mvp/lanad-og-skilad', () => {
    mockPathname.mockReturnValue('/auth-mvp/lanad-og-skilad')
    const { container } = render(<TeskeidMenu variant="authenticated" />)
    fireEvent.click(screen.getByRole('button'))
    const heimLink = container.querySelector('a[href="/auth-mvp/heim"]')
    expect(heimLink?.className).not.toContain('bg-[#2d5a27]')
  })
})
