'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { createRequestId } from '@/components/expenses/ui'
import { repairEventPersonLabel } from '@/lib/events/participant-identity-v2.actions'
import { EventV2SafeDisplayNameSchema } from '@/lib/events/participant-identity-v2.contracts'

export function EventGuestNameRepair({
  eventId,
  eventGuestId,
  rosterRevision,
  labelVersion,
  administrativeEmail,
  disabled = false,
}: {
  eventId: string
  eventGuestId: string
  rosterRevision: string
  labelVersion: string
  administrativeEmail: string | null
  disabled?: boolean
}) {
  const t = useTranslations('teskeid.events')
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const inFlightRef = useRef(false)
  const requestRef = useRef<{ name: string; id: string } | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (error) inputRef.current?.focus()
  }, [error])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlightRef.current) return
    const parsedName = EventV2SafeDisplayNameSchema.safeParse(name.trim().normalize('NFC'))
    if (!parsedName.success) {
      setError(t('repair.invalidName'))
      inputRef.current?.focus()
      return
    }
    const normalized = parsedName.data
    if (requestRef.current?.name !== normalized) {
      requestRef.current = { name: normalized, id: createRequestId() }
    }
    inFlightRef.current = true
    setPending(true)
    setError(null)
    setSaved(false)
    try {
      const result = await repairEventPersonLabel({
        event_id: eventId,
        event_guest_id: eventGuestId,
        expected_roster_revision: rosterRevision,
        expected_label_version: labelVersion,
        shared_display_name: normalized,
        request_id: requestRef.current.id,
      })
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        return
      }
      setSaved(true)
      router.refresh()
    } catch {
      setError(t('errors.save_failed'))
    } finally {
      inFlightRef.current = false
      setPending(false)
    }
  }

  return (
    <form className="mt-3 space-y-3 rounded-xl border border-border bg-muted/35 p-3" onSubmit={submit}>
      <div>
        <p className="text-sm font-semibold">{t('repair.title')}</p>
        {administrativeEmail ? (
          <p className="mt-1 break-all text-xs text-muted-foreground">
            {t('repair.ownerEmail')}: {administrativeEmail}
          </p>
        ) : null}
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('repair.hint')}</p>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t('repair.nameLabel')}</span>
        <input
          ref={inputRef}
          className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          required
          disabled={disabled || pending}
          placeholder={t('repair.namePlaceholder')}
        />
      </label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p role="status" className="text-sm text-muted-foreground">{t('repair.saved')}</p> : null}
      <TeskeidActionButton
        type="submit"
        variant="secondary"
        pending={pending}
        disabled={disabled || pending || !name.trim()}
        className="w-full"
      >
        {pending ? t('repair.saving') : t('repair.save')}
      </TeskeidActionButton>
    </form>
  )
}
