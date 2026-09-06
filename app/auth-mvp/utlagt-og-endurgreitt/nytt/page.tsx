import { notFound } from 'next/navigation'
import { ExpenseForm } from '@/components/expenses/ExpenseForm'
import { ExpenseDraftDeleteOnly } from '@/components/expenses/ExpenseDraftDeleteOnly'
import { ExpenseShell } from '@/components/expenses/ExpenseShell'
import { ExpenseEventContextChooser } from '@/components/events/ExpenseEventContextChooser'
import { getExpenseTranslations } from '@/components/expenses/i18n.server'
import { guardExpenseAccess } from '@/lib/expenses/guard'
import { getExpenseActorDisplayName, getExpenseParticipantOptions } from '@/lib/expenses/participants.server'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import { parseExpenseDraftId } from '@/lib/expenses/flow'
import { hydrateExpenseDraftEventGuestLabels } from '@/lib/expenses/drafts'
import {
  getExpenseCreationDraftDeleteCapability,
  getExpenseDraftPublicationLifecycle,
  getExpensePrivateDraft,
} from '@/lib/expenses/repository.server'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getRelationshipCircleOptions } from '@/lib/relationships/repository-v2.server'
import { canUseEventExpenses } from '@/lib/events/guard'
import {
  adaptLegacyExpenseEventSourceV2,
  listEventExpenseContextsV1,
} from '@/lib/events/repository.server'
import {
  getCurrentExpenseEventSourceV3,
  listLegacyExpenseEventSourcesV2,
} from '@/lib/events/legacy-expense-event-source-v2.repository.server'
import type { EventExpenseSourceView } from '@/lib/events/contracts'
import type { LegacyExpenseEventSourceV2 } from '@/lib/events/legacy-expense-event-source-v2.contracts'
import { eventDetailPath, eventExpensePath } from '@/lib/events/contracts'

