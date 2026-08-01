'use client'

export function LiveDriveThresholdFields({
  cautionLabel,
  dangerLabel,
  unitLabel,
  cautionValue,
  dangerValue,
  onCautionChange,
  onDangerChange,
  disabled = false,
  idPrefix,
}: {
  cautionLabel: string
  dangerLabel: string
  unitLabel: string
  cautionValue: string
  dangerValue: string
  onCautionChange: (value: string) => void
  onDangerChange: (value: string) => void
  disabled?: boolean
  idPrefix: string
}) {
  const fields = [
    {
      id: `${idPrefix}-caution-wind`,
      label: cautionLabel,
      value: cautionValue,
      onChange: onCautionChange,
    },
    {
      id: `${idPrefix}-danger-wind`,
      label: dangerLabel,
      value: dangerValue,
      onChange: onDangerChange,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2">
      {fields.map(field => (
        <label key={field.id} htmlFor={field.id} className="min-w-0">
          <span className="mb-0.5 block text-[11px] text-muted-foreground">
            {field.label}
          </span>
          <span className="flex h-11 items-center rounded-md border border-border bg-background focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30">
            <input
              id={field.id}
              type="number"
              inputMode="decimal"
              min="0.1"
              max="40"
              step="0.1"
              value={field.value}
              disabled={disabled}
              onChange={event => field.onChange(event.target.value)}
              className="min-w-0 flex-1 bg-transparent px-2 text-base text-foreground outline-none disabled:opacity-60"
            />
            <span className="shrink-0 pr-2 text-[11px] text-muted-foreground">
              {unitLabel}
            </span>
          </span>
        </label>
      ))}
    </div>
  )
}
