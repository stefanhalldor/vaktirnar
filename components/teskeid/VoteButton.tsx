'use client'

import { useState, useEffect, useCallback } from 'react'
import { trackEvent } from '@/lib/teskeid/analytics'

interface VoteButtonProps {
  ideaId: string
  initialCount: number
  compact?: boolean
}

export function VoteButton({ ideaId, initialCount, compact = false }: VoteButtonProps) {
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

  if (compact) {
    return (
      <button
        onClick={handleVote}
        disabled={voted || loading || !checked}
        aria-label="Kjósa þessa hugmynd"
        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors border ${
          voted
            ? 'bg-violet-600 text-white border-violet-600 cursor-default'
            : 'bg-white text-gray-500 border-gray-200 hover:border-violet-400 hover:text-violet-600'
        } disabled:opacity-60`}
      >
        <span>▲</span>
        <span>{count}</span>
      </button>
    )
  }

  return (
    <button
      onClick={handleVote}
      disabled={voted || loading || !checked}
      aria-label="Kjósa þessa hugmynd"
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors border ${
        voted
          ? 'bg-violet-600 text-white border-violet-600 cursor-default'
          : 'bg-white text-gray-700 border-gray-200 hover:border-violet-400 hover:text-violet-600'
      } disabled:opacity-60`}
    >
      <span>▲</span>
      <span>{count}</span>
      {voted && <span className="text-xs opacity-80">Kosið</span>}
    </button>
  )
}
