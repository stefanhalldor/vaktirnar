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
    // 1. Record this view
    const history = readHistory()
    const updated = [currentSlug, ...history.filter(s => s !== currentSlug)].slice(0, MAX_HISTORY)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {
      // ignore quota errors
    }

    // 2. Reorder: recently viewed (excluding current) first, rest in server order
    const recentSlugs = updated.slice(1) // skip current
    const recentSet = new Set(recentSlugs)
    const recent = recentSlugs
      .map(s => ideas.find(i => i.slug === s))
      .filter((i): i is Idea => i !== undefined)
    const rest = ideas.filter(i => !recentSet.has(i.slug))

    setOrdered([...recent, ...rest])
    // Run once on mount — intentionally no deps to avoid re-sorting during session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (ordered.length === 0) return null

  return (
    <section className="mt-16 border-t border-gray-100 pt-10">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">{t('otherIdeas')}</h2>
      <IdeaGrid ideas={ordered} />
    </section>
  )
}
