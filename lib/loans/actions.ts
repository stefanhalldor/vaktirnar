'use server'

import { revalidatePath } from 'next/cache'
import { guardLoanAccess } from '@/lib/loans/guard'
import { getAdmin } from '@/lib/supabase/admin'
import { CreateLoanSchema, EditLoanSchema, AddInvitationSchema, EditLoanItemDetailsSchema } from '@/lib/loans/types'
import { sendLoanInvitationEmail, type EmailContext } from '@/lib/loans/email'
import { recordRecentEvent, ackRecentEventByKey } from '@/lib/recent-events/helpers.server'
import { computeLoanChanges } from '@/lib/loans/event-diff'
import { upsertLoanRelationship } from '@/lib/relationships/actions'

const LOANS_PATH = '/auth-mvp/lanad-og-skilad'
const HOME_PATH = '/auth-mvp/heim'

function revalidateLoanViews(): void {
  revalidatePath(LOANS_PATH)
  revalidatePath(HOME_PATH)
}

async function lookupUserIdByEmail(
  admin: ReturnType<typeof getAdmin>,
  email: string,
): Promise<string | null> {
  try {
    // @ts-expect-error getUserByEmail removed from GoTrueAdminApi types in auth-js 2.x;
    // this is best-effort — the catch returns null if the runtime call fails.
    const { data, error } = await admin.auth.admin.getUserByEmail(email)
    if (error || !data?.user?.id) return null
    return data.user.id
  } catch {
    return null
  }
}

