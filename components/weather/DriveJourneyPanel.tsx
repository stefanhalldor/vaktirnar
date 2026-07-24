'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type {
  ForecastDrawerRow,
  ResolvedTravelThresholds,
  TravelCandidate,
  WeatherStatus,
} from '@/lib/weather/types'
import type { VedurstofanTravelLayer } from '@/lib/weather/providers/vedurstofanBlend'
import {
  classifyNearestForecastWindDisplayStatusAt,
  selectNearestForecastRowAt,
  ALL_WIND_DISPLAY_STATUSES,
  type WindDisplayStatus,
} from '@/lib/weather/windDisplayStatus'
import { DepartureHeatmap } from './DepartureHeatmap'
import { VedurstofanPointCard } from './VedurstofanPointCard'
import { WeatherWatchersComparison } from './WeatherWatchersComparison'
import { formatCompactDateTime, formatNum } from './travelAuditMap.helpers'

type Station = VedurstofanTravelLayer['points'][number]
type ForecastRow = Station['forecastRows'][number]

const STATUS_RANK: Record<WindDisplayStatus, number> = {
  haettulegt: 6,
  'nalgast-haettumork': 5,
  othaegilegt: 4,
  'nalgast-othaegindi': 3,
  no_data: 2,
  no_wind_data: 1,
  'innan-marka': 0,
}

type StationAssessment = {
  station: Station
  etaIso: string | null
  row: ForecastRow | null
  status: WindDisplayStatus
}

export function buildDriveStationAssessment(
  station: Station,
  candidate: TravelCandidate | null,
  durationMinutes: number,
  thresholds: ResolvedTravelThresholds,
): StationAssessment {
  const departureMs = candidate ? Date.parse(candidate.departureIso) : Date.now()
  const etaMs =
    Number.isFinite(departureMs) && station.routeFraction !== null
      ? departureMs + station.routeFraction * Math.max(0, durationMinutes) * 60_000
      : departureMs
  const rowIndex = selectNearestForecastRowAt(station.forecastRows, etaMs)
  return {
    station,
    etaIso: Number.isFinite(etaMs) ? new Date(etaMs).toISOString() : null,
    row: rowIndex === null ? null : station.forecastRows[rowIndex],
    status: classifyNearestForecastWindDisplayStatusAt(
      station.forecastRows,
      thresholds,
      etaMs,
    ),
  }
}

export function vedurstofanRowsToComparisonRows(rows: ForecastRow[]): ForecastDrawerRow[] {
  return rows
    .filter(row =>
      Number.isFinite(Date.parse(row.ftimeIso)) &&
      row.windSpeedMs !== null &&
      row.temperatureC !== null,
    )
    .map(row => ({
      timeIso: row.ftimeIso,
      status: 'graent' as const,
      temperature: {
        value: row.temperatureC ?? 0,
        direction: 'none' as const,
        tone: 'neutral' as const,
      },
      wind: {
        value: row.windSpeedMs ?? 0,
        direction: 'none' as const,
        tone: 'neutral' as const,
      },
      gust: {
        value: row.windSpeedMs ?? 0,
        direction: 'none' as const,
        tone: 'neutral' as const,
        severity: 'none' as const,
      },
      precipitation: {
        value: row.precipitationMmPerHour ?? 0,
        direction: 'none' as const,
        tone: 'neutral' as const,
      },
      windDirectionText: row.windDirectionText,
      weatherEmoji: null,
    }))
}

function statusFromWindDisplay(status: WindDisplayStatus): WeatherStatus {
  if (status === 'haettulegt' || status === 'nalgast-haettumork') return 'rautt'
  if (status === 'othaegilegt' || status === 'nalgast-othaegindi') return 'gult'
  return 'graent'
}

