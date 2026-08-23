import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import type { EventExpenseSourceView } from '@/lib/events/contracts'
import type { LegacyExpenseEventSourceV2 } from '@/lib/events/legacy-expense-event-source-v2.contracts'

const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerMocks.refresh }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === 'personFallback') return `Gestur ${values?.position}`
    if (key === 'personCount') return `${values?.count} aðilar`
    if (key === 'selectedSummary') return `${values?.total} valdir`
    if (key === 'visibleSelectedSummary') return `${values?.selected} af ${values?.visible}`
    if (key === 'nameMissing') return 'Nafn vantar'
    return ({
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
    'tags.friends': 'Vinir',
    }[key] ?? key)
  },
}))

import {
  classifyManualExpenseParticipant,
  ExpenseParticipantPicker,
} from '../ExpenseParticipantPicker'

describe('unified expense participant input', () => {
  beforeEach(() => {
    routerMocks.refresh.mockReset()
  })

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
    const onAddEventGuest = vi.fn((
      _event: EventExpenseSourceView,
      _guest: EventExpenseSourceView['guests'][number],
    ) => ({ accepted: true as const }))

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
    expect(screen.queryByText('0 valdir')).not.toBeInTheDocument()

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

  it('falls back to the exact ready directory when a selected Event no longer resolves', () => {
    const event: EventExpenseSourceView = {
      id: 'event-1',
      name: 'Sumarferð',
      rosterRevision: 3,
      guests: [],
    }
    render(React.createElement(ExpenseParticipantPicker, {
      options: [],
      eventSources: [event],
      selectedEventId: 'missing-event',
      selectedEventGuestIds: [],
      initialSourceId: 'event',
      onSelectEvent: vi.fn(() => ({ accepted: true as const })),
      onClearEvent: vi.fn(),
      onAddEventGuest: vi.fn(() => ({ accepted: true as const })),
      onAddKnown: vi.fn(() => true),
      onAddManual: vi.fn(() => true),
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    expect(screen.getByRole('textbox', { name: 'Leita að viðburði' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sumarferð/ })).toBeInTheDocument()
    expect(screen.queryByText('rosterLoading')).not.toBeInTheDocument()
  })

  it('shows the exact directory error when a failed source cannot resolve the selected Event', () => {
    render(React.createElement(ExpenseParticipantPicker, {
      options: [],
      eventSources: [],
      eventSourcesError: true,
      selectedEventId: 'missing-event',
      selectedEventGuestIds: [],
      initialSourceId: 'event',
      onSelectEvent: vi.fn(() => ({ accepted: true as const })),
      onClearEvent: vi.fn(),
      onAddEventGuest: vi.fn(() => ({ accepted: true as const })),
      onAddKnown: vi.fn(() => true),
      onAddManual: vi.fn(() => true),
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Ekki tókst að sækja viðburði')
    fireEvent.click(screen.getByRole('button', { name: 'Reyna aftur' }))
    expect(routerMocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('keeps duplicate rows unavailable and preserves attendee organizer legacy identity', () => {
    const event: EventExpenseSourceView = {
      id: 'event-1',
      name: 'Sumarferð',
      rosterRevision: 3,
      viewerRole: 'attendee',
      guests: [{
        id: 'legacy-organizer-ref',
        displayName: 'Skipuleggjandi',
        sourceKind: 'relationship',
        participantKind: 'organizer',
      }],
    }
    const onAddEventGuest = vi.fn(() => ({ accepted: true as const }))
    const { rerender } = render(React.createElement(ExpenseParticipantPicker, {
      options: [],
      eventSources: [event],
      selectedEventId: event.id,
      selectedEventGuestIds: ['legacy-organizer-ref'],
      initialSourceId: 'event',
      onSelectEvent: vi.fn(() => ({ accepted: true as const })),
      onClearEvent: vi.fn(),
      onAddEventGuest,
      onAddKnown: vi.fn(() => true),
      onAddManual: vi.fn(() => true),
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    expect(screen.getByRole('button', { name: 'Skipuleggjandi' })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Skipuleggjandi' }))
    expect(onAddEventGuest).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Loka vali' }))

    rerender(React.createElement(ExpenseParticipantPicker, {
      options: [],
      eventSources: [event],
      selectedEventId: event.id,
      selectedEventGuestIds: [],
      initialSourceId: 'event',
      onSelectEvent: vi.fn(() => ({ accepted: true as const })),
      onClearEvent: vi.fn(),
      onAddEventGuest,
      onAddKnown: vi.fn(() => true),
      onAddManual: vi.fn(() => true),
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skipuleggjandi' }))
    expect(onAddEventGuest).toHaveBeenCalledWith(event, event.guests[0])
  })

  it('keeps a rejected add open with a bounded error and never clears on Escape', () => {
    const event: EventExpenseSourceView = {
      id: 'event-1',
      name: 'Sumarferð',
      rosterRevision: 3,
      guests: [{ id: 'guest-1', displayName: 'Anna', sourceKind: 'manual_name' }],
    }
    const onClearEvent = vi.fn()
    const onAddEventGuest = vi.fn(() => ({
      accepted: false as const,
      error: 'Ekki hægt að bæta við',
    }))
    render(React.createElement(ExpenseParticipantPicker, {
      options: [],
      eventSources: [event],
      selectedEventId: event.id,
      selectedEventGuestIds: [],
      initialSourceId: 'event',
      onSelectEvent: vi.fn(() => ({ accepted: true as const })),
      onClearEvent,
      onAddEventGuest,
      onAddKnown: vi.fn(() => true),
      onAddManual: vi.fn(() => true),
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Ekki hægt að bæta við')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onAddEventGuest).toHaveBeenCalledTimes(1)
    expect(onClearEvent).not.toHaveBeenCalled()
  })

  it('keeps an accepted immediate add after Escape and prevents a duplicate on reopen', () => {
    const event: EventExpenseSourceView = {
      id: 'event-1',
      name: 'Sumarferð',
      rosterRevision: 3,
      guests: [{ id: 'guest-1', displayName: 'Anna', sourceKind: 'manual_name' }],
    }
    const onAddEventGuest = vi.fn()
    const onClearEvent = vi.fn()

    function Harness() {
      const [selectedIds, setSelectedIds] = React.useState<string[]>([])
      return React.createElement(ExpenseParticipantPicker, {
        options: [],
        eventSources: [event],
        selectedEventId: event.id,
        selectedEventGuestIds: selectedIds,
        initialSourceId: 'event',
        onSelectEvent: vi.fn(() => ({ accepted: true as const })),
        onClearEvent,
        onAddEventGuest: (
          selectedEvent: EventExpenseSourceView,
          guest: EventExpenseSourceView['guests'][number],
        ) => {
          onAddEventGuest(selectedEvent, guest)
          setSelectedIds((current) => [...current, guest.id])
          return { accepted: true as const }
        },
        onAddKnown: vi.fn(() => true),
        onAddManual: vi.fn(() => true),
      })
    }

    render(React.createElement(Harness))
    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    expect(screen.getByRole('button', { name: 'Anna' })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    expect(screen.getByRole('button', { name: 'Anna' })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Anna' }))
    expect(onAddEventGuest).toHaveBeenCalledTimes(1)
    expect(onAddEventGuest).toHaveBeenCalledWith(event, event.guests[0])
    expect(onClearEvent).not.toHaveBeenCalled()
  })

  it('hardens a legacy manual-email label before the shared Event browser renders it', () => {
    const event: EventExpenseSourceView = {
      id: 'event-1',
      name: 'Sumarferð',
      rosterRevision: 3,
      guests: [{
        id: 'guest-1',
        displayName: 'private@example.com',
        sourceKind: 'manual_email',
      }],
    }
    const onAddEventGuest = vi.fn(() => ({ accepted: true as const }))
    render(React.createElement(ExpenseParticipantPicker, {
      options: [],
      eventSources: [event],
      selectedEventId: event.id,
      selectedEventGuestIds: [],
      initialSourceId: 'event',
      onSelectEvent: vi.fn(() => ({ accepted: true as const })),
      onClearEvent: vi.fn(),
      onAddEventGuest,
      onAddKnown: vi.fn(() => true),
      onAddManual: vi.fn(() => true),
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    expect(screen.queryByText('private@example.com')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Gestur 1/ })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('manual_email')
    fireEvent.change(screen.getByRole('textbox', { name: 'Leita að gesti' }), {
      target: { value: 'private@example.com' },
    })
    expect(screen.getByText('Enginn gestur fannst')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('private@example.com')
    fireEvent.change(screen.getByRole('textbox', { name: 'Leita að gesti' }), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Gestur 1/ }))
    expect(onAddEventGuest).toHaveBeenCalledWith(event, event.guests[0])
  })

  it('uses SQL149 labels for display while activating the exact unchanged legacy Expense ref', () => {
    const event: EventExpenseSourceView = {
      id: '20000000-0000-4000-8000-000000000001',
      name: 'Landsmót',
      rosterRevision: 9,
      viewerRole: 'owner',
      guests: [{
        id: '30000000-0000-4000-8000-000000000001',
        displayName: 'private@example.is',
        sourceKind: 'manual_email',
      }],
    }
    const presentation: LegacyExpenseEventSourceV2 = {
      eventId: event.id,
      name: event.name,
      rosterRevision: '9',
      viewerRole: 'owner',
      people: [{
        legacyPersonRef: event.guests[0]!.id,
        participantKind: 'guest',
        position: 0,
        shared: {
          accessState: 'active',
          labelState: 'resolved',
          displayName: 'Anna Jónsdóttir',
          selectable: true,
          disabledReason: null,
        },
        viewerPrivate: {
          kind: 'relationship',
          alias: 'Mín Anna',
          email: 'anna@example.is',
          builtInTags: ['friends'],
          customLabels: ['Golf'],
          hiddenCustomLabelCount: 0,
          note: 'Hittumst í klúbbnum',
        },
      }],
    }
    const onAddEventGuest = vi.fn((
      _event: EventExpenseSourceView,
      _guest: EventExpenseSourceView['guests'][number],
    ) => ({ accepted: true as const }))
    render(React.createElement(ExpenseParticipantPicker, {
      options: [],
      eventSources: [event],
      eventSourcePresentation: [presentation],
      selectedEventId: event.id,
      selectedEventGuestIds: [],
      initialSourceId: 'event',
      onSelectEvent: vi.fn(() => ({ accepted: true as const })),
      onClearEvent: vi.fn(),
      onAddEventGuest,
      onAddKnown: vi.fn(() => true),
      onAddManual: vi.fn(() => true),
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    expect(screen.getByText('Mín Anna')).toBeInTheDocument()
    expect(screen.getByText('Anna Jónsdóttir')).toBeInTheDocument()
    expect(screen.getByText('anna@example.is')).toBeInTheDocument()
    expect(screen.queryByText('private@example.is')).not.toBeInTheDocument()
    expect(screen.getByText('Vinir')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mín Anna' }))
    expect(onAddEventGuest).toHaveBeenCalledWith(event, event.guests[0])
    expect(onAddEventGuest.mock.calls[0]![1].id).toBe(presentation.people[0]!.legacyPersonRef)
  })

  it('shows an unresolved SQL149 guest as Nafn vantar and keeps the exact legacy row nonselectable', () => {
    const event: EventExpenseSourceView = {
      id: '20000000-0000-4000-8000-000000000001', name: 'Landsmót', rosterRevision: 9,
      viewerRole: 'owner',
      guests: [{
        id: '30000000-0000-4000-8000-000000000001',
        displayName: 'legacy@example.is', sourceKind: 'manual_email',
      }],
    }
    const presentation: LegacyExpenseEventSourceV2 = {
      eventId: event.id, name: event.name, rosterRevision: '9', viewerRole: 'owner',
      people: [{
        legacyPersonRef: event.guests[0]!.id, participantKind: 'guest', position: 0,
        shared: {
          accessState: 'active', labelState: 'needs_owner_input', displayName: null,
          selectable: false, disabledReason: 'name_required',
        },
      }],
    }
    const onAddEventGuest = vi.fn()
    render(React.createElement(ExpenseParticipantPicker, {
      options: [], eventSources: [event], eventSourcePresentation: [presentation],
      selectedEventId: event.id, selectedEventGuestIds: [], initialSourceId: 'event',
      onSelectEvent: vi.fn(() => ({ accepted: true as const })), onClearEvent: vi.fn(),
      onAddEventGuest, onAddKnown: vi.fn(() => true), onAddManual: vi.fn(() => true),
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Bæta við þátttakanda' }))
    const row = screen.getByRole('button', { name: 'Nafn vantar' })
    expect(row).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByText('legacy@example.is')).not.toBeInTheDocument()
    fireEvent.click(row)
    expect(onAddEventGuest).not.toHaveBeenCalled()
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
