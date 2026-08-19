'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTeskeidNavigation } from '@/components/teskeid/TeskeidNavigationFeedback'
import type { HouseholdChoreInvitationConsentView } from '@/lib/household-chores/contracts'
import {
  acceptHouseholdChoreInvitationAction,
  declineHouseholdChoreInvitationAction,
} from '@/lib/household-chores/actions'
import {
  householdChoreCirclePath,
  householdChoreMembershipsPath,
} from '@/lib/household-chores/paths'
import { HouseholdChoreRequestIds } from '@/lib/household-chores/request-id.client'

export function CircleInvitationConsent({
  invitation,
  acceptAvailable,
}: {
  invitation: HouseholdChoreInvitationConsentView
  acceptAvailable: boolean
}) {
  const t = useTranslations('teskeid.householdChores')
  const router = useRouter()
  const { navigate } = useTeskeidNavigation()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const requests = useRef(new HouseholdChoreRequestIds())

  function decide(decision: 'accept' | 'decline') {
    if (isPending) return
    const fingerprint = `${decision}:${invitation.invitationId}:${invitation.version}`
    const requestId = requests.current.begin(fingerprint)
    if (!requestId) return
    setError(null)
    startTransition(async () => {
      const action = decision === 'accept'
        ? acceptHouseholdChoreInvitationAction
        : declineHouseholdChoreInvitationAction
      let result
      try {
        result = await action({
          requestId,
          invitationId: invitation.invitationId,
          expectedVersion: invitation.version,
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
      if (decision === 'accept' && result.data.circleId) {
        navigate(householdChoreCirclePath(result.data.circleId), 'replace')
      } else {
        navigate(householdChoreMembershipsPath(), 'replace')
      }
    })
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2 border-y border-border py-5">
        <h2 className="break-words text-lg font-semibold">{invitation.circleName}</h2>
        <p className="text-sm text-muted-foreground">
          {t('invitation.invitedBy', { name: invitation.inviterLabel })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('common.reference', { reference: invitation.displayReference })}
        </p>
        <p className="text-sm font-medium">
          {t(`membershipType.${invitation.requestedType}`)}
        </p>
      </section>

      <section aria-labelledby="invitation-access-heading" className="space-y-3">
        <h2 id="invitation-access-heading" className="text-sm font-semibold">
          {t('invitation.accessHeading')}
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {t(`invitation.disclosure.${invitation.requestedType}`)}
        </p>
      </section>

      {!acceptAvailable ? (
        <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
          {t('invitation.acceptUnavailable')}
        </p>
      ) : null}

      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

      <div className="space-y-2">
        <button
          type="button"
          disabled={isPending || !acceptAvailable}
          onClick={() => decide('accept')}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {isPending ? t('common.saving') : t('invitation.accept')}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => decide('decline')}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {t('invitation.decline')}
        </button>
      </div>
    </div>
  )
}
