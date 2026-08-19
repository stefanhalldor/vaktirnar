import type { Idea } from '@/lib/teskeid/types'

export const HOUSEHOLD_CHORES_LEGACY_IDEA_SLUG = 'fyrsta-vakt-krakkanna'
export const TASKS_IDEA_SLUG = 'verkefnin'

export function isTasksIdeaSlug(slug: string): boolean {
  return slug === TASKS_IDEA_SLUG || slug === HOUSEHOLD_CHORES_LEGACY_IDEA_SLUG
}

export function resolveTasksIdeaDatabaseSlug(slug: string): string {
  return isTasksIdeaSlug(slug) ? HOUSEHOLD_CHORES_LEGACY_IDEA_SLUG : slug
}

export interface HouseholdChoresIdeaCopy {
  title: string
  shortDescription: string
  problemDescription: string
  possibleSolution: string
}

export function presentHouseholdChoresIdea(
  idea: Idea,
  copy: HouseholdChoresIdeaCopy,
): Idea {
  if (idea.slug !== HOUSEHOLD_CHORES_LEGACY_IDEA_SLUG) return idea
  return {
    ...idea,
    slug: TASKS_IDEA_SLUG,
    title: copy.title,
    short_description: copy.shortDescription,
    problem_description: copy.problemDescription,
    possible_solution: copy.possibleSolution,
  }
}
