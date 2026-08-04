import 'server-only'

import { normalizeEmailForAccess } from '@/lib/auth/email-normalization'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { getAdmin } from '@/lib/supabase/admin'

export type RelationshipSourceType = 'loans' | 'expenses'

export type RelationshipSourceCounterpart =
  | {
      mode: 'lookup-by-email'
      email: string
    }
  | {
      /**
       * Use only after the authenticated user has explicitly accepted the
       * invitation. Unlike lookup-by-email, this mode never searches auth by
       * email and therefore cannot turn an unaccepted email into an identity.
       */
      mode: 'verified-counterpart'
      userId: string
      emailCanonical?: string | null
      privateDisplayName?: string | null
    }

export type UpsertSourceRelationshipInput = {
  ownerUserId: string
  ownerEmail: string
  counterpart: RelationshipSourceCounterpart
  sourceType: RelationshipSourceType
  /** The domain-owned UUID, for example a loan or expense member ID. */
  sourceId: string
}

type RelationshipIdentity = {
  counterpartUserId: string | null
  emailCanonical: string | null
  privateDisplayName: string | null
}

type RelationshipRow = {
  id: string
  counterpart_user_id: string | null
  private_display_name: string | null
}

function normalizePrivateDisplayName(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? ''
  return normalized && normalized.length <= 120 ? normalized : null
}

async function resolveIdentity(
  admin: ReturnType<typeof getAdmin>,
  ownerUserId: string,
  counterpart: RelationshipSourceCounterpart,
): Promise<RelationshipIdentity | null> {
  if (counterpart.mode === 'verified-counterpart') {
    if (!counterpart.userId || counterpart.userId === ownerUserId) return null

    return {
      counterpartUserId: counterpart.userId,
      emailCanonical: counterpart.emailCanonical
        ? normalizeEmailForAccess(counterpart.emailCanonical)
        : null,
      privateDisplayName: normalizePrivateDisplayName(counterpart.privateDisplayName),
    }
  }

  const emailCanonical = normalizeEmailForAccess(counterpart.email)
  if (!emailCanonical) return null

  let counterpartUserId: string | null = null
  try {
    // Kept only for the Loans compatibility path. Consent-bound callers must
    // pass verified-counterpart and an identity proven by their claim RPC.
    // @ts-expect-error getUserByEmail removed from GoTrueAdminApi types in auth-js 2.x
    const { data } = await admin.auth.admin.getUserByEmail(emailCanonical)
    counterpartUserId = data?.user?.id ?? null
  } catch {
    // Auth lookup is best-effort; preserve the existing email-only behavior.
  }

  if (counterpartUserId === ownerUserId) return null

  return {
    counterpartUserId,
    emailCanonical,
    privateDisplayName: null,
  }
}

async function findByCounterpart(
  admin: ReturnType<typeof getAdmin>,
  ownerUserId: string,
  counterpartUserId: string,
): Promise<RelationshipRow | null> {
  const { data, error } = await admin
    .from('relationships')
    .select('id, counterpart_user_id, private_display_name')
    .eq('owner_id', ownerUserId)
    .eq('counterpart_user_id', counterpartUserId)
    .maybeSingle()

  if (error) throw new Error('relationship lookup failed')
  return (data as RelationshipRow | null) ?? null
}

async function findByEmail(
  admin: ReturnType<typeof getAdmin>,
  ownerUserId: string,
  emailCanonical: string,
): Promise<RelationshipRow | null> {
  const { data, error } = await admin
    .from('relationships')
    .select('id, counterpart_user_id, private_display_name')
    .eq('owner_id', ownerUserId)
    .eq('email_canonical', emailCanonical)
    .maybeSingle()

  if (error) throw new Error('relationship lookup failed')
  return (data as RelationshipRow | null) ?? null
}

async function setMissingPrivateDisplayName(
  admin: ReturnType<typeof getAdmin>,
  ownerUserId: string,
  relationship: RelationshipRow,
  privateDisplayName: string | null,
): Promise<void> {
  if (!privateDisplayName || relationship.private_display_name) return

  // The null predicate prevents a retry or concurrent owner edit from being
  // overwritten. Notes and tags are never touched by this helper.
  await admin
    .from('relationships')
    .update({ private_display_name: privateDisplayName })
    .eq('id', relationship.id)
    .eq('owner_id', ownerUserId)
    .is('private_display_name', null)
}

