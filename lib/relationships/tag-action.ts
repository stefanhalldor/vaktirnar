'use server'

import { revalidatePath } from 'next/cache'
import { guardTeskeidSession } from '@/lib/auth/guard'
import { guardFeatureAccess } from '@/lib/loans/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { ALLOWED_TAGS } from '@/lib/relationships/types'

export type UpdateTagResult =
  | { ok: true }
  | { ok: false; error: 'invalid_tag' | 'not_found' | 'save_failed' }

export async function updateRelationshipTag(
  relationshipId: string,
  tag: string,
): Promise<UpdateTagResult> {
  const { user } = await guardTeskeidSession()
  await guardFeatureAccess(user.email!, 'tengsl')

  if (!(ALLOWED_TAGS as readonly string[]).includes(tag)) {
    return { ok: false, error: 'invalid_tag' }
  }

  const admin = getAdmin()

  // Verify ownership — critical security check, not trusting client-sent id alone
  const { data: rel } = await admin
    .from('relationships')
    .select('id')
    .eq('id', relationshipId)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!rel) return { ok: false, error: 'not_found' }

  try {
    // v1: single-tag model — replace all existing tags with the new one
    await admin
      .from('relationship_tags')
      .delete()
      .eq('relationship_id', relationshipId)

    const { error } = await admin
      .from('relationship_tags')
      .insert({ relationship_id: relationshipId, tag })

    if (error) return { ok: false, error: 'save_failed' }
  } catch {
    console.error('[relationships/updateTag] save failed')
    return { ok: false, error: 'save_failed' }
  }

  revalidatePath('/stillingar/tengsl')
  revalidatePath(`/stillingar/tengsl/${relationshipId}`)

  return { ok: true }
}

export type UpdateDetailsResult =
  | { ok: true }
  | { ok: false; error: 'invalid_input' | 'not_found' | 'save_failed' }

export type UpdateRelationshipDetailsInput =
  | { field: 'privateDisplayName'; value: string }
  | { field: 'note'; value: string }

export async function updateRelationshipDetails(
  relationshipId: string,
  input: UpdateRelationshipDetailsInput,
): Promise<UpdateDetailsResult> {
  const { user } = await guardTeskeidSession()
  await guardFeatureAccess(user.email!, 'tengsl')

  if (
    !input
    || typeof input.value !== 'string'
    || (input.field !== 'privateDisplayName' && input.field !== 'note')
    || (input.field === 'privateDisplayName' && input.value.length > 120)
    || (input.field === 'note' && input.value.length > 1000)
  ) return { ok: false, error: 'invalid_input' }

  const admin = getAdmin()

  // Verify ownership
  const { data: rel } = await admin
    .from('relationships')
    .select('id')
    .eq('id', relationshipId)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!rel) return { ok: false, error: 'not_found' }

  const value = input.value.trim() || null
  const update = input.field === 'privateDisplayName'
    ? { private_display_name: value }
    : { note: value }

  const { error } = await admin
    .from('relationships')
    .update(update)
    .eq('id', relationshipId)
    .eq('owner_id', user.id)

  if (error) return { ok: false, error: 'save_failed' }

  revalidatePath('/stillingar/tengsl')
  revalidatePath(`/stillingar/tengsl/${relationshipId}`)

  return { ok: true }
}
