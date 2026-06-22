import 'server-only'

import { getAdmin } from '@/lib/supabase/admin'
import { checkFeatureAccess } from '@/lib/loans/guard'
import { normalizeEmailForAccess } from '@/lib/auth/email-normalization'

export type RelationshipListItem = {
  id: string
  private_display_name: string | null
  email_canonical: string | null
  created_at: string
  tags: string[]
}

export type RelationshipDetail = {
  id: string
  private_display_name: string | null
  email_canonical: string | null
  note: string | null
  created_at: string
  tags: string[]
  loan_source_ids: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// upsertLoanRelationship
// Called from createLoan and addLoanInvitation after invitation context exists.
// No-op if TENGSL_ENABLED is off or user lacks per-user access.
// Never throws — failure is logged and aðalflæðið (loan creation) continues.
// recipient_email is never logged.
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertLoanRelationship(
  ownerUserId: string,
  ownerEmail: string,
  recipientEmail: string,
  loanItemId: string,
): Promise<void> {
  const allowed = await checkFeatureAccess(ownerUserId, ownerEmail, 'tengsl')
  if (!allowed) return

  const emailCanonical = normalizeEmailForAccess(recipientEmail)
  if (!emailCanonical) return

  const admin = getAdmin()

  try {
    // Best-effort lookup: is the recipient already a registered user?
    let counterpartUserId: string | null = null
    try {
      // @ts-expect-error getUserByEmail removed from GoTrueAdminApi types in auth-js 2.x
      const { data } = await admin.auth.admin.getUserByEmail(emailCanonical)
      counterpartUserId = data?.user?.id ?? null
    } catch {
      // not found or unavailable — proceed with email only
    }

    let relationshipId: string | null = null

    if (counterpartUserId) {
      const { data: existing } = await admin
        .from('relationships')
        .select('id')
        .eq('owner_id', ownerUserId)
        .eq('counterpart_user_id', counterpartUserId)
        .maybeSingle()

      if (existing) {
        relationshipId = (existing as { id: string }).id
      } else {
        const { data: inserted } = await admin
          .from('relationships')
          .insert({ owner_id: ownerUserId, counterpart_user_id: counterpartUserId, email_canonical: emailCanonical })
          .select('id')
          .single()
        if (inserted) {
          relationshipId = (inserted as { id: string }).id
          await admin
            .from('relationship_tags')
            .insert({ relationship_id: relationshipId, tag: 'unclassified' })
        }
      }
    } else {
      const { data: existing } = await admin
        .from('relationships')
        .select('id')
        .eq('owner_id', ownerUserId)
        .eq('email_canonical', emailCanonical)
        .is('counterpart_user_id', null)
        .maybeSingle()

      if (existing) {
        relationshipId = (existing as { id: string }).id
      } else {
        const { data: inserted } = await admin
          .from('relationships')
          .insert({ owner_id: ownerUserId, email_canonical: emailCanonical })
          .select('id')
          .single()
        if (inserted) {
          relationshipId = (inserted as { id: string }).id
          await admin
            .from('relationship_tags')
            .insert({ relationship_id: relationshipId, tag: 'unclassified' })
        }
      }
    }

    if (!relationshipId) return

    // Upsert source — idempotent via UNIQUE (relationship_id, source_type, source_id)
    const { data: existingSource } = await admin
      .from('relationship_sources')
      .select('id')
      .eq('relationship_id', relationshipId)
      .eq('source_type', 'loans')
      .eq('source_id', loanItemId)
      .maybeSingle()

    if (!existingSource) {
      await admin.from('relationship_sources').insert({
        relationship_id: relationshipId,
        source_type: 'loans',
        source_id: loanItemId,
      })
    }
  } catch {
    console.error('[relationships] upsert failed')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getRelationships
// Returns all relationships for a given owner. Called from list page after
// guardTeskeidSession + guardFeatureAccess.
// ─────────────────────────────────────────────────────────────────────────────

export async function getRelationships(ownerUserId: string): Promise<RelationshipListItem[]> {
  const admin = getAdmin()

  const { data, error } = await admin
    .from('relationships')
    .select('id, private_display_name, email_canonical, created_at, relationship_tags(tag)')
    .eq('owner_id', ownerUserId)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  return (data as Array<{
    id: string
    private_display_name: string | null
    email_canonical: string | null
    created_at: string
    relationship_tags: Array<{ tag: string }>
  }>).map((r) => ({
    id: r.id,
    private_display_name: r.private_display_name,
    email_canonical: r.email_canonical,
    created_at: r.created_at,
    tags: r.relationship_tags.map((t) => t.tag),
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// getRelationship
// Returns one relationship by id, scoped to owner. Returns null if not found
// or not owned by this user. Called from detail page.
// Loan sources are returned as IDs only — the page verifies access via
// get_my_loans before rendering links.
// ─────────────────────────────────────────────────────────────────────────────

export async function getRelationship(
  ownerUserId: string,
  relationshipId: string,
): Promise<RelationshipDetail | null> {
  const admin = getAdmin()

  const { data, error } = await admin
    .from('relationships')
    .select(`
      id,
      private_display_name,
      email_canonical,
      note,
      created_at,
      relationship_tags(tag),
      relationship_sources(source_id, source_type)
    `)
    .eq('id', relationshipId)
    .eq('owner_id', ownerUserId)
    .maybeSingle()

  if (error || !data) return null

  const row = data as {
    id: string
    private_display_name: string | null
    email_canonical: string | null
    note: string | null
    created_at: string
    relationship_tags: Array<{ tag: string }>
    relationship_sources: Array<{ source_id: string; source_type: string }>
  }

  const loanSourceIds = row.relationship_sources
    .filter((s) => s.source_type === 'loans')
    .map((s) => s.source_id)

  return {
    id: row.id,
    private_display_name: row.private_display_name,
    email_canonical: row.email_canonical,
    note: row.note,
    created_at: row.created_at,
    tags: row.relationship_tags.map((t) => t.tag),
    loan_source_ids: loanSourceIds,
  }
}
