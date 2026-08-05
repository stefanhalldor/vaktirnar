'use client'

import { Check } from 'lucide-react'

export type TeskeidStepStatus = 'current' | 'complete' | 'available' | 'disabled' | 'attention'

export interface TeskeidStepNavItem<Id extends string> {
  id: Id
  label: string
  status: TeskeidStepStatus
  statusLabel?: string
}

interface TeskeidStepNavProps<Id extends string> {
  ariaLabel: string
  items: TeskeidStepNavItem<Id>[]
  onStepChange: (id: Id) => void
}

export function TeskeidStepNav<Id extends string>({
  ariaLabel,
  items,
  onStepChange,
}: TeskeidStepNavProps<Id>) {
  return (
    <nav aria-label={ariaLabel}>
      <ol
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item, index) => {
          const disabled = item.status === 'disabled'
          const current = item.status === 'current'
          const attention = item.status === 'attention'
          return (
            <li key={item.id} className="min-w-0">
              <button
                type="button"
                className={`flex min-h-11 w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium leading-tight transition-colors sm:text-xs ${
                  current
                    ? 'bg-primary text-primary-foreground'
                    : attention
                      ? 'border border-amber-500 bg-amber-50 text-amber-950'
                      : item.status === 'complete'
                        ? 'bg-primary/10 text-primary'
                        : 'border border-border bg-background text-foreground'
                } ${disabled ? 'cursor-not-allowed opacity-45' : current ? '' : 'hover:bg-primary/10'}`}
                aria-current={current ? 'step' : undefined}
                disabled={disabled}
                onClick={() => onStepChange(item.id)}
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${
                    current
                      ? 'bg-primary-foreground/20'
                      : attention
                        ? 'bg-amber-200'
                        : 'bg-muted'
                  }`}
                >
                  {item.status === 'complete' ? <Check size={11} strokeWidth={3} /> : attention ? '!' : index + 1}
                </span>
                <span className="w-full truncate">{item.label}</span>
                {item.statusLabel ? <span className="sr-only">, {item.statusLabel}</span> : null}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
