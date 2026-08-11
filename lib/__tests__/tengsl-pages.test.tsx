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

const { mockCheckFeatureAccess } = vi.hoisted(() => ({
  mockCheckFeatureAccess: vi.fn(),
}))

vi.mock('@/lib/loans/guard', () => ({
  guardFeatureAccess: vi.fn(async () => undefined),
  checkFeatureAccess: mockCheckFeatureAccess,
}))

const {
  mockGetRelationship,
  mockGetRelationshipLoanActivity,
  mockGetRelationshipLabelState,
  mockGetRelationshipExpenseContexts,
} = vi.hoisted(() => ({
  mockGetRelationship: vi.fn(),
  mockGetRelationshipLoanActivity: vi.fn(),
  mockGetRelationshipLabelState: vi.fn(),
  mockGetRelationshipExpenseContexts: vi.fn(),
}))
vi.mock('@/lib/relationships/actions', () => ({
  getRelationship: mockGetRelationship,
  getRelationshipLoanActivity: mockGetRelationshipLoanActivity,
}))

vi.mock('@/lib/relationships/repository-v2.server', () => ({
  getRelationshipLabelState: mockGetRelationshipLabelState,
}))

vi.mock('@/lib/expenses/relationship-contexts.server', () => ({
  getRelationshipExpenseContexts: mockGetRelationshipExpenseContexts,
}))

vi.mock('@/components/tengsl/TagSelectForm', () => ({
  TagSelectForm: () => React.createElement('div', { 'data-testid': 'tag-select-form' }),
}))

vi.mock('@/components/tengsl/RelationshipDetailsForm', () => ({
  RelationshipDetailsForm: () => React.createElement('div', { 'data-testid': 'details-form' }, 'Einkaupplýsingar'),
}))

vi.mock('@/components/tengsl/RelationshipLabelsForm', () => ({
  RelationshipLabelsForm: () => React.createElement('div', { 'data-testid': 'labels-form' }, 'Flokkun'),
}))

vi.mock('next-intl/server', () => ({
  getLocale: vi.fn().mockResolvedValue('is'),
  getTranslations: vi.fn().mockImplementation(async () => {
    const T: Record<string, string> = {
      title: 'Tengsl',
      backToList: '← Til baka',
      sourceLoans: 'Lánað og skilað',
      sourceExpenses: 'Útlagt og endurgreitt',
      sharedUnavailable: 'Ekki tókst að sækja allt sameiginlegt efni.',
      expenseGroup: 'Hópur',
      expenseOneOff: 'Einskiptisfærsla',
      openExpenses: 'Opna Útlagt og endurgreitt',
      openLoan: 'Opna lán',
      loanedPrefix: 'Lánað',
      loanReturned: 'Skilað',
      flokkur: 'Flokkur',
      teskeidName: 'Nafn í Teskeið',
      minarNótur: 'Mínar nótur',
      'errors.notFound': 'Tengsl finnast ekki.',
    }
    return (key: string, values?: Record<string, string | number>) => {
      if (key === 'sharedWith') return `Sameiginlegt með ${values?.name ?? ''}`
      return T[key] ?? key
    }
  }),
}))

vi.mock('@/components/teskeid/TeskeidLoader', () => ({
  TeskeidLoader: () => React.createElement('div', { role: 'status' }),
}))

import TengslDetailPage from '@/app/stillingar/tengsl/[id]/page'
import TengslListLoading from '@/app/stillingar/tengsl/loading'
import TengslDetailLoading from '@/app/stillingar/tengsl/[id]/loading'

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
  mockGetRelationshipExpenseContexts.mockResolvedValue([])
  mockCheckFeatureAccess.mockResolvedValue(false)
  mockGetRelationshipLabelState.mockResolvedValue({
    available: true,
    labels: [],
    relationshipLabelIds: {},
  })
})

