'use client'

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { ForecastDrawerRow, ResolvedTravelThresholds } from '@/lib/weather/types'
import { formatNum } from '@/components/weather/travelAuditMap.helpers'

// ── Types ─────────────────────────────────────────────────────────────────────

type CompareCol = {
  dayLabel: string
  timeLabel: string
  targetIso: string
  origin: ForecastDrawerRow | null
  dest: ForecastDrawerRow | null
}

// ── Metric colour helpers ─────────────────────────────────────────────────────

function windMetricClass(value: number, otherValue: number | undefined, t: ResolvedTravelThresholds | undefined | null): string {
  if (t) {
    if (value >= t.redWindMs) return 'text-destructive'
    if (value >= t.cautionWindMs) return 'text-amber-600 dark:text-amber-500'
  }
  if (otherValue !== undefined && value < otherValue) return 'text-emerald-600 dark:text-emerald-500'
  return ''
}

function precipMetricClass(value: number, otherValue: number | undefined, t: ResolvedTravelThresholds | undefined | null): string {
  if (t && value >= t.cautionPrecipMmPerHour) return 'text-amber-600 dark:text-amber-500'
  if (otherValue !== undefined && value < otherValue) return 'text-emerald-600 dark:text-emerald-500'
  return ''
}

function tempMetricClass(value: number, otherValue: number | undefined): string {
  if (otherValue === undefined) return ''
  if (value > otherValue) return 'text-emerald-600 dark:text-emerald-500'
  return ''
}

// ── Date label helpers ─────────────────────────────────────────────────────────

const CMP_IS_WEEKDAY = ['sun', 'mán', 'þri', 'mið', 'fim', 'fös', 'lau']
const CMP_IS_MONTH = ['jan', 'feb', 'mar', 'apr', 'maí', 'jún', 'júl', 'ágú', 'sep', 'okt', 'nóv', 'des']
const CMP_EN_WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const CMP_EN_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ── Core builder ──────────────────────────────────────────────────────────────

/**
 * Builds comparison columns for origin and destination forecast rows.
 * targetHoursUtc: UTC hours per day (e.g. [12] for noon, [9,12,18] for morning/noon/evening).
 * maxDays: cap number of days (default: all available).
 */
