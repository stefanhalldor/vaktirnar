'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { TeskeidActionSheet } from '@/components/teskeid/TeskeidActionSheet'
import { cancelHouseholdChoreInvitationAction } from '@/lib/household-chores/actions'
import type {
  HouseholdChoreManagedMembership,
  HouseholdChoreManagedParticipant,
  HouseholdChoreManagedPendingInvitation,
} from '@/lib/household-chores/contracts'
import { ParticipantLifecycleControl } from './CircleParticipantManager'
import { HouseholdChoreGuestIdentityControls } from './HouseholdChoreGuestIdentityControls'
import { MembershipTypeChangeSheet } from './MembershipTypeChangeSheet'

export type HouseholdChorePeopleRow =
  | { kind: 'membership'; id: string; participantId: string; membership: HouseholdChoreManagedMembership }
  | { kind: 'invitation'; id: string; invitation: HouseholdChoreManagedPendingInvitation }
  | { kind: 'participant'; id: string; participant: HouseholdChoreManagedParticipant; linkInvitation: HouseholdChoreManagedPendingInvitation | null }

export function buildHouseholdChorePeopleRows({
  memberships,
  pendingInvitations,
  participants,
}: {
  memberships: HouseholdChoreManagedMembership[]
  pendingInvitations: HouseholdChoreManagedPendingInvitation[]
  participants: HouseholdChoreManagedParticipant[]
}): HouseholdChorePeopleRow[] {
  const membershipParticipantIds = new Set(memberships.map((membership) => membership.participantId))
  const linkInvitationByParticipant = new Map(
    pendingInvitations
      .filter((invitation) => invitation.participantId !== null)
      .map((invitation) => [invitation.participantId as string, invitation]),
  )
  return [
    ...memberships.map((membership): HouseholdChorePeopleRow => ({
      kind: 'membership',
      id: `membership:${membership.membershipId}`,
      participantId: membership.participantId,
      membership,
    })),
    ...pendingInvitations.filter((invitation) => invitation.participantId === null).map((invitation): HouseholdChorePeopleRow => ({
      kind: 'invitation',
      id: `invitation:${invitation.invitationId}`,
      invitation,
    })),
    ...participants
      .filter((participant) => !membershipParticipantIds.has(participant.participantId))
      .map((participant): HouseholdChorePeopleRow => ({
        kind: 'participant',
        id: `participant:${participant.participantId}`,
        participant,
        linkInvitation: linkInvitationByParticipant.get(participant.participantId) ?? null,
      })),
  ]
}

