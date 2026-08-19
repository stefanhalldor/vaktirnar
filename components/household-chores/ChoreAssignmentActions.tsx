'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTeskeidNavigation } from '@/components/teskeid/TeskeidNavigationFeedback'
import {
  cancelHouseholdChoreAssignmentAction,
  cancelOwnHouseholdChoreAssignmentAction,
  completeHouseholdChoreAssignmentAction,
  repeatHouseholdChoreAssignmentAction,
  undoHouseholdChoreCompletionAction,
} from '@/lib/household-chores/actions'
import { householdChoreAssignmentPath } from '@/lib/household-chores/paths'
import { HouseholdChoreRequestIds } from '@/lib/household-chores/request-id.client'

export interface ChoreAssignmentActionState {
  circleId: string
  assignmentId: string
  version: string
  canComplete: boolean
  canCancelAsMember: boolean
  canCancelOwn: boolean
  canUndo: boolean
  repeatContext: {
    definitionVersion: string
    valueVersion: string
  } | null
}

export function ChoreAssignmentActions({ state }: { state: ChoreAssignmentActionState }) {
  const t = useTranslations('teskeid.householdChores')
  const router = useRouter()
  const { navigate } = useTeskeidNavigation()
  const [isPending, startTransition] = useTransition()
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [confirmingUndo, setConfirmingUndo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const requests = useRef(new HouseholdChoreRequestIds())
  const cancelTriggerRef = useRef<HTMLButtonElement>(null)
  const cancelConfirmRef = useRef<HTMLButtonElement>(null)
  const wasConfirmingCancel = useRef(false)
  const undoTriggerRef = useRef<HTMLButtonElement>(null)
  const undoConfirmRef = useRef<HTMLButtonElement>(null)
  const wasConfirmingUndo = useRef(false)

  useEffect(() => {
    if (confirmingCancel) {
      wasConfirmingCancel.current = true
      cancelConfirmRef.current?.focus()
    } else if (wasConfirmingCancel.current) {
      wasConfirmingCancel.current = false
      cancelTriggerRef.current?.focus()
    }
  }, [confirmingCancel])

  useEffect(() => {
    if (confirmingUndo) {
      wasConfirmingUndo.current = true
      undoConfirmRef.current?.focus()
    } else if (wasConfirmingUndo.current) {
      wasConfirmingUndo.current = false
      undoTriggerRef.current?.focus()
    }
  }, [confirmingUndo])

  function run(action: 'complete' | 'cancel' | 'undo' | 'repeat') {
    if (isPending) return
    const fingerprint = [
      action,
      state.circleId,
      state.assignmentId,
      state.version,
      state.repeatContext?.definitionVersion ?? '',
      state.repeatContext?.valueVersion ?? '',
    ].join(':')
    const requestId = requests.current.begin(fingerprint)
    if (!requestId) return
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const base = {
        requestId,
        circleId: state.circleId,
        assignmentId: state.assignmentId,
        expectedVersion: state.version,
      }
      let result
      try {
        result = action === 'complete'
          ? await completeHouseholdChoreAssignmentAction(base)
          : action === 'cancel'
            ? await (state.canCancelOwn
                ? cancelOwnHouseholdChoreAssignmentAction(base)
                : cancelHouseholdChoreAssignmentAction(base))
            : action === 'undo'
              ? await undoHouseholdChoreCompletionAction(base)
              : state.repeatContext
                ? await repeatHouseholdChoreAssignmentAction({
                    requestId: base.requestId,
                    circleId: state.circleId,
                    sourceAssignmentId: state.assignmentId,
                    expectedSourceVersion: state.version,
                    expectedDefinitionVersion: state.repeatContext.definitionVersion,
                    expectedValueVersion: state.repeatContext.valueVersion,
                  })
                : { ok: false as const, error: 'not_available' as const }
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
      setConfirmingCancel(false)
      setConfirmingUndo(false)
      if (action === 'repeat') {
        navigate(householdChoreAssignmentPath(state.circleId, result.data.resourceId))
        return
      }
      if (action === 'undo' && result.data.reopenOutcome === 'cancelled') {
        setNotice(t(
          result.data.reopenReason === 'cap_not_reopened'
            ? 'assignment.undoNotReopenedCap'
            : 'assignment.undoNotReopenedInactive',
        ))
      }
      router.refresh()
    })
  }

  const canCancel = state.canCancelAsMember || state.canCancelOwn
  if (!state.canComplete && !canCancel && !state.canUndo && !state.repeatContext && !notice && !error) {
    return null
  }

  return (
    <div className="space-y-3 border-t border-border pt-6">
      {notice ? (
        <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-6" role="status">
          {notice}
        </p>
      ) : null}
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

      {state.canComplete ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run('complete')}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {isPending ? t('common.saving') : t('assignment.complete')}
        </button>
      ) : null}

      {canCancel ? (
        !confirmingCancel ? (
          <button
            ref={cancelTriggerRef}
            type="button"
            disabled={isPending}
            onClick={() => {
              setConfirmingUndo(false)
              setConfirmingCancel(true)
            }}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-destructive px-4 text-sm font-semibold text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {t('assignment.cancel')}
          </button>
        ) : (
          <div
            role="alertdialog"
            aria-modal="false"
            aria-label={t('assignment.cancel')}
            aria-describedby="assignment-cancel-disclosure"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !isPending) setConfirmingCancel(false)
            }}
            className="space-y-3 rounded-xl border border-destructive/40 p-4"
          >
            <p id="assignment-cancel-disclosure" className="text-sm leading-6">
              {t('assignment.cancelDisclosure')}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                ref={cancelConfirmRef}
                type="button"
                disabled={isPending}
                onClick={() => run('cancel')}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {isPending ? t('common.saving') : t('assignment.confirmCancel')}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setConfirmingCancel(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {t('assignment.keep')}
              </button>
            </div>
          </div>
        )
      ) : null}

      {state.canUndo ? (
        !confirmingUndo ? (
          <button
            ref={undoTriggerRef}
            type="button"
            disabled={isPending}
            onClick={() => {
              setConfirmingCancel(false)
              setConfirmingUndo(true)
            }}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {t('assignment.undo')}
          </button>
        ) : (
          <div
            role="alertdialog"
            aria-modal="false"
            aria-label={t('assignment.undo')}
            aria-describedby="assignment-undo-disclosure"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !isPending) setConfirmingUndo(false)
            }}
            className="space-y-3 rounded-xl border border-border p-4"
          >
            <p id="assignment-undo-disclosure" className="text-sm leading-6">
              {t('assignment.undoDisclosure')}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                ref={undoConfirmRef}
                type="button"
                disabled={isPending}
                onClick={() => run('undo')}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {isPending ? t('common.saving') : t('assignment.confirmUndo')}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setConfirmingUndo(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {t('assignment.keepCompletion')}
              </button>
            </div>
          </div>
        )
      ) : null}

      {state.repeatContext ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run('repeat')}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {isPending ? t('common.saving') : t('assignment.repeat')}
        </button>
      ) : null}
    </div>
  )
}
