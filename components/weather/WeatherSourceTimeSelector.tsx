'use client'

import { useEffect, useRef } from 'react'
import { useLocale } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { WIND_STATUS_MARKER_COLOR } from '@/lib/weather/windDisplayStatus'
import type { ForecastTimeScrubberSlot } from '@/components/weather/ForecastTimeScrubber'
import { formatLongDepartureDateTime } from '@/components/weather/travelAuditMap.helpers'
import { groupSlotsByDay } from '@/lib/weather/forecastSlotHelpers'

const NEUTRAL_STATUS_DOT_COLOR = '#94a3b8'

interface WeatherSourceTimeSelectorProps {
  // Vegagerðin / current-observations group
  vegagerdinGroupLabel: string
  nowLabel: string
  /** Formatted measurement time label, e.g. "Mælt 10:27". Omitted when no data yet. */
  nowMeasuredAtLabel?: string
  nowStatusColor: string
  nowStatusLabel: string
  nowLoading: boolean
  nowLoadingLabel: string
  /** Disable the Núna button — only when access is restricted. Stale data remains clickable. */
  nowDisabled: boolean

  // Forecast provider group (Veðurstofan forecast slots; Yr not yet wired)
  forecastGroupLabel: string
  forecastLabel: string
  forecastSlots: ForecastTimeScrubberSlot[]
  forecastLoading: boolean
  forecastLoadingLabel: string

  // Unified selection
  activeMode: 'now' | number
  onModeChange: (mode: 'now' | number) => void
  /** Aria label for the previous-slot arrow button. */
  prevLabel: string
  /** Aria label for the next-slot arrow button. */
  nextLabel: string
  /** Render dots as neutral time markers instead of status-colored risk markers. */
  neutralStatusColors?: boolean
}

/**
 * Compact horizontal source/time selector combining:
 * - A fixed left section: Vegagerðin "Núna" with newest measurement time and status dot
 * - A scrollable right section: forecast provider time slots with status dots
 *
 * Only one mode is active at a time. Selecting "Núna" shows the Vegagerðin current layer;
 * selecting a forecast slot shows the Veðurstofan layer for that time.
 * Scroll is contained within the component — no page-level overflow.
 */