export function DriveJourneyPanel({
  layer,
  candidates,
  selectedCandidateIdx,
  onSelectCandidateIdx,
  slotStatusOverrides,
  thresholds,
  durationMinutes,
  distanceKm,
  originName,
  destinationName,
  onClearRoute,
  routePoints,
}: {
  layer: VedurstofanTravelLayer | null
  candidates: TravelCandidate[]
  selectedCandidateIdx: number | null
  onSelectCandidateIdx: (index: number | null) => void
  slotStatusOverrides?: WindDisplayStatus[]
  thresholds: ResolvedTravelThresholds
  durationMinutes: number
  distanceKm: number
  originName: string
  destinationName: string
  onClearRoute: () => void
  routePoints: Array<{ lat: number; lon: number }>
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const t = useTranslations('teskeid.vedrid.overview')
  const locale = useLocale()
  const [visibleStatuses, setVisibleStatuses] = useState<Set<WindDisplayStatus>>(
    () => new Set(ALL_WIND_DISPLAY_STATUSES),
  )
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null)
  const candidate =
    selectedCandidateIdx !== null
      ? candidates[selectedCandidateIdx] ?? candidates[0] ?? null
      : candidates[0] ?? null
  const stations = layer?.points
    .filter(station => station.forecastRows.length > 0)
    .sort((a, b) => (a.routeFraction ?? 0) - (b.routeFraction ?? 0)) ?? []
  const assessments = stations.map(station =>
    buildDriveStationAssessment(station, candidate, durationMinutes, thresholds),
  )
  const worst = assessments.reduce<StationAssessment | null>((current, assessment) => {
    if (!current) return assessment
    const rankDelta = STATUS_RANK[assessment.status] - STATUS_RANK[current.status]
    if (rankDelta > 0) return assessment
    if (rankDelta === 0 && (assessment.row?.windSpeedMs ?? -1) > (current.row?.windSpeedMs ?? -1)) {
      return assessment
    }
    return current
  }, null)
  const originStation = stations[0] ?? null
  const destinationStation = stations[stations.length - 1] ?? null
  const originRows = originStation ? vedurstofanRowsToComparisonRows(originStation.forecastRows) : []
  const destinationRows = destinationStation ? vedurstofanRowsToComparisonRows(destinationStation.forecastRows) : []
  const effectiveStatus = worst ? statusFromWindDisplay(worst.status) : 'graent'
  const selectedAssessment =
    assessments.find(assessment => assessment.station.routePointId === selectedStationId) ??
    worst

  if (!layer || stations.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {t('roadMapPrototypeDepartureOptInUnavailable')}
      </div>
    )
  }

  return (
    <div className="p-3">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2 dark:border-blue-800 dark:bg-blue-950/30">
          <p className="text-[10px] font-semibold text-blue-900 dark:text-blue-200">
            {tf('thresholdBoxTitle')}
          </p>
          <p className="mt-0.5 text-xs text-blue-800 dark:text-blue-300">
            {tf('thresholdSummaryLine', {
              caution: thresholds.cautionWindMs,
              red: thresholds.redWindMs,
            })}
          </p>
        </div>

        {candidates.length > 1 && (
          <div className="mt-3">
            <DepartureHeatmap
              candidates={candidates}
              bestWindow={undefined}
              originName={originName}
              selectedIdx={selectedCandidateIdx}
              onSelectIdx={onSelectCandidateIdx}
              visibleStatuses={visibleStatuses}
              onVisibleStatusesChange={setVisibleStatuses}
              thresholdsUsed={thresholds}
              showSelectedDetail={false}
              slotStatusOverrides={slotStatusOverrides}
              firstSlotLabel={t('roadMapPrototypeScrubberNow')}
              showBestWindowHint={false}
            />
          </div>
        )}

        {candidate && (
          <p className="mt-3 text-sm leading-snug text-foreground">
            {tf.rich('departureCalculationContext', {
              departure: formatCompactDateTime(candidate.departureIso, locale),
              b: chunks => <strong className="font-semibold">{chunks}</strong>,
              br: () => <br />,
            })}
          </p>
        )}

        <div className="mt-3 border-y border-border/70 divide-y divide-border/60">
          {worst && (
            <VedurstofanPointCard
              variant="compact"
              station={worst.station}
              status={worst.status}
              etaIso={worst.etaIso}
              departureIso={candidate?.departureIso ?? null}
              ftimeIso={worst.row?.ftimeIso ?? null}
              windMs={worst.row?.windSpeedMs ?? null}
              originName={originName}
              returnTo="/auth-mvp/vedrid/road-map-prototype"
            />
          )}

          {destinationStation && (() => {
            const destinationAssessment = assessments[assessments.length - 1]
            const row = destinationAssessment?.row
            return (
              <section className="grid grid-cols-[5.25rem_1fr] gap-3 py-3">
                <p className="pt-0.5 text-[11px] font-semibold text-muted-foreground">
                  {tf('sectionDestination')}
                </p>
                <div className="space-y-1">
                  {destinationAssessment?.etaIso && (
                    <p className="text-sm font-medium text-foreground">
                      {formatCompactDateTime(destinationAssessment.etaIso, locale)}
                    </p>
                  )}
                  {row && (
                    <p className="text-xs text-muted-foreground">
                      {tf('arrivalForecastAtLabel', {
                        forecastTime: formatCompactDateTime(row.ftimeIso, locale),
                      })}{' '}
                      {tf('metricWind').toLowerCase()} {formatNum(row.windSpeedMs ?? 0, locale)} m/s
                      {' · '}{tf('metricPrecip').toLowerCase()} {formatNum(row.precipitationMmPerHour ?? 0, locale)} mm/klst
                      {' · '}{tf('metricTemp').toLowerCase()} {formatNum(row.temperatureC ?? 0, locale)}°C
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60">
                    {tf('providerVedurstofanLabel')}
                  </p>
                </div>
              </section>
            )
          })()}
        </div>

        {originRows.length > 0 && destinationRows.length > 0 && (
          <WeatherWatchersComparison
            originLabel={originName}
            destinationLabel={destinationName}
            originRows={originRows}
            destinationRows={destinationRows}
            thresholds={thresholds}
          />
        )}

        <section className="mt-4 space-y-3 border-t border-border/70 pt-3">
          <DriveMiniMap
            routePoints={routePoints}
            assessments={assessments}
            selectedStationId={selectedAssessment?.station.routePointId ?? null}
            onSelectStation={setSelectedStationId}
            ariaLabel={tf('auditMapAlt', {
              origin: originName,
              destination: destinationName,
            })}
          />

          {selectedAssessment && (
            <VedurstofanPointCard
              station={selectedAssessment.station}
              status={selectedAssessment.status}
              etaIso={selectedAssessment.etaIso}
              departureIso={candidate?.departureIso ?? null}
              originName={originName}
              panelTitle={
                selectedAssessment.station.routePointId === worst?.station.routePointId
                  ? tf('decisivePointLabel')
                  : tf('manualSelectedPointTitle')
              }
              isManualSelection={selectedAssessment.station.routePointId !== worst?.station.routePointId}
              returnTo="/auth-mvp/vedrid/road-map-prototype"
            />
          )}

          {selectedStationId && selectedStationId !== worst?.station.routePointId && (
            <button
              type="button"
              onClick={() => setSelectedStationId(null)}
              className="min-h-10 text-xs font-medium text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tf('showWorstPoint')}
            </button>
          )}

          <details className="group rounded-xl border border-border bg-card">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <span>{tf('allRouteForecastPointsDrawer')}</span>
              <span className="text-[10px] font-medium text-muted-foreground">
                {t('roadMapPrototypeVedurstofanStationCount', { count: stations.length })}
              </span>
            </summary>
            <div className="space-y-2 border-t border-border/70 p-3">
              {assessments.map(assessment => (
                <VedurstofanPointCard
                  key={assessment.station.routePointId}
                  station={assessment.station}
                  status={assessment.status}
                  etaIso={assessment.etaIso}
                  departureIso={candidate?.departureIso ?? null}
                  originName={originName}
                  panelTitle={
                    assessment.station.routePointId === worst?.station.routePointId
                      ? tf('decisivePointLabel')
                      : undefined
                  }
                  returnTo="/auth-mvp/vedrid/road-map-prototype"
                />
              ))}
            </div>
          </details>
        </section>

        <button
          type="button"
          onClick={onClearRoute}
          className="mt-4 min-h-10 w-full rounded-full border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('roadMapPrototypeRouteClear')}
        </button>
      </div>
    </div>
  )
}

type MiniMapPoint = { x: number; y: number }

export function projectDriveMiniMapPoints(
  points: Array<{ lat: number; lon: number }>,
  width = 320,
  height = 150,
  padding = 14,
): MiniMapPoint[] {
  const valid = points.filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon))
  if (valid.length === 0) return []
  const minLat = Math.min(...valid.map(point => point.lat))
  const maxLat = Math.max(...valid.map(point => point.lat))
  const minLon = Math.min(...valid.map(point => point.lon))
  const maxLon = Math.max(...valid.map(point => point.lon))
  const latSpan = Math.max(maxLat - minLat, 0.001)
  const lonSpan = Math.max(maxLon - minLon, 0.001)
  return valid.map(point => ({
    x: padding + ((point.lon - minLon) / lonSpan) * (width - padding * 2),
    y: height - padding - ((point.lat - minLat) / latSpan) * (height - padding * 2),
  }))
}

