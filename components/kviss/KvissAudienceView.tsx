'use client'

import { useTranslations } from 'next-intl'
import type { KvissHostProjection } from '@/lib/kviss/contracts'

export function KvissAudienceView({
  projection,
  remaining,
  presentation = false,
}: {
  projection: KvissHostProjection
  remaining: number | null
  presentation?: boolean
}) {
  const t = useTranslations('kviss')
  const activeQuestion = projection.questions.find(
    question => question.id === projection.session.activeQuestionId,
  ) ?? null
  const revealAnswers = ['reveal', 'leaderboard', 'ended'].includes(projection.session.status)

  return (
    <section
      aria-label={t('audienceView')}
      className={`${presentation ? 'min-h-[calc(100dvh-1rem)] sm:min-h-[calc(100dvh-2rem)]' : 'min-h-[24rem]'} overflow-hidden rounded-xl bg-[#122112] text-white shadow-sm`}
    >
      <div className={`flex ${presentation ? 'min-h-[calc(100dvh-1rem)] sm:min-h-[calc(100dvh-2rem)]' : 'min-h-[24rem]'} flex-col p-5 sm:p-8`}>
        <header className="flex items-start justify-between gap-3 border-b border-white/15 pb-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/60">{t('audienceView')}</p>
            <h2 className="mt-1 truncate text-xl font-semibold sm:text-2xl">{projection.session.title}</h2>
          </div>
          {remaining !== null ? (
            <span className="shrink-0 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-sm font-semibold tabular-nums">
              {t('seconds', { count: remaining })}
            </span>
          ) : null}
        </header>

        {projection.session.status === 'lobby' ? (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <p className="text-sm text-white/65">{t('audienceJoinPrompt')}</p>
            <p className="mt-3 font-mono text-5xl font-bold tracking-[0.18em] text-[#b9e7ae] sm:text-7xl">
              {projection.session.joinCode}
            </p>
            <p className="mt-5 text-base text-white/80">teskeid.is/kviss</p>
            <p className="mt-2 text-sm text-white/60">
              {t('participantCount', { count: projection.participants.length })}
            </p>
          </div>
        ) : null}

        {activeQuestion && ['question', 'reveal'].includes(projection.session.status) ? (
          <div className="flex flex-1 flex-col py-6">
            <p className="text-sm text-white/55">
              {t('questionNumber', { number: activeQuestion.sortOrder + 1 })}
            </p>
            <h3 className="mt-2 text-2xl font-semibold leading-tight sm:text-4xl">{activeQuestion.text}</h3>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {activeQuestion.options.map((option, index) => {
                const correct = revealAnswers && activeQuestion.correctOptionIndices.includes(index)
                return (
                  <div
                    key={`${activeQuestion.id}:${index}`}
                    data-correct={correct ? 'true' : undefined}
                    className={`min-h-16 rounded-xl border p-4 text-base font-medium sm:text-lg ${
                      correct
                        ? 'border-[#9dd090] bg-[#264f25] text-white'
                        : 'border-white/20 bg-white/[0.07] text-white'
                    }`}
                  >
                    <span className="mr-2 text-white/50">{index + 1}.</span>{option}
                  </div>
                )
              })}
            </div>
            <p className="mt-auto pt-6 text-sm text-white/60">
              {t('answerProgress', {
                answered: projection.activeAnswerCount,
                total: projection.participants.length,
              })}
            </p>
          </div>
        ) : null}

        {['leaderboard', 'ended'].includes(projection.session.status) ? (
          <div className="flex flex-1 flex-col py-6">
            <h3 className="text-3xl font-semibold">{t('leaderboard')}</h3>
            {projection.leaderboard.length === 0 ? (
              <p className="mt-4 text-white/65">{t('leaderboardEmpty')}</p>
            ) : (
              <ol className="mt-5 divide-y divide-white/15">
                {projection.leaderboard.slice(0, 10).map((row, index) => (
                  <li key={row.participantId} className="flex items-center gap-3 py-3">
                    <span className="w-8 shrink-0 text-xl font-semibold text-[#b9e7ae]">{index + 1}.</span>
                    <span className="min-w-0 flex-1 truncate text-lg font-medium">{row.nickname}</span>
                    <strong className="shrink-0 tabular-nums">{t('points', { count: row.points })}</strong>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