function PendingInvitationControl({
  circleId,
  invitation,
}: {
  circleId: string
  invitation: HouseholdChoreManagedPendingInvitation
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

  function cancelInvitation() {
    if (pending || mutationInFlightRef.current) return
    mutationInFlightRef.current = true
    setIsSaving(true)
    const fingerprint = `cancel:${invitation.invitationId}:${invitation.version}`
    if (requestRef.current?.fingerprint !== fingerprint) {
      requestRef.current = { fingerprint, requestId: crypto.randomUUID() }
    }
    const requestId = requestRef.current.requestId
    setError(null)
    startTransition(async () => {
      try {
        const result = await cancelHouseholdChoreInvitationAction({
          requestId,
          circleId,
          invitationId: invitation.invitationId,
          expectedVersion: invitation.version,
        })
        if (!result.ok) {
          if (result.error !== 'save_failed') requestRef.current = null
          setError(t(`errors.${result.error}`))
          queueMicrotask(() => alertRef.current?.focus())
          if (result.error === 'stale' || result.error === 'conflict') router.refresh()
          return
        }
        requestRef.current = null
        setOpen(false)
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

  return (
    <TeskeidActionSheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending || mutationInFlightRef.current) return
        setOpen(nextOpen)
        if (!nextOpen) setError(null)
      }}
      trigger={(
        <TeskeidActionButton type="button" variant="danger" className="w-full sm:w-auto">
          {t('manage.cancelInvite')}
        </TeskeidActionButton>
      )}
      title={`${t('manage.cancelInvite')}: ${invitation.inviteeLabel}`}
      description={t('manage.cancelInviteDisclosure')}
      closeLabel={t('common.keep')}
    >
      <div className="space-y-3 pb-[env(safe-area-inset-bottom)]">
        {error ? (
          <p ref={alertRef} tabIndex={-1} role="alert" className="text-sm text-destructive outline-none">
            {error}
          </p>
        ) : null}
        <TeskeidActionButton type="button" variant="danger" className="w-full" pending={pending} onClick={cancelInvitation}>
          {pending ? t('common.saving') : t('manage.cancelInvite')}
        </TeskeidActionButton>
        <TeskeidActionButton type="button" variant="secondary" className="w-full" disabled={pending} onClick={() => setOpen(false)}>
          {t('common.keep')}
        </TeskeidActionButton>
      </div>
    </TeskeidActionSheet>
  )
}

export function HouseholdChorePeopleList({
  circleId,
  memberships,
  pendingInvitations,
  participants,
}: {
  circleId: string
  memberships: HouseholdChoreManagedMembership[]
  pendingInvitations: HouseholdChoreManagedPendingInvitation[]
  participants: HouseholdChoreManagedParticipant[]
}) {
  const t = useTranslations('teskeid.householdChores')
  const [notice, setNotice] = useState<string | null>(null)
  const rows = buildHouseholdChorePeopleRows({ memberships, pendingInvitations, participants })

  return (
    <div className="space-y-3">
      {notice ? <p role="status" className="text-sm text-primary">{notice}</p> : null}
      {rows.length === 0 ? (
        <p className="border-y border-border py-5 text-sm text-muted-foreground">
          {t('manage.noPeople')}
        </p>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {rows.map((row) => {
            if (row.kind === 'membership') {
              const { membership } = row
              const label = membership.identityMarker === 'former_member' || membership.label === null
                ? t('common.formerMember')
                : membership.label
              return (
                <div key={row.id} className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">{label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {t(membership.membershipType === 'member'
                        ? 'manage.statusFullAccess'
                        : 'manage.statusChildAccess')}
                      {membership.isViewer ? ` · ${t('manage.you')}` : ''}
                    </p>
                  </div>
                  <MembershipTypeChangeSheet circleId={circleId} membership={membership} />
                </div>
              )
            }

            if (row.kind === 'invitation') {
              return (
                <div key={row.id} className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">{row.invitation.inviteeLabel}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {t('manage.statusPending')} · {t(`membershipType.${row.invitation.requestedType}`)}
                    </p>
                  </div>
                  <PendingInvitationControl circleId={circleId} invitation={row.invitation} />
                </div>
              )
            }

            const { participant } = row
            const label = participant.identityMarker === 'former_member' || participant.label === null
              ? t('common.formerMember')
              : participant.label
            const canReactivate = participant.status === 'active'
              || participant.identityMarker !== 'former_member'
            return (
              <div key={row.id} className="flex min-w-0 flex-col gap-3 py-4">
                <div className="min-w-0 w-full">
                  <p className="break-words text-sm font-medium">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t(participant.status === 'archived'
                      ? 'manage.statusArchived'
                      : 'manage.statusParticipantOnly')}
                  </p>
                </div>
                {canReactivate ? (
                  <div className="grid w-full min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-center">
                    {participant.identityMarker === 'current' && participant.label !== null ? (
                      <HouseholdChoreGuestIdentityControls
                        circleId={circleId}
                        participant={participant}
                        linkInvitation={row.linkInvitation}
                        onNotice={setNotice}
                      />
                    ) : null}
                    {!row.linkInvitation ? (
                      <ParticipantLifecycleControl circleId={circleId} participant={participant} onNotice={setNotice} />
                    ) : null}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">{t('manage.archivedParticipant')}</span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
