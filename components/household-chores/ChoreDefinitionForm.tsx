'use client'

import { FormEvent, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTeskeidNavigation } from '@/components/teskeid/TeskeidNavigationFeedback'
import type { HouseholdChoreScheduledDefinition } from '@/lib/household-chores/contracts'
import {
  createHouseholdChoreDefinitionAction,
  updateHouseholdChoreDefinitionAction,
} from '@/lib/household-chores/actions'
import { householdChoreDefinitionPath } from '@/lib/household-chores/paths'
import { HouseholdChoreRequestIds } from '@/lib/household-chores/request-id.client'

export function ChoreDefinitionForm({
  circleId,
  definition,
}: {
  circleId: string
  definition?: HouseholdChoreScheduledDefinition
}) {
  const t = useTranslations('teskeid.householdChores')
  const router = useRouter()
  const { navigate } = useTeskeidNavigation()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const requests = useRef(new HouseholdChoreRequestIds())

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending) return
    const data = new FormData(event.currentTarget)
    const fingerprint = [
      definition ? 'update-definition' : 'create-definition',
      circleId,
      definition?.definitionId ?? '',
      definition?.version ?? '',
      String(data.get('title') ?? '').trim(),
      String(data.get('description') ?? '').trim(),
      String(data.get('materials') ?? '').trim(),
      String(data.get('cadenceDays') ?? '').trim(),
      String(data.get('completionScope') ?? '').trim(),
    ].join(':')
    const requestId = requests.current.begin(fingerprint)
    if (!requestId) return
    const input = {
      requestId,
      circleId,
      ...(definition
        ? { definitionId: definition.definitionId, expectedVersion: definition.version }
        : {}),
      title: data.get('title'),
      description: data.get('description'),
      materials: data.get('materials'),
      cadenceDays: Number(data.get('cadenceDays')),
      completionScope: data.get('completionScope'),
    }
    setError(null)
    startTransition(async () => {
      let result
      try {
        result = definition
          ? await updateHouseholdChoreDefinitionAction(input)
          : await createHouseholdChoreDefinitionAction(input)
        requests.current.returned(fingerprint, result)
      } catch {
        requests.current.uncertain(fingerprint)
        setError(t('errors.save_failed'))
        return
      }
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        if (result.error === 'stale' || result.error === 'conflict') router.refresh()
        return
      }
      navigate(householdChoreDefinitionPath(circleId, result.data.resourceId), 'replace')
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <label htmlFor="chore-title" className="block text-sm font-medium">
          {t('definitions.name')}
        </label>
        <input
          id="chore-title"
          name="title"
          type="text"
          required
          maxLength={120}
          defaultValue={definition?.title ?? ''}
          disabled={isPending}
          className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="chore-cadence-days" className="block text-sm font-medium">
          {t('definitions.cadenceDays')}
        </label>
        <input
          id="chore-cadence-days"
          name="cadenceDays"
          type="number"
          inputMode="numeric"
          required
          min={1}
          max={3650}
          defaultValue={definition?.cadenceDays ?? (definition ? '' : 7)}
          disabled={isPending}
          className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
        <p className="text-xs leading-5 text-muted-foreground">
          {t('definitions.cadenceHint')}
        </p>
      </div>
      <fieldset className="space-y-2" disabled={isPending}>
        <legend className="text-sm font-medium">{t('definitions.completionScope')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['global', 'per_participant'] as const).map((scope) => (
            <label
              key={scope}
              className="flex min-h-20 cursor-pointer gap-3 rounded-xl border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="completionScope"
                value={scope}
                defaultChecked={(definition?.completionScope ?? 'global') === scope}
                className="mt-1 size-4 shrink-0 accent-primary"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">
                  {t(`definitions.scope.${scope}.label`)}
                </span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {t(`definitions.scope.${scope}.description`)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-2">
        <label htmlFor="chore-description" className="block text-sm font-medium">
          {t('definitions.descriptionOptional')}
        </label>
        <textarea
          id="chore-description"
          name="description"
          rows={5}
          maxLength={2000}
          defaultValue={definition?.description ?? ''}
          disabled={isPending}
          className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-base leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="chore-materials" className="block text-sm font-medium">
          {t('definitions.materialsOptional')}
        </label>
        <textarea
          id="chore-materials"
          name="materials"
          rows={5}
          maxLength={4000}
          defaultValue={definition?.materials ?? ''}
          disabled={isPending}
          className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-base leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
      </div>
      {!definition ? (
        <p className="text-sm leading-6 text-muted-foreground">
          {t('definitions.configureAfterSave')}
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {isPending ? t('common.saving') : t('definitions.save')}
      </button>
    </form>
  )
}
