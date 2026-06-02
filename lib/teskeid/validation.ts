import { z } from 'zod'
import { IDEA_CATEGORIES } from './types'

export const voteSchema = z.object({
  idea_id: z.string().uuid(),
  // voter_token intentionally removed — server derives identity from httpOnly cookie
})

export const followerSchema = z.object({
  idea_id: z.string().uuid(),
  email: z.string().email().max(320).transform((e) => e.toLowerCase()),
})

export const submissionSchema = z.object({
  problem_description: z.string().min(1).max(2000),
  current_solution: z.string().max(2000).optional(),
  dream_solution: z.string().max(2000).optional(),
  category: z.enum(IDEA_CATEGORIES as [string, ...string[]]).optional(),
  allow_publication: z.enum(['yes', 'no', 'anonymous']),
  name: z.string().max(200).optional(),
  email: z.string().email().max(320).optional(),
  website: z.string().optional(), // honeypot
})

export const adminIdeaUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug má bara innihalda a-z, 0-9 og -').min(1).max(200).optional(),
  short_description: z.string().min(1).max(500).optional(),
  problem_description: z.string().max(2000).nullable().optional(),
  possible_solution: z.string().max(2000).nullable().optional(),
  category: z.enum(IDEA_CATEGORIES as [string, ...string[]]).optional(),
  status: z.enum(['idea', 'reviewing', 'planned', 'building', 'launched', 'archived']).optional(),
  is_public: z.boolean().optional(),
  is_featured: z.boolean().optional(),
})

export const adminSubmissionUpdateSchema = z.object({
  problem_description: z.string().min(1).max(2000).optional(),
  current_solution: z.string().max(2000).nullable().optional(),
  dream_solution: z.string().max(2000).nullable().optional(),
  category: z.enum(IDEA_CATEGORIES as [string, ...string[]]).nullable().optional(),
  allow_publication: z.enum(['yes', 'no', 'anonymous']).optional(),
  name: z.string().max(200).nullable().optional(),
  email: z.string().email().max(320).nullable().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
})
