import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BookingActivityView, BookingMessageView } from '@/lib/bookings/contracts'

const { localeState } = vi.hoisted(() => ({ localeState: { value: 'is' } }))

vi.mock('next-intl', () => ({
  useLocale: () => localeState.value,
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (key === 'chat.actorGuest') return localeState.value === 'is' ? 'Gestur' : 'Guest'
    return values ? `${key}:${Object.values(values).join(':')}` : key
  },
}))

import { BookingChatPanel } from '../BookingChatPanel'

function message(overrides: Partial<BookingMessageView>): BookingMessageView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    threadId: '22222222-2222-4222-8222-222222222222',
    body: 'Halló',
    messageKind: 'chat',
    createdAt: '2026-08-11T16:00:00.000Z',
    isDeleted: false,
    isHidden: false,
    authorName: null,
    senderSide: 'customer',
    senderKind: 'guest',
    ...overrides,
  }
}

describe('BookingChatPanel', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    ['is', 'Gestur'],
    ['en', 'Guest'],
  ])('renders the %s generic guest actor and never the contact name', async (locale, guestLabel) => {
    localeState.value = locale
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([
      message({ authorName: 'Anna Jónsdóttir' }),
      message({
        id: '33333333-3333-4333-8333-333333333333',
        body: 'Sæl Anna',
        authorName: 'Kvissbador',
        senderSide: 'provider',
        senderKind: 'provider',
      }),
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    render(
      <BookingChatPanel
        publicId="22222222-2222-4222-8222-222222222222"
        activity={[]}
        timeZone="Atlantic/Reykjavik"
        canMessage={false}
      />,
    )

    expect(await screen.findByText(guestLabel)).toBeInTheDocument()
    expect(screen.queryByText('Anna Jónsdóttir')).not.toBeInTheDocument()
    expect(screen.getByText('Kvissbador')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('chat.closed')).toBeInTheDocument()
  })

  it('hides discount system events until calculator support is available', async () => {
    localeState.value = 'is'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))
    const activity: BookingActivityView[] = [{
      id: '44444444-4444-4444-8444-444444444444',
      eventType: 'discount_applied',
      createdAt: '2026-08-11T16:00:00.000Z',
      actorName: null,
      workflowTransition: null,
      cancellationReason: null,
    }]

    render(
      <BookingChatPanel
        publicId="22222222-2222-4222-8222-222222222222"
        activity={activity}
        timeZone="Atlantic/Reykjavik"
        canMessage={false}
      />,
    )

    expect(await screen.findByText('chat.empty')).toBeInTheDocument()
    expect(screen.queryByText('activity.discount_applied')).not.toBeInTheDocument()
  })

  it('renders only audience-safe transition labels and a typed cancellation reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))
    const activity: BookingActivityView[] = [
      {
        id: '55555555-5555-4555-8555-555555555555',
        eventType: 'workflow_state_changed',
        createdAt: '2026-08-11T16:00:00.000Z',
        actorName: null,
        workflowTransition: {
          from: { systemLabelKey: null, label: 'Sent' },
          to: { systemLabelKey: null, label: 'Waiting for you' },
        },
        cancellationReason: null,
      },
      {
        id: '66666666-6666-4666-8666-666666666666',
        eventType: 'request_cancelled',
        createdAt: '2026-08-11T16:01:00.000Z',
        actorName: null,
        workflowTransition: null,
        cancellationReason: 'provider_unavailable',
      },
    ]
    render(
      <BookingChatPanel
        publicId="22222222-2222-4222-8222-222222222222"
        activity={activity}
        timeZone="Atlantic/Reykjavik"
        canMessage={false}
        audience="customer"
      />,
    )

    expect(await screen.findByText('activity.workflow_state_changed:Sent:Waiting for you'))
      .toBeInTheDocument()
    expect(screen.getByText(/activity.request_cancelled_with_reason:/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('workflowId')
  })
})
