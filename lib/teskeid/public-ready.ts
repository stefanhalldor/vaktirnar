import type { Idea } from './types'

type ReadyIdea = Pick<Idea, 'slug' | 'title' | 'short_description' | 'category'>

export function withPublicReceiptSplit(
  launchedIdeas: ReadyIdea[],
  copy: { title: string; description: string },
): ReadyIdea[] {
  if (launchedIdeas.some(idea => idea.slug === 'splitta-reikningnum')) return launchedIdeas
  return [...launchedIdeas, {
    slug: 'splitta-reikningnum',
    title: copy.title,
    short_description: copy.description,
    category: 'Útgjöld',
  }]
}