export function WeatherSourceTimeSelector({
  vegagerdinGroupLabel,
  nowLabel,
  nowMeasuredAtLabel,
  nowStatusColor,
  nowStatusLabel,
  nowLoading,
  nowLoadingLabel,
  nowDisabled,
  forecastGroupLabel,
  forecastLabel,
  forecastSlots,
  forecastLoading,
  forecastLoadingLabel,
  activeMode,
  onModeChange,
  prevLabel,
  nextLabel,
  neutralStatusColors = false,
}: WeatherSourceTimeSelectorProps) {
  const locale = useLocale()
  const nowActive = activeMode === 'now'
  const scrollRef = useRef<HTMLDivElement>(null)

  // Ordered list of all selectable modes: 'now' (when enabled) then each forecast slot timeMs.
  const selectableModes: Array<'now' | number> = [
    ...(nowDisabled ? [] : ['now' as const]),
    ...forecastSlots.map(s => s.timeMs),
  ]
  const activeIdx = selectableModes.findIndex(m => m === activeMode)

  function selectRelative(delta: -1 | 1) {
    if (selectableModes.length === 0) return
    const baseIdx = activeIdx >= 0 ? activeIdx : delta > 0 ? -1 : selectableModes.length
    const next = selectableModes[baseIdx + delta]
    if (next !== undefined) onModeChange(next)
  }

  // Scroll the active forecast button into view when activeMode changes.
  useEffect(() => {
    if (!scrollRef.current) return
    const el = scrollRef.current.querySelector<HTMLElement>('[data-active="true"]')
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [activeMode])

  const prevDisabled = activeIdx <= 0
  const nextDisabled = activeIdx < 0 || activeIdx >= selectableModes.length - 1

  return (
    <div className="flex border border-border rounded-lg overflow-hidden text-xs">

      {/* Prev arrow */}
      <button
        type="button"
        disabled={prevDisabled}
        onClick={() => selectRelative(-1)}
        aria-label={prevLabel}
        className={`flex-shrink-0 flex items-center justify-center w-8 border-r border-border transition-colors ${
          prevDisabled ? 'text-muted-foreground/30 cursor-default' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
        }`}
      >
        <ChevronLeft className="w-4 h-4" aria-hidden />
      </button>

      {/* Left: Vegagerðin / Núna — fixed width, does not scroll */}
      <div className="flex-shrink-0 border-r border-border">
        <div className="px-2 pt-1 pb-0.5 text-[10px] text-muted-foreground leading-none text-center">
          {vegagerdinGroupLabel}
        </div>
        <div className="px-1 pb-1">
          <div className="flex flex-col items-center gap-0.5">
            {/* "Núna" as a day-header label, matching the day label style on the right */}
            <span className="text-[10px] text-muted-foreground px-1 leading-none text-center">{nowLabel}</span>
            {nowLoading ? (
              <span className="block px-1.5 py-1 text-muted-foreground">{nowLoadingLabel}</span>
            ) : (
              <button
                type="button"
                disabled={nowDisabled}
                onClick={() => onModeChange('now')}
                aria-pressed={nowActive}
                aria-label={`${vegagerdinGroupLabel} ${nowLabel}${nowMeasuredAtLabel ? `, ${nowMeasuredAtLabel}` : ''}, ${nowStatusLabel}`}
                className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded transition-colors min-w-[32px] min-h-[32px] ${
                  nowActive
                    ? 'bg-foreground/10 ring-1 ring-foreground/30'
                    : nowDisabled
                      ? 'opacity-40 cursor-default'
                      : 'hover:bg-foreground/5 active:bg-foreground/10'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: neutralStatusColors ? NEUTRAL_STATUS_DOT_COLOR : nowStatusColor }}
                  aria-hidden
                />
                {nowMeasuredAtLabel && (
                  <span className="text-[10px] font-mono text-muted-foreground leading-none">{nowMeasuredAtLabel}</span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right: forecast provider slots (Veðurstofan forecast; Yr not yet wired) — scrollable */}
      <div className="flex-1 min-w-0">
        <div className="px-2 pt-1 pb-0.5 text-[10px] text-muted-foreground leading-none text-center">
          {forecastGroupLabel}
        </div>
        <div className="px-1 pb-1">
          {forecastLoading && forecastSlots.length === 0 ? (
            <span className="block px-1.5 py-1 text-muted-foreground">{forecastLoadingLabel}</span>
          ) : forecastSlots.length > 0 ? (
            <div className="overflow-x-auto" ref={scrollRef}>
              <div className="flex gap-2 pb-0.5" style={{ minWidth: 'max-content' }}>
                {groupSlotsByDay(forecastSlots, locale).map(({ dayKey, dayLabel, slots: daySlots }) => (
                  <div key={dayKey} className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-muted-foreground px-1 leading-none text-center">{dayLabel}</span>
                    <div className="flex gap-0.5">
                      {daySlots.map(slot => {
                        const isActive = activeMode === slot.timeMs
                        const hourLabel = new Date(slot.timeMs).toISOString().slice(11, 13)
                        const ariaLabel = `${forecastGroupLabel} ${forecastLabel} ${formatLongDepartureDateTime(new Date(slot.timeMs).toISOString(), locale)}, ${slot.worstStatusLabel}`
                        return (
                          <button
                            key={slot.timeMs}
                            type="button"
                            data-active={isActive ? 'true' : undefined}
                            onClick={() => onModeChange(slot.timeMs)}
                            aria-pressed={isActive}
                            aria-label={ariaLabel}
                            className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded min-w-[32px] transition-colors ${
                              isActive
                                ? 'bg-foreground/10 ring-1 ring-foreground/30'
                                : 'hover:bg-foreground/5 active:bg-foreground/10'
                            }`}
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{
                                background: neutralStatusColors
                                  ? NEUTRAL_STATUS_DOT_COLOR
                                  : WIND_STATUS_MARKER_COLOR[slot.worstStatus],
                              }}
                              aria-hidden
                            />
                            <span className="text-[10px] font-mono text-muted-foreground leading-none">
                              {hourLabel}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Next arrow */}
      <button
        type="button"
        disabled={nextDisabled}
        onClick={() => selectRelative(1)}
        aria-label={nextLabel}
        className={`flex-shrink-0 flex items-center justify-center w-8 border-l border-border transition-colors ${
          nextDisabled ? 'text-muted-foreground/30 cursor-default' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/5'
        }`}
      >
        <ChevronRight className="w-4 h-4" aria-hidden />
      </button>

    </div>
  )
}