// Returns all user IDs whose email canonical-matches p_email (via SQL57).
// Best-effort: returns [] on any error, never throws, never logs email or IDs.
async function getUserIdsByCanonicalEmail(
  admin: ReturnType<typeof getAdmin>,
  email: string,
): Promise<string[]> {
  try {
    const { data, error } = await admin.rpc('get_user_ids_by_canonical_email', { p_email: email })
    if (error || !data) {
      console.error('[loans/updateLoan] canonical recipient lookup failed')
      return []
    }
    return ((data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id).filter(Boolean)
  } catch {
    console.error('[loans/updateLoan] canonical recipient lookup failed')
    return []
  }
}

interface LoanEventContext {
  itemName:       string | null
  lenderUserId:   string | null
  borrowerUserId: string | null
}

async function fetchLoanEventContext(
  admin: ReturnType<typeof getAdmin>,
  loanId: string,
): Promise<LoanEventContext> {
  try {
    const { data } = await admin
      .from('loan_items')
      .select('item_name, lender_user_id, borrower_user_id')
      .eq('id', loanId)
      .maybeSingle()
    if (!data) return { itemName: null, lenderUserId: null, borrowerUserId: null }
    const row = data as { item_name: string; lender_user_id: string | null; borrower_user_id: string | null }
    return { itemName: row.item_name, lenderUserId: row.lender_user_id, borrowerUserId: row.borrower_user_id }
  } catch {
    return { itemName: null, lenderUserId: null, borrowerUserId: null }
  }
}

interface InvitationContext {
  itemName:      string | null
  loanId:        string | null
  creatorUserId: string | null
}

async function fetchInvitationContext(
  admin: ReturnType<typeof getAdmin>,
  invitationId: string,
): Promise<InvitationContext> {
  try {
    const { data: inv } = await admin
      .from('loan_invitations')
      .select('invited_by, loan_id')
      .eq('id', invitationId)
      .maybeSingle()
    if (!inv) return { itemName: null, loanId: null, creatorUserId: null }
    const row = inv as { invited_by: string | null; loan_id: string }
    const { data: item } = await admin
      .from('loan_items')
      .select('item_name')
      .eq('id', row.loan_id)
      .maybeSingle()
    return {
      itemName:      (item as { item_name: string } | null)?.item_name ?? null,
      loanId:        row.loan_id,
      creatorUserId: row.invited_by ?? null,
    }
  } catch {
    return { itemName: null, loanId: null, creatorUserId: null }
  }
}

export type ActionResult =
  | { ok: true; emailStatus?: 'sent' | 'failed' | 'uncertain' }
  | { ok: false; error: string }

// ============================================================
// performInvitationSend
// Non-exported server-only helper. Called from createLoan and
// sendInvitationEmail. recipient_email is never logged or
// returned to the client.
// ============================================================

async function performInvitationSend(
  userId: string,
  invitationId: string,
): Promise<{ emailStatus: 'sent' | 'failed' | 'uncertain' }> {
  const admin = getAdmin()

  // ------------------------------------------------------------------
  // PREFLIGHT — fetch immutable context BEFORE any DB mutation.
  //
  // This query runs BEFORE reserve_invitation_send. If the sql/36
  // columns are missing (pre-migration schema), the SELECT fails here
  // and we return uncertain without ever creating a reserved attempt.
  // A reserved attempt with email_template_version = NULL would become
  // permanently stuck as unknown_version once sql/36 is deployed,
  // requiring the creator to cancel and recreate the invitation.
  //
  // Safe rollout order: deploy this app version BEFORE running sql/36.
  //   - Pre-sql/36: preflight SELECT fails (column missing) → uncertain
  //     → reserve_invitation_send is never called → zero DB mutations.
  //   - Post-sql/36: preflight succeeds; new reserves get 'v2';
  //     version is confirmed after reserve (see below).
  //
  // See sql/36 header comment for the full deployment procedure.
  // ------------------------------------------------------------------
  type PreflightRow = {
    recipient_role: string
    item_name_snapshot: string | null
    creator_display_name_snapshot: string | null
    email_template_version: string | null
  }
  let preflight: PreflightRow

  try {
    const { data: pfData, error: pfError } = await admin
      .from('loan_invitations')
      .select('recipient_role, item_name_snapshot, creator_display_name_snapshot, email_template_version')
      .eq('id', invitationId)
      .single()

    if (pfError) {
      console.error('[loans/email] invitation preflight failed')
      return { emailStatus: 'uncertain' }
    }
    preflight = pfData as PreflightRow
  } catch {
    // Column missing (pre-sql/36 schema) or network failure — no DB mutation has occurred
    return { emailStatus: 'uncertain' }
  }

  // ------------------------------------------------------------------
  // RESERVE — the first DB mutation in this function
  // ------------------------------------------------------------------
  const { data: reserveData, error: reserveError } = await admin.rpc(
    'reserve_invitation_send',
    { p_actor_id: userId, p_invitation_id: invitationId },
  )

  if (reserveError) {
    console.error('[loans] reserve_invitation_send failed')
    return { emailStatus: 'uncertain' }
  }

  const row = (reserveData as Array<{
    attempt_number: number
    can_send: boolean
    reason: string
    recipient_email: string
  }>)[0]

  if (!row?.can_send) {
    // already_sent: Resend previously confirmed delivery — treat as success
    if (row?.reason === 'already_sent') return { emailStatus: 'sent' }
    // All other blocking reasons (expired, cooldown, max_sends, rate_limited,
    // unknown_version, etc.)
    return { emailStatus: 'uncertain' }
  }

  const { attempt_number, recipient_email } = row

  // Best-effort: emit loan_invitation_received for recipient if registered.
  // recipient_email is never logged.
  const recipientUserId = await lookupUserIdByEmail(admin, recipient_email)
  if (recipientUserId) {
    await recordRecentEvent({
      userId:           recipientUserId,
      source:           'loans',
      eventType:        'loan_invitation_received',
      entityType:       'invitation',
      entityId:         invitationId,
      eventKey:         `loans:invitation:${invitationId}:received`,
      payload:          preflight.item_name_snapshot ? { itemName: preflight.item_name_snapshot } : {},
      href:             LOANS_PATH,
      updateOnConflict: false,
    })
  }

  // ------------------------------------------------------------------
  // POST-RESERVE VERSION READ
  // Re-read email_template_version to reflect the value committed to DB
  // for this specific attempt:
  //   - Fresh reservation (post-sql/37): SQL sets it to 'v3'.
  //   - Fresh reservation (post-sql/36, pre-sql/37): SQL sets it to 'v2'.
  //   - Retry of existing reserved: version is unchanged from the original
  //     reservation (v2 retries stay v2; v3 retries stay v3).
  // recipient_role and snapshots are immutable and come from preflight.
  // ------------------------------------------------------------------
  let version: string | null
  try {
    const { data: vData, error: vError } = await admin
      .from('loan_invitations')
      .select('email_template_version')
      .eq('id', invitationId)
      .single()

    if (vError) {
      console.error('[loans/email] version post-reserve read failed')
      return { emailStatus: 'uncertain' }
    }
    version = (vData as { email_template_version: string | null }).email_template_version
  } catch {
    return { emailStatus: 'uncertain' }
  }

  if (version !== 'v2' && version !== 'v3') {
    // Defense in depth: never send with an unrecognized version — would
    // corrupt the idempotency key for this attempt.
    console.error('[loans/email] unexpected email_template_version after reserve')
    return { emailStatus: 'uncertain' }
  }

  const emailContext: EmailContext = {
    recipientRole: preflight.recipient_role as 'lender' | 'borrower',
    templateVersion: version as 'v2' | 'v3',
    itemName: preflight.item_name_snapshot,
    creatorDisplayName: preflight.creator_display_name_snapshot,
  }

  // Send email — never log recipient_email
  const sendResult = await sendLoanInvitationEmail(
    recipient_email,
    invitationId,
    attempt_number,
    emailContext,
  )

  if (sendResult === 'uncertain') {
    // Attempt stays reserved; caller can retry with same idempotency key
    return { emailStatus: 'uncertain' }
  }

  // Update delivery state: 'sent' or 'failed'
  const { data: updateData, error: updateError } = await admin.rpc(
    'update_invitation_delivery',
    {
      p_actor_id:       userId,
      p_invitation_id:  invitationId,
      p_attempt_number: attempt_number,
      p_status:         sendResult,
    },
  )

  if (updateError) {
    // Resend may have confirmed 'sent' but we could not record it — uncertain
    console.error('[loans] update_invitation_delivery failed')
    return { emailStatus: 'uncertain' }
  }

  const updateResult = updateData as string
  if (updateResult !== 'ok') {
    // stale_attempt, not_found, or unknown: cannot confirm delivery state
    return { emailStatus: 'uncertain' }
  }

  return { emailStatus: sendResult }
}

// ============================================================
// createLoan
// ============================================================

export async function createLoan(input: unknown): Promise<ActionResult> {
  const { user } = await guardLoanAccess()

  const parsed = CreateLoanSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }

  const { item_name, note, loaned_at, due_at, creator_role, recipient_email, request_id } =
    parsed.data

  const admin = getAdmin()
  const { data, error } = await admin.rpc('create_loan', {
    p_actor_id:        user.id,
    p_item_name:       item_name,
    p_note:            note ?? null,
    p_loaned_at:       loaned_at,
    p_due_at:          due_at ?? null,
    p_creator_role:    creator_role,
    p_recipient_email: recipient_email ?? null,
    p_request_id:      request_id,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('recipient_unavailable')) return { ok: false, error: 'recipient_unavailable' }
    if (msg.includes('invalid_role'))          return { ok: false, error: 'invalid_input' }
    if (msg.includes('invalid_item_name'))     return { ok: false, error: 'invalid_input' }
    if (msg.includes('rate_limited'))          return { ok: false, error: 'rate_limited' }
    console.error('[loans/createLoan] RPC failed')
    return { ok: false, error: 'save_failed' }
  }

  // Auto-send invitation email immediately after creation
  const row = (data as Array<{ loan_id: string; invitation_id: string | null }>)[0]
  const invitationId = row?.invitation_id

  let emailStatus: 'sent' | 'failed' | 'uncertain' | undefined
  if (invitationId) {
    const sendResult = await performInvitationSend(user.id, invitationId)
    emailStatus = sendResult.emailStatus
    // Best-effort: save relationship. Never fails the loan creation.
    if (recipient_email) {
      await upsertLoanRelationship(user.id, user.email!, recipient_email, row.loan_id)
    }
  }

  await recordRecentEvent({
    userId:           user.id,
    source:           'loans',
    eventType:        'loan_created',
    entityType:       'loan',
    entityId:         row.loan_id,
    eventKey:         `loans:loan:${row.loan_id}:created`,
    payload:          { itemName: item_name },
    href:             '/auth-mvp/lanad-og-skilad',
    updateOnConflict: false,
    initiallyRead:    true,
  })

  revalidateLoanViews()
  return { ok: true, emailStatus }
}

