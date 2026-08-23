import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import type {
  PersonSourcePageResult,
  PersonSourceRosterResult,
} from '@/lib/events/person-source.presentation'
import { TeskeidActionSheet } from '@/components/teskeid/TeskeidActionSheet'

const actionMocks = vi.hoisted(() => ({
  loadPage: vi.fn(),
  loadRoster: vi.fn(),
}))

vi.mock('@/lib/events/person-source.actions', () => ({
  loadEventPersonSourcePage: actionMocks.loadPage,
  loadEventPersonSourceRoster: actionMocks.loadRoster,
}))

const messages: Record<string, string> = {
  'sourceLabel': 'Choose source',
  'relationships': 'Relationships',
  'events': 'From event',
  'manual': 'Name or email',
  'relationshipSearchLabel': 'Search relationships',
  'relationshipSearchPlaceholder': 'Name or label',
  'relationshipFilterLabel': 'Filter labels',
  'relationshipAllFilter': 'All',
  'relationshipEmpty': 'No relationship found',
  'relationshipLoadError': 'Relationships failed',
  'manualLabel': 'Name or email',
  'manualPlaceholder': 'Name or email',
  'manualHint': 'Not saved yet',
  'manualSubmit': 'Select manual',
  'manualInvalid': 'Enter a valid value',
  'continue': 'Continue',
  'invalidSelection': 'Selection needs review',
  'clearEventSelection': 'Clear event selection',
  'eventSearchLabel': 'Search events',
  'eventSearchPlaceholder': 'Event name',
  'loadedSearchHint': 'Loaded events only',
  'noLoadedResults': 'No loaded match',
  'noResults': 'No event',
  'directoryLoading': 'Loading events',
  'directoryLoadError': 'Events failed',
  'loadMore': 'Load more',
  'loadingMore': 'Loading more',
  'retry': 'Retry',
  'retrying': 'Retrying',
  'selectedEvent': 'Selected event',
  'backToEvents': 'Back to events',
  'rosterLoading': 'Loading roster',
  'rosterLoadError': 'Roster failed',
  'rosterSearchLabel': 'Search roster',
  'rosterSearchPlaceholder': 'Person name',
  'noPeople': 'No person',
  'selectAll': 'Select all',
  'deselectAll': 'Deselect all',
  'selectedReason': 'Already selected',
  'staleReason': 'Needs revalidation',
  'removedReason': 'Removed',
  'switchBlocked': 'Clear the other event first',
  'transitionLoading': 'Changing view',
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (key === 'selectedCount' || key === 'selectedSummary') return `${values?.count ?? values?.total ?? 0} selected`
    if (key === 'visibleSelectedSummary') return `${values?.selected} of ${values?.visible} visible`
    if (key === 'personCount') return `${values?.count} people`
    if (key === 'personFallback') return `Guest ${values?.position}`
    if (key === 'removeSelection') return `Remove ${values?.name}`
    return messages[key] ?? key
  },
}))

import { TeskeidPersonPicker } from '../TeskeidPersonPicker'

const EVENT_A = '00000000-0000-4000-8000-000000000001'
const EVENT_B = '00000000-0000-4000-8000-000000000002'
const PERSON_A = '10000000-0000-4000-8000-000000000001'
const PERSON_B = '10000000-0000-4000-8000-000000000002'
const PERSON_C = '10000000-0000-4000-8000-000000000003'

function destinationCopy() {
  return {
    triggerLabel: 'Choose people',
    title: 'Choose people',
    description: 'Choose one or more people',
    closeLabel: 'Close picker',
  }
}

function provider(
  page: PersonSourcePageResult,
  rosters: Record<string, PersonSourceRosterResult>,
) {
  return {
    kind: 'cursor-lazy' as const,
    providerKey: 'test-provider',
    loadPage: vi.fn(async () => page),
    loadRoster: vi.fn(async ({ eventId }: { eventId: string }) => rosters[eventId]),
  }
}

