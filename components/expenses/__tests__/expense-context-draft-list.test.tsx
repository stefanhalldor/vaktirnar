import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    'teskeid.expenses.contextDrafts.heading': 'Drög að kostnaði',
    'teskeid.expenses.contextDrafts.helper': 'Drög hafa ekki áhrif á uppgjör.',
    'teskeid.expenses.contextDrafts.unavailable': 'Ekki tókst að sækja drög.',
    'teskeid.expenses.contextDrafts.retry': 'Reyna aftur',
    'teskeid.expenses.contextDrafts.retrying': 'Reyni aftur…',
    'teskeid.expenses.contextDrafts.lifecycle.private_draft': 'Drög fyrir mig',
    'teskeid.expenses.contextDrafts.lifecycle.shared_draft': 'Drög með öðrum',
    'teskeid.expenses.contextDrafts.allocation.incomplete': 'Skiptingin er enn í vinnslu',
    'teskeid.expenses.contextDrafts.allocation.balanced_unconfirmed': 'Skiptingin bíður staðfestingar',
  }[key] ?? key),
}))

import { ExpenseContextDraftList } from '@/components/expenses/ExpenseContextDraftList'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ExpenseContextDraftList', () => {
  it('renders authorized targets as links and all-Event summaries as static rows', () => {
    const { container } = render(<ExpenseContextDraftList
      locale="is"
      view={{
        status: 'ready',
        items: [{
          lifecycleState: 'private_draft',
          title: 'Einkadrög',
          totalMinor: 10_000,
          currency: 'ISK',
          incurredOn: '2026-08-26',
          allocationState: 'incomplete',
          detailHref: '/auth-mvp/utlagt-og-endurgreitt/nytt?draft=private-id',
        }, {
          lifecycleState: 'shared_draft',
          title: 'Sýnilegt öllum',
          totalMinor: 20_000,
          currency: 'ISK',
          incurredOn: '2026-08-25',
          allocationState: 'balanced_unconfirmed',
          detailHref: null,
        }],
      }}
    />)

    expect(screen.getByRole('heading', { name: 'Drög að kostnaði' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Einkadrög/ })).toHaveAttribute(
      'href',
      '/auth-mvp/utlagt-og-endurgreitt/nytt?draft=private-id',
    )
    expect(screen.getByText('Drög fyrir mig')).toBeInTheDocument()
    expect(screen.getByText('Drög með öðrum')).toBeInTheDocument()
    expect(screen.getByText('Sýnilegt öllum').closest('a')).toBeNull()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(container.querySelectorAll('svg')).toHaveLength(1)
  })

  it('locks unavailable retry before one refresh and exposes pending status', () => {
    render(<ExpenseContextDraftList
      locale="is"
      view={{ status: 'unavailable', items: [] }}
    />)

    const retry = screen.getByRole('button', { name: 'Reyna aftur' })
    fireEvent.click(retry)
    fireEvent.click(retry)

    expect(mockRefresh).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Reyni aftur…' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Reyni aftur…')
  })

  it('renders structural absence for a ready-empty source', () => {
    const { container } = render(<ExpenseContextDraftList
      locale="is"
      view={{ status: 'ready', items: [] }}
    />)

    expect(container).toBeEmptyDOMElement()
  })
})
