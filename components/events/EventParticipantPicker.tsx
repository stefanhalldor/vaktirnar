'use client'

import {
  RelationshipPartyPicker,
  type RelationshipPartyPickerManualResult,
} from '@/components/tengsl/RelationshipPartyPicker'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import type { EventNewGuestInput } from '@/lib/events/contracts'
import { useTranslations } from 'next-intl'

const UNSAFE_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

export type EventManualGuestResult =
  | { ok: true; label: string; input: EventNewGuestInput }
  | { ok: false; error: 'invalid_name' | 'invalid_email' }

export function parseEventManualGuest(value: string): EventManualGuestResult {
  const normalized = value.trim().normalize('NFC')
  if (normalized.includes('@')) {
    const email = normalized.toLocaleLowerCase('en-US')
    if (email.length > 320 || UNSAFE_CONTROLS.test(email) || !SIMPLE_EMAIL.test(email)) {
      return { ok: false, error: 'invalid_email' }
    }
    return {
      ok: true,
      label: email,
      input: { source_kind: 'manual_email', email },
    }
  }
  if (!normalized || normalized.length > 120 || UNSAFE_CONTROLS.test(normalized)) {
    return { ok: false, error: 'invalid_name' }
  }
  return {
    ok: true,
    label: normalized,
    input: { source_kind: 'manual_name', display_name: normalized },
  }
}

export function EventParticipantPicker({
  options,
  excludedRelationshipIds = [],
  optionsError = false,
  disabled = false,
  onAddKnown,
  onAddManual,
}: {
  options: ExpenseParticipantOption[]
  excludedRelationshipIds?: string[]
  optionsError?: boolean
  disabled?: boolean
  onAddKnown: (option: ExpenseParticipantOption) => boolean
  onAddManual: (input: EventNewGuestInput, label: string) => boolean
}) {
  const t = useTranslations('teskeid.events')

  function selectKnown(relationshipId: string): boolean {
    const option = options.find((candidate) => candidate.relationshipId === relationshipId)
    return option ? onAddKnown(option) : false
  }

  function selectManual(value: string): RelationshipPartyPickerManualResult {
    const result = parseEventManualGuest(value)
    if (!result.ok) {
      return {
        accepted: false,
        error: t(result.error === 'invalid_email'
          ? 'picker.emailInvalid'
          : 'picker.guestNameInvalid'),
      }
    }
    return { accepted: onAddManual(result.input, result.label) }
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
      manualInputMaxLength={320}
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
      onSelectManual={selectManual}
    />
  )
}
