'use client'

import { FormEvent, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTeskeidNavigation } from '@/components/teskeid/TeskeidNavigationFeedback'
import type { HouseholdChoreManagedDefinition } from '@/lib/household-chores/contracts'
import { assignHouseholdChoreAction } from '@/lib/household-chores/actions'
import {
  householdChoreAssignmentPath,
  householdChoreAssignPath,
} from '@/lib/household-chores/paths'
import { HouseholdChoreRequestIds } from '@/lib/household-chores/request-id.client'

interface EligibleParticipantValue {
  participantId: string
  label: string
  points: number
  valueVersion: string
}

export function ChoreAssignmentForm({
  circleId,
  definitions,
  selectedDefinition,
  eligibleValues,
}: {
  circleId: string
  definitions: HouseholdChoreManagedDefinition[]
  selectedDefinition: HouseholdChoreManagedDefinition | null
  eligibleValues: EligibleParticipantValue[]
}) {
  const t = useTranslations('teskeid.householdChores')
  const router = useRouter()
  const { navigate } = useTeskeidNavigation()
  const [isPending, startTransition] = useTransition()
  const [participantId, setParticipantId] = useState(eligibleValues[0]?.participantId ?? '')
  const [error, setError] = useState<string | null>(null)
  const requests = useRef(new HouseholdChoreRequestIds())
  const selectedValue = eligibleValues.find((item) => item.participantId === participantId)

  function selectDefinition(definitionId: string) {
    setError(null)
    setParticipantId('')
    startTransition(() => {
      const params = new URLSearchParams({ definitionId })
      navigate(`${householdChoreAssignPath(circleId)}?${params.toString()}`, 'replace')
    })
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending || !selectedDefinition || !selectedValue) return

    const fingerprint = [
      'assign',
      circleId,
      selectedDefinition.definitionId,
      selectedDefinition.version,
      selectedValue.participantId,
      selectedValue.valueVersion,
    ].join(':')
    const requestId = requests.current.begin(fingerprint)
    if (!requestId) return
    setError(null)

    startTransition(async () => {
      let result
      try {
        result = await assignHouseholdChoreAction({
          requestId,
          circleId,
          definitionId: selectedDefinition.definitionId,
          participantId: selectedValue.participantId,
          expectedDefinitionVersion: selectedDefinition.version,
          expectedValueVersion: selectedValue.valueVersion,
        })
        requests.current.returned(fingerprint, result)
      } catch {
        requests.current.uncertain(fingerprint)
        setError(t('errors.save_failed'))
        return
      }

      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        if (result.error === 'stale') router.refresh()
        return
      }
      navigate(householdChoreAssignmentPath(circleId, result.data.resourceId))
    })
  }

  if (definitions.length === 0) {
    return <p className="border-y border-border py-6 text-sm text-muted-foreground">{t('assign.empty')}</p>
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <label className="block space-y-2 text-sm font-medium">
        <span>{t('assign.definition')}</span>
        <select
          value={selectedDefinition?.definitionId ?? ''}
          disabled={isPending}
          onChange={(event) => selectDefinition(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {definitions.map((definition) => (
            <option key={definition.definitionId} value={definition.definitionId}>
              {definition.title}
            </option>
          ))}
        </select>
      </label>

      {selectedDefinition && eligibleValues.length > 0 ? (
        <>
          <label className="block space-y-2 text-sm font-medium">
            <span>{t('assign.participant')}</span>
            <select
              value={participantId}
              disabled={isPending}
              onChange={(event) => setParticipantId(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {eligibleValues.map((value) => (
                <option key={value.participantId} value={value.participantId}>
                  {value.label} · {t('assign.points', { count: value.points })}
                </option>
              ))}
            </select>
          </label>

          {selectedValue ? (
            <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm font-medium">
              {t('assign.points', { count: selectedValue.points })}
            </p>
          ) : null}
        </>
      ) : (
        <p className="border-y border-border py-5 text-sm text-muted-foreground">
          {t('assign.noEligibleParticipants')}
        </p>
      )}

      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

      <button
        type="submit"
        disabled={isPending || !selectedDefinition || !selectedValue}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {isPending ? t('common.saving') : t('assign.submit')}
      </button>
    </form>
  )
}
