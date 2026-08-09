'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { QuestionBankDraft, QuestionBankItem, QuizQuestion } from '@/lib/kviss/authoring'
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

const EMPTY: AuthoringState = { questions: [], templates: [], templateQuestions: [], sessions: [], sessionQuestions: [], sessionParticipants: [] }

function bankItem(row: Row): QuestionBankItem {
  return {
    id: String(row.id), revision: Number(row.revision), text: String(row.question_text),
    options: Array.isArray(row.options) ? row.options.map(String) : [],
    correctOptionIndices: Array.isArray(row.correct_option_indices) ? row.correct_option_indices.map(Number) : [],
    durationSeconds: Number(row.duration_seconds), pointWeight: Number(row.point_weight),
    confidenceMode: row.confidence_mode === true, labels: Array.isArray(row.labels) ? row.labels.map(String) : [],
    sortOrder: Number(row.sort_order), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  } as QuestionBankItem & { labels: string[] }
}

function snapshot(item: QuestionBankItem): QuizQuestion {
  return {
    id: crypto.randomUUID(), kind: 'quiz', text: item.text, options: [...item.options],
    correctOptionIndices: [...item.correctOptionIndices], durationSeconds: item.durationSeconds,
    pointWeight: item.pointWeight, confidenceMode: item.confidenceMode, songSnapshot: null,
    sourceQuestionId: item.id, sourceQuestionRevision: item.revision,
  }
}

