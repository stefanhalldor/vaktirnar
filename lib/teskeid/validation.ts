import { z } from 'zod'
import { IDEA_CATEGORIES } from './types'

export const voteSchema = z.object({
  idea_id: z.string().uuid(),
  voter_token: z.string().min(1).max(100),
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
  is_public: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  status: z.enum(['idea', 'reviewing', 'planned', 'building', 'launched', 'archived']).optional(),
})

export const adminSubmissionUpdateSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
})
