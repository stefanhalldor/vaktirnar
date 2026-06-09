'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronUp, ThumbsUp, Plus, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { trackEvent } from '@/lib/teskeid/analytics'

interface VoteButtonProps {
  ideaId: string
  initialCount: number
  compact?: boolean
  variant?: 'stitch'
}

export function VoteButton({ ideaId, initialCount, compact = false, variant }: VoteButtonProps) {
  const t = useTranslations('teskeid.ideas')
  const [count, setCount] = useState(initialCount)
  const [voted, setVoted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)

  const sync = useCallback(async () => {
    try {
      // Server reads the httpOnly voter cookie automatically — no token needed from client
      const res = await fetch(`/api/votes?idea_ids=${ideaId}`)
      const data = await res.json()
      if (data.voted?.[ideaId]) setVoted(true)
      if (typeof data.counts?.[ideaId] === 'number') setCount(data.counts[ideaId])
    } catch {
      // ignore — stale state is better than a broken button
    } finally {
      setChecked(true)
    }
  }, [ideaId])

  useEffect(() => {
    sync()

    // Re-sync when user navigates back (browser back/forward cache)
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) sync()
    }
    // Re-sync when tab becomes visible again
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') sync()
    }

    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [sync])

  async function handleVote() {
    if (voted || loading || !checked) return

    setLoading(true)
    setVoted(true)
    setCount((c) => c + 1)

    const res = await fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea_id: ideaId }),
    })

    if (!res.ok) {
      setVoted(false)
      setCount((c) => c - 1)
    } else {
      trackEvent('vote', { idea_id: ideaId })
    }

    setLoading(false)
  }

  if (variant === 'stitch') {
    return (
      <div className="flex items-center justify-between w-full gap-3">
        <span className="text-sm text-[#42493e] flex items-center gap-1.5 shrink-0">
          <ThumbsUp size={14} />
          <span>{count} atkvæði</span>
        </span>
        <button
          onClick={handleVote}
          disabled={voted || loading || !checked}
          aria-label="Kjósa þessa hugmynd"
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold border transition-colors min-h-[40px] shrink-0 ${
            voted
              ? 'bg-[#2d5a27] text-[#9dd090] border-[#2d5a27] cursor-default'
              : 'bg-white text-[#154212] border-[#c2c9bb] hover:border-[#154212] hover:bg-[#f0eee9]'
          } disabled:opacity-60`}
        >
          {voted ? (
            <><Check size={14} />{t('votedLabel')}</>
          ) : (
            <><Plus size={14} />{t('voteLabel')}</>
          )}
        </button>
      </div>
    )
  }

  if (compact) {
    return (
      <button
        onClick={handleVote}
        disabled={voted || loading || !checked}
        aria-label="Kjósa þessa hugmynd"
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors border ${
          voted
            ? 'bg-[#154212] text-white border-[#154212] cursor-default'
            : 'bg-white text-[#42493e] border-[#c2c9bb] hover:border-[#154212] hover:text-[#154212]'
        } disabled:opacity-60`}
      >
        <ChevronUp size={12} />
        <span>{count}</span>
      </button>
    )
  }

  return (
    <button
      onClick={handleVote}
      disabled={voted || loading || !checked}
      aria-label={voted ? t('votedLabel') : t('voteLabel')}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors border ${
        voted
          ? 'bg-[#154212] text-white border-[#154212] cursor-default'
          : 'bg-white text-[#42493e] border-[#c2c9bb] hover:border-[#154212] hover:text-[#154212]'
      } disabled:opacity-60`}
    >
      <ChevronUp size={14} />
      <span>{count}</span>
      <span className="text-xs opacity-80">{voted ? t('votedLabel') : t('voteLabel')}</span>
    </button>
  )
}
