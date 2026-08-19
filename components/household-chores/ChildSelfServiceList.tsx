'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTeskeidNavigation } from '@/components/teskeid/TeskeidNavigationFeedback'
import type { HouseholdChoreSelfServiceView } from '@/lib/household-chores/contracts'
import { selfAssignHouseholdChoreAction } from '@/lib/household-chores/actions'
import { householdChoreAssignmentPath } from '@/lib/household-chores/paths'
import { HouseholdChoreRequestIds } from '@/lib/household-chores/request-id.client'

export function ChildSelfServiceList({ view }: { view: HouseholdChoreSelfServiceView }) {
  const t = useTranslations('teskeid.householdChores')
  const router = useRouter()
  const { navigate } = useTeskeidNavigation()
  const [isPending, startTransition] = useTransition()
  const [pendingDefinitionId, setPendingDefinitionId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const requests = useRef(new HouseholdChoreRequestIds())

  function claim(definitionId: string, definitionVersion: string, valueVersion: string) {
    if (isPending) return
    const fingerprint = `self-assign:${view.circleId}:${definitionId}:${definitionVersion}:${valueVersion}`
    const requestId = requests.current.begin(fingerprint)
    if (!requestId) return
    setPendingDefinitionId(definitionId)
    setErrors((current) => ({ ...current, [definitionId]: '' }))
    startTransition(async () => {
      let result
      try {
        result = await selfAssignHouseholdChoreAction({
          requestId,
          circleId: view.circleId,
          definitionId,
          expectedDefinitionVersion: definitionVersion,
          expectedValueVersion: valueVersion,
        })
        requests.current.returned(fingerprint, result)
      } catch {
        requests.current.uncertain(fingerprint)
        setPendingDefinitionId(null)
        setErrors((current) => ({ ...current, [definitionId]: t('errors.save_failed') }))
        return
      }
      if (!result.ok) {
        setPendingDefinitionId(null)
        setErrors((current) => ({
          ...current,
          [definitionId]: result.error === 'stale'
            ? t('selfService.stale')
            : t(`errors.${result.error}`),
        }))
        if (result.error === 'stale') router.refresh()
        return
      }
      navigate(householdChoreAssignmentPath(view.circleId, result.data.resourceId))
    })
  }

  if (view.items.length === 0) {
    return (
      <p className="border-y border-border py-6 text-sm text-muted-foreground">
        {t('selfService.empty')}
      </p>
    )
  }

  return (
    <div className="divide-y divide-border border-y border-border">
      {view.items.map((item) => {
        const rowPending = isPending && pendingDefinitionId === item.definitionId
        return (
          <article key={item.definitionId} className="space-y-3 py-4">
            <div>
              <h2 className="break-words text-sm font-semibold">{item.title}</h2>
              {item.description ? (
                <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                  {item.description}
                </p>
              ) : null}
              <p className="mt-2 text-sm font-medium">
                {t('selfService.points', { count: item.points })}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                {t('selfService.openCount', { count: item.ownOpenCount })}
              </p>
            </div>
            {errors[item.definitionId] ? (
              <p className="text-sm text-destructive" role="alert">
                {errors[item.definitionId]}
              </p>
            ) : null}
            <button
              type="button"
              disabled={isPending}
              onClick={() => claim(
                item.definitionId,
                item.definitionVersion,
                item.participantValueVersion,
              )}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {rowPending ? t('common.saving') : t('selfService.claim')}
            </button>
          </article>
        )
      })}
    </div>
  )
}
