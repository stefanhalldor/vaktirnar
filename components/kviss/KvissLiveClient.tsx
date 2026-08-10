'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, LoaderCircle, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import type { KvissHostProjection } from '@/lib/kviss/contracts'
import { KvissAudienceView } from './KvissAudienceView'
import { KvissLoading } from './KvissLoading'
import { kvissPrimaryButtonClass, kvissSecondaryButtonClass } from './formStyles'

export type KvissLiveView = 'settings' | 'performer' | 'audience'

const VIEW_QUERY: Record<KvissLiveView, string> = {
  settings: 'stillingar',
  performer: 'flytjandi',
  audience: 'ahorfendur',
}

export function KvissLiveClient({
  sessionId,
  initialView,
  presentation = false,
}: {
  sessionId: string
  initialView: KvissLiveView
  presentation?: boolean
}) {
  const t = useTranslations('kviss')
  const router = useRouter()
  const [projection, setProjection] = useState<KvissHostProjection | null>(null)
  const [view, setView] = useState<KvissLiveView>(initialView)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [remaining, setRemaining] = useState<number | null>(null)
  const loadInFlight = useRef<Promise<void> | null>(null)

  const refresh = useCallback(async (forceFresh = false) => {
    if (loadInFlight.current) {
      await loadInFlight.current
      if (!forceFresh) return
    }
    if (loadInFlight.current) return loadInFlight.current

    const task = (async () => {
      try {
        const response = await fetch(
          `/api/auth-mvp/kviss/live?sessionId=${encodeURIComponent(sessionId)}`,
          { cache: 'no-store' },
        )
        if (!response.ok) throw new Error(response.status === 404 ? 'missing' : 'load')
        setProjection(await response.json() as KvissHostProjection)
        setLoadError(null)
      } catch (cause) {
        setLoadError(cause instanceof Error && cause.message === 'missing'
          ? t('liveSessionNotFound')
          : t('liveLoadError'))
      } finally {
        setLoading(false)
      }
    })()
    loadInFlight.current = task
    await task.finally(() => {
      if (loadInFlight.current === task) loadInFlight.current = null
    })
  }, [sessionId, t])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    let stopped = false
    let timeout: number | undefined
    const poll = async () => {
      if (!stopped && document.visibilityState === 'visible') await refresh()
      if (!stopped) timeout = window.setTimeout(poll, 5_000)
    }
    timeout = window.setTimeout(poll, 5_000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onOnline = () => void refresh()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      stopped = true
      if (timeout !== undefined) window.clearTimeout(timeout)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [refresh])

  useEffect(() => {
    const topic = projection?.realtimeTopic
    if (!topic) return
    const supabase = createClient()
    let lastScheduled = 0
    const channel = supabase.channel(topic)
      .on('broadcast', { event: 'invalidate' }, () => {
        const now = Date.now()
        if (now - lastScheduled < 300) return
        lastScheduled = now
        void refresh(true)
      })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') void refresh(true)
      })
    return () => { void supabase.removeChannel(channel) }
  }, [projection?.realtimeTopic, refresh])

  useEffect(() => {
    const question = projection?.questions.find(
      candidate => candidate.id === projection.session.activeQuestionId,
    )
    const startedAt = projection?.session.questionStartedAt
    if (!question || !startedAt || projection?.session.status !== 'question') {
      setRemaining(null)
      return
    }
    const update = () => setRemaining(Math.max(
      0,
      Math.ceil((new Date(startedAt).getTime() + question.durationSeconds * 1000 - Date.now()) / 1000),
    ))
    update()
    const interval = window.setInterval(update, 250)
    return () => window.clearInterval(interval)
  }, [projection?.questions, projection?.session.activeQuestionId, projection?.session.questionStartedAt, projection?.session.status])

  const setLiveView = (next: KvissLiveView) => {
    setView(next)
    const url = new URL(window.location.href)
    url.searchParams.set('syn', VIEW_QUERY[next])
    window.history.replaceState(window.history.state, '', url)
  }

  const command = async (
    commandType: 'activate_question' | 'reveal' | 'leaderboard' | 'end',
    questionId?: string,
  ) => {
    if (!projection || pendingAction) return
    const action = questionId ? `command:${commandType}:${questionId}` : `command:${commandType}`
    setPendingAction(action)
    setMutationError(null)
    try {
      const response = await fetch('/api/auth-mvp/kviss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'hostCommand',
          sessionId,
          expectedRevision: projection.session.revision,
          commandId: crypto.randomUUID(),
          commandType,
          questionId: questionId ?? null,
        }),
      })
      if (!response.ok) throw new Error(response.status === 409 ? 'conflict' : 'mutation')
      await refresh(true)
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'conflict') {
        setMutationError(t('conflict'))
        await refresh(true)
      } else {
        setMutationError(t('liveCommandError'))
      }
    } finally {
      setPendingAction(null)
    }
  }

  const copyJoinLink = async () => {
    if (!projection || pendingAction) return
    setPendingAction('copy')
    setMutationError(null)
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/kviss/${projection.session.joinCode}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setMutationError(t('copyFailed'))
    } finally {
      setPendingAction(null)
    }
  }

  const activeQuestion = useMemo(() => projection?.questions.find(
    question => question.id === projection.session.activeQuestionId,
  ) ?? null, [projection])
  const availableQuestions = useMemo(() => projection?.questions.filter(
    question => !projection.activatedQuestionIds.includes(question.id),
  ) ?? [], [projection])

  if (loading) return <KvissLoading />
  if (!projection) {
    return (
      <div className="grid gap-3">
        <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError ?? t('liveLoadError')}
        </p>
        <button
          type="button"
          className={kvissSecondaryButtonClass}
          onClick={() => {
            setLoading(true)
            void refresh(true)
          }}
        >
          {t('tryAgain')}
        </button>
      </div>
    )
  }

  if (presentation) {
    return <KvissAudienceView projection={projection} remaining={remaining} presentation />
  }

  const status = projection.session.status

  return (
    <div className="grid gap-5">
      <header className="grid gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('liveMode')}</p>
            <h1 className="mt-1 text-xl font-semibold text-primary">{projection.session.title}</h1>
          </div>
          <span className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium">
            {t(`sessionStatus_${status}`)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="font-mono text-xl font-bold tracking-[0.16em]">{projection.session.joinCode}</span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Users size={15} aria-hidden="true" />
            {t('participantCount', { count: projection.participants.length })}
          </span>
        </div>
      </header>

      <div role="tablist" aria-label={t('liveViews')} className="grid grid-cols-3 border-b border-border">
        {(['settings', 'performer', 'audience'] as const).map(candidate => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={view === candidate}
            disabled={pendingAction !== null}
            onClick={() => setLiveView(candidate)}
            className={`min-h-11 border-b-2 px-1 text-xs font-medium sm:text-sm ${
              view === candidate ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            } disabled:opacity-45`}
          >
            {t(`${candidate}View`)}
          </button>
        ))}
      </div>

      {loadError ? <p role="alert" className="text-sm text-destructive">{loadError}</p> : null}
      {mutationError ? <p role="alert" className="text-sm text-destructive">{mutationError}</p> : null}

      {view === 'settings' ? (
        <div className="grid gap-5">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold text-primary">{t('joinDetails')}</h2>
            <dl className="mt-3 divide-y divide-border border-y border-border text-sm">
              <div className="grid grid-cols-[5rem_1fr] gap-3 py-3">
                <dt className="text-muted-foreground">{t('codeLabel')}</dt>
                <dd className="font-mono font-semibold tracking-widest">{projection.session.joinCode}</dd>
              </div>
              <div className="grid grid-cols-[5rem_1fr] gap-3 py-3">
                <dt className="text-muted-foreground">{t('statusLabel')}</dt>
                <dd>{t(`sessionStatus_${status}`)}</dd>
              </div>
            </dl>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={pendingAction !== null}
                onClick={() => void copyJoinLink()}
                className={`${kvissSecondaryButtonClass} gap-2`}
              >
                {pendingAction === 'copy'
                  ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
                  : copied
                    ? <Check size={17} aria-hidden="true" />
                    : <Copy size={17} aria-hidden="true" />}
                {t(copied ? 'linkCopied' : 'copyLink')}
              </button>
              <a
                href={`/auth-mvp/kviss/lota/${sessionId}?syn=ahorfendur&skjar=1`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${kvissSecondaryButtonClass} gap-2`}
              >
                <ExternalLink size={17} aria-hidden="true" />
                {t('openAudienceWindow')}
              </a>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold text-primary">{t('participants')}</h2>
            {projection.participants.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t('noParticipants')}</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {projection.participants.map(participant => (
                  <li key={participant.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{participant.nickname}</span>
                    {participant.teamName ? <span className="shrink-0 text-xs text-muted-foreground">{participant.teamName}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <button
            type="button"
            disabled={pendingAction !== null || status === 'ended'}
            onClick={() => {
              if (window.confirm(t('endSessionConfirm'))) void command('end')
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-destructive px-4 text-sm font-medium text-destructive disabled:opacity-45"
          >
            {pendingAction === 'command:end' ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : null}
            {t(pendingAction === 'command:end' ? 'endingSession' : 'endSession')}
          </button>
        </div>
      ) : null}

      {view === 'performer' ? (
        <div className="grid gap-5">
          <section className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('now')}</p>
            {activeQuestion && ['question', 'reveal'].includes(status) ? (
              <div className="mt-2">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-semibold">{activeQuestion.text}</h2>
                  {remaining !== null ? <span className="shrink-0 text-sm font-semibold tabular-nums">{t('seconds', { count: remaining })}</span> : null}
                </div>
                <ol className="mt-4 grid gap-2">
                  {activeQuestion.options.map((option, index) => (
                    <li
                      key={`${activeQuestion.id}:${index}`}
                      className={`rounded-lg border p-3 text-sm ${
                        status === 'reveal' && activeQuestion.correctOptionIndices.includes(index)
                          ? 'border-emerald-600 bg-emerald-50'
                          : 'border-border bg-background'
                      }`}
                    >
                      {index + 1}. {option}
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-sm text-muted-foreground">
                  {t('answerProgress', { answered: projection.activeAnswerCount, total: projection.participants.length })}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {status === 'ended' ? t('sessionEnded') : t('chooseNextAction')}
              </p>
            )}
          </section>

          {status === 'question' ? (
            <button
              type="button"
              disabled={pendingAction !== null}
              onClick={() => void command('reveal')}
              className={`${kvissPrimaryButtonClass} gap-2`}
            >
              {pendingAction === 'command:reveal' ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : null}
              {t(pendingAction === 'command:reveal' ? 'revealing' : 'reveal')}
            </button>
          ) : null}

          {status === 'reveal' ? (
            <button
              type="button"
              disabled={pendingAction !== null}
              onClick={() => void command('leaderboard')}
              className={`${kvissPrimaryButtonClass} gap-2`}
            >
              {pendingAction === 'command:leaderboard' ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : null}
              {t(pendingAction === 'command:leaderboard' ? 'showingLeaderboard' : 'showLeaderboard')}
            </button>
          ) : null}

          {['lobby', 'leaderboard'].includes(status) && availableQuestions.length > 0 ? (
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-semibold text-primary">{t('nextQuestion')}</h2>
              <ol className="mt-3 divide-y divide-border">
                {availableQuestions.map(question => {
                  const action = `command:activate_question:${question.id}`
                  return (
                    <li key={question.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{question.sortOrder + 1}. {question.text}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{t('seconds', { count: question.durationSeconds })}</p>
                      </div>
                      <button
                        type="button"
                        disabled={pendingAction !== null}
                        onClick={() => void command('activate_question', question.id)}
                        className={`${kvissSecondaryButtonClass} shrink-0 gap-2`}
                      >
                        {pendingAction === action ? <LoaderCircle size={17} className="animate-spin" aria-hidden="true" /> : null}
                        {t(pendingAction === action ? 'openingQuestion' : 'openQuestion', { number: question.sortOrder + 1 })}
                      </button>
                    </li>
                  )
                })}
              </ol>
            </section>
          ) : null}

          {['lobby', 'leaderboard'].includes(status) && availableQuestions.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{t('allQuestionsUsed')}</p>
          ) : null}
        </div>
      ) : null}

      {view === 'audience' ? <KvissAudienceView projection={projection} remaining={remaining} /> : null}

      <button
        type="button"
        disabled={pendingAction !== null}
        onClick={() => {
          setPendingAction('navigate:back')
          router.push('/auth-mvp/kviss')
        }}
        className={kvissSecondaryButtonClass}
      >
        {pendingAction === 'navigate:back' ? t('opening') : t('backToWorkspace')}
      </button>
    </div>
  )
}
