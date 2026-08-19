'use client'

export interface TeskeidPillFilterOption {
  id: string
  label: string
  disabled?: boolean
}

export function TeskeidMultiSelectPillFilter({
  options,
  selectedIds,
  onChange,
  ariaLabel,
  clearLabel,
}: {
  options: TeskeidPillFilterOption[]
  selectedIds: string[]
  onChange: (selectedIds: string[]) => void
  ariaLabel: string
  clearLabel: string
}) {
  const selected = new Set(selectedIds)

  function toggle(id: string) {
    onChange(selected.has(id)
      ? selectedIds.filter(selectedId => selectedId !== id)
      : [...selectedIds, id])
  }

  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-label={ariaLabel}
        className="flex max-w-full flex-wrap gap-2"
      >
        {options.map(option => (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected.has(option.id)}
            disabled={option.disabled}
            onClick={() => toggle(option.id)}
            className="inline-flex min-h-10 max-w-full items-center rounded-full border border-border bg-background px-3 text-sm font-medium aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="truncate">{option.label}</span>
          </button>
        ))}
      </div>
      {selectedIds.length > 0 ? (
        <button
          type="button"
          onClick={() => onChange([])}
          className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {clearLabel}
        </button>
      ) : null}
    </div>
  )
}
