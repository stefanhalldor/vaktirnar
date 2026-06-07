/**
 * RTL tests for app/auth-mvp/minn-profill/page.tsx
 *
 * The page is a 'use client' component. All server dependencies
 * (next/navigation, next-intl, Supabase, fetch) are mocked.
 *
 * Distinguishing the two /auth-mvp/heim links:
 *   - Nav Home icon: 1 SVG (lucide Home)
 *   - Bottom logo:   2 SVGs (TeskeidLogo mobile + desktop)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: vi.fn().mockReturnValue({ replace: vi.fn(), push: mockPush }),
}))

vi.mock('next-intl', () => ({
  useTranslations: vi.fn().mockImplementation((ns: string) => {
    const T: Record<string, Record<string, string>> = {
      'teskeid.profile': {
        title: 'Prófíllinn minn',
        homeLink: 'Heim',
        displayName: 'Nafn',
        email: 'Netfang',
        save: 'Vista',
        saving: 'Vistandi...',
        saved: 'Vistað!',
        logout: 'Útskrá',
        'errors.saveFailed': 'Vistun mistókst.',
      },
      'common': {
        loading: 'Hleð...',
        error: 'Villa',
      },
    }
    return (key: string) => T[ns]?.[key] ?? key
  }),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))

const { mockSignOut, mockPush } = vi.hoisted(() => ({
  mockSignOut: vi.fn().mockResolvedValue({}),
  mockPush: vi.fn(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn().mockReturnValue({
    auth: { signOut: mockSignOut },
  }),
}))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ display_name: 'Jón', email: 'jon@example.com' }),
  }))
})

import AuthMvpProfilePage from '@/app/auth-mvp/minn-profill/page'

// ── Helpers ───────────────────────────────────────────────────────────────────

function navHomeLink(container: HTMLElement): Element | undefined {
  return Array.from(container.querySelectorAll('a[href="/auth-mvp/heim"]')).find(
    (el) => el.querySelectorAll('svg').length === 1,
  )
}

function bottomLogoLink(container: HTMLElement): Element | undefined {
  return Array.from(container.querySelectorAll('a[href="/auth-mvp/heim"]')).find(
    (el) => el.querySelectorAll('svg').length > 1,
  )
}

// ── Layout ────────────────────────────────────────────────────────────────────

describe('AuthMvpProfilePage — layout', () => {
  it('renders no <header> element', () => {
    const { container } = render(React.createElement(AuthMvpProfilePage))
    expect(container.querySelector('header')).toBeNull()
  })

  it('has exactly one h1 containing the profile title', () => {
    const { container } = render(React.createElement(AuthMvpProfilePage))
    const headings = container.querySelectorAll('h1')
    expect(headings.length).toBe(1)
    expect(headings[0].textContent).toBe('Prófíllinn minn')
  })
})

// ── Nav Home link ─────────────────────────────────────────────────────────────

describe('AuthMvpProfilePage — nav Home link', () => {
  it('renders nav Home link pointing to /auth-mvp/heim', () => {
    const { container } = render(React.createElement(AuthMvpProfilePage))
    expect(navHomeLink(container)).toBeDefined()
  })

  it('nav Home link has aria-label="Heim"', () => {
    const { container } = render(React.createElement(AuthMvpProfilePage))
    expect(navHomeLink(container)?.getAttribute('aria-label')).toBe('Heim')
  })

  it('nav Home link is visible during loading state', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const { container } = render(React.createElement(AuthMvpProfilePage))
    expect(screen.getByText('Hleð...')).toBeDefined()
    expect(navHomeLink(container)).toBeDefined()
  })
})

// ── Bottom logo ───────────────────────────────────────────────────────────────

describe('AuthMvpProfilePage — bottom logo', () => {
  it('bottom logo link points to /auth-mvp/heim', () => {
    const { container } = render(React.createElement(AuthMvpProfilePage))
    expect(bottomLogoLink(container)).toBeDefined()
  })

  it('bottom logo link is visible during loading state', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const { container } = render(React.createElement(AuthMvpProfilePage))
    expect(screen.getByText('Hleð...')).toBeDefined()
    expect(bottomLogoLink(container)).toBeDefined()
  })

  it('logo SVGs inside bottom logo link are decorative (aria-hidden=true)', () => {
    const { container } = render(React.createElement(AuthMvpProfilePage))
    const link = bottomLogoLink(container)!
    const svgs = link.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
    svgs.forEach((svg) => {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    })
  })
})

// ── DOM order ─────────────────────────────────────────────────────────────────

describe('AuthMvpProfilePage — DOM order', () => {
  it('nav Home link appears before bottom logo', () => {
    const { container } = render(React.createElement(AuthMvpProfilePage))
    const nav = navHomeLink(container)!
    const logo = bottomLogoLink(container)!
    expect(nav.compareDocumentPosition(logo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('nav Home link appears before bottom logo during loading state', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const { container } = render(React.createElement(AuthMvpProfilePage))
    const nav = navHomeLink(container)!
    const logo = bottomLogoLink(container)!
    expect(nav.compareDocumentPosition(logo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('loading text appears before bottom logo', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const { container } = render(React.createElement(AuthMvpProfilePage))
    const loading = screen.getByText('Hleð...')
    const logo = bottomLogoLink(container)!
    expect(loading.compareDocumentPosition(logo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('profile form appears before bottom logo', async () => {
    const { container } = render(React.createElement(AuthMvpProfilePage))
    // findByText waits for the async useEffect to resolve and re-render
    await screen.findByText('Vista')
    const form = container.querySelector('form')!
    const logo = bottomLogoLink(container)!
    expect(form.compareDocumentPosition(logo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

// ── Logout redirect ────────────────────────────────────────────────────────

describe('AuthMvpProfilePage — logout redirect', () => {
  it('clicking logout signs out and pushes to /innskraning', async () => {
    render(React.createElement(AuthMvpProfilePage))
    await screen.findByText('Vista')
    const logoutBtn = screen.getByText('Útskrá')
    fireEvent.click(logoutBtn)
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled())
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/innskraning'))
  })
})
