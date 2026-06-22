/**
 * Tests for LoanShell component and page-level loan page structure.
 *
 * LoanShell unit tests verify layout guarantees independently of page data.
 * Page-level tests verify that the actual pages use LoanShell correctly:
 * no <header>, correct navigation, bottom logo link.
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
    [k: string]: unknown
  }) => React.createElement('a', { href, ...props }, children),
}))

const { mockGuardLoanAccess } = vi.hoisted(() => ({
  mockGuardLoanAccess: vi.fn(),
}))
vi.mock('@/lib/loans/guard', () => ({
  guardLoanAccess: mockGuardLoanAccess,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockImplementation(async () => {
    const T: Record<string, string> = {
      title: 'Lánað og skilað',
      homeLink: 'Fara á heimasíðu',
      backToList: '← Til baka',
      newTitle: 'Skrá nýtt lán',
      newItem: 'Skrá hlut í láni',
      editTitle: 'Breyta láni',
      pendingInvitations: 'Boð í bið',
      addParty: 'Bæta við aðila',
      'errors.loadFailed': 'Villa við hleðslu',
    }
    return (key: string) => T[key] ?? key
  }),
}))

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({ rpc: mockRpc })),
}))

vi.mock('@/components/loans/LoanList', () => ({
  LoanList: () => React.createElement('div', { 'data-testid': 'loan-list' }),
}))
vi.mock('@/components/loans/LoanCard', () => ({
  LoanCard: ({ item }: { item: { item_name: string } }) =>
    React.createElement('div', { 'data-testid': 'loan-card' }, item.item_name),
}))
vi.mock('@/components/loans/PendingInvitationCard', () => ({
  PendingInvitationCard: () => React.createElement('div', { 'data-testid': 'pending-card' }),
}))
vi.mock('@/components/loans/LoanForm', () => ({
  LoanForm: () => React.createElement('form', { 'data-testid': 'loan-form' }),
}))
vi.mock('@/components/loans/LoanItemDetailsForm', () => ({
  LoanItemDetailsForm: () => React.createElement('form', { 'data-testid': 'loan-item-details-form' }),
}))
vi.mock('@/lib/loans/actions', () => ({
  createLoan: vi.fn(),
  updateLoan: vi.fn(),
  updateLoanItemDetails: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  usePathname: vi.fn().mockReturnValue('/auth-mvp/lanad-og-skilad'),
}))

vi.mock('@/components/teskeid/TeskeidMenu', () => ({
  TeskeidMenu: ({ variant }: { variant: string }) =>
    React.createElement('div', { 'data-testid': `teskeid-menu-${variant}` }),
}))

import { LoanShell } from '@/components/loans/LoanShell'
import LoanPage from '@/app/auth-mvp/lanad-og-skilad/page'
import NewLoanPage from '@/app/auth-mvp/lanad-og-skilad/ny/page'
import EditLoanPage from '@/app/auth-mvp/lanad-og-skilad/breyta/[id]/page'
import LoanDetailPage from '@/app/auth-mvp/lanad-og-skilad/[id]/page'

const TEST_USER = { id: 'uid-1', email: 'user@example.com' }

beforeEach(() => {
  vi.clearAllMocks()
  mockGuardLoanAccess.mockResolvedValue({ user: TEST_USER })
  mockRpc.mockResolvedValue({ data: [], error: null })
})

// ── LoanShell — unit tests ────────────────────────────────────────────────────

describe('LoanShell — DOM order', () => {
  it('nav renders before children', () => {
    const { container } = render(
      <LoanShell nav={<span data-testid="nav">nav</span>} homeLabel="Heim">
        <span data-testid="content">content</span>
      </LoanShell>,
    )
    const nav = container.querySelector('[data-testid="nav"]')!
    const content = container.querySelector('[data-testid="content"]')!
    expect(nav.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('logo link renders after children', () => {
    const { container } = render(
      <LoanShell nav={<span>nav</span>} homeLabel="Heim">
        <span data-testid="content">content</span>
      </LoanShell>,
    )
    const content = container.querySelector('[data-testid="content"]')!
    const homeLink = container.querySelector('a[href="/auth-mvp/heim"]')!
    expect(content.compareDocumentPosition(homeLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('LoanShell — home link', () => {
  it('logo link points to /auth-mvp/heim', () => {
    render(
      <LoanShell nav={<span>nav</span>} homeLabel="Fara heim">
        <span>content</span>
      </LoanShell>,
    )
    const links = screen.getAllByRole('link')
    const homeLink = links.find(
      (l) => (l as HTMLAnchorElement).getAttribute('href') === '/auth-mvp/heim',
    )
    expect(homeLink).toBeDefined()
  })

  it('logo link has aria-label matching homeLabel', () => {
    const { container } = render(
      <LoanShell nav={<span>nav</span>} homeLabel="Fara á heimasíðu">
        <span>content</span>
      </LoanShell>,
    )
    const homeLink = container.querySelector('a[href="/auth-mvp/heim"]')
    expect(homeLink?.getAttribute('aria-label')).toBe('Fara á heimasíðu')
  })

  it('SVGs inside logo link are all decorative (aria-hidden=true)', () => {
    const { container } = render(
      <LoanShell nav={<span>nav</span>} homeLabel="Heim">
        <span>content</span>
      </LoanShell>,
    )
    const homeLink = container.querySelector('a[href="/auth-mvp/heim"]')!
    const svgs = homeLink.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
    svgs.forEach((svg) => {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    })
  })
})

describe('LoanShell — no header element', () => {
  it('renders no <header> element', () => {
    const { container } = render(
      <LoanShell nav={<span>nav</span>} homeLabel="Heim">
        <span>content</span>
      </LoanShell>,
    )
    expect(container.querySelector('header')).toBeNull()
  })
})

// ── LoanPage (loan overview) — page-level tests ───────────────────────────────

describe('LoanPage — page structure', () => {
  it('renders page title', async () => {
    render(await LoanPage())
    expect(screen.getByText('Lánað og skilað')).toBeDefined()
  })

  it('contains no <header> element', async () => {
    const { container } = render(await LoanPage())
    expect(container.querySelector('header')).toBeNull()
  })

  it('nav Home link points to /auth-mvp/heim with correct aria-label', async () => {
    const { container } = render(await LoanPage())
    // The nav Home icon has exactly 1 SVG (lucide Home); the logo link has 2 (mobile + desktop)
    const allHomeLinks = Array.from(container.querySelectorAll('a[href="/auth-mvp/heim"]'))
    expect(allHomeLinks.length).toBeGreaterThanOrEqual(2)
    const navHomeLink = allHomeLinks.find((el) => el.querySelectorAll('svg').length === 1)
    expect(navHomeLink?.getAttribute('aria-label')).toBe('Fara á heimasíðu')
  })

  it('bottom logo link points to /auth-mvp/heim and contains decorative SVGs', async () => {
    const { container } = render(await LoanPage())
    // Logo link has 2 SVGs (sm:hidden + hidden sm:block variants)
    const logoLink = Array.from(container.querySelectorAll('a[href="/auth-mvp/heim"]')).find(
      (el) => el.querySelectorAll('svg').length > 1,
    )
    expect(logoLink).toBeDefined()
    logoLink!.querySelectorAll('svg').forEach((svg) => {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    })
  })

  it('page title appears before bottom logo in DOM', async () => {
    const { container } = render(await LoanPage())
    const title = screen.getByText('Lánað og skilað')
    const logoLink = Array.from(container.querySelectorAll('a[href="/auth-mvp/heim"]')).find(
      (el) => el.querySelectorAll('svg').length > 1,
    )!
    expect(
      title.compareDocumentPosition(logoLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

// ── NewLoanPage (subroute) — page-level tests ─────────────────────────────────

describe('NewLoanPage — page structure', () => {
  it('renders page heading', async () => {
    render(await NewLoanPage())
    expect(screen.getByText('Skrá nýtt lán')).toBeDefined()
  })

  it('contains no <header> element', async () => {
    const { container } = render(await NewLoanPage())
    expect(container.querySelector('header')).toBeNull()
  })

  it('back link points to /auth-mvp/lanad-og-skilad', async () => {
    const { container } = render(await NewLoanPage())
    const backLink = container.querySelector('a[href="/auth-mvp/lanad-og-skilad"]')
    expect(backLink).toBeDefined()
    expect(backLink?.textContent?.trim()).toBe('← Til baka')
  })

  it('bottom logo link points to /auth-mvp/heim', async () => {
    const { container } = render(await NewLoanPage())
    const logoLink = Array.from(container.querySelectorAll('a[href="/auth-mvp/heim"]')).find(
      (el) => el.querySelectorAll('svg').length > 1,
    )
    expect(logoLink).toBeDefined()
  })

  it('back link appears before bottom logo in DOM', async () => {
    const { container } = render(await NewLoanPage())
    const backLink = container.querySelector('a[href="/auth-mvp/lanad-og-skilad"]')!
    const logoLink = Array.from(container.querySelectorAll('a[href="/auth-mvp/heim"]')).find(
      (el) => el.querySelectorAll('svg').length > 1,
    )!
    expect(
      backLink.compareDocumentPosition(logoLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

// ── LoanPage — soft acknowledgement (pending rows via get_my_loans) ───────────

describe('LoanPage — PendingInvitationCard section removed', () => {
  it('does not render pending-card elements from get_my_pending_invitations', async () => {
    // LoanPage no longer calls get_my_pending_invitations; only get_my_loans is used
    const { container } = render(await LoanPage())
    expect(container.querySelectorAll('[data-testid="pending-card"]').length).toBe(0)
  })
})

// ── LoanPage — new item CTA ───────────────────────────────────────────────────

describe('LoanPage — new item CTA', () => {
  it('renders CTA link to /auth-mvp/lanad-og-skilad/ny with accessible text "Skrá hlut í láni"', async () => {
    render(await LoanPage())
    const cta = screen.getByRole('link', { name: /Skrá hlut í láni/i })
    expect(cta).toBeDefined()
    expect((cta as HTMLAnchorElement).getAttribute('href')).toBe('/auth-mvp/lanad-og-skilad/ny')
  })
})

// ── EditLoanPage — routing split ──────────────────────────────────────────────

const ITEM_BASE = {
  id: 'loan-id-1',
  item_name: 'Bók',
  note: null,
  loaned_at: '2026-01-01',
  due_at: null,
  returned_at: null,
  invitation_id: null,
  invitation_status: null as null,
  invitation_attempt_status: null as null,
  can_send_invitation: false,
  other_display_name: null,
  is_creator: false,
  my_role: 'lender' as const,
  requires_acknowledgement: false,
  recipient_email: null,
}

describe('EditLoanPage — routing', () => {
  it('renders LoanForm for creator pre-acceptance', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...ITEM_BASE, is_creator: true, my_role: 'lender', invitation_status: null }],
      error: null,
    })
    const { container } = render(
      await EditLoanPage({ params: Promise.resolve({ id: 'loan-id-1' }) }),
    )
    expect(container.querySelector('[data-testid="loan-form"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="loan-item-details-form"]')).toBeNull()
  })

  it('renders LoanItemDetailsForm for non-creator lender', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...ITEM_BASE, is_creator: false, my_role: 'lender', invitation_status: 'accepted' }],
      error: null,
    })
    const { container } = render(
      await EditLoanPage({ params: Promise.resolve({ id: 'loan-id-1' }) }),
    )
    expect(container.querySelector('[data-testid="loan-item-details-form"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="loan-form"]')).toBeNull()
  })

  it('renders LoanItemDetailsForm for creator post-acceptance', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...ITEM_BASE, is_creator: true, my_role: 'lender', invitation_status: 'accepted' }],
      error: null,
    })
    const { container } = render(
      await EditLoanPage({ params: Promise.resolve({ id: 'loan-id-1' }) }),
    )
    expect(container.querySelector('[data-testid="loan-item-details-form"]')).not.toBeNull()
  })

  it('throws notFound for borrower non-creator', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...ITEM_BASE, is_creator: false, my_role: 'borrower', invitation_status: 'accepted' }],
      error: null,
    })
    await expect(
      EditLoanPage({ params: Promise.resolve({ id: 'loan-id-1' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('throws notFound when item is not in the list', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    await expect(
      EditLoanPage({ params: Promise.resolve({ id: 'loan-id-missing' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

// ── EditLoanPage — add-party CTA ──────────────────────────────────────────────

describe('EditLoanPage — add-party CTA', () => {
  it('shows add-party link when creator has no invitation yet', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...ITEM_BASE, is_creator: true, my_role: 'lender', invitation_status: null }],
      error: null,
    })
    const { container } = render(
      await EditLoanPage({ params: Promise.resolve({ id: 'loan-id-1' }) }),
    )
    const link = container.querySelector('a[href="/auth-mvp/lanad-og-skilad/baeta-vid-adila/loan-id-1"]')
    expect(link).not.toBeNull()
    expect(link?.textContent).toBe('Bæta við aðila')
  })

  it('does not show add-party link when invitation is pending', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...ITEM_BASE, is_creator: true, my_role: 'lender', invitation_status: 'pending' }],
      error: null,
    })
    const { container } = render(
      await EditLoanPage({ params: Promise.resolve({ id: 'loan-id-1' }) }),
    )
    const link = container.querySelector('a[href="/auth-mvp/lanad-og-skilad/baeta-vid-adila/loan-id-1"]')
    expect(link).toBeNull()
  })

  it('does not show add-party link when invitation is accepted', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...ITEM_BASE, is_creator: true, my_role: 'lender', invitation_status: 'accepted' }],
      error: null,
    })
    const { container } = render(
      await EditLoanPage({ params: Promise.resolve({ id: 'loan-id-1' }) }),
    )
    const link = container.querySelector('a[href="/auth-mvp/lanad-og-skilad/baeta-vid-adila/loan-id-1"]')
    expect(link).toBeNull()
  })
})

// ── LoanDetailPage ────────────────────────────────────────────────────────────

describe('LoanDetailPage — routing and guards', () => {
  it('renders LoanCard with item_name when loan is found', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...ITEM_BASE, id: 'loan-id-1', item_name: 'Bók' }],
      error: null,
    })
    render(await LoanDetailPage({ params: Promise.resolve({ id: 'loan-id-1' }) }))
    expect(screen.getByTestId('loan-card').textContent).toBe('Bók')
  })

  it('throws notFound when item is not in get_my_loans', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    await expect(
      LoanDetailPage({ params: Promise.resolve({ id: 'loan-id-missing' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('throws notFound when id belongs to a different user (not in list)', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...ITEM_BASE, id: 'other-loan' }],
      error: null,
    })
    await expect(
      LoanDetailPage({ params: Promise.resolve({ id: 'loan-id-1' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('shows errors.loadFailed when get_my_loans errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })
    render(await LoanDetailPage({ params: Promise.resolve({ id: 'loan-id-1' }) }))
    expect(screen.getByText('Villa við hleðslu')).toBeDefined()
  })

  it('back link points to /auth-mvp/lanad-og-skilad', async () => {
    mockRpc.mockResolvedValue({
      data: [{ ...ITEM_BASE, id: 'loan-id-1' }],
      error: null,
    })
    const { container } = render(
      await LoanDetailPage({ params: Promise.resolve({ id: 'loan-id-1' }) }),
    )
    const back = container.querySelector('a[href="/auth-mvp/lanad-og-skilad"]')
    expect(back).not.toBeNull()
  })
})
