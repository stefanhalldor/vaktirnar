'use client'

import { useLocale, useTranslations } from 'next-intl'
import type {
  DeterministicResult,
  ResolvedTravelThresholds,
  RouteWeatherPoint,
  TravelCandidate,
  TravelIssue,
  WeatherStatus,
} from '@/lib/weather/types'
import { resolveThresholds } from '@/lib/weather/thresholds'
import { classifyPointWindDisplayStatus } from '@/lib/weather/windDisplayStatus'
import { RouteWeatherPointDetailCard } from './RouteWeatherPointDetailCard'
import { WindStatusBadge } from './WindStatusBadge'
import {
  buildPointSummary,
  formatCompactDateTime,
  formatNum,
} from './travelAuditMap.helpers'

const STATUS_CARD_CLASS: Record<WeatherStatus, string> = {
  graent: 'border-primary/25 bg-primary/5',
  gult: 'border-amber-300 bg-amber-50/70',
  rautt: 'border-destructive/30 bg-destructive/5',
}

export function RouteTravelDetails({
  result,
  candidate,
  status,
  answer,
  thresholds,
  originName,
  destinationName,
  selectedRouteIndex,
}: {
  result: DeterministicResult
  candidate: TravelCandidate | null
  status: WeatherStatus
  answer: string
  thresholds: ResolvedTravelThresholds
  originName: string
  destinationName: string
  selectedRouteIndex?: number | null
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const t = useTranslations('teskeid.vedrid')
  const locale = useLocale()
  const route = result.travelPlan?.route
  const points = result.travelPlan?.routeWeatherPoints ?? []
  const activeCandidate =
    candidate ??
    result.travelPlan?.outbound.leavingAt ??
    result.travelPlan?.outbound.candidates[0] ??
    null
  const decisiveRouteIndex =
    activeCandidate?.displayPoint?.routeIndex ??
    result.travelPlan?.highlightedIssue?.routeIndex ??
    points.find(point => point.isHighlightedIssue)?.routeIndex ??
    null
  const decisivePoint =
    decisiveRouteIndex === null
      ? points[0]
      : points.find(point => point.routeIndex === decisiveRouteIndex) ?? points[0]
  const primaryPoint =
    selectedRouteIndex == null
      ? decisivePoint
      : points.find(point => point.routeIndex === selectedRouteIndex) ?? decisivePoint
  const primaryIsDecisive = primaryPoint?.routeIndex === decisivePoint?.routeIndex
  const remainingPoints = primaryPoint
    ? points.filter(point => point.routeIndex !== primaryPoint.routeIndex)
    : points

  return (
    <div className="space-y-3">
      <section className={`rounded-xl border p-3 ${STATUS_CARD_CLASS[status]}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-muted-foreground">
            {tf('sectionOnWay')}
          </p>
          <WindStatusBadge
            status={
              status === 'rautt'
                ? 'haettulegt'
                : status === 'gult'
                  ? 'othaegilegt'
                  : 'innan-marka'
            }
            variant="line"
          />
        </div>
        <p className="mt-2 text-sm text-foreground">{answer}</p>
        {route && (
          <p className="mt-1 text-xs text-muted-foreground">
            {originName} → {destinationName}
            {' · '}
            {formatNum(route.distanceKm, locale)} km
            {' · '}
            {Math.round(route.durationMinutes / 60)} klst. {route.durationMinutes % 60} mín.
          </p>
        )}
        {activeCandidate && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t('roadMapPrototypeDepartureLabel')}: {formatCompactDateTime(activeCandidate.departureIso, locale)}
            {' · '}
            {tf('sectionDestination')}: {formatCompactDateTime(activeCandidate.arrivalIso, locale)}
          </p>
        )}
      </section>

      {primaryPoint && (
        <section className="space-y-1.5">
          <p className="text-xs font-semibold text-foreground">
            {primaryIsDecisive
              ? tf('worstPointTitle')
              : `${tf('pointLabel')} ${primaryPoint.routeIndex + 1}/${primaryPoint.totalRouteWeatherPoints}`}
          </p>
          <RoutePointCard
            point={primaryPoint}
            candidate={activeCandidate}
            thresholds={thresholds}
            originName={originName}
            highlightedIssue={result.travelPlan?.highlightedIssue}
            highlighted={primaryIsDecisive}
          />
        </section>
      )}

      {remainingPoints.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold text-foreground">{tf('routePointsTitle')}</p>
          {remainingPoints.map(point => (
            <RoutePointCard
              key={point.id}
              point={point}
              candidate={activeCandidate}
              thresholds={thresholds}
              originName={originName}
            />
          ))}
        </section>
      )}
    </div>
  )
}

function RoutePointCard({
  point,
  candidate,
  thresholds,
  originName,
  highlightedIssue,
  highlighted = false,
}: {
  point: RouteWeatherPoint
  candidate: TravelCandidate | null
  thresholds?: ResolvedTravelThresholds
  originName: string
  highlightedIssue?: TravelIssue
  highlighted?: boolean
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const resolvedThresholds = thresholds ?? resolveThresholds('none')
  const summary = buildPointSummary(
    point,
    highlighted ? highlightedIssue : undefined,
    candidate ?? undefined,
    'outbound',
  )
  const windStatus = classifyPointWindDisplayStatus(
    summary.windMs,
    summary.hasData,
    resolvedThresholds,
  )

  return (
    <article className={`rounded-lg border px-3 py-2 ${
      highlighted ? 'border-primary/35 bg-primary/5' : 'border-border bg-card'
    }`}>
      <RouteWeatherPointDetailCard
        summary={summary}
        thresholdsUsed={resolvedThresholds}
        originName={originName}
        headerExtra={
          <>
            <WindStatusBadge status={windStatus} variant="chip" />
            {highlighted && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {tf('decisivePointLabel')}
              </span>
            )}
          </>
        }
      />
    </article>
  )
}
