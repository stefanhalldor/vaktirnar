'use client'

import { useState, useEffect } from 'react'
import type { Idea } from '@/lib/teskeid/types'
import { IdeaGrid } from './IdeaGrid'

interface Props {
  ideas: Idea[] // server-ordered: is_featured desc, votes_count desc
}

export function PersonalizedIdeaGrid({ ideas }: Props) {
  const [ordered, setOrdered] = useState<Idea[]>(ideas)

  useEffect(() => {
    async function init() {
      if (ideas.length === 0) return

      let voted: Record<string, true> = {}
      try {
        const ids = ideas.map(i => i.id).join(',')
        const res = await fetch(`/api/votes?idea_ids=${ids}`)
        if (res.ok) {
          const data = await res.json()
          voted = data.voted ?? {}
        }
      } catch {
        // fetch failed — keep server order
        return
      }

      // Split into unvoted/voted, preserving server order within each group
      const isVoted = (i: Idea) => Boolean(voted[i.id])
      setOrdered([
        ...ideas.filter(i => !isVoted(i)),
        ...ideas.filter(i => isVoted(i)),
      ])
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <IdeaGrid ideas={ordered} />
}
