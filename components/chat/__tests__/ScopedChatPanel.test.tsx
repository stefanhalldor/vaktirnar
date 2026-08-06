import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MessageDto } from '@/lib/chat/types'
import { ScopedChatPanel, type ScopedChatTransport } from '../ScopedChatPanel'

const labels = {
  empty: 'No messages',
  loading: 'Loading messages',
  loadError: 'Could not load',
  retry: 'Retry',
  inputPlaceholder: 'Write a message',
  send: 'Send',
  sendError: 'Could not send',
  deleted: 'Deleted',
  loadOlder: 'Load older',
}

function message(id: string, body: string, createdAt = '2026-07-27T12:00:00.000Z'): MessageDto {
  return {
    id,
    threadId: 'thread-1',
    body,
    messageKind: 'chat',
    createdAt,
    isDeleted: false,
    isHidden: false,
    authorName: 'Agent',
  }
}

function transport(overrides: Partial<ScopedChatTransport> = {}): ScopedChatTransport {
  return {
    loadMessages: vi.fn().mockResolvedValue([]),
    markRead: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockImplementation(async (threadId, body) => ({
      ...message('confirmed', body),
      threadId,
    })),
    ...overrides,
  }
}

describe('ScopedChatPanel', () => {
  it('interleaves context events and chat messages in one chronological stream', async () => {
    render(
      <ScopedChatPanel
        threadId="thread-1"
        transport={transport({
          loadMessages: vi.fn().mockResolvedValue([
            message('message-middle', 'Message in the middle', '2026-07-27T11:00:00.000Z'),
          ]),
        })}
        labels={labels}
        locale="en"
        pollingIntervalMs={60_000}
        timelineEvents={[
          {
            id: 'event-first',
            createdAt: '2026-07-27T10:00:00.000Z',
            content: <p>First system event</p>,
          },
          {
            id: 'event-last',
            createdAt: '2026-07-27T12:00:00.000Z',
            content: <p>Last system event</p>,
          },
        ]}
      />,
    )

    const first = screen.getByText('First system event')
    const middle = await screen.findByText('Message in the middle')
    const last = screen.getByText('Last system event')
    const composer = screen.getByPlaceholderText('Write a message')

    expect(first.compareDocumentPosition(middle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(middle.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(last.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows an initial load error, retries, and marks read only after a successful load', async () => {
    const loadMessages = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([message('m1', 'Recovered')])
    const markRead = vi.fn().mockResolvedValue(undefined)
    const chatTransport = transport({ loadMessages, markRead })

    render(
      <ScopedChatPanel
        threadId="thread-1"
        transport={chatTransport}
        labels={labels}
        locale="en"
        pollingIntervalMs={60_000}
      />,
    )

    expect(await screen.findByText('Could not load')).toBeInTheDocument()
    expect(markRead).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Recovered')).toBeInTheDocument()
    await waitFor(() => expect(markRead).toHaveBeenCalledWith('thread-1', {
      lastReadMessageId: 'm1',
    }))
  })

  it('clears old thread state and ignores a stale load after the thread changes', async () => {
    let resolveOld: ((messages: MessageDto[]) => void) | undefined
    const oldLoad = new Promise<MessageDto[]>(resolve => { resolveOld = resolve })
    const loadMessages = vi.fn().mockImplementation((threadId: string) => {
      if (threadId === 'old-thread') return oldLoad
      return Promise.resolve([{ ...message('new', 'New thread'), threadId }])
    })
    const chatTransport = transport({ loadMessages })

    const { rerender } = render(
      <ScopedChatPanel
        threadId="old-thread"
        transport={chatTransport}
        labels={labels}
        locale="en"
        pollingIntervalMs={60_000}
      />,
    )

    rerender(
      <ScopedChatPanel
        threadId="new-thread"
        transport={chatTransport}
        labels={labels}
        locale="en"
        pollingIntervalMs={60_000}
      />,
    )

    expect(await screen.findByText('New thread')).toBeInTheDocument()
    resolveOld?.([{ ...message('old', 'Old thread'), threadId: 'old-thread' }])

    await waitFor(() => expect(screen.queryByText('Old thread')).not.toBeInTheDocument())
  })

  it('uses timestamp and id as the pagination cursor', async () => {
    const first = message('first-id', 'First', '2026-07-27T10:00:00.000Z')
    const second = message('second-id', 'Second', '2026-07-27T11:00:00.000Z')
    const loadMessages = vi.fn()
      .mockResolvedValueOnce([first, second])
      .mockResolvedValueOnce([])
    const chatTransport = transport({ loadMessages })

    render(
      <ScopedChatPanel
        threadId="thread-1"
        transport={chatTransport}
        labels={labels}
        locale="en"
        pageSize={2}
        pollingIntervalMs={60_000}
      />,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Load older' }))

    expect(loadMessages).toHaveBeenNthCalledWith(2, 'thread-1', {
      before: first.createdAt,
      beforeId: first.id,
      limit: 2,
    })
  })

  it('accepts a later id when a new message shares the latest timestamp', async () => {
    const first = message('10000000-0000-4000-8000-000000000000', 'First')
    const latest = message('20000000-0000-4000-8000-000000000000', 'Latest')
    const equalTimestampLaterId = message('30000000-0000-4000-8000-000000000000', 'Same-time update')
    const loadMessages = vi.fn()
      .mockResolvedValueOnce([first, latest])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([latest, equalTimestampLaterId])
    let refresh: (() => void) | undefined
    const chatTransport = transport({
      loadMessages,
      subscribe: vi.fn((_threadId, onNewMessage) => {
        refresh = onNewMessage
        return () => undefined
      }),
    })

    render(
      <ScopedChatPanel
        threadId="thread-1"
        transport={chatTransport}
        labels={labels}
        locale="en"
        pageSize={2}
        pollingIntervalMs={60_000}
      />,
    )

    await userEvent.click(await screen.findByRole('button', { name: 'Load older' }))
    await act(async () => { refresh?.() })

    expect(await screen.findByText('Same-time update')).toBeInTheDocument()
  })

  it('adds cryptographic client and idempotency ids when sending', async () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
    const original = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID')
    Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: randomUUID })
    const sendMessage = vi.fn().mockResolvedValue(message('confirmed', 'Hello'))
    const chatTransport = transport({ sendMessage })

    try {
      render(
        <ScopedChatPanel
          threadId="thread-1"
          transport={chatTransport}
          labels={labels}
          locale="en"
          pollingIntervalMs={60_000}
        />,
      )

      await screen.findByText('No messages')
      await userEvent.type(screen.getByPlaceholderText('Write a message'), 'Hello')
      await userEvent.click(screen.getByRole('button', { name: 'Send' }))

      await waitFor(() => expect(sendMessage).toHaveBeenCalledWith('thread-1', 'Hello', {
        clientMessageId: '00000000-0000-4000-8000-000000000001',
        idempotencyKey: '00000000-0000-4000-8000-000000000002',
      }))
    } finally {
      if (original) Object.defineProperty(globalThis.crypto, 'randomUUID', original)
    }
  })

  it('reuses the same idempotency envelope after a committed response is lost', async () => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000011')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000012')
    const original = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID')
    Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: randomUUID })
    const sendMessage = vi.fn()
      .mockRejectedValueOnce(new Error('response lost after commit'))
      .mockResolvedValueOnce(message('confirmed-after-retry', 'Retry me'))

    try {
      render(
        <ScopedChatPanel
          threadId="thread-1"
          transport={transport({ sendMessage })}
          labels={labels}
          locale="en"
          pollingIntervalMs={60_000}
        />,
      )

      await screen.findByText('No messages')
      await userEvent.type(screen.getByPlaceholderText('Write a message'), 'Retry me')
      await userEvent.click(screen.getByRole('button', { name: 'Send' }))
      expect(await screen.findByText('Could not send')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Send' }))

      await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
      expect(sendMessage.mock.calls[0]).toEqual(sendMessage.mock.calls[1])
      expect(randomUUID).toHaveBeenCalledTimes(2)
      expect(await screen.findByText('Retry me')).toBeInTheDocument()
    } finally {
      if (original) Object.defineProperty(globalThis.crypto, 'randomUUID', original)
    }
  })

  it('does not mark a newly loaded reply read while the document is hidden', async () => {
    const original = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    const markRead = vi.fn().mockResolvedValue(undefined)

    try {
      render(
        <ScopedChatPanel
          threadId="thread-1"
          transport={transport({
            loadMessages: vi.fn().mockResolvedValue([message('reply-1', 'Unread reply')]),
            markRead,
          })}
          labels={labels}
          locale="en"
          pollingIntervalMs={60_000}
        />,
      )

      expect(await screen.findByText('Unread reply')).toBeInTheDocument()
      expect(markRead).not.toHaveBeenCalled()

      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
      await waitFor(() => expect(markRead).toHaveBeenCalledWith('thread-1', {
        lastReadMessageId: 'reply-1',
      }))
    } finally {
      if (original) Object.defineProperty(document, 'visibilityState', original)
    }
  })

  it('does not clear unread state while the chat list is below the viewport', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'IntersectionObserver')
    let callback: IntersectionObserverCallback | undefined
    class FakeIntersectionObserver {
      readonly root = null
      readonly rootMargin = '0px'
      readonly thresholds = [0.01]
      constructor(next: IntersectionObserverCallback) { callback = next }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords(): IntersectionObserverEntry[] { return [] }
    }
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: FakeIntersectionObserver,
    })
    const markRead = vi.fn().mockResolvedValue(undefined)

    try {
      render(
        <ScopedChatPanel
          threadId="thread-1"
          transport={transport({
            loadMessages: vi.fn().mockResolvedValue([message('reply-below-fold', 'Below fold')]),
            markRead,
          })}
          labels={labels}
          locale="en"
          pollingIntervalMs={60_000}
        />,
      )

      expect(await screen.findByText('Below fold')).toBeInTheDocument()
      expect(markRead).not.toHaveBeenCalled()

      await act(async () => {
        callback?.([{
          isIntersecting: true,
          intersectionRatio: 1,
        } as IntersectionObserverEntry], {} as IntersectionObserver)
      })
      await waitFor(() => expect(markRead).toHaveBeenCalledWith('thread-1', {
        lastReadMessageId: 'reply-below-fold',
      }))
    } finally {
      if (original) Object.defineProperty(window, 'IntersectionObserver', original)
      else delete (window as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver
    }
  })

  it('reconciles a poll-confirmed optimistic message without duplicating it', async () => {
    const confirmed = message('confirmed-id', 'Hello')
    let resolveSend: ((value: MessageDto) => void) | undefined
    const pendingSend = new Promise<MessageDto>(resolve => { resolveSend = resolve })
    const loadMessages = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([confirmed])
    let refresh: (() => void) | undefined
    const chatTransport = transport({
      loadMessages,
      sendMessage: vi.fn().mockReturnValue(pendingSend),
      subscribe: vi.fn((_threadId, onNewMessage) => {
        refresh = onNewMessage
        return () => undefined
      }),
    })

    render(
      <ScopedChatPanel
        threadId="thread-1"
        transport={chatTransport}
        labels={labels}
        locale="en"
        pollingIntervalMs={60_000}
      />,
    )

    await screen.findByText('No messages')
    await userEvent.type(screen.getByPlaceholderText('Write a message'), 'Hello')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await act(async () => { refresh?.() })
    resolveSend?.(confirmed)

    await waitFor(() => expect(screen.getAllByText('Hello')).toHaveLength(1))
  })
})
