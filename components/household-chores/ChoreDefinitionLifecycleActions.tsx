'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { HouseholdChoreManagedDefinition } from '@/lib/household-chores/contracts'
import {
  archiveHouseholdChoreDefinitionAction,
  reactivateHouseholdChoreDefinitionAction,
} from '@/lib/household-chores/actions'
import { HouseholdChoreRequestIds } from '@/lib/household-chores/request-id.client'

export function ChoreDefinitionLifecycleActions({
  circleId,
  definition,
}: {
  circleId: string
  definition: HouseholdChoreManagedDefinition
}) {
  const t = useTranslations('teskeid.householdChores')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requests = useRef(new HouseholdChoreRequestIds())
  const triggerRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const wasConfirming = useRef(false)

  useEffect(() => {
    if (confirming) {
      wasConfirming.current = true
      confirmRef.current?.focus()
    } else if (wasConfirming.current) {
      wasConfirming.current = false
      triggerRef.current?.focus()
    }
  }, [confirming])

  function mutate() {
    if (isPending) return
    const fingerprint = `${definition.status === 'active' ? 'archive' : 'reactivate'}-definition:${circleId}:${definition.definitionId}:${definition.version}`
    const requestId = requests.current.begin(fingerprint)
    if (!requestId) return
    setError(null)
    startTransition(async () => {
      const action = definition.status === 'active'
        ? archiveHouseholdChoreDefinitionAction
        : reactivateHouseholdChoreDefinitionAction
      let result
      try {
        result = await action({
          requestId,
          circleId,
          definitionId: definition.definitionId,
          expectedVersion: definition.version,
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
      setConfirming(false)
      router.refresh()
    })
  }

  const archive = definition.status === 'active'
  return (
    <div className="space-y-3">
      {!confirming ? (
        <button
          ref={triggerRef}
          type="button"
          disabled={isPending}
          onClick={() => setConfirming(true)}
          className={`inline-flex min-h-11 w-full items-center justify-center rounded-xl border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${archive ? 'border-destructive text-destructive' : 'border-border'}`}
        >
          {archive ? t('definitions.archive') : t('definitions.reactivate')}
        </button>
      ) : (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-label={archive ? t('definitions.archive') : t('definitions.reactivate')}
          aria-describedby="definition-lifecycle-disclosure"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !isPending) setConfirming(false)
          }}
          className="space-y-3 rounded-xl border border-border p-4"
        >
          <p id="definition-lifecycle-disclosure" className="text-sm leading-6">
            {archive ? t('definitions.archiveDisclosure') : t('definitions.reactivateDisclosure')}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              ref={confirmRef}
              type="button"
              disabled={isPending}
              onClick={mutate}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {isPending ? t('common.saving') : archive ? t('definitions.archive') : t('definitions.reactivate')}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirming(false)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {t('common.keep')}
            </button>
          </div>
        </div>
      )}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  )
}
