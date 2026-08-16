'use client'

import { useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Plus, X } from 'lucide-react'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'

export type RelationshipPartyPickerLabel = {
  id: string
  name: string
}

export type RelationshipPartyPickerOption = {
  id: string
  primaryLabel: string
  secondaryLabel?: string | null
  /** Owner-private presentation only. This value is never returned from the picker. */
  note?: string | null
  /** Safe, non-rendered search terms. These values are never returned from the picker. */
  searchAliases?: string[]
  customLabels?: RelationshipPartyPickerLabel[]
}

export type RelationshipPartyPickerCircle = {
  id: string
  primaryLabel: string
  secondaryLabel?: string | null
}

export type RelationshipPartyPickerManualResult = {
  accepted: boolean
  error?: string
}

export type RelationshipPartyPickerCopy = {
  triggerLabel: string
  title: string
  description: string
  closeLabel: string
  searchLabel: string
  searchPlaceholder: string
  filterLabel: string
  allFilterLabel: string
  noResultsLabel: string
  loadErrorLabel?: string
  circleSectionLabel?: string
  manual?: {
    sourceLabel: string
    knownModeLabel: string
    manualModeLabel: string
    inputLabel: string
    inputPlaceholder: string
    hint: string
    submitLabel: string
  }
}

const inputClass =
  'min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60'

const primaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60'

const secondaryButtonClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60'

