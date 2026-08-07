export interface RelationshipDisplayInput {
  privateDisplayName?: string | null
  counterpartDisplayName?: string | null
  email?: string | null
  fallback?: string | null
}

export interface RelationshipSortKey {
  id: string
  displayName: string
  email?: string | null
}

const relationshipCollator = new Intl.Collator('is', {
  numeric: true,
  sensitivity: 'base',
})

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export function getRelationshipDisplayName(input: RelationshipDisplayInput): string {
  return clean(input.privateDisplayName)
    ?? clean(input.counterpartDisplayName)
    ?? clean(input.email)
    ?? clean(input.fallback)
    ?? ''
}

export function compareRelationshipSortKeys(
  left: RelationshipSortKey,
  right: RelationshipSortKey,
): number {
  if (!left.displayName && right.displayName) return 1
  if (left.displayName && !right.displayName) return -1
  return relationshipCollator.compare(left.displayName, right.displayName)
    || relationshipCollator.compare(left.email ?? '', right.email ?? '')
    || left.id.localeCompare(right.id)
}

export function sortRelationshipEntries<T>(
  entries: readonly T[],
  getKey: (entry: T) => RelationshipSortKey,
): T[] {
  return [...entries].sort((left, right) => (
    compareRelationshipSortKeys(getKey(left), getKey(right))
  ))
}
