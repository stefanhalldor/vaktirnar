'use client'

import { type ReactNode, useEffect, useRef } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { TravelCandidate, TravelWindow, ResolvedTravelThresholds } from '@/lib/weather/types'
import { deriveThreshold, resolveThresholds } from '@/lib/weather/thresholds'
import { formatKlTime, formatNum, normalizeLocale, formatCompactDateTime } from './travelAuditMap.helpers'
import { Check, ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react'
import {
  type WindDisplayStatus,
  classifyCandidateWindDisplayStatus,
  toSimpleWindDisplayStatus,
} from '@/lib/weather/windDisplayStatus'
import { WIND_STATUS_UI_META as WIND_STATUS_META } from './windStatusUi'
import { WindStatusFilterPills, type WindStatusFilterMode } from './WindStatusFilterPills'

function utcDateKey(isoString: string): string {
  return new Date(isoString).toISOString().slice(0, 10)
}

const IS_WEEKDAY_SHORT = ['Sun', 'Mán', 'Þri', 'Mið', 'Fim', 'Fös', 'Lau']
const IS_MONTH_SHORT = ['jan.', 'feb.', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'sep.', 'okt.', 'nóv.', 'des.']

function formatDayLabel(isoString: string, locale: string): string {
  const d = new Date(isoString)
  const norm = normalizeLocale(locale)
  if (norm.startsWith('is')) {
    return `${IS_WEEKDAY_SHORT[d.getUTCDay()]} (${d.getUTCDate()}. ${IS_MONTH_SHORT[d.getUTCMonth()]})`
  }
  return d.toLocaleDateString(norm, {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  })
}

/** Re-exported for backward compatibility with parent components. */
export type SlotStatus = WindDisplayStatus

type DepartureHeatmapProps = {
  candidates: TravelCandidate[]
  bestWindow?: TravelWindow
  originName: string
  selectedIdx: number | null
  onSelectIdx: (idx: number | null) => void
  /** Title shown above the filter chips. Pass `null` to suppress the title entirely. */
  title?: string | null
  /** For return-leg heatmaps: total route distance in meters used to flip distance direction. */
  routeDistanceM?: number
  /** 'return' flips distanceFromOriginM to distance from return start (destination). */
  leg?: 'outbound' | 'return'
  /** Controlled filter state — which statuses are selected to show (empty = show all). */
  visibleStatuses: Set<WindDisplayStatus>
  /** Called when user changes the filter. */
  onVisibleStatusesChange: (next: Set<WindDisplayStatus>) => void
  /** Resolved thresholds used in the current result — required for fine-grained wind classification. */
  thresholdsUsed?: ResolvedTravelThresholds
  /** Optional subtitle shown below the title. */
  subtitle?: string
  /** If false, hides the selected slot detail card below the scrubber. Default: true. */
  showSelectedDetail?: boolean
  /** Label for the first slot (e.g. "Núna"). When set, slot 0 shows this label above the actual time. */
  firstSlotLabel?: string
  /**
   * Provider-derived status overrides — one entry per candidate index.
   * When provided, replaces MET/Yr candidate classification for all status paths
   * (counts, filter, selection, slot dots). Used in Veðurstofan-only mode.
   */
  slotStatusOverrides?: WindDisplayStatus[]
  /**
   * Controls whether status filter pills are grouped into simple categories or
   * shown with all fine-grained near-threshold states.
   */
  mode?: WindStatusFilterMode
  /**
   * Optional element rendered before the filter pills in the same row.
   * Used by the Road Intelligence prototype to inline Einfalt/Nánar toggle.
   */
  modeToggle?: ReactNode
  /**
   * When provided, overrides the internally-computed status counts for WindStatusFilterPills.
   * Use when the pills should reflect route station counts rather than departure slot counts.
   */
  countsOverride?: Partial<Record<WindDisplayStatus, number>>
  /**
   * Older /ferdalagid flows treat `selectedIdx=null` + `firstSlotLabel` as
   * "the first slot is active". Road Intelligence needs null to mean the
   * separate Vegagerðin current view is active, so callers can disable this.
   */
  selectFirstSlotWhenNone?: boolean
  /** Controls the legacy "Besti" ring/label on green departure windows. */
  showBestWindowHint?: boolean
}

/** Returns compact hour label for whole-hour slots: "00" for midnight, "1"–"23" otherwise. */
function formatCompactHour(isoString: string): string {
  const h = new Date(isoString).getUTCHours()
  return h === 0 ? '00' : String(h)
}

function isBestSlot(c: TravelCandidate, bestWindow?: TravelWindow): boolean {
  if (!bestWindow) return false
  const dep = new Date(c.departureIso).getTime()
  return dep >= new Date(bestWindow.fromIso).getTime() && dep <= new Date(bestWindow.toIso).getTime()
}

function slotStatusIsVisible(
  status: WindDisplayStatus,
  visibleStatuses: ReadonlySet<WindDisplayStatus>,
  mode: WindStatusFilterMode = 'detailed',
): boolean {
  if (visibleStatuses.size === 0) return true
  if (mode === 'simple') {
    const simpleStatus = toSimpleWindDisplayStatus(status)
    return [...visibleStatuses].some(st => toSimpleWindDisplayStatus(st) === simpleStatus)
  }
  return visibleStatuses.has(status)
}

export function DepartureHeatmap({ candidates, bestWindow, originName, selectedIdx, onSelectIdx, title, routeDistanceM, leg, visibleStatuses, onVisibleStatusesChange, thresholdsUsed, subtitle, showSelectedDetail = true, firstSlotLabel, slotStatusOverrides, mode = 'detailed', modeToggle, countsOverride, selectFirstSlotWhenNone = true, showBestWindowHint = true }: DepartureHeatmapProps) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const locale = useLocale()
  const selected = selectedIdx !== null ? candidates[selectedIdx] : null
  const scrollRef = useRef<HTMLDivElement>(null)
  const btnRefsRef = useRef<Map<number, HTMLButtonElement>>(new Map())

  // Scroll selected slot into view when selectedIdx changes.
  useEffect(() => {
    if (selectedIdx === null) return
    const el = btnRefsRef.current.get(selectedIdx)
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [selectedIdx])

  if (candidates.length === 0) return null

  // Thresholds used for fine-grained classification — fall back to defaults if not passed
  const thresholdsForClassify = thresholdsUsed ?? resolveThresholds('none')

  // Single status resolver — uses provider overrides when available, else MET/Yr classification.
  // All status paths (counts, filter, selection, dots, SlotDetail) must go through this.
  function getSlotStatus(c: TravelCandidate, idx: number): WindDisplayStatus {
    if (slotStatusOverrides && idx < slotStatusOverrides.length) {
      return slotStatusOverrides[idx]
    }
    return classifyCandidateWindDisplayStatus(c, thresholdsForClassify)
  }

  function getDisplaySlotStatus(c: TravelCandidate, idx: number): WindDisplayStatus {
    const status = getSlotStatus(c, idx)
    return mode === 'simple' ? toSimpleWindDisplayStatus(status) : status
  }

  // Status counts across all candidates (before filtering)
  const statusCounts: Partial<Record<WindDisplayStatus, number>> = {}
  for (let i = 0; i < candidates.length; i++) {
    const st = getSlotStatus(candidates[i], i)
    statusCounts[st] = (statusCounts[st] ?? 0) + 1
  }

  // Filtered candidates with their real indices in the candidates array
  const filteredWithIdx: Array<{ c: TravelCandidate; realIdx: number }> =
    candidates.reduce<Array<{ c: TravelCandidate; realIdx: number }>>((acc, c, i) => {
      if (slotStatusIsVisible(getSlotStatus(c, i), visibleStatuses, mode)) {
        acc.push({ c, realIdx: i })
      }
      return acc
    }, [])

  // Arrow navigation through filtered candidates. In route mode, the first
  // candidate is rendered as the special "Now" slot. Keep null support for
  // older callers, but new route flows select the real first index (0).
  const selectedFilteredIdx = selectedIdx === null
    ? firstSlotLabel && selectFirstSlotWhenNone
      ? filteredWithIdx.findIndex(item => item.realIdx === 0)
      : -1
    : filteredWithIdx.findIndex(item => item.realIdx === selectedIdx)

  function selectRelative(delta: -1 | 1) {
    if (filteredWithIdx.length === 0) return
    const baseIdx = selectedFilteredIdx >= 0
      ? selectedFilteredIdx
      : delta > 0
        ? -1
        : filteredWithIdx.length
    const next = filteredWithIdx[baseIdx + delta]
    if (next) onSelectIdx(next.realIdx)
  }

  const prevArrowDisabled = selectedFilteredIdx <= 0
  const nextArrowDisabled = filteredWithIdx.length === 0 ||
    (selectedFilteredIdx >= 0 && selectedFilteredIdx >= filteredWithIdx.length - 1)

  // Handle status filter change from WindStatusFilterPills.
  // Receives the already-toggled Set; deselects the current slot if its status is filtered out.
  function handleStatusesChange(next: Set<WindDisplayStatus>) {
    if (selectedIdx !== null && next.size > 0) {
      const selSt = getSlotStatus(candidates[selectedIdx], selectedIdx)
      if (!slotStatusIsVisible(selSt, next, mode)) onSelectIdx(null)
    }
    onVisibleStatusesChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      {title !== null && <p className="text-xs font-medium text-foreground">{title ?? tf('heatmapTitle')}</p>}
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}

      {/* Status filter chips — modeToggle (if provided) sits in the same row as the pills */}
      <div className="flex flex-wrap items-center gap-2">
        {modeToggle}
        <WindStatusFilterPills
          counts={countsOverride ?? statusCounts}
          visibleStatuses={visibleStatuses}
          onVisibleStatusesChange={handleStatusesChange}
          showAllLabel=""
          alwaysShowWithinLimits
          mode={mode}
        />
      </div>

      {/* Scrollable slot row — grouped by day with sticky day labels */}
      {filteredWithIdx.length > 0 ? (() => {
        type DayGroup = { dateKey: string; items: Array<{ c: TravelCandidate; realIdx: number }> }
        const dayGroups = filteredWithIdx.reduce<DayGroup[]>((acc, item) => {
          const dateKey = utcDateKey(item.c.departureIso)
          const last = acc[acc.length - 1]
          if (last && last.dateKey === dateKey) { last.items.push(item) }
          else { acc.push({ dateKey, items: [item] }) }
          return acc
        }, [])
        return (
          <div className="flex items-center gap-1">
            {/* Prev arrow */}
            <button
              type="button"
              disabled={prevArrowDisabled}
              onClick={() => selectRelative(-1)}
              aria-label={tf('timelinePrevious')}
              className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded border border-border transition-colors ${
                prevArrowDisabled ? 'text-muted-foreground/30 cursor-default' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
              }`}
            >
              <ChevronLeft className="w-4 h-4" aria-hidden />
            </button>

            <div className="overflow-x-auto flex-1 -mx-1 px-1" ref={scrollRef}>
            <div className="flex min-w-max pb-1 items-end">
              {dayGroups.map(({ dateKey, items }) => (
                <div key={dateKey} className="flex items-end">
                  <div className="sticky left-1 z-10 shrink-0 self-end pb-1 pr-1.5" aria-hidden>
                    <span className="text-[9px] font-medium text-muted-foreground/60 whitespace-nowrap bg-background rounded px-0.5 leading-none">
                      {formatDayLabel(items[0].c.departureIso, locale)}
                    </span>
                  </div>
                  <div className="flex gap-1 items-end">
                    {items.map(({ c, realIdx }) => {
                      const displayStatus = getDisplaySlotStatus(c, realIdx)
                      const meta = WIND_STATUS_META[displayStatus]
                      const best = showBestWindowHint && isBestSlot(c, bestWindow)
                      const isSelected = selectedIdx === realIdx ||
                        (selectedIdx === null && realIdx === 0 && Boolean(firstSlotLabel) && selectFirstSlotWhenNone)
                      return (
                        <button
                          key={c.departureIso}
                          type="button"
                          ref={el => {
                            if (el) btnRefsRef.current.set(realIdx, el)
                            else btnRefsRef.current.delete(realIdx)
                          }}
                          onClick={() => {
                            if (realIdx === 0 && firstSlotLabel) {
                              onSelectIdx(0)
                              return
                            }
                            onSelectIdx(realIdx === selectedIdx ? null : realIdx)
                          }}
                          aria-label={realIdx === 0 && firstSlotLabel
                            ? `${firstSlotLabel} · ${tf('heatmapSlotDeparture')} ${tf('heatmapSlotDateTime', { date: formatDayLabel(c.departureIso, locale), time: formatKlTime(c.departureIso) })}`
                            : `${tf('heatmapSlotDeparture')} ${tf('heatmapSlotDateTime', { date: formatDayLabel(c.departureIso, locale), time: formatKlTime(c.departureIso) })}`}
                          className={`flex flex-col items-center gap-0.5 ${realIdx === 0 && firstSlotLabel ? 'min-w-[42px] px-1.5' : 'min-w-9 px-1'} py-1.5 rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            isSelected
                              ? `${meta.borderClass} border-2 bg-card`
                              : `border-transparent ${best ? 'ring-1 ring-offset-1 ring-primary/50' : ''}`
                          }`}
                        >
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${meta.dotClass}`} aria-hidden>
                            {displayStatus === 'innan-marka' && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                            {displayStatus === 'haettulegt' && <TriangleAlert className="w-2.5 h-2.5 text-white stroke-[3]" />}
                          </span>
                          {realIdx === 0 && firstSlotLabel ? (
                            <>
                              <span className="text-[10px] text-muted-foreground font-medium leading-none">{firstSlotLabel}</span>
                              <span className="text-[9px] text-muted-foreground/60 leading-none">{formatKlTime(c.departureIso)}</span>
                            </>
                          ) : (
                            <span className="text-[10px] text-muted-foreground leading-none">
                              {formatCompactHour(c.departureIso)}
                            </span>
                          )}
                          {best && !isSelected && (
                            <span className="text-[8px] text-primary font-medium leading-none">
                              {tf('heatmapBestSlot')}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            </div>

            {/* Next arrow */}
            <button
              type="button"
              disabled={nextArrowDisabled}
              onClick={() => selectRelative(1)}
              aria-label={tf('timelineNext')}
              className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded border border-border transition-colors ${
                nextArrowDisabled ? 'text-muted-foreground/30 cursor-default' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
              }`}
            >
              <ChevronRight className="w-4 h-4" aria-hidden />
            </button>
          </div>
        )
      })() : (
        <div className="flex flex-col items-start gap-1.5 py-2">
          <p className="text-xs text-muted-foreground">
            {visibleStatuses.size > 0 &&
              !slotStatusIsVisible('innan-marka', visibleStatuses, mode) &&
              (statusCounts['innan-marka'] ?? 0) === candidates.length
              ? tf('timelineEmptyGreenHidden')
              : tf('timelineEmptyFilter')}
          </p>
          <button
            type="button"
            onClick={() => onVisibleStatusesChange(new Set())}
            className="text-xs text-primary underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
          >
            {tf('timelineShowAll')}
          </button>
        </div>
      )}

      {/* Selected slot detail */}
      {showSelectedDetail && selected && (
        <SlotDetail
          candidate={selected}
          originName={originName}
          routeDistanceM={routeDistanceM}
          leg={leg}
          thresholdsUsed={thresholdsUsed}
          statusOverride={selectedIdx !== null && slotStatusOverrides ? slotStatusOverrides[selectedIdx] : undefined}
        />
      )}
    </div>
  )
}

/** Known Icelandic city/place names → dative form. Only include safe, verified entries. */
const IS_PLACE_DATIVE: Record<string, string> = {
  'Reykjavík': 'Reykjavík',
  'Garðabær': 'Garðabæ',
  'Kópavogur': 'Kópavogi',
  'Hafnarfjörður': 'Hafnarfirði',
  'Akureyri': 'Akureyri',
  'Selfoss': 'Selfossi',
  'Egilsstaðir': 'Egilsstöðum',
  'Akranes': 'Akranesi',
  'Ísafjörður': 'Ísafirði',
  'Vestmannaeyjar': 'Vestmannaeyjum',
  'Hvolsvöllur': 'Hvolsvelli',
  'Vík': 'Vík',
  'Borgarnes': 'Borgarnesi',
  'Hveragerði': 'Hveragerði',
  'Þorlákshöfn': 'Þorlákshöfn',
  'Grindavík': 'Grindavík',
  'Keflavík': 'Keflavík',
  'Njarðvík': 'Njarðvík',
  'Höfn': 'Höfn',
  'Neskaupstaður': 'Neskaupstað',
  'Eskifjörður': 'Eskifirði',
  'Reyðarfjörður': 'Reyðarfirði',
  'Seyðisfjörður': 'Seyðisfirði',
  'Ólafsvík': 'Ólafsvík',
  'Stykkishólmur': 'Stykkishólmi',
  'Blönduós': 'Blönduósi',
  'Siglufjörður': 'Sigluförði',
  'Dalvík': 'Dalvík',
  'Húsavík': 'Húsavík',
  'Þórshöfn': 'Þórshöfn',
  'Vopnafjörður': 'Vopnafirði',
  'Hvammstangi': 'Hvammstanga',
  'Hella': 'Hellu',
  'Kirkjubæjarklaustur': 'Kirkjubæjarklaustri',
  'Patreksfjörður': 'Patreksfirði',
  'Ísafjarðarbær': 'Ísafjarðarbæ',
}

/** Returns the Icelandic dative form of a place name, or fallback if unknown. */
function getOriginDisplay(originName: string, locale: string, fallback: string): string {
  const norm = normalizeLocale(locale)
  if (!norm.startsWith('is')) return originName || fallback
  const dative = IS_PLACE_DATIVE[originName.trim()]
  return dative ?? fallback
}

function SlotDetail({
  candidate,
  originName,
  routeDistanceM,
  leg,
  thresholdsUsed,
  statusOverride,
}: {
  candidate: TravelCandidate
  originName: string
  routeDistanceM?: number
  leg?: 'outbound' | 'return'
  thresholdsUsed?: ResolvedTravelThresholds
  statusOverride?: WindDisplayStatus
}) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const locale = useLocale()
  const st = statusOverride ?? classifyCandidateWindDisplayStatus(candidate, thresholdsUsed ?? resolveThresholds('none'))

  const header = (
    <p className="text-foreground">
      {tf('heatmapSlotDeparture')}: {formatCompactDateTime(candidate.departureIso, locale)}
      {' · '}
      {tf('heatmapSlotArrival')}: {formatCompactDateTime(candidate.arrivalIso, locale)}
    </p>
  )

  if (st === 'no_data') {
    return (
      <div className="rounded-xl border border-border bg-card px-3 py-3 flex flex-col gap-1.5 text-xs text-muted-foreground">
        {header}
        <p>{tf('heatmapNotAssessedDetail')}</p>
      </div>
    )
  }

  const originDisplay = getOriginDisplay(originName, locale, tf('slotDetailOriginFallback'))
  const dp = candidate.displayPoint

  if (dp) {
    // Active-candidate-safe summary: distance + ETA at the decisive point, plus wind/precip/temp
    const depMs = new Date(candidate.departureIso).getTime()
    const durMs = new Date(candidate.arrivalIso).getTime() - depMs
    const etaFraction = leg === 'return' ? 1 - dp.routeFraction : dp.routeFraction
    const etaIso = new Date(depMs + etaFraction * durMs).toISOString()
    const rawDist = dp.distanceFromOriginM
    const legDist = leg === 'return' && routeDistanceM !== undefined
      ? routeDistanceM - rawDist
      : rawDist
    const distKm = Math.round(legDist / 1000)

    return (
      <div className="rounded-xl border border-border bg-card px-3 py-3 flex flex-col gap-1.5 text-xs text-muted-foreground">
        {header}
        {distKm > 0 && (
          <p>{tf('slotDetailWorstDistanceAt', { distance: distKm, origin: originDisplay, time: formatKlTime(etaIso) })}</p>
        )}
        <p>
          {tf('slotDetailWeatherSummary', {
            wind: `${formatNum(dp.windMs, locale)} m/s`,
            precipitation: `${formatNum(dp.precipMmPerHour, locale)} mm/klst`,
            temperature: `${formatNum(dp.airTemperatureC, locale)}°C`,
          })}
        </p>
      </div>
    )
  }

  // Fallback for no_data-adjacent candidates without displayPoint: show decisive metric only.
  // Gust is suppressed in this phase (threshold neutralised to 100) — always use wind.
  const metric =
    candidate.reasonCode === 'precipitation' ? 'precipitation' as const
    : 'wind' as const
  const m =
    metric === 'precipitation' ? candidate.worstPrecip
    : candidate.worstWind
  const thresh = deriveThreshold(metric, candidate.reasonCode, thresholdsUsed)
  const rawDistFallback = m?.distanceFromOriginM
  const legDistFallback = rawDistFallback !== undefined && leg === 'return' && routeDistanceM !== undefined
    ? routeDistanceM - rawDistFallback
    : rawDistFallback
  const distKmFallback = legDistFallback !== undefined ? Math.round(legDistFallback / 1000) : null
  const metricLabel =
    metric === 'precipitation' ? tf('metricPrecip')
    : tf('metricWind')
  const unit = metric === 'precipitation' ? 'mm/klst' : 'm/s'

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3 flex flex-col gap-1.5 text-xs text-muted-foreground">
      {header}
      {m?.value !== undefined && distKmFallback !== null && distKmFallback > 0 && (
        <p>{tf('slotDetailWorstDistance', { distance: distKmFallback, origin: originDisplay })}</p>
      )}
      {m?.value !== undefined && (
        <p>
          {tf('slotDetailMetricLine', { metric: metricLabel, value: `${formatNum(m.value, locale)} ${unit}` })}
          {thresh.thresholdValue !== undefined && m.value > thresh.thresholdValue && (
            <> {tf('aboveThresholdWithExcess', { excess: formatNum(m.value - thresh.thresholdValue, locale), threshold: formatNum(thresh.thresholdValue, locale), unit: thresh.thresholdUnit ?? '' })}</>
          )}
        </p>
      )}
    </div>
  )
}