// ============================================================
// updateLoan
// ============================================================

export async function updateLoan(loanId: string, input: unknown): Promise<ActionResult> {
  const { user } = await guardLoanAccess()

  const parsed = EditLoanSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }

  const { item_name, note, loaned_at, due_at } = parsed.data

  const admin = getAdmin()
  const { data, error } = await admin.rpc('update_loan_with_diff', {
    p_actor_id:  user.id,
    p_loan_id:   loanId,
    p_item_name: item_name,
    p_note:      note ?? null,
    p_loaned_at: loaned_at,
    p_due_at:    due_at ?? null,
  })

  if (error) {
    console.error('[loans/updateLoan] RPC failed')
    return { ok: false, error: 'save_failed' }
  }

  const row = (data as Array<{
    status: string
    before_item_name: string | null
    before_note: string | null
    before_loaned_at: string | null
    before_due_at: string | null
  }>)?.[0]
  const status = row?.status ?? 'save_failed'
  if (status === 'not_found')        return { ok: false, error: 'not_found' }
  if (status === 'not_editable')     return { ok: false, error: 'not_editable' }
  if (status === 'invalid_item_name' || status === 'invalid_due_date') {
    return { ok: false, error: 'invalid_input' }
  }
  if (status !== 'ok') return { ok: false, error: 'save_failed' }

  const changes = computeLoanChanges(
    { item_name: row.before_item_name, note: row.before_note, loaned_at: row.before_loaned_at, due_at: row.before_due_at },
    { item_name: item_name, note: note ?? null, loaned_at: loaned_at, due_at: due_at ?? null },
  )
  if (changes.length > 0) {
    const eventKey = `loans:loan:${loanId}:updated:${new Date().toISOString()}`
    await recordRecentEvent({
      userId:        user.id,
      source:        'loans',
      eventType:     'loan_updated',
      entityType:    'loan',
      entityId:      loanId,
      eventKey,
      payload:       { itemName: item_name, changes },
      href:          '/auth-mvp/lanad-og-skilad',
      initiallyRead: true,
    })

    // Best-effort: notify pending recipient(s) via canonical email match (#37)
    try {
      const { data: invData, error: invError } = await admin
        .from('loan_invitations')
        .select('recipient_email_normalized')
        .eq('loan_id', loanId)
        .eq('status', 'pending')
        .maybeSingle()

      if (!invError && invData) {
        const inv = invData as { recipient_email_normalized: string }
        const recipientIds = await getUserIdsByCanonicalEmail(admin, inv.recipient_email_normalized)
        for (const recipientId of recipientIds) {
          if (recipientId === user.id) continue
          await recordRecentEvent({
            userId:     recipientId,
            source:     'loans',
            eventType:  'loan_updated',
            entityType: 'loan',
            entityId:   loanId,
            eventKey,
            payload:    { itemName: item_name, changes },
            href:       '/auth-mvp/lanad-og-skilad',
          })
        }
      }
    } catch {
      console.error('[loans/updateLoan] pending recipient notification failed')
    }
  }

  revalidateLoanViews()
  return { ok: true }
}