export function RelationshipPartyPicker({
  options,
  excludedOptionIds = [],
  optionsError = false,
  circles = [],
  disabled = false,
  manualInputMaxLength = 320,
  copy,
  onSelectOption,
  onSelectManual,
  onSelectCircle,
}: {
  options: RelationshipPartyPickerOption[]
  excludedOptionIds?: string[]
  optionsError?: boolean
  circles?: RelationshipPartyPickerCircle[]
  disabled?: boolean
  /** Presentation limit only. Domain adapters remain responsible for validation. */
  manualInputMaxLength?: number
  copy: RelationshipPartyPickerCopy
  /** Returns only the stable option ID; domain adapters resolve the authoritative value. */
  onSelectOption: (id: string) => boolean
  /** Returns only the raw input; domain adapters own parsing and payload semantics. */
  onSelectManual?: (value: string) => RelationshipPartyPickerManualResult
  /** Returns only the stable circle ID; domain adapters resolve the circle. */
  onSelectCircle?: (id: string) => boolean
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'known' | 'manual'>(
    options.length > 0 || circles.length > 0 || !onSelectManual ? 'known' : 'manual',
  )
  const [search, setSearch] = useState('')
  const [labelId, setLabelId] = useState<string | null>(null)
  const [manualValue, setManualValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const excluded = useMemo(() => new Set(excludedOptionIds), [excludedOptionIds])
  const availableOptions = options.filter((option) => !excluded.has(option.id))
  const hasKnownSources = availableOptions.length > 0 || (circles.length > 0 && Boolean(onSelectCircle))
  const labels = Array.from(new Map(
    availableOptions
      .flatMap((option) => option.customLabels ?? [])
      .map((label) => [label.id, label]),
  ).values()).sort((left, right) => left.name.localeCompare(right.name))
  const normalizedSearch = search.trim().toLocaleLowerCase('is')
  const filteredOptions = availableOptions.filter((option) => (
    (!labelId || option.customLabels?.some((label) => label.id === labelId))
    && (!normalizedSearch || [
      option.primaryLabel,
      option.secondaryLabel ?? '',
      option.note ?? '',
      ...(option.searchAliases ?? []),
      ...(option.customLabels?.map((label) => label.name) ?? []),
    ].some((value) => value.toLocaleLowerCase('is').includes(normalizedSearch)))
  ))

  function reset() {
    setSearch('')
    setLabelId(null)
    setManualValue('')
    setError(null)
  }

  function closeAfterSuccess(accepted: boolean) {
    if (!accepted) return
    reset()
    setOpen(false)
  }

  function selectManual() {
    if (!onSelectManual) return
    const result = onSelectManual(manualValue)
    if (!result.accepted) {
      setError(result.error ?? null)
      return
    }
    closeAfterSuccess(true)
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset() }}>
      <Dialog.Trigger asChild>
        <TeskeidActionButton type="button" variant="secondary" className="w-full" disabled={disabled}>
          <Plus aria-hidden size={18} />
          {copy.triggerLabel}
        </TeskeidActionButton>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-2xl bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl focus:outline-none sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold">
                {copy.title}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-6 text-muted-foreground">
                {copy.description}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label={copy.closeLabel} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X aria-hidden size={20} />
              </button>
            </Dialog.Close>
          </div>

          {copy.manual && onSelectManual ? (
            <div className="mt-5 grid grid-cols-2 gap-2" role="group" aria-label={copy.manual.sourceLabel}>
              <button type="button" className={mode === 'known' ? primaryButtonClass : secondaryButtonClass} disabled={!hasKnownSources} onClick={() => { setMode('known'); setError(null) }}>
                {copy.manual.knownModeLabel}
              </button>
              <button type="button" className={mode === 'manual' ? primaryButtonClass : secondaryButtonClass} onClick={() => { setMode('manual'); setError(null) }}>
                {copy.manual.manualModeLabel}
              </button>
            </div>
          ) : null}

          {optionsError && copy.loadErrorLabel ? <p className="mt-4 text-sm text-amber-800">{copy.loadErrorLabel}</p> : null}
          {error ? <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

          {mode === 'known' ? (
            <div className="mt-5 space-y-4">
              {circles.length > 0 && onSelectCircle && copy.circleSectionLabel ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{copy.circleSectionLabel}</p>
                  <div className="grid gap-2">
                    {circles.map((circle) => (
                      <button key={circle.id} type="button" className="min-h-12 rounded-xl border border-border px-3 py-2 text-left hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => closeAfterSuccess(onSelectCircle(circle.id))}>
                        <span className="block font-medium">{circle.primaryLabel}</span>
                        {circle.secondaryLabel ? <span className="block text-xs text-muted-foreground">{circle.secondaryLabel}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{copy.searchLabel}</span>
                <input className={inputClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.searchPlaceholder} />
              </label>
              {labels.length > 0 ? <div className="flex flex-wrap gap-2" aria-label={copy.filterLabel}>
                <button type="button" className={`min-h-10 rounded-full border px-3 text-sm ${labelId === null ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`} onClick={() => setLabelId(null)}>{copy.allFilterLabel}</button>
                {labels.map((label) => <button key={label.id} type="button" className={`min-h-10 rounded-full border px-3 text-sm ${labelId === label.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`} onClick={() => setLabelId(label.id)}>{label.name}</button>)}
              </div> : null}
              <div className="max-h-[40dvh] divide-y divide-border overflow-y-auto border-y border-border">
                {filteredOptions.map((option) => (
                  <button key={option.id} type="button" className="flex min-h-14 w-full items-center justify-between gap-3 px-1 py-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onClick={() => closeAfterSuccess(onSelectOption(option.id))}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{option.primaryLabel}</span>
                      {option.secondaryLabel ? <span className="mt-0.5 block break-all text-xs text-muted-foreground">{option.secondaryLabel}</span> : null}
                      {option.note ? <span className="mt-1 block break-words border-l-2 border-primary/20 pl-3 text-xs text-muted-foreground">{option.note}</span> : null}
                      {(option.customLabels?.length ?? 0) > 0 ? <span className="mt-1 flex flex-wrap gap-1">{option.customLabels?.map((label) => <span key={label.id} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{label.name}</span>)}</span> : null}
                    </span>
                    <Plus aria-hidden size={18} className="shrink-0 text-primary" />
                  </button>
                ))}
                {filteredOptions.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{copy.noResultsLabel}</p> : null}
              </div>
            </div>
          ) : copy.manual && onSelectManual ? (
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{copy.manual.inputLabel}</span>
                <input className={inputClass} value={manualValue} onChange={(event) => { setManualValue(event.target.value); setError(null) }} maxLength={manualInputMaxLength} autoComplete="off" placeholder={copy.manual.inputPlaceholder} />
              </label>
              <p className="text-xs leading-5 text-muted-foreground">{copy.manual.hint}</p>
              <button type="button" className={`${primaryButtonClass} w-full`} disabled={!manualValue.trim()} onClick={selectManual}>
                {copy.manual.submitLabel}
              </button>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
