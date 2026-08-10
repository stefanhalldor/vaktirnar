'use client'

import { useMemo, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { TeskeidNumberField } from '@/components/teskeid/TeskeidNumberField'
import { validateIntegerDraft } from '@/lib/forms/numeric-draft'
import type { QuestionBankDraft, QuestionBankItem } from '@/lib/kviss/authoring'
import {
  kvissInputClass,
  kvissPrimaryButtonClass,
  kvissSecondaryButtonClass,
} from './formStyles'

const OPTION_SLOTS = 4

export function KvissQuestionEditor({
  item,
  sortOrder,
  onSave,
  onCancel,
  pending,
  saving,
}: {
  item: QuestionBankItem | null
  sortOrder: number
  onSave(draft: QuestionBankDraft): void
  onCancel(): void
  pending: boolean
  saving: boolean
}) {
  const t = useTranslations('kviss')
  const [text, setText] = useState(item?.text ?? '')
  const [options, setOptions] = useState(() =>
    Array.from({ length: OPTION_SLOTS }, (_, index) => item?.options[index] ?? ''),
  )
  const [correctSlots, setCorrectSlots] = useState<number[]>(() => item?.correctOptionIndices ?? [])
  const [durationDraft, setDurationDraft] = useState(String(item?.durationSeconds ?? 20))
  const [pointWeightDraft, setPointWeightDraft] = useState(String(item?.pointWeight ?? 1))
  const [confidenceMode, setConfidenceMode] = useState(item?.confidenceMode ?? false)

  const durationValidation = validateIntegerDraft(durationDraft, { required: true, min: 5 })
  const pointWeightValidation = validateIntegerDraft(pointWeightDraft, { required: true, min: 1 })
  const normalized = useMemo(() => {
    const normalizedOptions: string[] = []
    const correctOptionIndices: number[] = []
    options.forEach((option, slotIndex) => {
      const cleanOption = option.trim()
      if (!cleanOption) return
      const normalizedIndex = normalizedOptions.length
      normalizedOptions.push(cleanOption)
      if (correctSlots.includes(slotIndex)) correctOptionIndices.push(normalizedIndex)
    })
    return { options: normalizedOptions, correctOptionIndices }
  }, [correctSlots, options])

  const hasQuestionContent = text.trim().length > 0
    || options.some((option) => option.trim().length > 0)
    || correctSlots.length > 0
  const canSave = text.trim().length > 0
    && normalized.options.length >= 2
    && normalized.correctOptionIndices.length > 0
    && durationValidation.valid
    && durationValidation.value !== null
    && pointWeightValidation.valid
    && pointWeightValidation.value !== null

  const numericError = (
    validation: typeof durationValidation,
    minimum: number,
  ): string | undefined => {
    if (validation.valid) return undefined
    return t(`numberError_${validation.error}`, { limit: minimum })
  }

  const submit = () => {
    if (
      !canSave
      || !durationValidation.valid
      || durationValidation.value === null
      || !pointWeightValidation.valid
      || pointWeightValidation.value === null
    ) return
    onSave({
      text: text.trim(),
      options: normalized.options,
      correctOptionIndices: normalized.correctOptionIndices,
      durationSeconds: durationValidation.value,
      pointWeight: pointWeightValidation.value,
      confidenceMode,
      sortOrder: item?.sortOrder ?? sortOrder,
    })
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-primary">
        {t(item ? 'editBankQuestion' : 'newBankQuestion')}
      </h2>
      {item ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {t('questionRevision', { count: item.revision })}
        </p>
      ) : null}
      <div className="mt-4 grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium">
          {t('questionTextLabel')}
          <input
            className={kvissInputClass}
            value={text}
            autoFocus={item !== null}
            disabled={pending}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        {hasQuestionContent && !text.trim() ? (
          <p className="text-xs text-destructive">{t('questionTextRequired')}</p>
        ) : null}

        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium">{t('answerOptions')}</legend>
          {options.map((option, index) => (
            <div key={index} className="grid gap-1.5">
              <label htmlFor={`bank-option-${item?.id ?? 'new'}-${index}`} className="text-sm font-medium">
                {t('optionLabel', { number: index + 1 })}
              </label>
              <div className="flex min-w-0 items-center gap-1">
                <label className="grid size-11 shrink-0 place-items-center rounded-lg focus-within:ring-2 focus-within:ring-ring">
                  <input
                    type="checkbox"
                    checked={correctSlots.includes(index)}
                    disabled={pending}
                    onChange={() => setCorrectSlots((current) => current.includes(index)
                      ? current.filter((slot) => slot !== index)
                      : [...current, index])}
                    className="size-5"
                  />
                  <span className="sr-only">{t('markCorrect', { number: index + 1 })}</span>
                </label>
                <input
                  id={`bank-option-${item?.id ?? 'new'}-${index}`}
                  className={kvissInputClass}
                  value={option}
                  disabled={pending}
                  onChange={(event) => setOptions((current) => current.map((value, slotIndex) =>
                    slotIndex === index ? event.target.value : value))}
                />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{t('correctAnswersHint')}</p>
          {hasQuestionContent && normalized.options.length < 2 ? (
            <p className="text-xs text-destructive">{t('questionNeedsOptions')}</p>
          ) : null}
          {normalized.options.length >= 2 && normalized.correctOptionIndices.length === 0 ? (
            <p className="text-xs text-destructive">{t('questionNeedsCorrect')}</p>
          ) : null}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <TeskeidNumberField
            label={t('durationSeconds')}
            value={durationDraft}
            onValueChange={setDurationDraft}
            min={5}
            step={1}
            required
            disabled={pending}
            error={numericError(durationValidation, 5)}
          />
          <TeskeidNumberField
            label={t('pointWeight')}
            value={pointWeightDraft}
            onValueChange={setPointWeightDraft}
            min={1}
            step={1}
            required
            disabled={pending}
            error={numericError(pointWeightValidation, 1)}
          />
        </div>

        <label className="flex min-h-10 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={confidenceMode}
            disabled={pending}
            onChange={(event) => setConfidenceMode(event.target.checked)}
            className="size-5"
          />
          {t('confidenceMode')}
        </label>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={kvissPrimaryButtonClass} disabled={!canSave || pending} onClick={submit}>
            {saving ? <LoaderCircle size={17} className="mr-2 animate-spin" aria-hidden="true" /> : null}
            {saving ? t('savingQuestion') : t('saveQuestion')}
          </button>
          <button type="button" className={kvissSecondaryButtonClass} disabled={pending} onClick={onCancel}>
            {t('cancel')}
          </button>
        </div>
      </div>
    </section>
  )
}