// ============================================================
// markReturned
// ============================================================

export async function markReturned(loanId: string): Promise<ActionResult> {
  const { user } = await guardLoanAccess()

  const admin = getAdmin()
  const { data, error } = await admin.rpc('mark_returned', {
    p_actor_id: user.id,
    p_loan_id:  loanId,
  })

  if (error) {
    console.error('[loans/markReturned] RPC failed')
    return { ok: false, error: 'save_failed' }
  }

  const result = data as string
  if (result === 'not_found')             return { ok: false, error: 'not_found' }
  if (result === 'invitation_not_accepted') return { ok: false, error: 'invitation_not_accepted' }
  if (result !== 'ok' && result !== 'already_returned') return { ok: false, error: 'save_failed' }

  if (result === 'ok') {
    const { itemName, lenderUserId, borrowerUserId } = await fetchLoanEventContext(admin, loanId)
    const eventKey = `loans:loan:${loanId}:returned:${new Date().toISOString()}`
    const payload  = itemName ? { itemName } : {}
    await recordRecentEvent({
      userId: user.id, source: 'loans', eventType: 'loan_returned',
      entityType: 'loan', entityId: loanId, eventKey, payload,
      href: '/auth-mvp/lanad-og-skilad', initiallyRead: true,
    })
    const counterpartUserId = user.id === lenderUserId
      ? borrowerUserId
      : user.id === borrowerUserId ? lenderUserId : null
    if (counterpartUserId) {
      await recordRecentEvent({
        userId: counterpartUserId, source: 'loans', eventType: 'loan_returned',
        entityType: 'loan', entityId: loanId, eventKey, payload,
        href: '/auth-mvp/lanad-og-skilad',
      })
    }
  }

  revalidateLoanViews()
  return { ok: true }
}

