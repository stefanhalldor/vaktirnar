'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChatPreviewList } from '@/components/chat/ChatPreviewList'
import { ScopedChatComposer } from '@/components/chat/ScopedChatComposer'
import type { AugmentedChatMessage } from '@/components/chat/ChatMessageRow'

interface VedurstofanPulseInlineProps {
  stationId: string
  /**
   * Return URL for the full pulse route "Til baka" link.
   * When provided, a "Sjá fleiri skilaboð" link is shown.
   * When omitted, the full link is hidden — safe default for contexts where
   * the caller cannot guarantee a restorable return path.
   */
  returnTo?: string
}

type PostingAccess = 'unknown' | 'allowed' | 'needs-login' | 'denied'

/**
 * Shared Veðurpúls panel for all station card contexts.
 *
 * Used from:
 * - VedurstofanPointCard / VedurstofanJourneySummary (travel route cards)
 * - StationDetail in /elta-vedrid (station explorer)
 *
 * Public preview is always shown. Posting is gated by an on-mount access check.
 * Thread is created lazily on first send.
 */
export function VedurstofanPulseInline({ stationId, returnTo }: VedurstofanPulseInlineProps) {
  const t = useTranslations('teskeid.vedrid.eltaVedrid')
  const [messages, setMessages] = useState<AugmentedChatMessage[]>([])
  const [previewLoaded, setPreviewLoaded] = useState(false)
  const [postingAccess, setPostingAccess] = useState<PostingAccess>('unknown')
  const [composeBody, setComposeBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(false)
  const threadIdRef = useRef<string | null>(null)

  // Preview — loads immediately and polls every 30 s (same cadence as WeatherPulseFeed)
  useEffect(() => {
    let cancelled = false
    async function loadPreview() {
      try {
        const res = await fetch(`/api/teskeid/weather/vedurpuls/stations/${stationId}/preview`)
        if (res.ok && !cancelled) setMessages(await res.json())
      } catch { /* silent */ } finally {
        if (!cancelled) setPreviewLoaded(true)
      }
    }
    loadPreview()
    const id = setInterval(loadPreview, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId])

  // Access check — one-time on mount; 401 = not logged in, 403/503 = no posting access
  useEffect(() => {
    async function checkAccess() {
      try {
        const res = await fetch('/api/auth-mvp/vedurpuls/access')
        if (res.status === 200) { setPostingAccess('allowed'); return }
        if (res.status === 401) { setPostingAccess('needs-login'); return }
        setPostingAccess('denied')
      } catch {
        setPostingAccess('denied')
      }
    }
    checkAccess()
  }, [])

  async function handleSend() {
    const body = composeBody.trim()
    if (!body || sending) return
    setSending(true)
    setSendError(false)
    try {
      if (!threadIdRef.current) {
        const res = await fetch('/api/auth-mvp/vedurpuls/thread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId: stationId }),
        })
        if (res.status === 401) { setPostingAccess('needs-login'); return }
        if (res.status === 403 || res.status === 503) { setPostingAccess('denied'); return }
        if (!res.ok) { setSendError(true); return }
        threadIdRef.current = (await res.json()).id
      }
      const sendRes = await fetch('/api/auth-mvp/vedurpuls/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: threadIdRef.current, body }),
      })
      if (!sendRes.ok) { setSendError(true); return }
      setComposeBody('')
      const previewRes = await fetch(`/api/teskeid/weather/vedurpuls/stations/${stationId}/preview`)
      if (previewRes.ok) setMessages(await previewRes.json())
    } catch { setSendError(true) } finally {
      setSending(false)
    }
  }

  const kindLabels = {
    field_report: t('pulseKindField'),
    measurement_report: t('pulseKindMeasurement'),
  }

  const fullHref = returnTo
    ? `/auth-mvp/vedrid/puls/stod/${stationId}?returnTo=${encodeURIComponent(returnTo)}`
    : null

  // Login CTA: always points to the full pulse page; returnTo carried when available.
  const loginNextHref = `/auth-mvp/vedrid/puls/stod/${stationId}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`
  const loginHref = `/innskraning?next=${encodeURIComponent(loginNextHref)}`

  // Hide the whole component when there is nothing useful to show:
  // no messages to preview and no composer available (public/denied user).
  // This prevents rendering an empty "Nýjast af staðnum" header on public cards.
  const canPost = postingAccess === 'allowed'
  if (messages.length === 0 && !canPost) return null

  return (
    <div className="flex flex-col gap-2 pt-2 border-t border-border/40">
      <p className="text-xs font-medium text-foreground">{t('pulseInlineHeader')}</p>
      <ChatPreviewList
        messages={messages}
        emptyLabel={t('pulseEmpty')}
        deletedLabel={t('pulseDeleted')}
        kindLabels={kindLabels}
        loaded={previewLoaded}
      />
      {postingAccess === 'allowed' && (
        <div className="flex flex-col gap-1.5">
          <ScopedChatComposer
            value={composeBody}
            onChange={setComposeBody}
            onSend={handleSend}
            disabled={sending}
            placeholder={t('pulseInputPlaceholderCompact')}
            sendLabel={t('pulseSend')}
            variant="compact"
          />
          {sendError && <p className="text-xs text-destructive">{t('pulseSendError')}</p>}
        </div>
      )}
      {postingAccess === 'needs-login' && (
        <Link
          href={loginHref}
          className="text-xs text-muted-foreground underline underline-offset-2 self-start"
        >
          {t('pulseLoginCta')}
        </Link>
      )}
      {fullHref && postingAccess === 'allowed' && (
        <Link
          href={fullHref}
          className="text-xs text-muted-foreground underline underline-offset-2 self-start hover:text-foreground transition-colors"
        >
          {t('pulseViewMore')}
        </Link>
      )}
    </div>
  )
}
