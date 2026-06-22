export const ALLOWED_TAGS = ['unclassified', 'family', 'friends', 'recipients'] as const
export type RelationshipTag = (typeof ALLOWED_TAGS)[number]
