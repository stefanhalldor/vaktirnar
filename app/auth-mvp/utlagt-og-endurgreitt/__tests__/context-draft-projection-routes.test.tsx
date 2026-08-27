import React from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCanonicalOneOffExpenseHref,
  mockCheckFeatureAccess,
  mockGetExpenseGroupView,
  mockGetExpenseParticipantOptions,
  mockGetExpenseTranslations,
  mockGetGroupSharedExpenseDrafts,
  mockGetLocale,
  mockGuardExpenseAccess,
  mockIsExpenseEventContext,
  mockNotFound,
  mockRedirect,
} = vi.hoisted(() => ({
  mockCanonicalOneOffExpenseHref: vi.fn(),
  mockCheckFeatureAccess: vi.fn(),
  mockGetExpenseGroupView: vi.fn(),
  mockGetExpenseParticipantOptions: vi.fn(),
  mockGetExpenseTranslations: vi.fn(),
  mockGetGroupSharedExpenseDrafts: vi.fn(),
  mockGetLocale: vi.fn(),
  mockGuardExpenseAccess: vi.fn(),
  mockIsExpenseEventContext: vi.fn(),
  mockNotFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  mockRedirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }),
}))

vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))
vi.mock('next-intl/server', () => ({ getLocale: mockGetLocale }))
vi.mock('@/lib/expenses/guard', () => ({ guardExpenseAccess: mockGuardExpenseAccess }))
vi.mock('@/lib/expenses/repository.server', () => ({
  getExpenseGroupView: mockGetExpenseGroupView,
  getGroupSharedExpenseDrafts: mockGetGroupSharedExpenseDrafts,
}))
vi.mock('@/lib/expenses/participants.server', () => ({
  getExpenseParticipantOptions: mockGetExpenseParticipantOptions,
}))
vi.mock('@/lib/expenses/flow', () => ({
  canonicalOneOffExpenseHref: mockCanonicalOneOffExpenseHref,
}))
vi.mock('@/lib/events/repository.server', () => ({
  isExpenseEventContext: mockIsExpenseEventContext,
}))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mockCheckFeatureAccess }))
vi.mock('@/components/expenses/i18n.server', () => ({
  getExpenseTranslations: mockGetExpenseTranslations,
}))
vi.mock('@/components/expenses/ExpenseShell', () => ({
  ExpenseShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))
vi.mock('@/components/expenses/ExpenseGroupDetail', () => ({
  ExpenseGroupDetail: ({ group }: { group: { name: string } }) => (
    <div data-testid="active-group-detail">{group.name}</div>
  ),
}))
vi.mock('@/components/expenses/ExpenseContextDraftList', () => ({
  ExpenseContextDraftList: ({ view }: { view: { status: string; items: unknown[] } }) => (
    view.status === 'ready' && view.items.length === 0
      ? null
      : <div data-testid="group-context-drafts" data-status={view.status} />
  ),
}))

import ExpenseGroupPage from '../hopar/[groupId]/page'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const GROUP_ID = '20000000-0000-4000-8000-000000000001'

function group() {
  return {
    id: GROUP_ID,
    kind: 'group',
    name: 'Ferðahópur',
    emoji: '🧾',
    status: 'active',
    canManage: true,
    expenses: [{ id: '30000000-0000-4000-8000-000000000001' }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGuardExpenseAccess.mockResolvedValue({ user: { id: ACTOR_ID, email: 'actor@example.test' } })
  mockGetExpenseTranslations.mockResolvedValue((key: string) => key)
  mockGetLocale.mockResolvedValue('is')
  mockGetExpenseGroupView.mockResolvedValue(group())
  mockCanonicalOneOffExpenseHref.mockReturnValue(null)
  mockIsExpenseEventContext.mockResolvedValue(false)
  mockCheckFeatureAccess.mockResolvedValue(false)
  mockGetExpenseParticipantOptions.mockResolvedValue([])
  mockGetGroupSharedExpenseDrafts.mockResolvedValue({ status: 'ready', items: [{ title: 'Drög' }] })
})

describe('group context draft projection route', () => {
  it('loads the authorized active group before its independent draft source', async () => {
    const readOrder: string[] = []
    mockGetExpenseGroupView.mockImplementationOnce(async () => {
      readOrder.push('active')
      return group()
    })
    mockGetGroupSharedExpenseDrafts.mockImplementationOnce(async () => {
      readOrder.push('draft')
      return { status: 'ready', items: [{ title: 'Drög' }] }
    })

    render(await ExpenseGroupPage({ params: Promise.resolve({ groupId: GROUP_ID }) }))

    expect(readOrder).toEqual(['active', 'draft'])
    expect(mockGetGroupSharedExpenseDrafts).toHaveBeenCalledWith(ACTOR_ID, GROUP_ID)
    expect(screen.getByTestId('active-group-detail')).toBeInTheDocument()
    expect(screen.getByTestId('group-context-drafts')).toHaveAttribute('data-status', 'ready')
  })

  it('keeps active group detail when only the draft source fails', async () => {
    mockGetGroupSharedExpenseDrafts.mockRejectedValueOnce(new Error('draft source failed'))

    render(await ExpenseGroupPage({ params: Promise.resolve({ groupId: GROUP_ID }) }))

    expect(screen.getByTestId('active-group-detail')).toBeInTheDocument()
    expect(screen.getByTestId('group-context-drafts')).toHaveAttribute('data-status', 'unavailable')
  })

  it('does not request group drafts for an Event financial fallback', async () => {
    mockIsExpenseEventContext.mockResolvedValueOnce(true)

    render(await ExpenseGroupPage({ params: Promise.resolve({ groupId: GROUP_ID }) }))

    expect(mockGetGroupSharedExpenseDrafts).not.toHaveBeenCalled()
    expect(screen.queryByTestId('group-context-drafts')).not.toBeInTheDocument()
  })

  it('never loads drafts before exact active group authorization succeeds', async () => {
    mockGetExpenseGroupView.mockResolvedValueOnce(null)

    await expect(ExpenseGroupPage({ params: Promise.resolve({ groupId: GROUP_ID }) }))
      .rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockGetGroupSharedExpenseDrafts).not.toHaveBeenCalled()
  })
})
