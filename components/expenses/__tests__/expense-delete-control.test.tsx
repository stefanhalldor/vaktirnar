import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deleteCreationDraft: vi.fn(),
  deleteConfirmedExpense: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}))

const translations: Record<string, string> = {
  'deleteControl.trigger': 'Eyða kostnaði',
  'deleteControl.confirm': 'Eyða kostnaði',
  'deleteControl.deleting': 'Eyði kostnaði...',
  'deleteControl.keep': 'Halda kostnaði',
  'deleteControl.close': 'Loka',
  'deleteControl.closeLabel': 'Loka staðfestingu',
  'deleteControl.checkStatus': 'Athuga stöðu',
  'deleteControl.checkingStatus': 'Athuga stöðu...',
  'deleteControl.unavailable': 'Ekki tókst að staðfesta eyðingu.',
  'deleteControl.subjects.privateDraft.title': 'Eyða drögunum?',
  'deleteControl.subjects.privateDraft.description': 'Einkadrögunum verður eytt varanlega.',
  'deleteControl.subjects.sharedDraft.title': 'Eyða deildum drögum?',
  'deleteControl.subjects.sharedDraft.description': 'Drögunum og deilingunni verður eytt varanlega.',
  'deleteControl.subjects.confirmedExpense.title': 'Eyða staðfestum kostnaði?',
  'deleteControl.subjects.confirmedExpense.description': 'Staðfesta kostnaðinum verður eytt varanlega.',
  'deleteControl.blocked.open_revision': 'Hættu fyrst við opnu breytingarnar.',
  'errors.conflict': 'Gögnin hafa breyst.',
  'errors.delete_outcome_unknown': 'Ekki tókst að staðfesta niðurstöðuna.',
}

vi.mock('next-intl', () => ({
  useTranslations: () => (rawKey: string) => (
    translations[rawKey.replace(/^teskeid\.expenses\./, '')] ?? rawKey
  ),
}))

vi.mock('@/lib/expenses/actions', () => ({
  deleteOwnExpenseCreationDraft: mocks.deleteCreationDraft,
  deleteOwnUnsettledExpense: mocks.deleteConfirmedExpense,
}))

import { ExpenseDeleteControl } from '@/components/expenses/ExpenseDeleteControl'

const DRAFT_ID = '11111111-1111-4111-8111-111111111111'
const GROUP_ID = '22222222-2222-4222-8222-222222222222'

