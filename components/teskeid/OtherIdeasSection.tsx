'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import type { Idea } from '@/lib/teskeid/types'
import { IdeaGrid } from './IdeaGrid'

const STORAGE_KEY = 'teskeid_recently_viewed'
const MAX_HISTORY = 20

function readHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

interface Props {
  ideas: Idea[]       // all other public ideas, pre-sorted by votes_count desc
  currentSlug: string
}

export function OtherIdeasSection({ ideas, currentSlug }: Props) {
  const t = useTranslations('teskeid.ideas')
  // Start with server order — avoids hydration mismatch
  const [ordered, setOrdered] = useState<Idea[]>(ideas)

  useEffect(() => {
    async function init() {
      // 1. Record this view
      const history = readHistory()
      const updated = [currentSlug, ...history.filter(s => s !== currentSlug)].slice(0, MAX_HISTORY)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      } catch {
        // ignore quota errors
      }

      // 2. Compute recent/rest order
      const recentSlugs = updated.slice(1) // skip current
      const recentSet = new Set(recentSlugs)
      const recent = recentSlugs
        .map(s => ideas.find(i => i.slug === s))
        .filter((i): i is Idea => i !== undefined)
      const rest = ideas.filter(i => !recentSet.has(i.slug))

      // 3. Fetch voted status in one request — used only for ordering, not for VoteButton state
      let voted: Record<string, true> = {}
      if (ideas.length > 0) {
        try {
          const ids = ideas.map(i => i.id).join(',')
          const res = await fetch(`/api/votes?idea_ids=${ids}`)
          if (res.ok) {
            const data = await res.json()
            voted = data.voted ?? {}
          }
        } catch {
          // fetch failed — voted stays empty, order falls back to recent/rest
        }
      }

      // 4. Unvoted ideas first, voted ideas last — within each group keep recent/rest order
      const isVoted = (i: Idea) => Boolean(voted[i.id])
      setOrdered([
        ...recent.filter(i => !isVoted(i)),
        ...rest.filter(i => !isVoted(i)),
        ...recent.filter(i => isVoted(i)),
        ...rest.filter(i => isVoted(i)),
      ])
    }

    init()
    // Run once on mount — intentionally no deps to avoid re-sorting during session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (ordered.length === 0) return null

  return (
    <section className="mt-8 sm:mt-12 border-t border-gray-100 pt-6 sm:pt-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">{t('otherIdeas')}</h2>
      <IdeaGrid ideas={ordered} />
    </section>
  )
}
