'use client'

import { useState, useId, useEffect } from 'react'
import type { ResolvedTravelThresholds } from '@/lib/weather/types'

// ── Public contract ─────────────────────────────────────────────────────────

export interface WeatherThresholdBarLabels {
  /** E.g. "Veðurmörk" */
  title: string
  /** E.g. "Óþægilegt" */
  cautionLabel: string
  /** E.g. "Hættulegt" */
  dangerLabel: string
  /** E.g. "m/s" */
  unit: string
  /** E.g. "Setja" */
  applyLabel: string
  /** E.g. "Endurstilla" */
  resetLabel: string
  /** E.g. "Breyta" */
  editLabel: string
  /** E.g. "Loka" */
  closeLabel: string
  /** Validation error when caution >= danger */
  orderingError: string
}

interface WeatherThresholdBarProps {
  thresholds: ResolvedTravelThresholds
  /** True when overrides differ from defaults — used to show a "reset" affordance. */
  hasOverrides: boolean
  onApply: (overrides: { cautionWindMs: number; redWindMs: number }) => void
  onReset: () => void
  labels: WeatherThresholdBarLabels
  /**
   * When true, the edit panel is always visible — no Breyta/Loka toggle.
   * Use this for inline controls that should be immediately visible without a click.
   * Draft values sync to the active thresholds whenever they change externally
   * (e.g. after Reset), so the inputs always reflect the current applied state.
   */
  alwaysOpen?: boolean
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Shared weather-threshold control for /vedrid overview and /vedrid/ferdalagid.
 *
 * Collapsible mode (default): shows current cautionWindMs / redWindMs inline,
 * with a "Breyta" link that opens an inline edit panel.
 *
 * Always-open mode (alwaysOpen=true): edit panel is always visible without a toggle.
 * Use this for inline controls where thresholds should be immediately editable.
 *
 * In both modes: text-base inputs (>=16px) prevent iOS/Safari zoom on focus.
 * Input IDs are generated with useId() so multiple instances can coexist on a page.
 * Labels are passed as props so the component is provider- and namespace-neutral.
 *
 * Mobile-first: 2-column grid, text-base inputs, no horizontal overflow.
 */
export function WeatherThresholdBar({
  thresholds,
  hasOverrides,
  onApply,
  onReset,
  labels,
  alwaysOpen = false,
}: WeatherThresholdBarProps) {
  const uid = useId()
  const cautionId = `${uid}-caution-wind`
  const dangerId = `${uid}-danger-wind`

  const [open, setOpen] = useState(false)
  const [draftCaution, setDraftCaution] = useState(
    alwaysOpen ? String(thresholds.cautionWindMs) : '',
  )
  const [draftDanger, setDraftDanger] = useState(
    alwaysOpen ? String(thresholds.redWindMs) : '',
  )
  const [error, setError] = useState<string | null>(null)

  // In alwaysOpen mode, sync draft inputs when the applied thresholds change
  // externally (e.g. after Reset or a server-loaded preference update).
  useEffect(() => {
    if (!alwaysOpen) return
    setDraftCaution(String(thresholds.cautionWindMs))
    setDraftDanger(String(thresholds.redWindMs))
    setError(null)
  }, [alwaysOpen, thresholds.cautionWindMs, thresholds.redWindMs])

  function handleOpen() {
    setDraftCaution(String(thresholds.cautionWindMs))
    setDraftDanger(String(thresholds.redWindMs))
    setError(null)
    setOpen(true)
  }

  function handleClose() {
    setOpen(false)
    setError(null)
  }

  function handleApply() {
    const caution = parseFloat(draftCaution)
    const danger = parseFloat(draftDanger)
    if (!Number.isFinite(caution) || !Number.isFinite(danger) || caution <= 0 || danger <= 0) {
      setError(labels.orderingError)
      return
    }
    if (caution >= danger) {
      setError(labels.orderingError)
      return
    }
    onApply({ cautionWindMs: caution, redWindMs: danger })
    if (!alwaysOpen) setOpen(false)
    setError(null)
  }

  function handleReset() {
    onReset()
    if (!alwaysOpen) setOpen(false)
    setError(null)
  }

  // ── Always-open variant ───────────────────────────────────────────────────

  if (alwaysOpen) {
    return (
      <div className="flex flex-col gap-2 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <ThresholdInput
            id={cautionId}
            label={labels.cautionLabel}
            unit={labels.unit}
            value={draftCaution}
            onChange={(v) => {
              setDraftCaution(v)
              setError(null)
              const caution = parseFloat(v)
              const danger = parseFloat(draftDanger)
              if (Number.isFinite(caution) && Number.isFinite(danger) && caution > 0 && danger > 0 && caution < danger) {
                onApply({ cautionWindMs: caution, redWindMs: danger })
              }
            }}
          />
          <ThresholdInput
            id={dangerId}
            label={labels.dangerLabel}
            unit={labels.unit}
            value={draftDanger}
            onChange={(v) => {
              setDraftDanger(v)
              setError(null)
              const caution = parseFloat(draftCaution)
              const danger = parseFloat(v)
              if (Number.isFinite(caution) && Number.isFinite(danger) && caution > 0 && danger > 0 && caution < danger) {
                onApply({ cautionWindMs: caution, redWindMs: danger })
              }
            }}
          />
        </div>
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
        <div className="flex items-center gap-3">
          {hasOverrides && (
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            >
              {labels.resetLabel}
            </button>
          )}
          <button
            type="button"
            onClick={handleApply}
            className="ml-auto text-xs font-medium px-3 py-1.5 rounded-full border border-border hover:bg-foreground/5 active:bg-foreground/10 transition-colors"
          >
            {labels.applyLabel}
          </button>
        </div>
      </div>
    )
  }

  // ── Collapsible variant (default) ─────────────────────────────────────────

  return (
    <div className="flex flex-col gap-2 text-xs">
      {/* Summary bar */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-muted-foreground shrink-0">{labels.title}:</span>
        <span className="text-muted-foreground shrink-0">
          {labels.cautionLabel} <span className="font-medium text-foreground">{thresholds.cautionWindMs} {labels.unit}</span>
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-muted-foreground shrink-0">
          {labels.dangerLabel} <span className="font-medium text-foreground">{thresholds.redWindMs} {labels.unit}</span>
        </span>
        {!open && (
          <button
            type="button"
            onClick={handleOpen}
            className="ml-auto text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors shrink-0"
          >
            {labels.editLabel}
          </button>
        )}
        {open && (
          <button
            type="button"
            onClick={handleClose}
            className="ml-auto text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors shrink-0"
          >
            {labels.closeLabel}
          </button>
        )}
      </div>

      {/* Edit panel */}
      {open && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-border/60 bg-card px-3 py-2.5">
          <div className="grid grid-cols-2 gap-3">
            <ThresholdInput
              id={cautionId}
              label={labels.cautionLabel}
              unit={labels.unit}
              value={draftCaution}
              onChange={setDraftCaution}
            />
            <ThresholdInput
              id={dangerId}
              label={labels.dangerLabel}
              unit={labels.unit}
              value={draftDanger}
              onChange={setDraftDanger}
            />
          </div>
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <div className="flex items-center gap-3">
            {hasOverrides && (
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
              >
                {labels.resetLabel}
              </button>
            )}
            <button
              type="button"
              onClick={handleApply}
              className="ml-auto text-xs font-medium px-3 py-1.5 rounded-full border border-border hover:bg-foreground/5 active:bg-foreground/10 transition-colors"
            >
              {labels.applyLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Internal input ───────────────────────────────────────────────────────────

function ThresholdInput({
  id,
  label,
  unit,
  value,
  onChange,
}: {
  id: string
  label: string
  unit: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={1}
          max={99}
          step={1}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <span className="text-xs text-muted-foreground shrink-0">{unit}</span>
      </div>
    </div>
  )
}