function draftTarget(subject: 'private_draft' | 'shared_draft' = 'private_draft') {
  return {
    kind: 'creation_draft' as const,
    capability: {
      status: 'ready' as const,
      subject,
      draftId: DRAFT_ID,
      contextType: 'group' as const,
      groupId: GROUP_ID,
      expectedDraftVersion: 4,
      expectedPublicationVersion: subject === 'shared_draft' ? 9 : null,
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ExpenseDeleteControl', () => {
  it('uses the private-draft disclosure and focuses the least destructive action', () => {
    render(
      <ExpenseDeleteControl
        target={draftTarget()}
        creatorKnown
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði' }))
    expect(screen.getByRole('alertdialog', { name: 'Eyða drögunum?' }))
      .toHaveTextContent('Einkadrögunum verður eytt varanlega.')
    expect(screen.getByRole('button', { name: 'Halda kostnaði' })).toHaveFocus()
  })

  it('deletes a shared draft atomically and never treats RPC context as navigation authority', async () => {
    mocks.deleteCreationDraft.mockResolvedValue({
      ok: true,
      data: {
        draftId: DRAFT_ID,
        subject: 'shared_draft',
        groupId: GROUP_ID,
        eventId: null,
      },
    })
    render(
      <ExpenseDeleteControl
        target={draftTarget('shared_draft')}
        creatorKnown
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði' }))
    expect(screen.getByRole('alertdialog', { name: 'Eyða deildum drögum?' }))
      .toHaveTextContent('Drögunum og deilingunni verður eytt varanlega.')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði' }))
    })

    expect(mocks.deleteCreationDraft).toHaveBeenCalledWith({
      draft_id: DRAFT_ID,
      expected_draft_version: 4,
      expected_publication_version: 9,
      request_id: expect.any(String),
    })
    expect(mocks.replace).toHaveBeenCalledWith('/auth-mvp/utlagt-og-endurgreitt')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('uses an explicit context href supplied by a server route that already proved read access', async () => {
    mocks.deleteCreationDraft.mockResolvedValue({
      ok: true,
      data: {
        draftId: DRAFT_ID,
        subject: 'private_draft',
        groupId: GROUP_ID,
        eventId: null,
      },
    })
    const provenGroupHref = `/auth-mvp/utlagt-og-endurgreitt/hopar/${GROUP_ID}`
    render(
      <ExpenseDeleteControl
        target={draftTarget()}
        creatorKnown
        successHref={provenGroupHref}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Eyða kostnaði',
      }))
    })

    expect(mocks.replace).toHaveBeenCalledWith(provenGroupHref)
  })

  it('keeps the mental model visible but non-destructive when exact creator proof and capability disagree', () => {
    render(
      <ExpenseDeleteControl
        target={{ kind: 'creation_draft', capability: { status: 'not_found' } }}
        creatorKnown
      />,
    )
    expect(screen.getByRole('button', { name: 'Eyða kostnaði' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Athuga stöðu' })).toBeEnabled()
    expect(mocks.deleteCreationDraft).not.toHaveBeenCalled()
  })

  it.each([
    { kind: 'creation_draft' as const, capability: { status: 'not_found' as const } },
    {
      kind: 'confirmed_expense' as const,
      expenseId: '44444444-4444-4444-8444-444444444444',
      capability: { status: 'hidden' as const },
    },
    {
      kind: 'confirmed_expense' as const,
      expenseId: '44444444-4444-4444-8444-444444444444',
      capability: { status: 'available' as const, expectedFinancialVersion: 3 },
    },
  ])('hides a noncreator $kind capability without leaking a delete surface', (target) => {
    render(
      <ExpenseDeleteControl
        target={target}
        creatorKnown={false}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Eyða kostnaði' })).not.toBeInTheDocument()
  })

  it('keeps an unavailable creator control visible but non-destructive', () => {
    render(
      <ExpenseDeleteControl
        target={{ kind: 'creation_draft', capability: { status: 'unavailable' } }}
        creatorKnown
      />,
    )

    expect(screen.getByRole('button', { name: 'Eyða kostnaði' })).toBeDisabled()
    expect(screen.getByText('Ekki tókst að staðfesta eyðingu.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Athuga stöðu' }))
    expect(mocks.deleteCreationDraft).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith('/auth-mvp/utlagt-og-endurgreitt')
  })

  it('locks rapid re-entry and all sibling mutations while deletion is pending', async () => {
    const mutation = deferred<{
      ok: true
      data: {
        draftId: string
        subject: 'private_draft'
        groupId: null
        eventId: null
      }
    }>()
    mocks.deleteCreationDraft.mockReturnValue(mutation.promise)
    const onBusyChange = vi.fn()
    render(
      <ExpenseDeleteControl
        target={draftTarget()}
        creatorKnown
        onBusyChange={onBusyChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði' }))
    const confirm = screen.getByRole('button', { name: 'Eyða kostnaði' })
    await act(async () => {
      fireEvent.click(confirm)
      fireEvent.click(confirm)
      await Promise.resolve()
    })

    expect(mocks.deleteCreationDraft).toHaveBeenCalledTimes(1)
    expect(onBusyChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole('button', { name: 'Eyði kostnaði...' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Halda kostnaði' })).toBeDisabled()

    await act(async () => {
      mutation.resolve({
        ok: true,
        data: {
          draftId: DRAFT_ID,
          subject: 'private_draft',
          groupId: null,
          eventId: null,
        },
      })
    })
    expect(mocks.replace).toHaveBeenCalledWith('/auth-mvp/utlagt-og-endurgreitt')
  })

  it('requires completed reconciliation and retains the same request before replay', async () => {
    mocks.deleteCreationDraft
      .mockRejectedValueOnce(new Error('transport'))
      .mockResolvedValueOnce({
        ok: true,
        data: {
          draftId: DRAFT_ID,
          subject: 'private_draft',
          groupId: null,
          eventId: null,
        },
      })
    const onBusyChange = vi.fn()
    render(
      <ExpenseDeleteControl
        target={draftTarget()}
        creatorKnown
        onBusyChange={onBusyChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Ekki tókst að staðfesta niðurstöðuna.')
    expect(screen.queryByRole('button', { name: 'Eyða kostnaði' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Halda kostnaði' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Loka' }))
    fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði' }))
    const reopened = screen.getByRole('alertdialog')
    expect(within(reopened).queryByRole('button', { name: 'Eyða kostnaði' })).not.toBeInTheDocument()
    fireEvent.click(within(reopened).getByRole('button', { name: 'Athuga stöðu' }))
    expect(mocks.deleteCreationDraft).toHaveBeenCalledTimes(1)
    const retainedRequestId = mocks.deleteCreationDraft.mock.calls[0]![0].request_id
    expect(mocks.replace).toHaveBeenCalledWith(
      '/auth-mvp/utlagt-og-endurgreitt',
    )
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(onBusyChange).toHaveBeenLastCalledWith(false)

    fireEvent.click(screen.getByRole('button', { name: 'Eyða kostnaði' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Eyða kostnaði',
      }))
    })
    expect(mocks.deleteCreationDraft).toHaveBeenCalledTimes(2)
    expect(mocks.deleteCreationDraft.mock.calls[1]![0].request_id).toBe(retainedRequestId)
  })
})