export function buildWeatherWatchersColumns(
  originRows: ForecastDrawerRow[],
  destRows: ForecastDrawerRow[],
  targetHoursUtc: number[],
  locale: string,
  maxDays = Infinity,
): CompareCol[] {
  const TOLERANCE_MS = 90 * 60 * 1000
  const isIs = locale === 'is' || locale.startsWith('is')

  const dateSet = new Set<string>()
  for (const r of [...originRows, ...destRows]) {
    const d = new Date(r.timeIso)
    dateSet.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`)
  }

  const findNearest = (rows: ForecastDrawerRow[], targetMs: number): ForecastDrawerRow | null => {
    let best: ForecastDrawerRow | null = null
    let bestDiff = Infinity
    for (const r of rows) {
      const diff = Math.abs(new Date(r.timeIso).getTime() - targetMs)
      if (diff <= TOLERANCE_MS && diff < bestDiff) { best = r; bestDiff = diff }
    }
    return best
  }

  const cols: CompareCol[] = []
  const dates = Array.from(dateSet).sort().slice(0, maxDays)
  for (const dateStr of dates) {
    for (const hour of targetHoursUtc) {
      const hh = String(hour).padStart(2, '0')
      const targetIso = `${dateStr}T${hh}:00:00.000Z`
      const targetMs = new Date(targetIso).getTime()
      const origin = findNearest(originRows, targetMs)
      const dest = findNearest(destRows, targetMs)
      if (!origin && !dest) continue
      const d = new Date(targetIso)
      const dayLabel = isIs
        ? `${CMP_IS_WEEKDAY[d.getUTCDay()]}. ${d.getUTCDate()}. ${CMP_IS_MONTH[d.getUTCMonth()]}`
        : `${CMP_EN_WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${CMP_EN_MONTH[d.getUTCMonth()]}`
      const timeLabel = isIs ? `kl. ${hh}:00` : `${hh}:00`
      cols.push({ dayLabel, timeLabel, targetIso, origin, dest })
    }
  }
  return cols
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  originLabel: string
  destinationLabel: string
  originRows: ForecastDrawerRow[]
  destinationRows: ForecastDrawerRow[]
  thresholds?: ResolvedTravelThresholds | null
}

/**
 * Compact origin/destination weather comparison with an expandable drawer.
 * Used in /ferdalagid result summary and /vedrid when both endpoints have forecast data.
 */
export function WeatherWatchersComparison({ originLabel, destinationLabel, originRows, destinationRows, thresholds }: Props) {
  const tf = useTranslations('teskeid.vedrid.ferdalagid')
  const locale = useLocale()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [preset, setPreset] = useState<'kl12' | 'morning' | '3h'>('kl12')

  const compactCols = buildWeatherWatchersColumns(originRows, destinationRows, [12], locale, 5)

  if (compactCols.length === 0) return null

  const PRESET_HOURS: Record<string, number[]> = {
    kl12: [12],
    morning: [9, 12, 18],
    '3h': [0, 3, 6, 9, 12, 15, 18, 21],
  }

  return (
    <>
      {/* ── Compact grid ── */}
      <div className="flex flex-col gap-3 pt-3">
        <p className="text-[11px] font-semibold text-foreground/70">{tf('weatherCompareSection')}</p>
        <div className="overflow-x-auto">
          <div
            className="inline-grid gap-x-3 gap-y-2.5"
            style={{ gridTemplateColumns: `5.5rem repeat(${compactCols.length}, 4.75rem)` }}
          >
            {/* Header row */}
            <div />
            {compactCols.map(col => (
              <div key={col.targetIso} className="text-[10px] text-muted-foreground leading-tight">
                <div>{col.dayLabel}</div>
                <div className="text-muted-foreground/50">{col.timeLabel}</div>
              </div>
            ))}
            {/* Origin row */}
            <div className="text-[11px] font-medium text-foreground leading-tight self-start truncate pr-1">
              {originLabel}
            </div>
            {compactCols.map(col => (
              <div key={col.targetIso}>
                {col.origin ? (
                  <div className="space-y-0.5">
                    <div className={`text-[12px] font-medium ${tempMetricClass(col.origin.temperature.value, col.dest?.temperature.value) || 'text-foreground'}`}>
                      {formatNum(col.origin.temperature.value, locale)}°C
                    </div>
                    <div className={`text-[11px] font-medium ${windMetricClass(col.origin.wind.value, col.dest?.wind.value, thresholds)}`}>
                      {formatNum(col.origin.wind.value, locale)} m/s
                    </div>
                    <div className={`text-[10px] ${precipMetricClass(col.origin.precipitation.value, col.dest?.precipitation.value, thresholds) || 'text-muted-foreground'}`}>
                      {formatNum(col.origin.precipitation.value, locale)} mm/klst
                    </div>
                  </div>
                ) : (
                  <span className="text-[11px] text-muted-foreground/40">–</span>
                )}
              </div>
            ))}
            {/* Destination row */}
            <div className="text-[11px] font-medium text-foreground leading-tight self-start truncate pr-1">
              {destinationLabel}
            </div>
            {compactCols.map(col => (
              <div key={col.targetIso}>
                {col.dest ? (
                  <div className="space-y-0.5">
                    <div className={`text-[12px] font-medium ${tempMetricClass(col.dest.temperature.value, col.origin?.temperature.value) || 'text-foreground'}`}>
                      {formatNum(col.dest.temperature.value, locale)}°C
                    </div>
                    <div className={`text-[11px] font-medium ${windMetricClass(col.dest.wind.value, col.origin?.wind.value, thresholds)}`}>
                      {formatNum(col.dest.wind.value, locale)} m/s
                    </div>
                    <div className={`text-[10px] ${precipMetricClass(col.dest.precipitation.value, col.origin?.precipitation.value, thresholds) || 'text-muted-foreground'}`}>
                      {formatNum(col.dest.precipitation.value, locale)} mm/klst
                    </div>
                  </div>
                ) : (
                  <span className="text-[11px] text-muted-foreground/40">–</span>
                )}
              </div>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="self-start text-[11px] text-primary underline hover:text-primary/80 transition-colors"
        >
          {tf('weatherCompareViewMore')}
        </button>
      </div>

      {/* ── Drawer ── */}
      {drawerOpen && (() => {
        const drawerCols = buildWeatherWatchersColumns(originRows, destinationRows, PRESET_HOURS[preset], locale)
        return (
          <div
            className="fixed inset-0 z-50 flex flex-col justify-end"
            onClick={() => setDrawerOpen(false)}
          >
            <div className="absolute inset-0 bg-black/40" />
            <div
              className="relative w-full max-w-md mx-auto bg-background rounded-t-xl border-t border-border max-h-[75vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-background border-b border-muted/40 px-4 py-3 flex items-center justify-between shrink-0">
                <p className="text-sm font-semibold text-foreground">{tf('weatherCompareSection')}</p>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {tf('drawerClose')}
                </button>
              </div>
              <div className="flex gap-1.5 px-4 py-2.5 border-b border-muted/40 shrink-0">
                {(['kl12', 'morning', '3h'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreset(p)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                      preset === p
                        ? 'bg-foreground text-background border-foreground'
                        : 'text-muted-foreground border-border hover:border-foreground/40'
                    }`}
                  >
                    {p === 'kl12' ? tf('comparePresetKl12') : p === 'morning' ? tf('comparePresetMorning') : tf('comparePreset3h')}
                  </button>
                ))}
              </div>
              <div className="overflow-y-auto px-4 py-2 divide-y divide-border/60">
                {drawerCols.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">{tf('heatmapNoData')}</p>
                ) : drawerCols.map(col => (
                  <div key={col.targetIso} className="py-3 space-y-2">
                    <p className="text-[11px] font-semibold text-muted-foreground">
                      {col.dayLabel} · {col.timeLabel}
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-semibold text-foreground">{originLabel}</p>
                        {col.origin ? (
                          <>
                            <p className={`text-sm font-medium ${tempMetricClass(col.origin.temperature.value, col.dest?.temperature.value) || 'text-foreground'}`}>
                              {formatNum(col.origin.temperature.value, locale)}°C
                            </p>
                            <p className={`text-xs font-medium ${windMetricClass(col.origin.wind.value, col.dest?.wind.value, thresholds)}`}>
                              {formatNum(col.origin.wind.value, locale)} m/s
                            </p>
                            <p className={`text-[11px] ${precipMetricClass(col.origin.precipitation.value, col.dest?.precipitation.value, thresholds) || 'text-muted-foreground'}`}>
                              {formatNum(col.origin.precipitation.value, locale)} mm/klst
                            </p>
                          </>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/40">–</p>
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-semibold text-foreground">{destinationLabel}</p>
                        {col.dest ? (
                          <>
                            <p className={`text-sm font-medium ${tempMetricClass(col.dest.temperature.value, col.origin?.temperature.value) || 'text-foreground'}`}>
                              {formatNum(col.dest.temperature.value, locale)}°C
                            </p>
                            <p className={`text-xs font-medium ${windMetricClass(col.dest.wind.value, col.origin?.wind.value, thresholds)}`}>
                              {formatNum(col.dest.wind.value, locale)} m/s
                            </p>
                            <p className={`text-[11px] ${precipMetricClass(col.dest.precipitation.value, col.origin?.precipitation.value, thresholds) || 'text-muted-foreground'}`}>
                              {formatNum(col.dest.precipitation.value, locale)} mm/klst
                            </p>
                          </>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/40">–</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
