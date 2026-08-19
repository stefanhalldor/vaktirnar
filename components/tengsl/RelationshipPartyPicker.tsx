'use client'

import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
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

export type RelationshipPartyPickerSelectionResult = {
  accepted: boolean
  error?: string
  behavior?: 'close' | 'stay-open'
}

export type RelationshipPartyPickerManualResult = RelationshipPartyPickerSelectionResult

type RelationshipPartyPickerSourceBase = {
  id: string
  label: string
  disabled?: boolean
}

export type RelationshipPartyPickerOptionsSource = RelationshipPartyPickerSourceBase & {
  type: 'options'
  options: RelationshipPartyPickerOption[]
  excludedOptionIds?: string[]
  optionsError?: boolean
  circles?: RelationshipPartyPickerCircle[]
  loadErrorLabel?: string
  circleSectionLabel?: string
  searchLabel: string
  searchPlaceholder: string
  filterLabel: string
  allFilterLabel: string
  noResultsLabel: string
  pagination?: {
    pageKey?: string | number
    hasPrevious: boolean
    hasNext: boolean
    pending: boolean
    previousLabel: string
    nextLabel: string
    loadingLabel: string
    onPrevious: () => void
    onNext: () => void
  }
  onSelectOption: (id: string) => boolean | RelationshipPartyPickerSelectionResult
  onSelectCircle?: (id: string) => boolean | RelationshipPartyPickerSelectionResult
}

export type RelationshipPartyPickerManualSource = RelationshipPartyPickerSourceBase & {
  type: 'manual'
  inputLabel: string
  inputPlaceholder: string
  hint: string
  submitLabel: string
  inputMaxLength?: number
  onSelect: (value: string) => RelationshipPartyPickerSelectionResult
}

export type RelationshipPartyPickerCustomSource = RelationshipPartyPickerSourceBase & {
  type: 'custom'
  render: (controls: {
    completeSelection: (result: RelationshipPartyPickerSelectionResult) => void
    setError: (error: string | null) => void
  }) => ReactNode
}