function DriveMiniMap({
  routePoints,
  assessments,
  selectedStationId,
  onSelectStation,
  ariaLabel,
}: {
  routePoints: Array<{ lat: number; lon: number }>
  assessments: StationAssessment[]
  selectedStationId: string | null
  onSelectStation: (stationId: string) => void
  ariaLabel: string
}) {
  const width = 320
  const height = 150
  const allCoords = [
    ...routePoints,
    ...assessments
      .filter(assessment => assessment.station.lat !== null && assessment.station.lon !== null)
      .map(assessment => ({ lat: assessment.station.lat!, lon: assessment.station.lon! })),
  ]
  const projected = projectDriveMiniMapPoints(allCoords, width, height)
  const projectedRoute = projected.slice(0, routePoints.length)
  const projectedStations = projected.slice(routePoints.length)
  const routePath = projectedRoute
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ')
  let stationProjectionIndex = 0

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[#eef5f3]">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full"
        role="img"
        aria-label={ariaLabel}
      >
        {routePath && (
          <>
            <path d={routePath} fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <path d={routePath} fill="none" stroke="#154212" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {assessments.map(assessment => {
          if (assessment.station.lat === null || assessment.station.lon === null) return null
          const point = projectedStations[stationProjectionIndex++]
          if (!point) return null
          const selected = assessment.station.routePointId === selectedStationId
          const fill =
            assessment.status === 'haettulegt' || assessment.status === 'nalgast-haettumork'
              ? '#dc2626'
              : assessment.status === 'othaegilegt' || assessment.status === 'nalgast-othaegindi'
                ? '#f59e0b'
                : '#2d5a27'
          return (
            <g
              key={assessment.station.routePointId}
              role="button"
              tabIndex={0}
              aria-label={assessment.station.stationName}
              onClick={() => onSelectStation(assessment.station.routePointId)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelectStation(assessment.station.routePointId)
                }
              }}
              className="cursor-pointer focus:outline-none"
            >
              <circle cx={point.x} cy={point.y} r={selected ? 9 : 7} fill="white" opacity="0.96" />
              <circle cx={point.x} cy={point.y} r={selected ? 6 : 4.5} fill={fill} />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
