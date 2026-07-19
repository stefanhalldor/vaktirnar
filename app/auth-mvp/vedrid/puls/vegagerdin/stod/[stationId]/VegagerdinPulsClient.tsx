'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { ChevronLeft } from 'lucide-react'
import { ScopedChatPanel } from '@/components/chat/ScopedChatPanel'
import { VEDURPULS_TRANSPORT } from '@/app/auth-mvp/vedrid/vedurpulsTransport'
import { resolvePulseBackDestination } from '@/lib/weather/pulseBack'
import { ForecastRowLine, selectForecastWindow, type ForecastRowData } from '@/components/weather/VedurstofanForecastRows'
import { ProviderStationContextMap } from '@/components/weather/ProviderStationContextMap'
import { formatKlTime, formatCompactDateTime, formatNum } from '@/components/weather/travelAuditMap.helpers'
import { formatChatDayLabel, calendarDateKey } from '@/lib/chat/format'
import type { ThreadDto } from '@/lib/chat/types'
import type { VegagerdinCurrentMeasurement } from '@/lib/weather/providers/vegagerdinCurrentTypes'
import type { NearbyVedurstofanStation } from './page'

interface VegagerdinPulsClientProps {
  stationId: string
  measurement: VegagerdinCurrentMeasurement
  returnTo: string | null
  nearbyStations: NearbyVedurstofanStation[]
}

export function VegagerdinPulsClient({
  stationId,
  measurement,
  returnTo,
  nearbyStations,
}: VegagerdinPulsClientProps) {
  const t = useTranslations('teskeid.vedrid.eltaVedrid')
  const locale = useLocale()
  const backDest = resolvePulseBackDestination(returnTo)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [threadError, setThreadError] = useState(false)

  useEffect(() => {
    async function initThread() {
      try {
        const res = await fetch('/api/auth-mvp/vedurpuls/thread', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'vegagerdin', targetId: stationId }),
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

  return (
    <div className="flex flex-col gap-4 px-4 py-4 max-w-2xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col gap-1">
        {backDest && (
          <Link
            href={backDest.href}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
          >
            <ChevronLeft className="w-3 h-3" />
            {backDest.kind === 'trip'
              ? t('backToTrip')
              : backDest.kind === 'overview'
                ? t('backToOverview')
                : t('backToStationExplorer')}
          </Link>
        )}
        <h1 className="text-lg font-semibold">{measurement.stationName}</h1>
        <p className="text-xs text-muted-foreground">{t('vegagerdinPulseOpen')}</p>
      </div>

      {/* Current Vegagerðin measurement context */}
      <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card px-3 py-2.5">
        <p className="text-[11px] text-muted-foreground/70">
          {t('vegagerdinMeasurementAt')}: {formatKlTime(measurement.measuredAtIso)}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {measurement.meanWindMs !== null && (
            <span>{t('vegagerdinMeanWind')}: {formatNum(measurement.meanWindMs, locale)} m/s</span>
          )}
          {measurement.gustLast10MinMs !== null && (
            <span>{t('vegagerdinGust')}: {formatNum(measurement.gustLast10MinMs, locale)} m/s</span>
          )}
          {measurement.airTemperatureC !== null && (
            <span>{t('vegagerdinAirTemp')}: {formatNum(measurement.airTemperatureC, locale)}°C</span>
          )}
          {measurement.roadTemperatureC !== null && (
            <span>{t('vegagerdinRoadTemp')}: {formatNum(measurement.roadTemperatureC, locale)}°C</span>
          )}
        </div>
      </div>

      {/* Chat panel */}
      {accessDenied && (
        <p className="text-sm text-muted-foreground">{t('pulseAccessDenied')}</p>
      )}
      {threadError && (
        <p className="text-sm text-destructive">{t('pulseThreadError')}</p>
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
          locale={locale}
          listClassName="flex flex-col gap-2 max-h-[calc(100vh-16rem)] overflow-y-auto pr-0.5"
        />
      )}

      {/* Station context map — Vegagerðin selected station + nearby Veðurstofan points */}
      <ProviderStationContextMap
        primary={{
          providerId: 'vegagerdin',
          providerLabel: 'Vegagerðin',
          id: measurement.stationId,
          label: measurement.stationName,
          lat: measurement.lat,
          lon: measurement.lon,
          tone: 'ok',
        }}
        related={nearbyStations.map(s => ({
          providerId: 'vedurstofan',
          providerLabel: 'Veðurstofan',
          id: s.stationId,
          label: s.stationName,
          lat: s.lat,
          lon: s.lon,
          tone: 'muted' as const,
          meta: `${(s.distanceM / 1000).toFixed(1)} km`,
        }))}
        loadingLabel={t('pulseLoading')}
        errorLabel={t('mapUnavailable')}
      />

      {/* Nearby Veðurstofan forecast context */}
      {nearbyStations.length > 0 && (
        <div className="flex flex-col gap-3 mt-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t('vegagerdinNearbyTitle')}
          </p>
          {nearbyStations.map(s => (
            <NearbyStationCard key={s.stationId} station={s} locale={locale} />
          ))}
        </div>
      )}
    </div>
  )
}

function NearbyStationCard({
  station,
  locale,
}: {
  station: NearbyVedurstofanStation
  locale: string
}) {
  const t = useTranslations('teskeid.vedrid.eltaVedrid')
  const [showAll, setShowAll] = useState(false)
  const distanceKm = (station.distanceM / 1000).toFixed(1)
  const displayRows = showAll
    ? [...station.forecastRows].sort((a, b) => Date.parse(a.ftimeIso) - Date.parse(b.ftimeIso))
    : selectForecastWindow(station.forecastRows, 2, 2)

  return (
    <div className="rounded-lg border border-border/40 bg-card px-3 py-2.5 flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium">{station.stationName}</p>
        <span className="text-[11px] text-muted-foreground shrink-0">
          {distanceKm} {t('vegagerdinNearbyKm')}
        </span>
      </div>
      {station.atimeIso && (
        <p className="text-[11px] text-muted-foreground/70">
          {t('pulseForecastFrom', { time: formatKlTime(station.atimeIso) })}
        </p>
      )}
      {displayRows.length > 0 ? (
        <div className="flex flex-col divide-y divide-border/40">
          {(() => {
            let lastDay = ''
            return displayRows.map(row => {
              const day = calendarDateKey(row.ftimeIso)
              const showDayLabel = day !== lastDay
              lastDay = day
              return (
                <div key={row.ftimeIso}>
                  {showDayLabel && (
                    <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wide pt-1.5 pb-0.5 first:pt-0">
                      {formatChatDayLabel(row.ftimeIso, locale)}
                    </p>
                  )}
                  <ForecastRowLine row={row} isUsed={false} locale={locale} usedMarker="" />
                </div>
              )
            })
          })()}
        </div>
      ) : (
        station.forecastRows.length === 0 && (
          <p className="text-xs text-muted-foreground">{t('pulseNoForecast')}</p>
        )
      )}
      {station.forecastRows.length > 3 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-xs text-muted-foreground underline underline-offset-2 self-start hover:text-foreground transition-colors mt-0.5"
        >
          {t('pulseForecastShowAll')}
        </button>
      )}
    </div>
  )
}
