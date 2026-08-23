'use client'

import { useEffect, useId, useRef, useState, type ReactNode, type Ref, type RefObject } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, Plus, X } from 'lucide-react'
import { TeskeidActionButton } from '@/components/teskeid/TeskeidActionButton'

export type RelationshipPartyPickerLabel = {
  id: string
  name: string
}

export type RelationshipPartyPickerOption = {
  id: string
  primaryLabel: string
  secondaryLabel?: string | null
  /** Controlled presentation state. The picker never changes this value itself. */
  selected?: boolean
  /** A present reason makes the option unavailable while keeping the reason visible. */
  disabledReason?: string | null
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
  optionControl?: 'action' | 'checkbox' | 'radio'
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
  render: (controls: RelationshipPartyPickerCompletionControls) => ReactNode
}

export type RelationshipPartyPickerCompletionControls = {
  completeSelection: (result: RelationshipPartyPickerSelectionResult) => void
  setError: (error: string | null) => void
}

export type RelationshipPartyPickerStatusAnnouncement = {
  sequence: number
  message: string
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
  initialFocusRef,
  onOpen,
  onDismiss,
  onSelectionClosed,
  statusAnnouncement,
  renderFooter,
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
  /** Optional active-source focus target. Falls back to a source control or close button. */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Starts an adapter-owned ephemeral session. */
  onOpen?: () => void
  /** Discards an adapter-owned session only after a user dismissal. */
  onDismiss?: () => void
  /** Runs from Radix's close boundary after an accepted selection closes the picker. */
  onSelectionClosed?: () => void
  /** One stable picker-wide polite live region; sequence re-announces repeated messages. */
  statusAnnouncement?: RelationshipPartyPickerStatusAnnouncement
  /** Shared confirmation/footer presentation; accepted completion uses the normal close boundary. */
  renderFooter?: (controls: RelationshipPartyPickerCompletionControls) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const pickerId = useId()
  const sourcePanelId = `${pickerId}-source-panel`
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const sourceButtonRefs = useRef(new Map<string, HTMLButtonElement>())
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

  const activeSourceControlId = configuredSources.length > 1 && activeSource
    ? `${pickerId}-source-${configuredSources.findIndex((source) => source.id === activeSource.id)}`
    : undefined

  return (
    <Dialog.Root open={open} onOpenChange={(next) => {
      if (next && !open) {
        selectionClosePendingRef.current = false
        onOpen?.()
      } else if (!next && open && !selectionClosePendingRef.current) {
        onDismiss?.()
      }
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
          onOpenAutoFocus={(event) => {
            const preferredTarget = initialFocusRef?.current
            const firstEnabledSource = configuredSources.find((source) => !source.disabled)
            const sourceTarget = firstEnabledSource
              ? sourceButtonRefs.current.get(firstEnabledSource.id)
              : undefined
            const target = preferredTarget?.isConnected && !preferredTarget.hasAttribute('disabled')
              ? preferredTarget
              : sourceTarget ?? closeButtonRef.current
            if (!target) return
            event.preventDefault()
            target.focus()
          }}
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
              <button ref={closeButtonRef} type="button" aria-label={copy.closeLabel} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
              {configuredSources.map((source, index) => (
                <button
                  key={source.id}
                  id={`${pickerId}-source-${index}`}
                  ref={(node) => {
                    if (node) sourceButtonRefs.current.set(source.id, node)
                    else sourceButtonRefs.current.delete(source.id)
                  }}
                  type="button"
                  className={`${activeSource?.id === source.id ? primaryButtonClass : secondaryButtonClass} min-w-0 whitespace-normal break-words px-2 leading-tight [overflow-wrap:anywhere]`}
                  disabled={source.disabled}
                  aria-pressed={activeSource?.id === source.id}
                  aria-controls={sourcePanelId}
                  onClick={() => changeSource(source.id)}
                >
                  {source.label}
                </button>
              ))}
            </div>
          ) : null}

          <div
            id={sourcePanelId}
            role={activeSourceControlId ? 'region' : undefined}
            aria-labelledby={activeSourceControlId}
          >
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
              <div
                className="divide-y divide-border border-y border-border"
                role={activeOptionsSource.optionControl === 'radio' ? 'radiogroup' : undefined}
                aria-label={activeOptionsSource.optionControl === 'radio' ? activeOptionsSource.label : undefined}
              >
                {filteredOptions.map((option, index) => {
                  const selected = option.selected === true
                  const disabledReason = option.disabledReason?.trim() || null
                  const disabled = disabledReason !== null
                  const reasonId = disabled ? `${sourcePanelId}-option-${index}-reason` : undefined
                  const optionContent = (
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-medium">{option.primaryLabel}</span>
                      {option.secondaryLabel ? <span className="mt-0.5 block break-all text-xs text-muted-foreground">{option.secondaryLabel}</span> : null}
                      {option.note ? <span className="mt-1 block break-words border-l-2 border-primary/20 pl-3 text-xs text-muted-foreground">{option.note}</span> : null}
                      {(option.customLabels?.length ?? 0) > 0 ? <span className="mt-1 flex flex-wrap gap-1">{option.customLabels?.map((label) => <span key={label.id} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{label.name}</span>)}</span> : null}
                      {disabledReason ? <span id={reasonId} className="mt-1 block text-xs text-muted-foreground">{disabledReason}</span> : null}
                    </span>
                  )
                  if (activeOptionsSource.optionControl === 'checkbox' || activeOptionsSource.optionControl === 'radio') {
                    return (
                      <label key={option.id} className={`flex min-h-14 w-full items-center justify-between gap-3 px-1 py-3 text-left ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-muted'}`}>
                        {optionContent}
                        <input
                          type={activeOptionsSource.optionControl}
                          name={activeOptionsSource.optionControl === 'radio' ? `${sourcePanelId}-options` : undefined}
                          checked={selected}
                          aria-disabled={disabled || undefined}
                          aria-describedby={reasonId}
                          className="size-5 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={(event) => {
                            if (disabled) event.preventDefault()
                          }}
                          onChange={() => {
                            if (!disabled) completeSelection(activeOptionsSource.onSelectOption(option.id))
                          }}
                        />
                      </label>
                    )
                  }
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`flex min-h-14 w-full items-center justify-between gap-3 px-1 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-muted'}`}
                      aria-pressed={option.selected === undefined ? undefined : selected}
                      aria-disabled={disabled || undefined}
                      aria-describedby={reasonId}
                      onClick={() => {
                        if (!disabled) completeSelection(activeOptionsSource.onSelectOption(option.id))
                      }}
                    >
                      {optionContent}
                      {selected
                        ? <Check aria-hidden size={18} className="shrink-0 text-primary" />
                        : <Plus aria-hidden size={18} className="shrink-0 text-primary" />}
                    </button>
                  )
                })}
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
          </div>

          {statusAnnouncement ? (
            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              <span key={statusAnnouncement.sequence}>{statusAnnouncement.message}</span>
            </p>
          ) : null}

          {renderFooter ? (
            <div className="mt-5">
              {renderFooter({ completeSelection, setError })}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