async function attachVerifiedCounterpart(
  admin: ReturnType<typeof getAdmin>,
  ownerUserId: string,
  relationship: RelationshipRow,
  counterpartUserId: string | null,
  emailCanonical: string,
): Promise<RelationshipRow | null> {
  if (!counterpartUserId) return relationship
  if (relationship.counterpart_user_id) {
    return relationship.counterpart_user_id === counterpartUserId ? relationship : null
  }

  const { data: enriched, error } = await admin
    .from('relationships')
    .update({ counterpart_user_id: counterpartUserId })
    .eq('id', relationship.id)
    .eq('owner_id', ownerUserId)
    .is('counterpart_user_id', null)
    .select('id, counterpart_user_id, private_display_name')
    .maybeSingle()

  if (!error && enriched) return enriched as RelationshipRow

  // A concurrent request may have created the verified user-keyed row first.
  const concurrent = await findByCounterpart(admin, ownerUserId, counterpartUserId)
  if (concurrent) return concurrent

  // Or the email row may have been linked concurrently. Never use it for a
  // different or still-unverified account.
  const refreshed = await findByEmail(admin, ownerUserId, emailCanonical)
  return refreshed?.counterpart_user_id === counterpartUserId ? refreshed : null
}

async function findOrCreateRelationship(
  admin: ReturnType<typeof getAdmin>,
  ownerUserId: string,
  identity: RelationshipIdentity,
): Promise<string | null> {
  if (identity.counterpartUserId) {
    const byCounterpart = await findByCounterpart(admin, ownerUserId, identity.counterpartUserId)
    if (byCounterpart) {
      await setMissingPrivateDisplayName(admin, ownerUserId, byCounterpart, identity.privateDisplayName)
      return byCounterpart.id
    }
  }

  let emailBelongsToDifferentCounterpart = false
  if (identity.emailCanonical) {
    const byEmail = await findByEmail(admin, ownerUserId, identity.emailCanonical)
    if (byEmail) {
      emailBelongsToDifferentCounterpart = Boolean(
        identity.counterpartUserId
        && byEmail.counterpart_user_id
        && byEmail.counterpart_user_id !== identity.counterpartUserId,
      )

      if (!emailBelongsToDifferentCounterpart) {
        const compatible = await attachVerifiedCounterpart(
          admin,
          ownerUserId,
          byEmail,
          identity.counterpartUserId,
          identity.emailCanonical,
        )
        if (!compatible) return null
        await setMissingPrivateDisplayName(
          admin, ownerUserId, compatible, identity.privateDisplayName,
        )
        return compatible.id
      }
    }
  }

  const insertPayload = {
    owner_id: ownerUserId,
    counterpart_user_id: identity.counterpartUserId,
    // Never attach a verified user to an email already owned by a different
    // relationship. The explicit user ID remains enough to identify the row.
    email_canonical: emailBelongsToDifferentCounterpart ? null : identity.emailCanonical,
    private_display_name: identity.privateDisplayName,
  }
  const { data: inserted, error } = await admin
    .from('relationships')
    .insert(insertPayload)
    .select('id')
    .single()

  if (error || !inserted) {
    // Recover from unique-index races without surfacing or logging identifiers.
    if (identity.counterpartUserId) {
      const concurrent = await findByCounterpart(admin, ownerUserId, identity.counterpartUserId)
      if (concurrent) {
        await setMissingPrivateDisplayName(
          admin, ownerUserId, concurrent, identity.privateDisplayName,
        )
        return concurrent.id
      }
    }
    if (identity.emailCanonical && !emailBelongsToDifferentCounterpart) {
      const concurrent = await findByEmail(admin, ownerUserId, identity.emailCanonical)
      if (concurrent) {
        const compatible = await attachVerifiedCounterpart(
          admin,
          ownerUserId,
          concurrent,
          identity.counterpartUserId,
          identity.emailCanonical,
        )
        if (!compatible) return null
        await setMissingPrivateDisplayName(
          admin, ownerUserId, compatible, identity.privateDisplayName,
        )
        return compatible.id
      }
    }
    return null
  }

  const relationshipId = (inserted as { id: string }).id
  // A default tag is helpful but must never prevent source attribution.
  await admin
    .from('relationship_tags')
    .insert({ relationship_id: relationshipId, tag: 'unclassified' })

  return relationshipId
}

/**
 * Best-effort relationship persistence for a domain invitation source.
 *
 * The function intentionally returns no data and never throws. Relationship
 * persistence is secondary to the accepted loan/expense mutation, and no
 * identifier or database error is written to logs.
 */
export async function upsertSourceRelationship(
  input: UpsertSourceRelationshipInput,
): Promise<void> {
  try {
    const allowed = await checkFeatureAccess(input.ownerUserId, input.ownerEmail, 'tengsl')
    if (!allowed) return

    const admin = getAdmin()
    const identity = await resolveIdentity(admin, input.ownerUserId, input.counterpart)
    if (!identity) return

    const relationshipId = await findOrCreateRelationship(admin, input.ownerUserId, identity)
    if (!relationshipId) return

    const { data: existingSource, error } = await admin
      .from('relationship_sources')
      .select('id')
      .eq('relationship_id', relationshipId)
      .eq('source_type', input.sourceType)
      .eq('source_id', input.sourceId)
      .maybeSingle()

    if (error || existingSource) return

    await admin.from('relationship_sources').insert({
      relationship_id: relationshipId,
      source_type: input.sourceType,
      source_id: input.sourceId,
    })
  } catch {
    console.error('[relationships] source upsert failed')
  }
}
