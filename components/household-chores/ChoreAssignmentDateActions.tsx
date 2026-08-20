'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { TeskeidActionSheet } from '@/components/teskeid/TeskeidActionSheet'
import { TeskeidDateField } from '@/components/teskeid/TeskeidDateField'
import {
  completeHouseholdChoreAssignmentV2Action,
  correctHouseholdChoreCompletionDateAction,
} from '@/lib/household-chores/actions-v2'
import type { HouseholdChoreV2ActionError } from '@/lib/household-chores/contracts-v2'
import { HouseholdChoreRequestIds } from '@/lib/household-chores/request-id.client'
import { PerformedDateContextControl } from './PerformedDateContextControl'

export interface ChoreAssignmentDateActionState {
  circleId: string
  assignmentId: string
  version: string
  serverToday: string
  minimumPerformedOn?: string
  canComplete: boolean
  correction: {
    completionSequence: number
    performedOn: string
  } | null
}

export function ChoreAssignmentDateActions({ state }: { state: ChoreAssignmentDateActionState }) {
  const t = useTranslations('teskeid.householdChores')
  const router = useRouter()
  const [performedOn, setPerformedOn] = useState(state.serverToday)
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [correctedDate, setCorrectedDate] = useState(state.correction?.performedOn ?? state.serverToday)
  const [error, setError] = useState<HouseholdChoreV2ActionError | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const requests = useRef(new HouseholdChoreRequestIds())
  const correctionTriggerRef = useRef<HTMLButtonElement>(null)

  function handleError(resultError: HouseholdChoreV2ActionError) {
    setError(resultError)
    if (resultError === 'stale_version' || resultError === 'terminal_state') router.refresh()
  }

  function complete() {
    if (isPending || !state.canComplete) return
    const fingerprint = [
      'complete-assignment-v2', state.circleId, state.assignmentId,
      state.version, performedOn,
    ].join(':')
    const requestId = requests.current.begin(fingerprint)
    if (!requestId) return
    setError(null)
    setNotice(null)
    startTransition(async () => {
      let result
      try {
        result = await completeHouseholdChoreAssignmentV2Action({
          requestId,
          circleId: state.circleId,
          assignmentId: state.assignmentId,
          expectedVersion: state.version,
          performedOn,
        })
        requests.current.returned(fingerprint, result)
      } catch {
        requests.current.uncertain(fingerprint)
        setError('save_failed')
        return
      }
      if (!result.ok) {
        handleError(result.error)
        return
      }
      setNotice(t('assignment.completedNotice'))
      router.refresh()
    })
  }

  function correct() {
    if (isPending || !state.correction || correctedDate === state.correction.performedOn) return
    const fingerprint = [
      'correct-completion-date', state.circleId, state.assignmentId,
      state.version, state.correction.completionSequence, correctedDate,
    ].join(':')
    const requestId = requests.current.begin(fingerprint)
    if (!requestId) return
    setError(null)
    setNotice(null)
    startTransition(async () => {
      let result
      try {
        result = await correctHouseholdChoreCompletionDateAction({
          requestId,
          circleId: state.circleId,
          assignmentId: state.assignmentId,
          expectedVersion: state.version,
          completionSequence: state.correction!.completionSequence,
          performedOn: correctedDate,
        })
        requests.current.returned(fingerprint, result)
      } catch {
        requests.current.uncertain(fingerprint)
        setError('save_failed')
        return
      }
      if (!result.ok) {
        handleError(result.error)
        return
      }
      setCorrectionOpen(false)
      setNotice(t('assignment.correctionSaved'))
      router.refresh()
    })
  }

  if (!state.canComplete && !state.correction) return null

  return (
    <section className="space-y-3 border-t border-border pt-6" aria-labelledby="assignment-date-actions-heading">
      <h2 id="assignment-date-actions-heading" className="text-sm font-semibold">
        {state.canComplete ? t('assignment.completeHeading') : t('assignment.completionDateHeading')}
      </h2>
      {notice ? <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm" role="status">{notice}</p> : null}
      {error && !correctionOpen ? <p className="text-sm text-destructive" role="alert">{t(`errors.${error}`)}</p> : null}

      {state.canComplete ? (
        <>
          <PerformedDateContextControl
            value={performedOn}
            serverToday={state.serverToday}
            minimumDate={state.minimumPerformedOn}
            onChange={setPerformedOn}
            disabled={isPending}
          />
          {state.minimumPerformedOn ? (
            <p className="text-xs leading-5 text-muted-foreground">
              {t('assignment.dateBeforeCreationHint')}
            </p>
          ) : null}
          <TeskeidActionButton
            type="button"
            variant="primary"
            pending={isPending}
            onClick={complete}
            className="w-full"
          >
            {isPending ? t('common.saving') : t('assignment.complete')}
          </TeskeidActionButton>
        </>
      ) : null}

      {state.correction ? (
        <>
          <TeskeidActionButton
            ref={correctionTriggerRef}
            type="button"
            pending={isPending}
            onClick={() => {
              setCorrectedDate(state.correction!.performedOn)
              setCorrectionOpen(true)
            }}
            className="w-full"
          >
            {t('assignment.correctDate')}
          </TeskeidActionButton>
          <TeskeidActionSheet
            open={correctionOpen}
            onOpenChange={setCorrectionOpen}
            title={t('assignment.correctDateTitle')}
            description={t('assignment.correctDateDisclosure')}
            closeLabel={t('common.cancel')}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              correctionTriggerRef.current?.focus()
            }}
          >
            {error ? <p className="text-sm text-destructive" role="alert">{t(`errors.${error}`)}</p> : null}
            <TeskeidDateField
              label={t('performedDate.dateLabel')}
              value={correctedDate}
              onChange={setCorrectedDate}
              placeholder={t('performedDate.chooseDate')}
              min={state.minimumPerformedOn}
              max={state.serverToday}
              disabled={isPending}
              required
            />
            <TeskeidActionButton
              type="button"
              variant="primary"
              pending={isPending}
              disabled={!correctedDate
                || correctedDate === state.correction.performedOn
                || correctedDate > state.serverToday
                || (state.minimumPerformedOn !== undefined
                  && correctedDate < state.minimumPerformedOn)}
              onClick={correct}
              className="w-full"
            >
              {isPending ? t('common.saving') : t('assignment.saveCorrectedDate')}
            </TeskeidActionButton>
          </TeskeidActionSheet>
        </>
      ) : null}
    </section>
  )
}