// ============================================================
// undoReturn
// ============================================================

export async function undoReturn(loanId: string): Promise<ActionResult> {
  const { user } = await guardLoanAccess()

  const admin = getAdmin()
  const { data, error } = await admin.rpc('undo_return', {
    p_actor_id: user.id,
    p_loan_id:  loanId,
  })

  if (error) {
    console.error('[loans/undoReturn] RPC failed')
    return { ok: false, error: 'save_failed' }
  }

  const result = data as string
  if (result === 'not_found')             return { ok: false, error: 'not_found' }
  if (result === 'invitation_not_accepted') return { ok: false, error: 'invitation_not_accepted' }
  if (result !== 'ok') return { ok: false, error: 'save_failed' }

  const { itemName, lenderUserId, borrowerUserId } = await fetchLoanEventContext(admin, loanId)
  const eventKey = `loans:loan:${loanId}:return-undone:${new Date().toISOString()}`
  const payload  = itemName ? { itemName } : {}
  await recordRecentEvent({
    userId: user.id, source: 'loans', eventType: 'loan_return_undone',
    entityType: 'loan', entityId: loanId, eventKey, payload,
    href: '/auth-mvp/lanad-og-skilad', initiallyRead: true,
  })
  const counterpartUserId = user.id === lenderUserId
    ? borrowerUserId
    : user.id === borrowerUserId ? lenderUserId : null
  if (counterpartUserId) {
    await recordRecentEvent({
      userId: counterpartUserId, source: 'loans', eventType: 'loan_return_undone',
      entityType: 'loan', entityId: loanId, eventKey, payload,
      href: '/auth-mvp/lanad-og-skilad',
    })
  }

  revalidateLoanViews()
  return { ok: true }
}

// ============================================================
// deleteLoan
// ============================================================

export async function deleteLoan(loanId: string): Promise<ActionResult> {
  const { user } = await guardLoanAccess()

  const admin = getAdmin()
  // Capture item name before deletion — the row will be gone after the RPC
  const { itemName: itemNameSnapshot } = await fetchLoanEventContext(admin, loanId)

  const { data, error } = await admin.rpc('delete_loan', {
    p_actor_id: user.id,
    p_loan_id:  loanId,
  })

  if (error) {
    console.error('[loans/deleteLoan] RPC failed')
    return { ok: false, error: 'delete_failed' }
  }

  const result = data as string
  if (result === 'not_found')    return { ok: false, error: 'not_found' }
  if (result === 'not_deletable') return { ok: false, error: 'delete_failed' }
  if (result !== 'ok')           return { ok: false, error: 'delete_failed' }

  await recordRecentEvent({
    userId:           user.id,
    source:           'loans',
    eventType:        'loan_deleted',
    entityType:       'loan',
    entityId:         loanId,
    eventKey:         `loans:loan:${loanId}:deleted`,
    payload:          itemNameSnapshot ? { itemName: itemNameSnapshot } : {},
    href:             '/auth-mvp/lanad-og-skilad',
    updateOnConflict: false,
    initiallyRead:    true,
  })

  revalidateLoanViews()
  return { ok: true }
}

