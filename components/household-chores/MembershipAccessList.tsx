'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronRight, Mail } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type {
  HouseholdChoreMembershipItem,
  HouseholdChoreMembershipsView,
} from '@/lib/household-chores/contracts'
import {
  deleteHouseholdChoreCircleAction,
  leaveHouseholdChoreCircleAction,
} from '@/lib/household-chores/actions'
import {
  householdChoreCirclePath,
  householdChoreInvitationPath,
} from '@/lib/household-chores/paths'
import { HouseholdChoreRequestIds } from '@/lib/household-chores/request-id.client'

function MembershipActions({
  membership,
  contentAvailable,
}: {
  membership: HouseholdChoreMembershipItem
  contentAvailable: boolean
}) {
  const t = useTranslations('teskeid.householdChores')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  const requests = useRef(new HouseholdChoreRequestIds())
  const leaveTriggerRef = useRef<HTMLButtonElement>(null)
  const leaveConfirmRef = useRef<HTMLButtonElement>(null)
  const deleteTriggerRef = useRef<HTMLButtonElement>(null)
  const deleteInputRef = useRef<HTMLInputElement>(null)
  const wasConfirmingLeave = useRef(false)
  const wasConfirmingDelete = useRef(false)

  useEffect(() => {
    if (confirmingLeave) {
      wasConfirmingLeave.current = true
      leaveConfirmRef.current?.focus()
    } else if (wasConfirmingLeave.current) {
      wasConfirmingLeave.current = false
      leaveTriggerRef.current?.focus()
    }
  }, [confirmingLeave])

  useEffect(() => {
    if (confirmingDelete) {
      wasConfirmingDelete.current = true
      deleteInputRef.current?.focus()
    } else if (wasConfirmingDelete.current) {
      wasConfirmingDelete.current = false
      deleteTriggerRef.current?.focus()
    }
  }, [confirmingDelete])

  function dismissDelete() {
    setConfirmingDelete(false)
    setReference('')
  }

  function leave() {
    if (isPending) return
    const fingerprint = `leave:${membership.circleId}:${membership.membershipVersion}`
    const requestId = requests.current.begin(fingerprint)
    if (!requestId) return
    setError(null)
    startTransition(async () => {
      let result
      try {
        result = await leaveHouseholdChoreCircleAction({
          requestId,
          circleId: membership.circleId,
          expectedVersion: membership.membershipVersion,
        })
        requests.current.returned(fingerprint, result)
      } catch {
        requests.current.uncertain(fingerprint)
        setError(t('errors.save_failed'))
        return
      }
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        if (result.error === 'stale'
          || result.error === 'conflict'
          || result.error === 'not_found'
          || result.error === 'not_allowed') router.refresh()
        return
      }
      setConfirmingLeave(false)
      router.refresh()
    })
  }

  function deleteCircle() {
    if (isPending) return
    const normalizedReference = reference.trim().toUpperCase()
    const fingerprint = `delete:${membership.circleId}:${membership.circleVersion}:${normalizedReference}`
    const requestId = requests.current.begin(fingerprint)
    if (!requestId) return
    setError(null)
    startTransition(async () => {
      let result
      try {
        result = await deleteHouseholdChoreCircleAction({
          requestId,
          circleId: membership.circleId,
          expectedVersion: membership.circleVersion,
          displayReference: normalizedReference,
        })
        requests.current.returned(fingerprint, result)
      } catch {
        requests.current.uncertain(fingerprint)
        setError(t('errors.save_failed'))
        return
      }
      if (!result.ok) {
        setError(t(`errors.${result.error}`))
        if (result.error === 'stale'
          || result.error === 'conflict'
          || result.error === 'not_found'
          || result.error === 'not_allowed') router.refresh()
        return
      }
      setConfirmingDelete(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 py-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-semibold">{membership.circleName}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t(`membershipType.${membership.membershipType}`)}
            {' · '}
            {t('common.reference', { reference: membership.displayReference })}
          </p>
        </div>
        {contentAvailable ? (
          <Link
            href={householdChoreCirclePath(membership.circleId)}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('membership.open')}
            <ChevronRight aria-hidden size={16} />
          </Link>
        ) : null}
      </div>

      {membership.canLeave && !confirmingLeave ? (
        <button
          ref={leaveTriggerRef}
          type="button"
          disabled={isPending}
          onClick={() => {
            setConfirmingDelete(false)
            setConfirmingLeave(true)
            setError(null)
          }}
          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-destructive/50 px-3 text-sm font-medium text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {t('membership.leave')}
        </button>
      ) : membership.canLeave ? (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-label={t('membership.leave')}
          aria-describedby={`leave-disclosure-${membership.circleId}`}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !isPending) setConfirmingLeave(false)
          }}
          className="space-y-3 rounded-xl border border-destructive/40 p-4"
        >
          <p id={`leave-disclosure-${membership.circleId}`} className="text-sm leading-6">
            {t('membership.leaveDisclosure')}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              ref={leaveConfirmRef}
              type="button"
              disabled={isPending}
              onClick={leave}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {isPending ? t('common.saving') : t('membership.confirmLeave')}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirmingLeave(false)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {t('common.keep')}
            </button>
          </div>
        </div>
      ) : null}

      {membership.canDeleteCircle ? (
        !confirmingDelete ? (
          <button
            ref={deleteTriggerRef}
            type="button"
            disabled={isPending}
            onClick={() => {
              setConfirmingLeave(false)
              setReference('')
              setConfirmingDelete(true)
              setError(null)
            }}
            className="inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-sm font-medium text-destructive underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {t('membership.deleteCircle')}
          </button>
        ) : (
          <div
            role="alertdialog"
            aria-modal="false"
            aria-label={t('membership.deleteCircle')}
            aria-describedby={`delete-disclosure-${membership.circleId}`}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !isPending) dismissDelete()
            }}
            className="space-y-3 rounded-xl border border-destructive/40 p-4"
          >
            <p id={`delete-disclosure-${membership.circleId}`} className="text-sm leading-6">
              {t('membership.deleteDisclosure')}
            </p>
            <label htmlFor={`delete-reference-${membership.circleId}`} className="block text-sm font-medium">
              {t('membership.typeReference', { reference: membership.displayReference })}
            </label>
            <input
              ref={deleteInputRef}
              id={`delete-reference-${membership.circleId}`}
              type="text"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              disabled={isPending}
              autoComplete="off"
              spellCheck={false}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={isPending || reference.trim().toUpperCase() !== membership.displayReference}
                onClick={deleteCircle}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {isPending ? t('common.saving') : t('membership.confirmDelete')}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={dismissDelete}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {t('common.keep')}
              </button>
            </div>
          </div>
        )
      ) : null}

      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  )
}