export default async function NewOneOffExpensePage({ searchParams }: {
  searchParams: Promise<{
    draft?: string | string[]
    event?: string | string[]
    context?: string | string[]
  }>
}) {
  const [{ user }, t, query] = await Promise.all([guardExpenseAccess(), getExpenseTranslations(), searchParams])
  const draftId = parseExpenseDraftId(query.draft)
  const requestedDeleteCapability = draftId
    ? await getExpenseCreationDraftDeleteCapability(user.id, draftId)
    : undefined
  const hasExactOneOffDeleteCapability = requestedDeleteCapability?.status === 'ready'
    && requestedDeleteCapability.contextType === 'one_off'
  const draft = draftId
    ? await getExpensePrivateDraft(user.id, draftId).catch((error: unknown) => {
        if (hasExactOneOffDeleteCapability) return null
        throw error
      })
    : null
  const safeDraft = draft?.contextType === 'one_off' ? draft : null
  if (!safeDraft && requestedDeleteCapability?.status === 'ready') {
    if (requestedDeleteCapability.contextType !== 'one_off') notFound()
    const dashboardHref = '/auth-mvp/utlagt-og-endurgreitt'
    return (
      <ExpenseShell
        title={t('deleteControl.deleteOnly.pageTitle')}
        homeLabel={t('homeLabel')}
        backHref={dashboardHref}
        backLabel={t('back')}
        closedTestingFeature="utlagt-og-endurgreitt"
      >
        <ExpenseDraftDeleteOnly
          capability={requestedDeleteCapability}
          statusHref={dashboardHref}
          successHref={dashboardHref}
        />
      </ExpenseShell>
    )
  }
  const publicationLifecycle = safeDraft
    ? await getExpenseDraftPublicationLifecycle(user.id, safeDraft.id)
    : null
  const creationDraftDeleteCapability = safeDraft
    ? requestedDeleteCapability
    : undefined
  const hasExplicitEventQuery = query.event !== undefined
  const requestedEventId = typeof query.event === 'string' ? query.event : null
  const hasStandaloneContext = typeof query.context === 'string'
    && query.context === 'standalone'
  const chooserCandidate = !draftId
    && !hasExplicitEventQuery
    && !hasStandaloneContext
  const draftEventId = safeDraft?.payload.eventId ?? null

  const canUseEvents = await canUseEventExpenses(user)
  let eventSources: EventExpenseSourceView[] | undefined
  let eventSourcePresentation: LegacyExpenseEventSourceV2[] | undefined
  let exactEventSource: EventExpenseSourceView | null = null
  let eventSourcesError = false
  if (canUseEvents && chooserCandidate) {
    try {
      const contexts = await listEventExpenseContextsV1(user.id)
      if (contexts.status === 'ready') {
        const chooserEvents = contexts.events.map(({ id, name }) => ({ id, name }))
        return (
          <ExpenseShell title={t('expenseForm.oneOffTitle')} homeLabel={t('homeLabel')} backHref="/auth-mvp/utlagt-og-endurgreitt" backLabel={t('back')} closedTestingFeature="utlagt-og-endurgreitt">
            <ExpenseEventContextChooser events={chooserEvents} />
          </ExpenseShell>
        )
      }
      eventSourcesError = contexts.status === 'unavailable'
    } catch {
      eventSourcesError = true
    }
  }
  if (canUseEvents) {
    try {
      eventSourcePresentation = await listLegacyExpenseEventSourcesV2(user.id)
      // Selection authority and rendered availability must come from the same
      // bounded snapshot. Mixing the older V1 picker rows with this V2
      // presentation can otherwise admit a person from a different roster
      // revision between the two independent reads.
      eventSources = eventSourcePresentation.map(adaptLegacyExpenseEventSourceV2)
    } catch {
      eventSourcePresentation = []
      eventSources = []
      eventSourcesError = true
    }
    const exactEventId = draftEventId ?? (!safeDraft ? requestedEventId : null)
    if (exactEventId) {
      exactEventSource = eventSources.find((event) => event.id === exactEventId) ?? null
      let exactPresentation = eventSourcePresentation.find(
        (event) => event.eventId === exactEventId,
      ) ?? null
      if (!exactPresentation) {
        try {
          exactPresentation = await getCurrentExpenseEventSourceV3(user.id, exactEventId)
          if (exactPresentation?.eventId === exactEventId) {
            eventSourcePresentation = [exactPresentation, ...eventSourcePresentation]
          } else if (exactPresentation) {
            exactPresentation = null
            eventSourcesError = true
          }
        } catch {
          eventSourcesError = true
        }
      }
      if (!exactEventSource && exactPresentation) {
        try {
          exactEventSource = adaptLegacyExpenseEventSourceV2(exactPresentation)
        } catch {
          eventSourcesError = true
        }
      }
      if (exactEventSource && !eventSources.some((event) => event.id === exactEventSource?.id)) {
        eventSources = [exactEventSource, ...eventSources]
      }
    }
  }

  const initialEventSource = !safeDraft && requestedEventId
    ? exactEventSource
    : null
  const draftEventSource = draftEventId
    ? exactEventSource
    : null
  const draftEventPresentation = draftEventId
    ? eventSourcePresentation?.find((event) => event.eventId === draftEventId) ?? null
    : null
  const draftEventLabelSource = draftEventSource && draftEventPresentation
    ? {
        ...draftEventSource,
        guests: draftEventSource.guests.map((guest) => {
          const presentation = draftEventPresentation.people.find(
            (person) => person.legacyPersonRef === guest.id,
          )
          return {
            ...guest,
            displayName: presentation?.viewerPrivate?.alias
              ?? presentation?.shared.displayName
              ?? t('expenseForm.eventGuestUnavailableLabel'),
          }
        }),
      }
    : null
  const eventSelectionWarning = safeDraft
    ? Boolean(draftEventId && (
      !draftEventSource
      || draftEventSource.rosterRevision !== safeDraft.payload.eventRosterRevision
    ))
    : query.event !== undefined && !initialEventSource
  const displayDraft = safeDraft ? {
    ...safeDraft,
    payload: hydrateExpenseDraftEventGuestLabels(
      safeDraft.payload,
      draftEventLabelSource,
      t('expenseForm.eventGuestUnavailableLabel'),
    ),
  } : null
  const deleteContextHref = safeDraft?.payload.eventId
    && draftEventSource?.id === safeDraft.payload.eventId
      ? eventDetailPath(safeDraft.payload.eventId)
      : '/auth-mvp/utlagt-og-endurgreitt'

  const actorName = await getExpenseActorDisplayName(user.id)
  let options: ExpenseParticipantOption[] = []
  let optionsError = false
  try { options = await getExpenseParticipantOptions(user.id) } catch { optionsError = true }
  const canUseCircles = await checkFeatureAccess(user.id, user.email!, 'tengsl')
  const circleOptions = canUseCircles ? await getRelationshipCircleOptions(user.id) : []
  return (
    <ExpenseShell title={t('expenseForm.oneOffTitle')} homeLabel={t('homeLabel')} backHref="/auth-mvp/utlagt-og-endurgreitt" backLabel={t('back')} closedTestingFeature="utlagt-og-endurgreitt">
      <ExpenseForm
        mode="one_off"
        defaultCurrency="ISK"
        initialDate={new Date().toISOString().slice(0, 10)}
        initialMembers={[{ key: 'self', label: actorName, input: { type: 'self', key: 'self' }, isSelf: true }]}
        participantOptions={options}
        participantOptionsError={optionsError}
        circleOptions={circleOptions}
        draft={displayDraft}
        initialDraftId={draftId ?? undefined}
        publicationLifecycle={publicationLifecycle}
        creationDraftDeleteCapability={creationDraftDeleteCapability}
        deleteStatusHref={deleteContextHref}
        deleteSuccessHref={deleteContextHref}
        draftBaseHref={initialEventSource
          ? eventExpensePath(initialEventSource.id)
          : '/auth-mvp/utlagt-og-endurgreitt/nytt'}
        eventSources={eventSources}
        eventSourcePresentation={eventSourcePresentation}
        eventSourcesError={eventSourcesError}
        initialEventSource={initialEventSource}
        eventSelectionWarning={eventSelectionWarning}
      />
    </ExpenseShell>
  )
}
