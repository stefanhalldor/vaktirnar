'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { HouseholdChoreParticipantValueView } from '@/lib/household-chores/contracts'
import { setHouseholdChoreParticipantValueAction } from '@/lib/household-chores/actions'
import { HouseholdChoreRequestIds } from '@/lib/household-chores/request-id.client'

function ParticipantValueRow({
  circleId,
  definitionId,
  definitionVersion,
  value,
}: {
  circleId: string
  definitionId: string
  definitionVersion: string
  value: HouseholdChoreParticipantValueView
}) {
  const t = useTranslations('teskeid.householdChores')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [active, setActive] = useState(value.valueStatus === 'active')
  const [points, setPoints] = useState(value.points?.toString() ?? '1')
  const [error, setError] = useState<string | null>(null)
  const requests = useRef(new HouseholdChoreRequestIds())
  const label = value.identityMarker === 'former_member'
    ? t('common.formerMember')
    : value.label ?? t('common.formerMember')
  const canEdit = value.participantStatus === 'active'

  function save() {
    if (isPending || !canEdit) return
    const fingerprint = `set-value:${circleId}:${definitionId}:${value.participantId}:${definitionVersion}:${value.valueVersion}:${active}:${points}`
    const requestId = requests.current.begin(fingerprint)
    if (!requestId) return
    setError(null)
    startTransition(async () => {
      const parsedPoints = active ? Number(points) : null
      let result
      try {
        result = await setHouseholdChoreParticipantValueAction({
          requestId,
          circleId,
          definitionId,
          participantId: value.participantId,
          expectedDefinitionVersion: definitionVersion,
          expectedValueVersion: value.valueVersion,
          points: parsedPoints,
          active,
        })
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
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 py-4">
      <label className="flex min-h-10 items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          checked={active}
          disabled={isPending || !canEdit}
          onChange={(event) => setActive(event.target.checked)}
          className="size-5 rounded border-border"
        />
        <span className="min-w-0 flex-1 break-words">{label}</span>
      </label>
      {active ? (
        <div className="flex items-end gap-3">
          <label className="min-w-0 flex-1 text-sm">
            <span className="mb-1 block font-medium">{t('definitions.pointsLabel')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              step={1}
              value={points}
              disabled={isPending || !canEdit}
              onChange={(event) => setPoints(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
          </label>
          <button
            type="button"
            disabled={isPending || !canEdit}
            onClick={save}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {isPending ? t('common.saving') : t('definitions.savePoints')}
          </button>
        </div>
      ) : value.valueStatus !== 'missing' ? (
        <button
          type="button"
          disabled={isPending || !canEdit}
          onClick={save}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {isPending ? t('common.saving') : t('definitions.savePoints')}
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">{t('definitions.enableToSet')}</p>
      )}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  )
}

export function ParticipantValueEditor({
  circleId,
  definitionId,
  definitionVersion,
  values,
}: {
  circleId: string
  definitionId: string
  definitionVersion: string
  values: HouseholdChoreParticipantValueView[]
}) {
  const t = useTranslations('teskeid.householdChores')
  return (
    <section aria-labelledby="participant-values-heading">
      <h2 id="participant-values-heading" className="mb-2 text-sm font-semibold">
        {t('definitions.pointsHeading')}
      </h2>
      <p className="mb-3 text-sm leading-6 text-muted-foreground">
        {t('definitions.pointsHint')}
      </p>
      <div className="divide-y divide-border border-y border-border">
        {values.map((value) => (
          <ParticipantValueRow
            key={`${value.participantId}:${definitionVersion}:${value.valueVersion}`}
            circleId={circleId}
            definitionId={definitionId}
            definitionVersion={definitionVersion}
            value={value}
          />
        ))}
      </div>
    </section>
  )
}
