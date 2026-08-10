'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { PublicQuizAdCard } from '@/components/kviss/PublicQuizAdCard'
import type { AdPlacement, PublicQuizAd } from '@/lib/advertiser/contracts'
import type { KvissJoinPreview, KvissParticipantProjection } from '@/lib/kviss/contracts'
import { KvissLoading } from './KvissLoading'

type LoadState = 'loading' | 'join' | 'joined' | 'missing' | 'error'

export function KvissParticipantClient({ code }: { code: string }) {
  const t = useTranslations('kviss')
  const [state, setState] = useState<LoadState>('loading')
  const [preview, setPreview] = useState<KvissJoinPreview | null>(null)
  const [projection, setProjection] = useState<KvissParticipantProjection | null>(null)
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<'join' | 'answer' | 'chat' | null>(null)
  const [chatBody, setChatBody] = useState('')
  const [remaining, setRemaining] = useState<number | null>(null)
  const [publicAd, setPublicAd] = useState<PublicQuizAd | null>(null)
  const fetchInFlight = useRef<Promise<void> | null>(null)
  const pending = pendingAction !== null

  const refresh = useCallback(async (forceFresh = false) => {
    if (fetchInFlight.current) {
      await fetchInFlight.current
      if (!forceFresh) return
    }
    if (fetchInFlight.current) return fetchInFlight.current
    const task = (async () => {
      try {
        const response = await fetch(`/api/kviss/public/session?code=${encodeURIComponent(code)}`, { cache: 'no-store' })
        if (response.ok) {
          setProjection(await response.json() as KvissParticipantProjection)
          setState('joined')
          setError(null)
          return
        }
        if (response.status !== 401) { setState('missing'); setError(null); return }
        const lookup = await fetch(`/api/kviss/public/lookup?code=${encodeURIComponent(code)}`, { cache: 'no-store' })
        if (!lookup.ok) { setState('missing'); setError(null); return }
        setPreview(await lookup.json() as KvissJoinPreview)
        setState('join')
        setError(null)
      } catch {
        setError(t('connectionError'))
        setState(current => current === 'loading' ? 'error' : current)
      }
    })()
    fetchInFlight.current = task
    await task.finally(() => { fetchInFlight.current = null })
  }, [code, t])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    if (state !== 'joined') return
    let stopped = false
    let timeout: number | undefined
    const poll = async () => {
      if (!stopped && document.visibilityState === 'visible') await refresh()
      if (!stopped) timeout = window.setTimeout(poll, 5_000)
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh() }
    const onOnline = () => void refresh()
    void poll()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    return () => {
      stopped = true
      if (timeout !== undefined) window.clearTimeout(timeout)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
    }
  }, [refresh, state])

  useEffect(() => {
    const topic = projection?.realtimeTopic
    if (!topic) return
    const supabase = createClient()
    let lastScheduled = 0
    const channel = supabase.channel(topic)
      .on('broadcast', { event: 'invalidate' }, () => {
        const now = Date.now()
        if (now - lastScheduled < 500) return
        lastScheduled = now
        void refresh(true)
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') void refresh(true) })
    return () => { void supabase.removeChannel(channel) }
  }, [projection?.realtimeTopic, refresh])

  useEffect(() => {
    const question = projection?.activeQuestion
    const started = projection?.questionStartedAt
    if (!question || !started || projection.status !== 'question') { setRemaining(null); return }
    const update = () => setRemaining(Math.max(0, Math.ceil((new Date(started).getTime() + question.durationSeconds * 1000 - Date.now()) / 1000)))
    update()
    const interval = window.setInterval(update, 250)
    return () => window.clearInterval(interval)
  }, [projection?.activeQuestion, projection?.questionStartedAt, projection?.status])

  const submitJoin = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pending) return
    setPendingAction('join'); setError(null)
    try {
      const response = await fetch('/api/kviss/public/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, nickname, password: preview?.passwordRequired ? password : undefined }),
      })
      if (response.status === 429) setError(t('tooManyAttempts'))
      else if (!response.ok) setError(t('joinFailed'))
      else await refresh(true)
    } catch { setError(t('connectionError')) } finally { setPendingAction(null) }
  }

  const answer = async (selectedOption: number) => {
    if (!projection?.activeQuestion || projection.participantAnswer || pending || remaining === 0) return
    setPendingAction('answer'); setError(null)
    try {
      const response = await fetch('/api/kviss/public/answer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, questionId: projection.activeQuestion.id, selectedOption, commandId: crypto.randomUUID() }),
      })
      if (response.ok || response.status === 409) await refresh(true)
      else setError(t('answerFailed'))
    } catch { setError(t('connectionError')) } finally { setPendingAction(null) }
  }

  const sendChat = async (event: React.FormEvent) => {
    event.preventDefault()
    const body = chatBody.trim()
    if (!body || pending) return
    setPendingAction('chat')
    setError(null)
    try {
      const response = await fetch('/api/kviss/public/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, body, clientMessageId: crypto.randomUUID() }),
      })
      if (response.ok) { setChatBody(''); await refresh(true) }
      else setError(t('chatFailed'))
    } catch { setError(t('connectionError')) } finally { setPendingAction(null) }
  }

  const ownCorrect = useMemo(() => {
    if (!projection?.activeQuestion?.correctOptionIndices || !projection.participantAnswer) return null
    return projection.activeQuestion.correctOptionIndices.includes(projection.participantAnswer.selectedOption)
  }, [projection])

  const adPlacement: AdPlacement | null = projection?.status === 'lobby'
    ? 'public_quiz_lobby'
    : projection && ['leaderboard', 'ended'].includes(projection.status)
      ? 'public_quiz_results'
      : null

  useEffect(() => {
    if (!adPlacement) {
      setPublicAd(null)
      return
    }
    let active = true
    let timeout: number | undefined
    async function loadAd() {
      try {
        const response = await fetch(`/api/kviss/public/ad?placement=${adPlacement}`, { cache: 'no-store' })
        const payload = response.ok ? await response.json() as { ad?: PublicQuizAd | null } : null
        if (active) setPublicAd(payload?.ad ?? null)
      } catch {
        if (active) setPublicAd(null)
      }
    }
    async function pollAd() {
      if (document.visibilityState === 'visible') await loadAd()
      if (active) timeout = window.setTimeout(pollAd, 30_000)
    }
    function onVisibility() {
      if (active && document.visibilityState === 'visible') void loadAd()
    }
    void pollAd()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      active = false
      if (timeout !== undefined) window.clearTimeout(timeout)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [adPlacement])

  if (state === 'loading') return <KvissLoading />
  if (state === 'error') return (
    <div className="grid gap-3">
      <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        {error ?? t('connectionError')}
      </p>
      <button
        type="button"
        className="min-h-11 rounded-lg border border-border bg-card px-4 text-sm font-medium"
        onClick={() => {
          setState('loading')
          void refresh(true)
        }}
      >
        {t('tryAgain')}
      </button>
    </div>
  )
  if (state === 'missing') return <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{t('notFound')}</p>
  if (state === 'join') return (
    <form onSubmit={submitJoin} className="grid gap-4 rounded-xl border border-border bg-card p-4">
      <div><h1 className="text-xl font-semibold text-primary">{preview?.title}</h1><p className="mt-1 text-sm text-muted-foreground">{t('joinDescription')}</p></div>
      <label className="grid gap-1.5 text-sm font-medium">{t('nicknameLabel')}<input value={nickname} disabled={pending} onChange={event => setNickname(event.target.value)} maxLength={40} autoComplete="nickname" className="min-h-11 rounded-lg border border-border bg-background px-3 text-base disabled:opacity-60" /></label>
      {preview?.passwordRequired ? <label className="grid gap-1.5 text-sm font-medium">{t('passwordLabel')}<input type="password" value={password} disabled={pending} onChange={event => setPassword(event.target.value)} maxLength={72} autoComplete="current-password" className="min-h-11 rounded-lg border border-border bg-background px-3 text-base disabled:opacity-60" /></label> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <button disabled={pending || !nickname.trim() || (preview?.passwordRequired === true && !password)} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-45">{pendingAction === 'join' ? t('joining') : t('join')}</button>
    </form>
  )
  if (!projection) return null
  return (
    <div className="grid gap-5">
      <header><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('joinedAs')}</p><h1 className="text-xl font-semibold text-primary">{projection.participant.nickname}</h1>{projection.participant.teamName ? <p className="mt-1 text-sm">{t('team', { team: projection.participant.teamName })}</p> : null}</header>
      <PublicQuizAdCard ad={publicAd} />
      {projection.status === 'lobby' ? <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{t('waiting')}</p> : null}
      {projection.activeQuestion && ['question', 'reveal'].includes(projection.status) ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">{projection.activeQuestion.text}</h2>{remaining !== null ? <span className="shrink-0 rounded-full border border-border px-2 py-1 text-xs tabular-nums">{t('seconds', { count: remaining })}</span> : null}</div>
          <div className="mt-4 grid gap-2">{projection.activeQuestion.options.map((option, index) => {
            const selected = projection.participantAnswer?.selectedOption === index
            const correct = projection.activeQuestion?.correctOptionIndices?.includes(index)
            return <button key={index} type="button" onClick={() => void answer(index)} disabled={Boolean(projection.participantAnswer) || pending || projection.status !== 'question' || remaining === 0} className={`min-h-12 rounded-lg border px-3 text-left text-base disabled:opacity-70 ${correct ? 'border-emerald-600 bg-emerald-50' : selected ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>{option}</button>
          })}</div>
          {pendingAction === 'answer' ? <p role="status" className="mt-3 text-sm text-muted-foreground">{t('answering')}</p> : null}
          {projection.participantAnswer && projection.status === 'question' ? <p className="mt-3 text-sm text-muted-foreground">{t('answerLocked')}</p> : null}
          {projection.status === 'reveal' && ownCorrect !== null ? <p className="mt-3 font-medium">{t(ownCorrect ? 'correct' : 'incorrect')}</p> : null}
        </section>
      ) : null}
      {['leaderboard', 'ended'].includes(projection.status) ? <section className="rounded-xl border border-border bg-card p-4"><h2 className="font-semibold">{t('leaderboard')}</h2><ol className="mt-3 divide-y divide-border">{projection.leaderboard.map((row, index) => <li key={`${row.nickname}:${index}`} className="flex justify-between gap-3 py-2 text-sm"><span>{index + 1}. {row.nickname}</span><strong>{t('points', { count: row.points })}</strong></li>)}</ol></section> : null}
      {projection.status !== 'ended' ? <section className="rounded-xl border border-border bg-card p-4"><h2 className="font-semibold">{t('chatTitle')}</h2><div className="mt-3 max-h-48 space-y-2 overflow-y-auto">{projection.chat.length === 0 ? <p className="text-sm text-muted-foreground">{t('chatEmpty')}</p> : projection.chat.map(message => <div key={message.id} className="rounded-lg bg-background p-2 text-sm"><strong>{message.authorName}</strong><p className="whitespace-pre-wrap break-words">{message.body}</p></div>)}</div><form onSubmit={sendChat} className="mt-3 flex gap-2"><input value={chatBody} disabled={pending} onChange={event => setChatBody(event.target.value)} maxLength={500} placeholder={t('chatPlaceholder')} className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-base disabled:opacity-60" /><button disabled={pending || !chatBody.trim()} className="min-h-11 min-w-20 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-45">{t(pendingAction === 'chat' ? 'sending' : 'send')}</button></form></section> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
