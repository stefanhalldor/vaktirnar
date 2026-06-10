import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')
import { CreateLoanSchema, EditLoanSchema, EditLoanItemDetailsSchema, AddInvitationSchema, canShowReturnControls, getLoanCardControls, loanedAtWeekday } from '../loans/types'
import type { LoanItem } from '../loans/types'

const baseCreate = {
  item_name: 'Bók',
  loaned_at: '2026-01-01',
  creator_role: 'lent' as const,
  recipient_email: 'jon@example.com',
  request_id: '00000000-0000-0000-0000-000000000001',
}

const baseEdit = {
  item_name: 'Bók',
  loaned_at: '2026-01-01',
}

// ============================================================
// CreateLoanSchema — date validation
// ============================================================

describe('CreateLoanSchema — date validation', () => {
  it('accepts a valid date (2026-02-28)', () => {
    expect(
      CreateLoanSchema.safeParse({
        ...baseCreate,
        creator_role: 'lender',
        loaned_at: '2026-02-28',
      }).success,
    ).toBe(true)
  })

  it('accepts a leap-year date (2024-02-29)', () => {
    expect(
      CreateLoanSchema.safeParse({
        ...baseCreate,
        creator_role: 'lender',
        loaned_at: '2024-02-29',
      }).success,
    ).toBe(true)
  })

  it('rejects 2026-02-29 (not a leap year)', () => {
    expect(
      CreateLoanSchema.safeParse({
        ...baseCreate,
        creator_role: 'lender',
        loaned_at: '2026-02-29',
      }).success,
    ).toBe(false)
  })

  it('rejects 2026-02-31 (day does not exist)', () => {
    expect(
      CreateLoanSchema.safeParse({
        ...baseCreate,
        creator_role: 'lender',
        loaned_at: '2026-02-31',
      }).success,
    ).toBe(false)
  })
})

// ============================================================
// CreateLoanSchema — due_at vs loaned_at
// ============================================================

describe('CreateLoanSchema — due_at vs loaned_at', () => {
  const base = { ...baseCreate, creator_role: 'lender' as const }

  it('rejects due_at before loaned_at', () => {
    expect(
      CreateLoanSchema.safeParse({ ...base, due_at: '2025-12-31' }).success,
    ).toBe(false)
  })

  it('accepts due_at same day as loaned_at', () => {
    expect(
      CreateLoanSchema.safeParse({ ...base, due_at: base.loaned_at }).success,
    ).toBe(true)
  })

  it('accepts due_at after loaned_at', () => {
    expect(
      CreateLoanSchema.safeParse({ ...base, due_at: '2026-06-01' }).success,
    ).toBe(true)
  })
})

// ============================================================
// CreateLoanSchema — required text fields
// ============================================================

