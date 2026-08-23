import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EventGuestBrowser,
  type EagerEventGuestBrowserEvent,
  type EventGuestBrowserCopy,
} from '../EventGuestBrowser'
import { serializePersonSelectionKey, type EventPersonSelectionKey } from '@/components/people/person-selection-state'
import type {
  PersonSourcePageResult,
  PersonSourceRosterResult,
} from '@/lib/events/person-source.presentation'

const eventId = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const personId = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, '0')}`

const copy: EventGuestBrowserCopy = {
  eventSearchLabel: 'Search events',
  eventSearchPlaceholder: 'Event name',
  loadedSearchHint: 'Only loaded events are searched',
  noLoadedResults: 'No loaded match; load more',
  noResults: 'No event found',
  directoryLoading: 'Loading events',
  directoryLoadError: 'Events failed',
  loadMore: 'Load more',
  loadingMore: 'Loading more',
  retry: 'Retry',
  retrying: 'Retrying',
  selectedEvent: 'Selected event',
  backToEvents: 'Back to events',
  rosterLoading: 'Loading roster',
  rosterLoadError: 'Roster failed',
  rosterSearchLabel: 'Search roster',
  rosterSearchPlaceholder: 'Person name',
  noPeople: 'No person found',
  personFallback: (position) => `Guest ${position}`,
  personCount: (count) => `${count} people`,
  selectAll: 'Select all',
  deselectAll: 'Deselect all',
  selectedSummary: (total) => `${total} total selected`,
  visibleSelectedSummary: (selected, visible) => `${selected} of ${visible} visible`,
  selectedReason: 'Already selected',
  staleReason: 'Needs revalidation',
  removedReason: 'Removed',
  transitionLoading: 'Changing view',
}

function eagerEvent(id: number, name = `Event ${id}`): EagerEventGuestBrowserEvent {
  return {
    eventId: eventId(id),
    name,
    rosterRevision: 1,
    activePersonCount: 2,
    people: [
      {
        personRef: personId(id * 10),
        participantKind: 'organizer',
        displayName: `Organizer ${id}`,
        position: 0,
        isSelf: true,
      },
      {
        personRef: personId(id * 10 + 1),
        participantKind: 'guest',
        displayName: `Guest name ${id}`,
        position: 1,
        isSelf: false,
      },
    ],
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('EventGuestBrowser', () => {
  it('keeps generic and client import boundaries free of destination and server authority', () => {
    const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
    const primitive = read('components/tengsl/RelationshipPartyPicker.tsx')
    const browser = read('components/events/EventGuestBrowser.tsx')
    const canonical = read('components/people/TeskeidPersonPicker.tsx')
    const compatibility = read('components/expenses/ExpenseEventParticipantSource.tsx')

    expect(primitive).not.toMatch(/components\/events|lib\/events|components\/expenses|lib\/expenses/)
    expect(browser).not.toMatch(/components\/expenses|lib\/expenses|supabase|repository\.server/)
    expect(browser).not.toContain('max-h-[40dvh]')
    expect(browser).not.toContain('overflow-y-auto')
    expect(canonical).not.toMatch(/components\/expenses|lib\/expenses|supabase|repository\.server/)
    expect(canonical).not.toContain("kind: 'bounded-eager'")
    expect(compatibility).toContain("kind: 'bounded-eager'")
  })

  it('keeps bounded eager search complete, moves focus deterministically and retains command semantics', async () => {
    const events = Array.from({ length: 100 }, (_, index) => eagerEvent(index + 1))
    const activate = vi.fn(() => ({ accepted: true as const }))

    render(<EventGuestBrowser
      provider={{
        kind: 'bounded-eager',
        providerKey: 'legacy',
        events,
        loadState: { kind: 'ready' },
      }}
      interaction={{ kind: 'command', completedKeys: new Set(), activate }}
      copy={copy}
      totalSelectedCount={0}
    />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Search events' }), {
      target: { value: 'Event 100' },
    })
    const eventButton = screen.getByRole('button', { name: /Event 100/ })
    fireEvent.click(eventButton)
    expect(screen.getByRole('textbox', { name: 'Search roster' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: /Guest name 100/ }))
    expect(activate).toHaveBeenCalledWith({
      source: 'event',
      eventId: eventId(100),
      personRef: personId(1001),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Back to events' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Event 100/ })).toHaveFocus())
  })

  it('hides the unclassified fallback while preserving real Event labels', () => {
    const event = eagerEvent(1)
    event.people[1] = {
      ...event.people[1]!,
      builtInTags: ['unclassified'],
      customLabels: ['prófunarlabel'],
    }

    render(<EventGuestBrowser
      provider={{
        kind: 'bounded-eager',
        providerKey: 'labels',
        events: [event],
        loadState: { kind: 'ready' },
      }}
      interaction={{ kind: 'command', completedKeys: new Set(), activate: () => ({ accepted: true }) }}
      copy={{
        ...copy,
        builtInTagLabel: (tag) => tag === 'unclassified' ? 'Óflokkað' : tag,
      }}
      initialEventId={event.eventId}
      totalSelectedCount={0}
    />)

    expect(screen.queryByText('Óflokkað')).not.toBeInTheDocument()
    expect(screen.getByText('prófunarlabel')).toBeInTheDocument()
  })

  it('distinguishes an empty directory from an error and keeps a pinned event browsable', () => {
    const retry = vi.fn()
    const event = eagerEvent(1)
    const { rerender } = render(<EventGuestBrowser
      provider={{
        kind: 'bounded-eager',
        providerKey: 'error',
        events: [],
        loadState: { kind: 'error', retry },
      }}
      interaction={{ kind: 'command', completedKeys: new Set(), activate: () => ({ accepted: true }) }}
      copy={copy}
      totalSelectedCount={0}
    />)
    expect(screen.getByRole('alert')).toHaveTextContent('Events failed')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledTimes(1)

    rerender(<EventGuestBrowser
      provider={{
        kind: 'bounded-eager',
        providerKey: 'error-with-pinned',
        events: [event],
        loadState: { kind: 'error', retry },
      }}
      interaction={{ kind: 'command', completedKeys: new Set(), activate: () => ({ accepted: true }) }}
      copy={copy}
      initialEventId={event.eventId}
      totalSelectedCount={0}
    />)
    expect(screen.getByRole('textbox', { name: 'Search roster' })).toBeInTheDocument()
    expect(screen.queryByText('Events failed')).not.toBeInTheDocument()
  })

  it('uses native multi-select semantics and exact empty/all-disabled master state', () => {
    const event = eagerEvent(1)

    function Harness({ disableAll = false }: { disableAll?: boolean }) {
      const [selected, setSelected] = React.useState<Set<string>>(new Set())
      const toggle = (key: EventPersonSelectionKey) => {
        const serialized = serializePersonSelectionKey(key)
        setSelected((current) => {
          const next = new Set(current)
          if (next.has(serialized)) next.delete(serialized)
          else next.add(serialized)
          return next
        })
      }
      return <EventGuestBrowser
        provider={{
          kind: 'bounded-eager',
          providerKey: disableAll ? 'disabled' : 'multi',
          events: [event],
          loadState: { kind: 'ready' },
        }}
        interaction={{
          kind: 'multiple-choice',
          selectedKeys: selected,
          bulkControls: true,
          toggle,
          selectVisible: (keys) => setSelected((current) => new Set([
            ...current,
            ...keys.map(serializePersonSelectionKey),
          ])),
          deselectVisible: (keys) => setSelected((current) => {
            const next = new Set(current)
            keys.forEach((key) => next.delete(serializePersonSelectionKey(key)))
            return next
          }),
        }}
        copy={copy}
        initialEventId={event.eventId}
        totalSelectedCount={selected.size}
        getDisabledReason={disableAll ? () => 'Unavailable' : undefined}
      />
    }

    const { rerender } = render(<Harness />)
    const master = screen.getByRole('checkbox', { name: /Select all/ }) as HTMLInputElement
    expect(master.checked).toBe(false)
    expect(master.indeterminate).toBe(false)
    fireEvent.click(screen.getByRole('checkbox', { name: /Organizer 1/ }))
    expect(master.indeterminate).toBe(true)
    expect(master).toHaveAccessibleName(/Select all/)
    fireEvent.click(master)
    expect(master.checked).toBe(true)
    expect(master.indeterminate).toBe(false)
    expect(master).toHaveAccessibleName(/Deselect all/)

    rerender(<Harness disableAll />)
    const disabledMaster = screen.getByRole('checkbox', { name: /Select all/ }) as HTMLInputElement
    expect(disabledMaster).toBeDisabled()
    expect(disabledMaster.checked).toBe(false)
    expect(disabledMaster.indeterminate).toBe(false)
  })

  it('replaces the accessible fallback announcement node for equal-count radio changes', () => {
    const event = eagerEvent(1)

    function Harness() {
      const [selectedKey, setSelectedKey] = React.useState<string | null>(null)
      return <EventGuestBrowser
        provider={{
          kind: 'bounded-eager',
          providerKey: 'single-announcement',
          events: [event],
          loadState: { kind: 'ready' },
        }}
        interaction={{
          kind: 'single-choice',
          selectedKey,
          toggle: (key) => setSelectedKey(serializePersonSelectionKey(key)),
        }}
        copy={copy}
        initialEventId={event.eventId}
        totalSelectedCount={selectedKey === null ? 0 : 1}
      />
    }

    render(<Harness />)
    const status = screen.getByRole('status')
    fireEvent.click(screen.getByRole('radio', { name: 'Organizer 1' }))
    const firstMessageNode = status.firstElementChild
    expect(status).toHaveTextContent('1 total selected')
    fireEvent.click(screen.getByRole('radio', { name: 'Guest name 1' }))
    expect(status).toHaveTextContent('1 total selected')
    expect(status.firstElementChild).not.toBe(firstMessageNode)
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('loads cursor pages and ignores an obsolete roster response after navigation changes', async () => {
    const eventA = eagerEvent(1, 'Event A')
    const eventB = eagerEvent(2, 'Event B')
    const rosterA = deferred<PersonSourceRosterResult>()
    const rosterB = deferred<PersonSourceRosterResult>()
    const loadRoster = vi.fn(({ eventId: requestedId }: { eventId: string }) => (
      requestedId === eventA.eventId ? rosterA.promise : rosterB.promise
    ))
    const loadPage = vi.fn(async () => ({
      ok: true as const,
      data: {
        events: [eventA, eventB].map(({ people: _people, ...event }) => event),
        nextCursor: null,
      },
    }))

    render(<EventGuestBrowser
      provider={{ kind: 'cursor-lazy', providerKey: 'cursor', loadPage, loadRoster }}
      interaction={{ kind: 'command', completedKeys: new Set(), activate: () => ({ accepted: true }) }}
      copy={copy}
      totalSelectedCount={0}
    />)

    await screen.findByRole('button', { name: /Event A/ })
    fireEvent.click(screen.getByRole('button', { name: /Event A/ }))
    const focusBridge = screen.getAllByText('Loading roster').find((node) => (
      !node.classList.contains('sr-only')
    ))
    expect(focusBridge).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Back to events' }))
    fireEvent.click(screen.getByRole('button', { name: /Event B/ }))

    await act(async () => {
      rosterA.resolve({ ok: true, data: {
        eventId: eventA.eventId,
        name: eventA.name,
        rosterRevision: 1,
        people: eventA.people,
      } })
      await rosterA.promise
    })
    expect(screen.queryByText('Guest name 1')).not.toBeInTheDocument()

    await act(async () => {
      rosterB.resolve({ ok: true, data: {
        eventId: eventB.eventId,
        name: eventB.name,
        rosterRevision: 1,
        people: eventB.people,
      } })
      await rosterB.promise
    })
    expect(await screen.findByText('Guest name 2')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Search roster' })).toHaveFocus()
  })

  it('searches loaded cursor pages only and exposes a nonterminal empty state', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => eagerEvent(index + 1))
    const laterEvent = eagerEvent(21, 'Hidden until loaded')
    const loadPage = vi.fn(async ({ cursor }: { cursor: unknown }) => cursor === null
      ? {
          ok: true as const,
          data: {
            events: firstPage.map(({ people: _people, ...event }) => event),
            nextCursor: {
              beforeSortAt: '2026-08-21T10:00:00+00:00',
              beforeEventId: firstPage[19].eventId,
            },
          },
        }
      : {
          ok: true as const,
          data: {
            events: [{ ...laterEvent, people: undefined }].map(({ people: _people, ...event }) => event),
            nextCursor: null,
          },
        })

    render(<EventGuestBrowser
      provider={{
        kind: 'cursor-lazy',
        providerKey: 'pages',
        loadPage,
        loadRoster: vi.fn(),
      }}
      interaction={{ kind: 'command', completedKeys: new Set(), activate: () => ({ accepted: true }) }}
      copy={copy}
      totalSelectedCount={0}
    />)
    await screen.findByRole('button', { name: /Event 20/ })
    fireEvent.change(screen.getByRole('textbox', { name: 'Search events' }), {
      target: { value: 'Hidden until loaded' },
    })
    expect(screen.getByText('No loaded match; load more')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByRole('button', { name: /Hidden until loaded/ })).toBeInTheDocument()
    expect(loadPage).toHaveBeenCalledTimes(2)
  })

  it('keeps a focused cursor retry control mounted and moves focus only after success', async () => {
    const retryResult = deferred<PersonSourcePageResult>()
    const loadPage = vi.fn()
      .mockResolvedValueOnce({ ok: false as const, error: 'load_failed' as const })
      .mockImplementationOnce(() => retryResult.promise)

    render(<EventGuestBrowser
      provider={{
        kind: 'cursor-lazy',
        providerKey: 'retry-page',
        loadPage,
        loadRoster: vi.fn(),
      }}
      interaction={{ kind: 'command', completedKeys: new Set(), activate: () => ({ accepted: true }) }}
      copy={copy}
      totalSelectedCount={0}
    />)

    const retry = await screen.findByRole('button', { name: 'Retry' })
    retry.focus()
    fireEvent.click(retry)
    expect(retry).toHaveFocus()
    expect(retry).toHaveAttribute('aria-disabled', 'true')

    await act(async () => {
      retryResult.resolve({
        ok: true,
        data: {
          events: [{ ...eagerEvent(1), people: undefined }]
            .map(({ people: _people, ...event }) => event),
          nextCursor: null,
        },
      })
      await retryResult.promise
    })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Search events' })).toHaveFocus())
  })

  it('keeps page and roster request channels independent for an initially pinned Event', async () => {
    const event = eagerEvent(1, 'Pinned Event')
    const pageRequest = deferred<PersonSourcePageResult>()
    const rosterRequest = deferred<PersonSourceRosterResult>()

    render(<EventGuestBrowser
      provider={{
        kind: 'cursor-lazy',
        providerKey: 'parallel-channels',
        loadPage: vi.fn(() => pageRequest.promise),
        loadRoster: vi.fn(() => rosterRequest.promise),
      }}
      interaction={{ kind: 'command', completedKeys: new Set(), activate: () => ({ accepted: true }) }}
      copy={copy}
      initialEventId={event.eventId}
      totalSelectedCount={0}
    />)

    await act(async () => {
      rosterRequest.resolve({
        ok: true,
        data: {
          eventId: event.eventId,
          name: event.name,
          rosterRevision: event.rosterRevision,
          people: event.people,
        },
      })
      pageRequest.resolve({
        ok: true,
        data: {
          events: [{
            eventId: event.eventId,
            name: event.name,
            rosterRevision: event.rosterRevision,
            activePersonCount: event.activePersonCount,
          }],
          nextCursor: null,
        },
      })
      await Promise.all([rosterRequest.promise, pageRequest.promise])
    })

    expect(await screen.findByRole('textbox', { name: 'Search roster' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to events' }))
    expect(await screen.findByRole('button', { name: /Pinned Event/ })).toBeInTheDocument()
  })

  it('suppresses late page and roster callbacks after the browser unmounts', async () => {
    const event = eagerEvent(1)
    const pageRequest = deferred<PersonSourcePageResult>()
    const rosterRequest = deferred<PersonSourceRosterResult>()
    const onEventsObserved = vi.fn()
    const onDirectoryComplete = vi.fn()
    const onRosterObserved = vi.fn()
    const onRosterUnavailable = vi.fn()
    const { unmount } = render(<EventGuestBrowser
      provider={{
        kind: 'cursor-lazy',
        providerKey: 'unmount-boundary',
        loadPage: vi.fn(() => pageRequest.promise),
        loadRoster: vi.fn(() => rosterRequest.promise),
      }}
      interaction={{ kind: 'command', completedKeys: new Set(), activate: () => ({ accepted: true }) }}
      copy={copy}
      initialEventId={event.eventId}
      totalSelectedCount={0}
      onEventsObserved={onEventsObserved}
      onDirectoryComplete={onDirectoryComplete}
      onRosterObserved={onRosterObserved}
      onRosterUnavailable={onRosterUnavailable}
    />)

    unmount()
    await act(async () => {
      pageRequest.resolve({ ok: true, data: { events: [], nextCursor: null } })
      rosterRequest.resolve({ ok: false, error: 'not_found' })
      await Promise.all([pageRequest.promise, rosterRequest.promise])
    })

    expect(onEventsObserved).not.toHaveBeenCalled()
    expect(onDirectoryComplete).not.toHaveBeenCalled()
    expect(onRosterObserved).not.toHaveBeenCalled()
    expect(onRosterUnavailable).not.toHaveBeenCalled()
  })

  it('maps a rejected roster request to the retry UI without losing visible focus', async () => {
    const event = eagerEvent(1)
    render(<EventGuestBrowser
      provider={{
        kind: 'cursor-lazy',
        providerKey: 'rejected-roster',
        loadPage: vi.fn(async () => ({
          ok: true as const,
          data: {
            events: [{
              eventId: event.eventId,
              name: event.name,
              rosterRevision: event.rosterRevision,
              activePersonCount: event.activePersonCount,
            }],
            nextCursor: null,
          },
        })),
        loadRoster: vi.fn(async () => { throw new Error('private transport detail') }),
      }}
      interaction={{ kind: 'command', completedKeys: new Set(), activate: () => ({ accepted: true }) }}
      copy={copy}
      totalSelectedCount={0}
    />)

    fireEvent.click(await screen.findByRole('button', { name: /Event 1/ }))
    const alert = await screen.findByRole('alert')
    await waitFor(() => expect(alert).toHaveFocus())
    expect(alert).toHaveTextContent('Roster failed')
  })

  it.each(['success', 'failure'] as const)(
    'keeps roster focus ownership while a concurrent load-more request finishes with %s',
    async (pageOutcome) => {
      const event = eagerEvent(1)
      const pageRequest = deferred<PersonSourcePageResult>()
      const rosterRequest = deferred<PersonSourceRosterResult>()
      const loadPage = vi.fn()
        .mockResolvedValueOnce({
          ok: true as const,
          data: {
            events: [{
              eventId: event.eventId,
              name: event.name,
              rosterRevision: event.rosterRevision,
              activePersonCount: event.activePersonCount,
            }],
            nextCursor: {
              beforeSortAt: '2026-08-21T10:00:00+00:00',
              beforeEventId: event.eventId,
            },
          },
        })
        .mockImplementationOnce(() => pageRequest.promise)

      render(<EventGuestBrowser
        provider={{
          kind: 'cursor-lazy',
          providerKey: `focus-channels-${pageOutcome}`,
          loadPage,
          loadRoster: vi.fn(() => rosterRequest.promise),
        }}
        interaction={{ kind: 'command', completedKeys: new Set(), activate: () => ({ accepted: true }) }}
        copy={copy}
        totalSelectedCount={0}
      />)

      const eventButton = await screen.findByRole('button', { name: /Event 1/ })
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
      fireEvent.click(eventButton)
      const rosterBridge = screen.getAllByText('Loading roster').find((node) => (
        !node.classList.contains('sr-only')
      ))
      expect(rosterBridge).toHaveFocus()

      await act(async () => {
        pageRequest.resolve(pageOutcome === 'success'
          ? { ok: true, data: { events: [], nextCursor: null } }
          : { ok: false, error: 'load_failed' })
        await pageRequest.promise
      })
      expect(rosterBridge).toHaveFocus()
      expect(rosterBridge).toHaveTextContent('Loading roster')
      expect(rosterBridge).not.toHaveClass('sr-only')

      await act(async () => {
        rosterRequest.resolve({
          ok: true,
          data: {
            eventId: event.eventId,
            name: event.name,
            rosterRevision: event.rosterRevision,
            people: event.people,
          },
        })
        await rosterRequest.promise
      })
      await waitFor(() => expect(screen.getByRole('textbox', { name: 'Search roster' })).toHaveFocus())
    },
  )

  it('hands focused roster state to the persistent bridge during provider replacement', async () => {
    const event = eagerEvent(1)
    const replacementPage = deferred<PersonSourcePageResult>()
    const firstProvider = {
      kind: 'cursor-lazy' as const,
      providerKey: 'provider-one',
      loadPage: vi.fn(async () => ({
        ok: true as const,
        data: {
          events: [{
            eventId: event.eventId,
            name: event.name,
            rosterRevision: event.rosterRevision,
            activePersonCount: event.activePersonCount,
          }],
          nextCursor: null,
        },
      })),
      loadRoster: vi.fn(async () => ({
        ok: true as const,
        data: {
          eventId: event.eventId,
          name: event.name,
          rosterRevision: event.rosterRevision,
          people: event.people,
        },
      })),
    }
    const { rerender } = render(<EventGuestBrowser
      provider={firstProvider}
      interaction={{ kind: 'command', completedKeys: new Set(), activate: () => ({ accepted: true }) }}
      copy={copy}
      totalSelectedCount={0}
    />)

    fireEvent.click(await screen.findByRole('button', { name: /Event 1/ }))
    const rosterSearch = await screen.findByRole('textbox', { name: 'Search roster' })
    expect(rosterSearch).toHaveFocus()

    rerender(<EventGuestBrowser
      provider={{
        kind: 'cursor-lazy',
        providerKey: 'provider-two',
        loadPage: vi.fn(() => replacementPage.promise),
        loadRoster: vi.fn(),
      }}
      interaction={{ kind: 'command', completedKeys: new Set(), activate: () => ({ accepted: true }) }}
      copy={copy}
      totalSelectedCount={0}
    />)

    const bridge = screen.getAllByText('Loading events').find((node) => (
      !node.classList.contains('sr-only')
    ))
    expect(bridge).toHaveFocus()
    expect(document.body).not.toHaveFocus()

    await act(async () => {
      replacementPage.resolve({ ok: true, data: { events: [], nextCursor: null } })
      await replacementPage.promise
    })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Search events' })).toHaveFocus())
  })

  it.each([
    ['the same provider key with roster focus', 'legacy', 'roster'],
    ['a changed provider key with roster focus', 'legacy-replacement', 'roster'],
    ['the same provider key with Back focus', 'legacy', 'back'],
    ['a changed provider key with Back focus', 'legacy-replacement', 'back'],
  ] as const)(
    'hands a focused bounded-eager roster to the bridge before omission with %s',
    async (_label, replacementKey, focusTarget) => {
      const event = eagerEvent(1)
      const initialEvents = [event]
      const view = render(<EventGuestBrowser
        provider={{
          kind: 'bounded-eager',
          providerKey: 'legacy',
          events: initialEvents,
          loadState: { kind: 'ready' },
        }}
        interaction={{ kind: 'command', completedKeys: new Set(), activate: () => ({ accepted: true }) }}
        copy={copy}
        initialEventId={event.eventId}
        totalSelectedCount={0}
      />)

      const focusedControl = focusTarget === 'roster'
        ? screen.getByRole('textbox', { name: 'Search roster' })
        : screen.getByRole('button', { name: 'Back to events' })
      focusedControl.focus()
      const bridge = view.container.querySelector<HTMLParagraphElement>('p[tabindex="-1"]')
      expect(bridge).not.toBeNull()
      const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')
      focusSpy.mockClear()

      view.rerender(<EventGuestBrowser
        provider={{
          kind: 'bounded-eager',
          providerKey: replacementKey,
          events: [],
          loadState: { kind: 'ready' },
        }}
        interaction={{ kind: 'command', completedKeys: new Set(), activate: () => ({ accepted: true }) }}
        copy={copy}
        initialEventId={event.eventId}
        totalSelectedCount={0}
      />)

      expect(focusSpy.mock.contexts).toContain(bridge)
      expect(document.body).not.toHaveFocus()
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Search events' })).toHaveFocus())
      focusSpy.mockRestore()
    },
  )

  it.each(['success', 'failure'] as const)(
    'retires a completed page transition without stealing deliberately moved focus after %s',
    async (outcome) => {
      const event = eagerEvent(1)
      const pageRequest = deferred<PersonSourcePageResult>()
      const loadPage = vi.fn()
        .mockResolvedValueOnce({
          ok: true as const,
          data: {
            events: [event],
            nextCursor: {
              beforeSortAt: '2026-08-21T10:00:00+00:00',
              beforeEventId: event.eventId,
            },
          },
        })
        .mockImplementationOnce(() => pageRequest.promise)
      const view = render(<EventGuestBrowser
        provider={{
          kind: 'cursor-lazy',
          providerKey: `moved-focus-${outcome}`,
          loadPage,
          loadRoster: vi.fn(),
        }}
        interaction={{ kind: 'command', completedKeys: new Set(), activate: () => ({ accepted: true }) }}
        copy={copy}
        totalSelectedCount={0}
      />)

      const eventSearch = await screen.findByRole('textbox', { name: 'Search events' })
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
      const bridge = view.container.querySelector<HTMLParagraphElement>('p[tabindex="-1"]')!
      expect(bridge).toHaveFocus()
      eventSearch.focus()

      await act(async () => {
        pageRequest.resolve(outcome === 'success'
          ? { ok: true, data: { events: [], nextCursor: null } }
          : { ok: false, error: 'load_failed' })
        await pageRequest.promise
      })

      expect(eventSearch).toHaveFocus()
      expect(bridge).toHaveClass('sr-only')
      expect(bridge).toHaveTextContent('')
    },
  )

  it('retains focus on the persistent Back control when a background terminal page omits the active Event', async () => {
    const listedEvent = eagerEvent(1)
    const omittedEvent = eagerEvent(2)
    const pageRequest = deferred<PersonSourcePageResult>()
    const rosterRequest = deferred<PersonSourceRosterResult>()
    render(<EventGuestBrowser
      provider={{
        kind: 'cursor-lazy',
        providerKey: 'terminal-back-focus',
        loadPage: vi.fn(() => pageRequest.promise),
        loadRoster: vi.fn(() => rosterRequest.promise),
      }}
      interaction={{ kind: 'command', completedKeys: new Set(), activate: () => ({ accepted: true }) }}
      copy={copy}
      initialEventId={omittedEvent.eventId}
      totalSelectedCount={0}
    />)

    await act(async () => {
      rosterRequest.resolve({
        ok: true,
        data: {
          eventId: omittedEvent.eventId,
          name: omittedEvent.name,
          rosterRevision: omittedEvent.rosterRevision,
          people: omittedEvent.people,
        },
      })
      await rosterRequest.promise
    })
    const back = await screen.findByRole('button', { name: 'Back to events' })
    back.focus()

    await act(async () => {
      pageRequest.resolve({
        ok: true,
        data: {
          events: [listedEvent],
          nextCursor: null,
        },
      })
      await pageRequest.promise
    })

    expect(back).toHaveFocus()
    expect(screen.getByRole('alert')).toHaveTextContent('Roster failed')
  })

  it('lets terminal directory authority win both response orders for an omitted active Event', async () => {
    async function runOrder(rosterFirst: boolean) {
      const listedEvent = eagerEvent(1)
      const omittedEvent = eagerEvent(2)
      const pageRequest = deferred<PersonSourcePageResult>()
      const rosterRequest = deferred<PersonSourceRosterResult>()
      const observations: string[] = []
      const view = render(<EventGuestBrowser
        provider={{
          kind: 'cursor-lazy',
          providerKey: rosterFirst ? 'roster-first' : 'page-first',
          loadPage: vi.fn(() => pageRequest.promise),
          loadRoster: vi.fn(() => rosterRequest.promise),
        }}
        interaction={{ kind: 'command', completedKeys: new Set(), activate: () => ({ accepted: true }) }}
        copy={copy}
        initialEventId={omittedEvent.eventId}
        totalSelectedCount={0}
        onRosterObserved={() => observations.push('roster')}
        onRosterUnavailable={() => observations.push('removed')}
        onDirectoryComplete={() => observations.push('terminal')}
      />)
      const pageResult: PersonSourcePageResult = {
        ok: true,
        data: {
          events: [{
            eventId: listedEvent.eventId,
            name: listedEvent.name,
            rosterRevision: listedEvent.rosterRevision,
            activePersonCount: listedEvent.activePersonCount,
          }],
          nextCursor: null,
        },
      }
      const rosterResult: PersonSourceRosterResult = {
        ok: true,
        data: {
          eventId: omittedEvent.eventId,
          name: omittedEvent.name,
          rosterRevision: omittedEvent.rosterRevision,
          people: omittedEvent.people,
        },
      }

      await act(async () => {
        if (rosterFirst) {
          rosterRequest.resolve(rosterResult)
          await rosterRequest.promise
          pageRequest.resolve(pageResult)
          await pageRequest.promise
        } else {
          pageRequest.resolve(pageResult)
          await pageRequest.promise
          rosterRequest.resolve(rosterResult)
          await rosterRequest.promise
        }
      })

      expect(observations.at(-2)).toBe('removed')
      expect(observations.at(-1)).toBe('terminal')
      expect(screen.getByRole('alert')).toHaveTextContent('Roster failed')
      expect(screen.queryByText('Guest name 2')).not.toBeInTheDocument()
      view.unmount()
    }

    await runOrder(false)
    await runOrder(true)
  })
})
