import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import isMessages from '@/messages/is.json'
import enMessages from '@/messages/en.json'

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
      'teskeid.expenses.eventActivity.payer': 'Greiðandi',
      'teskeid.expenses.eventActivity.payers': 'Greiðendur',
      'teskeid.expenses.eventActivity.genericPayer': 'Þátttakandi',
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

import { EventExpenseActivity } from '@/components/expenses/EventExpenseActivity'

beforeEach(() => refresh.mockReset())

describe('EventExpenseActivity', () => {
  it('renders nothing for an Event without linked expenses', () => {
    const { container } = render(<EventExpenseActivity view={{ status: 'none', expenses: [], positions: [] }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows only attendee-safe expense facts, own position and the global settle-all link', () => {
    render(<EventExpenseActivity view={{
      status: 'ready',
      expenses: [{
        title: 'Kvöldmatur',
        description: 'Sameiginlegt borðhald',
        totalMinor: 12_500,
        currency: 'ISK',
        payers: [
          { displayName: 'Anna', amountMinor: 7_500 },
          { displayName: null, amountMinor: 5_000 },
        ],
      }],
      positions: [{ currency: 'ISK', state: 'owes', amountMinor: 6_250 }],
    }} />)

    expect(screen.getByText('Kvöldmatur')).toBeInTheDocument()
    expect(screen.getByText('Sameiginlegt borðhald')).toBeInTheDocument()
    expect(screen.getByText('Anna')).toBeInTheDocument()
    expect(screen.getByText('Þátttakandi')).toBeInTheDocument()
    expect(screen.getByText(/Þú skuldar/)).toHaveTextContent(/6\.250/)
    expect(screen.getByRole('link', { name: 'Gera allt mitt upp' })).toHaveAttribute(
      'href', '/auth-mvp/utlagt-og-endurgreitt/gera-upp',
    )
    expect(screen.getByRole('link', { name: 'Gera allt mitt upp' })).toHaveClass('min-h-11')
    expect(document.body.textContent).not.toContain('Einföld greiðsluáætlun')
  })

  it('keeps the exact own-position and disclosure copy in Icelandic and English', () => {
    expect(isMessages.teskeid.expenses.eventActivity.positionOwes).toBe('Þú skuldar {amount}.')
    expect(isMessages.teskeid.expenses.eventActivity.positionOwed).toBe('Þú átt {amount} inni.')
    expect(isMessages.teskeid.expenses.eventActivity.positionZero).toBe('Þú skuldar ekki neitt 🥄')
    expect(enMessages.teskeid.expenses.eventActivity.positionOwes).toBe('You owe {amount}.')
    expect(enMessages.teskeid.expenses.eventActivity.positionOwed).toBe('You are owed {amount}.')
    expect(enMessages.teskeid.expenses.eventActivity.positionZero).toBe('You do not owe anything 🥄')
    expect(isMessages.teskeid.expenses.eventVisibility.legend)
      .toBe('Hverjir sjá kostnaðinn á viðburðinum?')
    expect(isMessages.teskeid.expenses.eventVisibility.participantsOnly)
      .toBe('Aðeins þau sem taka þátt í kostnaðinum')
    expect(isMessages.teskeid.expenses.eventVisibility.allEvent)
      .toBe('Allir sem sjá viðburðinn')
    expect(enMessages.teskeid.expenses.eventVisibility.legend)
      .toBe('Who can see the expense on the event?')
    expect(enMessages.teskeid.expenses.eventVisibility.participantsOnly)
      .toBe('Only people included in the expense')
    expect(enMessages.teskeid.expenses.eventVisibility.allEvent)
      .toBe('Everyone who can see the event')
    for (const messages of [isMessages, enMessages]) {
      const visibilityCopy = JSON.stringify(messages.teskeid.expenses.eventVisibility)
      expect(messages.teskeid.expenses.expenseForm.linkToEventHint)
        .toMatch(/sýnileik|visibility/i)
      expect(messages.teskeid.expenses.expense.linkDisclosureParticipants)
        .toMatch(/þátttak|participant/i)
      expect(messages.teskeid.expenses.expense.linkDisclosureOrganizer)
        .not.toMatch(/email@|uuid/i)
      expect(visibilityCopy).not.toMatch(/event owner|organizer only|aðeins eigandi/i)
    }
  })

  it('shows a neutral pending position and offers a bounded retry on load failure', () => {
    const first = render(<EventExpenseActivity view={{
      status: 'ready', expenses: [],
      positions: [{ currency: 'ISK', state: 'pending', amountMinor: 0 }],
    }} />)
    expect(screen.getByText('Uppgjör í ISK er í vinnslu.')).toBeInTheDocument()
    first.unmount()

    render(<EventExpenseActivity view={{ status: 'unavailable', expenses: [], positions: [] }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reyna aftur' }))
    expect(refresh).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Reyni aftur...' })).toBeDisabled()
  })
})
