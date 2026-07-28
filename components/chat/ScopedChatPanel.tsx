'use client'

import { useState, useEffect, useRef } from 'react'
import type { ChatMessageKind, MessageDto } from '@/lib/chat/types'
import { ChatMessageRow, type AugmentedChatMessage } from './ChatMessageRow'
import { ScopedChatComposer } from './ScopedChatComposer'

export type ScopedChatLoadOptions = {
  before?: string
  /** Stable tie-breaker when more than one message has the same timestamp. */
  beforeId?: string
  limit?: number
}

export type ScopedChatSendOptions = {
  /** Stable client id used to reconcile optimistic and confirmed messages. */
  clientMessageId: string
  /** Request key the API can use to make retries idempotent. */
  idempotencyKey: string
}

export type ScopedChatReadOptions = {
  /** Exact message observed by the client; avoids clearing a newer unseen reply. */
  lastReadMessageId?: string
}

export type ScopedChatTransport = {
  loadMessages(threadId: string, opts?: ScopedChatLoadOptions): Promise<MessageDto[]>
  markRead(threadId: string, opts?: ScopedChatReadOptions): Promise<void>
  sendMessage(threadId: string, body: string, opts?: ScopedChatSendOptions): Promise<MessageDto>
  /**
   * Optional Realtime subscription. When provided, the panel subscribes to live
   * message inserts and calls `loadMessages` on each event. The polling fallback
   * remains active regardless. Returns an unsubscribe function.
   */
  subscribe?(threadId: string, onNewMessage: () => void): () => void
}

interface ScopedChatPanelLabels {
  empty: string
  /** Shown while the initial message load is in progress. Omit to show nothing during load. */
  loading?: string
  inputPlaceholder: string
  send: string
  sendError: string
  /** Initial loads are allowed to fail visibly while background polls stay quiet. */
  loadError?: string
  retry?: string
  deleted: string
  loadOlder: string
  kindLabels?: Partial<Record<ChatMessageKind, string>>
}

interface ScopedChatPanelProps {
  threadId: string
  transport: ScopedChatTransport
  labels: ScopedChatPanelLabels
  /** Number of messages per page. Passed as `limit` to transport.loadMessages. Default: 10. */
  pageSize?: number
  pollingIntervalMs?: number
  /** Override class for the scrollable message list container. */
  listClassName?: string
  composerMaxLength?: number
  composerMultiline?: boolean
  locale: string
}

const DEFAULT_PAGE_SIZE = 10

/**
 * Generic per-thread chat panel: loads messages, polls, marks read, and sends.
 * Shows the latest `pageSize` messages. A "load older" button prepends earlier pages.
 * Caller is responsible for thread init, providing a ready threadId, and injecting
 * the transport so this component stays product-agnostic.
 */
