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
  counterpart_user_id: string | null
  counterpart_display_name: string | null
  private_display_name: string | null
  email_canonical: string | null
  note: string | null
  created_at: string
  tags: string[]
  loan_source_ids: string[]
}

export type LoanActivityItem = {
  id: string
  item_name: string
  loaned_at: string
  returned_at: string | null
  my_role: 'lender' | 'borrower'
}

export type RelationshipRecipientOption = {
  id: string
  email: string
  selfDisplayName: string | null
  privateDisplayName: string | null
  note: string | null
  tags: string[]
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
// getRelationshipDirectory
// Returns all contacts the owner has shared activity with, merging:
//   1. persisted relationships (with tags/notes/private names)
//   2. inferred counterparts from loan activity not yet persisted
// Lazily upserts relationship rows for inferred contacts so that
// /stillingar/tengsl/[id] can always navigate to a persisted row.
// Security: only infers from loan_items/loan_invitations where the owner
// is a confirmed direct participant or a pending recipient by email.
// ─────────────────────────────────────────────────────────────────────────────

export async function getRelationshipDirectory(
  ownerUserId: string,
  ownerEmail: string,
): Promise<RelationshipListItem[]> {
  const admin = getAdmin()
  const ownerEmailNorm = normalizeEmailForAccess(ownerEmail)

  // ── 1. Fetch persisted relationships ──────────────────────────────────────
  type PersistedRow = {
    id: string
    private_display_name: string | null
    email_canonical: string | null
    counterpart_user_id: string | null
    created_at: string
    relationship_tags: Array<{ tag: string }>
  }

  const { data: persistedData } = await admin
    .from('relationships')
    .select('id, private_display_name, email_canonical, counterpart_user_id, created_at, relationship_tags(tag)')
    .eq('owner_id', ownerUserId)
    .order('created_at', { ascending: false })

  const persisted = (persistedData ?? []) as PersistedRow[]

  const persistedByUserId = new Set(
    persisted.filter((r) => r.counterpart_user_id).map((r) => r.counterpart_user_id as string),
  )
  const persistedByEmail = new Set(
    persisted.filter((r) => r.email_canonical).map((r) => r.email_canonical as string),
  )

  // ── 2a. Direct loan counterparts (owner is a confirmed participant) ────────
  type DirectLoan = { id: string; lender_user_id: string; borrower_user_id: string | null }

  const { data: directLoanData } = await admin
    .from('loan_items')
    .select('id, lender_user_id, borrower_user_id')
    .or(`lender_user_id.eq.${ownerUserId},borrower_user_id.eq.${ownerUserId}`)

  const directLoans = (directLoanData ?? []) as DirectLoan[]
  const inferredUserIds = new Set<string>()
  const ownerLoanIds: string[] = []

  for (const loan of directLoans) {
    ownerLoanIds.push(loan.id)
    if (loan.lender_user_id === ownerUserId) {
      if (loan.borrower_user_id) inferredUserIds.add(loan.borrower_user_id)
    } else if (loan.borrower_user_id === ownerUserId) {
      inferredUserIds.add(loan.lender_user_id)
    }
  }
  inferredUserIds.delete(ownerUserId)

  // ── 2b. Pending invitations where owner is the lender ────────────────────
  const inferredEmails = new Set<string>()

  if (ownerLoanIds.length > 0) {
    const { data: invData } = await admin
      .from('loan_invitations')
      .select('recipient_email_normalized')
      .in('loan_id', ownerLoanIds)
    for (const inv of (invData ?? []) as Array<{ recipient_email_normalized: string }>) {
      if (inv.recipient_email_normalized) inferredEmails.add(inv.recipient_email_normalized)
    }
  }

  // ── 2c. Soft-ack reverse: owner is the email recipient, counterpart is lender
  if (ownerEmailNorm) {
    const { data: softAckData } = await admin
      .from('loan_invitations')
      .select('loan_id')
      .eq('recipient_email_normalized', ownerEmailNorm)
    const softAckLoanIds = (softAckData ?? []).map((d: { loan_id: string }) => d.loan_id)
    if (softAckLoanIds.length > 0) {
      const { data: softAckLoans } = await admin
        .from('loan_items')
        .select('lender_user_id')
        .in('id', softAckLoanIds)
      for (const loan of (softAckLoans ?? []) as Array<{ lender_user_id: string }>) {
        if (loan.lender_user_id !== ownerUserId) inferredUserIds.add(loan.lender_user_id)
      }
    }
  }

  // Remove owner's own email from inferred set
  if (ownerEmailNorm) inferredEmails.delete(ownerEmailNorm)

  // ── 3. Identify counterparts not yet persisted ────────────────────────────
  const missingUserIds = [...inferredUserIds].filter((id) => !persistedByUserId.has(id))
  const missingEmails = [...inferredEmails].filter((email) => !persistedByEmail.has(email))

  // ── 4. Lazy-upsert missing counterparts ──────────────────────────────────
  try {
    for (const cid of missingUserIds) {
      const { data: existing } = await admin
        .from('relationships')
        .select('id')
        .eq('owner_id', ownerUserId)
        .eq('counterpart_user_id', cid)
        .maybeSingle()
      if (!existing) {
        const { data: inserted } = await admin
          .from('relationships')
          .insert({ owner_id: ownerUserId, counterpart_user_id: cid })
          .select('id')
          .single()
        if (inserted) {
          await admin
            .from('relationship_tags')
            .insert({ relationship_id: (inserted as { id: string }).id, tag: 'unclassified' })
        }
      }
    }

    for (const email of missingEmails) {
      const { data: existing } = await admin
        .from('relationships')
        .select('id')
        .eq('owner_id', ownerUserId)
        .eq('email_canonical', email)
        .maybeSingle()
      if (!existing) {
        const { data: inserted } = await admin
          .from('relationships')
          .insert({ owner_id: ownerUserId, email_canonical: email })
          .select('id')
          .single()
        if (inserted) {
          await admin
            .from('relationship_tags')
            .insert({ relationship_id: (inserted as { id: string }).id, tag: 'unclassified' })
        }
      }
    }
  } catch {
    console.error('[relationships] directory lazy-upsert failed')
  }

  // ── 5. Return: re-fetch if we upserted, otherwise return cached data ──────
  if (missingUserIds.length === 0 && missingEmails.length === 0) {
    return persisted.map((r) => ({
      id: r.id,
      private_display_name: r.private_display_name,
      email_canonical: r.email_canonical,
      created_at: r.created_at,
      tags: r.relationship_tags.map((t) => t.tag),
    }))
  }

  const { data: allData } = await admin
    .from('relationships')
    .select('id, private_display_name, email_canonical, created_at, relationship_tags(tag)')
    .eq('owner_id', ownerUserId)
    .order('created_at', { ascending: false })

  return ((allData ?? []) as Array<{
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
      counterpart_user_id,
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
    counterpart_user_id: string | null
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

  // Fetch counterpart display name only when we have a confirmed user ID.
  // Avoids account enumeration for email-only relationships.
  let counterpartDisplayName: string | null = null
  if (row.counterpart_user_id) {
    const { data: profile } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', row.counterpart_user_id)
      .maybeSingle()
    counterpartDisplayName = (profile as { display_name: string | null } | null)?.display_name ?? null
  }

  return {
    id: row.id,
    counterpart_user_id: row.counterpart_user_id,
    counterpart_display_name: counterpartDisplayName,
    private_display_name: row.private_display_name,
    email_canonical: row.email_canonical,
    note: row.note,
    created_at: row.created_at,
    tags: row.relationship_tags.map((t) => t.tag),
    loan_source_ids: loanSourceIds,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getRelationshipLoanActivity
// Dynamic lookup of loans shared between owner and this relationship's
// counterpart. Uses service-role but is strictly owner-scoped: every
// loan_items row returned must have ownerUserId as lender or borrower.
//
// If counterpart_user_id is set: match by user IDs in loan_items.
// If only email_canonical is set: match via loan_invitations where the
//   owner invited this email, then verify owner is a participant.
//
// Returns loans sorted newest first, deduped by loan ID.
// ─────────────────────────────────────────────────────────────────────────────

export async function getRelationshipLoanActivity(
  ownerUserId: string,
  relationship: Pick<RelationshipDetail, 'counterpart_user_id' | 'email_canonical'>,
): Promise<LoanActivityItem[]> {
  const admin = getAdmin()

  type LoanRow = {
    id: string
    item_name: string
    loaned_at: string
    returned_at: string | null
    lender_user_id: string
  }

  let rows: LoanRow[] = []

  if (relationship.counterpart_user_id) {
    const cid = relationship.counterpart_user_id
    const { data } = await admin
      .from('loan_items')
      .select('id, item_name, loaned_at, returned_at, lender_user_id')
      .or(
        `and(lender_user_id.eq.${ownerUserId},borrower_user_id.eq.${cid}),` +
        `and(borrower_user_id.eq.${ownerUserId},lender_user_id.eq.${cid})`,
      )
      .order('loaned_at', { ascending: false })
    rows = (data as LoanRow[] | null) ?? []
  } else if (relationship.email_canonical) {
    // Step 1: find loan IDs where this email was a recipient
    const { data: invData } = await admin
      .from('loan_invitations')
      .select('loan_id')
      .eq('recipient_email_normalized', relationship.email_canonical)

    const loanIds = (invData as Array<{ loan_id: string }> | null)?.map((d) => d.loan_id) ?? []
    if (loanIds.length > 0) {
      // Step 2: filter to only loans where ownerUserId is a participant (security boundary)
      const { data } = await admin
        .from('loan_items')
        .select('id, item_name, loaned_at, returned_at, lender_user_id')
        .in('id', loanIds)
        .or(`lender_user_id.eq.${ownerUserId},borrower_user_id.eq.${ownerUserId}`)
        .order('loaned_at', { ascending: false })
      rows = (data as LoanRow[] | null) ?? []
    }
  }

  // Dedupe by loan ID (possible overlap if both user_id and email match)
  const seen = new Set<string>()
  const result: LoanActivityItem[] = []
  for (const r of rows) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    result.push({
      id: r.id,
      item_name: r.item_name,
      loaned_at: r.loaned_at,
      returned_at: r.returned_at,
      my_role: r.lender_user_id === ownerUserId ? 'lender' : 'borrower',
    })
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// getRelationshipRecipientOptions
// Returns relationships with a known email_canonical for use in the
// "add recipient" picker on the new loan form. Never exposes private notes
// or display names to the loan action — caller uses only the email field
// to populate createLoan's recipient_email.
// ─────────────────────────────────────────────────────────────────────────────

export async function getRelationshipRecipientOptions(
  ownerUserId: string,
): Promise<RelationshipRecipientOption[]> {
  const admin = getAdmin()

  const { data, error } = await admin
    .from('relationships')
    .select('id, email_canonical, counterpart_user_id, private_display_name, note, relationship_tags(tag)')
    .eq('owner_id', ownerUserId)
    .not('email_canonical', 'is', null)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  const rows = data as Array<{
    id: string
    email_canonical: string
    counterpart_user_id: string | null
    private_display_name: string | null
    note: string | null
    relationship_tags: Array<{ tag: string }>
  }>

  // Batch fetch profiles for counterpart_user_ids that are set
  const userIds = rows.map((r) => r.counterpart_user_id).filter(Boolean) as string[]
  const profileMap = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds)
    for (const p of (profiles as Array<{ id: string; display_name: string | null }> | null) ?? []) {
      if (p.display_name) profileMap.set(p.id, p.display_name)
    }
  }

  return rows.map((r) => ({
    id: r.id,
    email: r.email_canonical,
    selfDisplayName: r.counterpart_user_id ? (profileMap.get(r.counterpart_user_id) ?? null) : null,
    privateDisplayName: r.private_display_name,
    note: r.note,
    tags: r.relationship_tags.map((t) => t.tag),
  }))
}
