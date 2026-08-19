'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  RelationshipPartyPicker,
  type RelationshipPartyPickerSource,
} from '@/components/tengsl/RelationshipPartyPicker'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { TeskeidActionSheet } from '@/components/teskeid/TeskeidActionSheet'
import { useTeskeidNavigation } from '@/components/teskeid/TeskeidNavigationFeedback'
import {
  createHouseholdChoreInvitationAction,
  createHouseholdChoreParticipantAction,
} from '@/lib/household-chores/actions'
import type {
  HouseholdChoreInviteCandidatePage,
  HouseholdChoreMembershipType,
} from '@/lib/household-chores/contracts'
import { householdChoreCirclePath } from '@/lib/household-chores/paths'
import { MembershipTypeField } from './MembershipTypeField'

type InviteCandidateCursor = HouseholdChoreInviteCandidatePage['nextCursor']

export type HouseholdChoreInviteCandidateLoader = (
  cursor: InviteCandidateCursor,
) => Promise<
  | { ok: true; data: HouseholdChoreInviteCandidatePage }
  | { ok: false; error: 'access_changed' | 'load_failed' }
>

type StagedPerson =
  | { kind: 'invitation'; relationshipId: string; label: string }
  | { kind: 'participant'; label: string }

export function HouseholdChorePersonPicker({
  circleId,
  inviteCandidates,
  loadInviteCandidates,
}: {
  circleId: string
  inviteCandidates: HouseholdChoreInviteCandidatePage
  loadInviteCandidates: HouseholdChoreInviteCandidateLoader
}) {
  const t = useTranslations('teskeid.householdChores')
  const router = useRouter()
  const { navigate } = useTeskeidNavigation()
  const pickerTriggerRef = useRef<HTMLButtonElement>(null)
  const requestRef = useRef<{ fingerprint: string; requestId: string } | null>(null)
  const mutationInFlightRef = useRef(false)
  const candidateLoadInFlightRef = useRef(false)
  const alertRef = useRef<HTMLParagraphElement>(null)
  const [stagedPerson, setStagedPerson] = useState<StagedPerson | null>(null)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [requestedType, setRequestedType] = useState<HouseholdChoreMembershipType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [candidateError, setCandidateError] = useState(false)
  const [candidatePage, setCandidatePage] = useState(inviteCandidates)
  const [candidatePageIndex, setCandidatePageIndex] = useState(0)
  const [candidatePageStarts, setCandidatePageStarts] = useState<InviteCandidateCursor[]>([null])
  const [isMutationPending, startMutationTransition] = useTransition()
  const [isCandidatePending, startCandidateTransition] = useTransition()
  const [isSaving, setIsSaving] = useState(false)
  const [isCandidateLoading, setIsCandidateLoading] = useState(false)
  const mutationPending = isMutationPending || isSaving
  const candidatePending = isCandidatePending || isCandidateLoading

  useEffect(() => {
    if (mutationInFlightRef.current || candidateLoadInFlightRef.current) return
    setCandidatePage(inviteCandidates)
    setCandidatePageIndex(0)
    setCandidatePageStarts([null])
    setCandidateError(false)
  }, [inviteCandidates])

  function clearStagedPerson() {
    setConfirmationOpen(false)
    setStagedPerson(null)
    setRequestedType(null)
    setError(null)
    requestRef.current = null
  }

  function loadCandidatePage(cursor: InviteCandidateCursor, pageIndex: number) {
    if (candidatePending || candidateLoadInFlightRef.current || mutationPending) return
    candidateLoadInFlightRef.current = true
    setIsCandidateLoading(true)
    setCandidateError(false)
    startCandidateTransition(async () => {
      try {
        const result = await loadInviteCandidates(cursor)
        if (!result.ok) {
          if (result.error === 'access_changed') {
            navigate(householdChoreCirclePath(circleId), 'replace')
            return
          }
          setCandidateError(true)
          return
        }
        setCandidatePage(result.data)
        setCandidatePageIndex(pageIndex)
      } catch {
        setCandidateError(true)
      } finally {
        candidateLoadInFlightRef.current = false
        setIsCandidateLoading(false)
      }
    })
  }

  function loadNextCandidatePage() {
    if (!candidatePage.nextCursor) return
    const nextPageIndex = candidatePageIndex + 1
    setCandidatePageStarts((current) => {
      const next = current.slice(0, nextPageIndex)
      next[nextPageIndex] = candidatePage.nextCursor
      return next
    })
    loadCandidatePage(candidatePage.nextCursor, nextPageIndex)
  }

  function loadPreviousCandidatePage() {
    if (candidatePageIndex === 0) return
    loadCandidatePage(candidatePageStarts[candidatePageIndex - 1] ?? null, candidatePageIndex - 1)
  }

  function submitStagedPerson() {
    if (!stagedPerson || mutationPending || mutationInFlightRef.current) return
    if (stagedPerson.kind === 'invitation' && requestedType === null) return
    mutationInFlightRef.current = true
    setIsSaving(true)
    const fingerprint = stagedPerson.kind === 'invitation'
      ? `invite:${circleId}:${stagedPerson.relationshipId}:${requestedType}`
      : `create:${circleId}:${stagedPerson.label}`
    if (requestRef.current?.fingerprint !== fingerprint) {
      requestRef.current = { fingerprint, requestId: crypto.randomUUID() }
    }
    const requestId = requestRef.current.requestId
    setError(null)
    setNotice(null)

    startMutationTransition(async () => {
      try {
        const result = stagedPerson.kind === 'invitation'
          ? await createHouseholdChoreInvitationAction({
              requestId,
              circleId,
              relationshipId: stagedPerson.relationshipId,
              requestedType: requestedType!,
            })
          : await createHouseholdChoreParticipantAction({
              requestId,
              circleId,
              label: stagedPerson.label,
            })
        if (!result.ok) {
          if (result.error !== 'save_failed') requestRef.current = null
          setError(t(`errors.${result.error}`))
          queueMicrotask(() => alertRef.current?.focus())
          if (result.error === 'stale' || result.error === 'conflict') router.refresh()
          return
        }
        requestRef.current = null
        if (stagedPerson.kind === 'invitation') {
          const relationshipId = stagedPerson.relationshipId
          setCandidatePage((current) => ({
            ...current,
            items: current.items.filter((candidate) => candidate.relationshipId !== relationshipId),
          }))
          setNotice(t('manage.inviteSentNotice'))
        } else {
          setNotice(t('manage.participantAddedNotice'))
        }
        setConfirmationOpen(false)
        setStagedPerson(null)
        setRequestedType(null)
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

  const sources: RelationshipPartyPickerSource[] = [
    {
      id: 'relationships',
      label: t('manage.sourceRelationships'),
      type: 'options',
      options: candidatePage.items.map((candidate) => ({
        id: candidate.relationshipId,
        primaryLabel: candidate.label,
      })),
      optionsError: candidateError,
      loadErrorLabel: t('manage.candidatesLoadFailed'),
      searchLabel: t('manage.searchPeople'),
      searchPlaceholder: t('manage.searchPeoplePlaceholder'),
      filterLabel: t('manage.filterPeople'),
      allFilterLabel: t('manage.allPeople'),
      noResultsLabel: t('manage.noInvitablePeople'),
      pagination: {
        pageKey: candidatePageIndex,
        hasPrevious: candidatePageIndex > 0,
        hasNext: candidatePage.hasMore,
        pending: candidatePending,
        previousLabel: t('manage.previousCandidates'),
        nextLabel: t('manage.nextCandidates'),
        loadingLabel: t('manage.loadingCandidates'),
        onPrevious: loadPreviousCandidatePage,
        onNext: loadNextCandidatePage,
      },
      onSelectOption: (relationshipId) => {
        const candidate = candidatePage.items.find((item) => item.relationshipId === relationshipId)
        if (!candidate) return { accepted: false, error: t('errors.stale') }
        setStagedPerson({ kind: 'invitation', relationshipId, label: candidate.label })
        setRequestedType(null)
        setError(null)
        return { accepted: true }
      },
    },
    {
      id: 'manual',
      label: t('manage.sourceManual'),
      type: 'manual',
      inputLabel: t('manage.participantName'),
      inputPlaceholder: t('manage.manualNamePlaceholder'),
      hint: t('manage.participantAccessDisclosure'),
      submitLabel: t('manage.continue'),
      inputMaxLength: 120,
      onSelect: (rawValue) => {
        const label = rawValue.trim().normalize('NFC')
        if (!label || label.includes('@')) {
          return { accepted: false, error: t('errors.invalid_input') }
        }
        setStagedPerson({ kind: 'participant', label })
        setError(null)
        return { accepted: true }
      },
    },
  ]

  return (
    <div className="space-y-3">
      <RelationshipPartyPicker
        triggerRef={pickerTriggerRef}
        copy={{
          triggerLabel: t('manage.addToCircle'),
          title: t('manage.addToCircle'),
          description: t('manage.pickerDescription'),
          closeLabel: t('common.keep'),
          searchLabel: t('manage.searchPeople'),
          searchPlaceholder: t('manage.searchPeoplePlaceholder'),
          filterLabel: t('manage.filterPeople'),
          allFilterLabel: t('manage.allPeople'),
          noResultsLabel: t('manage.noInvitablePeople'),
          sourceLabel: t('manage.sourceLabel'),
        }}
        helperText={t('manage.closedTestHelper')}
        sources={sources}
        onSelectionClosed={() => setConfirmationOpen(true)}
      />

      {notice ? <p role="status" className="text-sm text-primary">{notice}</p> : null}

      <TeskeidActionSheet
        open={confirmationOpen}
        onOpenChange={(nextOpen) => {
          if (mutationPending || mutationInFlightRef.current) return
          if (nextOpen) setConfirmationOpen(true)
          else clearStagedPerson()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          pickerTriggerRef.current?.focus()
        }}
        title={stagedPerson?.kind === 'invitation'
          ? `${t('manage.accessSheetTitle')}: ${stagedPerson.label}`
          : `${t('manage.participantSheetTitle')}: ${stagedPerson?.label ?? ''}`}
        description={stagedPerson?.kind === 'invitation'
          ? t('manage.accessSheetDescription')
          : t('manage.participantConfirmation')}
        closeLabel={t('common.keep')}
      >
        <div className="space-y-4 pb-[env(safe-area-inset-bottom)]">
          {stagedPerson?.kind === 'invitation' ? (
            <MembershipTypeField
              idPrefix="household-person-picker"
              value={requestedType}
              onChange={(nextType) => {
                setRequestedType(nextType)
                requestRef.current = null
                setError(null)
              }}
              disabled={mutationPending}
            />
          ) : null}
          {error ? (
            <p ref={alertRef} tabIndex={-1} role="alert" className="text-sm text-destructive outline-none">
              {error}
            </p>
          ) : null}
          <TeskeidActionButton
            type="button"
            variant="primary"
            className="w-full"
            pending={mutationPending}
            disabled={!stagedPerson || (stagedPerson.kind === 'invitation' && requestedType === null)}
            onClick={submitStagedPerson}
          >
            {mutationPending
              ? t('common.saving')
              : stagedPerson?.kind === 'invitation'
                ? t('manage.sendInvite')
                : t('manage.addParticipant')}
          </TeskeidActionButton>
          <TeskeidActionButton
            type="button"
            variant="secondary"
            className="w-full"
            disabled={mutationPending}
            onClick={clearStagedPerson}
          >
            {t('common.keep')}
          </TeskeidActionButton>
        </div>
      </TeskeidActionSheet>
    </div>
  )
}
