'use client'

import { clsx } from 'clsx'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

export type TeskeidActionButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'

export interface TeskeidActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: TeskeidActionButtonVariant
  pending?: boolean
}

/**
 * Canonical command button for Teskeið action lists and dialogs.
 *
 * The variants describe consequence, not feature ownership: primary is the
 * expected next action, secondary is reversible, and danger is destructive.
 */
export const TeskeidActionButton = forwardRef<HTMLButtonElement, TeskeidActionButtonProps>(
  function TeskeidActionButton({
    variant = 'secondary',
    pending = false,
    disabled,
    className,
    children,
    ...props
  }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        className={clsx(
          'inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60',
          variant === 'primary' && 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
          variant === 'secondary' && 'border border-border bg-background text-foreground hover:bg-muted',
          variant === 'danger' && 'border border-destructive/40 bg-background text-destructive hover:bg-destructive/10',
          variant === 'ghost' && 'text-foreground hover:bg-muted',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    )
  },
)
