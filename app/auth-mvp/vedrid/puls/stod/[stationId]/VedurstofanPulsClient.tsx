'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChevronLeft } from 'lucide-react'
import { ScopedChatPanel } from '@/components/chat/ScopedChatPanel'
import { VEDURPULS_TRANSPORT } from '@/app/auth-mvp/vedrid/vedurpulsTransport'
import type { ThreadDto } from '@/lib/chat/types'

interface VedurstofanPulsClientProps {
  stationId: string
  stationName: string
  returnTo: string | null
}

/** Only allow returnTo values that are internal /auth-mvp/vedrid paths. */
function resolveBackHref(returnTo: string | null, stationId: string): string {
  const fallback = `/auth-mvp/vedrid/elta-vedrid?stationId=${stationId}`
  if (!returnTo) return fallback
  try {
    const decoded = decodeURIComponent(returnTo)
    if (decoded.startsWith('/auth-mvp/vedrid')) return decoded
  } catch { /* ignore malformed encoding */ }
  return fallback
}

export function VedurstofanPulsClient({ stationId, stationName, returnTo }: VedurstofanPulsClientProps) {
  const t = useTranslations('teskeid.vedrid.eltaVedrid')
  const backHref = resolveBackHref(returnTo, stationId)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [threadError, setThreadError] = useState(false)

  useEffect(() => {
    async function initThread() {
      try {
        const res = await fetch('/api/auth-mvp/vedurpuls/thread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId: stationId }),
        })
        if (res.status === 401 || res.status === 403 || res.status === 503) {
          setAccessDenied(true)
          return
        }
        if (!res.ok) { setThreadError(true); return }
        const thread: ThreadDto = await res.json()
        setThreadId(thread.id)
      } catch {
        setThreadError(true)
      }
    }
    initThread()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const panelLabels = {
    empty: t('pulseEmpty'),
    inputPlaceholder: t('pulseInputPlaceholder'),
    send: t('pulseSend'),
    sendError: t('pulseSendError'),
    deleted: t('pulseDeleted'),
    loadOlder: t('pulseLoadOlder'),
    kindLabels: {
      field_report: t('pulseKindField'),
      measurement_report: t('pulseKindMeasurement'),
    },
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 max-w-2xl mx-auto pb-12">
      <div className="flex flex-col gap-1">
        <Link
          href={backHref}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
        >
          <ChevronLeft className="w-3 h-3" />
          {t('back')}
        </Link>
        <h1 className="text-lg font-semibold">{stationName}</h1>
        <p className="text-xs text-muted-foreground">{t('pulseOpen')}</p>
      </div>

      {accessDenied && (
        <p className="text-sm text-muted-foreground">{t('pulseAccessDenied')}</p>
      )}
      {threadError && (
        <p className="text-sm text-destructive">{t('loadError')}</p>
      )}
      {!threadId && !accessDenied && !threadError && (
        <p className="text-xs text-muted-foreground">{t('pulseLoading')}</p>
      )}
      {threadId && (
        <ScopedChatPanel
          threadId={threadId}
          transport={VEDURPULS_TRANSPORT}
          labels={panelLabels}
          pageSize={50}
          listClassName="flex flex-col gap-2 max-h-[calc(100vh-16rem)] overflow-y-auto pr-0.5"
        />
      )}
    </div>
  )
}