const pageResult: PersonSourcePageResult = {
  ok: true,
  data: {
    events: [
      { eventId: EVENT_A, name: 'Event A', rosterRevision: 1, activePersonCount: 2 },
      { eventId: EVENT_B, name: 'Event B', rosterRevision: 1, activePersonCount: 1 },
    ],
    nextCursor: null,
  },
}

const rosterResults: Record<string, PersonSourceRosterResult> = {
  [EVENT_A]: {
    ok: true,
    data: {
      eventId: EVENT_A,
      name: 'Event A',
      rosterRevision: 1,
      people: [
        { personRef: PERSON_A, participantKind: 'organizer', displayName: 'Anna', position: 0, isSelf: true },
        { personRef: PERSON_B, participantKind: 'guest', displayName: null, position: 1, isSelf: false },
      ],
    },
  },
  [EVENT_B]: {
    ok: true,
    data: {
      eventId: EVENT_B,
      name: 'Event B',
      rosterRevision: 1,
      people: [
        { personRef: PERSON_C, participantKind: 'organizer', displayName: 'Cara', position: 0, isSelf: true },
      ],
    },
  },
}

describe('TeskeidPersonPicker', () => {
  beforeEach(() => {
    actionMocks.loadPage.mockReset()
    actionMocks.loadRoster.mockReset()
  })

  it('keeps the canonical source order and preserves a multi-selection across sources until confirmation', async () => {
    const onConfirm = vi.fn()
    render(<TeskeidPersonPicker
      relationships={[
        { relationshipId: 'relationship-a', displayName: 'Alice' },
        { relationshipId: 'relationship-b', displayName: 'Bob' },
      ]}
      mode={{ kind: 'multiple' }}
      destinationCopy={destinationCopy()}
      eventProvider={provider(pageResult, rosterResults)}
      onConfirm={onConfirm}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose people' }))
    expect(screen.getAllByRole('button').filter((button) => (
      ['Relationships', 'From event', 'Name or email'].includes(button.textContent ?? '')
    )).map((button) => button.textContent)).toEqual([
      'Relationships',
      'From event',
      'Name or email',
    ])

    const status = screen.getByRole('status')
    const beforeRelationship = status.firstElementChild
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alice' }))
    expect(status.firstElementChild).not.toBe(beforeRelationship)
    const afterRelationship = status.firstElementChild
    fireEvent.click(screen.getByRole('button', { name: 'Name or email' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name or email' }), {
      target: { value: 'Local guest' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Select manual' }))
    expect(status.firstElementChild).not.toBe(afterRelationship)
    expect(screen.getAllByText('2 selected')).toHaveLength(2)
    expect(onConfirm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Relationships' }))
    expect(screen.getByRole('checkbox', { name: 'Alice' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onConfirm.mock.calls[0][0]).toHaveLength(2)
    expect(onConfirm.mock.calls[0][0].map((selection: { key: { source: string } }) => (
      selection.key.source
    ))).toEqual(['relationship', 'manual'])
  })

  it('discards an unconfirmed session on Escape and starts clean when reopened', () => {
    render(<TeskeidPersonPicker
      relationships={[{ relationshipId: 'relationship-a', displayName: 'Alice' }]}
      mode={{ kind: 'multiple' }}
      destinationCopy={destinationCopy()}
      eventProvider={provider(pageResult, rosterResults)}
      onConfirm={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose people' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alice' }))
    expect(screen.getAllByText('1 selected')).toHaveLength(2)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Choose people' }))
    expect(screen.getByRole('checkbox', { name: 'Alice' })).not.toBeChecked()
    expect(screen.getByText('0 selected')).toBeInTheDocument()
  })

  it('uses a native radio for confirmed single choice', () => {
    render(<TeskeidPersonPicker
      relationships={[
        { relationshipId: 'relationship-a', displayName: 'Alice' },
        { relationshipId: 'relationship-b', displayName: 'Bob' },
      ]}
      mode={{ kind: 'single', presentation: 'confirm' }}
      destinationCopy={destinationCopy()}
      eventProvider={provider(pageResult, rosterResults)}
      onConfirm={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose people' }))
    const radio = screen.getByRole('radio', { name: 'Alice' })
    fireEvent.click(radio)
    expect(radio).toBeChecked()
    const status = screen.getByRole('status')
    const firstMessageNode = status.firstElementChild
    fireEvent.click(screen.getByRole('radio', { name: 'Bob' }))
    expect(screen.getByRole('radio', { name: 'Bob' })).toBeChecked()
    expect(status).toHaveTextContent('1 selected')
    expect(status.firstElementChild).not.toBe(firstMessageNode)
    expect(screen.queryByRole('checkbox', { name: /Select all/ })).not.toBeInTheDocument()
  })

  it('closes before delivering a close-on-select snapshot to the next sheet', async () => {
    function Harness() {
      const [nextOpen, setNextOpen] = React.useState(false)
      const triggerRef = React.useRef<HTMLButtonElement>(null)
      return <>
        <TeskeidPersonPicker
          relationships={[{ relationshipId: 'relationship-a', displayName: 'Alice' }]}
          mode={{ kind: 'single', presentation: 'close-on-select' }}
          destinationCopy={destinationCopy()}
          eventProvider={provider(pageResult, rosterResults)}
          triggerRef={triggerRef}
          onConfirm={() => setNextOpen(true)}
        />
        <TeskeidActionSheet
          open={nextOpen}
          onOpenChange={setNextOpen}
          title="Destination confirmation"
          description="Confirm destination"
          closeLabel="Close destination"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            triggerRef.current?.focus()
          }}
        >
          <button type="button">Confirm destination</button>
        </TeskeidActionSheet>
      </>
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose people' }))
    fireEvent.click(screen.getByRole('button', { name: /Alice/ }))
    await screen.findByRole('dialog', { name: 'Destination confirmation' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close destination' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose people' })).toHaveFocus())
  })

  it('selects across Events when allowed and never exposes the null-label source', async () => {
    const onConfirm = vi.fn()
    render(<TeskeidPersonPicker
      relationships={[]}
      mode={{ kind: 'multiple' }}
      crossEventPolicy={{ kind: 'allow' }}
      initialSourceId="events"
      destinationCopy={destinationCopy()}
      eventProvider={provider(pageResult, rosterResults)}
      onConfirm={onConfirm}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose people' }))
    fireEvent.click(await screen.findByRole('button', { name: /Event A/ }))
    const status = screen.getByRole('status')
    const beforeBulk = status.firstElementChild
    fireEvent.click(await screen.findByRole('checkbox', { name: /Select all/ }))
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(status.firstElementChild).not.toBe(beforeBulk)
    expect(screen.getAllByText('Guest 2')).toHaveLength(2)
    expect(document.body.textContent).not.toContain('manual_email')
    fireEvent.click(screen.getByRole('button', { name: 'Back to events' }))
    fireEvent.click(screen.getByRole('button', { name: /Event B/ }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Cara' }))
    expect(screen.getAllByText('3 selected').length).toBeGreaterThanOrEqual(2)
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
    expect(onConfirm.mock.calls[0][0]).toHaveLength(3)
  })

  it('blocks a second Event under single-event policy until the explicit clear action is used', async () => {
    render(<TeskeidPersonPicker
      relationships={[]}
      mode={{ kind: 'multiple' }}
      crossEventPolicy={{ kind: 'single-event', switchBehavior: 'block-until-clear' }}
      initialSourceId="events"
      destinationCopy={destinationCopy()}
      eventProvider={provider(pageResult, rosterResults)}
      onConfirm={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose people' }))
    fireEvent.click(await screen.findByRole('button', { name: /Event A/ }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Anna' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to events' }))
    const blockedEvent = screen.getByRole('button', { name: /Event B/ })
    expect(blockedEvent).toHaveAttribute('aria-disabled', 'true')
    const reasonId = blockedEvent.getAttribute('aria-describedby')
    expect(reasonId).toBeTruthy()
    expect(document.getElementById(reasonId!)).toHaveTextContent('Clear the other event first')
    fireEvent.click(blockedEvent)
    expect(screen.getByRole('alert')).toHaveTextContent('Clear the other event first')
    expect(screen.queryByRole('textbox', { name: 'Search roster' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear event selection' }))
    fireEvent.click(screen.getByRole('button', { name: /Event B/ }))
    expect(await screen.findByRole('textbox', { name: 'Search roster' })).toBeInTheDocument()
  })

  it('fails closed for a missing staged Event ref and restores only the exact ref after retry', async () => {
    const loadRoster = vi.fn()
      .mockResolvedValueOnce({ ok: false as const, error: 'not_found' as const })
      .mockResolvedValueOnce(rosterResults[EVENT_A])
    const eventProvider = {
      kind: 'cursor-lazy' as const,
      providerKey: 'missing-then-restored',
      loadPage: vi.fn(async () => pageResult),
      loadRoster,
    }

    render(<TeskeidPersonPicker
      relationships={[]}
      mode={{ kind: 'multiple' }}
      initialSelections={[{
        key: { source: 'event', eventId: EVENT_A, personRef: PERSON_A },
        selectedRosterRevision: 1,
        safeDisplayName: 'Anna',
        participantKind: 'organizer',
        position: 0,
        state: 'valid',
      }]}
      initialSourceId="events"
      destinationCopy={destinationCopy()}
      eventProvider={eventProvider}
      onConfirm={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose people' }))
    expect(screen.getByText('Needs revalidation')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()

    fireEvent.click(await screen.findByRole('button', { name: /Event A/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Roster failed')
    await waitFor(() => expect(screen.getByText('Removed')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('checkbox', { name: 'Anna' })).toBeChecked()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled())
    expect(loadRoster).toHaveBeenCalledTimes(2)
  })

  it('marks a staged Event removed only after a terminal exact directory omits it', async () => {
    render(<TeskeidPersonPicker
      relationships={[]}
      mode={{ kind: 'multiple' }}
      initialSelections={[{
        key: { source: 'event', eventId: EVENT_B, personRef: PERSON_C },
        selectedRosterRevision: 1,
        safeDisplayName: 'Cara',
        participantKind: 'organizer',
        position: 0,
        state: 'valid',
      }]}
      initialSourceId="events"
      destinationCopy={destinationCopy()}
      eventProvider={provider({
        ok: true,
        data: {
          events: [{
            eventId: EVENT_A,
            name: 'Event A',
            rosterRevision: 1,
            activePersonCount: 2,
          }],
          nextCursor: null,
        },
      }, rosterResults)}
      onConfirm={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose people' }))
    await screen.findByRole('button', { name: /Event A/ })
    await waitFor(() => expect(screen.getByText('Removed')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  it('invalidates confirmed Event refs when the provider authority changes', async () => {
    const firstProvider = provider(pageResult, rosterResults)
    const pendingPage = new Promise<PersonSourcePageResult>(() => {})
    const secondProvider = {
      kind: 'cursor-lazy' as const,
      providerKey: 'replacement-provider',
      loadPage: vi.fn(() => pendingPage),
      loadRoster: vi.fn(() => new Promise<PersonSourceRosterResult>(() => {})),
    }
    const props = {
      relationships: [],
      mode: { kind: 'multiple' as const },
      initialSelections: [{
        key: { source: 'event' as const, eventId: EVENT_A, personRef: PERSON_A },
        selectedRosterRevision: 1,
        safeDisplayName: 'Anna',
        participantKind: 'organizer' as const,
        position: 0,
        state: 'valid' as const,
      }],
      initialSourceId: 'events' as const,
      destinationCopy: destinationCopy(),
      onConfirm: vi.fn(),
    }
    const { rerender } = render(<TeskeidPersonPicker {...props} eventProvider={firstProvider} />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose people' }))
    fireEvent.click(await screen.findByRole('button', { name: /Event A/ }))
    await screen.findByRole('checkbox', { name: 'Anna' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled())

    rerender(<TeskeidPersonPicker {...props} eventProvider={secondProvider} />)
    await waitFor(() => expect(screen.getByText('Needs revalidation')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })
})
