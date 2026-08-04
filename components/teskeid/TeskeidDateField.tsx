'use client'

import { useId, useRef } from 'react'
import { Calendar } from 'lucide-react'
import { useLocale } from 'next-intl'
import { formatDateOnly } from '@/lib/date-format'
import { cn } from '@/lib/utils'

interface TeskeidDateFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  id?: string
  name?: string
  min?: string
  max?: string
  required?: boolean
  disabled?: boolean
  className?: string
  labelClassName?: string
  controlClassName?: string
  'aria-describedby'?: string
}

export function TeskeidDateField({
  label,
  value,
  onChange,
  placeholder,
  id,
  name,
  min,
  max,
  required,
  disabled,
  className,
  labelClassName,
  controlClassName,
  'aria-describedby': ariaDescribedBy,
}: TeskeidDateFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const inputRef = useRef<HTMLInputElement>(null)
  const locale = useLocale()
  const displayValue = formatDateOnly(value, locale)

  function showPicker() {
    if (disabled) return
    try {
      inputRef.current?.showPicker?.()
    } catch {
      // The transparent native input remains clickable when showPicker is unavailable.
    }
  }

  return (
    <label htmlFor={inputId} className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className={cn('text-sm font-medium text-foreground', labelClassName)}>{label}</span>
      <span
        className={cn(
          'relative flex min-h-11 w-full cursor-pointer items-center justify-between rounded-xl border border-input bg-background px-3 text-base text-foreground shadow-sm outline-none',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
          disabled && 'cursor-not-allowed opacity-60',
          controlClassName,
        )}
        onClick={showPicker}
      >
        <span className={cn('min-w-0 truncate select-none', !displayValue && 'text-muted-foreground')}>
          {displayValue || placeholder}
        </span>
        <Calendar aria-hidden size={16} className="ml-3 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="date"
          value={value}
          min={min}
          max={max}
          required={required}
          disabled={disabled}
          aria-label={label}
          aria-describedby={ariaDescribedBy}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          style={{ fontSize: '16px' }}
        />
      </span>
    </label>
  )
}
