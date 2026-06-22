/**
 * Tests for app/stillingar/tengsl/[id]/page.tsx
 *
 * Covers: dynamic loan activity lookup, deep link URL format,
 * counterpart name display, and security boundaries.
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

const { mockGetRelationship, mockGetRelationshipLoanActivity } = vi.hoisted(() => ({
  mockGetRelationship: vi.fn(),
  mockGetRelationshipLoanActivity: vi.fn(),
}))
vi.mock('@/lib/relationships/actions', () => ({
  getRelationship: mockGetRelationship,
  getRelationshipLoanActivity: mockGetRelationshipLoanActivity,
}))

vi.mock('@/components/tengsl/TagSelectForm', () => ({
  TagSelectForm: () => React.createElement('div', { 'data-testid': 'tag-select-form' }),
}))

vi.mock('@/components/tengsl/RelationshipDetailsForm', () => ({
  RelationshipDetailsForm: () => React.createElement('div', { 'data-testid': 'details-form' }),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockImplementation(async () => {
    const T: Record<string, string> = {
      title: 'Tengsl',
      backToList: '← Til baka',
      sourceLoans: 'Lánað og skilað',
      openLoan: 'Opna lán',
      loanedPrefix: 'Lánað',
      loanReturned: 'Skilað',
      flokkur: 'Flokkur',
      teskeidName: 'Nafn í Teskeið',
      minarNótur: 'Mínar nótur',
      'errors.notFound': 'Tengsl finnast ekki.',
    }
    return (key: string) => T[key] ?? key
  }),
}))

import TengslDetailPage from '@/app/stillingar/tengsl/[id]/page'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REL_ID = 'rel-uuid-1'
const LOAN_ID = 'loan-uuid-1'
const LOAN_ID_2 = 'loan-uuid-2'

const BASE_RELATIONSHIP = {
  id: REL_ID,
  counterpart_user_id: null as string | null,
  counterpart_display_name: null as string | null,
  private_display_name: 'Jón',
  email_canonical: 'jon@example.com',
  note: null,
  created_at: '2026-06-01T00:00:00Z',
  tags: ['unclassified'],
  loan_source_ids: [] as string[],
}

const BASE_LOAN_ACTIVITY = {
  id: LOAN_ID,
  item_name: 'Bók',
  loaned_at: '2026-06-01',
  returned_at: null as string | null,
  my_role: 'lender' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetRelationship.mockResolvedValue(BASE_RELATIONSHIP)
  mockGetRelationshipLoanActivity.mockResolvedValue([])
})

// ── notFound ──────────────────────────────────────────────────────────────────

describe('TengslDetailPage — notFound', () => {
  it('throws notFound when relationship is null', async () => {
    mockGetRelationship.mockResolvedValue(null)
    await expect(
      TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

// ── Dynamic loan activity ─────────────────────────────────────────────────────

describe('TengslDetailPage — dynamic loan activity', () => {
  it('shows loan item_name from activity lookup', async () => {
    mockGetRelationshipLoanActivity.mockResolvedValue([BASE_LOAN_ACTIVITY])
    render(await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }))
    expect(screen.getByText('Bók')).toBeDefined()
  })

  it('shows multiple loans for same relationship', async () => {
    mockGetRelationshipLoanActivity.mockResolvedValue([
      BASE_LOAN_ACTIVITY,
      { ...BASE_LOAN_ACTIVITY, id: LOAN_ID_2, item_name: 'Hjól', loaned_at: '2026-05-01' },
    ])
    render(await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }))
    expect(screen.getByText('Bók')).toBeDefined()
    expect(screen.getByText('Hjól')).toBeDefined()
  })

  it('shows no loans section when activity is empty', async () => {
    mockGetRelationshipLoanActivity.mockResolvedValue([])
    const { container } = render(
      await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }),
    )
    expect(screen.queryByText('Lánað og skilað')).toBeNull()
    expect(container.querySelectorAll('a[href^="/auth-mvp/lanad-og-skilad/"]').length).toBe(0)
  })

  it('renders deep link /auth-mvp/lanad-og-skilad/[id] for each loan', async () => {
    mockGetRelationshipLoanActivity.mockResolvedValue([BASE_LOAN_ACTIVITY])
    const { container } = render(
      await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }),
    )
    const link = container.querySelector(`a[href="/auth-mvp/lanad-og-skilad/${LOAN_ID}"]`)
    expect(link).not.toBeNull()
    // Regression: must NOT use ?id= format
    expect(container.querySelector(`a[href="/auth-mvp/lanad-og-skilad?id=${LOAN_ID}"]`)).toBeNull()
  })

  it('calls getRelationshipLoanActivity with owner user id and relationship', async () => {
    render(await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }))
    expect(mockGetRelationshipLoanActivity).toHaveBeenCalledWith(
      'owner-id',
      expect.objectContaining({ counterpart_user_id: null, email_canonical: 'jon@example.com' }),
    )
  })
})

// ── Counterpart display name ───────────────────────────────────────────────────

describe('TengslDetailPage — counterpart display name', () => {
  it('shows "Nafn í Teskeið" label when counterpart_display_name is set and differs from private_display_name', async () => {
    mockGetRelationship.mockResolvedValue({
      ...BASE_RELATIONSHIP,
      counterpart_user_id: 'user-b',
      counterpart_display_name: 'Jónína Björnsdóttir',
      private_display_name: 'Jón',
    })
    render(await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }))
    expect(screen.getByText(/Nafn í Teskeið/)).toBeDefined()
    expect(screen.getByText(/Jónína Björnsdóttir/)).toBeDefined()
  })

  it('does not show teskeidName label when counterpart_display_name is null', async () => {
    mockGetRelationship.mockResolvedValue({
      ...BASE_RELATIONSHIP,
      counterpart_user_id: null,
      counterpart_display_name: null,
    })
    const { container } = render(
      await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }),
    )
    expect(container.textContent).not.toContain('Nafn í Teskeið')
  })
})

// ── Details form ──────────────────────────────────────────────────────────────

describe('TengslDetailPage — details form', () => {
  it('renders RelationshipDetailsForm', async () => {
    render(await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }))
    expect(screen.getByTestId('details-form')).toBeDefined()
  })
})