// ============================================================
// addLoanInvitation
// Adds a recipient to a loan that was created without one.
// ============================================================

export async function addLoanInvitation(loanId: string, input: unknown): Promise<ActionResult> {
  const { user } = await guardLoanAccess()

  const parsed = AddInvitationSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }

  const { recipient_email } = parsed.data

  const admin = getAdmin()
  const { data, error } = await admin.rpc('add_loan_invitation', {
    p_actor_id:        user.id,
    p_loan_id:         loanId,
    p_recipient_email: recipient_email,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('recipient_unavailable'))  return { ok: false, error: 'recipient_unavailable' }
    if (msg.includes('rate_limited'))           return { ok: false, error: 'rate_limited' }
    if (msg.includes('not_found'))              return { ok: false, error: 'not_found' }
    if (msg.includes('already_has_party'))      return { ok: false, error: 'already_has_party' }
    if (msg.includes('already_has_invitation')) return { ok: false, error: 'already_has_invitation' }
    console.error('[loans/addLoanInvitation] RPC failed')
    return { ok: false, error: 'save_failed' }
  }

  const row = (data as Array<{ invitation_id: string | null }>)[0]
  if (!row) return { ok: false, error: 'save_failed' }

  let emailStatus: 'sent' | 'failed' | 'uncertain' | undefined
  if (row.invitation_id) {
    const sendResult = await performInvitationSend(user.id, row.invitation_id)
    emailStatus = sendResult.emailStatus
    // Best-effort: save relationship. Never fails the invitation flow.
    await upsertLoanRelationship(user.id, user.email!, recipient_email, loanId)
  }

  revalidateLoanViews()
  return { ok: true, emailStatus }
}

// ============================================================
// sendInvitationEmail
// Delegates to performInvitationSend. recipient_email is never
// logged or returned to the client.
// ============================================================

export async function sendInvitationEmail(invitationId: string): Promise<ActionResult> {
  const { user } = await guardLoanAccess()

  const { emailStatus } = await performInvitationSend(user.id, invitationId)

  if (emailStatus === 'uncertain') return { ok: false, error: 'send_uncertain' }
  if (emailStatus === 'failed')    return { ok: false, error: 'send_failed' }

  revalidateLoanViews()
  return { ok: true, emailStatus }
}

// ============================================================
// claimInvitation
// ============================================================

export async function claimInvitation(invitationId: string): Promise<ActionResult> {
  const { user } = await guardLoanAccess()

  const admin = getAdmin()
  const { data, error } = await admin.rpc('claim_loan_invitation', {
    p_actor_id:      user.id,
    p_invitation_id: invitationId,
  })

  if (error) {
    console.error('[loans/claimInvitation] RPC failed')
    return { ok: false, error: 'claim_failed' }
  }

  const result = data as string
  if (result === 'ok') {
    await ackRecentEventByKey(user.id, `loans:invitation:${invitationId}:received`)
    const { itemName, loanId, creatorUserId } = await fetchInvitationContext(admin, invitationId)
    if (creatorUserId && creatorUserId !== user.id) {
      await recordRecentEvent({
        userId: creatorUserId, source: 'loans', eventType: 'loan_invitation_accepted',
        entityType: 'loan', entityId: loanId,
        eventKey: `loans:invitation:${invitationId}:accepted`,
        payload: itemName ? { itemName } : {},
        href: '/auth-mvp/lanad-og-skilad',
      })
    }
    revalidateLoanViews()
    return { ok: true }
  }
  return { ok: false, error: result }
}

// ============================================================
// declineInvitation
// ============================================================

