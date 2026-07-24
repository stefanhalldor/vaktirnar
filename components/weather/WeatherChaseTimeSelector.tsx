'use client'

import { useEffect, useRef } from 'react'
import { useLocale } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ForecastTimeScrubberSlot } from '@/components/weather/ForecastTimeScrubber'
import {
  formatCompactForecastDay,
  groupSlotsByDay,
} from '@/lib/weather/forecastSlotHelpers'
import { formatLongDepartureDateTime } from '@/components/weather/travelAuditMap.helpers'

type WeatherChaseTimeSelectorProps = {
  slots: ForecastTimeScrubberSlot[]
  loading: boolean
  loadingLabel: string
  activeTimeMs: number | null
  onTimeChange: (timeMs: number) => void
  previousLabel: string
  nextLabel: string
  forecastLabel: string
}

export function WeatherChaseTimeSelector({
  slots,
  loading,
  loadingLabel,
  activeTimeMs,
  onTimeChange,
  previousLabel,
  nextLabel,
  forecastLabel,
}: WeatherChaseTimeSelectorProps) {
  const locale = useLocale()
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeIndex = slots.findIndex(slot => slot.timeMs === activeTimeMs)

  function selectRelative(delta: -1 | 1) {
    if (slots.length === 0) return
    const baseIndex = activeIndex >= 0 ? activeIndex : delta > 0 ? -1 : slots.length
    const nextSlot = slots[baseIndex + delta]
    if (nextSlot) onTimeChange(nextSlot.timeMs)
  }

  useEffect(() => {
    const active = scrollRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [activeTimeMs])

  if (loading && slots.length === 0) {
    return (
      <div className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
        {loadingLabel}
      </div>
    )
  }

  if (slots.length === 0) return null

  return (
    <div className="flex min-h-14 overflow-hidden rounded-lg border border-border bg-background/90 text-xs">
      <button
        type="button"
        disabled={activeIndex <= 0}
        onClick={() => selectRelative(-1)}
        aria-label={previousLabel}
        className="flex w-10 shrink-0 items-center justify-center border-r border-border text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-default disabled:text-muted-foreground/30"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>

      <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
        <div className="flex min-w-max gap-2 px-1.5 py-1">
          {groupSlotsByDay(slots, locale).map(({ dayKey, slots: daySlots }) => {
            const day = formatCompactForecastDay(daySlots[0].timeMs, locale)
            return (
              <div key={dayKey} className="flex flex-col items-center gap-0.5">
                <div className="flex min-w-10 flex-col items-center justify-center px-1 text-[10px] font-medium leading-tight text-muted-foreground">
                  <span>{day.weekdayLabel}</span>
                  <span>{day.dateLabel}</span>
                </div>
                <div className="flex items-center gap-1">
                  {daySlots.map(slot => {
                    const active = slot.timeMs === activeTimeMs
                    const hourLabel = new Date(slot.timeMs).toISOString().slice(11, 13)
                    return (
                      <button
                        key={slot.timeMs}
                        type="button"
                        data-active={active ? 'true' : undefined}
                        aria-pressed={active}
                        aria-label={`${forecastLabel} ${formatLongDepartureDateTime(new Date(slot.timeMs).toISOString(), locale)}`}
                        onClick={() => onTimeChange(slot.timeMs)}
                        className={`flex h-10 min-w-10 items-center justify-center rounded-md px-2 font-mono text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                          active
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                        }`}
                      >
                        {hourLabel}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <button
        type="button"
        disabled={activeIndex < 0 || activeIndex >= slots.length - 1}
        onClick={() => selectRelative(1)}
        aria-label={nextLabel}
        className="flex w-10 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-default disabled:text-muted-foreground/30"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
