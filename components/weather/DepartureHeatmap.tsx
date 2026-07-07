'use client'

import { Fragment } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { TravelCandidate, TravelWindow, WeatherStatus, ResolvedTravelThresholds } from '@/lib/weather/types'
import { WEATHER_THRESHOLDS, deriveThreshold } from '@/lib/weather/thresholds'
import { formatKlTime, formatNum, normalizeLocale } from './travelAuditMap.helpers'

function utcDateKey(isoString: string): string {
  return new Date(isoString).toISOString().slice(0, 10)
}

function formatDayLabel(isoString: string, locale: string): string {
  return new Date(isoString).toLocaleDateString(normalizeLocale(locale), {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

export type SlotStatus = WeatherStatus | 'no_data'

type DepartureHeatmapProps = {
  candidates: TravelCandidate[]
  bestWindow?: TravelWindow
  originName: string
  selectedIdx: number | null
  onSelectIdx: (idx: number | null) => void
  title?: string
  /** For return-leg heatmaps: total route distance in meters used to flip distance direction. */
  routeDistanceM?: number
  /** 'return' flips distanceFromOriginM to distance from return start (destination). */
  leg?: 'outbound' | 'return'
  /** Controlled filter state — which statuses are currently hidden. */
  hiddenStatuses: Set<SlotStatus>
  /** Called when user changes the filter. */
  onHiddenStatusesChange: (next: Set<SlotStatus>) => void
  /** Resolved thresholds used in the current result — for correct SlotDetail threshold display. */
  thresholdsUsed?: ResolvedTravelThresholds
  /** Optional subtitle shown below the title. */
  subtitle?: string
}

const STATUS_BG: Record<SlotStatus, string> = {
  graent: 'bg-[#2d5a27]',
  gult:   'bg-amber-500',
  rautt:  'bg-destructive',
  no_data: 'bg-muted-foreground/30',
}

const STATUS_BORDER: Record<SlotStatus, string> = {
  graent: 'border-[#2d5a27]',
  gult:   'border-amber-500',
  rautt:  'border-destructive',
  no_data: 'border-muted-foreground/30',
}

function slotStatus(c: TravelCandidate): SlotStatus {
  return c.reasonCode === 'no_data' ? 'no_data' : c.status
}

function isBestSlot(c: TravelCandidate, bestWindow?: TravelWindow): boolean {
  if (!bestWindow) return false
  const dep = new Date(c.departureIso).getTime()
  return dep >= new Date(bestWindow.fromIso).getTime() && dep <= new Date(bestWindow.toIso).getTime()
}

const ALL_SLOT_STATUSES: SlotStatus[] = ['graent', 'gult', 'rautt', 'no_data']

export function DepartureHeatmap({ candidates, bestWindow, originName, selectedIdx, onSelectIdx, title, routeDistanceM, leg, hiddenStatuses, onHiddenStatusesChange, thresholdsUsed, subtitle }: DepartureHeatmapProps) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const locale = useLocale()
  const selected = selectedIdx !== null ? candidates[selectedIdx] : null

  if (candidates.length === 0) return null

  // Status counts across all candidates (before filtering)
  const statusCounts: Record<SlotStatus, number> = { graent: 0, gult: 0, rautt: 0, no_data: 0 }
  for (const c of candidates) statusCounts[slotStatus(c)]++

  // Filtered candidates with their real indices in the candidates array
  const filteredWithIdx: Array<{ c: TravelCandidate; realIdx: number }> =
    candidates.reduce<Array<{ c: TravelCandidate; realIdx: number }>>((acc, c, i) => {
      if (hiddenStatuses.size === 0 || !hiddenStatuses.has(slotStatus(c))) {
        acc.push({ c, realIdx: i })
      }
      return acc
    }, [])

  function toggleStatus(st: SlotStatus) {
    const next = new Set(hiddenStatuses)
    if (next.has(st)) {
      next.delete(st)
    } else {
      next.add(st)
      // Deselect if the selected slot is being hidden
      if (selectedIdx !== null && slotStatus(candidates[selectedIdx]) === st) {
        onSelectIdx(null)
      }
    }
    onHiddenStatusesChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-foreground">{title ?? tf('heatmapTitle')}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}

      {/* Status filter chips — always shown so user can see counts and filter */}
      <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onHiddenStatusesChange(new Set())}
            className={`text-[10px] px-2 py-1 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
              hiddenStatuses.size === 0
                ? 'border-foreground/30 bg-foreground/5 text-foreground font-medium'
                : 'border-border bg-transparent text-muted-foreground'
            }`}
          >
            {tf('timelineFilterAll')}
          </button>
          {ALL_SLOT_STATUSES.filter(st => st === 'graent' || statusCounts[st] > 0).map(st => {
            const isHidden = hiddenStatuses.has(st)
            const label = st === 'graent' ? tf('heatmapLegendGreen')
              : st === 'gult' ? tf('heatmapLegendYellow')
              : st === 'rautt' ? tf('heatmapLegendRed')
              : tf('heatmapNoData')
            return (
              <button
                key={st}
                type="button"
                onClick={() => toggleStatus(st)}
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  isHidden
                    ? 'border-border bg-transparent text-muted-foreground/40'
                    : 'border-border bg-transparent text-muted-foreground'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${isHidden ? 'opacity-30' : ''} ${STATUS_BG[st]}`} aria-hidden />
                {label} ({statusCounts[st]})
              </button>
            )
          })}
      </div>

      {/* Scrollable slot row with day separators */}
      {filteredWithIdx.length > 0 ? (
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="flex gap-1.5 min-w-max pb-1 items-end">
            {filteredWithIdx.map(({ c, realIdx }, filteredIdx) => {
              const st = slotStatus(c)
              const best = isBestSlot(c, bestWindow)
              const isSelected = selectedIdx === realIdx
              const dateKey = utcDateKey(c.departureIso)
              const prevDateKey = filteredIdx > 0 ? utcDateKey(filteredWithIdx[filteredIdx - 1].c.departureIso) : null
              const isNewDay = dateKey !== prevDateKey
              return (
                <Fragment key={c.departureIso}>
                  {isNewDay && (
                    <div className="flex flex-col items-center gap-0.5 shrink-0 pb-0.5" aria-hidden>
                      <span className="text-[9px] font-medium text-muted-foreground/60 whitespace-nowrap leading-none">
                        {formatDayLabel(c.departureIso, locale)}
                      </span>
                      <div className="w-px h-6 bg-border/50 mt-0.5" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onSelectIdx(realIdx === selectedIdx ? null : realIdx)}
                    aria-label={`${tf('heatmapSlotDeparture')} ${tf('heatmapSlotDateTime', { date: formatDayLabel(c.departureIso, locale), time: formatKlTime(c.departureIso) })}`}
                    className={`flex flex-col items-center gap-0.5 min-w-[42px] px-1.5 py-1.5 rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isSelected
                        ? `${STATUS_BORDER[st]} border-2 bg-card`
                        : `border-transparent ${best ? 'ring-1 ring-offset-1 ring-primary/50' : ''}`
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full ${STATUS_BG[st]}`} aria-hidden />
                    <span className="text-[10px] text-muted-foreground leading-none">
                      {formatKlTime(c.departureIso)}
                    </span>
                    {best && !isSelected && (
                      <span className="text-[8px] text-primary font-medium leading-none">
                        {tf('heatmapBestSlot')}
                      </span>
                    )}
                  </button>
                </Fragment>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-1.5 py-2">
          <p className="text-xs text-muted-foreground">
            {hiddenStatuses.has('graent') && statusCounts.graent === candidates.length
              ? tf('timelineEmptyGreenHidden')
              : tf('timelineEmptyFilter')}
          </p>
          <button
            type="button"
            onClick={() => onHiddenStatusesChange(new Set())}
            className="text-xs text-primary underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
          >
            {tf('timelineShowAll')}
          </button>
        </div>
      )}

      {/* Selected slot detail */}
      {selected && (
        <SlotDetail candidate={selected} originName={originName} routeDistanceM={routeDistanceM} leg={leg} thresholdsUsed={thresholdsUsed} />
      )}
    </div>
  )
}

function SlotDetail({
  candidate,
  originName,
  routeDistanceM,
  leg,
  thresholdsUsed,
}: {
  candidate: TravelCandidate
  originName: string
  routeDistanceM?: number
  leg?: 'outbound' | 'return'
  thresholdsUsed?: ResolvedTravelThresholds
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const locale = useLocale()
  const st = slotStatus(candidate)

  const header = (
    <p className="font-medium text-foreground">
      {tf('heatmapSlotDeparture')}: {tf('heatmapSlotDateTime', { date: formatDayLabel(candidate.departureIso, locale), time: formatKlTime(candidate.departureIso) })}
      {' — '}
      {tf('heatmapSlotArrival')}: {tf('heatmapSlotTime', { time: formatKlTime(candidate.arrivalIso) })}
    </p>
  )

  if (st === 'no_data') {
    return (
      <div className="rounded-xl border border-border bg-card px-3 py-3 flex flex-col gap-1.5 text-xs text-muted-foreground">
        {header}
        <p>{tf('heatmapNoData')}</p>
      </div>
    )
  }

  // Trailer-aware gust decisiveness
  const gustVal = candidate.worstGust?.value ?? 0
  const isTrailer = candidate.reasonCode?.includes('trailer') ?? false
  const redGustThreshold = thresholdsUsed?.redGustMs
    ?? (isTrailer ? WEATHER_THRESHOLDS.caravan.redGustMs : WEATHER_THRESHOLDS.driving.redGustMs)
  const isGustDecisive = gustVal >= redGustThreshold

  const metric =
    candidate.reasonCode === 'precipitation' ? 'precipitation' as const
    : isGustDecisive ? 'gust' as const
    : 'wind' as const
  const m =
    metric === 'precipitation' ? candidate.worstPrecip
    : metric === 'gust' ? candidate.worstGust
    : candidate.worstWind
  const thresh = deriveThreshold(metric, candidate.reasonCode, thresholdsUsed)
  const rawDist = m?.distanceFromOriginM
  const legDist = rawDist !== undefined && leg === 'return' && routeDistanceM !== undefined
    ? routeDistanceM - rawDist
    : rawDist
  const distKm = legDist !== undefined ? Math.round(legDist / 1000) : null
  const metricLabel =
    metric === 'precipitation' ? tf('metricPrecip')
    : metric === 'gust' ? tf('metricGust')
    : tf('metricWind')

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3 flex flex-col gap-1.5 text-xs text-muted-foreground">
      {header}
      {m?.value !== undefined && (
        <p>
          {metricLabel}: {formatNum(m.value, locale)} {metric === 'precipitation' ? 'mm/klst' : 'm/s'}
          {thresh.thresholdValue !== undefined && (
            <> {tf('aboveThresholdWithExcess', { excess: formatNum(m.value - thresh.thresholdValue, locale), threshold: formatNum(thresh.thresholdValue, locale), unit: thresh.thresholdUnit ?? '' })}</>
          )}
        </p>
      )}
      {distKm !== null && distKm > 0 && (
        <p>{distKm} {tf('kmFrom')} {originName}</p>
      )}
    </div>
  )
}
