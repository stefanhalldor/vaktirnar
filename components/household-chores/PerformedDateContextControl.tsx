'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { TeskeidActionSheet } from '@/components/teskeid/TeskeidActionSheet'
import { TeskeidDateField } from '@/components/teskeid/TeskeidDateField'
import { formatDateOnly } from '@/lib/date-format'
import { previousHouseholdChoreCalendarDate } from '@/lib/household-chores/priority-v2'

export function performedDateContextLabel(
  value: string,
  serverToday: string,
  locale: string,
  todayLabel: string,
  yesterdayLabel: string,
): string {
  if (value === serverToday) return todayLabel
  if (value === previousHouseholdChoreCalendarDate(serverToday)) return yesterdayLabel
  return formatDateOnly(value, locale)
}

export function PerformedDateContextControl({
  value,
  serverToday,
  onChange,
  disabled = false,
  minimumDate,
}: {
  value: string
  serverToday: string
  onChange: (value: string) => void
  disabled?: boolean
  minimumDate?: string
}) {
  const t = useTranslations('teskeid.householdChores')
  const locale = useLocale()
  const yesterday = previousHouseholdChoreCalendarDate(serverToday)
  const [open, setOpen] = useState(false)
  const [customDate, setCustomDate] = useState(value)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) setCustomDate(value)
  }, [open, value])

  const dateLabel = performedDateContextLabel(
    value,
    serverToday,
    locale,
    t('performedDate.today'),
    t('performedDate.yesterday'),
  )
  const isToday = value === serverToday

  function choose(nextValue: string) {
    onChange(nextValue)
    setOpen(false)
  }

  return (
    <div className={isToday ? 'flex flex-wrap items-center gap-2' : 'flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 p-2'}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <CalendarDays aria-hidden size={17} className="shrink-0" />
        <span className="truncate">{t('performedDate.context', { date: dateLabel })}</span>
      </button>
      {!isToday ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(serverToday)}
          className="inline-flex min-h-10 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {t('performedDate.resetToday')}
        </button>
      ) : null}

      <TeskeidActionSheet
        open={open}
        onOpenChange={setOpen}
        title={t('performedDate.sheetTitle')}
        description={t('performedDate.sheetDescription')}
        closeLabel={t('common.cancel')}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          triggerRef.current?.focus()
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <TeskeidActionButton
            type="button"
            variant={value === serverToday ? 'primary' : 'secondary'}
            onClick={() => choose(serverToday)}
          >
            {t('performedDate.today')}
          </TeskeidActionButton>
          <TeskeidActionButton
            type="button"
            variant={value === yesterday ? 'primary' : 'secondary'}
            disabled={minimumDate !== undefined && yesterday < minimumDate}
            onClick={() => choose(yesterday)}
          >
            {t('performedDate.yesterday')}
          </TeskeidActionButton>
        </div>
        <TeskeidDateField
          label={t('performedDate.dateLabel')}
          value={customDate}
          onChange={setCustomDate}
          placeholder={t('performedDate.chooseDate')}
          min={minimumDate}
          max={serverToday}
        />
        <TeskeidActionButton
          type="button"
          variant="primary"
          disabled={!customDate
            || customDate > serverToday
            || (minimumDate !== undefined && customDate < minimumDate)}
          onClick={() => choose(customDate)}
          className="w-full"
        >
          {t('performedDate.useDate')}
        </TeskeidActionButton>
      </TeskeidActionSheet>
    </div>
  )
}
