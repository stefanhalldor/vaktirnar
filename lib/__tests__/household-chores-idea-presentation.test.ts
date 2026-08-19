import { describe, expect, it } from 'vitest'
import {
  HOUSEHOLD_CHORES_LEGACY_IDEA_SLUG,
  TASKS_IDEA_SLUG,
  isTasksIdeaSlug,
  presentHouseholdChoresIdea,
  resolveTasksIdeaDatabaseSlug,
} from '@/lib/household-chores/idea-presentation'
import type { Idea } from '@/lib/teskeid/types'

const base: Idea = {
  id: '81000000-0000-4000-8000-000000000001',
  slug: HOUSEHOLD_CHORES_LEGACY_IDEA_SLUG,
  title: 'Legacy',
  short_description: 'Legacy short',
  problem_description: 'Legacy problem',
  possible_solution: 'Legacy solution',
  category: 'Heimili',
  status: 'idea',
  source: 'seed',
  votes_count: 7,
  followers_count: 3,
  is_public: true,
  is_featured: false,
  created_at: '2026-08-18T00:00:00Z',
  updated_at: '2026-08-18T00:00:00Z',
}

const copy = {
  title: 'Tasks',
  shortDescription: 'Shared tasks.',
  problemDescription: 'Responsibilities get scattered.',
  possibleSolution: 'Use task circles.',
}

describe('Tasks legacy idea presentation', () => {
  it('uses the visible alias while preserving the exact database identity and counters', () => {
    const result = presentHouseholdChoresIdea(base, copy)
    expect(result).toMatchObject({
      id: base.id,
      slug: TASKS_IDEA_SLUG,
      title: copy.title,
      short_description: copy.shortDescription,
      problem_description: copy.problemDescription,
      possible_solution: copy.possibleSolution,
      votes_count: 7,
      followers_count: 3,
      status: 'idea',
    })
  })

  it('returns unrelated ideas unchanged', () => {
    const other = { ...base, slug: 'other-idea' }
    expect(presentHouseholdChoresIdea(other, copy)).toBe(other)
  })

  it('resolves both visible and legacy URLs to the one preserved database row', () => {
    expect(isTasksIdeaSlug(TASKS_IDEA_SLUG)).toBe(true)
    expect(isTasksIdeaSlug(HOUSEHOLD_CHORES_LEGACY_IDEA_SLUG)).toBe(true)
    expect(resolveTasksIdeaDatabaseSlug(TASKS_IDEA_SLUG))
      .toBe(HOUSEHOLD_CHORES_LEGACY_IDEA_SLUG)
    expect(resolveTasksIdeaDatabaseSlug(HOUSEHOLD_CHORES_LEGACY_IDEA_SLUG))
      .toBe(HOUSEHOLD_CHORES_LEGACY_IDEA_SLUG)
    expect(resolveTasksIdeaDatabaseSlug('other-idea')).toBe('other-idea')
  })
})
