'use client'

import {
  RelationshipPartyPicker,
  type RelationshipPartyPickerCompletionControls,
} from '@/components/tengsl/RelationshipPartyPicker'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import {
  EventNewGuestV2Schema,
  type EventNewGuestV2,
} from '@/lib/events/participant-identity-v2.contracts'
import { useState } from 'react'
import { useTranslations } from 'next-intl'

const UNSAFE_CONTROLS = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u

export type EventManualGuestResult =
  | { ok: true; label: string; input: EventNewGuestV2 }
  | { ok: false; error: 'invalid_name' | 'invalid_email' }

export function parseEventManualGuest(
  displayNameValue: string,
  emailValue = '',
): EventManualGuestResult {
  const displayName = displayNameValue.trim().normalize('NFC')
  if (!displayName || displayName.length > 120 || displayName.includes('@') || UNSAFE_CONTROLS.test(displayName)) {
    return { ok: false, error: 'invalid_name' }
  }
  const rawEmail = emailValue.trim()
  if (rawEmail) {
    const parsed = EventNewGuestV2Schema.safeParse({
      source_kind: 'manual_email',
      email: rawEmail,
      shared_display_name: displayName,
    })
    if (!parsed.success || parsed.data.source_kind !== 'manual_email') {
      return { ok: false, error: 'invalid_email' }
    }
    return {
      ok: true,
      label: displayName,
      input: parsed.data,
    }
  }
  return {
    ok: true,
    label: displayName,
    input: { source_kind: 'manual_name', display_name: displayName },
  }
}

function EventManualGuestFields({
  controls,
  onAdd,
}: {
  controls: RelationshipPartyPickerCompletionControls
  onAdd: (input: EventNewGuestV2, label: string) => boolean
}) {
  const t = useTranslations('teskeid.events')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')

  function submit() {
    const parsed = parseEventManualGuest(displayName, email)
    if (!parsed.ok) {
      controls.setError(t(parsed.error === 'invalid_email'
        ? 'picker.emailInvalid'
        : 'picker.guestNameInvalid'))
      return
    }
    controls.completeSelection({ accepted: onAdd(parsed.input, parsed.label) })
  }

  return (
    <div
      className="space-y-4"
      onKeyDown={(event) => {
        if (
          event.key === 'Enter'
          && event.target instanceof HTMLInputElement
          && !event.nativeEvent.isComposing
        ) {
          event.preventDefault()
          submit()
        }
      }}
    >
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t('picker.sharedNameLabel')}</span>
        <input
          className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={120}
          required
          placeholder={t('picker.sharedNamePlaceholder')}
        />
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{t('picker.sharedNameHint')}</span>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t('picker.emailOptionalLabel')}</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={320}
          placeholder={t('picker.emailPlaceholder')}
        />
      </label>
      <button
        type="button"
        onClick={submit}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {t('picker.addGuest')}
      </button>
    </div>
  )
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
  onAddManual: (input: EventNewGuestV2, label: string) => boolean
}) {
  const t = useTranslations('teskeid.events')

  function selectKnown(relationshipId: string): boolean {
    const option = options.find((candidate) => candidate.relationshipId === relationshipId)
    return option ? onAddKnown(option) : false
  }

  return (
    <RelationshipPartyPicker
      sources={[
        {
          id: 'known',
          type: 'options',
          label: t('picker.knownMode'),
          options: options.map((option) => ({
            id: option.relationshipId,
            primaryLabel: option.pickerLabel,
            searchAliases: [option.sharedLabel],
            customLabels: option.customLabels,
          })),
          excludedOptionIds: excludedRelationshipIds,
          optionsError,
          loadErrorLabel: t('picker.loadError'),
          searchLabel: t('picker.searchLabel'),
          searchPlaceholder: t('picker.searchPlaceholder'),
          filterLabel: t('picker.filterLabel'),
          allFilterLabel: t('picker.allFilterLabel'),
          noResultsLabel: t('picker.noResults'),
          onSelectOption: selectKnown,
        },
        {
          id: 'manual',
          type: 'custom',
          label: t('picker.guestMode'),
          render: (controls) => (
            <EventManualGuestFields controls={controls} onAdd={onAddManual} />
          ),
        },
      ]}
      disabled={disabled}
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
      }}
    />
  )
}
