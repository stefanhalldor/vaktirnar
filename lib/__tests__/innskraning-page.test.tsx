/**
 * Unit tests for app/innskraning/page.tsx
 *
 * Covers:
 *   - Unauthenticated user: form rendered, no redirect
 *   - Authenticated with session: redirects to /auth-mvp/heim or safe ?next
 *   - Unsafe ?next is ignored (falls back to /auth-mvp/heim)
 *   - AUTH_MVP_ENABLED=false: no session check, form rendered
 *   - Safe ?next is passed to TeskeidLoginForm as nextHref
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn().mockImplementation((path: string): never => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  }),
}))

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }))

vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

const { mockLoginFormProps } = vi.hoisted(() => ({ mockLoginFormProps: { current: {} as Record<string, unknown> } }))

vi.mock('@/components/teskeid/TeskeidLoginForm', () => ({
  TeskeidLoginForm: (props: Record<string, unknown>) => {
    mockLoginFormProps.current = props
    return React.createElement('div', { 'data-testid': 'login-form' }, 'LoginForm')
  },
}))

vi.mock('@/components/teskeid/TeskeidMenu', () => ({
  TeskeidMenu: ({ variant }: { variant: string }) =>
    React.createElement('div', { 'data-testid': `teskeid-menu-${variant}` }),
}))

vi.mock('@/components/teskeid/PublicTopNav', () => ({
  PublicTopNav: () => React.createElement('nav', { 'data-testid': 'public-top-nav' }),
}))

import InnskraningPage from '@/app/innskraning/page'

// ── Env helpers ───────────────────────────────────────────────────────────────

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InnskraningPage — unauthenticated', () => {
  let savedAuth: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedAuth = process.env.AUTH_MVP_ENABLED
    process.env.AUTH_MVP_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: null } })
  })

  afterEach(() => setEnv('AUTH_MVP_ENABLED', savedAuth))

  it('renders the login form', async () => {
    const Page = await InnskraningPage({ searchParams: Promise.resolve({}) })
    render(Page as React.ReactElement)
    expect(screen.getByTestId('login-form')).toBeDefined()
  })

  it('does not redirect', async () => {
    await InnskraningPage({ searchParams: Promise.resolve({}) })
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('passes logoHref="/" to the login form', async () => {
    const Page = await InnskraningPage({ searchParams: Promise.resolve({}) })
    render(Page as React.ReactElement)
    expect(mockLoginFormProps.current.logoHref).toBe('/')
  })

  it('passes safe ?next as nextHref to the login form', async () => {
    const Page = await InnskraningPage({ searchParams: Promise.resolve({ next: '/auth-mvp/vedrid?restore=1' }) })
    render(Page as React.ReactElement)
    expect(mockLoginFormProps.current.nextHref).toBe('/auth-mvp/vedrid?restore=1')
  })

  it('does not pass unsafe ?next to the login form', async () => {
    const Page = await InnskraningPage({ searchParams: Promise.resolve({ next: 'https://evil.example' }) })
    render(Page as React.ReactElement)
    expect(mockLoginFormProps.current.nextHref).toBeUndefined()
  })
})

describe('InnskraningPage — authenticated with session', () => {
  let savedAuth: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedAuth = process.env.AUTH_MVP_ENABLED
    process.env.AUTH_MVP_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'user@example.com' } } })
  })

  afterEach(() => setEnv('AUTH_MVP_ENABLED', savedAuth))

  it('redirects to /auth-mvp/heim', async () => {
    await expect(InnskraningPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT:/auth-mvp/heim')
  })

  it('redirects regardless of email domain', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2', email: 'anyone@gmail.com' } } })
    await expect(InnskraningPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('NEXT_REDIRECT:/auth-mvp/heim')
  })

  it('redirects to safe ?next when authenticated', async () => {
    await expect(
      InnskraningPage({ searchParams: Promise.resolve({ next: '/auth-mvp/vedrid/puls/stod/12345' }) })
    ).rejects.toThrow('NEXT_REDIRECT:/auth-mvp/vedrid/puls/stod/12345')
  })

  it('ignores unsafe ?next and redirects to /auth-mvp/heim', async () => {
    await expect(
      InnskraningPage({ searchParams: Promise.resolve({ next: 'https://evil.example' }) })
    ).rejects.toThrow('NEXT_REDIRECT:/auth-mvp/heim')
  })
})

describe('InnskraningPage — AUTH_MVP_ENABLED=false', () => {
  let savedAuth: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    savedAuth = process.env.AUTH_MVP_ENABLED
    process.env.AUTH_MVP_ENABLED = 'false'
  })

  afterEach(() => setEnv('AUTH_MVP_ENABLED', savedAuth))

  it('skips session check and renders form', async () => {
    const Page = await InnskraningPage({ searchParams: Promise.resolve({}) })
    render(Page as React.ReactElement)
    expect(screen.getByTestId('login-form')).toBeDefined()
    expect(mockGetUser).not.toHaveBeenCalled()
  })
})
