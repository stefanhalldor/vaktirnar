'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { TeskeidActionSheet } from '@/components/teskeid/TeskeidActionSheet'
import {
  archiveHouseholdChoreParticipantAction,
  reactivateHouseholdChoreParticipantAction,
} from '@/lib/household-chores/actions'
import type { HouseholdChoreManagedParticipant } from '@/lib/household-chores/contracts'

export function ParticipantLifecycleControl({
  circleId,
  participant,
  onNotice,
}: {
  circleId: string
  participant: HouseholdChoreManagedParticipant
  onNotice: (notice: string) => void
}) {
  const t = useTranslations('teskeid.householdChores')
  const router = useRouter()
  const requestRef = useRef<{ fingerprint: string; requestId: string } | null>(null)
  const mutationInFlightRef = useRef(false)
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isSaving, setIsSaving] = useState(false)
  const pending = isPending || isSaving
  const isArchiving = participant.status === 'active'
  const displayLabel = participant.identityMarker === 'former_member' || participant.label === null
    ? t('common.formerMember')
    : participant.label

  function mutate() {
    if (pending || mutationInFlightRef.current) return
    mutationInFlightRef.current = true
    setIsSaving(true)
    const fingerprint = `${isArchiving ? 'archive' : 'reactivate'}:${participant.participantId}:${participant.version}`
    if (requestRef.current?.fingerprint !== fingerprint) {
      requestRef.current = { fingerprint, requestId: crypto.randomUUID() }
    }
    const requestId = requestRef.current.requestId
    setError(null)

    startTransition(async () => {
      try {
        const input = {
          requestId,
          circleId,
          participantId: participant.participantId,
          expectedVersion: participant.version,
        }
        const result = isArchiving
          ? await archiveHouseholdChoreParticipantAction(input)
          : await reactivateHouseholdChoreParticipantAction(input)
        if (!result.ok) {
          if (result.error !== 'save_failed') requestRef.current = null
          setError(t(`errors.${result.error}`))
          queueMicrotask(() => alertRef.current?.focus())
          if (result.error === 'stale' || result.error === 'conflict') router.refresh()
          return
        }

        requestRef.current = null
        setOpen(false)
        if (!isArchiving) onNotice(t('manage.reactivatedNotice'))
        router.refresh()
      } catch {
        setError(t('errors.save_failed'))
        queueMicrotask(() => alertRef.current?.focus())
      } finally {
        mutationInFlightRef.current = false
        setIsSaving(false)
      }
    })
  }

  const actionKey = isArchiving
    ? 'manage.archiveParticipant'
    : 'manage.reactivateParticipant'
  const disclosureKey = isArchiving
    ? 'manage.archiveDisclosure'
    : 'manage.reactivateDisclosure'

  return (
    <TeskeidActionSheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending || mutationInFlightRef.current) return
        setOpen(nextOpen)
        if (!nextOpen) setError(null)
      }}
      trigger={(
        <TeskeidActionButton
          type="button"
          variant={isArchiving ? 'danger' : 'secondary'}
          className="w-full sm:w-auto"
        >
          {t(actionKey)}
        </TeskeidActionButton>
      )}
      title={`${t(actionKey)}: ${displayLabel}`}
      description={t(disclosureKey, { name: displayLabel })}
      closeLabel={t('common.keep')}
    >
      <div className="space-y-3 pb-[env(safe-area-inset-bottom)]">
        {error ? (
          <p
            ref={alertRef}
            tabIndex={-1}
            role="alert"
            className="text-sm text-destructive outline-none"
          >
            {error}
          </p>
        ) : null}
        <TeskeidActionButton
          type="button"
          variant={isArchiving ? 'danger' : 'primary'}
          className="w-full"
          pending={pending}
          onClick={mutate}
        >
          {pending ? t('common.saving') : t(actionKey)}
        </TeskeidActionButton>
        <TeskeidActionButton
          type="button"
          variant="secondary"
          className="w-full"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          {t('common.keep')}
        </TeskeidActionButton>
      </div>
    </TeskeidActionSheet>
  )
}
