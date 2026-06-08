/**
 * Unit tests for app/innskraning/page.tsx
 *
 * Covers:
 *   - Unauthenticated user: form rendered, no redirect
 *   - Authenticated with session: redirects to /auth-mvp/heim (no allowlist check)
 *   - AUTH_MVP_ENABLED=false: no session check, form rendered
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
    const Page = await InnskraningPage()
    render(Page as React.ReactElement)
    expect(screen.getByTestId('login-form')).toBeDefined()
  })

  it('does not redirect', async () => {
    await InnskraningPage()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('passes logoHref="/" to the login form', async () => {
    const Page = await InnskraningPage()
    render(Page as React.ReactElement)
    expect(mockLoginFormProps.current.logoHref).toBe('/')
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
    await expect(InnskraningPage()).rejects.toThrow('NEXT_REDIRECT:/auth-mvp/heim')
  })

  it('redirects regardless of email domain', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u2', email: 'anyone@gmail.com' } } })
    await expect(InnskraningPage()).rejects.toThrow('NEXT_REDIRECT:/auth-mvp/heim')
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
    const Page = await InnskraningPage()
    render(Page as React.ReactElement)
    expect(screen.getByTestId('login-form')).toBeDefined()
    expect(mockGetUser).not.toHaveBeenCalled()
  })
})
