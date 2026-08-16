import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  guardSession: vi.fn(),
  getPreview: vi.fn(),
  checkAccess: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))
vi.mock('next-intl/server', () => ({ getLocale: vi.fn().mockResolvedValue('is') }))
vi.mock('@/lib/expenses/guard', () => ({ guardExpenseSession: mocks.guardSession }))
vi.mock('@/lib/expenses/repository.server', () => ({
  getExpenseMemberInvitationPreview: mocks.getPreview,
}))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mocks.checkAccess }))
vi.mock('@/components/expenses/i18n.server', () => ({
  getExpenseTranslations: vi.fn().mockResolvedValue((key: string) => key),
}))
vi.mock('@/components/expenses/ExpenseShell', () => ({
  ExpenseShell: ({ children, backHref }: { children: React.ReactNode; backHref: string }) => (
    <main data-testid="shell" data-back-href={backHref}>{children}</main>
  ),
}))
vi.mock('@/components/teskeid/ClosedTestingAccessRequest', () => ({
  ClosedTestingAccessRequest: ({ featureId }: { featureId: string }) => (
    <div data-testid="request-access" data-feature-id={featureId} />
  ),
}))
vi.mock('@/components/expenses/ExpenseMemberInvitationActions', () => ({
  ExpenseMemberInvitationActions: ({ hasExpenseAccess }: { hasExpenseAccess: boolean }) => (
    <div data-testid="invitation-actions" data-has-access={String(hasExpenseAccess)} />
  ),
}))
vi.mock('@/lib/date-format', () => ({ formatDateOnly: () => 'date' }))
vi.mock('@/lib/expenses/input-money', () => ({ formatExpenseMinor: () => 'amount' }))

import ExpenseMemberInvitationPage from '@/app/auth-mvp/utlagt-og-endurgreitt/bod/adili/[invitationId]/page'

const preview = {
  invitationId: '20000000-0000-4000-8000-000000000001',
  expenseId: '30000000-0000-4000-8000-000000000001',
  expenseTitle: 'Dinner',
  description: null,
  totalMinor: 1000,
  currency: 'ISK',
  incurredOn: '2026-08-16',
  inviterDisplayName: 'Owner',
  payers: [],
  participants: [],
}

describe('Expense member invitation missing-access request', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.guardSession.mockResolvedValue({
      user: { id: '10000000-0000-4000-8000-000000000001', email: 'recipient@example.com' },
    })
    mocks.getPreview.mockResolvedValue(preview)
    mocks.checkAccess.mockResolvedValue(false)
  })

  it('shows only the fixed feature id to the shared request component', async () => {
    render(await ExpenseMemberInvitationPage({
      params: Promise.resolve({ invitationId: preview.invitationId }),
    }))

    expect(screen.getByTestId('request-access')).toHaveAttribute(
      'data-feature-id',
      'utlagt-og-endurgreitt',
    )
    expect(screen.getByTestId('request-access')).not.toHaveAttribute('data-invitation-id')
    expect(screen.getByTestId('invitation-actions')).toHaveAttribute('data-has-access', 'false')
    expect(screen.getByTestId('shell')).toHaveAttribute('data-back-href', '/auth-mvp/heim')
  })

  it('keeps the entitled invitation experience unchanged', async () => {
    mocks.checkAccess.mockResolvedValueOnce(true)
    render(await ExpenseMemberInvitationPage({
      params: Promise.resolve({ invitationId: preview.invitationId }),
    }))

    expect(screen.queryByTestId('request-access')).not.toBeInTheDocument()
    expect(screen.getByTestId('invitation-actions')).toHaveAttribute('data-has-access', 'true')
    expect(screen.getByTestId('shell')).toHaveAttribute(
      'data-back-href',
      '/auth-mvp/utlagt-og-endurgreitt',
    )
  })

  it('does not render any request state for a missing or foreign invitation', async () => {
    mocks.getPreview.mockResolvedValueOnce(null)
    await expect(ExpenseMemberInvitationPage({
      params: Promise.resolve({ invitationId: preview.invitationId }),
    })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mocks.notFound).toHaveBeenCalledOnce()
  })
})
