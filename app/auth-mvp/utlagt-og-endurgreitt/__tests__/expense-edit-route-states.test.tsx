import React from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  expenseForm: vi.fn(),
  getCanonicalEditDraft: vi.fn(),
  getDraftPublicationLifecycle: vi.fn(),
  getItemView: vi.fn(),
  getLegacyEditDraftState: vi.fn(),
  getParticipantOptions: vi.fn(),
  getPrivateDraft: vi.fn(),
  guardExpenseAccess: vi.fn(),
  isEventContext: vi.fn(),
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }),
}))

vi.mock('next/navigation', () => ({ notFound: mocks.notFound, redirect: mocks.redirect }))
vi.mock('@/lib/expenses/guard', () => ({ guardExpenseAccess: mocks.guardExpenseAccess }))
vi.mock('@/lib/events/repository.server', () => ({ isExpenseEventContext: mocks.isEventContext }))
vi.mock('@/lib/expenses/participants.server', () => ({
  getExpenseParticipantOptions: mocks.getParticipantOptions,
}))
vi.mock('@/lib/expenses/repository.server', () => ({
  getCanonicalExpenseEditDraft: mocks.getCanonicalEditDraft,
  getExpenseDraftPublicationLifecycle: mocks.getDraftPublicationLifecycle,
  getExpenseItemView: mocks.getItemView,
  getLegacyExpenseEditDraftState: mocks.getLegacyEditDraftState,
  getExpensePrivateDraft: mocks.getPrivateDraft,
}))
vi.mock('@/components/expenses/i18n.server', () => ({
  getExpenseTranslations: vi.fn().mockResolvedValue((key: string) => ({
    'editState.ambiguousTitle': 'Ekki er hægt að opna breytinguna',
    'editState.ambiguousHeading': 'Fleiri en ein breyting er í vinnslu fyrir þennan kostnað.',
    'editState.ambiguousBody': 'Ekki er hægt að halda áfram fyrr en staðan hefur verið leyst.',
    'editState.unavailableTitle': 'Ekki tókst að sækja breytinguna',
    'editState.unavailableHeading': 'Ekki tókst að sækja stöðu breytinga.',
    'editState.unavailableBody': 'Reyndu aftur eftir augnablik.',
    'editState.backToExpense': 'Til baka í staðfestan kostnað',
    'editState.retry': 'Reyna aftur',
    'expenseForm.editTitle': 'Breyta kostnaði',
    homeLabel: 'Heim',
    back: 'Til baka',
  } as Record<string, string>)[key] ?? key),
}))
vi.mock('@/components/expenses/ExpenseShell', () => ({
  ExpenseShell: ({ title, backHref, children }: {
    title: string
    backHref: string
    children: React.ReactNode
  }) => <main><h1>{title}</h1><a href={backHref}>Shell back</a>{children}</main>,
}))
vi.mock('@/components/expenses/ExpenseForm', () => ({
  ExpenseForm: (props: Record<string, unknown>) => {
    mocks.expenseForm(props)
    return <div data-testid="expense-form" />
  },
}))
vi.mock('@/components/expenses/LegacyExpenseEditDraftNotice', () => ({
  LegacyExpenseEditDraftNotice: (props: Record<string, unknown>) => (
    <div data-testid="legacy-edit-draft-notice" data-draft-id={String(props.draftId)} />
  ),
}))

import EditExpensePage from '../utgjold/[expenseId]/breyta/page'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const GROUP_ID = '20000000-0000-4000-8000-000000000001'
const EXPENSE_ID = '30000000-0000-4000-8000-000000000001'
const DRAFT_ID = '40000000-0000-4000-8000-000000000001'
const STALE_DRAFT_ID = '40000000-0000-4000-8000-000000000002'

function canonicalDraft() {
  return {
    id: DRAFT_ID,
    contextType: 'edit',
    groupId: GROUP_ID,
    expenseId: EXPENSE_ID,
    currentStep: 'split',
    version: 3,
  }
}

