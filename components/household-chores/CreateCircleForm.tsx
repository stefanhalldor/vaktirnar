'use client'

import { FormEvent, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useTeskeidNavigation } from '@/components/teskeid/TeskeidNavigationFeedback'
import { createHouseholdChoreCircleAction } from '@/lib/household-chores/actions'
import { householdChoreCirclePath } from '@/lib/household-chores/paths'
import { HouseholdChoreRequestIds } from '@/lib/household-chores/request-id.client'

export function CreateCircleForm() {
  const t = useTranslations('teskeid.householdChores')
  const { navigate } = useTeskeidNavigation()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const requests = useRef(new HouseholdChoreRequestIds())

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending) return
    const form = event.currentTarget
    const formData = new FormData(form)
    const fingerprint = `create-circle:${String(formData.get('name') ?? '').trim()}`
    const requestId = requests.current.begin(fingerprint)
    if (!requestId) return
    setError(null)

    startTransition(async () => {
      let result
      try {
        result = await createHouseholdChoreCircleAction({
          requestId,
          name: formData.get('name'),
        })
        requests.current.returned(fingerprint, result)
      } catch {
        requests.current.uncertain(fingerprint)
        setError(t('errors.save_failed'))
        return
      }
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        return
      }
      navigate(householdChoreCirclePath(result.data.resourceId), 'replace')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <div className="space-y-2">
        <label htmlFor="household-circle-name" className="block text-sm font-medium">
          {t('circleForm.name')}
        </label>
        <input
          id="household-circle-name"
          name="name"
          type="text"
          required
          minLength={1}
          maxLength={120}
          autoComplete="off"
          disabled={isPending}
          className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
        <p>{t('circleForm.disclosure')}</p>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {isPending ? t('common.saving') : t('circleForm.submit')}
      </button>
    </form>
  )
}
