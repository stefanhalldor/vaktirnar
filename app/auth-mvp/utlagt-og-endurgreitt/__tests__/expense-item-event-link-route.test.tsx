import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  canUseEventExpenses: vi.fn(),
  checkFeatureAccess: vi.fn(),
  getEventIdentityCandidates: vi.fn(),
  getEventLinkManagement: vi.fn(),
  getItemLookup: vi.fn(),
  getLinkedEventId: vi.fn(),
  getParticipantOptions: vi.fn(),
  getRelationshipIdentityManagement: vi.fn(),
  guardExpenseSession: vi.fn(),
  isEventContext: vi.fn(),
  itemDetail: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ notFound: vi.fn() }))
vi.mock('@/components/expenses/ExpenseShell', () => ({
  ExpenseShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))
vi.mock('@/components/expenses/ExpenseItemDetail', () => ({
  ExpenseItemDetail: (props: Record<string, unknown>) => {
    mocks.itemDetail(props)
    return (
      <div
        data-testid="expense-item-detail"
        data-event-management-unavailable={String(props.eventLinkManagementUnavailable)}
        data-relationship-management={String(
          (props.relationshipIdentityManagementState as { status?: string } | undefined)?.status,
        )}
      />
    )
  },
}))
vi.mock('@/components/expenses/i18n.server', () => ({
  getExpenseTranslations: vi.fn().mockResolvedValue((key: string) => key),
}))
vi.mock('@/lib/expenses/guard', () => ({ guardExpenseSession: mocks.guardExpenseSession }))
vi.mock('@/lib/expenses/participants.server', () => ({
  getExpenseParticipantOptions: mocks.getParticipantOptions,
}))
vi.mock('@/lib/expenses/repository.server', () => ({
  getExpenseEventIdentityCandidates: mocks.getEventIdentityCandidates,
  getExpenseItemLookup: mocks.getItemLookup,
  getExpenseRelationshipIdentityManagement: mocks.getRelationshipIdentityManagement,
}))
vi.mock('@/lib/events/repository.server', () => ({
  getExpenseEventLinkManagementV2: mocks.getEventLinkManagement,
  getExpenseLinkedEventId: mocks.getLinkedEventId,
  isExpenseEventContext: mocks.isEventContext,
}))
vi.mock('@/lib/events/guard', () => ({ canUseEventExpenses: mocks.canUseEventExpenses }))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mocks.checkFeatureAccess }))

import ExpenseItemPage from '../utgjold/[expenseId]/page'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const EXPENSE_ID = '20000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.guardExpenseSession.mockResolvedValue({
    user: { id: ACTOR_ID, email: 'actor@example.is' },
  })
  mocks.getItemLookup.mockResolvedValue({
    status: 'ok',
    group: {
      id: '30000000-0000-4000-8000-000000000001',
      kind: 'one_off',
      status: 'active',
      canManage: true,
    },
    expense: {
      id: EXPENSE_ID,
      title: 'Rúta',
      status: 'active',
      createdBySelf: true,
    },
  })
  mocks.canUseEventExpenses.mockResolvedValue(true)
  mocks.checkFeatureAccess.mockResolvedValue(true)
  mocks.getParticipantOptions.mockResolvedValue([])
  mocks.getRelationshipIdentityManagement.mockResolvedValue({ status: 'absent' })
  mocks.getEventIdentityCandidates.mockResolvedValue(null)
  mocks.getLinkedEventId.mockResolvedValue(null)
  mocks.isEventContext.mockResolvedValue(false)
})

describe('existing Expense Event-link route', () => {
  it('keeps confirmed detail intact when optional SQL163 capability is absent', async () => {
    render(await ExpenseItemPage({
      params: Promise.resolve({ expenseId: EXPENSE_ID }),
      searchParams: Promise.resolve({}),
    }))

    expect(mocks.getRelationshipIdentityManagement).toHaveBeenCalledWith(ACTOR_ID, EXPENSE_ID)
    expect(screen.getByTestId('expense-item-detail')).toHaveAttribute('data-relationship-management', 'absent')
  })

  it('keeps confirmed detail available while an unexpected SQL163 read is unavailable', async () => {
    mocks.getRelationshipIdentityManagement.mockRejectedValueOnce(
      new Error('permission denied for private@example.is 71000000-0000-4000-8000-000000000001'),
    )

    render(await ExpenseItemPage({
      params: Promise.resolve({ expenseId: EXPENSE_ID }),
      searchParams: Promise.resolve({}),
    }))

    expect(screen.getByTestId('expense-item-detail')).toHaveAttribute(
      'data-relationship-management',
      'unavailable',
    )
    expect(mocks.itemDetail).toHaveBeenCalledWith(expect.objectContaining({
      expense: expect.objectContaining({ title: 'Rúta', status: 'active' }),
      relationshipIdentityManagementState: { status: 'unavailable' },
    }))
    expect(document.body.textContent).not.toContain('private@example.is')
    expect(document.body.textContent).not.toContain('71000000-0000-4000-8000-000000000001')
    expect(document.body.textContent).not.toContain('permission denied')
  })

  it('keeps the authoritative Expense lookup fail-closed', async () => {
    mocks.getItemLookup.mockRejectedValueOnce(new Error('expense_load_failed'))

    await expect(ExpenseItemPage({
      params: Promise.resolve({ expenseId: EXPENSE_ID }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow('expense_load_failed')
    expect(mocks.getRelationshipIdentityManagement).not.toHaveBeenCalled()
    expect(mocks.itemDetail).not.toHaveBeenCalled()
  })

  it('distinguishes an unexpected authoritative management-source failure from an empty candidate set', async () => {
    mocks.getEventLinkManagement.mockRejectedValueOnce(new Error('source unavailable'))

    render(await ExpenseItemPage({
      params: Promise.resolve({ expenseId: EXPENSE_ID }),
      searchParams: Promise.resolve({}),
    }))

    expect(mocks.getEventLinkManagement).toHaveBeenCalledWith(ACTOR_ID, EXPENSE_ID)
    expect(mocks.getLinkedEventId).toHaveBeenCalledWith(ACTOR_ID, EXPENSE_ID)
    expect(screen.getByTestId('expense-item-detail')).toHaveAttribute(
      'data-event-management-unavailable',
      'true',
    )
  })

  it('keeps an authoritative empty candidate set distinct from source unavailability', async () => {
    mocks.getEventLinkManagement.mockResolvedValueOnce({
      currentEvent: null,
      eligibleEvents: [],
    })

    render(await ExpenseItemPage({
      params: Promise.resolve({ expenseId: EXPENSE_ID }),
      searchParams: Promise.resolve({}),
    }))

    expect(mocks.getEventLinkManagement).toHaveBeenCalledWith(ACTOR_ID, EXPENSE_ID)
    expect(mocks.getLinkedEventId).not.toHaveBeenCalled()
    expect(screen.getByTestId('expense-item-detail')).toHaveAttribute(
      'data-event-management-unavailable',
      'false',
    )
  })
})
