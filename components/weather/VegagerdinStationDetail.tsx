'use client'

import { useEffect, useRef } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { VegagerdinStationDetail as StationDetail } from '@/lib/weather/providers/vegagerdinStationDetailTypes'
import {
  shouldWarnVegagerdinStationAge,
  vegagerdinStationUrl,
} from '@/lib/weather/vegagerdinStationPresentation'
import { formatKlTime, formatNum } from './travelAuditMap.helpers'

function valueOrDash(value: number | null, locale: string, suffix = ''): string {
  return value === null ? '–' : `${formatNum(value, locale)}${suffix}`
}

export function VegagerdinStationDetail({
  detail,
  loading,
  fallbackStationId,
  fallbackName,
  fallbackMeasuredAtIso,
  onClose,
}: {
  detail: StationDetail | null
  loading: boolean
  fallbackStationId: string
  fallbackName: string
  fallbackMeasuredAtIso: string
  onClose: () => void
}) {
  const t = useTranslations('teskeid.vedrid.overview')
  const locale = useLocale()
  const closeRef = useRef<HTMLButtonElement>(null)
  const stationId = detail?.stationId ?? fallbackStationId
  const measuredAtIso = detail?.measuredAtIso ?? fallbackMeasuredAtIso
  const externalHref = vegagerdinStationUrl(stationId)
  const showAgeWarning = shouldWarnVegagerdinStationAge(measuredAtIso)

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true })
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="absolute inset-x-0 bottom-0 z-[180] flex max-h-[calc(100dvh-4.5rem)] justify-center px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:inset-0 sm:items-center sm:bg-black/25 sm:p-4">
      <section
        role="dialog"
        aria-modal="false"
        aria-labelledby="vegagerdin-station-detail-title"
        className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      >
        <header className="flex items-start gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="vegagerdin-station-detail-title" className="truncate text-base font-semibold">
              {detail?.stationName ?? fallbackName}
            </h2>
            <p className="text-xs text-muted-foreground">{t('vegagerdinDetailProvider')}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('vegagerdinDetailClose')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="overflow-y-auto overscroll-contain px-4 py-3">
          {showAgeWarning && externalHref && (
            <a
              href={externalHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-4 flex min-h-11 items-center justify-center gap-2 rounded-lg border border-amber-700/30 bg-amber-50 px-3 py-2 text-center text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-amber-950/30 dark:text-amber-100"
            >
              {t('vegagerdinDetailStaleAction', { time: formatKlTime(measuredAtIso) })}
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
            </a>
          )}

          {loading && !detail ? (
            <p role="status" className="py-8 text-center text-sm text-muted-foreground">
              {t('vegagerdinDetailLoading')}
            </p>
          ) : detail ? (
            <>
              <dl className="grid grid-cols-2 divide-x divide-y divide-border border-y border-border sm:grid-cols-3">
                <Metric label={t('vegagerdinDetailWind')} value={`${valueOrDash(detail.meanWindMs, locale, ' m/s')}${detail.windDirectionText ? ` ${detail.windDirectionText}` : ''}`} />
                <Metric label={t('vegagerdinDetailGust')} value={valueOrDash(detail.gustLast10MinMs, locale, ' m/s')} />
                <Metric label={t('vegagerdinDetailAirTemperature')} value={valueOrDash(detail.airTemperatureC, locale, ' °C')} />
                <Metric label={t('vegagerdinDetailRoadTemperature')} value={valueOrDash(detail.roadTemperatureC, locale, ' °C')} />
                <Metric label={t('vegagerdinDetailTraffic10Min')} value={valueOrDash(detail.trafficLast10Min, locale)} />
                <Metric label={t('vegagerdinDetailTrafficMidnight')} value={valueOrDash(detail.trafficFromMidnight, locale)} />
                <Metric label={t('vegagerdinDetailDewPoint')} value={valueOrDash(detail.dewPointC, locale, ' °C')} />
                <Metric label={t('vegagerdinDetailHumidity')} value={valueOrDash(detail.humidityPercent, locale, '%')} />
                <Metric label={t('vegagerdinDetailMeasuredAt')} value={formatKlTime(detail.measuredAtIso)} />
                <Metric label={t('vegagerdinDetailOwner')} value={detail.ownerName ?? '–'} />
              </dl>

              {detail.cameras.length > 0 && (
                <section className="mt-5" aria-labelledby="vegagerdin-camera-title">
                  <h3 id="vegagerdin-camera-title" className="text-sm font-semibold">
                    {t('vegagerdinDetailCameras')}
                  </h3>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {detail.cameras.map(camera => (
                      <figure key={camera.id} className="overflow-hidden rounded-lg border border-border bg-muted/20">
                        {/* Official public camera image; no Next image proxy/cache. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={camera.imageUrl}
                          alt={camera.description}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="aspect-video w-full object-cover"
                        />
                        <figcaption className="px-3 py-2 text-xs text-muted-foreground">
                          {camera.description}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground">{t('vegagerdinDetailUnavailable')}</p>
              {externalHref && (
                <a href={externalHref} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {t('roadMapPrototypeVegagerdinOpenUmferdin')}
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-foreground">{value}</dd>
    </div>
  )
}
