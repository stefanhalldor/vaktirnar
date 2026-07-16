'use client'

import { useState, useEffect, useRef } from 'react'
import type { ChatMessageKind, MessageDto } from '@/lib/chat/types'
import { ChatMessageRow, type AugmentedChatMessage } from './ChatMessageRow'

export type ScopedChatLoadOptions = {
  before?: string
  limit?: number
}

export type ScopedChatTransport = {
  loadMessages(threadId: string, opts?: ScopedChatLoadOptions): Promise<MessageDto[]>
  markRead(threadId: string): Promise<void>
  sendMessage(threadId: string, body: string): Promise<MessageDto>
}

interface ScopedChatPanelLabels {
  empty: string
  inputPlaceholder: string
  send: string
  sendError: string
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
}: ScopedChatPanelProps) {
  const effectivePageSize = pageSize ?? DEFAULT_PAGE_SIZE
  const [messages, setMessages] = useState<AugmentedChatMessage[]>([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  // true when we should scroll to bottom after next render (initial load + send)
  const shouldScrollRef = useRef(true)
  // true after user has loaded older messages — polls should only append new ones
  const hasLoadedOlderRef = useRef(false)
  // false until first loadMessages completes — suppresses premature empty-state label
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const initialLoadDoneRef = useRef(false)

  async function loadMessages() {
    try {
      const data = await transport.loadMessages(threadId, { limit: effectivePageSize })
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
          const newestTime = confirmed[confirmed.length - 1]?.createdAt ?? ''
          const newMsgs = data.filter(m => m.createdAt > newestTime)
          return [...confirmed, ...newMsgs, ...optimistic]
        })
      }
    } catch { /* silent during poll */ } finally {
      if (!initialLoadDoneRef.current) {
        initialLoadDoneRef.current = true
        setInitialLoadDone(true)
      }
    }
  }

  useEffect(() => {
    shouldScrollRef.current = true
    hasLoadedOlderRef.current = false
    initialLoadDoneRef.current = false
    setInitialLoadDone(false)
    setHasMore(false)
    loadMessages()
    transport.markRead(threadId).catch(() => { /* silent */ })
    const id = setInterval(loadMessages, pollingIntervalMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, pollingIntervalMs])

  useEffect(() => {
    if (shouldScrollRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
      shouldScrollRef.current = false
    }
  }, [messages.length])

  async function loadOlder() {
    if (loadingMore) return
    const confirmed = messages.filter(m => !m.optimistic)
    const before = confirmed[0]?.createdAt
    if (!before) return
    setLoadingMore(true)
    try {
      const older = await transport.loadMessages(threadId, { before, limit: effectivePageSize })
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
    setSendError(false)
    const trimmed = body.trim()
    const optimisticId = `opt-${Date.now()}`
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
    setMessages(prev => [...prev, optimistic])
    setBody('')
    setSending(true)
    try {
      const confirmed = await transport.sendMessage(threadId, trimmed)
      setMessages(prev => prev.map(m => m.id === optimisticId ? confirmed : m))
    } catch {
      setMessages(prev =>
        prev.map(m => m.id === optimisticId ? { ...m, optimistic: false, failed: true } : m)
      )
      setSendError(true)
      setBody(trimmed)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div ref={listRef} className={listClassName ?? 'flex flex-col gap-2 max-h-56 overflow-y-auto pr-0.5'}>
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
        {!initialLoadDone ? null : messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">{labels.empty}</p>
        ) : (
          messages.map(msg => (
            <ChatMessageRow
              key={msg.id}
              msg={msg}
              deletedLabel={labels.deleted}
              kindLabels={labels.kindLabels}
            />
          ))
        )}
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
          }}
          maxLength={1000}
          placeholder={labels.inputPlaceholder}
          className="flex-1 text-base min-h-10 px-2.5 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !body.trim()}
          className="text-sm min-h-10 px-3 rounded-lg bg-foreground text-background disabled:opacity-40 transition-opacity shrink-0"
        >
          {labels.send}
        </button>
      </div>
      {sendError && (
        <p className="text-xs text-destructive">{labels.sendError}</p>
      )}
    </>
  )
}
