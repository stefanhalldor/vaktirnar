import React from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  checkFeatureAccess: vi.fn(),
  deleteOnly: vi.fn(),
  expenseForm: vi.fn(),
  getDeleteCapability: vi.fn(),
  getGroup: vi.fn(),
  getPrivateDraft: vi.fn(),
  getPublicationLifecycle: vi.fn(),
  guard: vi.fn(),
  isEventContext: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }))
vi.mock('@/lib/expenses/guard', () => ({ guardExpenseAccess: mocks.guard }))
vi.mock('@/lib/expenses/repository.server', () => ({
  getExpenseCreationDraftDeleteCapability: mocks.getDeleteCapability,
  getExpenseDraftPublicationLifecycle: mocks.getPublicationLifecycle,
  getExpenseGroupView: mocks.getGroup,
  getExpensePrivateDraft: mocks.getPrivateDraft,
}))
vi.mock('@/lib/events/repository.server', () => ({ isExpenseEventContext: mocks.isEventContext }))
vi.mock('@/lib/loans/guard', () => ({ checkFeatureAccess: mocks.checkFeatureAccess }))
vi.mock('@/components/expenses/i18n.server', () => ({
  getExpenseTranslations: vi.fn().mockResolvedValue((key: string) => key),
}))
vi.mock('@/components/expenses/ExpenseShell', () => ({
  ExpenseShell: ({ children, title, backHref }: {
    children: React.ReactNode
    title: string
    backHref: string
  }) => <main data-title={title} data-back-href={backHref}>{children}</main>,
}))
vi.mock('@/components/expenses/ExpenseDraftDeleteOnly', () => ({
  ExpenseDraftDeleteOnly: (props: Record<string, unknown>) => {
    mocks.deleteOnly(props)
    return <div data-testid="draft-delete-only" />
  },
}))
vi.mock('@/components/expenses/ExpenseForm', () => ({
  ExpenseForm: (props: Record<string, unknown>) => {
    mocks.expenseForm(props)
    return <div data-testid="expense-form" />
  },
}))

import NewGroupExpensePage from '../hopar/[groupId]/nytt-utgjald/page'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const GROUP_ID = '20000000-0000-4000-8000-000000000001'
const OTHER_GROUP_ID = '20000000-0000-4000-8000-000000000002'
const DRAFT_ID = '30000000-0000-4000-8000-000000000001'

function readyCapability(groupId = GROUP_ID) {
  return {
    status: 'ready' as const,
    subject: 'shared_draft' as const,
    draftId: DRAFT_ID,
    contextType: 'group' as const,
    groupId,
    expectedDraftVersion: 4,
    expectedPublicationVersion: 9,
  }
}

function renderRoute(groupId = GROUP_ID) {
  return NewGroupExpensePage({
    params: Promise.resolve({ groupId }),
    searchParams: Promise.resolve({ draft: DRAFT_ID }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.guard.mockResolvedValue({ user: { id: ACTOR_ID, email: 'owner@example.is' } })
  mocks.getGroup.mockResolvedValue(null)
  mocks.getDeleteCapability.mockResolvedValue({ status: 'not_found' })
  mocks.getPrivateDraft.mockResolvedValue(null)
  mocks.getPublicationLifecycle.mockResolvedValue(null)
  mocks.isEventContext.mockResolvedValue(false)
  mocks.checkFeatureAccess.mockResolvedValue(false)
})

describe('group creation-draft delete route', () => {
  it.each([
    { group: null, expectedHref: '/auth-mvp/utlagt-og-endurgreitt' },
    {
      group: { id: GROUP_ID, canCreateExpense: false },
      expectedHref: `/auth-mvp/utlagt-og-endurgreitt/hopar/${GROUP_ID}`,
    },
  ])(
    'renders only the exact creator delete surface when the group editor is unavailable',
    async ({ group, expectedHref }) => {
      mocks.getGroup.mockResolvedValue(group)
      mocks.getDeleteCapability.mockResolvedValue(readyCapability())

      render(await renderRoute())

      expect(screen.getByTestId('draft-delete-only')).toBeInTheDocument()
      expect(screen.queryByTestId('expense-form')).not.toBeInTheDocument()
      expect(mocks.getPrivateDraft).not.toHaveBeenCalled()
      expect(mocks.deleteOnly).toHaveBeenCalledWith({
        capability: readyCapability(),
        statusHref: expectedHref,
        successHref: expectedHref,
      })
    },
  )

  it.each([
    { status: 'not_found' as const },
    readyCapability(OTHER_GROUP_ID),
  ])('does not expose deletion for a non-owner or nonmatching group capability', async (capability) => {
    mocks.getDeleteCapability.mockResolvedValue(capability)

    await expect(renderRoute()).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mocks.notFound).toHaveBeenCalledTimes(1)
    expect(mocks.deleteOnly).not.toHaveBeenCalled()
    expect(mocks.expenseForm).not.toHaveBeenCalled()
  })

  it('keeps the full editor for an exact readable active-group draft', async () => {
    const group = {
      id: GROUP_ID,
      canCreateExpense: true,
      defaultCurrency: 'ISK',
      defaultIncludeCreator: true,
      members: [{ id: ACTOR_ID, displayName: 'Eigandi', isSelf: true, status: 'active' }],
    }
    const draft = { id: DRAFT_ID, contextType: 'group', groupId: GROUP_ID }
    const capability = readyCapability()
    mocks.getGroup.mockResolvedValue(group)
    mocks.getPrivateDraft.mockResolvedValue(draft)
    mocks.getDeleteCapability.mockResolvedValue(capability)

    render(await renderRoute())

    expect(screen.getByTestId('expense-form')).toBeInTheDocument()
    expect(screen.queryByTestId('draft-delete-only')).not.toBeInTheDocument()
    expect(mocks.expenseForm).toHaveBeenCalledWith(expect.objectContaining({
      draft,
      creationDraftDeleteCapability: capability,
      deleteStatusHref: `/auth-mvp/utlagt-og-endurgreitt/hopar/${GROUP_ID}`,
      deleteSuccessHref: `/auth-mvp/utlagt-og-endurgreitt/hopar/${GROUP_ID}`,
    }))
  })

  it('falls back to deletion-only when the exact capability is ready but the payload reader rejects', async () => {
    mocks.getGroup.mockResolvedValue({
      id: GROUP_ID,
      canCreateExpense: true,
      defaultCurrency: 'ISK',
      defaultIncludeCreator: true,
      members: [],
    })
    mocks.getDeleteCapability.mockResolvedValue(readyCapability())
    mocks.getPrivateDraft.mockRejectedValue(new Error('context no longer readable'))

    render(await renderRoute())

    expect(screen.getByTestId('draft-delete-only')).toBeInTheDocument()
    expect(screen.queryByTestId('expense-form')).not.toBeInTheDocument()
    expect(mocks.deleteOnly).toHaveBeenCalledWith(expect.objectContaining({
      capability: readyCapability(),
      statusHref: `/auth-mvp/utlagt-og-endurgreitt/hopar/${GROUP_ID}`,
      successHref: `/auth-mvp/utlagt-og-endurgreitt/hopar/${GROUP_ID}`,
    }))
  })
})
