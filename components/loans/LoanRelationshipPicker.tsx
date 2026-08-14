'use client'

import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { RelationshipPartyPicker } from '@/components/tengsl/RelationshipPartyPicker'
import type { RelationshipRecipientOption } from '@/lib/relationships/actions'
import { getRelationshipDisplayName } from '@/lib/relationships/display-and-sort'

export type LoanCounterpartySelection =
  | { kind: 'email'; email: string; displayLabel: string }
  | { kind: 'name'; name: string; displayLabel: string }

function relationshipOptionName(option: RelationshipRecipientOption) {
  return getRelationshipDisplayName({
    privateDisplayName: option.privateDisplayName,
    counterpartDisplayName: option.selfDisplayName,
    email: option.email,
  })
}

export function parseLoanCounterpartyInput(value: string):
  | { selection: LoanCounterpartySelection }
  | { error: 'email' | 'name' } {
  const normalized = value.trim().normalize('NFC')
  if (!normalized) return { error: 'name' }
  if (normalized.includes('@')) {
    if (
      normalized.length > 320
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ) return { error: 'email' }
    const email = normalized.toLowerCase()
    return { selection: { kind: 'email', email, displayLabel: email } }
  }
  if (normalized.length > 120) return { error: 'name' }
  return { selection: { kind: 'name', name: normalized, displayLabel: normalized } }
}

export function LoanRelationshipPicker({
  options,
  optionsError = false,
  disabled = false,
  value,
  onChange,
}: {
  options: RelationshipRecipientOption[]
  optionsError?: boolean
  disabled?: boolean
  value: LoanCounterpartySelection | null
  onChange: (selection: LoanCounterpartySelection | null) => void
}) {
  const t = useTranslations('teskeid.loans')
  const pickerOptions = options.flatMap((option) => {
    const primaryLabel = relationshipOptionName(option)
    if (!option.email && !primaryLabel) return []
    return [{
      id: option.id,
      primaryLabel,
      secondaryLabel: option.email && primaryLabel !== option.email ? option.email : null,
      note: option.note,
      customLabels: option.customLabels,
    }]
  })

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{t('selectedCounterparty')}</p>
            <p className="truncate text-sm font-medium">{value.displayLabel}</p>
          </div>
          <button
            type="button"
            aria-label={t('removeCounterparty')}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <X aria-hidden size={18} />
          </button>
        </div>
      ) : null}
      <RelationshipPartyPicker
        options={pickerOptions}
        optionsError={optionsError}
        disabled={disabled}
        copy={{
          triggerLabel: value ? t('changeCounterparty') : t('counterpartyPickerTrigger'),
          title: t('counterpartyPickerTitle'),
          description: t('counterpartyPickerDescription'),
          closeLabel: t('closeRelationshipPicker'),
          searchLabel: t('searchLabel'),
          searchPlaceholder: t('relationshipPickerSearchPlaceholder'),
          filterLabel: t('relationshipLabelFilter'),
          allFilterLabel: t('allRelationshipLabels'),
          noResultsLabel: t('noSearchResults'),
          loadErrorLabel: t('counterpartyLoadError'),
          manual: {
            sourceLabel: t('counterpartyPickerSource'),
            knownModeLabel: t('counterpartyPickerKnownMode'),
            manualModeLabel: t('counterpartyPickerManualMode'),
            inputLabel: t('counterpartyPickerInputLabel'),
            inputPlaceholder: t('counterpartyPickerInputPlaceholder'),
            hint: t('counterpartyPickerHint'),
            submitLabel: t('counterpartyPickerSubmit'),
          },
        }}
        onSelectOption={(id) => {
          const option = options.find((candidate) => candidate.id === id)
          if (!option) return false
          const displayLabel = relationshipOptionName(option)
          if (option.email) {
            onChange({ kind: 'email', email: option.email, displayLabel })
            return true
          }
          if (!displayLabel) return false
          onChange({ kind: 'name', name: displayLabel.normalize('NFC').slice(0, 120), displayLabel })
          return true
        }}
        onSelectManual={(rawValue) => {
          const result = parseLoanCounterpartyInput(rawValue)
          if ('error' in result) {
            return {
              accepted: false,
              error: t(result.error === 'email' ? 'counterpartyEmailInvalid' : 'counterpartyNameInvalid'),
            }
          }
          onChange(result.selection)
          return { accepted: true }
        }}
      />
    </div>
  )
}
