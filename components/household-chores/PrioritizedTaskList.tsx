'use client'

import Link from 'next/link'
import { Check, Loader2, Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TeskeidActionSheet } from '@/components/teskeid/TeskeidActionSheet'
import { TeskeidMultiSelectPillFilter } from '@/components/teskeid/TeskeidMultiSelectPillFilter'
import { formatDateOnly } from '@/lib/date-format'
import { completeHouseholdChoreDefinitionV2Action } from '@/lib/household-chores/actions-v2'
import type {
  HouseholdChoreV2ActionError,
  HouseholdChoreV2ChildPriorityDefinition,
  HouseholdChoreV2MemberPriorityDefinition,
  HouseholdChoreV2MemberPriorityState,
  HouseholdChoreV2PriorityDashboard,
} from '@/lib/household-chores/contracts-v2'
import { householdChoreDefinitionPath, householdChoreEditDefinitionPath } from '@/lib/household-chores/paths'
import {
  filterHouseholdChoreV2Definitions,
  householdChoreCalendarDayDifference,
  householdChoreParticipantInitials,
  householdChoreV2PriorityDueOn,
  relevantHouseholdChoreV2States,
  sortHouseholdChoreV2Definitions,
  type HouseholdChorePriorityMatchMode,
} from '@/lib/household-chores/priority-v2'
import { HouseholdChoreRequestIds } from '@/lib/household-chores/request-id.client'
import { PerformedDateContextControl, performedDateContextLabel } from './PerformedDateContextControl'

const MAX_VISIBLE_INITIALS = 4

function MemberInitialSummary({ states }: { states: HouseholdChoreV2MemberPriorityState[] }) {
  const t = useTranslations('teskeid.householdChores')
  const shown = states.slice(0, MAX_VISIBLE_INITIALS)
  const overflow = Math.max(0, states.length - shown.length)
  const fullLabel = t('dashboard.priority.remainingNames', {
    names: states.map(state => state.label).join(', '),
  })

  return (
    <div className="flex min-w-0 items-center gap-2" aria-label={fullLabel}>
      <span className="flex shrink-0 -space-x-1" aria-hidden="true">
        {shown.map(state => (
          <span
            key={state.participantId}
            className="inline-flex size-8 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-bold"
          >
            {householdChoreParticipantInitials(state.label)}
          </span>
        ))}
        {overflow > 0 ? (
          <span className="inline-flex size-8 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-bold">
            +{overflow}
          </span>
        ) : null}
      </span>
      <span className="min-w-0 truncate text-xs text-muted-foreground">
        {t('dashboard.priority.remainingCount', { count: states.length })}
      </span>
    </div>
  )
}

function Urgency({ dueOn, serverToday }: { dueOn: string | null; serverToday: string }) {
  const t = useTranslations('teskeid.householdChores')
  if (!dueOn) return <>{t('dashboard.priority.noCadence')}</>
  const difference = householdChoreCalendarDayDifference(dueOn, serverToday)
  if (difference === 0) return <>{t('dashboard.priority.dueToday')}</>
  if (difference < 0) return <>{t('dashboard.priority.overdue', { count: Math.abs(difference) })}</>
  return <>{t('dashboard.priority.canWait', { count: difference })}</>
}

function MemberDefinitionStatus({
  definition,
  states,
}: {
  definition: HouseholdChoreV2MemberPriorityDefinition
  states: HouseholdChoreV2MemberPriorityState[]
}) {
  const t = useTranslations('teskeid.householdChores')
  const locale = useLocale()
  if (definition.cadenceDays === null) return null
  if (definition.completionScope === 'global') {
    if (!definition.latestPerformer) return null
    const performer = definition.latestPerformer.identityMarker === 'former_member'
      ? t('common.formerMember')
      : definition.latestPerformer.label ?? t('common.formerMember')
    return (
      <p className="text-xs leading-5 text-muted-foreground">
        {t('dashboard.priority.latestGlobal', {
          name: performer,
          date: formatDateOnly(definition.latestPerformer.performedOn, locale),
        })}
      </p>
    )
  }
  const remaining = states.filter(state => state.isRemaining)
  return remaining.length > 0
    ? <MemberInitialSummary states={remaining} />
    : (
      <p className="flex items-center gap-1 text-xs font-medium text-primary">
        {t('dashboard.priority.everyoneDone')} <Check aria-hidden size={15} />
      </p>
    )
}

function ChildDefinitionStatus({ definition }: { definition: HouseholdChoreV2ChildPriorityDefinition }) {
  const t = useTranslations('teskeid.householdChores')
  if (definition.cadenceDays === null) return null
  return definition.ownState.isRemaining ? (
    <p className="text-xs text-muted-foreground">{t('dashboard.priority.remainingForYou')}</p>
  ) : (
    <p className="flex items-center gap-1 text-xs font-medium text-primary">
      {t('dashboard.priority.doneForYou')} <Check aria-hidden size={15} />
    </p>
  )
}

