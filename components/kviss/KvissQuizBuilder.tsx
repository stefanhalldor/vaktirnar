'use client'

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { QuestionBankItem, QuizQuestion } from '@/lib/kviss/authoring'
import {
  kvissInputClass,
  kvissPrimaryButtonClass,
  kvissSecondaryButtonClass,
} from './formStyles'

export function KvissQuizBuilder({
  title,
  teamNames,
  questions,
  questionBank,
  onTitleChange,
  onTeamNamesChange,
  onAdd,
  onMove,
  onRemove,
  onRefresh,
  onOpenQuestionBank,
  onSave,
}: {
  title: string
  teamNames: string
  questions: QuizQuestion[]
  questionBank: QuestionBankItem[]
  onTitleChange(value: string): void
  onTeamNamesChange(value: string): void
  onAdd(item: QuestionBankItem): void
  onMove(questionId: string, direction: -1 | 1): void
  onRemove(questionId: string): void
  onRefresh(questionId: string, item: QuestionBankItem): void
  onOpenQuestionBank(): void
  onSave(): void
}) {
  const t = useTranslations('kviss')
  const orderedBank = useMemo(
    () => [...questionBank].sort((a, b) => a.sortOrder - b.sortOrder || a.text.localeCompare(b.text, 'is')),
    [questionBank],
  )
  const selectedSourceIds = new Set(
    questions.flatMap((question) => question.sourceQuestionId ? [question.sourceQuestionId] : []),
  )

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-primary">{t('newQuiz')}</h2>
      <div className="mt-4 grid gap-4">
        <label className="grid gap-1.5 text-sm font-medium">
          {t('quizTitleLabel')}
          <input className={kvissInputClass} value={title} onChange={(event) => onTitleChange(event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          {t('teamNamesLabel')}
          <input
            className={kvissInputClass}
            value={teamNames}
            onChange={(event) => onTeamNamesChange(event.target.value)}
            placeholder={t('teamNamesPlaceholder')}
          />
          <span className="text-xs font-normal text-muted-foreground">{t('teamNamesHint')}</span>
        </label>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold">{t('selectedQuestions')}</h3>
          {questions.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t('noSelectedQuestions')}</p>
          ) : (
            <ol className="mt-2 divide-y divide-border rounded-lg border border-border px-3">
              {questions.map((question, index) => {
                const source = question.sourceQuestionId
                  ? questionBank.find((item) => item.id === question.sourceQuestionId) ?? null
                  : null
                const sourceMissing = Boolean(question.sourceQuestionId) && !source
                const sourceOutdated = source
                  && question.sourceQuestionRevision !== null
                  && source.revision > question.sourceQuestionRevision
                return (
                  <li key={question.id} className="py-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">{index + 1}. {question.text}</p>
                        {question.sourceQuestionRevision !== null ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t('snapshotRevision', { count: question.sourceQuestionRevision })}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          className="grid size-10 place-items-center rounded-lg hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={t('moveUp')}
                          disabled={index === 0}
                          onClick={() => onMove(question.id, -1)}
                        >
                          <ChevronUp size={18} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="grid size-10 place-items-center rounded-lg hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={t('moveDown')}
                          disabled={index === questions.length - 1}
                          onClick={() => onMove(question.id, 1)}
                        >
                          <ChevronDown size={18} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="grid size-10 place-items-center rounded-lg text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={t('removeFromQuiz')}
                          onClick={() => onRemove(question.id)}
                        >
                          <Trash2 size={18} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    {sourceOutdated && source ? (
                      <button
                        type="button"
                        className={`${kvissSecondaryButtonClass} mt-2 w-full sm:w-auto`}
                        onClick={() => onRefresh(question.id, source)}
                      >
                        {t('updateFromQuestionBank')}
                      </button>
                    ) : null}
                    {sourceMissing ? (
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t('sourceQuestionMissing')}</p>
                    ) : null}
                  </li>
                )
              })}
            </ol>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold">{t('questionPickerTitle')}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('questionPickerDescription')}</p>
          {orderedBank.length === 0 ? (
            <div className="mt-3">
              <p className="text-sm text-muted-foreground">{t('questionBankRequired')}</p>
              <button type="button" className={`${kvissSecondaryButtonClass} mt-2`} onClick={onOpenQuestionBank}>
                {t('openQuestionBank')}
              </button>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {orderedBank.map((item) => {
                const added = selectedSourceIds.has(item.id)
                return (
                  <li key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{item.text}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t('questionRevision', { count: item.revision })}</p>
                    </div>
                    <button
                      type="button"
                      className={`${kvissSecondaryButtonClass} w-full shrink-0 sm:w-auto`}
                      disabled={added}
                      onClick={() => onAdd(item)}
                    >
                      {t(added ? 'addedToQuiz' : 'addToQuiz')}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <button
          type="button"
          className={kvissPrimaryButtonClass}
          disabled={!title.trim() || questions.length === 0}
          onClick={onSave}
        >
          {t('saveQuiz')}
        </button>
      </div>
    </section>
  )
}
