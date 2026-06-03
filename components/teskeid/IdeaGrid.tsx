import type { Idea } from '@/lib/teskeid/types'
import { IdeaCard } from './IdeaCard'

export function IdeaGrid({ ideas }: { ideas: Idea[] }) {
  if (ideas.length === 0) {
    return (
      <p className="text-sm text-[#72796e] py-12 text-center">
        Engar hugmyndir fundust.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {ideas.map((idea, index) => (
        <IdeaCard key={idea.id} idea={idea} index={index} />
      ))}
    </div>
  )
}
