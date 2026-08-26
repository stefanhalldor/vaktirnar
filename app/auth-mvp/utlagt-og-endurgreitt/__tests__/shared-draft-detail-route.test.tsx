import React from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetDetail,
  mockGuard,
  mockNotFound,
} = vi.hoisted(() => ({
  mockGetDetail: vi.fn(),
  mockGuard: vi.fn(),
  mockNotFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }),
}))

vi.mock('next/navigation', () => ({ notFound: mockNotFound }))
vi.mock('@/lib/expenses/guard', () => ({ guardExpenseSession: mockGuard }))
vi.mock('@/lib/expenses/repository.server', () => ({
  getExpenseSharedDraftDetail: mockGetDetail,
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

  it('uses the canonical Expense route loader', () => {
    render(<LoadingSharedExpenseDraft />)
    expect(screen.getByRole('status')).toHaveTextContent('loading')
  })
})
