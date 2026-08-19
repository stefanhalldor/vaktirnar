'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { useTranslations } from 'next-intl'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import { TeskeidActionSheet } from '@/components/teskeid/TeskeidActionSheet'
import { TeskeidMultiSelectPillFilter } from '@/components/teskeid/TeskeidMultiSelectPillFilter'
import { completeHouseholdChoreDefinitionAction } from '@/lib/household-chores/actions'
import type {
  HouseholdChorePriorityDashboardView,
  HouseholdChorePriorityDefinition,
  HouseholdChorePriorityParticipantState,
} from '@/lib/household-chores/contracts'
import {
  filterAndSortHouseholdChorePriorities,
  priorityDueAtForView,
  priorityStateFor,
  priorityStates,
  type HouseholdChoreParticipantMatchMode,
} from '@/lib/household-chores/priority'
import {
  householdChoreDefinitionPath,
  householdChoreEditDefinitionPath,
} from '@/lib/household-chores/paths'
import { HouseholdChoreRequestIds } from '@/lib/household-chores/request-id.client'

function nextLocalMidnight(now: number) {
  const date = new Date(now)
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
    0, 0, 1,
  ).getTime()
}

function calendarDayDifference(dueAt: string, now: number) {
  const due = new Date(dueAt)
  const current = new Date(now)
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
  const currentDay = new Date(
    current.getFullYear(), current.getMonth(), current.getDate(),
  ).getTime()
  return Math.round((dueDay - currentDay) / 86_400_000)
}

