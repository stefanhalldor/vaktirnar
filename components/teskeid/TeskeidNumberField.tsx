'use client'

import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface TeskeidNumberFieldProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    | 'type'
    | 'value'
    | 'defaultValue'
    | 'onChange'
    | 'children'
    | 'inputMode'
    | 'aria-invalid'
    | 'aria-errormessage'
  > {
  label: string
  value: string
  onValueChange: (value: string) => void
  hint?: string
  error?: string
  inputMode?: 'numeric' | 'decimal'
  labelClassName?: string
  inputClassName?: string
}

export const TeskeidNumberField = forwardRef<HTMLInputElement, TeskeidNumberFieldProps>(
  (
    {
      label,
      value,
      onValueChange,
      hint,
      error,
      inputMode = 'numeric',
      id,
      className,
      labelClassName,
      inputClassName,
      'aria-describedby': ariaDescribedBy,
      ...inputProps
    },
    ref,
  ) => {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const hintId = `${inputId}-hint`
    const errorId = `${inputId}-error`
    const describedBy = [ariaDescribedBy, hint ? hintId : undefined, error ? errorId : undefined]
      .filter(Boolean)
      .join(' ') || undefined

    return (
      <div className={cn('flex min-w-0 flex-col gap-1', className)}>
        <label htmlFor={inputId} className={cn('text-sm font-medium text-foreground', labelClassName)}>
          {label}
        </label>
        <input
          {...inputProps}
          ref={ref}
          id={inputId}
          type="text"
          inputMode={inputMode}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-errormessage={error ? errorId : undefined}
          aria-describedby={describedBy}
          onChange={(event) => onValueChange(event.target.value)}
          className={cn(
            'min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground shadow-sm outline-none',
            'placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            'disabled:cursor-not-allowed disabled:opacity-60',
            error && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20',
            inputClassName,
          )}
        />
        {hint ? (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    )
  },
)

TeskeidNumberField.displayName = 'TeskeidNumberField'
