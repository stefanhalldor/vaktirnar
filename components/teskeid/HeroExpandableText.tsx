'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface HeroExpandableTextProps {
  expandLabel: string
  collapseLabel: string
  expandedDescription: string
}

export function HeroExpandableText({ expandLabel, collapseLabel, expandedDescription }: HeroExpandableTextProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-4">
      {open ? (
        <div className="bg-white/70 rounded-xl border border-black/5 p-5 text-left space-y-3">
          {expandedDescription.split('\n\n').map((para, i) => (
            <p key={i} className="text-base leading-[26px] text-[#42493e]">
              {para.split('\n').map((line, j) => (
                <span key={j}>{j > 0 && <br />}{line}</span>
              ))}
            </p>
          ))}
          <button
            onClick={() => setOpen(false)}
            className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-[#154212] hover:opacity-70 transition-opacity"
          >
            <ChevronUp size={15} />
            {collapseLabel}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#c2c9bb] bg-white/70 px-4 py-2 text-sm font-medium text-[#154212] hover:bg-white transition-colors"
        >
          {expandLabel}
          <ChevronDown size={15} />
        </button>
      )}
    </div>
  )
}
