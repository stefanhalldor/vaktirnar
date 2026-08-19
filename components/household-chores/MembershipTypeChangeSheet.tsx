'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { TeskeidActionSheet } from '@/components/teskeid/TeskeidActionSheet'
import { useTeskeidNavigation } from '@/components/teskeid/TeskeidNavigationFeedback'
import {
  changeHouseholdChoreMembershipTypeAction,
  removeHouseholdChoreMemberAction,
} from '@/lib/household-chores/actions'
import type { HouseholdChoreManagedMembership } from '@/lib/household-chores/contracts'
import { householdChoreCirclePath } from '@/lib/household-chores/paths'

export function MembershipTypeChangeSheet({
  circleId,
  membership,
}: {
  circleId: string
  membership: HouseholdChoreManagedMembership
}) {
  const t = useTranslations('teskeid.householdChores')
  const router = useRouter()
  const { navigate } = useTeskeidNavigation()
  const requestIds = useRef(new Map<string, string>())
  const mutationInFlightRef = useRef(false)
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isSaving, setIsSaving] = useState(false)
  const pending = isPending || isSaving
  const nextType = membership.membershipType === 'member' ? 'child' : 'member'
  const displayLabel = membership.identityMarker === 'former_member' || membership.label === null
    ? t('common.formerMember')
    : membership.label

  function requestIdFor(operation: 'change-type' | 'remove') {
    const fingerprint = `${operation}:${membership.membershipId}:${membership.version}:${nextType}`
    const existing = requestIds.current.get(fingerprint)
    if (existing) return { fingerprint, requestId: existing }
    const requestId = crypto.randomUUID()
    requestIds.current.set(fingerprint, requestId)
    return { fingerprint, requestId }
  }

  function finishAuthorityChangingMutation(fingerprint: string) {
    requestIds.current.delete(fingerprint)
    setOpen(false)
    navigate(householdChoreCirclePath(circleId), 'replace')
  }

  function changeType() {
    if (pending || mutationInFlightRef.current) return
    mutationInFlightRef.current = true
    setIsSaving(true)
    const request = requestIdFor('change-type')
    setError(null)
    startTransition(async () => {
      try {
        const result = await changeHouseholdChoreMembershipTypeAction({
          requestId: request.requestId,
          circleId,
          membershipId: membership.membershipId,
          expectedVersion: membership.version,
          newType: nextType,
        })
        if (!result.ok) {
          if (result.error !== 'save_failed') requestIds.current.delete(request.fingerprint)
          setError(t(`errors.${result.error}`))
          queueMicrotask(() => alertRef.current?.focus())
          if (result.error === 'stale' || result.error === 'conflict') router.refresh()
          return
        }
        finishAuthorityChangingMutation(request.fingerprint)
      } catch {
        setError(t('errors.save_failed'))
        queueMicrotask(() => alertRef.current?.focus())
      } finally {
        mutationInFlightRef.current = false
        setIsSaving(false)
      }
    })
  }

  function removeMember() {
    if (pending || mutationInFlightRef.current) return
    mutationInFlightRef.current = true
    setIsSaving(true)
    const request = requestIdFor('remove')
    setError(null)
    startTransition(async () => {
      try {
        const result = await removeHouseholdChoreMemberAction({
          requestId: request.requestId,
          circleId,
          membershipId: membership.membershipId,
          expectedVersion: membership.version,
        })
        if (!result.ok) {
          if (result.error !== 'save_failed') requestIds.current.delete(request.fingerprint)
          setError(t(`errors.${result.error}`))
          queueMicrotask(() => alertRef.current?.focus())
          if (result.error === 'stale' || result.error === 'conflict') router.refresh()
          return
        }
        finishAuthorityChangingMutation(request.fingerprint)
      } catch {
        setError(t('errors.save_failed'))
        queueMicrotask(() => alertRef.current?.focus())
      } finally {
        mutationInFlightRef.current = false
        setIsSaving(false)
      }
    })
  }

  return (
    <TeskeidActionSheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending || mutationInFlightRef.current) return
        setOpen(nextOpen)
        if (!nextOpen) setError(null)
      }}
      trigger={(
        <TeskeidActionButton type="button" variant="secondary" className="w-full sm:w-auto">
          {t('manage.manageAccess')}
        </TeskeidActionButton>
      )}
      title={`${t('manage.manageAccess')}: ${displayLabel}`}
      description={t(
        membership.membershipType === 'member'
          ? 'manage.memberSummary'
          : 'manage.childSummary',
      )}
      closeLabel={t('common.keep')}
    >
      <div className="space-y-5 pb-[env(safe-area-inset-bottom)]">
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

        <section className="space-y-3 border-y border-border py-4">
          <h3 className="text-sm font-semibold">
            {t('manage.changeType')}
          </h3>
          <p className="text-sm leading-6 text-muted-foreground">
            {t(nextType === 'member' ? 'manage.promoteDisclosure' : 'manage.demoteDisclosure')}
          </p>
          <TeskeidActionButton
            type="button"
            variant={nextType === 'member' ? 'primary' : 'danger'}
            className="w-full"
            pending={pending}
            onClick={changeType}
          >
            {pending
              ? t('common.saving')
              : t(nextType === 'member' ? 'manage.makeMember' : 'manage.makeChild')}
          </TeskeidActionButton>
        </section>

        {!membership.isViewer ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-destructive">
              {t('manage.removeMember')}
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              {t('manage.removeDisclosure')}
            </p>
            <TeskeidActionButton
              type="button"
              variant="danger"
              className="w-full"
              pending={pending}
              onClick={removeMember}
            >
              {pending ? t('common.saving') : t('manage.removeMember')}
            </TeskeidActionButton>
          </section>
        ) : null}

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