export type RelationshipPartyPickerSource =
  | RelationshipPartyPickerOptionsSource
  | RelationshipPartyPickerManualSource
  | RelationshipPartyPickerCustomSource

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
  sourceLabel?: string
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
  options = [],
  excludedOptionIds = [],
  optionsError = false,
  circles = [],
  disabled = false,
  manualInputMaxLength = 320,
  copy,
  onSelectOption,
  onSelectManual,
  onSelectCircle,
  sources,
  initialSourceId,
  helperText,
  triggerRef,
  onSelectionClosed,
}: {
  options?: RelationshipPartyPickerOption[]
  excludedOptionIds?: string[]
  optionsError?: boolean
  circles?: RelationshipPartyPickerCircle[]
  disabled?: boolean
  /** Presentation limit only. Domain adapters remain responsible for validation. */
  manualInputMaxLength?: number
  copy: RelationshipPartyPickerCopy
  /** Returns only the stable option ID; domain adapters resolve the authoritative value. */
  onSelectOption?: (id: string) => boolean
  /** Returns only the raw input; domain adapters own parsing and payload semantics. */
  onSelectManual?: (value: string) => RelationshipPartyPickerManualResult
  /** Returns only the stable circle ID; domain adapters resolve the circle. */
  onSelectCircle?: (id: string) => boolean
  /** Domain-neutral source configuration. Legacy known/manual props remain supported. */
  sources?: RelationshipPartyPickerSource[]
  initialSourceId?: string
  /** Optional adapter-provided context shown for every configured source. */
  helperText?: ReactNode
  /** Allows a following domain sheet to restore focus to the picker trigger. */
  triggerRef?: Ref<HTMLButtonElement>
  /** Runs from Radix's close boundary after an accepted selection closes the picker. */
  onSelectionClosed?: () => void
}) {
  const [open, setOpen] = useState(false)
  const selectionClosePendingRef = useRef(false)
  const legacyHasKnownSources = options.length > 0 || circles.length > 0
  const configuredSources: RelationshipPartyPickerSource[] = sources ?? [
    {
      id: 'known',
      label: copy.manual?.knownModeLabel ?? copy.title,
      type: 'options',
      options,
      excludedOptionIds,
      optionsError,
      circles,
      disabled: Boolean(onSelectManual) && !legacyHasKnownSources,
      loadErrorLabel: copy.loadErrorLabel,
      circleSectionLabel: copy.circleSectionLabel,
      searchLabel: copy.searchLabel,
      searchPlaceholder: copy.searchPlaceholder,
      filterLabel: copy.filterLabel,
      allFilterLabel: copy.allFilterLabel,
      noResultsLabel: copy.noResultsLabel,
      onSelectOption: (id) => onSelectOption?.(id) ?? false,
      onSelectCircle,
    },
    ...(copy.manual && onSelectManual ? [{
      id: 'manual',
      label: copy.manual.manualModeLabel,
      type: 'manual' as const,
      inputLabel: copy.manual.inputLabel,
      inputPlaceholder: copy.manual.inputPlaceholder,
      hint: copy.manual.hint,
      submitLabel: copy.manual.submitLabel,
      inputMaxLength: manualInputMaxLength,
      onSelect: onSelectManual,
    }] : []),
  ]
  const firstEnabledSourceId = configuredSources.find((source) => !source.disabled)?.id
    ?? configuredSources[0]?.id
    ?? ''
  const requestedInitialSourceId = configuredSources.some((source) => (
    source.id === initialSourceId && !source.disabled
  )) ? initialSourceId! : firstEnabledSourceId
  const [sourceId, setSourceId] = useState(requestedInitialSourceId)
  const [search, setSearch] = useState('')
  const [labelId, setLabelId] = useState<string | null>(null)
  const [manualValue, setManualValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const activeSource = configuredSources.find((source) => source.id === sourceId)
    ?? configuredSources.find((source) => !source.disabled)
    ?? configuredSources[0]
  const activeOptionsSource = activeSource?.type === 'options' ? activeSource : null
  const activeManualSource = activeSource?.type === 'manual' ? activeSource : null
  const visibleOptionsError = Boolean(activeOptionsSource?.optionsError)
    || (sources === undefined && optionsError)
  const visibleOptionsErrorLabel = activeOptionsSource?.loadErrorLabel ?? copy.loadErrorLabel
  const activeOptions = activeOptionsSource?.options ?? []
  const excluded = new Set(activeOptionsSource?.excludedOptionIds ?? [])
  const availableOptions = activeOptions.filter((option) => !excluded.has(option.id))
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

  useEffect(() => {
    setSearch('')
    setLabelId(null)
    setError(null)
  }, [activeOptionsSource?.pagination?.pageKey])

  function reset() {
    setSearch('')
    setLabelId(null)
    setManualValue('')
    setError(null)
  }

  function completeSelection(result: boolean | RelationshipPartyPickerSelectionResult) {
    const normalized = typeof result === 'boolean' ? { accepted: result } : result
    if (!normalized.accepted) {
      setError(normalized.error ?? null)
      return
    }
    setError(null)
    if (normalized.behavior === 'stay-open') return
    selectionClosePendingRef.current = true
    reset()
    setOpen(false)
  }

  function selectManual() {
    if (!activeManualSource) return
    completeSelection(activeManualSource.onSelect(manualValue))
  }

  function changeSource(nextSourceId: string) {
    const nextSource = configuredSources.find((source) => source.id === nextSourceId)
    if (!nextSource || nextSource.disabled) return
    setSourceId(nextSourceId)
    reset()
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => {
      if (!next && open) selectionClosePendingRef.current = false
      setOpen(next)
      if (next) setSourceId(requestedInitialSourceId)
      else reset()
    }}>
      <Dialog.Trigger asChild>
        <TeskeidActionButton ref={triggerRef} type="button" variant="secondary" className="w-full" disabled={disabled}>
          <Plus aria-hidden size={18} />
          {copy.triggerLabel}
        </TeskeidActionButton>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content
          className="fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-t-2xl bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl focus:outline-none sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-5"
          onCloseAutoFocus={(event) => {
            if (!selectionClosePendingRef.current) return
            selectionClosePendingRef.current = false
            if (!onSelectionClosed) return
            event.preventDefault()
            onSelectionClosed()
          }}
        >
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

          {helperText ? (
            <div className="mt-4 rounded-xl bg-muted p-3 text-sm leading-6 text-muted-foreground">
              {helperText}
            </div>
          ) : null}

          {configuredSources.length > 1 ? (
            <div
              className="mt-5 grid gap-2"
              style={{ gridTemplateColumns: `repeat(${configuredSources.length}, minmax(0, 1fr))` }}
              role="group"
              aria-label={copy.sourceLabel ?? copy.manual?.sourceLabel ?? copy.title}
            >
              {configuredSources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  className={`${activeSource?.id === source.id ? primaryButtonClass : secondaryButtonClass} min-w-0 whitespace-normal px-2 leading-tight`}
                  disabled={source.disabled}
                  aria-pressed={activeSource?.id === source.id}
                  onClick={() => changeSource(source.id)}
                >
                  {source.label}
                </button>
              ))}
            </div>
          ) : null}

          {visibleOptionsError && visibleOptionsErrorLabel ? <p className="mt-4 text-sm text-amber-800">{visibleOptionsErrorLabel}</p> : null}
          {error ? <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

          {activeOptionsSource ? (
            <div className="mt-5 space-y-4">
              {(activeOptionsSource.circles?.length ?? 0) > 0 && activeOptionsSource.onSelectCircle && activeOptionsSource.circleSectionLabel ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{activeOptionsSource.circleSectionLabel}</p>
                  <div className="grid gap-2">
                    {activeOptionsSource.circles?.map((circle) => (
                      <button key={circle.id} type="button" className="min-h-12 rounded-xl border border-border px-3 py-2 text-left hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => completeSelection(activeOptionsSource.onSelectCircle!(circle.id))}>
                        <span className="block font-medium">{circle.primaryLabel}</span>
                        {circle.secondaryLabel ? <span className="block text-xs text-muted-foreground">{circle.secondaryLabel}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{activeOptionsSource.searchLabel}</span>
                <input className={inputClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeOptionsSource.searchPlaceholder} />
              </label>
              {labels.length > 0 ? <div className="flex flex-wrap gap-2" aria-label={activeOptionsSource.filterLabel}>
                <button type="button" className={`min-h-10 rounded-full border px-3 text-sm ${labelId === null ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`} onClick={() => setLabelId(null)}>{activeOptionsSource.allFilterLabel}</button>
                {labels.map((label) => <button key={label.id} type="button" className={`min-h-10 rounded-full border px-3 text-sm ${labelId === label.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`} onClick={() => setLabelId(label.id)}>{label.name}</button>)}
              </div> : null}
              <div className="max-h-[40dvh] divide-y divide-border overflow-y-auto border-y border-border">
                {filteredOptions.map((option) => (
                  <button key={option.id} type="button" className="flex min-h-14 w-full items-center justify-between gap-3 px-1 py-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onClick={() => completeSelection(activeOptionsSource.onSelectOption(option.id))}>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{option.primaryLabel}</span>
                      {option.secondaryLabel ? <span className="mt-0.5 block break-all text-xs text-muted-foreground">{option.secondaryLabel}</span> : null}
                      {option.note ? <span className="mt-1 block break-words border-l-2 border-primary/20 pl-3 text-xs text-muted-foreground">{option.note}</span> : null}
                      {(option.customLabels?.length ?? 0) > 0 ? <span className="mt-1 flex flex-wrap gap-1">{option.customLabels?.map((label) => <span key={label.id} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{label.name}</span>)}</span> : null}
                    </span>
                    <Plus aria-hidden size={18} className="shrink-0 text-primary" />
                  </button>
                ))}
                {filteredOptions.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{activeOptionsSource.noResultsLabel}</p> : null}
              </div>
              {activeOptionsSource.pagination
                && (activeOptionsSource.pagination.hasPrevious || activeOptionsSource.pagination.hasNext) ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      disabled={!activeOptionsSource.pagination.hasPrevious || activeOptionsSource.pagination.pending}
                      aria-busy={activeOptionsSource.pagination.pending || undefined}
                      onClick={activeOptionsSource.pagination.onPrevious}
                    >
                      {activeOptionsSource.pagination.pending
                        ? activeOptionsSource.pagination.loadingLabel
                        : activeOptionsSource.pagination.previousLabel}
                    </button>
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      disabled={!activeOptionsSource.pagination.hasNext || activeOptionsSource.pagination.pending}
                      aria-busy={activeOptionsSource.pagination.pending || undefined}
                      onClick={activeOptionsSource.pagination.onNext}
                    >
                      {activeOptionsSource.pagination.pending
                        ? activeOptionsSource.pagination.loadingLabel
                        : activeOptionsSource.pagination.nextLabel}
                    </button>
                  </div>
                ) : null}
            </div>
          ) : activeManualSource ? (
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{activeManualSource.inputLabel}</span>
                <input className={inputClass} value={manualValue} onChange={(event) => { setManualValue(event.target.value); setError(null) }} maxLength={activeManualSource.inputMaxLength ?? 320} autoComplete="off" placeholder={activeManualSource.inputPlaceholder} />
              </label>
              <p className="text-xs leading-5 text-muted-foreground">{activeManualSource.hint}</p>
              <button type="button" className={`${primaryButtonClass} w-full`} disabled={!manualValue.trim()} onClick={selectManual}>
                {activeManualSource.submitLabel}
              </button>
            </div>
          ) : activeSource?.type === 'custom' ? (
            <div className="mt-5">
              {activeSource.render({ completeSelection, setError })}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