export function PrioritizedTaskList({
  circleId,
  view,
  initialNow,
}: {
  circleId: string
  view: HouseholdChorePriorityDashboardView
  initialNow: string
}) {
  const t = useTranslations('teskeid.householdChores')
  const router = useRouter()
  const requests = useRef(new HouseholdChoreRequestIds())
  const rowRefs = useRef(new Map<string, HTMLElement>())
  const headingRef = useRef<HTMLHeadingElement>(null)
  const pendingFocusRef = useRef<{ definitionId: string; index: number } | null>(null)
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([])
  const [matchMode, setMatchMode] = useState<HouseholdChoreParticipantMatchMode>('and')
  const [workAsParticipantId, setWorkAsParticipantId] = useState<string | null>(null)
  const [chooserDefinitionId, setChooserDefinitionId] = useState<string | null>(null)
  const [pendingDefinitionId, setPendingDefinitionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [now, setNow] = useState(() => Date.parse(initialNow))
  const [isTransitionPending, startTransition] = useTransition()
  const pending = pendingDefinitionId !== null || isTransitionPending

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    function schedule() {
      const current = Date.now()
      timer = setTimeout(() => {
        setNow(Date.now())
        schedule()
      }, Math.max(1_000, nextLocalMidnight(current) - current))
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])

  const visibleDefinitions = useMemo(() => filterAndSortHouseholdChorePriorities(
    view.definitions,
    view.viewerType === 'member' ? workAsParticipantId : view.ownParticipantId,
    view.viewerType === 'member' ? selectedParticipantIds : [],
    matchMode,
  ), [view, workAsParticipantId, selectedParticipantIds, matchMode])

  const visibleKey = visibleDefinitions.map(item => item.definitionId).join(':')
  useEffect(() => {
    const pendingFocus = pendingFocusRef.current
    if (!pendingFocus) return
    const sameRow = rowRefs.current.get(pendingFocus.definitionId)
    const nextRow = visibleDefinitions[pendingFocus.index]
      ?? visibleDefinitions[pendingFocus.index - 1]
    const target = sameRow
      ?? (nextRow ? rowRefs.current.get(nextRow.definitionId) : null)
      ?? headingRef.current
    target?.focus()
    pendingFocusRef.current = null
  }, [visibleKey, visibleDefinitions])

  const chooserDefinition = chooserDefinitionId
    ? view.definitions.find(item => item.definitionId === chooserDefinitionId) ?? null
    : null

  function urgency(dueAt: string | null) {
    if (!dueAt) return t('dashboard.priority.noCadence')
    const difference = calendarDayDifference(dueAt, now)
    if (difference < 0) {
      return t('dashboard.priority.overdue', { count: Math.abs(difference) })
    }
    if (difference === 0) return t('dashboard.priority.dueToday')
    return t('dashboard.priority.canWait', { count: difference })
  }

  function completionState(definition: HouseholdChorePriorityDefinition) {
    if (view.viewerType === 'child') return definition.ownState ?? null
    if (workAsParticipantId) return priorityStateFor(definition, workAsParticipantId)
    return null
  }

  function complete(
    definition: HouseholdChorePriorityDefinition,
    state: HouseholdChorePriorityParticipantState,
  ) {
    if (pending) return
    const fingerprint = [
      'complete-definition', circleId, definition.definitionId,
      state.participantId, state.expectedStateToken,
    ].join(':')
    const requestId = requests.current.begin(fingerprint)
    if (!requestId) return
    const index = visibleDefinitions.findIndex(
      item => item.definitionId === definition.definitionId,
    )
    setPendingDefinitionId(definition.definitionId)
    setError(null)
    startTransition(async () => {
      try {
        const result = await completeHouseholdChoreDefinitionAction({
          requestId,
          circleId,
          definitionId: definition.definitionId,
          participantId: state.participantId,
          expectedStateToken: state.expectedStateToken,
        })
        requests.current.returned(fingerprint, result)
        if (!result.ok) {
          setError(t(`errors.${result.error}`))
          if (result.error === 'stale' || result.error === 'conflict') router.refresh()
          return
        }
        pendingFocusRef.current = {
          definitionId: definition.definitionId,
          index: Math.max(index, 0),
        }
        setAnnouncement(t('dashboard.priority.completedAnnouncement', {
          task: definition.title,
          name: state.label,
        }))
        setChooserDefinitionId(null)
        router.refresh()
      } catch {
        requests.current.uncertain(fingerprint)
        setError(t('errors.save_failed'))
      } finally {
        setPendingDefinitionId(null)
      }
    })
  }

  return (
    <section aria-labelledby="household-priority-heading" className="space-y-4">
      <h2
        ref={headingRef}
        id="household-priority-heading"
        tabIndex={-1}
        className="text-sm font-semibold outline-none"
      >
        {t('dashboard.priority.heading')}
      </h2>

      {view.viewerType === 'member' ? (
        <div className="space-y-4 border-y border-border py-4">
          <div className="space-y-2">
            <label htmlFor="household-work-as" className="block text-sm font-medium">
              {t('dashboard.priority.workAs')}
            </label>
            <select
              id="household-work-as"
              value={workAsParticipantId ?? ''}
              disabled={pending}
              onChange={(event) => setWorkAsParticipantId(event.target.value || null)}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <option value="">{t('dashboard.priority.askEveryTime')}</option>
              {view.participants.map(participant => (
                <option key={participant.participantId} value={participant.participantId}>
                  {participant.isViewer
                    ? t('dashboard.priority.meAs', { name: participant.label })
                    : participant.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">{t('dashboard.priority.filterPeople')}</p>
            <TeskeidMultiSelectPillFilter
              options={view.participants.map(participant => ({
                id: participant.participantId,
                label: participant.label,
              }))}
              selectedIds={selectedParticipantIds}
              onChange={setSelectedParticipantIds}
              ariaLabel={t('dashboard.priority.filterPeople')}
              clearLabel={t('dashboard.priority.clearFilter')}
            />
          </div>

          {selectedParticipantIds.length >= 2 ? (
            <div
              role="group"
              aria-label={t('dashboard.priority.matchMode')}
              className="grid grid-cols-2 rounded-xl border border-border p-1"
            >
              {(['and', 'or'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={matchMode === mode}
                  onClick={() => setMatchMode(mode)}
                  className="min-h-10 rounded-lg px-3 text-sm font-semibold aria-pressed:bg-primary aria-pressed:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t(`dashboard.priority.mode.${mode}`)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="border-y border-border py-3 text-sm">
          {t('dashboard.priority.workAsFixed', {
            name: view.definitions[0]?.ownState?.label ?? t('common.formerMember'),
          })}
        </p>
      )}

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <p aria-live="polite" className="sr-only">{announcement}</p>

      {visibleDefinitions.length === 0 ? (
        <p className="border-y border-border py-5 text-sm text-muted-foreground">
          {t('dashboard.priority.empty')}
        </p>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {visibleDefinitions.map((definition) => {
            const directState = completionState(definition)
            const dueAt = priorityDueAtForView(
              definition,
              view.viewerType === 'member' ? workAsParticipantId : view.ownParticipantId,
              view.viewerType === 'member' ? selectedParticipantIds : [],
            )
            const rowPending = pendingDefinitionId === definition.definitionId
            return (
              <article
                key={definition.definitionId}
                ref={(node) => {
                  if (node) rowRefs.current.set(definition.definitionId, node)
                  else rowRefs.current.delete(definition.definitionId)
                }}
                tabIndex={-1}
                className="space-y-3 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={householdChoreDefinitionPath(circleId, definition.definitionId)}
                      className="break-words text-sm font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {definition.title}
                    </Link>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {urgency(dueAt)}
                      {' · '}
                      {t(`dashboard.priority.scope.${definition.completionScope}`)}
                    </p>
                  </div>
                  <TeskeidActionButton
                    type="button"
                    variant="primary"
                    pending={rowPending}
                    disabled={pending || priorityStates(definition).length === 0}
                    onClick={() => {
                      if (directState) complete(definition, directState)
                      else setChooserDefinitionId(definition.definitionId)
                    }}
                    className="shrink-0"
                  >
                    {rowPending ? t('dashboard.priority.completing') : t('dashboard.priority.complete')}
                  </TeskeidActionButton>
                </div>
                {definition.cadenceDays === null && view.viewerType === 'member' ? (
                  <Link
                    href={householdChoreEditDefinitionPath(circleId, definition.definitionId)}
                    className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t('dashboard.priority.setCadence')}
                  </Link>
                ) : null}
                {(definition.openAssignmentCount ?? 0) > 0 ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    {t('dashboard.priority.openAssignments', {
                      count: definition.openAssignmentCount ?? 0,
                    })}
                  </p>
                ) : null}
              </article>
            )
          })}
        </div>
      )}

      <TeskeidActionSheet
        open={chooserDefinition !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setChooserDefinitionId(null)
        }}
        title={chooserDefinition
          ? t('dashboard.priority.choosePerformerTitle', { task: chooserDefinition.title })
          : t('dashboard.priority.choosePerformer')}
        description={t('dashboard.priority.choosePerformerDescription')}
        closeLabel={t('common.cancel')}
      >
        <div className="space-y-2 pb-[env(safe-area-inset-bottom)]">
          {chooserDefinition ? priorityStates(chooserDefinition).map(state => (
            <TeskeidActionButton
              key={state.participantId}
              type="button"
              variant="secondary"
              className="w-full justify-between gap-3 text-left"
              pending={pendingDefinitionId === chooserDefinition.definitionId}
              disabled={pending}
              onClick={() => complete(chooserDefinition, state)}
            >
              <span className="min-w-0 break-words">{state.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {t('dashboard.points', { count: state.points })}
              </span>
            </TeskeidActionButton>
          )) : null}
        </div>
      </TeskeidActionSheet>
    </section>
  )
}
