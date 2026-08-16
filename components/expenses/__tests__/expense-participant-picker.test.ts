import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import type { EventExpenseSourceView } from '@/lib/events/contracts'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => ({
    'teskeid.expenses.expenseForm.closeParticipantPicker': 'Loka vali',
    'teskeid.expenses.expenseForm.participantLoadError': 'Ekki tókst að sækja tengsl',
    'teskeid.expenses.expenseForm.relationshipCircles': 'Tengslahringir',
    'teskeid.expenses.expenseForm.searchKnownParticipant': 'Leita í þekktum aðilum',
    'teskeid.expenses.expenseForm.searchKnownParticipantPlaceholder': 'Nafn eða label',
    'teskeid.expenses.expenseForm.filterKnownPeople': 'Sía þekkta aðila',
    'teskeid.expenses.expenseForm.allKnownPeople': 'Allir',
    'teskeid.expenses.expenseForm.noKnownParticipantResults': 'Enginn aðili fannst',
    'teskeid.expenses.expenseForm.participantSource': 'Leið til að bæta við',
    'teskeid.expenses.expenseForm.knownParticipant': 'Þekktur aðili',
    'teskeid.expenses.expenseForm.nameOrEmail': 'Nafn eða netfang',
    'teskeid.expenses.expenseForm.nameOrEmailPlaceholder': 'Nafn eða netfang',
    'teskeid.expenses.expenseForm.nameOrEmailHint': 'Skráðu nafn eða netfang',
    'teskeid.expenses.expenseForm.eventParticipantSource': 'Úr viðburði',
    'teskeid.expenses.expenseForm.eventSourceLoadError': 'Ekki tókst að sækja viðburði',
    'teskeid.expenses.expenseForm.eventSourceRetrying': 'Reyni aftur...',
    'teskeid.expenses.expenseForm.eventSourceRetry': 'Reyna aftur',
    'teskeid.expenses.expenseForm.eventSearchLabel': 'Leita að viðburði',
    'teskeid.expenses.expenseForm.eventSearchPlaceholder': 'Heiti viðburðar',
    'teskeid.expenses.expenseForm.noEventResults': 'Enginn viðburður fannst',
    'teskeid.expenses.expenseForm.selectedEvent': 'Valinn viðburður',
    'teskeid.expenses.expenseForm.clearEventSelection': 'Hreinsa val',
    'teskeid.expenses.expenseForm.changeEvent': 'Breyta viðburði',
    'teskeid.expenses.expenseForm.eventGuestSearchLabel': 'Leita að gesti',
    'teskeid.expenses.expenseForm.eventGuestSearchPlaceholder': 'Nafn gests',
    'teskeid.expenses.expenseForm.noEventGuestResults': 'Enginn gestur fannst',
    'teskeid.expenses.expenseForm.addParticipant': 'Bæta við þátttakanda',
    'teskeid.expenses.expenseForm.addParticipantDescription': 'Veldu aðila',
    'teskeid.expenses.expenseForm.participantEmailInvalid': 'Ógilt netfang',
    'teskeid.expenses.expenseForm.participantNameInvalid': 'Ógilt nafn',
  }[key] ?? key),
}))

import {
  classifyManualExpenseParticipant,
  ExpenseParticipantPicker,
} from '../ExpenseParticipantPicker'