describe('CreateLoanSchema — required text fields', () => {
  const base = { ...baseCreate, creator_role: 'lender' as const }

  it('rejects empty item_name', () => {
    expect(CreateLoanSchema.safeParse({ ...base, item_name: '' }).success).toBe(false)
  })

  it('rejects whitespace-only item_name', () => {
    expect(CreateLoanSchema.safeParse({ ...base, item_name: '   ' }).success).toBe(false)
  })

  it('rejects invalid recipient_email', () => {
    expect(CreateLoanSchema.safeParse({ ...base, recipient_email: 'not-an-email' }).success).toBe(
      false,
    )
  })

  it('rejects recipient_email over 320 chars', () => {
    const long = 'a'.repeat(310) + '@example.com'
    expect(CreateLoanSchema.safeParse({ ...base, recipient_email: long }).success).toBe(false)
  })

  it('normalizes recipient_email to lowercase', () => {
    const result = CreateLoanSchema.safeParse({ ...base, recipient_email: 'JON@EXAMPLE.COM' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.recipient_email).toBe('jon@example.com')
  })
})

// ============================================================
// CreateLoanSchema — creator_role
// ============================================================

describe('CreateLoanSchema — creator_role', () => {
  it('accepts lender', () => {
    expect(
      CreateLoanSchema.safeParse({ ...baseCreate, creator_role: 'lender' }).success,
    ).toBe(true)
  })

  it('accepts borrower', () => {
    expect(
      CreateLoanSchema.safeParse({ ...baseCreate, creator_role: 'borrower' }).success,
    ).toBe(true)
  })

  it('rejects invalid creator_role', () => {
    expect(
      CreateLoanSchema.safeParse({ ...baseCreate, creator_role: 'other' }).success,
    ).toBe(false)
  })
})

// ============================================================
// CreateLoanSchema — request_id
// ============================================================

describe('CreateLoanSchema — request_id', () => {
  it('accepts a valid UUID', () => {
    expect(
      CreateLoanSchema.safeParse({ ...baseCreate, creator_role: 'lender' }).success,
    ).toBe(true)
  })

  it('rejects a non-UUID string', () => {
    expect(
      CreateLoanSchema.safeParse({
        ...baseCreate,
        creator_role: 'lender',
        request_id: 'not-a-uuid',
      }).success,
    ).toBe(false)
  })
})

// ============================================================
// EditLoanSchema — date validation
// ============================================================

describe('EditLoanSchema — date validation', () => {
  it('accepts valid date', () => {
    expect(EditLoanSchema.safeParse({ ...baseEdit }).success).toBe(true)
  })

  it('rejects invalid date', () => {
    expect(EditLoanSchema.safeParse({ ...baseEdit, loaned_at: '2026-02-30' }).success).toBe(false)
  })

  it('rejects due_at before loaned_at', () => {
    expect(
      EditLoanSchema.safeParse({ ...baseEdit, due_at: '2025-12-01' }).success,
    ).toBe(false)
  })

  it('rejects empty item_name', () => {
    expect(EditLoanSchema.safeParse({ ...baseEdit, item_name: '' }).success).toBe(false)
  })
})

// ============================================================
// getLoanCardControls (lib/loans/types)
// Single source of truth for all LoanCard control-visibility
// booleans. LoanCard uses this helper directly; tests call it
// without duplicating any boolean expressions.
// ============================================================

type ControlItem = Pick<LoanItem,
  'invitation_status' | 'invitation_attempt_status' | 'can_send_invitation' | 'is_creator' | 'my_role' | 'requires_acknowledgement'
>

const BASE: ControlItem = {
  invitation_status: null,
  invitation_attempt_status: null,
  can_send_invitation: false,
  is_creator: true,
  my_role: 'lender',
  requires_acknowledgement: false,
}

describe('getLoanCardControls — expired invitation', () => {
  // get_my_loans returns effective status 'expired' for a pending invitation
  // whose expires_at has passed. can_send_invitation is also false from the RPC.
  const c = getLoanCardControls({ ...BASE, invitation_status: 'expired', can_send_invitation: false })

  it('bothPartiesJoined is false → no return/undo buttons', () => {
    expect(c.bothPartiesJoined).toBe(false)
  })

  it('showSendInvite is false → no send/resend button', () => {
    expect(c.showSendInvite).toBe(false)
  })

  it('showCancelInvite is false → no cancel button', () => {
    expect(c.showCancelInvite).toBe(false)
  })

  it('showInviteSent is false → no "invite sent" label', () => {
    expect(c.showInviteSent).toBe(false)
  })
})

describe('getLoanCardControls — accepted invitation', () => {
  const c = getLoanCardControls({ ...BASE, invitation_status: 'accepted' })

  it('bothPartiesJoined is true → return/undo buttons visible', () => {
    expect(c.bothPartiesJoined).toBe(true)
  })

  it('canEdit and canDelete are false after acceptance', () => {
    expect(c.canEdit).toBe(false)
    expect(c.canDelete).toBe(false)
  })

  it('all invite controls are hidden', () => {
    expect(c.showSendInvite).toBe(false)
    expect(c.showCancelInvite).toBe(false)
    expect(c.showInviteSent).toBe(false)
  })
})

describe('getLoanCardControls — pending invitation, can send', () => {
  const c = getLoanCardControls({ ...BASE, invitation_status: 'pending', can_send_invitation: true })

  it('showSendInvite is true', () => { expect(c.showSendInvite).toBe(true) })
  it('showCancelInvite is true', () => { expect(c.showCancelInvite).toBe(true) })
  it('bothPartiesJoined is false', () => { expect(c.bothPartiesJoined).toBe(false) })
  it('isResend is false when no prior attempt', () => { expect(c.isResend).toBe(false) })
})

describe('getLoanCardControls — pending, already sent, no resend window', () => {
  const c = getLoanCardControls({
    ...BASE,
    invitation_status: 'pending',
    invitation_attempt_status: 'sent',
    can_send_invitation: false,
  })

  it('showInviteSent is true', () => { expect(c.showInviteSent).toBe(true) })
  it('showSendInvite is false', () => { expect(c.showSendInvite).toBe(false) })
  it('isResend is true', () => { expect(c.isResend).toBe(true) })
})

describe('getLoanCardControls — non-creator', () => {
  const c = getLoanCardControls({
    ...BASE,
    is_creator: false,
    invitation_status: 'pending',
    can_send_invitation: true,
  })

  it('canEdit is false', () => { expect(c.canEdit).toBe(false) })
  it('canDelete is false', () => { expect(c.canDelete).toBe(false) })
  it('showCancelInvite is false', () => { expect(c.showCancelInvite).toBe(false) })
  it('showSendInvite reflects can_send_invitation regardless of is_creator', () => {
    // can_send_invitation from RPC already incorporates invited_by = p_actor_id
    expect(c.showSendInvite).toBe(true)
  })
})

describe('getLoanCardControls — pending recipient (requires_acknowledgement)', () => {
  const c = getLoanCardControls({
    ...BASE,
    is_creator: false,
    invitation_status: 'pending',
    invitation_attempt_status: 'sent',
    can_send_invitation: false,
    requires_acknowledgement: true,
  })

  it('canAcknowledge is true', () => { expect(c.canAcknowledge).toBe(true) })
  it('canDeclineAcknowledgement is true', () => { expect(c.canDeclineAcknowledgement).toBe(true) })
  it('canDelete is false for pending recipient', () => { expect(c.canDelete).toBe(false) })
  it('showSendInvite is false for pending recipient', () => { expect(c.showSendInvite).toBe(false) })
  it('showCancelInvite is false for pending recipient (not creator)', () => { expect(c.showCancelInvite).toBe(false) })
  it('canEditItemDetails is false for pending recipient', () => { expect(c.canEditItemDetails).toBe(false) })
  it('bothPartiesJoined is false for pending recipient', () => { expect(c.bothPartiesJoined).toBe(false) })
})

describe('getLoanCardControls — normal accepted row (requires_acknowledgement: false)', () => {
  const c = getLoanCardControls({
    ...BASE,
    invitation_status: 'accepted',
    requires_acknowledgement: false,
  })

  it('canAcknowledge is false for accepted row', () => { expect(c.canAcknowledge).toBe(false) })
  it('canDeclineAcknowledgement is false for accepted row', () => { expect(c.canDeclineAcknowledgement).toBe(false) })
  it('bothPartiesJoined is true for accepted row', () => { expect(c.bothPartiesJoined).toBe(true) })
})

// ============================================================
// canShowReturnControls (lib/loans/types)
// Tests the exported helper used by getLoanCardControls.
// ============================================================

describe('LoanCard return control visibility', () => {
  it('"accepted" → return controls visible', () => {
    expect(canShowReturnControls('accepted')).toBe(true)
  })

  it.each([
    ['pending' as const],
    ['declined' as const],
    ['cancelled' as const],
    ['expired' as const],
  ])('invitation_status "%s" → return controls hidden', (status) => {
    expect(canShowReturnControls(status)).toBe(false)
  })

  it('null → return controls hidden', () => {
    expect(canShowReturnControls(null)).toBe(false)
  })
})

// ============================================================
// Security boundary tests (integration — require live DB)
// These are documented as skipped unit tests.
// Run against a real Supabase instance with an authenticated JWT.
// ============================================================

describe.skip('Security boundary — requires live DB', () => {
  it('authenticated JWT cannot SELECT loan_items directly', () => {
    // Verify: supabase.from("loan_items").select("*") with anon/authed key → 0 rows or permission error
  })

  it('authenticated JWT cannot call get_my_loans RPC directly', () => {
    // Verify: supabase.rpc("get_my_loans", { p_actor_id: uid }) with authed key → permission denied
  })

  it('server action with AUTH_MVP_ENABLED=false returns unavailable before RPC', () => {
    // Verify: feature flag OFF stops list retrieval; no admin.rpc() call is made
  })

  it('create_loan rejects self-email recipient (RPC layer)', () => {
    // Verify: admin.rpc("create_loan", { p_actor_id: uid, p_recipient_email: same_as_actor, ... }) → exception 'recipient_unavailable'
  })

  it('crash after Resend success but before update_delivery: retry uses same attempt/key', () => {
    // Verify: reserve returns same attempt_number and same key while attempt_status = 'reserved' and < 24h
  })

  it('network uncertainty does not create N+1', () => {
    // Verify: reserve called again while attempt_status = 'reserved' returns same attempt_number
  })

  it('key_expired after 24h reserved: can_send = false, reason = key_expired', () => {
    // Verify: reserve returns key_expired when attempt_at < now() - 24h and attempt_status = 'reserved'
  })

  it('definitive failure + cooldown elapsed: new N+1 attempt is created', () => {
    // Verify: reserve after failed + 5 min cooldown increments attempt_number
  })

  it('update_delivery failed does not overwrite sent (stale_attempt)', () => {
    // Verify: update_invitation_delivery with 'failed' on an already-'sent' row returns 'stale_attempt'
  })

  it('update_delivery sent twice is idempotent', () => {
    // Verify: update_invitation_delivery with 'sent' twice returns 'ok' both times
  })

  it('Resend { error } triggers update_delivery failed', () => {
    // Verify: when Resend returns { error: { statusCode: 422 } }, update_delivery('failed') is called
  })

  it('Resend thrown exception does not call update_delivery', () => {
    // Verify: when Resend throws, update_delivery is NOT called; attempt remains 'reserved'
  })

  it('idempotencyKey is loan-invitation/${id}/${n} in second Resend argument', () => {
    // Verify: resend.emails.send is called with idempotencyKey in the options argument
  })

  it('concurrent duplicate create_loan with same request_id returns same ids', () => {
    // Verify: two concurrent calls with same (p_actor_id, p_request_id) return identical (loan_id, invitation_id)
  })

  it('same request_id after actor reaches rate limit returns existing loan (not rate_limited)', () => {
    // Verify in DB: actor has >= 10 invitations in 24h but calling create_loan with an
    // already-processed (p_actor_id, p_request_id) returns the existing loan_id+invitation_id
    // without raising rate_limited. Idempotency fast path must fire before rate limit check.
  })

  it('reserved same-key retry is not blocked by the new-attempt rate limit', () => {
    // Verify in DB: invitation has attempt_status='reserved' within 24h;
    // reserve_invitation_send returns (attempt_number, can_send=true) even when
    // the actor has >= 10 invitation rows with recent attempt_at values.
  })

  it('rate limit in create_loan counts invitation rows by this actor, not attempts', () => {
    // Verify in DB: actor with 10 invitations in 24h (each with attempt_number=3)
    // is blocked on the 11th creation. The count is on loan_invitations.created_at,
    // not on sum(attempt_number).
  })

  it('rate limit in reserve_invitation_send counts invitations with recent attempt_at', () => {
    // Verify in DB: actor with 10 loan_invitations where attempt_at > now()-24h
    // is blocked. A single invitation with attempt_number=3 counts as 1, not 3.
  })

  it('concurrent same-request_id at 9th invitation: both return same ids, no rate_limited', () => {
    // Verify in DB: actor has 9 invitations in 24h.
    // Two concurrent create_loan calls share the same request_id.
    // Advisory lock 1001 is taken BEFORE the idempotency fast path, so one
    // call wins the lock, inserts the 10th row, commits, and the second call
    // then finds the row via the fast path and returns identical (loan_id,
    // invitation_id) — neither call returns rate_limited.
  })

  it('get_my_loans returns effective status "expired" for pending invitation past expires_at', () => {
    // Verify in DB: insert a loan_invitation with status='pending' and
    // expires_at = now() - INTERVAL '1 second'. Call get_my_loans.
    // Expect returned invitation_status = 'expired' and can_send_invitation = false.
    // The row in loan_invitations still has status='pending' (no DB write).
  })

  it('expired effective status: cancel and send controls absent from returned row', () => {
    // Verify: same setup as above.
    // can_send_invitation must be false (send button absent).
    // invitation_status must be 'expired' (cancel button condition = false).
  })

  it('get_my_loans LATERAL: most recent invitation selected by (created_at DESC, id DESC)', () => {
    // Verify in DB: insert two loan_invitations for the same loan_id with
    // the same created_at timestamp. The one with the higher id must be returned.
  })
})

// ============================================================
// Static SQL regression tests — bugs fixed in sql/34
// ============================================================

describe('sql/32 get_my_loans — qualified ORDER BY (regression: 42702)', () => {
  const sql32 = readFileSync(join(ROOT, 'sql', '32_loan_functions.sql'), 'utf8')

  it('LATERAL inner table is aliased as inv_inner', () => {
    expect(sql32).toContain('FROM public.loan_invitations inv_inner')
  })

  it('ORDER BY uses inv_inner.created_at (not bare created_at)', () => {
    expect(sql32).toContain('ORDER BY inv_inner.created_at DESC, inv_inner.id DESC')
  })

  it('no bare ORDER BY created_at remains in get_my_loans', () => {
    // Extract only the get_my_loans function body (up to next comment block)
    const start = sql32.indexOf('-- 3. get_my_loans')
    const end   = sql32.indexOf('-- 4. get_my_pending_invitations')
    const body  = sql32.slice(start, end)
    expect(body).not.toContain('ORDER BY created_at')
    expect(body).not.toContain('ORDER BY id')
  })
})

describe('sql/34 corrective migration — service_role table grants (regression: 42501)', () => {
  const sql34 = readFileSync(join(ROOT, 'sql', '34_loan_permissions_and_rpc_fix.sql'), 'utf8')

  it('grants SELECT,INSERT,UPDATE,DELETE on loan_items to service_role', () => {
    expect(sql34).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_items       TO service_role')
  })

  it('grants SELECT,INSERT,UPDATE,DELETE on loan_invitations to service_role', () => {
    expect(sql34).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON public.loan_invitations TO service_role')
  })

  it('does not grant any privilege on loan_items to PUBLIC, anon, or authenticated', () => {
    // REVOKE lines are expected; no GRANT ... TO (PUBLIC|anon|authenticated) line should exist
    const grantLines = sql34
      .split('\n')
      .filter(l => /^\s*GRANT\b/.test(l))
    for (const line of grantLines) {
      expect(line).not.toMatch(/\b(PUBLIC|anon|authenticated)\b/)
    }
  })

  it('includes qualified LATERAL ORDER BY fix', () => {
    expect(sql34).toContain('ORDER BY inv_inner.created_at DESC, inv_inner.id DESC')
  })
})

// ============================================================
// Static page regression test — either RPC error shows loadFailed
// ============================================================

describe('loans/page — error handling (regression)', () => {
  const pageSrc = readFileSync(
    join(ROOT, 'app', 'auth-mvp', 'lanad-og-skilad', 'page.tsx'),
    'utf8',
  )

  it('shows loadFailed if get_my_loans returns an error', () => {
    expect(pageSrc).toContain('loansResult.error')
  })

  it('page no longer calls get_my_pending_invitations separately', () => {
    // Pending rows are included via UNION ALL in get_my_loans (sql/50)
    expect(pageSrc).not.toContain('invitationsResult.error')
    expect(pageSrc).not.toContain('get_my_pending_invitations')
  })

  it('does not expose error.message or DB details to client', () => {
    // The error branch must only render the translated key, not any raw error property
    const errorBranch = pageSrc.slice(
      pageSrc.indexOf('loansResult.error'),
      pageSrc.indexOf('</main>'),
    )
    expect(errorBranch).not.toContain('error.message')
    expect(errorBranch).not.toContain('error.code')
    expect(errorBranch).not.toContain('error.details')
  })
})

// ============================================================
// Static SQL regression tests — bugs fixed in sql/35
// ============================================================

describe('sql/32 auth.users alias — no unqualified id (regression: 42702)', () => {
  const sql32 = readFileSync(join(ROOT, 'sql', '32_loan_functions.sql'), 'utf8')

  it('no bare WHERE id = p_actor_id against auth.users remains', () => {
    expect(sql32).not.toContain('FROM auth.users WHERE id =')
  })

  it('auth.users always carries alias au in non-comment lines', () => {
    const nonCommentLines = sql32.split('\n').filter(l => !/^\s*--/.test(l))
    const unaliased = nonCommentLines.filter(l => /auth\.users(?! au)/.test(l))
    expect(unaliased).toHaveLength(0)
  })

  it('au.id used in all auth.users WHERE clauses', () => {
    expect(sql32).not.toContain('auth.users au WHERE id =')
  })
})

// ============================================================
// CreateLoanSchema — optional recipient_email (sql/36)
// ============================================================

describe('CreateLoanSchema — recipient_email is optional', () => {
  const base = { ...baseCreate, creator_role: 'lender' as const }

  it('accepts when recipient_email is omitted', () => {
    const { recipient_email: _, ...noEmail } = base
    expect(CreateLoanSchema.safeParse(noEmail).success).toBe(true)
  })

  it('accepts when recipient_email is an empty string (treated as absent)', () => {
    expect(CreateLoanSchema.safeParse({ ...base, recipient_email: '' }).success).toBe(true)
  })

  it('data.recipient_email is undefined when omitted', () => {
    const { recipient_email: _, ...noEmail } = base
    const result = CreateLoanSchema.safeParse(noEmail)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.recipient_email).toBeUndefined()
  })

  it('data.recipient_email is undefined when empty string', () => {
    const result = CreateLoanSchema.safeParse({ ...base, recipient_email: '' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.recipient_email).toBeUndefined()
  })

  it('rejects an invalid email when provided', () => {
    expect(CreateLoanSchema.safeParse({ ...base, recipient_email: 'not-an-email' }).success).toBe(false)
  })

  it('normalizes provided email to lowercase', () => {
    const result = CreateLoanSchema.safeParse({ ...base, recipient_email: 'JON@EXAMPLE.COM' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.recipient_email).toBe('jon@example.com')
  })
})

// ============================================================
// AddInvitationSchema (sql/36)
// ============================================================

describe('AddInvitationSchema', () => {
  it('accepts a valid email', () => {
    expect(AddInvitationSchema.safeParse({ recipient_email: 'user@example.com' }).success).toBe(true)
  })

  it('trims whitespace before validation', () => {
    const result = AddInvitationSchema.safeParse({ recipient_email: '  user@example.com  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.recipient_email).toBe('user@example.com')
  })

  it('normalizes to lowercase', () => {
    const result = AddInvitationSchema.safeParse({ recipient_email: 'USER@EXAMPLE.COM' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.recipient_email).toBe('user@example.com')
  })

  it('rejects missing recipient_email', () => {
    expect(AddInvitationSchema.safeParse({}).success).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(AddInvitationSchema.safeParse({ recipient_email: '' }).success).toBe(false)
  })

  it('rejects an invalid email', () => {
    expect(AddInvitationSchema.safeParse({ recipient_email: 'not-an-email' }).success).toBe(false)
  })

  it('rejects an email over 320 chars', () => {
    const long = 'a'.repeat(310) + '@example.com'
    expect(AddInvitationSchema.safeParse({ recipient_email: long }).success).toBe(false)
  })
})

// ============================================================
// getLoanCardControls — showAddParty (sql/36)
// ============================================================

describe('getLoanCardControls — showAddParty', () => {
  it('true when creator and invitation_status is null (no invitation)', () => {
    const c = getLoanCardControls({ ...BASE, is_creator: true, invitation_status: null })
    expect(c.showAddParty).toBe(true)
  })

  it('true when creator and invitation_status is cancelled', () => {
    const c = getLoanCardControls({ ...BASE, is_creator: true, invitation_status: 'cancelled' })
    expect(c.showAddParty).toBe(true)
  })

  it('true when creator and invitation_status is declined', () => {
    const c = getLoanCardControls({ ...BASE, is_creator: true, invitation_status: 'declined' })
    expect(c.showAddParty).toBe(true)
  })

  it('true when creator and invitation_status is expired', () => {
    const c = getLoanCardControls({ ...BASE, is_creator: true, invitation_status: 'expired' })
    expect(c.showAddParty).toBe(true)
  })

  it('false when invitation_status is pending', () => {
    const c = getLoanCardControls({ ...BASE, is_creator: true, invitation_status: 'pending' })
    expect(c.showAddParty).toBe(false)
  })

  it('false when invitation_status is accepted', () => {
    const c = getLoanCardControls({ ...BASE, is_creator: true, invitation_status: 'accepted' })
    expect(c.showAddParty).toBe(false)
  })

  it('false when not creator', () => {
    const c = getLoanCardControls({ ...BASE, is_creator: false, invitation_status: null })
    expect(c.showAddParty).toBe(false)
  })
})

describe('sql/35 corrective migration — auth.users grant + get_my_loans fix', () => {
  const sql35 = readFileSync(join(ROOT, 'sql', '35_loan_auth_users_and_ambiguity_fix.sql'), 'utf8')

  it('contains BEGIN and COMMIT', () => {
    expect(sql35).toMatch(/^\s*BEGIN\s*;/m)
    expect(sql35).toMatch(/^\s*COMMIT\s*;/m)
  })

  it('grants only (id, email) columns on auth.users to service_role', () => {
    expect(sql35).toContain('GRANT SELECT (id, email) ON auth.users TO service_role')
  })

  it('does not grant any privilege on auth.users to PUBLIC, anon, or authenticated', () => {
    const grantLines = sql35.split('\n').filter(l => /^\s*GRANT\b/.test(l))
    for (const line of grantLines) {
      if (line.includes('auth.users')) {
        expect(line).not.toMatch(/\b(PUBLIC|anon|authenticated)\b/)
      }
    }
  })

  it('does not contain SELECT * on auth.users (column-level grant would be insufficient)', () => {
    expect(sql35).not.toMatch(/SELECT\s+\*\s+FROM\s+auth\.users/)
  })

  it('get_my_loans uses au alias for auth.users', () => {
    expect(sql35).toContain('FROM auth.users au WHERE au.id = p_actor_id')
  })
})

// ============================================================
// Static SQL regression tests — sql/36 optional recipient
// ============================================================

describe('sql/36 — optional recipient migration', () => {
  const sql36 = readFileSync(join(ROOT, 'sql', '36_loan_optional_recipient.sql'), 'utf8')

  it('contains BEGIN and COMMIT', () => {
    expect(sql36).toMatch(/^\s*BEGIN\s*;/m)
    expect(sql36).toMatch(/^\s*COMMIT\s*;/m)
  })

  it('uses ADD COLUMN IF NOT EXISTS for item_name_snapshot', () => {
    expect(sql36).toContain('ADD COLUMN IF NOT EXISTS item_name_snapshot')
  })

  it('uses ADD COLUMN IF NOT EXISTS for creator_display_name_snapshot', () => {
    expect(sql36).toContain('ADD COLUMN IF NOT EXISTS creator_display_name_snapshot')
  })

  it('uses ADD COLUMN IF NOT EXISTS for email_template_version', () => {
    expect(sql36).toContain('ADD COLUMN IF NOT EXISTS email_template_version')
  })

  it('reserve_invitation_send sets email_template_version = \'v2\' on increment', () => {
    expect(sql36).toContain("email_template_version = 'v2'")
  })

  it('reserve_invitation_send handles unknown_version for pre-migration reserved attempts', () => {
    expect(sql36).toContain("'unknown_version'")
  })

  it('uses GET STACKED DIAGNOSTICS for constraint name in add_loan_invitation', () => {
    expect(sql36).toContain('GET STACKED DIAGNOSTICS')
    expect(sql36).toContain('CONSTRAINT_NAME')
  })

  it('only handles loan_invitations_active_idx unique violation', () => {
    expect(sql36).toContain('loan_invitations_active_idx')
  })

  it('grants add_loan_invitation to service_role', () => {
    expect(sql36).toContain('GRANT  EXECUTE ON FUNCTION public.add_loan_invitation')
    expect(sql36).toContain('TO service_role')
  })

  it('includes idempotent REVOKE/GRANT for create_loan', () => {
    const revokeIdx = sql36.indexOf('REVOKE EXECUTE ON FUNCTION public.create_loan')
    const grantIdx  = sql36.search(/GRANT\s+EXECUTE ON FUNCTION public\.create_loan/)
    expect(revokeIdx).toBeGreaterThan(-1)
    expect(grantIdx).toBeGreaterThan(revokeIdx)
  })

  it('includes idempotent REVOKE/GRANT for reserve_invitation_send', () => {
    const revokeIdx = sql36.indexOf('REVOKE EXECUTE ON FUNCTION public.reserve_invitation_send')
    const grantIdx  = sql36.search(/GRANT\s+EXECUTE ON FUNCTION public\.reserve_invitation_send/)
    expect(revokeIdx).toBeGreaterThan(-1)
    expect(grantIdx).toBeGreaterThan(revokeIdx)
  })

  it('does not grant add_loan_invitation to anon or authenticated', () => {
    const grantLines = sql36.split('\n').filter(l => /GRANT.*add_loan_invitation/.test(l))
    for (const line of grantLines) {
      expect(line).not.toMatch(/\b(anon|authenticated|PUBLIC)\b/)
    }
  })
})

// ============================================================
// Static SQL regression tests — sql/37 email template v3
// ============================================================

describe('sql/37 — email template v3 migration', () => {
  const sql37 = readFileSync(join(ROOT, 'sql', '37_loan_email_template_v3.sql'), 'utf8')

  it('contains BEGIN and COMMIT', () => {
    expect(sql37).toMatch(/^\s*BEGIN\s*;/m)
    expect(sql37).toMatch(/^\s*COMMIT\s*;/m)
  })

  it('drops the v2-only check constraint with IF EXISTS', () => {
    expect(sql37).toContain('DROP CONSTRAINT IF EXISTS loan_invitations_email_template_version_check')
  })

  it('adds new constraint allowing both v2 and v3', () => {
    expect(sql37).toContain("email_template_version IN ('v2', 'v3')")
  })

  it('constraint also allows NULL', () => {
    expect(sql37).toContain('email_template_version IS NULL OR email_template_version IN')
  })

  it('reserve_invitation_send sets email_template_version = v3 on new reservation', () => {
    expect(sql37).toContain("email_template_version = 'v3'")
  })

  it('reserve_invitation_send does NOT set email_template_version = v2 (new reservations use v3)', () => {
    // The function body should not hardcode 'v2' as the assigned value
    const fnBody = sql37.slice(sql37.indexOf('CREATE OR REPLACE FUNCTION public.reserve_invitation_send'))
    expect(fnBody).not.toContain("email_template_version = 'v2'")
  })

  it('retry path does not update email_template_version (existing v2 retries stay v2)', () => {
    // The known-version retry branch returns without an UPDATE, so there is no
    // SET email_template_version assignment there. Only the increment UPDATE path
    // assigns 'v3'. Lines starting with -- are SQL comments and are excluded.
    const assignmentLines = sql37.split('\n').filter(
      l => /^\s+email_template_version\s*=\s*'v3'/.test(l),
    )
    expect(assignmentLines).toHaveLength(1)
  })

  it('includes idempotent REVOKE/GRANT for reserve_invitation_send', () => {
    const revokeIdx = sql37.indexOf('REVOKE EXECUTE ON FUNCTION public.reserve_invitation_send')
    const grantIdx  = sql37.search(/GRANT\s+EXECUTE ON FUNCTION public\.reserve_invitation_send/)
    expect(revokeIdx).toBeGreaterThan(-1)
    expect(grantIdx).toBeGreaterThan(revokeIdx)
  })

  it('does not grant reserve_invitation_send to anon or authenticated', () => {
    const grantLines = sql37.split('\n').filter(l => /GRANT.*reserve_invitation_send/.test(l))
    for (const line of grantLines) {
      expect(line).not.toMatch(/\b(anon|authenticated|PUBLIC)\b/)
    }
  })
})

// ============================================================
// getLoanCardControls — canEditItemDetails (sql/44)
// Creator OR lender may edit item_name and note at any time.
// Pure borrower (non-creator) may not.
// ============================================================

describe('getLoanCardControls — canEditItemDetails', () => {
  it('true when creator, lender, pre-acceptance', () => {
    const c = getLoanCardControls({ ...BASE, is_creator: true, my_role: 'lender', invitation_status: null })
    expect(c.canEditItemDetails).toBe(true)
  })

  it('true when creator, borrower role, pre-acceptance', () => {
    const c = getLoanCardControls({ ...BASE, is_creator: true, my_role: 'borrower', invitation_status: null })
    expect(c.canEditItemDetails).toBe(true)
  })

  it('true when creator, accepted (even though canEdit is false)', () => {
    const c = getLoanCardControls({ ...BASE, is_creator: true, my_role: 'lender', invitation_status: 'accepted' })
    expect(c.canEditItemDetails).toBe(true)
    expect(c.canEdit).toBe(false)
  })

  it('true when non-creator lender', () => {
    const c = getLoanCardControls({ ...BASE, is_creator: false, my_role: 'lender', invitation_status: 'accepted' })
    expect(c.canEditItemDetails).toBe(true)
  })

  it('false when non-creator borrower', () => {
    const c = getLoanCardControls({ ...BASE, is_creator: false, my_role: 'borrower', invitation_status: 'accepted' })
    expect(c.canEditItemDetails).toBe(false)
  })

  it('false when non-creator borrower with pending invitation', () => {
    const c = getLoanCardControls({ ...BASE, is_creator: false, my_role: 'borrower', invitation_status: 'pending' })
    expect(c.canEditItemDetails).toBe(false)
  })
})

// ============================================================
// EditLoanItemDetailsSchema (sql/44)
// ============================================================

describe('EditLoanItemDetailsSchema', () => {
  it('accepts item_name with no note', () => {
    expect(EditLoanItemDetailsSchema.safeParse({ item_name: 'Bók' }).success).toBe(true)
  })

  it('accepts item_name and note', () => {
    expect(EditLoanItemDetailsSchema.safeParse({ item_name: 'Bók', note: 'Góð bók' }).success).toBe(true)
  })

  it('rejects empty item_name', () => {
    expect(EditLoanItemDetailsSchema.safeParse({ item_name: '' }).success).toBe(false)
  })

  it('rejects whitespace-only item_name', () => {
    expect(EditLoanItemDetailsSchema.safeParse({ item_name: '   ' }).success).toBe(false)
  })

  it('rejects item_name over 200 chars', () => {
    expect(EditLoanItemDetailsSchema.safeParse({ item_name: 'a'.repeat(201) }).success).toBe(false)
  })

  it('rejects note over 1000 chars', () => {
    expect(EditLoanItemDetailsSchema.safeParse({ item_name: 'Bók', note: 'a'.repeat(1001) }).success).toBe(false)
  })

  it('transforms empty string note to null', () => {
    const result = EditLoanItemDetailsSchema.safeParse({ item_name: 'Bók', note: '' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.note).toBeNull()
  })

  it('trims whitespace-only note to null', () => {
    const result = EditLoanItemDetailsSchema.safeParse({ item_name: 'Bók', note: '   ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.note).toBeNull()
  })
})

// ============================================================
// loanedAtWeekday
// ============================================================

describe('loanedAtWeekday', () => {
  it('2026-06-06 is Saturday (6)', () => {
    expect(loanedAtWeekday('2026-06-06')).toBe(6)
  })
})
