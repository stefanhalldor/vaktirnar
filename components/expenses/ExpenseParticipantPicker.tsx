'use client'

import {
  RelationshipPartyPicker,
  type RelationshipPartyPickerManualResult,
  type RelationshipPartyPickerSelectionResult,
  type RelationshipPartyPickerSource,
} from '@/components/tengsl/RelationshipPartyPicker'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import type { EventExpenseSourceView } from '@/lib/events/contracts'
import type { RelationshipCircleOption } from '@/lib/relationships/types'
import { ExpenseEventParticipantSource } from './ExpenseEventParticipantSource'
import { useExpenseTranslations } from './i18n.client'

export type ManualExpenseParticipant =
  | { kind: 'email'; recipientEmail: string }
  | { kind: 'guest'; displayName: string }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function classifyManualExpenseParticipant(value: string): ManualExpenseParticipant | null {
  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.includes('@')) {
    return EMAIL_PATTERN.test(normalized)
      ? { kind: 'email', recipientEmail: normalized.toLocaleLowerCase('en-US') }
      : null
  }
  return normalized.length <= 120 ? { kind: 'guest', displayName: normalized } : null
}

export function ExpenseParticipantPicker({
  options,
  excludedRelationshipIds = [],
  optionsError = false,
  circles = [],
  disabled = false,
  triggerLabel,
  dialogTitle,
  dialogDescription,
  onAddKnown,
  onAddManual,
  onSelectCircle,
  eventSources,
  eventSourcesError = false,
  selectedEventId = null,
  selectedEventGuestIds = [],
  initialSourceId,
  onSelectEvent,
  onClearEvent,
  onAddEventGuest,
}: {
  options: ExpenseParticipantOption[]
  excludedRelationshipIds?: string[]
  optionsError?: boolean
  circles?: RelationshipCircleOption[]
  disabled?: boolean
  triggerLabel?: string
  dialogTitle?: string
  dialogDescription?: string
  onAddKnown: (option: ExpenseParticipantOption) => boolean
  onAddManual: (participant: ManualExpenseParticipant) => boolean
  onSelectCircle?: (circle: RelationshipCircleOption) => boolean
  /** Undefined omits the event source entirely; an empty array renders its true empty state. */
  eventSources?: EventExpenseSourceView[]
  eventSourcesError?: boolean
  selectedEventId?: string | null
  selectedEventGuestIds?: string[]
  initialSourceId?: 'known' | 'event' | 'manual'
  onSelectEvent?: (event: EventExpenseSourceView) => RelationshipPartyPickerSelectionResult
  onClearEvent?: () => void
  onAddEventGuest?: (
    event: EventExpenseSourceView,
    guest: EventExpenseSourceView['guests'][number],
  ) => RelationshipPartyPickerSelectionResult
}) {
  const t = useExpenseTranslations()

  function selectKnown(relationshipId: string) {
    const option = options.find((candidate) => candidate.relationshipId === relationshipId)
    return option ? onAddKnown(option) : false
  }

  function selectManual(value: string): RelationshipPartyPickerManualResult {
    const participant = classifyManualExpenseParticipant(value)
    if (!participant) {
      return {
        accepted: false,
        error: t(value.includes('@')
          ? 'expenseForm.participantEmailInvalid'
          : 'expenseForm.participantNameInvalid'),
      }
    }
    return { accepted: onAddManual(participant) }
  }

  function selectCircle(circleId: string) {
    const circle = circles.find((candidate) => candidate.id === circleId)
    return circle && onSelectCircle ? onSelectCircle(circle) : false
  }

  const eventSourceEnabled = eventSources !== undefined
    && Boolean(onSelectEvent)
    && Boolean(onClearEvent)
    && Boolean(onAddEventGuest)
  const pickerOptions = options.map((option) => ({
    id: option.relationshipId,
    primaryLabel: option.pickerLabel,
    searchAliases: [option.sharedLabel],
    customLabels: option.customLabels,
  }))
  const pickerCircles = circles.map((circle) => ({
    id: circle.id,
    primaryLabel: circle.name,
    secondaryLabel: t('expenseForm.circleMemberCount', { count: circle.members.length }),
  }))
  const sources: RelationshipPartyPickerSource[] | undefined = eventSourceEnabled ? [
    {
      id: 'known',
      label: t('expenseForm.knownParticipant'),
      type: 'options',
      options: pickerOptions,
      excludedOptionIds: excludedRelationshipIds,
      optionsError,
      circles: pickerCircles,
      disabled: pickerOptions.length === 0 && (!onSelectCircle || pickerCircles.length === 0),
      loadErrorLabel: t('expenseForm.participantLoadError'),
      circleSectionLabel: t('expenseForm.relationshipCircles'),
      searchLabel: t('expenseForm.searchKnownParticipant'),
      searchPlaceholder: t('expenseForm.searchKnownParticipantPlaceholder'),
      filterLabel: t('expenseForm.filterKnownPeople'),
      allFilterLabel: t('expenseForm.allKnownPeople'),
      noResultsLabel: t('expenseForm.noKnownParticipantResults'),
      onSelectOption: selectKnown,
      onSelectCircle: onSelectCircle ? selectCircle : undefined,
    },
    {
      id: 'event',
      label: t('expenseForm.eventParticipantSource'),
      type: 'custom',
      render: ({ completeSelection, setError }) => (
        <ExpenseEventParticipantSource
          events={eventSources!}
          eventsError={eventSourcesError}
          selectedEventId={selectedEventId}
          selectedEventGuestIds={selectedEventGuestIds}
          onSelectEvent={onSelectEvent!}
          onClearEvent={onClearEvent!}
          onAddEventGuest={onAddEventGuest!}
          completeSelection={completeSelection}
          setPickerError={setError}
        />
      ),
    },
    {
      id: 'manual',
      label: t('expenseForm.nameOrEmail'),
      type: 'manual',
      inputLabel: t('expenseForm.nameOrEmail'),
      inputPlaceholder: t('expenseForm.nameOrEmailPlaceholder'),
      hint: t('expenseForm.nameOrEmailHint'),
      submitLabel: t('expenseForm.addParticipant'),
      inputMaxLength: 320,
      onSelect: selectManual,
    },
  ] : undefined

  return (
    <RelationshipPartyPicker
      options={pickerOptions}
      excludedOptionIds={excludedRelationshipIds}
      optionsError={optionsError}
      circles={pickerCircles}
      disabled={disabled}
      sources={sources}
      initialSourceId={eventSourceEnabled ? initialSourceId : undefined}
      copy={{
        triggerLabel: triggerLabel ?? t('expenseForm.addParticipant'),
        title: dialogTitle ?? t('expenseForm.addParticipant'),
        description: dialogDescription ?? t('expenseForm.addParticipantDescription'),
        closeLabel: t('expenseForm.closeParticipantPicker'),
        loadErrorLabel: t('expenseForm.participantLoadError'),
        circleSectionLabel: t('expenseForm.relationshipCircles'),
        searchLabel: t('expenseForm.searchKnownParticipant'),
        searchPlaceholder: t('expenseForm.searchKnownParticipantPlaceholder'),
        filterLabel: t('expenseForm.filterKnownPeople'),
        allFilterLabel: t('expenseForm.allKnownPeople'),
        noResultsLabel: t('expenseForm.noKnownParticipantResults'),
        sourceLabel: t('expenseForm.participantSource'),
        manual: {
          sourceLabel: t('expenseForm.participantSource'),
          knownModeLabel: t('expenseForm.knownParticipant'),
          manualModeLabel: t('expenseForm.nameOrEmail'),
          inputLabel: t('expenseForm.nameOrEmail'),
          inputPlaceholder: t('expenseForm.nameOrEmailPlaceholder'),
          hint: t('expenseForm.nameOrEmailHint'),
          submitLabel: t('expenseForm.addParticipant'),
        },
      }}
      onSelectOption={selectKnown}
      onSelectManual={selectManual}
      onSelectCircle={onSelectCircle ? selectCircle : undefined}
    />
  )
}