function itemView() {
  return {
    group: {
      id: GROUP_ID,
      kind: 'one_off',
      status: 'active',
      canManage: true,
      financialVersion: 7,
      repayments: [],
      members: [],
    },
    expense: {
      id: EXPENSE_ID,
      title: 'Kvöldmatur',
      status: 'active',
      createdBySelf: true,
      incurredOn: '2026-08-28',
      currency: 'ISK',
      payments: [],
      shares: [],
      shareCollaborators: [],
    },
  }
}

function renderRoute(searchParams: { step?: string; draft?: string } = {}) {
  return EditExpensePage({
    params: Promise.resolve({ expenseId: EXPENSE_ID }),
    searchParams: Promise.resolve(searchParams),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.guardExpenseAccess.mockResolvedValue({ user: { id: ACTOR_ID } })
  mocks.getItemView.mockResolvedValue(itemView())
  mocks.getParticipantOptions.mockResolvedValue([])
  mocks.getPrivateDraft.mockResolvedValue(null)
  mocks.getDraftPublicationLifecycle.mockResolvedValue(null)
  mocks.getLegacyEditDraftState.mockResolvedValue({ status: 'none' })
  mocks.isEventContext.mockResolvedValue(false)
})

describe('confirmed Expense edit route states', () => {
  it('redirects to confirmed detail when no server-authoritative edit revision exists', async () => {
    mocks.getCanonicalEditDraft.mockResolvedValue({ status: 'none' })

    await expect(renderRoute({ step: 'split' })).rejects.toThrow('NEXT_REDIRECT')
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/auth-mvp/utlagt-og-endurgreitt/utgjold/${EXPENSE_ID}`,
    )
    expect(mocks.expenseForm).not.toHaveBeenCalled()
  })

  it('shows the owner-only legacy state without rendering the edit form', async () => {
    mocks.getCanonicalEditDraft.mockResolvedValue({ status: 'none' })
    mocks.getLegacyEditDraftState.mockResolvedValue({
      status: 'legacy_unbound',
      draftId: DRAFT_ID,
      draftVersion: 3,
    })

    render(await renderRoute({ step: 'split', draft: DRAFT_ID }))

    expect(screen.getByTestId('legacy-edit-draft-notice')).toHaveAttribute('data-draft-id', DRAFT_ID)
    expect(mocks.expenseForm).not.toHaveBeenCalled()
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('redirects to the exact single canonical draft without heuristic selection', async () => {
    mocks.getCanonicalEditDraft.mockResolvedValue({
      status: 'single',
      draft: { id: DRAFT_ID, currentStep: 'split' },
    })

    await expect(renderRoute()).rejects.toThrow('NEXT_REDIRECT')
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/auth-mvp/utlagt-og-endurgreitt/utgjold/${EXPENSE_ID}/breyta?step=split&draft=${DRAFT_ID}`,
    )
  })

  it('renders a privacy-safe conflict instead of 404 for ambiguous exact edit identities', async () => {
    mocks.getCanonicalEditDraft.mockResolvedValue({ status: 'ambiguous' })

    render(await renderRoute())

    expect(screen.getByRole('alert')).toHaveTextContent('Fleiri en ein breyting er í vinnslu')
    const backLink = screen.getByRole('link', { name: 'Til baka í staðfestan kostnað' })
    expect(backLink).toHaveAttribute(
      'href', `/auth-mvp/utlagt-og-endurgreitt/utgjold/${EXPENSE_ID}`,
    )
    expect(backLink).toHaveClass('min-h-11', 'focus-visible:ring-2')
    expect(screen.queryByRole('link', { name: /draft=/ })).not.toBeInTheDocument()
    expect(document.querySelector('a[href*="draft="]')).toBeNull()
    expect(mocks.notFound).not.toHaveBeenCalled()
  })

  it('renders a retryable safe state instead of 404 when edit lookup is unavailable', async () => {
    mocks.getCanonicalEditDraft.mockResolvedValue({ status: 'unavailable' })

    render(await renderRoute({ step: 'split' }))

    expect(screen.getByRole('status')).toHaveTextContent('Ekki tókst að sækja stöðu breytinga')
    const retryLink = screen.getByRole('link', { name: 'Reyna aftur' })
    expect(retryLink).toHaveAttribute(
      'href', `/auth-mvp/utlagt-og-endurgreitt/utgjold/${EXPENSE_ID}/breyta?step=split`,
    )
    expect(retryLink).toHaveClass('min-h-11', 'focus-visible:ring-2')
    expect(screen.getByRole('link', { name: 'Til baka í staðfestan kostnað' })).toHaveAttribute(
      'href', `/auth-mvp/utlagt-og-endurgreitt/utgjold/${EXPENSE_ID}`,
    )
    expect(document.querySelector('a[href*="draft="]')).toBeNull()
    expect(mocks.notFound).not.toHaveBeenCalled()
  })

  it('fails an ambiguous state closed even when the request names a valid draft ID', async () => {
    mocks.getCanonicalEditDraft.mockResolvedValue({ status: 'ambiguous' })

    render(await renderRoute({ step: 'split', draft: DRAFT_ID }))

    expect(screen.getByRole('alert')).toHaveTextContent('Fleiri en ein breyting er í vinnslu')
    expect(mocks.getCanonicalEditDraft).toHaveBeenCalledWith(ACTOR_ID, GROUP_ID, EXPENSE_ID)
    expect(mocks.getPrivateDraft).not.toHaveBeenCalled()
    expect(document.querySelector('a[href*="draft="]')).toBeNull()
  })

  it('fails an unavailable state closed even when the request names a valid draft ID', async () => {
    mocks.getCanonicalEditDraft.mockResolvedValue({ status: 'unavailable' })

    render(await renderRoute({ step: 'split', draft: DRAFT_ID }))

    expect(screen.getByRole('status')).toHaveTextContent('Ekki tókst að sækja stöðu breytinga')
    expect(mocks.getCanonicalEditDraft).toHaveBeenCalledWith(ACTOR_ID, GROUP_ID, EXPENSE_ID)
    expect(mocks.getPrivateDraft).not.toHaveBeenCalled()
    expect(document.querySelector('a[href*="draft="]')).toBeNull()
  })

  it('redirects a stale requested draft ID to the exact single canonical draft', async () => {
    mocks.getCanonicalEditDraft.mockResolvedValue({ status: 'single', draft: canonicalDraft() })

    await expect(renderRoute({ step: 'details', draft: STALE_DRAFT_ID })).rejects.toThrow('NEXT_REDIRECT')

    expect(mocks.redirect).toHaveBeenCalledWith(
      `/auth-mvp/utlagt-og-endurgreitt/utgjold/${EXPENSE_ID}/breyta?step=split&draft=${DRAFT_ID}`,
    )
    expect(mocks.getPrivateDraft).not.toHaveBeenCalled()
  })

  it('loads only the exact requested single canonical draft', async () => {
    const draft = canonicalDraft()
    mocks.getCanonicalEditDraft.mockResolvedValue({ status: 'single', draft })

    render(await renderRoute({ step: 'split', draft: DRAFT_ID }))

    expect(mocks.getCanonicalEditDraft).toHaveBeenCalledWith(ACTOR_ID, GROUP_ID, EXPENSE_ID)
    expect(mocks.getPrivateDraft).not.toHaveBeenCalled()
    expect(mocks.expenseForm).toHaveBeenCalledWith(expect.objectContaining({
      draft,
      initialDraftId: DRAFT_ID,
    }))
    expect(mocks.redirect).not.toHaveBeenCalled()
  })

  it('does not let a requested non-durable identity bypass revision opening', async () => {
    mocks.getCanonicalEditDraft.mockResolvedValue({ status: 'none' })
    mocks.getPrivateDraft.mockResolvedValue(null)

    await expect(renderRoute({ step: 'split', draft: DRAFT_ID })).rejects.toThrow('NEXT_REDIRECT')

    expect(mocks.getCanonicalEditDraft).toHaveBeenCalledWith(ACTOR_ID, GROUP_ID, EXPENSE_ID)
    expect(mocks.getPrivateDraft).not.toHaveBeenCalled()
    expect(mocks.expenseForm).not.toHaveBeenCalled()
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/auth-mvp/utlagt-og-endurgreitt/utgjold/${EXPENSE_ID}`,
    )
  })
})
