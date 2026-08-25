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

import { EventExpenseActivityV3 } from '@/components/expenses/EventExpenseActivityV3'
import type {
  EventExpenseActivityV2View,
  EventExpenseActivityV3View,
} from '@/lib/events/contracts'

type AssertFalse<T extends false> = T
type V2FitsV3 = [EventExpenseActivityV2View] extends [EventExpenseActivityV3View]
  ? true
  : false
const v2FitsV3: AssertFalse<V2FitsV3> = false

beforeEach(() => refresh.mockReset())

describe('EventExpenseActivityV3', () => {
  it('keeps the compile-time V3 boundary separate from V2', () => {
    expect(v2FitsV3).toBe(false)
  })

  it('renders nothing when no linked expense is visible', () => {
    const { container } = render(
      <EventExpenseActivityV3
        view={{ contractVersion: 3, status: 'none', expenses: [], positions: [] }}
        canSettle={false}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders duplicate-looking authorized rows as distinct legal full-width links', () => {
    render(
      <EventExpenseActivityV3
        view={{
          contractVersion: 3,
          status: 'ready',
          expenses: [{
            title: 'Kvöldmatur',
            totalMinor: 12_500,
            currency: 'ISK',
            detailHref: '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-a',
          }, {
            title: 'Kvöldmatur',
            totalMinor: 12_500,
            currency: 'ISK',
            detailHref: '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-b',
          }],
          positions: [],
        }}
        canSettle={false}
      />,
    )

    const detailLinks = screen.getAllByRole('link', { name: /Kvöldmatur/ })
    expect(detailLinks).toHaveLength(2)
    expect(detailLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-a',
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-b',
    ])
    for (const link of detailLinks) {
      expect(link).toHaveClass('min-h-12', 'w-full', 'focus-visible:ring-2')
      expect(link.parentElement?.tagName).toBe('LI')
      expect(link.parentElement?.parentElement?.tagName).toBe('UL')
      expect(link.querySelector('a, button, [tabindex]')).toBeNull()
      expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }
    expect(screen.queryByRole('link', { name: 'Gera allt mitt upp' })).not.toBeInTheDocument()
  })

  it('keeps an authorized detail link and settlement link as separate sibling targets', () => {
    render(
      <EventExpenseActivityV3
        view={{
          contractVersion: 3,
          status: 'ready',
          expenses: [{
            title: 'Kvöldmatur',
            totalMinor: 12_500,
            currency: 'ISK',
            detailHref: '/auth-mvp/utlagt-og-endurgreitt/utgjold/expense-a',
          }],
          positions: [{ currency: 'ISK', state: 'owed', amountMinor: 5_000 }],
        }}
        canSettle
      />,
    )

    const detail = screen.getByRole('link', { name: /Kvöldmatur/ })
    const settlement = screen.getByRole('link', { name: 'Gera allt mitt upp' })
    expect(detail.closest('li')).not.toBeNull()
    expect(settlement.closest('ul')).toBeNull()
    expect(detail.contains(settlement)).toBe(false)
    expect(settlement.contains(detail)).toBe(false)
    expect(detail.querySelector('a, button')).toBeNull()
    expect(settlement.querySelector('a, button')).toBeNull()
  })

  it('keeps an unauthorized row static while settlement remains an independent sibling target', () => {
    render(
      <EventExpenseActivityV3
        view={{
          contractVersion: 3,
          status: 'ready',
          expenses: [{
            title: 'Sameiginleg rúta',
            totalMinor: 25_000,
            currency: 'ISK',
            detailHref: null,
          }],
          positions: [{ currency: 'ISK', state: 'owes', amountMinor: 5_000 }],
        }}
        canSettle
      />,
    )

    const staticRow = screen.getByText('Sameiginleg rúta').closest('li')
    expect(staticRow).not.toBeNull()
    expect(staticRow?.querySelector('a, button, [tabindex], svg')).toBeNull()
    expect(staticRow?.firstElementChild).toHaveClass('min-h-12')

    const settlement = screen.getByRole('link', { name: 'Gera allt mitt upp' })
    expect(settlement).toHaveAttribute('href', '/auth-mvp/utlagt-og-endurgreitt/gera-upp')
    expect(settlement.closest('ul')).toBeNull()
    expect(staticRow?.contains(settlement)).toBe(false)
  })

  it('fails soft with one bounded refresh action and no destination link', () => {
    const rendered = render(
      <EventExpenseActivityV3
        view={{ contractVersion: 3, status: 'unavailable', expenses: [], positions: [] }}
        canSettle={false}
      />,
    )

    const retry = screen.getByRole('button', { name: 'Reyna aftur' })
    fireEvent.click(retry)
    fireEvent.click(retry)
    expect(refresh).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Reyni aftur...' })).toBeDisabled()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()

    rendered.rerender(
      <EventExpenseActivityV3
        view={{ contractVersion: 3, status: 'unavailable', expenses: [], positions: [] }}
        canSettle={false}
      />,
    )
    expect(screen.getByRole('button', { name: 'Reyna aftur' })).toBeEnabled()
  })
})
