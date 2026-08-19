'use client'

import { useRef, useState, useTransition, type MutableRefObject } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  IdentityLinkInvitationControl,
  type IdentityLinkInvitationCancelResult,
  type IdentityLinkInvitationDeliveryResult,
} from '@/components/teskeid/IdentityLinkInvitationControl'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { TeskeidActionSheet } from '@/components/teskeid/TeskeidActionSheet'
import {
  cancelHouseholdChoreInvitationAction,
  linkHouseholdChoreParticipantAction,
  renameHouseholdChoreParticipantAction,
} from '@/lib/household-chores/actions'
import type {
  HouseholdChoreManagedParticipant,
  HouseholdChoreManagedPendingInvitation,
  HouseholdChoreMembershipType,
} from '@/lib/household-chores/contracts'
import { MembershipTypeField } from './MembershipTypeField'

type RequestLock = { fingerprint: string; requestId: string }

export function HouseholdChoreGuestIdentityControls({
  circleId,
  participant,
  linkInvitation,
  onNotice,
}: {
  circleId: string
  participant: HouseholdChoreManagedParticipant
  linkInvitation: HouseholdChoreManagedPendingInvitation | null
  onNotice: (notice: string | null) => void
}) {
  const t = useTranslations('teskeid.householdChores')
  const router = useRouter()
  const [renameOpen, setRenameOpen] = useState(false)
  const [label, setLabel] = useState(participant.label ?? '')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [requestedType, setRequestedType] = useState<HouseholdChoreMembershipType | null>(null)
  const [isRenamePending, startRenameTransition] = useTransition()
  const [isRenaming, setIsRenaming] = useState(false)
  const renameLockRef = useRef<RequestLock | null>(null)
  const linkLockRef = useRef<RequestLock | null>(null)
  const cancelLockRef = useRef<RequestLock | null>(null)

  const identityCopy = {
    triggerLabel: t('manage.linkGuest'),
    emailLabel: t('manage.linkEmail'),
    emailPlaceholder: t('manage.linkEmailPlaceholder'),
    submitLabel: t('manage.sendLinkInvite'),
    submittingLabel: t('common.saving'),
    entryCancelLabel: t('common.cancel'),
    resendLabel: t('manage.resendLinkInvite'),
    cancelInvitationLabel: t('manage.cancelLinkInvite'),
    cancelledNotice: t('manage.linkInviteCancelledNotice'),
    sentNotice: t('manage.linkInviteSentNotice'),
    deliveryIssueNotice: t('manage.linkInviteDeliveryIssue'),
    genericError: t('errors.save_failed'),
  }

  function requestIdFor(ref: MutableRefObject<RequestLock | null>, fingerprint: string) {
    if (ref.current?.fingerprint !== fingerprint) {
      ref.current = { fingerprint, requestId: crypto.randomUUID() }
    }
    return ref.current.requestId
  }

  function saveRename() {
    if (isRenamePending || isRenaming) return
    const normalized = label.trim().replace(/\s+/g, ' ')
    const fingerprint = `rename:${participant.participantId}:${participant.version}:${normalized}`
    const requestId = requestIdFor(renameLockRef, fingerprint)
    setIsRenaming(true)
    setRenameError(null)
    startRenameTransition(async () => {
      try {
        const result = await renameHouseholdChoreParticipantAction({
          requestId,
          circleId,
          participantId: participant.participantId,
          expectedVersion: participant.version,
          label: normalized,
        })
        if (!result.ok) {
          if (result.error !== 'save_failed') renameLockRef.current = null
          setRenameError(t(`errors.${result.error}`))
          if (result.error === 'stale' || result.error === 'conflict') router.refresh()
          return
        }
        renameLockRef.current = null
        setRenameOpen(false)
        onNotice(t('manage.participantRenamedNotice'))
        router.refresh()
      } catch {
        setRenameError(t('errors.save_failed'))
      } finally {
        setIsRenaming(false)
      }
    })
  }

  async function invite(email: string): Promise<IdentityLinkInvitationDeliveryResult> {
    if (!requestedType) return { ok: false, safeErrorMessage: t('manage.chooseAccessType') }
    const normalizedEmail = email.trim().toLocaleLowerCase('en-US')
    const fingerprint = `link:${participant.participantId}:${participant.version}:${requestedType}:${normalizedEmail}`
    const requestId = requestIdFor(linkLockRef, fingerprint)
    try {
      const result = await linkHouseholdChoreParticipantAction({
        requestId,
        circleId,
        participantId: participant.participantId,
        expectedVersion: participant.version,
        recipientEmail: normalizedEmail,
        requestedType,
      })
      if (!result.ok) {
        if (result.error !== 'save_failed') linkLockRef.current = null
        if (result.error === 'stale' || result.error === 'conflict') router.refresh()
        return {
          ok: false,
          safeErrorMessage: result.error === 'not_available' || result.error === 'feature_disabled'
            ? t('manage.linkEmailNotAvailable')
            : t(`errors.${result.error}`),
        }
      }
      linkLockRef.current = null
      return { ok: true, delivery: 'sent' }
    } catch {
      return { ok: false, safeErrorMessage: t('errors.save_failed') }
    }
  }

  async function cancelLink(): Promise<IdentityLinkInvitationCancelResult> {
    if (!linkInvitation) return { ok: false, safeErrorMessage: t('errors.not_found') }
    const fingerprint = `cancel:${linkInvitation.invitationId}:${linkInvitation.version}`
    const requestId = requestIdFor(cancelLockRef, fingerprint)
    try {
      const result = await cancelHouseholdChoreInvitationAction({
        requestId,
        circleId,
        invitationId: linkInvitation.invitationId,
        expectedVersion: linkInvitation.version,
      })
      if (!result.ok) {
        if (result.error !== 'save_failed') cancelLockRef.current = null
        if (result.error === 'stale' || result.error === 'conflict') router.refresh()
        return { ok: false, safeErrorMessage: t(`errors.${result.error}`) }
      }
      cancelLockRef.current = null
      return { ok: true }
    } catch {
      return { ok: false, safeErrorMessage: t('errors.save_failed') }
    }
  }

  const renamePending = isRenamePending || isRenaming
  const labelIsValid = label.trim().length > 0 && label.trim().length <= 120 && !label.includes('@')

  return (
    <div className="grid min-w-0 gap-2 sm:flex sm:items-center">
      <TeskeidActionSheet
        open={renameOpen}
        onOpenChange={(open) => {
          if (renamePending) return
          setRenameOpen(open)
          setRenameError(null)
          if (open) setLabel(participant.label ?? '')
        }}
        trigger={(
          <TeskeidActionButton type="button" variant="secondary" className="w-full sm:w-auto">
            {t('manage.renameParticipant')}
          </TeskeidActionButton>
        )}
        title={t('manage.renameParticipantTitle')}
        description={t('manage.renameParticipantDisclosure')}
        closeLabel={t('common.cancel')}
      >
        <form className="space-y-3 pb-[env(safe-area-inset-bottom)]" onSubmit={(event) => { event.preventDefault(); saveRename() }}>
          {renameError ? <p role="alert" className="text-sm text-destructive">{renameError}</p> : null}
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{t('manage.participantName')}</span>
            <input
              autoFocus
              type="text"
              maxLength={120}
              value={label}
              disabled={renamePending}
              onChange={(event) => setLabel(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <TeskeidActionButton type="submit" variant="primary" className="w-full" disabled={!labelIsValid} pending={renamePending}>
            {renamePending ? t('common.saving') : t('manage.saveParticipantName')}
          </TeskeidActionButton>
        </form>
      </TeskeidActionSheet>

      {participant.status === 'active' ? (
        <IdentityLinkInvitationControl
          state={linkInvitation ? 'pending' : 'eligible'}
          partyLabel={participant.label ?? t('common.formerMember')}
          copy={identityCopy}
          presentation="stacked"
          resetKey={linkInvitation?.invitationId ?? participant.version}
          entryContent={(
            <MembershipTypeField
              idPrefix={`link-${participant.participantId}`}
              value={requestedType}
              onChange={setRequestedType}
            />
          )}
          entrySubmitDisabled={requestedType === null}
          onInvite={invite}
          onCancel={linkInvitation ? cancelLink : undefined}
          onCompleted={() => router.refresh()}
          onEntryOpenChange={(open) => { if (!open) setRequestedType(null) }}
        />
      ) : null}
    </div>
  )
}
