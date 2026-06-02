import type { Idea } from '@/lib/teskeid/types'
import { IdeaCard } from './IdeaCard'

export function IdeaGrid({ ideas }: { ideas: Idea[] }) {
  if (ideas.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-12 text-center">
        Engar hugmyndir fundust í þessum flokki.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {ideas.map((idea) => (
        <IdeaCard key={idea.id} idea={idea} />
      ))}
    </div>
  )
}