export function PrioritizedTaskList({
  circleId,
  view,
}: {
  circleId: string
  view: HouseholdChoreV2PriorityDashboard
}) {
  const t = useTranslations('teskeid.householdChores')
  const locale = useLocale()
  const router = useRouter()
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([])
  const [matchMode, setMatchMode] = useState<HouseholdChorePriorityMatchMode>('and')
  const [performedOn, setPerformedOn] = useState(view.serverToday)
  const [chooserDefinitionId, setChooserDefinitionId] = useState<string | null>(null)
  const [pendingDefinitionId, setPendingDefinitionId] = useState<string | null>(null)
  const [error, setError] = useState<HouseholdChoreV2ActionError | null>(null)
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const requests = useRef(new HouseholdChoreRequestIds())
  const actionRefs = useRef(new Map<string, HTMLButtonElement>())
  const chooserReturnFocusId = useRef<string | null>(null)
  const previousServerToday = useRef(view.serverToday)
  const previousCircleId = useRef(circleId)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (previousCircleId.current !== circleId) {
      previousCircleId.current = circleId
      setSelectedParticipantIds([])
      setMatchMode('and')
      setPerformedOn(view.serverToday)
      setChooserDefinitionId(null)
      setError(null)
      setAnnouncement(null)
    }
  }, [circleId, view.serverToday])

  useEffect(() => {
    if (previousServerToday.current !== view.serverToday) {
      setPerformedOn(current => current === previousServerToday.current ? view.serverToday : current)
      previousServerToday.current = view.serverToday
    }
  }, [view.serverToday])

  useEffect(() => {
    const boundary = Date.parse(view.nextDayBoundaryAt)
    if (!Number.isFinite(boundary)) return
    const delay = Math.max(0, Math.min(boundary - Date.now() + 250, 2_147_483_647))
    const timer = window.setTimeout(() => router.refresh(), delay)
    return () => window.clearTimeout(timer)
  }, [router, view.nextDayBoundaryAt])

  const memberDefinitions = useMemo(() => {
    if (view.viewerType !== 'member') return []
    return sortHouseholdChoreV2Definitions(
      filterHouseholdChoreV2Definitions(
        view.definitions,
        selectedParticipantIds,
        matchMode,
      ),
      selectedParticipantIds,
    )
  }, [matchMode, selectedParticipantIds, view])

  const definitions = view.viewerType === 'member'
    ? memberDefinitions
    : view.definitions

  const chooserDefinition = view.viewerType === 'member' && chooserDefinitionId
    ? view.definitions.find(item => item.definitionId === chooserDefinitionId) ?? null
    : null
  const chooserStates = chooserDefinition
    ? relevantHouseholdChoreV2States(chooserDefinition, selectedParticipantIds)
    : []

  function friendlyError(resultError: HouseholdChoreV2ActionError) {
    setError(resultError)
    if (resultError === 'stale_version') router.refresh()
  }

  function complete(
    definition: HouseholdChoreV2MemberPriorityDefinition | HouseholdChoreV2ChildPriorityDefinition,
    state: HouseholdChoreV2MemberPriorityState | HouseholdChoreV2ChildPriorityDefinition['ownState'],
  ) {
    if (isPending || pendingDefinitionId) return
    const fingerprint = [
      'complete-definition-v2', circleId, definition.definitionId,
      state.participantId, state.expectedStateToken, performedOn,
    ].join(':')
    const requestId = requests.current.begin(fingerprint)
    if (!requestId) return
    setError(null)
    setAnnouncement(null)
    setPendingDefinitionId(definition.definitionId)
    setChooserDefinitionId(null)

    startTransition(async () => {
      let result
      try {
        result = await completeHouseholdChoreDefinitionV2Action({
          requestId,
          circleId,
          definitionId: definition.definitionId,
          participantId: state.participantId,
          expectedStateToken: state.expectedStateToken,
          performedOn,
        })
        requests.current.returned(fingerprint, result)
      } catch {
        requests.current.uncertain(fingerprint)
        setError('save_failed')
        setPendingDefinitionId(null)
        return
      }

      setPendingDefinitionId(null)
      if (!result.ok) {
        friendlyError(result.error)
        window.requestAnimationFrame(() => actionRefs.current.get(definition.definitionId)?.focus())
        return
      }
      const dateLabel = performedDateContextLabel(
        result.data.performedOn,
        view.serverToday,
        locale,
        t('performedDate.todayInline'),
        t('performedDate.yesterdayInline'),
      )
      setAnnouncement(t('dashboard.priority.completedAnnouncement', {
        name: state.label,
        date: dateLabel,
      }))
      router.refresh()
      window.requestAnimationFrame(() => {
        const action = actionRefs.current.get(definition.definitionId)
        if (action) action.focus()
        else headingRef.current?.focus()
      })
    })
  }

  function activate(definitionId: string) {
    if (view.viewerType === 'child') {
      const definition = view.definitions.find(item => item.definitionId === definitionId)
      if (definition) complete(definition, definition.ownState)
      return
    }
    const memberDefinition = view.definitions.find(item => item.definitionId === definitionId)
    if (!memberDefinition) return
    if (selectedParticipantIds.length === 1) {
      const state = memberDefinition.participantStates.find(
        item => item.participantId === selectedParticipantIds[0],
      )
      if (state) complete(memberDefinition, state)
      return
    }
    chooserReturnFocusId.current = memberDefinition.definitionId
    setChooserDefinitionId(memberDefinition.definitionId)
  }

  return (
    <section aria-labelledby="household-priority-heading" className="space-y-4">
      <h2
        ref={headingRef}
        id="household-priority-heading"
        tabIndex={-1}
        className="text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t('dashboard.priority.heading')}
      </h2>

      {view.viewerType === 'member' ? (
        <div className="space-y-3">
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
          {selectedParticipantIds.length >= 2 ? (
            <div role="group" aria-label={t('dashboard.priority.matchMode')} className="inline-flex rounded-xl border border-border p-1">
              {(['and', 'or'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={matchMode === mode}
                  onClick={() => setMatchMode(mode)}
                  className="inline-flex min-h-10 min-w-14 items-center justify-center rounded-lg px-3 text-sm font-semibold aria-pressed:bg-primary aria-pressed:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t(`dashboard.priority.mode.${mode}`)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <PerformedDateContextControl
        value={performedOn}
        serverToday={view.serverToday}
        onChange={setPerformedOn}
        disabled={isPending}
      />

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      {announcement ? (
        <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
          {announcement}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">{t(`errors.${error}`)}</p>
      ) : null}

      {definitions.length === 0 ? (
        <p tabIndex={-1} className="border-y border-border py-5 text-sm text-muted-foreground">
          {t('dashboard.priority.empty')}
        </p>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {definitions.map((definition) => {
            const memberStates = view.viewerType === 'member'
              ? relevantHouseholdChoreV2States(
                definition as HouseholdChoreV2MemberPriorityDefinition,
                selectedParticipantIds,
              )
              : []
            const dueOn = view.viewerType === 'member'
              ? householdChoreV2PriorityDueOn(
                definition as HouseholdChoreV2MemberPriorityDefinition,
                selectedParticipantIds,
              )
              : definition.priorityDueOn
            const pending = pendingDefinitionId === definition.definitionId
            const disabled = pendingDefinitionId !== null
              || (view.viewerType === 'member' && memberStates.length === 0)
            return (
              <article key={definition.definitionId} className="flex min-w-0 items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={householdChoreDefinitionPath(circleId, definition.definitionId)}
                    className="block rounded-lg py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="block break-words text-sm font-semibold">{definition.title}</span>
                    <span className="mt-1 block text-xs font-medium text-muted-foreground">
                      <Urgency dueOn={dueOn} serverToday={view.serverToday} />
                    </span>
                    <span className="mt-2 block">
                      {view.viewerType === 'member' ? (
                        <MemberDefinitionStatus
                          definition={definition as HouseholdChoreV2MemberPriorityDefinition}
                          states={memberStates}
                        />
                      ) : (
                        <ChildDefinitionStatus definition={definition as HouseholdChoreV2ChildPriorityDefinition} />
                      )}
                    </span>
                  </Link>
                  {definition.cadenceDays === null && view.viewerType === 'member' ? (
                    <Link
                      href={householdChoreEditDefinitionPath(circleId, definition.definitionId)}
                      className="mt-1 inline-flex min-h-10 items-center text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t('dashboard.priority.setCadence')}
                    </Link>
                  ) : null}
                </div>
                <button
                  ref={(node) => {
                    if (node) actionRefs.current.set(definition.definitionId, node)
                    else actionRefs.current.delete(definition.definitionId)
                  }}
                  type="button"
                  disabled={disabled}
                  aria-label={t('dashboard.priority.completeAria', { task: definition.title })}
                  aria-busy={pending || undefined}
                  onClick={() => activate(definition.definitionId)}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  {pending ? <Loader2 aria-hidden size={19} className="animate-spin" /> : <Plus aria-hidden size={20} />}
                </button>
              </article>
            )
          })}
        </div>
      )}

      <TeskeidActionSheet
        open={chooserDefinition !== null}
        onOpenChange={open => {
          if (!open) setChooserDefinitionId(null)
        }}
        title={chooserDefinition
          ? t('dashboard.priority.choosePerformerTitle', { task: chooserDefinition.title })
          : t('dashboard.priority.choosePerformer')}
        description={t('dashboard.priority.choosePerformerDescription')}
        closeLabel={t('common.cancel')}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const definitionId = chooserReturnFocusId.current
          if (definitionId) actionRefs.current.get(definitionId)?.focus()
        }}
      >
        {chooserStates.map(state => (
          <button
            key={state.participantId}
            type="button"
            disabled={isPending}
            onClick={() => chooserDefinition && complete(chooserDefinition, state)}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-border px-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{state.label}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {t('dashboard.points', { count: state.points })}
            </span>
          </button>
        ))}
      </TeskeidActionSheet>
    </section>
  )
}
