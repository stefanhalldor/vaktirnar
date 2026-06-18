'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Idea } from '@/lib/teskeid/types'
import { PersonalizedIdeaGrid } from './PersonalizedIdeaGrid'

interface Props {
  title: string
  ideas: Idea[]
}

export function HomeIdeasDrawer({ title, ideas }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="home-ideas-drawer-content"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-lg"
      >
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <ChevronDown
          size={16}
          className={`text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div id="home-ideas-drawer-content" className="mt-2">
          <PersonalizedIdeaGrid ideas={ideas} />
        </div>
      )}
    </div>
  )
}
