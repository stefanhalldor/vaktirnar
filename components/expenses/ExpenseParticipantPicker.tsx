'use client'

import { useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Plus, X } from 'lucide-react'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'
import type { ExpenseParticipantOption } from '@/lib/expenses/contracts'
import type { RelationshipCircleOption } from '@/lib/relationships/types'
import { useExpenseTranslations } from './i18n.client'
import {
  expenseInputClass,
  expensePrimaryButtonClass,
  expenseSecondaryButtonClass,
} from './ui'

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
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'known' | 'manual'>(options.length > 0 || circles.length > 0 ? 'known' : 'manual')
  const [search, setSearch] = useState('')
  const [labelId, setLabelId] = useState<string | null>(null)
  const [manualValue, setManualValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const excluded = useMemo(() => new Set(excludedRelationshipIds), [excludedRelationshipIds])
  const availableOptions = options.filter((option) => !excluded.has(option.relationshipId))
  const hasKnownSources = availableOptions.length > 0 || (circles.length > 0 && Boolean(onSelectCircle))
  const labels = Array.from(new Map(
    availableOptions.flatMap((option) => option.customLabels ?? []).map((label) => [label.id, label]),
  ).values()).sort((left, right) => left.name.localeCompare(right.name))
  const normalizedSearch = search.trim().toLocaleLowerCase('is')
  const filteredOptions = availableOptions.filter((option) => (
    (!labelId || option.customLabels?.some((label) => label.id === labelId))
    && (!normalizedSearch || [
      option.pickerLabel,
      option.sharedLabel,
      ...(option.customLabels?.map((label) => label.name) ?? []),
    ].some((value) => value.toLocaleLowerCase('is').includes(normalizedSearch)))
  ))

  function reset() {
    setSearch('')
    setLabelId(null)
    setManualValue('')
    setError(null)
  }

  function addKnown(option: ExpenseParticipantOption) {
    if (onAddKnown(option)) {
      reset()
      setOpen(false)
    }
  }

  function addManual() {
    const participant = classifyManualExpenseParticipant(manualValue)
    if (!participant) {
      setError(t(manualValue.includes('@')
        ? 'expenseForm.participantEmailInvalid'
        : 'expenseForm.participantNameInvalid'))
      return
    }
    if (onAddManual(participant)) {
      reset()
      setOpen(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset() }}>
      <Dialog.Trigger asChild>
        <TeskeidActionButton type="button" variant="secondary" className="w-full" disabled={disabled}>
          <Plus aria-hidden size={18} />
          {triggerLabel ?? t('expenseForm.addParticipant')}
        </TeskeidActionButton>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-2xl bg-background p-5 shadow-xl focus:outline-none sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold">
                {dialogTitle ?? t('expenseForm.addParticipant')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                {dialogDescription ?? t('expenseForm.addParticipantDescription')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label={t('expenseForm.closeParticipantPicker')} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X aria-hidden size={20} />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2" role="group" aria-label={t('expenseForm.participantSource')}>
            <button type="button" className={mode === 'known' ? expensePrimaryButtonClass : expenseSecondaryButtonClass} disabled={!hasKnownSources} onClick={() => { setMode('known'); setError(null) }}>
              {t('expenseForm.knownParticipant')}
            </button>
            <button type="button" className={mode === 'manual' ? expensePrimaryButtonClass : expenseSecondaryButtonClass} onClick={() => { setMode('manual'); setError(null) }}>
              {t('expenseForm.nameOrEmail')}
            </button>
          </div>

          {optionsError ? <p className="mt-4 text-sm text-amber-800">{t('expenseForm.participantLoadError')}</p> : null}
          {error ? <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

          {mode === 'known' ? (
            <div className="mt-5 space-y-4">
              {circles.length > 0 && onSelectCircle ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('expenseForm.relationshipCircles')}</p>
                  <div className="grid gap-2">
                    {circles.map((circle) => (
                      <button key={circle.id} type="button" className="min-h-12 rounded-xl border border-border px-3 py-2 text-left hover:border-primary" onClick={() => { if (onSelectCircle(circle)) { reset(); setOpen(false) } }}>
                        <span className="block font-medium">{circle.name}</span>
                        <span className="block text-xs text-muted-foreground">{t('expenseForm.circleMemberCount', { count: circle.members.length })}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{t('expenseForm.searchKnownParticipant')}</span>
                <input className={expenseInputClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('expenseForm.searchKnownParticipantPlaceholder')} />
              </label>
              {labels.length > 0 ? <div className="flex flex-wrap gap-2" aria-label={t('expenseForm.filterKnownPeople')}>
                <button type="button" className={`min-h-10 rounded-full border px-3 text-sm ${labelId === null ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`} onClick={() => setLabelId(null)}>{t('expenseForm.allKnownPeople')}</button>
                {labels.map((label) => <button key={label.id} type="button" className={`min-h-10 rounded-full border px-3 text-sm ${labelId === label.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`} onClick={() => setLabelId(label.id)}>{label.name}</button>)}
              </div> : null}
              <div className="max-h-[40dvh] divide-y divide-border overflow-y-auto border-y border-border">
                {filteredOptions.map((option) => (
                  <button key={option.relationshipId} type="button" className="flex min-h-14 w-full items-center justify-between gap-3 px-1 py-3 text-left hover:bg-muted" onClick={() => addKnown(option)}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{option.pickerLabel}</span>
                      {(option.customLabels?.length ?? 0) > 0 ? <span className="mt-1 flex flex-wrap gap-1">{option.customLabels?.map((label) => <span key={label.id} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{label.name}</span>)}</span> : null}
                    </span>
                    <Plus aria-hidden size={18} className="shrink-0 text-primary" />
                  </button>
                ))}
                {filteredOptions.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{t('expenseForm.noKnownParticipantResults')}</p> : null}
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{t('expenseForm.nameOrEmail')}</span>
                <input className={expenseInputClass} value={manualValue} onChange={(event) => { setManualValue(event.target.value); setError(null) }} maxLength={320} autoComplete="off" placeholder={t('expenseForm.nameOrEmailPlaceholder')} />
              </label>
              <p className="text-xs leading-5 text-muted-foreground">{t('expenseForm.nameOrEmailHint')}</p>
              <button type="button" className={`${expensePrimaryButtonClass} w-full`} disabled={!manualValue.trim()} onClick={addManual}>
                {t('expenseForm.addParticipant')}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
