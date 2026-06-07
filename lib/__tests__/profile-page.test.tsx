/**
 * RTL tests for app/auth-mvp/minn-profill/page.tsx
 *
 * Verifies that the persistent header with the Home icon link renders
 * correctly regardless of the loading state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: vi.fn().mockReturnValue({ replace: vi.fn(), push: vi.fn() }),
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
      'teskeid.auth': {
        mvpLabel: 'MVP prófunarleið',
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

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn().mockReturnValue({
    auth: { signOut: vi.fn().mockResolvedValue({}) },
  }),
}))

// Prevent fetch calls from failing in jsdom
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ display_name: 'Jón', email: 'jon@example.com' }),
  }))
})

import AuthMvpProfilePage from '@/app/auth-mvp/minn-profill/page'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthMvpProfilePage — Home navigation header', () => {
  it('renders a Home link with href="/auth-mvp/heim"', () => {
    render(React.createElement(AuthMvpProfilePage))
    const link = screen.getByRole('link', { name: 'Heim' })
    expect(link).toBeDefined()
    expect((link as HTMLAnchorElement).href).toContain('/auth-mvp/heim')
  })

  it('Home link has aria-label="Heim"', () => {
    render(React.createElement(AuthMvpProfilePage))
    expect(screen.getByLabelText('Heim')).toBeDefined()
  })

  it('Home link is visible during loading state', () => {
    // fetch never resolves → component stays in loading state
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    render(React.createElement(AuthMvpProfilePage))
    expect(screen.getByLabelText('Heim')).toBeDefined()
    expect(screen.getByText('Hleð...')).toBeDefined()
  })
})
