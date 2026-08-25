import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.fn()

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const messages: Record<string, string> = {
      'teskeid.expenses.eventActivity.title': 'Útlagður kostnaður',
      'teskeid.expenses.eventActivity.unavailable': 'Ekki tókst að sækja kostnaðinn núna.',
      'teskeid.expenses.eventActivity.retry': 'Reyna aftur',
      'teskeid.expenses.eventActivity.retrying': 'Reyni aftur...',
      'teskeid.expenses.eventActivity.yourPosition': 'Þín staða',
      'teskeid.expenses.eventActivity.positionOwes': `Þú skuldar ${values?.amount ?? ''}.`,
      'teskeid.expenses.eventActivity.positionOwed': `Þú átt ${values?.amount ?? ''} inni.`,
      'teskeid.expenses.eventActivity.positionZero': 'Þú skuldar ekki neitt 🥄',
      'teskeid.expenses.eventActivity.positionPending': `Uppgjör í ${values?.currency ?? ''} er í vinnslu.`,
      'teskeid.expenses.eventActivity.settleAll': 'Gera allt mitt upp',
    }
    return messages[key] ?? key
  },
}))

import { EventExpenseActivityV2 } from '@/components/expenses/EventExpenseActivityV2'
import type {
  EventExpenseActivityView,
  EventExpenseActivityV2View,
} from '@/lib/events/contracts'

type AssertFalse<T extends false> = T
type V1FitsV2 = [EventExpenseActivityView] extends [EventExpenseActivityV2View]
  ? true
  : false
type V1UnionFitsV2 = [EventExpenseActivityView | EventExpenseActivityV2View] extends [
  EventExpenseActivityV2View,
]
  ? true
  : false
const v1FitsV2: AssertFalse<V1FitsV2> = false
const v1UnionFitsV2: AssertFalse<V1UnionFitsV2> = false

beforeEach(() => refresh.mockReset())

describe('EventExpenseActivityV2', () => {
  it('keeps V1 and V1 unions outside the compile-time V2 boundary', () => {
    expect(v1FitsV2).toBe(false)
    expect(v1UnionFitsV2).toBe(false)
  })

  it('renders nothing for an actor with no visible linked expenses', () => {
    const { container } = render(
      <EventExpenseActivityV2
        view={{ contractVersion: 2, status: 'none', expenses: [], positions: [] }}
        canSettle={false}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders only the minimal all-Event summary with no position or destination affordance', () => {
    render(
      <EventExpenseActivityV2
        view={{
          contractVersion: 2,
          status: 'ready',
          expenses: [{ title: 'Sameiginleg rúta', totalMinor: 25_000, currency: 'ISK' }],
          positions: [],
        }}
        canSettle
      />,
    )

    expect(screen.getByText('Sameiginleg rúta')).toBeInTheDocument()
    expect(screen.getByText(/25\.000/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Þín staða' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Gera allt mitt upp' })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Greiðandi|Sameiginlegt borðhald/)
  })

  it('shows actor-own positions but requires the independent destination capability for settlement', () => {
    const view = {
      contractVersion: 2 as const,
      status: 'ready' as const,
      expenses: [{ title: 'Kvöldmatur', totalMinor: 12_500, currency: 'ISK' }],
      positions: [{ currency: 'ISK', state: 'owes' as const, amountMinor: 6_250 }],
    }
    const rendered = render(<EventExpenseActivityV2 view={view} canSettle={false} />)
    expect(screen.getByRole('heading', { name: 'Þín staða' })).toBeInTheDocument()
    expect(screen.getByText(/Þú skuldar/)).toHaveTextContent(/6\.250/)
    expect(screen.queryByRole('link', { name: 'Gera allt mitt upp' })).not.toBeInTheDocument()

    rendered.rerender(<EventExpenseActivityV2 view={view} canSettle />)
    expect(screen.getByRole('link', { name: 'Gera allt mitt upp' })).toHaveAttribute(
      'href',
      '/auth-mvp/utlagt-og-endurgreitt/gera-upp',
    )
  })

  it('fails soft with one bounded refresh action', () => {
    const rendered = render(
      <EventExpenseActivityV2
        view={{ contractVersion: 2, status: 'unavailable', expenses: [], positions: [] }}
        canSettle={false}
      />,
    )
    const retry = screen.getByRole('button', { name: 'Reyna aftur' })
    fireEvent.click(retry)
    fireEvent.click(retry)
    expect(refresh).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Reyni aftur...' })).toBeDisabled()
    expect(screen.queryByRole('link', { name: 'Gera allt mitt upp' })).not.toBeInTheDocument()

    rendered.rerender(
      <EventExpenseActivityV2
        view={{ contractVersion: 2, status: 'unavailable', expenses: [], positions: [] }}
        canSettle={false}
      />,
    )
    expect(screen.getByRole('button', { name: 'Reyna aftur' })).toBeEnabled()
  })
})
