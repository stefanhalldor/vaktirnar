'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TeskeidTimeFieldProps {
  label: string
  hourLabel: string
  minuteLabel: string
  value: string
  onChange: (value: string) => void
  id?: string
  name?: string
  step?: number
  required?: boolean
  disabled?: boolean
  className?: string
}

function splitTime(value: string): [string, string] {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  return match ? [match[1], match[2]] : ['', '']
}

export function TeskeidTimeField({
  label,
  hourLabel,
  minuteLabel,
  value,
  onChange,
  id,
  name,
  step = 900,
  required,
  disabled,
  className,
}: TeskeidTimeFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const [isDesktop, setIsDesktop] = useState(false)
  const [valueHour, valueMinute] = splitTime(value)
  const [hour, setHour] = useState(valueHour)
  const [minute, setMinute] = useState(valueMinute)
  const minuteStep = Math.max(1, Math.min(60, Math.floor(step / 60)))
  const hours = useMemo(() => Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0')), [])
  const minutes = useMemo(() => {
    const values = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, index) => index * minuteStep)
      .filter(item => item < 60)
      .map(item => String(item).padStart(2, '0'))
    if (valueMinute && !values.includes(valueMinute)) values.push(valueMinute)
    return values.sort()
  }, [minuteStep, valueMinute])

  useEffect(() => {
    setHour(valueHour)
    setMinute(valueMinute)
  }, [valueHour, valueMinute])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(min-width: 768px)')
    const updateViewport = () => setIsDesktop(query.matches)
    updateViewport()
    query.addEventListener('change', updateViewport)
    return () => query.removeEventListener('change', updateViewport)
  }, [])

  function update(nextHour: string, nextMinute: string) {
    setHour(nextHour)
    setMinute(nextMinute)
    onChange(nextHour && nextMinute ? `${nextHour}:${nextMinute}` : '')
  }

  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={inputId} className="flex min-w-0 flex-col gap-1 md:hidden">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className={cn(
          'relative flex min-h-11 items-center rounded-xl border border-input bg-background shadow-sm',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
          disabled && 'opacity-60',
        )}>
          <input
            id={inputId}
            name={name}
            type="time"
            value={value}
            onChange={event => onChange(event.target.value)}
            step={step}
            required={required}
            disabled={disabled || isDesktop}
            className="min-h-11 min-w-0 flex-1 rounded-xl bg-transparent px-3 text-base outline-none"
          />
          <Clock aria-hidden size={17} className="pointer-events-none mr-3 shrink-0 text-muted-foreground" />
        </span>
      </label>

      <fieldset className="hidden min-w-0 md:block" disabled={disabled || !isDesktop}>
        <legend className="mb-1 text-sm font-medium text-foreground">{label}</legend>
        <div className={cn(
          'grid min-h-11 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center rounded-xl border border-input bg-background shadow-sm',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
          disabled && 'opacity-60',
        )}>
          <select
            aria-label={hourLabel}
            value={hour}
            onChange={event => update(event.target.value, minute)}
            required={required}
            className="min-h-11 min-w-0 rounded-l-xl bg-transparent px-3 text-base outline-none"
          >
            <option value="">--</option>
            {hours.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          <span aria-hidden className="font-semibold text-muted-foreground">:</span>
          <select
            aria-label={minuteLabel}
            value={minute}
            onChange={event => update(hour, event.target.value)}
            required={required}
            className="min-h-11 min-w-0 bg-transparent px-3 text-base outline-none"
          >
            <option value="">--</option>
            {minutes.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          <Clock aria-hidden size={17} className="mr-3 shrink-0 text-muted-foreground" />
        </div>
      </fieldset>
    </div>
  )
}
