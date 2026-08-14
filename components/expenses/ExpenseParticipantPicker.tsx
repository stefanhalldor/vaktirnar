'use client'

import {
  RelationshipPartyPicker,
  type RelationshipPartyPickerManualResult,
} from '@/components/tengsl/RelationshipPartyPicker'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import type { RelationshipCircleOption } from '@/lib/relationships/types'
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

  return (
    <RelationshipPartyPicker
      options={options.map((option) => ({
        id: option.relationshipId,
        primaryLabel: option.pickerLabel,
        searchAliases: [option.sharedLabel],
        customLabels: option.customLabels,
      }))}
      excludedOptionIds={excludedRelationshipIds}
      optionsError={optionsError}
      circles={circles.map((circle) => ({
        id: circle.id,
        primaryLabel: circle.name,
        secondaryLabel: t('expenseForm.circleMemberCount', { count: circle.members.length }),
      }))}
      disabled={disabled}
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
