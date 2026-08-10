'use client'

import { useCallback, useMemo, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  useAuthoritativeRefresh,
  type AuthoritativeRefreshLoadContext,
} from '@/lib/realtime/useAuthoritativeRefresh'
import type { QuestionBankDraft, QuestionBankItem, QuizQuestion } from '@/lib/kviss/authoring'
import { KvissLoading } from './KvissLoading'
import { KvissQuestionBankPanel } from './KvissQuestionBankPanel'
import { KvissQuizBuilder } from './KvissQuizBuilder'

type Row = Record<string, unknown>
type AuthoringState = {
  questions: Row[]
  templates: Row[]
  templateQuestions: Row[]
  sessions: Row[]
  sessionQuestions: Row[]
  sessionParticipants: Row[]
}

type MutationResult = { data?: Row; revision?: number }

const EMPTY: AuthoringState = {
  questions: [],
  templates: [],
  templateQuestions: [],
  sessions: [],
  sessionQuestions: [],
  sessionParticipants: [],
}

function bankItem(row: Row): QuestionBankItem {
  return {
    id: String(row.id),
    revision: Number(row.revision),
    text: String(row.question_text),
    options: Array.isArray(row.options) ? row.options.map(String) : [],
    correctOptionIndices: Array.isArray(row.correct_option_indices)
      ? row.correct_option_indices.map(Number)
      : [],
    durationSeconds: Number(row.duration_seconds),
    pointWeight: Number(row.point_weight),
    confidenceMode: row.confidence_mode === true,
    labels: Array.isArray(row.labels) ? row.labels.map(String) : [],
    sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  } as QuestionBankItem & { labels: string[] }
}

function snapshot(item: QuestionBankItem): QuizQuestion {
  return {
    id: crypto.randomUUID(),
    kind: 'quiz',
    text: item.text,
    options: [...item.options],
    correctOptionIndices: [...item.correctOptionIndices],
    durationSeconds: item.durationSeconds,
    pointWeight: item.pointWeight,
    confidenceMode: item.confidenceMode,
    songSnapshot: null,
    sourceQuestionId: item.id,
    sourceQuestionRevision: item.revision,
  }
}

