'use client'

import { LoaderCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { QuestionBankDraft, QuestionBankItem } from '@/lib/kviss/authoring'
import { kvissInputClass } from './formStyles'
import { KvissQuestionEditor } from './KvissQuestionEditor'

export function KvissQuestionBankPanel({
  items,
  editingItem,
  editorVersion,
  editorOpen,
  pendingAction,
  onNew,
  onSave,
  onEdit,
  onCancelEdit,
  onDelete,
}: {
  items: QuestionBankItem[]
  editingItem: QuestionBankItem | null
  editorVersion: number
  editorOpen: boolean
  pendingAction: string | null
  onNew(): void
  onSave(draft: QuestionBankDraft): void
  onEdit(itemId: string): void
  onCancelEdit(): void
  onDelete(itemId: string): void
}) {
  const t = useTranslations('kviss')
  const [search, setSearch] = useState('')
  const editorRef = useRef<HTMLDivElement>(null)
  const orderedItems = useMemo(
    () => [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.text.localeCompare(b.text, 'is')),
    [items],
  )
  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('is')
    if (!query) return orderedItems
    return orderedItems.filter((item) =>
      item.text.toLocaleLowerCase('is').includes(query)
      || item.options.some((option) => option.toLocaleLowerCase('is').includes(query)),
    )
  }, [orderedItems, search])
  const nextSortOrder = orderedItems.reduce((highest, item) => Math.max(highest, item.sortOrder), -1) + 1
  const controlsLocked = pendingAction !== null || editorOpen

  const edit = (itemId: string) => {
    onEdit(itemId)
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'start' }))
  }

  return (
    <div className="flex flex-col gap-6">
      {editorOpen ? (
        <div ref={editorRef} className="scroll-mt-4">
          <KvissQuestionEditor
            key={editingItem ? `${editingItem.id}:${editingItem.revision}` : `new:${editorVersion}`}
            item={editingItem}
            sortOrder={nextSortOrder}
            onSave={onSave}
            onCancel={onCancelEdit}
            pending={pendingAction !== null}
            saving={pendingAction === 'question:save'}
          />
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-primary">{t('questionBankTitle')}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('questionBankDescription')}</p>
          </div>
          {!editorOpen ? (
            <button
              type="button"
              disabled={pendingAction !== null}
              onClick={() => {
                onNew()
                requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: 'start' }))
              }}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-45"
            >
              <Plus size={17} aria-hidden="true" />
              {t('newBankQuestion')}
            </button>
          ) : null}
        </div>
        <label className="mt-4 grid gap-1.5 text-sm font-medium">
          {t('questionSearchLabel')}
          <input
            type="search"
            className={kvissInputClass}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('questionSearchPlaceholder')}
          />
        </label>

        {orderedItems.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('noBankQuestions')}</p>
        ) : filteredItems.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('noQuestionResults')}</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {filteredItems.map((item) => (
              <li key={item.id} className="flex items-start gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug">{item.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('questionRevision', { count: item.revision })} · {t('optionCount', { count: item.options.length })}
                  </p>
                </div>
                <button
                  type="button"
                  className="grid size-10 shrink-0 place-items-center rounded-lg hover:bg-background disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t('editQuestion')}
                  disabled={controlsLocked}
                  onClick={() => edit(item.id)}
                >
                  <Pencil size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="grid size-10 shrink-0 place-items-center rounded-lg text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t('deleteQuestion')}
                  disabled={controlsLocked}
                  onClick={() => {
                    if (window.confirm(t('deleteQuestionConfirm'))) onDelete(item.id)
                  }}
                >
                  {pendingAction === `question:delete:${item.id}`
                    ? <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
                    : <Trash2 size={18} aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
