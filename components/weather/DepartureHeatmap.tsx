'use client'

import { useTranslations, useLocale } from 'next-intl'
import type { TravelCandidate, TravelWindow, WeatherStatus, ResolvedTravelThresholds } from '@/lib/weather/types'
import { WEATHER_THRESHOLDS, deriveThreshold } from '@/lib/weather/thresholds'
import { formatKlTime, formatNum, normalizeLocale, formatCompactDateTime } from './travelAuditMap.helpers'

function utcDateKey(isoString: string): string {
  return new Date(isoString).toISOString().slice(0, 10)
}

const IS_WEEKDAY_SHORT = ['Sun', 'Mán', 'Þri', 'Mið', 'Fim', 'Fös', 'Lau']
const IS_MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'maí', 'jún', 'júl', 'ágú', 'sep', 'okt', 'nóv', 'des']

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

export type SlotStatus = WeatherStatus | 'no_data'

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
  visibleStatuses: Set<SlotStatus>
  /** Called when user changes the filter. */
  onVisibleStatusesChange: (next: Set<SlotStatus>) => void
  /** Resolved thresholds used in the current result — for correct SlotDetail threshold display. */
  thresholdsUsed?: ResolvedTravelThresholds
  /** Optional subtitle shown below the title. */
  subtitle?: string
  /** If false, hides the selected slot detail card below the scrubber. Default: true. */
  showSelectedDetail?: boolean
  /** Label for the first slot (e.g. "Núna"). When set, slot 0 shows this label above the actual time. */
  firstSlotLabel?: string
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

const ALL_SLOT_STATUSES: SlotStatus[] = ['graent', 'gult', 'rautt', 'no_data']

export function DepartureHeatmap({ candidates, bestWindow, originName, selectedIdx, onSelectIdx, title, routeDistanceM, leg, visibleStatuses, onVisibleStatusesChange, thresholdsUsed, subtitle, showSelectedDetail = true, firstSlotLabel }: DepartureHeatmapProps) {
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
      if (visibleStatuses.size === 0 || visibleStatuses.has(slotStatus(c))) {
        acc.push({ c, realIdx: i })
      }
      return acc
    }, [])

  function toggleStatus(st: SlotStatus) {
    const next = new Set(visibleStatuses)
    if (next.has(st)) {
      next.delete(st)
    } else {
      next.add(st)
    }
    // Deselect if the selected slot's status is no longer visible
    if (selectedIdx !== null && next.size > 0) {
      const selSt = slotStatus(candidates[selectedIdx])
      if (!next.has(selSt)) onSelectIdx(null)
    }
    onVisibleStatusesChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      {title !== null && <p className="text-xs font-medium text-foreground">{title ?? tf('heatmapTitle')}</p>}
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}

      {/* Threshold summary — always shown when thresholds are available */}
      {thresholdsUsed && (
        <p className="text-[10px] text-muted-foreground/70">
          {tf('thresholdSummaryLine', {
            caution: formatNum(thresholdsUsed.cautionWindMs, locale),
            red: formatNum(thresholdsUsed.redWindMs, locale),
            gust: formatNum(thresholdsUsed.redGustMs, locale),
            precip: formatNum(thresholdsUsed.cautionPrecipMmPerHour, locale),
          })}
        </p>
      )}

      {/* Status filter chips — always shown so user can see counts and filter */}
      <div className="flex flex-wrap gap-1.5">
          {ALL_SLOT_STATUSES.filter(st => st === 'graent' || statusCounts[st] > 0).map(st => {
            const isActive = visibleStatuses.has(st)
            const noFilter = visibleStatuses.size === 0
            const label = st === 'graent' ? tf('heatmapLegendGreen')
              : st === 'gult' ? tf('heatmapLegendYellow')
              : st === 'rautt' ? tf('heatmapLegendRed')
              : tf('heatmapNotAssessed')
            return (
              <button
                key={st}
                type="button"
                onClick={() => toggleStatus(st)}
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  isActive
                    ? `${STATUS_BORDER[st]} bg-muted/50 text-foreground`
                    : noFilter
                      ? 'border-border bg-transparent text-muted-foreground'
                      : 'border-border bg-transparent text-muted-foreground/30'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${!isActive && !noFilter ? 'opacity-30' : ''} ${STATUS_BG[st]}`} aria-hidden />
                {label} ({statusCounts[st]})
              </button>
            )
          })}
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
          <div className="overflow-x-auto -mx-1 px-1">
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
                      const st = slotStatus(c)
                      const best = isBestSlot(c, bestWindow)
                      const isSelected = selectedIdx === realIdx
                      return (
                        <button
                          key={c.departureIso}
                          type="button"
                          onClick={() => onSelectIdx(realIdx === selectedIdx ? null : realIdx)}
                          aria-label={realIdx === 0 && firstSlotLabel
                            ? `${firstSlotLabel} · ${tf('heatmapSlotDeparture')} ${tf('heatmapSlotDateTime', { date: formatDayLabel(c.departureIso, locale), time: formatKlTime(c.departureIso) })}`
                            : `${tf('heatmapSlotDeparture')} ${tf('heatmapSlotDateTime', { date: formatDayLabel(c.departureIso, locale), time: formatKlTime(c.departureIso) })}`}
                          className={`flex flex-col items-center gap-0.5 ${realIdx === 0 && firstSlotLabel ? 'min-w-[42px] px-1.5' : 'min-w-9 px-1'} py-1.5 rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            isSelected
                              ? `${STATUS_BORDER[st]} border-2 bg-card`
                              : `border-transparent ${best ? 'ring-1 ring-offset-1 ring-primary/50' : ''}`
                          }`}
                        >
                          <span className={`w-4 h-4 rounded-full ${STATUS_BG[st]}`} aria-hidden />
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
        )
      })() : (
        <div className="flex flex-col items-start gap-1.5 py-2">
          <p className="text-xs text-muted-foreground">
            {visibleStatuses.size > 0 && !visibleStatuses.has('graent') && statusCounts.graent === candidates.length
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
        <SlotDetail candidate={selected} originName={originName} routeDistanceM={routeDistanceM} leg={leg} thresholdsUsed={thresholdsUsed} />
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

  // Fallback for no_data-adjacent candidates without displayPoint: show decisive metric only
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
  const rawDistFallback = m?.distanceFromOriginM
  const legDistFallback = rawDistFallback !== undefined && leg === 'return' && routeDistanceM !== undefined
    ? routeDistanceM - rawDistFallback
    : rawDistFallback
  const distKmFallback = legDistFallback !== undefined ? Math.round(legDistFallback / 1000) : null
  const metricLabel =
    metric === 'precipitation' ? tf('metricPrecip')
    : metric === 'gust' ? tf('metricGust')
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
