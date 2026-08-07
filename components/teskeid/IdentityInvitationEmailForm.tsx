'use client'

import { TeskeidActionButton } from './TeskeidActionButton'

type IdentityInvitationEmailFormProps = {
  value: string
  label: string
  placeholder?: string
  submitLabel: string
  pendingLabel: string
  cancelLabel: string
  isPending: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}

/** Domain-neutral email step for linking a named guest to explicit consent. */
export function IdentityInvitationEmailForm({
  value,
  label,
  placeholder,
  submitLabel,
  pendingLabel,
  cancelLabel,
  isPending,
  onChange,
  onSubmit,
  onCancel,
}: IdentityInvitationEmailFormProps) {
  return (
    <form
      className="space-y-3"
      aria-busy={isPending}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{label}</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={320}
          value={value}
          placeholder={placeholder}
          disabled={isPending}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
        />
      </label>
      <div className="flex gap-2">
        <TeskeidActionButton
          type="button"
          variant="secondary"
          className="flex-1"
          disabled={isPending}
          onClick={onCancel}
        >
          {cancelLabel}
        </TeskeidActionButton>
        <TeskeidActionButton
          type="submit"
          variant="primary"
          className="flex-1"
          disabled={isPending || !value.trim()}
          pending={isPending}
        >
          {isPending ? pendingLabel : submitLabel}
        </TeskeidActionButton>
      </div>
    </form>
  )
}