export function KvissCreatorClient() {
  const t = useTranslations('kviss')
  const router = useRouter()
  const [data, setData] = useState<AuthoringState>(EMPTY)
  const [view, setView] = useState<'bank' | 'quizzes'>('bank')
  const [loading, setLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorVersion, setEditorVersion] = useState(0)
  const [title, setTitle] = useState('')
  const [teamNames, setTeamNames] = useState('')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const loadAuthoringState = useCallback(async ({
    signal,
    isCurrent,
  }: AuthoritativeRefreshLoadContext) => {
    try {
      const response = await fetch('/api/auth-mvp/kviss', { cache: 'no-store', signal })
      if (!response.ok) throw new Error('load')
      const next = await response.json() as AuthoringState
      if (!isCurrent()) return
      setData(next)
      setLoadError(null)
    } catch {
      if (!isCurrent() || signal.aborted) return
      setLoadError(t('creatorLoadError'))
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [t])

  const { refresh } = useAuthoritativeRefresh({
    scopeKey: 'kviss-creator',
    enabled: true,
    pollIntervalMs: 5_000,
    load: loadAuthoringState,
  })

  const mutate = async (body: unknown): Promise<MutationResult> => {
    const response = await fetch('/api/auth-mvp/kviss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(response.status === 409 ? 'conflict' : 'mutation')
    const payload = await response.json() as MutationResult
    await refresh({ afterCurrent: true })
    return payload
  }

  const bank = useMemo(() => data.questions.map(bankItem), [data.questions])
  const editing = bank.find(item => item.id === editingId) ?? null

  const saveQuestion = async (draft: QuestionBankDraft) => {
    if (pendingAction) return
    setPendingAction('question:save')
    setMutationError(null)
    try {
      await mutate({
        action: 'upsertQuestion',
        question: {
          id: editing?.id ?? null,
          expectedRevision: editing?.revision ?? null,
          ...draft,
          labels: [],
        },
      })
      setEditingId(null)
      setEditorOpen(false)
      setEditorVersion(version => version + 1)
    } catch (cause) {
      setMutationError(cause instanceof Error && cause.message === 'conflict'
        ? t('conflict')
        : t('saveError'))
    } finally {
      setPendingAction(null)
    }
  }

  const deleteQuestion = async (id: string) => {
    const item = bank.find(candidate => candidate.id === id)
    if (!item || pendingAction) return
    setPendingAction(`question:delete:${id}`)
    setMutationError(null)
    try {
      await mutate({ action: 'archiveQuestion', questionId: id, expectedRevision: item.revision })
    } catch {
      setMutationError(t('saveError'))
    } finally {
      setPendingAction(null)
    }
  }

  const saveTemplate = async () => {
    if (!title.trim() || questions.length === 0 || pendingAction) return
    setPendingAction('quiz:save')
    setMutationError(null)
    try {
      await mutate({
        action: 'saveTemplate',
        title,
        teamNames: teamNames.split(',').map(value => value.trim()).filter(Boolean),
        questions: questions.map(question => ({
          id: question.id,
          sourceQuestionId: question.sourceQuestionId,
          sourceQuestionRevision: question.sourceQuestionRevision,
        })),
      })
      setTitle('')
      setTeamNames('')
      setQuestions([])
    } catch {
      setMutationError(t('saveError'))
    } finally {
      setPendingAction(null)
    }
  }

  const createSession = async (templateId: string) => {
    if (pendingAction) return
    const action = `session:create:${templateId}`
    setPendingAction(action)
    setMutationError(null)
    try {
      const result = await mutate({
        action: 'createSession',
        templateId,
        password: passwords[templateId]?.trim() || null,
      })
      const sessionId = typeof result.data?.id === 'string' ? result.data.id : null
      if (!sessionId) throw new Error('mutation')
      router.push(`/auth-mvp/kviss/lota/${sessionId}`)
    } catch {
      setMutationError(t('saveError'))
      setPendingAction(null)
    }
  }

  const openSession = (sessionId: string) => {
    if (pendingAction) return
    setPendingAction(`session:open:${sessionId}`)
    router.push(`/auth-mvp/kviss/lota/${sessionId}`)
  }

  if (loading) return <KvissLoading />

  return (
    <div className="grid gap-6">
      <div role="tablist" aria-label={t('creatorTabs')} className="flex border-b border-border">
        {(['bank', 'quizzes'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={view === tab}
            disabled={pendingAction !== null}
            onClick={() => setView(tab)}
            className={`min-h-11 flex-1 border-b-2 px-2 text-sm font-medium disabled:opacity-45 ${
              view === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            }`}
          >
            {t(tab === 'bank' ? 'bankTab' : 'quizzesTab')}
          </button>
        ))}
      </div>

      {loadError ? (
        <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}
      {mutationError ? (
        <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          {mutationError}
        </p>
      ) : null}

      {view === 'bank' ? (
        <KvissQuestionBankPanel
          items={bank}
          editingItem={editing}
          editorVersion={editorVersion}
          editorOpen={editorOpen}
          pendingAction={pendingAction}
          onNew={() => {
            setEditingId(null)
            setEditorOpen(true)
            setEditorVersion(version => version + 1)
          }}
          onSave={draft => { void saveQuestion(draft) }}
          onEdit={id => {
            setEditingId(id)
            setEditorOpen(true)
          }}
          onCancelEdit={() => {
            setEditingId(null)
            setEditorOpen(false)
          }}
          onDelete={id => { void deleteQuestion(id) }}
        />
      ) : (
        <div className="grid gap-6">
          <KvissQuizBuilder
            title={title}
            teamNames={teamNames}
            questions={questions}
            questionBank={bank}
            pending={pendingAction !== null}
            saving={pendingAction === 'quiz:save'}
            onTitleChange={setTitle}
            onTeamNamesChange={setTeamNames}
            onAdd={item => setQuestions(current => current.some(question => question.sourceQuestionId === item.id)
              ? current
              : [...current, snapshot(item)])}
            onMove={(id, direction) => setQuestions(current => {
              const index = current.findIndex(question => question.id === id)
              const target = index + direction
              if (index < 0 || target < 0 || target >= current.length) return current
              const next = [...current]
              ;[next[index], next[target]] = [next[target], next[index]]
              return next
            })}
            onRemove={id => setQuestions(current => current.filter(question => question.id !== id))}
            onRefresh={(id, item) => setQuestions(current => current.map(question => question.id === id
              ? { ...snapshot(item), id }
              : question))}
            onOpenQuestionBank={() => {
              setEditorOpen(false)
              setView('bank')
            }}
            onSave={() => { void saveTemplate() }}
          />

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold text-primary">{t('savedQuizzes')}</h2>
            {data.templates.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t('noSavedQuizzes')}</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {data.templates.map(template => {
                  const templateId = String(template.id)
                  const count = data.templateQuestions.filter(question => question.template_id === template.id).length
                  const creating = pendingAction === `session:create:${templateId}`
                  return (
                    <li key={templateId} className="py-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-medium">{String(template.title)}</h3>
                          <p className="text-xs text-muted-foreground">{t('questionCount', { count })}</p>
                          <label className="mt-2 grid gap-1 text-xs font-medium">
                            {t('optionalPassword')}
                            <input
                              type="password"
                              value={passwords[templateId] ?? ''}
                              disabled={pendingAction !== null}
                              onChange={event => setPasswords(current => ({ ...current, [templateId]: event.target.value }))}
                              maxLength={72}
                              className="min-h-10 rounded-lg border border-border bg-background px-3 text-base disabled:opacity-60"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          disabled={pendingAction !== null}
                          onClick={() => { void createSession(templateId) }}
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-45"
                        >
                          {creating ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : null}
                          {t(creating ? 'creatingSession' : 'createSession')}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold text-primary">{t('liveSessions')}</h2>
            {data.sessions.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t('noSessions')}</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {data.sessions.map(session => {
                  const sessionId = String(session.id)
                  const participants = data.sessionParticipants.filter(participant => participant.session_id === session.id)
                  const opening = pendingAction === `session:open:${sessionId}`
                  return (
                    <li key={sessionId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium">{String(session.title)}</h3>
                        <p className="mt-1 font-mono text-base font-semibold tracking-widest">{String(session.join_code)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('sessionSummary', {
                            status: t(`sessionStatus_${String(session.status)}`),
                            count: participants.length,
                          })}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={pendingAction !== null}
                        onClick={() => openSession(sessionId)}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium disabled:opacity-45"
                      >
                        {opening ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : null}
                        {t(opening ? 'openingLiveMode' : 'openLiveMode')}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
