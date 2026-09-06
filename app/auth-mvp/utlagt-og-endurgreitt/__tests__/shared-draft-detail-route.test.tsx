import React from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetDetail,
  mockDeleteControl,
  mockGetDeleteCapability,
  mockGetManagementTarget,
  mockGetPrivateDraft,
  mockGuard,
  mockNotFound,
  mockRedirect,
} = vi.hoisted(() => ({
  mockGetDetail: vi.fn(),
  mockDeleteControl: vi.fn(),
  mockGetDeleteCapability: vi.fn(),
  mockGetManagementTarget: vi.fn(),
  mockGetPrivateDraft: vi.fn(),
  mockGuard: vi.fn(),
  mockNotFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
  mockRedirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }),
}))

vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))
vi.mock('@/lib/expenses/guard', () => ({ guardExpenseSession: mockGuard }))
vi.mock('@/lib/expenses/repository.server', () => ({
  getExpenseCreationDraftDeleteCapability: mockGetDeleteCapability,
  getExpensePrivateDraft: mockGetPrivateDraft,
  getExpenseSharedDraftDetail: mockGetDetail,
  getExpenseSharedDraftManagementTarget: mockGetManagementTarget,
}))
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
vi.mock('@/components/expenses/ExpenseSharedDraftDetail', () => ({
  ExpenseSharedDraftDetail: ({ draft }: { draft: { publicationId: string } }) => (
    <div data-testid="shared-detail">{draft.publicationId}</div>
  ),
}))
vi.mock('@/components/expenses/ExpenseDeleteControl', () => ({
  ExpenseDeleteControl: (props: Record<string, unknown>) => {
    mockDeleteControl(props)
    return <button type="button" disabled>Eyða kostnaði</button>
  },
}))
vi.mock('@/components/expenses/ExpenseRouteLoading', () => ({
  ExpenseRouteLoading: () => <div role="status">loading</div>,
}))

import ExpenseSharedDraftPage from '@/app/auth-mvp/utlagt-og-endurgreitt/drog/[publicationId]/page'
import LoadingSharedExpenseDraft from '@/app/auth-mvp/utlagt-og-endurgreitt/drog/[publicationId]/loading'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const PUBLICATION_ID = '30000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.clearAllMocks()
  mockGuard.mockResolvedValue({ user: { id: ACTOR_ID } })
  mockGetManagementTarget.mockResolvedValue({ status: 'unavailable' })
  mockGetDeleteCapability.mockResolvedValue({ status: 'unavailable' })
  mockGetPrivateDraft.mockResolvedValue(null)
})