export function MembershipAccessList({
  view,
  contentAvailable,
}: {
  view: HouseholdChoreMembershipsView
  contentAvailable: boolean
}) {
  const t = useTranslations('teskeid.householdChores')

  return (
    <div className="space-y-8">
      <section aria-labelledby="membership-access-heading">
        <h2 id="membership-access-heading" className="mb-2 text-sm font-semibold">
          {t('membership.heading')}
        </h2>
        {view.memberships.length === 0 ? (
          <p className="border-y border-border py-5 text-sm text-muted-foreground">
            {t('membership.empty')}
          </p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {view.memberships.map((membership) => (
              <MembershipActions
                key={`${membership.circleId}:${membership.circleVersion}:${membership.membershipVersion}`}
                membership={membership}
                contentAvailable={contentAvailable}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="membership-invitations-heading">
        <h2 id="membership-invitations-heading" className="mb-2 text-sm font-semibold">
          {t('membership.pendingHeading')}
        </h2>
        {view.pendingInvitations.length === 0 ? (
          <p className="border-y border-border py-5 text-sm text-muted-foreground">
            {t('membership.pendingEmpty')}
          </p>
        ) : (
          <div className="divide-y divide-border border-y border-border">
            {view.pendingInvitations.map((invitation) => (
              <Link
                key={invitation.invitationId}
                href={householdChoreInvitationPath(invitation.invitationId)}
                className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <Mail aria-hidden size={18} className="shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium">{invitation.circleName}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {t('root.invitedBy', { name: invitation.inviterLabel })}
                  </span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    {t('common.reference', { reference: invitation.displayReference })}
                  </span>
                </span>
                <ChevronRight aria-hidden size={18} className="shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
