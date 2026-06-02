export type IdeaCategory =
  | 'Heimili'
  | 'Börn'
  | 'Pör'
  | 'Umönnun'
  | 'Útgjöld'
  | 'Lánað og skilað'
  | 'Viðburðir'
  | 'Minningar'
  | 'Vaktir og skipulag'
  | 'Annað'

export type IdeaStatus =
  | 'idea'
  | 'reviewing'
  | 'planned'
  | 'building'
  | 'launched'
  | 'archived'

export type IdeaSource = 'seed' | 'user-submitted' | 'imported-from-vaktirnar'

export type SubmissionStatus = 'pending' | 'approved' | 'rejected'

export interface Idea {
  id: string
  title: string
  slug: string
  short_description: string
  problem_description: string | null
  possible_solution: string | null
  category: IdeaCategory
  status: IdeaStatus
  source: IdeaSource
  votes_count: number
  followers_count: number
  is_public: boolean
  is_featured: boolean
  created_at: string
  updated_at: string
}

export interface Submission {
  id: string
  problem_description: string
  current_solution: string | null
  dream_solution: string | null
  category: IdeaCategory | null
  allow_publication: 'yes' | 'no' | 'anonymous'
  name: string | null
  email: string | null
  status: SubmissionStatus
  idea_id: string | null
  created_at: string
}

export interface Vote {
  id: string
  idea_id: string
  voter_token: string
  ip_hash: string | null
  created_at: string
}

export interface Follower {
  id: string
  idea_id: string
  email: string
  created_at: string
}

export const IDEA_CATEGORIES: IdeaCategory[] = [
  'Heimili',
  'Börn',
  'Pör',
  'Umönnun',
  'Útgjöld',
  'Lánað og skilað',
  'Viðburðir',
  'Minningar',
  'Vaktir og skipulag',
  'Annað',
]