describe('shared draft detail route', () => {
  it('derives actor only from the server guard and renders exact ready detail', async () => {
    mockGetDetail.mockResolvedValue({
      status: 'ready',
      publicationId: PUBLICATION_ID,
      title: 'Kvöldmatur',
    })

    render(await ExpenseSharedDraftPage({
      params: Promise.resolve({ publicationId: PUBLICATION_ID }),
    }))

    expect(mockGetDetail).toHaveBeenCalledWith(ACTOR_ID, PUBLICATION_ID)
    expect(mockGetManagementTarget).toHaveBeenCalledWith(ACTOR_ID, PUBLICATION_ID)
    expect(screen.getByTestId('shared-detail')).toHaveTextContent(PUBLICATION_ID)
    expect(screen.getByRole('main')).toHaveAttribute('data-title', 'Kvöldmatur')
    expect(screen.getByRole('main')).toHaveAttribute(
      'data-back-href',
      '/auth-mvp/utlagt-og-endurgreitt',
    )
  })

  it.each(['not_found', 'unavailable'] as const)(
    'uses indistinguishable not-found routing for %s detail',
    async (status) => {
      mockGetDetail.mockResolvedValue({ status })
      await expect(ExpenseSharedDraftPage({
        params: Promise.resolve({ publicationId: PUBLICATION_ID }),
      })).rejects.toThrow('NEXT_NOT_FOUND')
      expect(mockNotFound).toHaveBeenCalledTimes(1)
    },
  )

  it.each([
    {
      label: 'one-off draft',
      draft: { contextType: 'one_off', groupId: null, expenseId: null, currentStep: 'details' },
      href: '/auth-mvp/utlagt-og-endurgreitt/nytt?draft=40000000-0000-4000-8000-000000000001',
    },
    {
      label: 'reusable-group draft',
      draft: {
        contextType: 'group',
        groupId: '20000000-0000-4000-8000-000000000001',
        expenseId: null,
        currentStep: 'split',
      },
      href: '/auth-mvp/utlagt-og-endurgreitt/hopar/20000000-0000-4000-8000-000000000001/nytt-utgjald?draft=40000000-0000-4000-8000-000000000001',
    },
    {
      label: 'confirmed edit draft',
      draft: {
        contextType: 'edit',
        groupId: '20000000-0000-4000-8000-000000000001',
        expenseId: '50000000-0000-4000-8000-000000000001',
        currentStep: 'split',
      },
      href: '/auth-mvp/utlagt-og-endurgreitt/utgjold/50000000-0000-4000-8000-000000000001/breyta?step=split&draft=40000000-0000-4000-8000-000000000001',
    },
  ])('redirects an author from shared detail to the authoritative $label editor', async ({ draft, href }) => {
    const draftId = '40000000-0000-4000-8000-000000000001'
    mockGetDetail.mockResolvedValue({
      status: 'ready',
      publicationId: PUBLICATION_ID,
      title: 'Kvöldmatur',
    })
    mockGetManagementTarget.mockResolvedValue({
      status: 'ready',
      viewerRole: 'author',
      detailTarget: { kind: 'private_draft', draftId },
    })
    mockGetPrivateDraft.mockResolvedValue({ id: draftId, ...draft })

    await expect(ExpenseSharedDraftPage({
      params: Promise.resolve({ publicationId: PUBLICATION_ID }),
    })).rejects.toThrow('NEXT_REDIRECT')

    expect(mockGetPrivateDraft).toHaveBeenCalledWith(ACTOR_ID, draftId)
    expect(mockRedirect).toHaveBeenCalledWith(href)
  })

  it.each(['not_found', 'unavailable'] as const)(
    'uses an independently ready author management target even when shared detail is %s',
    async (detailStatus) => {
      const draftId = '40000000-0000-4000-8000-000000000001'
      mockGetDetail.mockResolvedValue({ status: detailStatus })
      mockGetManagementTarget.mockResolvedValue({
        status: 'ready',
        viewerRole: 'author',
        detailTarget: { kind: 'private_draft', draftId },
      })
      mockGetPrivateDraft.mockResolvedValue({
        id: draftId,
        contextType: 'one_off',
        groupId: null,
        expenseId: null,
        currentStep: 'details',
      })

      await expect(ExpenseSharedDraftPage({
        params: Promise.resolve({ publicationId: PUBLICATION_ID }),
      })).rejects.toThrow('NEXT_REDIRECT')

      expect(mockRedirect).toHaveBeenCalledWith(
        `/auth-mvp/utlagt-og-endurgreitt/nytt?draft=${draftId}`,
      )
      expect(mockNotFound).not.toHaveBeenCalled()
    },
  )

  it('keeps a participant on the read-only shared detail route', async () => {
    mockGetDetail.mockResolvedValue({
      status: 'ready',
      publicationId: PUBLICATION_ID,
      title: 'Kvöldmatur',
    })
    mockGetManagementTarget.mockResolvedValue({
      status: 'ready',
      viewerRole: 'participant',
      detailTarget: { kind: 'shared_draft', publicationId: PUBLICATION_ID },
    })

    render(await ExpenseSharedDraftPage({
      params: Promise.resolve({ publicationId: PUBLICATION_ID }),
    }))

    expect(screen.getByTestId('shared-detail')).toHaveTextContent(PUBLICATION_ID)
    expect(mockGetPrivateDraft).not.toHaveBeenCalled()
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('shows an exact author a fail-closed management retry instead of participant-style detail', async () => {
    mockGetDetail.mockResolvedValue({
      status: 'ready',
      publicationId: PUBLICATION_ID,
      title: 'Kvöldmatur',
      viewerRole: 'author',
    })
    mockGetManagementTarget.mockResolvedValue({ status: 'unavailable' })

    render(await ExpenseSharedDraftPage({
      params: Promise.resolve({ publicationId: PUBLICATION_ID }),
    }))

    expect(screen.queryByTestId('shared-detail')).not.toBeInTheDocument()
    expect(screen.getByText('sharedDraftDetail.managementUnavailableHeading')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eyða kostnaði' })).toBeDisabled()
    expect(mockDeleteControl).toHaveBeenCalledWith(expect.objectContaining({
      creatorKnown: true,
      statusHref: `/auth-mvp/utlagt-og-endurgreitt/drog/${PUBLICATION_ID}`,
      target: { kind: 'creation_draft', capability: { status: 'unavailable' } },
    }))
  })

  it.each([
    {
      contextType: 'one_off' as const,
      groupId: null,
      href: '/auth-mvp/utlagt-og-endurgreitt/nytt?draft=40000000-0000-4000-8000-000000000001',
    },
    {
      contextType: 'group' as const,
      groupId: '20000000-0000-4000-8000-000000000001',
      href: '/auth-mvp/utlagt-og-endurgreitt/hopar/20000000-0000-4000-8000-000000000001/nytt-utgjald?draft=40000000-0000-4000-8000-000000000001',
    },
  ])('routes an author to deletion-only recovery for an unreadable $contextType draft', async ({ contextType, groupId, href }) => {
    const draftId = '40000000-0000-4000-8000-000000000001'
    mockGetDetail.mockResolvedValue({
      status: 'ready',
      publicationId: PUBLICATION_ID,
      title: 'Kvöldmatur',
    })
    mockGetManagementTarget.mockResolvedValue({
      status: 'ready',
      viewerRole: 'author',
      detailTarget: { kind: 'private_draft', draftId },
    })
    mockGetPrivateDraft.mockResolvedValue(null)
    mockGetDeleteCapability.mockResolvedValue({
      status: 'ready',
      subject: 'shared_draft',
      draftId,
      contextType,
      groupId,
      expectedDraftVersion: 4,
      expectedPublicationVersion: 9,
    })

    await expect(ExpenseSharedDraftPage({
      params: Promise.resolve({ publicationId: PUBLICATION_ID }),
    })).rejects.toThrow('NEXT_REDIRECT')

    expect(mockGetDeleteCapability).toHaveBeenCalledWith(ACTOR_ID, draftId)
    expect(mockRedirect).toHaveBeenCalledWith(href)
  })

  it('uses the canonical Expense route loader', () => {
    render(<LoadingSharedExpenseDraft />)
    expect(screen.getByRole('status')).toHaveTextContent('loading')
  })
})