export function ScopedChatPanel({
  threadId,
  transport,
  labels,
  pageSize,
  pollingIntervalMs = 15_000,
  listClassName,
  composerMaxLength,
  composerMultiline = false,
  locale,
}: ScopedChatPanelProps) {
  const effectivePageSize = pageSize ?? DEFAULT_PAGE_SIZE
  const [messages, setMessages] = useState<AugmentedChatMessage[]>([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const bottomSentinelRef = useRef<HTMLDivElement>(null)
  // true when we should scroll to bottom after next render (initial load + send)
  const shouldScrollRef = useRef(true)
  // true after user has loaded older messages — polls should only append new ones
  const hasLoadedOlderRef = useRef(false)
  // false until first loadMessages completes — suppresses premature empty-state label
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [initialLoadError, setInitialLoadError] = useState(false)
  const initialLoadDoneRef = useRef(false)
  const loadGenerationRef = useRef(0)
  const loadInFlightGenerationRef = useRef<number | null>(null)
  const lastMarkedCursorRef = useRef<string | null>(null)
  const isAtBottomRef = useRef(true)
  const bottomVisibleRef = useRef(false)
  const [bottomVisible, setBottomVisible] = useState(false)
  const retryEnvelopeRef = useRef<{
    body: string
    clientMessageId: string
    idempotencyKey: string
  } | null>(null)

  async function loadMessages(generation = loadGenerationRef.current) {
    if (loadInFlightGenerationRef.current === generation) return
    loadInFlightGenerationRef.current = generation
    try {
      const data = await transport.loadMessages(threadId, { limit: effectivePageSize })
      if (generation !== loadGenerationRef.current) return
      if (!hasLoadedOlderRef.current) {
        // Normal: replace confirmed messages with fresh poll result
        setMessages(prev => {
          const optimistic = prev.filter(m => m.optimistic)
          return [...data, ...optimistic]
        })
        setHasMore(data.length >= effectivePageSize)
      } else {
        // User has loaded older pages: only append genuinely new messages
        setMessages(prev => {
          const confirmed = prev.filter(m => !m.optimistic)
          const optimistic = prev.filter(m => m.optimistic)
          const newest = confirmed[confirmed.length - 1]
          const newMsgs = newest
            ? data.filter(m => (
                m.createdAt > newest.createdAt
                || (m.createdAt === newest.createdAt && m.id > newest.id)
              ))
            : data
          return [...confirmed, ...newMsgs, ...optimistic]
        })
      }
      setInitialLoadError(false)
    } catch {
      if (
        generation === loadGenerationRef.current
        && !initialLoadDoneRef.current
      ) {
        setInitialLoadError(true)
      }
      // Background polls remain quiet after the initial state is known.
    } finally {
      if (loadInFlightGenerationRef.current === generation) {
        loadInFlightGenerationRef.current = null
      }
      if (generation !== loadGenerationRef.current) return
      if (!initialLoadDoneRef.current) {
        initialLoadDoneRef.current = true
        setInitialLoadDone(true)
      }
    }
  }

  useEffect(() => {
    const generation = loadGenerationRef.current + 1
    loadGenerationRef.current = generation
    shouldScrollRef.current = true
    isAtBottomRef.current = true
    hasLoadedOlderRef.current = false
    initialLoadDoneRef.current = false
    lastMarkedCursorRef.current = null
    retryEnvelopeRef.current = null
    setMessages([])
    setBody('')
    setSending(false)
    setSendError(false)
    setInitialLoadDone(false)
    setInitialLoadError(false)
    setHasMore(false)
    let stopped = false
    let polling = false
    let timeoutId: number | undefined
    const schedule = () => {
      if (stopped) return
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(refresh, pollingIntervalMs)
    }
    const refresh = async () => {
      if (stopped || polling) return
      if (document.visibilityState !== 'visible' && initialLoadDoneRef.current) {
        schedule()
        return
      }
      polling = true
      await loadMessages(generation)
      polling = false
      schedule()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      void refresh()
    }
    void refresh()
    const unsub = transport.subscribe?.(threadId, refresh)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stopped = true
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      unsub?.()
      if (loadGenerationRef.current === generation) loadGenerationRef.current += 1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, pollingIntervalMs])

  useEffect(() => {
    if (shouldScrollRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
      shouldScrollRef.current = false
      isAtBottomRef.current = true
    }
  }, [messages.length])

  useEffect(() => {
    const element = bottomSentinelRef.current
    bottomVisibleRef.current = false
    setBottomVisible(false)
    if (!element) return

    if (typeof window.IntersectionObserver !== 'function') {
      // Older WebViews have no observer. Preserve the prior behavior there;
      // current browsers take the stricter viewport-aware path below.
      bottomVisibleRef.current = true
      setBottomVisible(true)
      return
    }

    const observer = new window.IntersectionObserver(([entry]) => {
      const visible = Boolean(entry?.isIntersecting && entry.intersectionRatio > 0)
      bottomVisibleRef.current = visible
      setBottomVisible(visible)
    }, { threshold: 0.01 })
    observer.observe(element)
    return () => {
      bottomVisibleRef.current = false
      observer.disconnect()
    }
  }, [threadId])

  useEffect(() => {
    function markVisibleMessagesRead() {
      if (
        document.visibilityState !== 'visible'
        || !bottomVisible
        || !isAtBottomRef.current
      ) return
      const newest = [...messages].reverse().find(message => !message.optimistic)
      if (!newest) return
      const readCursor = `${newest.createdAt}:${newest.id}`
      if (lastMarkedCursorRef.current === readCursor) return
      lastMarkedCursorRef.current = readCursor
      transport.markRead(threadId, { lastReadMessageId: newest.id }).catch(() => {
        // Let the next visible poll or scroll retry this best-effort update.
        if (lastMarkedCursorRef.current === readCursor) lastMarkedCursorRef.current = null
      })
    }

    markVisibleMessagesRead()
    document.addEventListener('visibilitychange', markVisibleMessagesRead)
    return () => document.removeEventListener('visibilitychange', markVisibleMessagesRead)
  }, [bottomVisible, messages, threadId, transport])

  async function loadOlder() {
    if (loadingMore) return
    const confirmed = messages.filter(m => !m.optimistic)
    const before = confirmed[0]?.createdAt
    const beforeId = confirmed[0]?.id
    if (!before || !beforeId) return
    setLoadingMore(true)
    try {
      const older = await transport.loadMessages(threadId, {
        before,
        beforeId,
        limit: effectivePageSize,
      })
      hasLoadedOlderRef.current = true
      setHasMore(older.length >= effectivePageSize)
      setMessages(prev => {
        const prevConfirmed = prev.filter(m => !m.optimistic)
        const optimistic = prev.filter(m => m.optimistic)
        return [...older, ...prevConfirmed, ...optimistic]
      })
    } catch { /* silent */ } finally {
      setLoadingMore(false)
    }
  }

  async function handleSend() {
    if (!body.trim() || sending) return
    const sendGeneration = loadGenerationRef.current
    setSendError(false)
    const trimmed = body.trim()
    let envelope = retryEnvelopeRef.current
    if (!envelope || envelope.body !== trimmed) {
      try {
        envelope = {
          body: trimmed,
          clientMessageId: createMessageId(),
          idempotencyKey: createMessageId(),
        }
      } catch {
        setSendError(true)
        return
      }
    }
    const { clientMessageId, idempotencyKey } = envelope
    retryEnvelopeRef.current = envelope
    const optimisticId = `opt-${clientMessageId}`
    const optimistic: AugmentedChatMessage = {
      id: optimisticId,
      threadId,
      body: trimmed,
      messageKind: 'chat',
      createdAt: new Date().toISOString(),
      isDeleted: false,
      isHidden: false,
      authorName: null,
      optimistic: true,
    }
    shouldScrollRef.current = true
    setMessages(prev => [...prev.filter(message => message.id !== optimisticId), optimistic])
    setBody('')
    setSending(true)
    try {
      const confirmed = await transport.sendMessage(threadId, trimmed, {
        clientMessageId,
        idempotencyKey,
      })
      if (sendGeneration !== loadGenerationRef.current) return
      retryEnvelopeRef.current = null
      setMessages(prev => {
        const withoutDuplicate = prev.filter(message => (
          message.id !== optimisticId && message.id !== confirmed.id
        ))
        return [...withoutDuplicate, confirmed].sort((a, b) => {
          const byTime = a.createdAt.localeCompare(b.createdAt)
          return byTime !== 0 ? byTime : a.id.localeCompare(b.id)
        })
      })
    } catch {
      if (sendGeneration !== loadGenerationRef.current) return
      setMessages(prev =>
        prev.map(m => m.id === optimisticId ? { ...m, optimistic: false, failed: true } : m)
      )
      setSendError(true)
      setBody(trimmed)
    } finally {
      if (sendGeneration === loadGenerationRef.current) setSending(false)
    }
  }

  return (
    <>
      <div
        ref={listRef}
        onScroll={(event) => {
          const element = event.currentTarget
          isAtBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 32
          if (
            isAtBottomRef.current
            && bottomVisibleRef.current
            && document.visibilityState === 'visible'
          ) {
            const newest = [...messages].reverse().find(message => !message.optimistic)
            if (newest) {
              const readCursor = `${newest.createdAt}:${newest.id}`
              if (lastMarkedCursorRef.current !== readCursor) {
                lastMarkedCursorRef.current = readCursor
                transport.markRead(threadId, { lastReadMessageId: newest.id }).catch(() => {
                  if (lastMarkedCursorRef.current === readCursor) lastMarkedCursorRef.current = null
                })
              }
            }
          }
        }}
        className={listClassName ?? 'flex flex-col gap-2 max-h-56 overflow-y-auto pr-0.5'}
      >
        {hasMore && (
          <button
            type="button"
            onClick={loadOlder}
            disabled={loadingMore}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors self-center disabled:opacity-40 py-0.5"
          >
            {loadingMore ? '...' : labels.loadOlder}
          </button>
        )}
        {!initialLoadDone ? (
          labels.loading ? <p className="text-xs text-muted-foreground">{labels.loading}</p> : null
        ) : initialLoadError && (labels.loadError || labels.retry) ? (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
            {labels.loadError && <p className="text-xs text-destructive">{labels.loadError}</p>}
            {labels.retry && (
              <button
                type="button"
                onClick={() => {
                  initialLoadDoneRef.current = false
                  setInitialLoadDone(false)
                  setInitialLoadError(false)
                  loadMessages()
                }}
                className="min-h-10 shrink-0 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {labels.retry}
              </button>
            )}
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">{labels.empty}</p>
        ) : (
          messages.map(msg => (
            <ChatMessageRow
              key={msg.id}
              msg={msg}
              deletedLabel={labels.deleted}
              kindLabels={labels.kindLabels}
              locale={locale}
            />
          ))
        )}
        <div ref={bottomSentinelRef} aria-hidden className="h-px w-full shrink-0" />
      </div>
      <ScopedChatComposer
        value={body}
        onChange={(value) => {
          if (retryEnvelopeRef.current?.body !== value.trim()) {
            retryEnvelopeRef.current = null
          }
          setBody(value)
        }}
        onSend={handleSend}
        disabled={sending}
        placeholder={labels.inputPlaceholder}
        sendLabel={labels.send}
        maxLength={composerMaxLength}
        multiline={composerMultiline}
      />
      {sendError && (
        <p className="text-xs text-destructive">{labels.sendError}</p>
      )}
    </>
  )
}

function createMessageId(): string {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi) throw new Error('secure random source unavailable')
  if (typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }

  // Older WebViews can lack randomUUID. getRandomValues keeps the fallback
  // cryptographically random without introducing a third-party dependency.
  const bytes = new Uint8Array(16)
  cryptoApi.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
