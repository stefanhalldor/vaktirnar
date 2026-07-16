'use client'

interface ScopedChatComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  /** Disables both input and button (e.g. while sending). */
  disabled: boolean
  placeholder: string
  sendLabel: string
  /**
   * Visual variant:
   *   'compact' — inline station-card style (tighter, ghost button)
   *   'full'    — full-page panel style (roomier, dark button)  [default]
   */
  variant?: 'compact' | 'full'
}

export function ScopedChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  sendLabel,
  variant = 'full',
}: ScopedChatComposerProps) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() }
  }

  if (variant === 'compact') {
    return (
      <div className="flex gap-1.5">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={1000}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 text-base sm:text-sm min-h-10 sm:min-h-8 px-2 py-1 rounded-md border border-border/60 bg-transparent focus:outline-none focus:ring-1 focus:ring-ring/60 placeholder:text-muted-foreground/50 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="text-sm sm:text-xs min-h-10 sm:min-h-8 px-2.5 sm:px-2 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40 transition-colors shrink-0"
        >
          {sendLabel}
        </button>
      </div>
    )
  }

  return (
    <div className="flex gap-1.5">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={1000}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 text-base min-h-10 px-2.5 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60 disabled:opacity-60"
      />
      <button
        type="button"
        onClick={onSend}
        disabled={disabled || !value.trim()}
        className="text-sm min-h-10 px-3 rounded-lg bg-foreground text-background disabled:opacity-40 transition-opacity shrink-0"
      >
        {sendLabel}
      </button>
    </div>
  )
}
