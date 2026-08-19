'use client'

import { FormEvent, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { renameHouseholdChoreCircleAction } from '@/lib/household-chores/actions'
import { HouseholdChoreRequestIds } from '@/lib/household-chores/request-id.client'

export function CircleRenameForm({
  circleId,
  initialName,
  version,
}: {
  circleId: string
  initialName: string
  version: string
}) {
  const t = useTranslations('teskeid.householdChores')
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const requests = useRef(new HouseholdChoreRequestIds())
  const alertRef = useRef<HTMLParagraphElement>(null)
  const normalizedName = name.trim()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending || normalizedName === initialName || normalizedName.length === 0) return
    const fingerprint = `rename-circle:${circleId}:${version}:${normalizedName}`
    const requestId = requests.current.begin(fingerprint)
    if (!requestId) return
    setError(null)

    startTransition(async () => {
      let result
      try {
        result = await renameHouseholdChoreCircleAction({
          requestId,
          circleId,
          expectedVersion: version,
          name: normalizedName,
        })
        requests.current.returned(fingerprint, result)
      } catch {
        requests.current.uncertain(fingerprint)
        setError(t('errors.save_failed'))
        queueMicrotask(() => alertRef.current?.focus())
        return
      }
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        queueMicrotask(() => alertRef.current?.focus())
        if (result.error === 'stale' || result.error === 'conflict') router.refresh()
        return
      }
      router.refresh()
    })
  }

  return (
    <section aria-labelledby="household-circle-settings-heading" className="space-y-4">
      <h2 id="household-circle-settings-heading" className="text-base font-semibold">
        {t('manage.circleSettingsHeading')}
      </h2>
      <form onSubmit={submit} className="space-y-3" noValidate>
        <div className="space-y-2">
          <label htmlFor="household-circle-rename" className="block text-sm font-medium">
            {t('circleForm.name')}
          </label>
          <input
            id="household-circle-rename"
            type="text"
            required
            minLength={1}
            maxLength={120}
            autoComplete="off"
            value={name}
            disabled={isPending}
            onChange={(event) => setName(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          />
        </div>
        {error ? (
          <p ref={alertRef} tabIndex={-1} className="text-sm text-destructive outline-none" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isPending || normalizedName.length === 0 || normalizedName === initialName}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {isPending ? t('common.saving') : t('manage.saveName')}
        </button>
      </form>
    </section>
  )
}
