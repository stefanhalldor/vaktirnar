import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import type { ExpenseGroupView } from '@/lib/expenses/contracts'

const copy: Record<string, string> = {
  'list.create': 'Nýr viðburður',
  'list.emptyTitle': 'Engir viðburðir enn',
  'list.emptyDescription': 'Stofnaðu viðburð.',
  'list.heading': 'Viðburðirnir þínir',
  'list.participantCount': '{count} gestir',
  'list.expenseCount': '{count} útgjöld',
  'list.createdAt': 'Stofnað {date}',
  'detail.createdAt': 'Stofnað {date}',
  'detail.privateRosterHint': 'Þetta er þitt einkayfirlit.',
  'detail.addExpense': 'Skrá útgjald',
  'detail.participants': 'Gestir',
  'detail.frozenRosterHint': 'Gestalistinn frýs.',
  'detail.noParticipants': 'Engir gestir voru skráðir.',
  'detail.teskeidParticipant': 'Teskeiðarnotandi úr Tengslum',
  'detail.guestParticipant': 'Gestur með nafni',
  'detail.expenses': 'Útgjöld',
  'detail.noExpenses': 'Engin útgjöld hafa verið skráð.',
  'detail.cancelled': 'Fellt niður',
  'detail.openSettlement': 'Opna útgjöld og uppgjör',
}

vi.mock('next-intl', () => ({
  useLocale: () => 'is',
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    let value = copy[key] ?? key
    for (const [name, replacement] of Object.entries(values ?? {})) {
      value = value.replace(`{${name}}`, String(replacement))
    }
    return value
  },
}))

import { EventDetail } from '../EventDetail'
import { EventList } from '../EventList'

const event = {
  id: '70000000-0000-4000-8000-000000000001',
  name: 'Kvisskvöld',
  participantCount: 2,
  expenseCount: 1,
  createdAt: '2026-08-15T20:00:00.000Z',
}

describe('event presentational components', () => {
  it('renders an empty list and a populated owner-private list without extra controls', () => {
    const { rerender } = render(<EventList events={[]} />)
    expect(screen.getByText('Engir viðburðir enn')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nýr viðburður' }))
      .toHaveAttribute('href', '/auth-mvp/vidburdir/nyr')

    rerender(<EventList events={[event]} />)
    expect(screen.getByRole('link', { name: /Kvisskvöld/ }))
      .toHaveAttribute('href', `/auth-mvp/vidburdir/${event.id}`)
    expect(screen.getByText((_, element) => element?.textContent === '2 gestir · 1 útgjöld'))
      .toBeInTheDocument()
  })

  it('renders the frozen roster in position order and reuses canonical expense routes', () => {
    const group = {
      id: event.id,
      canCreateExpense: true,
      expenses: [{
        id: '80000000-0000-4000-8000-000000000001',
        title: 'Kvöldmatur',
        totalMinor: 12500,
        currency: 'ISK',
        incurredOn: '2026-08-15',
        status: 'active',
      }],
    } as ExpenseGroupView
    const { container } = render(<EventDetail event={{
      id: event.id,
      name: event.name,
      createdAt: event.createdAt,
      participants: [
        { id: '2', displayName: 'Bjarni', isTeskeidUser: false, position: 1 },
        { id: '1', displayName: 'Anna', isTeskeidUser: true, position: 0 },
      ],
    }} group={group} />)

    const roster = container.querySelector('[aria-labelledby="event-roster-heading"]')
    expect(roster?.textContent?.indexOf('Anna')).toBeLessThan(roster?.textContent?.indexOf('Bjarni') ?? 0)
    expect(screen.getByText('Teskeiðarnotandi úr Tengslum')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skrá útgjald' })).toHaveAttribute(
      'href',
      `/auth-mvp/utlagt-og-endurgreitt/hopar/${event.id}/nytt-utgjald`,
    )
    expect(screen.getByRole('link', { name: /Kvöldmatur/ })).toHaveAttribute(
      'href',
      '/auth-mvp/utlagt-og-endurgreitt/utgjold/80000000-0000-4000-8000-000000000001',
    )
    expect(screen.getByRole('link', { name: 'Opna útgjöld og uppgjör' })).toHaveAttribute(
      'href',
      `/auth-mvp/utlagt-og-endurgreitt/hopar/${event.id}`,
    )
  })
})
