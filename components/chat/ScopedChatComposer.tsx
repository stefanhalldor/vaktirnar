'use client'

interface ScopedChatComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  /** Disables both input and button (e.g. while sending). */
  disabled: boolean
  /** Keeps the draft editable while only the send action is unavailable. */
  sendDisabled?: boolean
  placeholder: string
  sendLabel: string
  /**
   * Visual variant:
   *   'compact' — inline station-card style (tighter, ghost button)
   *   'full'    — full-page panel style (roomier, dark button)  [default]
   */
  variant?: 'compact' | 'full'
  maxLength?: number
  multiline?: boolean
}

export function ScopedChatComposer({
  value,
  onChange,
  onSend,
  disabled,
  sendDisabled = false,
  placeholder,
  sendLabel,
  variant = 'full',
  maxLength = 1000,
  multiline = false,
}: ScopedChatComposerProps) {
  function handleKeyDown(e: React.KeyboardEvent) {
    const shouldSend = e.key === 'Enter' && (
      multiline ? e.ctrlKey || e.metaKey : !e.shiftKey
    )
    if (shouldSend) {
      e.preventDefault()
      onSend()
    }
  }

  if (variant === 'compact') {
    return (
      <div className="flex gap-1.5">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 text-base sm:text-sm min-h-10 sm:min-h-8 px-2 py-1 rounded-md border border-border/60 bg-transparent focus:outline-none focus:ring-1 focus:ring-ring/60 placeholder:text-muted-foreground/50 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={disabled || sendDisabled || !value.trim()}
          className="text-sm sm:text-xs min-h-10 sm:min-h-8 px-2.5 sm:px-2 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40 transition-colors shrink-0"
        >
          {sendLabel}
        </button>
      </div>
    )
  }

  const fieldProps = {
    value,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    onKeyDown: handleKeyDown,
    maxLength,
    placeholder,
    disabled,
  }

  return (
    <div className="flex gap-1.5">
      {multiline ? (
        <textarea
          {...fieldProps}
          rows={2}
          className="min-h-12 max-h-40 flex-1 resize-y rounded-lg border border-border bg-background px-2.5 py-2 text-base leading-snug placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
        />
      ) : (
        <input
          {...fieldProps}
          type="text"
          className="min-h-10 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-base placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
        />
      )}
      <button
        type="button"
        onClick={onSend}
        disabled={disabled || sendDisabled || !value.trim()}
        className="text-sm min-h-10 px-3 rounded-lg bg-foreground text-background disabled:opacity-40 transition-opacity shrink-0"
      >
        {sendLabel}
      </button>
    </div>
  )
}
