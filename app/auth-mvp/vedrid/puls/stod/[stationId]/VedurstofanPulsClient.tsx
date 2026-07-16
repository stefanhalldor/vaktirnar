'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { ChevronLeft } from 'lucide-react'
import { ScopedChatPanel } from '@/components/chat/ScopedChatPanel'
import { VEDURPULS_TRANSPORT } from '@/app/auth-mvp/vedrid/vedurpulsTransport'
import { resolvePulseBackDestination } from '@/lib/weather/pulseBack'
import { ForecastRowLine, selectUpcomingRows, type ForecastRowData } from '@/components/weather/VedurstofanForecastRows'
import { formatKlTime } from '@/components/weather/travelAuditMap.helpers'
import type { ThreadDto } from '@/lib/chat/types'

interface VedurstofanPulsClientProps {
  stationId: string
  stationName: string
  returnTo: string | null
  forecastRows: ForecastRowData[]
  atimeIso: string | null
}

export function VedurstofanPulsClient({ stationId, stationName, returnTo, forecastRows, atimeIso }: VedurstofanPulsClientProps) {
  const t = useTranslations('teskeid.vedrid.eltaVedrid')
  const locale = useLocale()
  const backDest = resolvePulseBackDestination(returnTo)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [threadError, setThreadError] = useState(false)
  const [showAllForecast, setShowAllForecast] = useState(false)

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
    loading: t('pulseLoading'),
    inputPlaceholder: t('pulseInputPlaceholderCompact'),
    send: t('pulseSend'),
    sendError: t('pulseSendError'),
    deleted: t('pulseDeleted'),
    loadOlder: t('pulseLoadOlder'),
    kindLabels: {
      field_report: t('pulseKindField'),
      measurement_report: t('pulseKindMeasurement'),
    },
  }

  const displayRows = showAllForecast
    ? [...forecastRows].sort((a, b) => Date.parse(a.ftimeIso) - Date.parse(b.ftimeIso))
    : selectUpcomingRows(forecastRows, 3)

  return (
    <div className="flex flex-col gap-4 px-4 py-4 max-w-2xl mx-auto pb-12">
      <div className="flex flex-col gap-1">
        {backDest && (
          <Link
            href={backDest.href}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
          >
            <ChevronLeft className="w-3 h-3" />
            {backDest.kind === 'trip' ? t('backToTrip') : t('backToStationExplorer')}
          </Link>
        )}
        <h1 className="text-lg font-semibold">{stationName}</h1>
        <p className="text-xs text-muted-foreground">{t('pulseOpen')}</p>
      </div>

      {/* Forecast context */}
      {(forecastRows.length > 0 || atimeIso) && (
        <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card px-3 py-2.5">
          {atimeIso && (
            <p className="text-[11px] text-muted-foreground/70">
              {t('pulseForecastFrom', { time: formatKlTime(atimeIso) })}
            </p>
          )}
          {displayRows.length > 0 ? (
            <div className="flex flex-col divide-y divide-border/40">
              {displayRows.map(row => (
                <ForecastRowLine
                  key={row.ftimeIso}
                  row={row}
                  isUsed={false}
                  locale={locale}
                  usedMarker=""
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('pulseNoForecast')}</p>
          )}
          {forecastRows.length > 3 && !showAllForecast && (
            <button
              type="button"
              onClick={() => setShowAllForecast(true)}
              className="text-xs text-muted-foreground underline underline-offset-2 self-start hover:text-foreground transition-colors mt-0.5"
            >
              {t('pulseForecastShowAll')}
            </button>
          )}
        </div>
      )}

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
