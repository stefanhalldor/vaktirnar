import Link from 'next/link'
import type { Idea } from '@/lib/teskeid/types'
import { StatusBadge } from './StatusBadge'
import { VoteButton } from './VoteButton'

export function IdeaCard({ idea }: { idea: Idea }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-violet-300 transition-colors group">
      <Link href={`/hugmyndir/${idea.slug}`} className="block mb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            {idea.category}
          </span>
          <StatusBadge status={idea.status} />
        </div>
        <h2 className="text-base font-semibold text-gray-900 mb-1 group-hover:text-violet-700 transition-colors">
          {idea.title}
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          {idea.short_description}
        </p>
      </Link>
      <VoteButton ideaId={idea.id} initialCount={idea.votes_count} compact />
    </div>
  )
}
