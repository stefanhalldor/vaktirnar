'use client'

import {
  RelationshipPartyPicker,
  type RelationshipPartyPickerManualResult,
} from '@/components/tengsl/RelationshipPartyPicker'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import { useTranslations } from 'next-intl'

const UNSAFE_NAME_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u

export type EventGuestNameResult =
  | { ok: true; displayName: string }
  | { ok: false; error: 'invalid' | 'email_not_supported' }

export function parseEventGuestName(value: string): EventGuestNameResult {
  const displayName = value.trim().normalize('NFC')
  if (displayName.includes('@')) return { ok: false, error: 'email_not_supported' }
  if (!displayName || displayName.length > 120 || UNSAFE_NAME_CONTROLS.test(displayName)) {
    return { ok: false, error: 'invalid' }
  }
  return { ok: true, displayName }
}

export function EventParticipantPicker({
  options,
  excludedRelationshipIds = [],
  optionsError = false,
  disabled = false,
  onAddKnown,
  onAddGuest,
}: {
  options: ExpenseParticipantOption[]
  excludedRelationshipIds?: string[]
  optionsError?: boolean
  disabled?: boolean
  onAddKnown: (option: ExpenseParticipantOption) => boolean
  onAddGuest: (displayName: string) => boolean
}) {
  const t = useTranslations('teskeid.events')

  function selectKnown(relationshipId: string): boolean {
    const option = options.find((candidate) => candidate.relationshipId === relationshipId)
    return option ? onAddKnown(option) : false
  }

  function selectGuest(value: string): RelationshipPartyPickerManualResult {
    const result = parseEventGuestName(value)
    if (!result.ok) {
      return {
        accepted: false,
        error: t(result.error === 'email_not_supported'
          ? 'picker.emailNotSupported'
          : 'picker.guestNameInvalid'),
      }
    }
    return { accepted: onAddGuest(result.displayName) }
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
      disabled={disabled}
      manualInputMaxLength={120}
      copy={{
        triggerLabel: t('picker.trigger'),
        title: t('picker.title'),
        description: t('picker.description'),
        closeLabel: t('picker.close'),
        loadErrorLabel: t('picker.loadError'),
        searchLabel: t('picker.searchLabel'),
        searchPlaceholder: t('picker.searchPlaceholder'),
        filterLabel: t('picker.filterLabel'),
        allFilterLabel: t('picker.allFilterLabel'),
        noResultsLabel: t('picker.noResults'),
        manual: {
          sourceLabel: t('picker.sourceLabel'),
          knownModeLabel: t('picker.knownMode'),
          manualModeLabel: t('picker.guestMode'),
          inputLabel: t('picker.guestName'),
          inputPlaceholder: t('picker.guestPlaceholder'),
          hint: t('picker.guestHint'),
          submitLabel: t('picker.addGuest'),
        },
      }}
      onSelectOption={selectKnown}
      onSelectManual={selectGuest}
    />
  )
}