describe('unified expense participant input', () => {
  it('classifies a plain name as a durable guest participant', () => {
    expect(classifyManualExpenseParticipant('  Greta Jóns  ')).toEqual({
      kind: 'guest',
      displayName: 'Greta Jóns',
    })
  })

  it('canonicalizes an email and rejects malformed email-like input', () => {
    expect(classifyManualExpenseParticipant(' GRETA@EXAMPLE.IS ')).toEqual({
      kind: 'email',
      recipientEmail: 'greta@example.is',
    })
    expect(classifyManualExpenseParticipant('greta@')).toBeNull()
    expect(classifyManualExpenseParticipant('')).toBeNull()
  })

  it('keeps shared profile labels searchable while returning the exact expense option', () => {
    const option = {
      relationshipId: 'relationship-1',
      pickerLabel: 'Mamma',
      sharedLabel: 'Guðrún Jónsdóttir',
      customLabels: [{ id: 'family', name: 'Fjölskylda' }],
    }
    const onAddKnown = vi.fn(() => true)

    render(React.createElement(ExpenseParticipantPicker, {
      options: [option],
      onAddKnown,
      onAddManual: vi.fn(() => true),
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Leita í þekktum aðilum' }), {
      target: { value: 'Jónsdóttir' },
    })

    expect(screen.getByText('Mamma')).toBeInTheDocument()
    expect(screen.queryByText('Guðrún Jónsdóttir')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Mamma/ }))
    expect(onAddKnown).toHaveBeenCalledWith(option)
  })

  it('maps successful manual and circle choices back to exact Expense values', () => {
    const onAddManual = vi.fn(() => true)
    const onSelectCircle = vi.fn(() => true)
    const circle = {
      id: 'circle-1',
      name: 'Fjölskyldan',
      members: [{ circleMemberId: 'member-1', displayName: 'Mamma', isSelf: false }],
    }

    const { rerender } = render(React.createElement(ExpenseParticipantPicker, {
      options: [],
      onAddKnown: vi.fn(() => true),
      onAddManual,
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Nafn eða netfang' }), {
      target: { value: ' VINUR@EXAMPLE.IS ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    expect(onAddManual).toHaveBeenCalledWith({
      kind: 'email',
      recipientEmail: 'vinur@example.is',
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(React.createElement(ExpenseParticipantPicker, {
      options: [],
      circles: [circle],
      onAddKnown: vi.fn(() => true),
      onAddManual,
      onSelectCircle,
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    fireEvent.click(screen.getByRole('button', { name: 'Þekktur aðili' }))
    fireEvent.click(screen.getByRole('button', { name: /Fjölskyldan/ }))
    expect(onSelectCircle).toHaveBeenCalledWith(circle)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers three pluggable sources and keeps event multi-select open', () => {
    const event = {
      id: 'event-1',
      name: 'Sumarferð',
      rosterRevision: 3,
      guests: [
        { id: 'guest-1', displayName: 'Anna', sourceKind: 'manual_name' as const },
        { id: 'guest-2', displayName: 'Bjarni', sourceKind: 'relationship' as const },
      ],
    }
    const onSelectEvent = vi.fn(() => ({ accepted: true as const }))
    const onAddEventGuest = vi.fn(() => ({ accepted: true as const }))

    render(React.createElement(ExpenseParticipantPicker, {
      options: [],
      eventSources: [event],
      selectedEventId: null,
      selectedEventGuestIds: [],
      onSelectEvent,
      onClearEvent: vi.fn(),
      onAddEventGuest,
      onAddKnown: vi.fn(() => true),
      onAddManual: vi.fn(() => true),
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    expect(screen.getByRole('button', { name: 'Þekktur aðili' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Úr viðburði' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nafn eða netfang' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Úr viðburði' }))
    fireEvent.click(screen.getByRole('button', { name: /Sumarferð/ }))
    expect(onSelectEvent).toHaveBeenCalledWith(event)

    fireEvent.click(screen.getByRole('button', { name: /Anna/ }))
    fireEvent.click(screen.getByRole('button', { name: /Bjarni/ }))
    expect(onAddEventGuest).toHaveBeenNthCalledWith(1, event, event.guests[0])
    expect(onAddEventGuest).toHaveBeenNthCalledWith(2, event, event.guests[1])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('keeps an exact pinned event usable when the broader event directory fails', () => {
    const event = {
      id: 'event-1',
      name: 'Sumarferð',
      rosterRevision: 3,
      guests: [{ id: 'guest-1', displayName: 'Anna', sourceKind: 'manual_name' as const }],
    }
    render(React.createElement(ExpenseParticipantPicker, {
      options: [],
      eventSources: [event],
      eventSourcesError: true,
      selectedEventId: event.id,
      selectedEventGuestIds: [],
      initialSourceId: 'event',
      onSelectEvent: vi.fn(() => ({ accepted: true as const })),
      onClearEvent: vi.fn(),
      onAddEventGuest: vi.fn(() => ({ accepted: true as const })),
      onAddKnown: vi.fn(() => true),
      onAddManual: vi.fn(() => true),
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    expect(screen.getByText('Sumarferð')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Anna/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('requires an explicit clear before switching from one event to another', () => {
    const events: EventExpenseSourceView[] = [
      { id: 'event-a', name: 'Viðburður A', rosterRevision: 1, guests: [] },
      { id: 'event-b', name: 'Viðburður B', rosterRevision: 1, guests: [] },
    ]
    const clear = vi.fn()
    const select = vi.fn()

    function Harness() {
      const [selectedEventId, setSelectedEventId] = React.useState<string | null>('event-a')
      return React.createElement(ExpenseParticipantPicker, {
        options: [],
        eventSources: events,
        selectedEventId,
        selectedEventGuestIds: [],
        initialSourceId: 'event',
        onSelectEvent: (event: EventExpenseSourceView) => {
          select(event.id)
          setSelectedEventId(event.id)
          return { accepted: true as const, behavior: 'stay-open' as const }
        },
        onClearEvent: () => {
          clear()
          setSelectedEventId(null)
        },
        onAddEventGuest: vi.fn(() => ({ accepted: true as const })),
        onAddKnown: vi.fn(() => true),
        onAddManual: vi.fn(() => true),
      })
    }

    render(React.createElement(Harness))
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    expect(screen.getByText('Viðburður A')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Viðburður B/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Breyta viðburði' }))
    expect(clear).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /Viðburður B/ }))
    expect(select).toHaveBeenCalledWith('event-b')
    expect(screen.getByText('Viðburður B')).toBeInTheDocument()
  })
})