export function KvissCreatorClient() {
  const t = useTranslations('kviss')
  const [data, setData] = useState<AuthoringState>(EMPTY)
  const [view, setView] = useState<'bank' | 'quizzes'>('bank')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editorVersion, setEditorVersion] = useState(0)
  const [title, setTitle] = useState('')
  const [teamNames, setTeamNames] = useState('')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const loadInFlight = useRef<Promise<void> | null>(null)

  const load = useCallback(async () => {
    if (loadInFlight.current) return loadInFlight.current
    const task = (async () => {
      try {
        const response = await fetch('/api/auth-mvp/kviss', { cache: 'no-store' })
        if (!response.ok) throw new Error('load')
        setData(await response.json() as AuthoringState)
        setError(null)
      } catch { setError(t('creatorLoadError')) } finally { setLoading(false) }
    })()
    loadInFlight.current = task
    await task.finally(() => { loadInFlight.current = null })
  }, [t])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    let stopped = false
    let timeout: number | undefined
    const poll = async () => {
      if (!stopped && document.visibilityState === 'visible') await load()
      if (!stopped) timeout = window.setTimeout(poll, 5_000)
    }
    timeout = window.setTimeout(poll, 5_000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      if (timeout !== undefined) window.clearTimeout(timeout)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  const mutate = async (body: unknown) => {
    const response = await fetch('/api/auth-mvp/kviss', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(response.status === 409 ? 'conflict' : 'mutation')
    await load()
    return response.json() as Promise<{ data?: Row; revision?: number }>
  }

  const bank = useMemo(() => data.questions.map(bankItem), [data.questions])
  const editing = bank.find(item => item.id === editingId) ?? null

  const saveQuestion = async (draft: QuestionBankDraft) => {
    setPending(true); setError(null)
    try {
      await mutate({
        action: 'upsertQuestion', question: {
          id: editing?.id ?? null, expectedRevision: editing?.revision ?? null,
          ...draft, labels: [],
        },
      })
      setEditingId(null); setEditorVersion(version => version + 1)
    } catch (cause) { setError(cause instanceof Error && cause.message === 'conflict' ? t('conflict') : t('saveError')) } finally { setPending(false) }
  }

  const saveTemplate = async () => {
    if (!title.trim() || questions.length === 0 || pending) return
    setPending(true); setError(null)
    try {
      await mutate({
        action: 'saveTemplate', title, teamNames: teamNames.split(',').map(value => value.trim()).filter(Boolean),
        questions: questions.map(question => ({
          id: question.id, sourceQuestionId: question.sourceQuestionId,
          sourceQuestionRevision: question.sourceQuestionRevision,
        })),
      })
      setTitle(''); setTeamNames(''); setQuestions([])
    } catch { setError(t('saveError')) } finally { setPending(false) }
  }

  const hostCommand = async (session: Row, commandType: string, questionId?: string) => {
    setPending(true); setError(null)
    try {
      await mutate({
        action: 'hostCommand', sessionId: session.id, expectedRevision: Number(session.revision),
        commandId: crypto.randomUUID(), commandType, questionId: questionId ?? null,
      })
    } catch (cause) { setError(cause instanceof Error && cause.message === 'conflict' ? t('conflict') : t('saveError')) } finally { setPending(false) }
  }

  if (loading) return <p role="status" className="text-sm text-muted-foreground">{t('loading')}</p>
  return (
    <div className="grid gap-6">
      <div role="tablist" aria-label={t('creatorTabs')} className="flex border-b border-border">
        {(['bank', 'quizzes'] as const).map(tab => <button key={tab} role="tab" aria-selected={view === tab} onClick={() => setView(tab)} className={`min-h-11 flex-1 border-b-2 px-2 text-sm font-medium ${view === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>{t(tab === 'bank' ? 'bankTab' : 'quizzesTab')}</button>)}
      </div>
      {error ? <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
      {view === 'bank' ? <KvissQuestionBankPanel
        items={bank} editingItem={editing} editorVersion={editorVersion}
        onSave={draft => { if (!pending) void saveQuestion(draft) }}
        onEdit={setEditingId} onCancelEdit={() => setEditingId(null)}
        onDelete={id => {
          const item = bank.find(candidate => candidate.id === id)
          if (!item || pending) return
          setPending(true)
          void mutate({ action: 'archiveQuestion', questionId: id, expectedRevision: item.revision })
            .catch(() => setError(t('saveError'))).finally(() => setPending(false))
        }}
      /> : <div className="grid gap-6">
        <KvissQuizBuilder
          title={title} teamNames={teamNames} questions={questions} questionBank={bank}
          onTitleChange={setTitle} onTeamNamesChange={setTeamNames}
          onAdd={item => setQuestions(current => current.some(question => question.sourceQuestionId === item.id) ? current : [...current, snapshot(item)])}
          onMove={(id, direction) => setQuestions(current => {
            const index = current.findIndex(question => question.id === id)
            const target = index + direction
            if (index < 0 || target < 0 || target >= current.length) return current
            const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next
          })}
          onRemove={id => setQuestions(current => current.filter(question => question.id !== id))}
          onRefresh={(id, item) => setQuestions(current => current.map(question => question.id === id ? { ...snapshot(item), id } : question))}
          onOpenQuestionBank={() => setView('bank')} onSave={() => void saveTemplate()}
        />
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold text-primary">{t('savedQuizzes')}</h2>
          {data.templates.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t('noSavedQuizzes')}</p> : <ul className="mt-3 divide-y divide-border">{data.templates.map(template => {
            const templateId = String(template.id)
            const count = data.templateQuestions.filter(question => question.template_id === template.id).length
            return <li key={templateId} className="py-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="min-w-0 flex-1"><h3 className="font-medium">{String(template.title)}</h3><p className="text-xs text-muted-foreground">{t('questionCount', { count })}</p><label className="mt-2 grid gap-1 text-xs font-medium">{t('optionalPassword')}<input type="password" value={passwords[templateId] ?? ''} onChange={event => setPasswords(current => ({ ...current, [templateId]: event.target.value }))} maxLength={72} className="min-h-10 rounded-lg border border-border bg-background px-3 text-base" /></label></div><button disabled={pending} onClick={() => {
              setPending(true); setError(null)
              void mutate({ action: 'createSession', templateId, password: passwords[templateId]?.trim() || null })
                .catch(() => setError(t('saveError'))).finally(() => setPending(false))
            }} className="min-h-10 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-45">{t('createSession')}</button></div></li>
          })}</ul>}
        </section>
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold text-primary">{t('liveSessions')}</h2>
          {data.sessions.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t('noSessions')}</p> : <ul className="mt-3 grid gap-4">{data.sessions.map(session => {
            const sessionId = String(session.id)
            const sessionQuestions = data.sessionQuestions.filter(question => question.session_id === session.id)
            const sessionParticipants = data.sessionParticipants.filter(participant => participant.session_id === session.id)
            const link = typeof window === 'undefined' ? `/kviss/${session.join_code}` : `${window.location.origin}/kviss/${session.join_code}`
            return <li key={sessionId} className="rounded-lg border border-border bg-background p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-medium">{String(session.title)}</h3><p className="font-mono text-lg font-semibold tracking-widest">{String(session.join_code)}</p><p className="text-xs text-muted-foreground">{t('status', { status: String(session.status) })}</p><p className="mt-1 text-xs text-muted-foreground">{t('participantCount', { count: sessionParticipants.length })}</p>{sessionParticipants.length > 0 ? <p className="mt-1 text-xs text-muted-foreground">{sessionParticipants.map(participant => String(participant.nickname)).join(', ')}</p> : null}</div><button onClick={() => void navigator.clipboard.writeText(link)} className="min-h-10 rounded-lg border border-border px-3 text-sm">{t('copyLink')}</button></div><div className="mt-3 flex flex-wrap gap-2">
              {String(session.status) === 'lobby' || String(session.status) === 'leaderboard' || String(session.status) === 'reveal' ? sessionQuestions.map(question => <button key={String(question.id)} disabled={pending} onClick={() => void hostCommand(session, 'activate_question', String(question.id))} className="min-h-10 rounded-lg border border-border px-3 text-sm">{t('openQuestion', { number: Number(question.sort_order) + 1 })}</button>) : null}
              {String(session.status) === 'question' ? <button disabled={pending} onClick={() => void hostCommand(session, 'reveal')} className="min-h-10 rounded-lg bg-primary px-3 text-sm text-primary-foreground">{t('reveal')}</button> : null}
              {String(session.status) === 'reveal' ? <button disabled={pending} onClick={() => void hostCommand(session, 'leaderboard')} className="min-h-10 rounded-lg bg-primary px-3 text-sm text-primary-foreground">{t('showLeaderboard')}</button> : null}
              {String(session.status) !== 'ended' ? <button disabled={pending} onClick={() => void hostCommand(session, 'end')} className="min-h-10 rounded-lg border border-destructive px-3 text-sm text-destructive">{t('endSession')}</button> : null}
            </div></li>
          })}</ul>}
        </section>
      </div>}
    </div>
  )
}
