/**
 * Tests for app/stillingar/tengsl/[id]/page.tsx
 *
 * Covers: deep link URL format (regression for ?id= → /[id]),
 * inaccessible loan not shown, loan name rendered.
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

vi.mock('@/lib/auth/guard', () => ({
  guardTeskeidSession: vi.fn(async () => ({
    user: { id: 'owner-id', email: 'owner@example.com' },
  })),
}))

vi.mock('@/lib/loans/guard', () => ({
  guardFeatureAccess: vi.fn(async () => undefined),
  checkFeatureAccess: vi.fn(async () => false),
}))

const { mockGetRelationship } = vi.hoisted(() => ({ mockGetRelationship: vi.fn() }))
vi.mock('@/lib/relationships/actions', () => ({
  getRelationship: mockGetRelationship,
}))

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdmin: vi.fn(() => ({ rpc: mockRpc })),
}))

vi.mock('@/components/tengsl/TagSelectForm', () => ({
  TagSelectForm: () => React.createElement('div', { 'data-testid': 'tag-select-form' }),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockImplementation(async () => {
    const T: Record<string, string> = {
      title: 'Tengsl',
      backToList: '← Til baka',
      sourceLoans: 'Lánað og skilað',
      openLoan: 'Opna lán',
      loanedPrefix: 'Lánað',
      flokkur: 'Flokkur',
      'errors.notFound': 'Tengsl finnast ekki.',
    }
    return (key: string) => T[key] ?? key
  }),
}))

import TengslDetailPage from '@/app/stillingar/tengsl/[id]/page'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REL_ID = 'rel-uuid-1'
const LOAN_ID = 'loan-uuid-1'

const BASE_RELATIONSHIP = {
  id: REL_ID,
  private_display_name: 'Jón',
  email_canonical: 'jon@example.com',
  note: null,
  created_at: '2026-06-01T00:00:00Z',
  tags: ['unclassified'],
  loan_source_ids: [] as string[],
}

const BASE_LOAN = {
  id: LOAN_ID,
  item_name: 'Bók',
  note: null,
  loaned_at: '2026-06-01',
  due_at: null,
  returned_at: null,
  my_role: 'lender' as const,
  other_display_name: null,
  invitation_id: null,
  invitation_status: null,
  invitation_attempt_status: null,
  can_send_invitation: false,
  is_creator: true,
  requires_acknowledgement: false,
  recipient_email: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetRelationship.mockResolvedValue(BASE_RELATIONSHIP)
  mockRpc.mockResolvedValue({ data: [], error: null })
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TengslDetailPage — notFound', () => {
  it('throws notFound when relationship is null', async () => {
    mockGetRelationship.mockResolvedValue(null)
    await expect(
      TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('TengslDetailPage — loan source deep link', () => {
  it('renders deep link /auth-mvp/lanad-og-skilad/[id] (not ?id= query param)', async () => {
    mockGetRelationship.mockResolvedValue({
      ...BASE_RELATIONSHIP,
      loan_source_ids: [LOAN_ID],
    })
    mockRpc.mockResolvedValue({ data: [BASE_LOAN], error: null })

    const { container } = render(
      await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }),
    )

    const openLoanLink = container.querySelector(`a[href="/auth-mvp/lanad-og-skilad/${LOAN_ID}"]`)
    expect(openLoanLink).not.toBeNull()

    // Regression: must NOT use ?id= format
    const badLink = container.querySelector(`a[href="/auth-mvp/lanad-og-skilad?id=${LOAN_ID}"]`)
    expect(badLink).toBeNull()
  })

  it('renders loan item_name under source loans section', async () => {
    mockGetRelationship.mockResolvedValue({
      ...BASE_RELATIONSHIP,
      loan_source_ids: [LOAN_ID],
    })
    mockRpc.mockResolvedValue({ data: [BASE_LOAN], error: null })

    render(await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }))

    expect(screen.getByText('Bók')).toBeDefined()
  })

  it('does not render loan source when loan is not in get_my_loans (access denied)', async () => {
    mockGetRelationship.mockResolvedValue({
      ...BASE_RELATIONSHIP,
      loan_source_ids: [LOAN_ID],
    })
    // get_my_loans returns empty — this loan is not accessible to the user
    mockRpc.mockResolvedValue({ data: [], error: null })

    const { container } = render(
      await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }),
    )

    const openLoanLink = container.querySelector(`a[href="/auth-mvp/lanad-og-skilad/${LOAN_ID}"]`)
    expect(openLoanLink).toBeNull()
    expect(screen.queryByText('Bók')).toBeNull()
  })

  it('does not render source loans section when loan_source_ids is empty', async () => {
    mockGetRelationship.mockResolvedValue({
      ...BASE_RELATIONSHIP,
      loan_source_ids: [],
    })

    const { container } = render(
      await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }),
    )

    // sourceLoans heading should not appear
    expect(screen.queryByText('Lánað og skilað')).toBeNull()
    expect(container.querySelectorAll('a[href^="/auth-mvp/lanad-og-skilad/"]').length).toBe(0)
  })
})