describe('TengslDetailPage — expense contexts', () => {
  it('shows owner-visible shared expense contexts when both feature access and counterpart identity exist', async () => {
    mockCheckFeatureAccess.mockResolvedValue(true)
    mockGetRelationship.mockResolvedValue({
      ...BASE_RELATIONSHIP,
      counterpart_user_id: 'counterpart-id',
    })
    mockGetRelationshipExpenseContexts.mockResolvedValue([
      { id: 'group-id', kind: 'group', name: 'Sumarferð', emoji: '🚗' },
    ])

    const { container } = render(await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }))

    expect(screen.getByText('Útlagt og endurgreitt')).toBeDefined()
    expect(screen.getByText('Sumarferð')).toBeDefined()
    expect(container.querySelector('a[href="/auth-mvp/utlagt-og-endurgreitt/hopar/group-id"]')).not.toBeNull()
    expect(mockGetRelationshipExpenseContexts).toHaveBeenCalledWith('owner-id', 'counterpart-id')
  })

  it('does not query or render expense contexts without expense feature access', async () => {
    mockGetRelationship.mockResolvedValue({
      ...BASE_RELATIONSHIP,
      counterpart_user_id: 'counterpart-id',
    })

    render(await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }))

    expect(mockGetRelationshipExpenseContexts).not.toHaveBeenCalled()
    expect(screen.queryByText('Útlagt og endurgreitt')).toBeNull()
  })

  it('does not resolve an email-only relationship into expense groups', async () => {
    mockCheckFeatureAccess.mockResolvedValue(true)

    render(await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }))

    expect(mockGetRelationshipExpenseContexts).not.toHaveBeenCalled()
    expect(screen.queryByText('Útlagt og endurgreitt')).toBeNull()
  })

  it('orders identity, shared activity, private details, and classification like the approved screenshots', async () => {
    mockCheckFeatureAccess.mockResolvedValue(true)
    mockGetRelationship.mockResolvedValue({
      ...BASE_RELATIONSHIP,
      counterpart_user_id: 'counterpart-id',
    })
    mockGetRelationshipExpenseContexts.mockResolvedValue([
      { id: 'group-id', kind: 'one_off', name: 'Martine þrítug', emoji: null },
    ])

    render(await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }))

    const identity = screen.getByRole('heading', { name: 'Jón' })
    const sharedActivity = screen.getByRole('heading', { name: 'Sameiginlegt með Jón' })
    const privateDetails = screen.getByTestId('details-form')
    const classification = screen.getByTestId('labels-form')
    expect(identity.compareDocumentPosition(sharedActivity) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(sharedActivity.compareDocumentPosition(privateDetails) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(privateDetails.compareDocumentPosition(classification) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps loan activity visible and announces a generic warning when expense lookup fails', async () => {
    mockCheckFeatureAccess.mockResolvedValue(true)
    mockGetRelationship.mockResolvedValue({
      ...BASE_RELATIONSHIP,
      counterpart_user_id: 'counterpart-id',
    })
    mockGetRelationshipLoanActivity.mockResolvedValue([BASE_LOAN_ACTIVITY])
    mockGetRelationshipExpenseContexts.mockRejectedValue(new Error('sensitive database detail'))

    render(await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }))

    expect(screen.getByText('Bók')).toBeDefined()
    expect(screen.queryByText('Útlagt og endurgreitt')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Ekki tókst að sækja allt sameiginlegt efni.')
    expect(screen.queryByText('sensitive database detail')).toBeNull()
  })

  it('keeps expense contexts visible and announces a generic warning when loan lookup fails', async () => {
    mockCheckFeatureAccess.mockResolvedValue(true)
    mockGetRelationship.mockResolvedValue({
      ...BASE_RELATIONSHIP,
      counterpart_user_id: 'counterpart-id',
    })
    mockGetRelationshipLoanActivity.mockRejectedValue(new Error('sensitive database detail'))
    mockGetRelationshipExpenseContexts.mockResolvedValue([
      { id: 'group-id', kind: 'group', name: 'Sumarferð', emoji: '🚗' },
    ])

    render(await TengslDetailPage({ params: Promise.resolve({ id: REL_ID }) }))

    expect(screen.getByText('Sumarferð')).toBeDefined()
    expect(screen.queryByText('Lánað og skilað')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Ekki tókst að sækja allt sameiginlegt efni.')
    expect(screen.queryByText('sensitive database detail')).toBeNull()
  })
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

// ── Loading screens ───────────────────────────────────────────────────────────

describe('Tengsl list loading screen', () => {
  it('renders a status element via TeskeidLoader', async () => {
    render(await TengslListLoading())
    expect(screen.getByRole('status')).toBeDefined()
  })
})

describe('Tengsl detail loading screen', () => {
  it('renders a status element via TeskeidLoader', async () => {
    render(await TengslDetailLoading())
    expect(screen.getByRole('status')).toBeDefined()
  })
})