export async function declineInvitation(invitationId: string): Promise<ActionResult> {
  const { user } = await guardLoanAccess()

  const admin = getAdmin()
  const { data, error } = await admin.rpc('decline_invitation', {
    p_actor_id:      user.id,
    p_invitation_id: invitationId,
  })

  if (error) {
    console.error('[loans/declineInvitation] RPC failed')
    return { ok: false, error: 'save_failed' }
  }

  const result = data as string
  if (result === 'not_found') return { ok: false, error: 'not_found' }
  if (result !== 'ok')        return { ok: false, error: 'save_failed' }

  await ackRecentEventByKey(user.id, `loans:invitation:${invitationId}:received`)
  const { itemName, loanId, creatorUserId } = await fetchInvitationContext(admin, invitationId)
  if (creatorUserId && creatorUserId !== user.id) {
    await recordRecentEvent({
      userId: creatorUserId, source: 'loans', eventType: 'loan_invitation_declined',
      entityType: 'loan', entityId: loanId,
      eventKey: `loans:invitation:${invitationId}:declined`,
      payload: itemName ? { itemName } : {},
      href: '/auth-mvp/lanad-og-skilad',
    })
  }
  revalidateLoanViews()
  return { ok: true }
}

// ============================================================
// updateLoanItemDetails
// Narrow edit: item_name + note only.
// Allowed for: created_by OR lender_user_id.
// ============================================================

export async function updateLoanItemDetails(loanId: string, input: unknown): Promise<ActionResult> {
  const { user } = await guardLoanAccess()

  const parsed = EditLoanItemDetailsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid_input' }

  const { item_name, note } = parsed.data

  const admin = getAdmin()
  const { data, error } = await admin.rpc('update_loan_item_details_with_diff', {
    p_actor_id:  user.id,
    p_loan_id:   loanId,
    p_item_name: item_name,
    p_note:      note ?? null,
  })

  if (error) {
    console.error('[loans/updateLoanItemDetails] RPC failed')
    return { ok: false, error: 'save_failed' }
  }

  const row = (data as Array<{
    status: string
    before_item_name: string | null
    before_note: string | null
    counterpart_user_id: string | null
  }>)?.[0]
  const status = row?.status ?? 'save_failed'
  if (status === 'not_found') return { ok: false, error: 'not_found' }
  if (status === 'invalid_item_name' || status === 'invalid_note') {
    return { ok: false, error: 'invalid_input' }
  }
  if (status !== 'ok') return { ok: false, error: 'save_failed' }

  // Normalize to match DB storage (trim + NULLIF) for accurate diff
  const normalizedItemName = item_name.trim()
  const normalizedNote = note?.trim() || null
  const changes = computeLoanChanges(
    { item_name: row.before_item_name, note: row.before_note },
    { item_name: normalizedItemName, note: normalizedNote },
  )
  if (changes.length > 0) {
    const eventKey = `loans:loan:${loanId}:updated:${new Date().toISOString()}`
    await recordRecentEvent({
      userId:        user.id,
      source:        'loans',
      eventType:     'loan_updated',
      entityType:    'loan',
      entityId:      loanId,
      eventKey,
      payload:       { itemName: normalizedItemName, changes },
      href:          '/auth-mvp/lanad-og-skilad',
      initiallyRead: true,
    })
    if (row.counterpart_user_id && row.counterpart_user_id !== user.id) {
      await recordRecentEvent({
        userId:     row.counterpart_user_id,
        source:     'loans',
        eventType:  'loan_updated',
        entityType: 'loan',
        entityId:   loanId,
        eventKey,
        payload:    { itemName: normalizedItemName, changes },
        href:       '/auth-mvp/lanad-og-skilad',
      })
    }
  }

  revalidateLoanViews()
  return { ok: true }
}

// ============================================================
// cancelInvitation
// ============================================================

export async function cancelInvitation(loanId: string): Promise<ActionResult> {
  const { user } = await guardLoanAccess()

  const admin = getAdmin()
  const { data, error } = await admin.rpc('cancel_invitation', {
    p_actor_id: user.id,
    p_loan_id:  loanId,
  })

  if (error) {
    console.error('[loans/cancelInvitation] RPC failed')
    return { ok: false, error: 'save_failed' }
  }

  const result = data as string
  if (result === 'not_found') return { ok: false, error: 'not_found' }
  if (result !== 'ok')        return { ok: false, error: 'save_failed' }

  revalidateLoanViews()
  return { ok: true }
}
